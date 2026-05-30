import { Hono } from "hono";
import { z } from "zod";
import type { Env, Variables, AppEnv } from "../types/index.js";
import { success } from "../types/index.js";
import { attachTokenBudget, requireTokenBudget } from "../middleware/tierEnforcement.js";
import { persistResumeScoresIfReferenced } from "../services/resume/persist-scores.js";
import { resolveResumeContent } from "../services/resume/resolve-resume-content.js";
import {
  analyzeResume,
  analysisToScores,
} from "../services/resume/analyze.js";
import {
  ConsolidateHighlightsRequestSchema,
  ConsolidateHighlightsResponseSchema,
  RewriteXyzHighlightsRequestSchema,
  RewriteXyzTextRequestSchema,
  RewriteXyzTextResponseSchema,
  ShortenBulletRequestSchema,
  ShortenBulletResponseSchema,
  type ResumeAnalysis,
} from "../../../shared/tool-schemas.js";
import { createLLMClient, hasAnyLLMProviderKey } from "../services/adapters/llm-client.js";
import {
  rewriteHighlightsAsXyz,
  rewriteSkillsAsAts,
  rewriteTextAsXyz,
} from "../services/resume/rewrite-xyz.js";
import { getPrompt } from "../../../shared/ai-prompts/index.js";

export const resumeOptimizerRoutes = new Hono<AppEnv>();
resumeOptimizerRoutes.use("*", attachTokenBudget());

/**
 * Shape the response for the Optimizer surface. Strips the Scorer-only
 * `strengths` / `weaknesses` summary since the Optimizer page already
 * leads with `optimizedContent` and per-recommendation Action buttons —
 * surfacing high-level prose summaries on top would be redundant.
 * Frontend self-gates on which fields are present.
 */
export function shapeOptimizerPayload(full: ResumeAnalysis): Omit<ResumeAnalysis, "strengths" | "weaknesses"> {
  const { strengths: _s, weaknesses: _w, ...rest } = full;
  return rest;
}

// ---------------------------------------------------------------------------
// POST /api/resumeoptimizer/optimize
// Thin proxy over the shared analyzeResume engine. Same prompt, same
// schema, same fallback as /api/resumescorer/score — different surface
// for SEO and for tool-run history. See services/resume/analyze.ts.
// ---------------------------------------------------------------------------
resumeOptimizerRoutes.post("/optimize", requireTokenBudget(), async (c) => {
  const body = await c.req.json().catch(() => null);
  const { resumeText } = await resolveResumeContent(c, body);
  const jobDescription =
    typeof body === "object" && body !== null && typeof (body as any).jobDescription === "string"
      ? ((body as any).jobDescription as string)
      : "";

  const full = await analyzeResume({
    c,
    featureKey: "resume_optimizer",
    resumeText,
    jobDescription,
  });

  await persistResumeScoresIfReferenced(body, c.var.user, analysisToScores(full));

  return c.json(success(shapeOptimizerPayload(full)), 200);
});

/**
 * Consolidate one section's bullet list — used by the AI wand next to
 * "Add Achievement" / "Add Highlight" in the resume editor and by the
 * `consolidate_section_highlights` registry tool that the AI Brain
 * calls. Takes the raw highlights for a single Work / Volunteer /
 * Project entry plus optional context (role, organization, summary)
 * and returns a tighter, deduped, action-verb-first rewrite.
 *
 * Scoped per-item (not whole-resume) so the round-trip stays under a
 * second on free models, and so accepting the rewrite never touches
 * unrelated sections of the user's resume.
 */
const CONSOLIDATE_HIGHLIGHTS_SYSTEM_PROMPT = getPrompt("resume-editor-consolidate").render({});

