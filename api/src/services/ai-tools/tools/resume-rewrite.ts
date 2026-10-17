/**
 * The résumé editor's AI wands — one bullet list or field at a time, so a
 * round-trip stays short and accepting a rewrite never touches unrelated
 * sections. With no LLM configured each tool echoes its input (the editor
 * treats a 1:1 echo as "nothing changed"); a configured call that throws
 * answers a typed AI_* envelope instead of a silent echo.
 */
import { z } from "zod";
import { getPrompt } from "../../../../../shared/ai-prompts/index.js";
import {
  ConsolidateHighlightsRequestSchema,
  ConsolidateHighlightsResponseSchema,
  RewriteBulletRequestSchema,
  RewriteXyzHighlightsRequestSchema,
  RewriteXyzTextRequestSchema,
  RewriteXyzTextResponseSchema,
  ShortenBulletRequestSchema,
  ShortenBulletResponseSchema,
} from "../../../../../shared/tool-schemas.js";
import { logger } from "../../../lib/logger.js";
import { success } from "../../../types/index.js";
import { createLLMClient, hasAnyLLMProviderKey } from "../../adapters/llm-client.js";
import { aiFailure } from "../../adapters/llm-error.js";
import { consolidateBullets } from "../../resume/rewrite.js";
import { rewriteBullet } from "../../resume/rewrite-bullet.js";
import { rewriteHighlightsAsXyz, rewriteSkillsAsAts, rewriteTextAsXyz } from "../../resume/rewrite-xyz.js";
import { defineAiTool, type AiToolContext } from "../types.js";

const llmFor = (c: AiToolContext) => createLLMClient(c.env, c.var.user);
const echo = (items: string[]) => ({ items: items.map((text, i) => ({ text, sources: [i + 1] })) });

/** Run the LLM step; no provider → `fallback`, a thrown call → AI_* envelope. */
async function withLlm<T>(c: AiToolContext, fallback: T, tag: string, run: () => Promise<T>): Promise<Response> {
  if (!hasAnyLLMProviderKey(c.env)) return c.json(success(fallback), 200);
  try {
    return c.json(success(await run()), 200);
  } catch (err) {
    return aiFailure(c, err, tag);
  }
}

const CONSOLIDATE_HIGHLIGHTS_PROMPT = getPrompt("resume-editor-consolidate").render({});
const SHORTEN_BULLET_PROMPT = getPrompt("resume-editor-shorten").render({});

export const consolidateHighlightsTool = defineAiTool({
  id: "resume-consolidate-highlights",
  schema: ConsolidateHighlightsRequestSchema,
  tokenBudget: "gate",
  useCase: "resume_consolidate_highlights",
  handler: (c, { highlights, context }) => {
    const ctx = [
      context?.role && `Role: ${context.role}`,
      context?.organization && `Organization: ${context.organization}`,
      context?.summary && `Summary: ${context.summary}`,
    ].filter(Boolean);
    const userMessage = `${ctx.length ? `${ctx.join("\n")}\n\n` : ""}Current bullets:\n${highlights
      .map((h, i) => `${i + 1}. ${h}`)
      .join("\n")}\n\nReturn a consolidated bullet list as JSON.`;
    return withLlm(c, echo(highlights), "[resume/consolidate-highlights] LLM error", async () => {
      const { data } = await llmFor(c).callJson(
        "resume_consolidate_highlights",
        { useCase: "resume_consolidate_highlights", systemPrompt: CONSOLIDATE_HIGHLIGHTS_PROMPT, userMessage },
        ConsolidateHighlightsResponseSchema,
      );
      return data;
    });
  },
});