resumeOptimizerRoutes.post("/consolidate-highlights", requireTokenBudget(), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = ConsolidateHighlightsRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        success: false as const,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid consolidate-highlights request",
          details: parsed.error.flatten(),
        },
        timestamp: new Date().toISOString(),
      },
      400,
    );
  }

  const { highlights, context } = parsed.data;
  // Echo each input bullet 1:1 — used as the no-LLM fallback below and on
  // any LLM error so the wand never blocks the user. Frontend treats a
  // 1:1 echo as "no consolidation happened" and shows a friendly toast.
  const echoItems = highlights.map((h, i) => ({ text: h, sources: [i + 1] }));
  if (!hasAnyLLMProviderKey(c.env)) {
    return c.json(success({ items: echoItems }));
  }

  const contextLines: string[] = [];
  if (context?.role) contextLines.push(`Role: ${context.role}`);
  if (context?.organization) contextLines.push(`Organization: ${context.organization}`);
  if (context?.summary) contextLines.push(`Summary: ${context.summary}`);
  const contextBlock = contextLines.length > 0 ? `${contextLines.join("\n")}\n\n` : "";
  const userMessage = `${contextBlock}Current bullets:\n${highlights.map((h, i) => `${i + 1}. ${h}`).join("\n")}\n\nReturn a consolidated bullet list as JSON.`;

  try {
    const llm = createLLMClient(c.env, c.var.user);
    const { data } = await llm.callJson(
      "resume_consolidate_highlights",
      {
        useCase: "resume_consolidate_highlights",
        systemPrompt: CONSOLIDATE_HIGHLIGHTS_SYSTEM_PROMPT,
        userMessage,
      },
      ConsolidateHighlightsResponseSchema,
    );
    return c.json(success(data));
  } catch (err) {
    console.error("[resume/consolidate-highlights] LLM error:", err);
    return c.json(success({ items: echoItems }));
  }
});

/**
 * Single-bullet shortener. Used by the `shorten_bullet` registry tool
 * (the AI Brain's MCP-style surface) and the Optimizer page's
 * Action button when the recommendation is "shorten verbose bullet".
 *
 * Returns the rewritten text only; the caller routes `{ original,
 * improved }` through the existing `apply_resume_rewrite` matcher so
 * one persistence path covers every "rewrite a bullet" flow.
 */
const SHORTEN_BULLET_SYSTEM_PROMPT = getPrompt("resume-editor-shorten").render({});

resumeOptimizerRoutes.post("/shorten-bullet", requireTokenBudget(), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = ShortenBulletRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        success: false as const,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid shorten-bullet request",
          details: parsed.error.flatten(),
        },
        timestamp: new Date().toISOString(),
      },
      400,
    );
  }

  const { original, maxChars } = parsed.data;
  if (!hasAnyLLMProviderKey(c.env)) {
    // No-LLM fallback — truncate at the cap rather than blocking.
    const cap = maxChars ?? 180;
    return c.json(success({ improved: original.slice(0, cap) }));
  }

  const userMessage = `Bullet: ${original}\n\nMax characters: ${maxChars ?? 180}.\n\nReturn the rewritten bullet as JSON.`;

  try {
    const llm = createLLMClient(c.env, c.var.user);
    const { data } = await llm.callJson(
      "resume_shorten_bullet",
      {
        useCase: "resume_consolidate_highlights",
        systemPrompt: SHORTEN_BULLET_SYSTEM_PROMPT,
        userMessage,
      },
      ShortenBulletResponseSchema,
    );
    return c.json(success(data));
  } catch (err) {
    console.error("[resume/shorten-bullet] LLM error:", err);
    const cap = maxChars ?? 180;
    return c.json(success({ improved: original.slice(0, cap) }));
  }
});

/**
 * XYZ-format rewrite for an entry's bullet list. Same I/O shape as
 * /consolidate-highlights so the existing review dialog renders both —
 * the difference is the editorial lens applied to the rewrite ("XYZ
 * accomplishment format" vs "consolidate near-duplicates").
 *
 * Falls back to a 1:1 echo on missing LLM credentials or any LLM error
 * so the wand never blocks the editor — frontend treats a 1:1 echo as
 * "no rewrite happened" and surfaces a friendly toast.
 */
resumeOptimizerRoutes.post("/rewrite-xyz-highlights", requireTokenBudget(), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = RewriteXyzHighlightsRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        success: false as const,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid rewrite-xyz-highlights request",
          details: parsed.error.flatten(),
        },
        timestamp: new Date().toISOString(),
      },
      400,
    );
  }

  const { highlights, context } = parsed.data;
  const echoItems = highlights.map((h, i) => ({ text: h, sources: [i + 1] }));
  if (!hasAnyLLMProviderKey(c.env)) {
    return c.json(success({ items: echoItems }));
  }

  try {
    const llm = createLLMClient(c.env, c.var.user);
    const { items } = await rewriteHighlightsAsXyz(highlights, context, llm);
    return c.json(success({ items }));
  } catch (err) {
    console.error("[resume/rewrite-xyz-highlights] LLM error:", err);
    return c.json(success({ items: echoItems }));
  }
});

/**
 * XYZ-format rewrite for a single text field (work/volunteer/project
 * summary, or a position/title). Echoes the input on LLM unavailable
 * or error — never blocks the editor. The prompt for `kind: "position"`
 * is deliberately constrained: it polishes capitalisation and expands
 * unambiguous abbreviations but does NOT change seniority signal, so an
 * "Engineer" can't be silently promoted to "Senior Engineer".
 */
resumeOptimizerRoutes.post("/rewrite-xyz-text", requireTokenBudget(), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = RewriteXyzTextRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        success: false as const,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid rewrite-xyz-text request",
          details: parsed.error.flatten(),
        },
        timestamp: new Date().toISOString(),
      },
      400,
    );
  }

  const { kind, original, context } = parsed.data;
  if (!hasAnyLLMProviderKey(c.env)) {
    return c.json(success({ improved: original }));
  }

  try {
    const llm = createLLMClient(c.env, c.var.user);
    const result = await rewriteTextAsXyz(kind, original, context, llm);
    // Defensive: re-validate the model output against the wire schema
    // before responding. Catches a model that hallucinated a 5000-char
    // summary that would fail the frontend's schema check anyway.
    const safe = RewriteXyzTextResponseSchema.safeParse(result);
    if (!safe.success) {
      return c.json(success({ improved: original }));
    }
    return c.json(success(safe.data));
  } catch (err) {
    console.error("[resume/rewrite-xyz-text] LLM error:", err);
    return c.json(success({ improved: original }));
  }
});

/**
 * #989 — Skills wand. Normalises casing, expands ambiguous abbreviations,
 * dedupes near-synonyms across a single resume section's skills list. The
 * shape mirrors `consolidate-highlights` + `rewrite-xyz-highlights` so
 * the frontend can reuse the existing review dialog.
 *
 *   POST /rewrite-skills { skills: string[] }  →  { items: [{ text, sources, note? }] }
 */
const RewriteSkillsRequestSchema = z.object({
  skills: z.array(z.string().min(1).max(120)).min(1).max(200),
});

resumeOptimizerRoutes.post("/rewrite-skills", requireTokenBudget(), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = RewriteSkillsRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        success: false as const,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid rewrite-skills request",
          details: parsed.error.flatten(),
        },
        timestamp: new Date().toISOString(),
      },
      400,
    );
  }

  const { skills } = parsed.data;
  const echoItems = skills.map((s, i) => ({ text: s, sources: [i + 1] }));
  if (!hasAnyLLMProviderKey(c.env)) {
    return c.json(success({ items: echoItems }));
  }

  try {
    const llm = createLLMClient(c.env, c.var.user);
    const { items } = await rewriteSkillsAsAts(skills, llm);
    return c.json(success({ items }));
  } catch (err) {
    console.error("[resume/rewrite-skills] LLM error:", err);
    return c.json(success({ items: echoItems }));
  }
});

resumeOptimizerRoutes.all("*", (c) =>
  c.json(
    { success: false as const, error: { code: "NOT_IMPLEMENTED", message: "Resume optimizer route not implemented" }, timestamp: new Date().toISOString() },
    501,
  ),
);