export const shortenBulletTool = defineAiTool({
  id: "resume-shorten-bullet",
  schema: ShortenBulletRequestSchema,
  tokenBudget: "gate",
  useCase: "resume_consolidate_highlights",
  handler: (c, { original, maxChars }) => {
    const cap = maxChars ?? 180;
    // No LLM → truncate at the cap rather than blocking.
    return withLlm(c, { improved: original.slice(0, cap) }, "[resume/shorten-bullet] LLM error", async () => {
      const { data } = await llmFor(c).callJson(
        "resume_shorten_bullet",
        {
          useCase: "resume_consolidate_highlights",
          systemPrompt: SHORTEN_BULLET_PROMPT,
          userMessage: `Bullet: ${original}\n\nMax characters: ${cap}.\n\nReturn the rewritten bullet as JSON.`,
        },
        ShortenBulletResponseSchema,
      );
      return data;
    });
  },
});

/** One bullet through one lens (#375): `metric` (bracketed placeholders,
 *  never invented numbers) or `verbs`. Paid AI → Pro. */
export const rewriteBulletTool = defineAiTool({
  id: "resume-rewrite-bullet",
  schema: RewriteBulletRequestSchema,
  requirePro: "Resume wands",
  tokenBudget: "gate",
  handler: (c, { original, mode }) =>
    withLlm(c, { improved: original }, "[resume/rewrite-bullet] LLM error", () => rewriteBullet(llmFor(c), original, mode)),
});

export const rewriteXyzHighlightsTool = defineAiTool({
  id: "resume-rewrite-xyz-highlights",
  schema: RewriteXyzHighlightsRequestSchema,
  tokenBudget: "gate",
  handler: (c, { highlights, context }) =>
    withLlm(c, echo(highlights), "[resume/rewrite-xyz-highlights] LLM error", async () => ({
      items: (await rewriteHighlightsAsXyz(highlights, context, llmFor(c))).items,
    })),
});

/** A summary / position field. `position` only polishes — it never changes
 *  seniority. Model output is re-validated; an invalid one echoes. */
export const rewriteXyzTextTool = defineAiTool({
  id: "resume-rewrite-xyz-text",
  schema: RewriteXyzTextRequestSchema,
  tokenBudget: "gate",
  handler: (c, { kind, original, context }) =>
    withLlm(c, { improved: original }, "[resume/rewrite-xyz-text] LLM error", async () => {
      const safe = RewriteXyzTextResponseSchema.safeParse(await rewriteTextAsXyz(kind, original, context, llmFor(c)));
      return safe.success ? safe.data : { improved: original };
    }),
});

/** #989 — normalise casing, expand abbreviations, dedupe synonyms. */
export const rewriteSkillsTool = defineAiTool({
  id: "resume-rewrite-skills",
  schema: z.object({ skills: z.array(z.string().min(1).max(120)).min(1).max(200) }),
  tokenBudget: "gate",
  handler: (c, { skills }) =>
    withLlm(c, echo(skills), "[resume/rewrite-skills] LLM error", async () => ({
      items: (await rewriteSkillsAsAts(skills, llmFor(c))).items,
    })),
});

/**
 * Any bullet-style list (highlights, keywords, courses, roles) → deduped,
 * tightened, no invented facts. Stateless: the caller swaps the list only
 * if the user accepts. Degrades to the input with `unchanged: true`.
 */
export const consolidateBulletsTool = defineAiTool({
  id: "resume-consolidate-bullets",
  schema: z.object({
    bullets: z.array(z.string()).min(1).max(100),
    fieldType: z.enum(["highlights", "keywords", "courses", "roles"]),
    sectionType: z.string().min(1),
    entryLabel: z.string().optional(),
  }),
  tokenBudget: "none",
  handler: async (c, { bullets, fieldType, sectionType, entryLabel }) => {
    if (!hasAnyLLMProviderKey(c.env)) {
      return c.json(success({ rewritten: bullets, unchanged: true, reason: "AI provider not configured" }), 200);
    }
    try {
      const result = await consolidateBullets(bullets, { fieldType, sectionType, entryLabel }, llmFor(c));
      return c.json(success({ rewritten: result.rewritten, notes: result.notes }), 200);
    } catch (err) {
      logger.error("[consolidate-bullets] AI call failed", { error: err instanceof Error ? err.message : err });
      return c.json(success({ rewritten: bullets, unchanged: true, reason: "AI consolidation failed — original preserved" }), 200);
    }
  },
});
