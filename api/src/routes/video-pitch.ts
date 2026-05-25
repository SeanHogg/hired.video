/**
 * Video Pitch Lab — script generator endpoint.
 *
 * The actual pitch upload reuses the existing studio recording pipeline
 * (`uploadRecording`), so this route exists only to draft the AI starter
 * script the candidate edits in the tool.
 */

import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Env, Variables, AppEnv } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { buildRepos } from "../repositories/index.js";
import { createLLMClient, hasAnyLLMProviderKey } from "../services/adapters/llm-client.js";
import { attachTokenBudget } from "../middleware/tierEnforcement.js";
import type { ResumeContent } from "../../../shared/resume.js";

export const videoPitchRoutes = new Hono<AppEnv>();
videoPitchRoutes.use("*", attachTokenBudget());

function ok<T>(data: T) {
  return { success: true as const, data, timestamp: new Date().toISOString() };
}
function fail(code: string, message: string, details?: unknown) {
  return {
    success: false as const,
    error: { code, message, ...(details !== undefined ? { details } : {}) },
    timestamp: new Date().toISOString(),
  };
}

const ScriptRequest = z.object({
  resumeId: z.string().uuid().optional(),
  length: z.union([z.literal(30), z.literal(60), z.literal(90)]),
  tone: z.enum(["casual", "professional", "enthusiastic"]),
});

const ScriptResponseSchema = z.object({
  script: z.string().min(40),
});

// Spoken-word pacing assumption: ~150 wpm comfortable, 130 wpm clear. We
// target 140 wpm so the candidate doesn't have to rush. Cap derived from
// (wpm * lengthSec / 60).
const WORDS_PER_MIN = 140;

videoPitchRoutes.post("/script", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Sign in"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = ScriptRequest.safeParse(body);
  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);
  }

  const targetWordCount = Math.round((WORDS_PER_MIN * parsed.data.length) / 60);

  // Pull resume bones if the caller supplied one. We pass only headline +
  // most-recent role + top skills to the LLM — that's all the model needs
  // and trims prompt cost vs. uploading the whole resume blob.
  let resumeContext = "";
  if (parsed.data.resumeId) {
    const repos = buildRepos(getDb());
    const row = await repos.resumes.findByIdForOwner(parsed.data.resumeId, user.sub);
    if (row?.content) {
      const content = row.content as ResumeContent;
      const basics = (content as { basics?: { name?: string; label?: string; summary?: string } }).basics;
      const work = Array.isArray(content?.work) ? content.work : [];
      const skills = Array.isArray(content?.skills) ? content.skills : [];
      const lines: string[] = [];
      if (basics?.name) lines.push(`Name: ${basics.name}`);
      if (basics?.label) lines.push(`Current label: ${basics.label}`);
      if (basics?.summary) lines.push(`Summary: ${basics.summary}`);
      const recent = work[0] as { position?: string; company?: string; highlights?: string[] } | undefined;
      if (recent?.position) {
        lines.push(
          `Most recent role: ${recent.position}${recent.company ? ` at ${recent.company}` : ""}`,
        );
        if (Array.isArray(recent.highlights) && recent.highlights.length > 0) {
          lines.push(`Top achievements: ${recent.highlights.slice(0, 3).join(" · ")}`);
        }
      }
      if (skills.length > 0) {
        const skillNames = skills
          .slice(0, 8)
          .map((s) => (typeof s === "string" ? s : (s as { name?: string })?.name))
          .filter(Boolean);
        if (skillNames.length > 0) lines.push(`Top skills: ${skillNames.join(", ")}`);
      }
      resumeContext = lines.join("\n");
    }
  }

  if (!hasAnyLLMProviderKey(c.env)) {
    // Fallback: hand-rolled template so the tool is usable even without an LLM key.
    const script = mockScript(parsed.data.tone, parsed.data.length, resumeContext);
    return c.json(ok({ script, targetWordCount }));
  }

  const systemPrompt = `You are an expert pitch coach for job seekers. You write spoken-word elevator pitches that hit a hook, value proposition, and a forward-looking ask in under the target word count.
Rules:
- Write for SPEAKING, not reading — short sentences, one idea each.
- Target ~${targetWordCount} words total (assume 140 wpm).
- Tone: ${parsed.data.tone}. ${parsed.data.tone === "casual" ? "Contractions OK." : parsed.data.tone === "enthusiastic" ? "Lead with energy; concrete metrics > adjectives." : "Crisp, confident, third-person-friendly."}
- Begin with a one-line hook (not "Hi, my name is…").
- Include one specific result (metric, deliverable, recognised outcome) if any resume context is supplied.
- End with a forward-looking line ("…and I'm looking for…" or "the next problem I want to solve is…").
Return ONLY JSON: { "script": "the full pitch as one paragraph" }`;

  const userMessage = resumeContext
    ? `Resume context:\n${resumeContext}\n\nWrite the pitch.`
    : `No resume context supplied — write a generic but punchy pitch the candidate can edit.`;

  try {
    const llm = createLLMClient(c.env, user);
    const { data } = await llm.callJson(
      "video_pitch_script",
      { useCase: "video_pitch_script", systemPrompt, userMessage },
      ScriptResponseSchema,
    );
    return c.json(ok({ script: data.script, targetWordCount }));
  } catch (err) {
    console.error("[video-pitch] LLM call failed, using mock:", err);
    const script = mockScript(parsed.data.tone, parsed.data.length, resumeContext);
    return c.json(ok({ script, targetWordCount }));
  }
});

// ─── Durable pitch URL (#1237) ─────────────────────────────────────────────

const PitchUrlSchema = z.object({
  videoPitchUrl: z.string().url().nullable(),
});

/** GET /api/video-pitch/profile — read current user's saved pitch URL. */
videoPitchRoutes.get("/profile", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Sign in"), 401);
  const db = getDb();
  const [row] = await db
    .select({
      videoPitchUrl: schema.users.videoPitchUrl,
      videoPitchSetAt: schema.users.videoPitchSetAt,
    })
    .from(schema.users)
    .where(eq(schema.users.id, user.sub))
    .limit(1);
  if (!row) return c.json(fail("NOT_FOUND", "User not found"), 404);
  return c.json(ok({
    videoPitchUrl: row.videoPitchUrl,
    videoPitchSetAt: row.videoPitchSetAt,
  }));
});

/** PUT /api/video-pitch/profile — save (or clear) the user's master pitch URL.
 *  Passing `null` clears it (e.g. "remove from my profile"). */
videoPitchRoutes.put("/profile", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Sign in"), 401);
  const body = await c.req.json().catch(() => null);
  const parsed = PitchUrlSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);
  }
  const db = getDb();
  const now = parsed.data.videoPitchUrl ? new Date() : null;
  await db
    .update(schema.users)
    .set({
      videoPitchUrl: parsed.data.videoPitchUrl,
      videoPitchSetAt: now,
      updatedAt: new Date(),
    } as any)
    .where(eq(schema.users.id, user.sub));
  return c.json(ok({
    videoPitchUrl: parsed.data.videoPitchUrl,
    videoPitchSetAt: now,
  }));
});

function mockScript(tone: string, length: number, resumeContext: string): string {
  const lead =
    tone === "enthusiastic"
      ? "Here's the thing I love about my work:"
      : tone === "casual"
        ? "So here's the short version:"
        : "Let me give you the 60-second version.";
  const middle = resumeContext
    ? "I've shipped products under deadline, taken ownership end-to-end, and consistently turned messy briefs into outcomes the business can point at."
    : "I bring a track record of getting things shipped without losing the plot — clear thinker, fast learner, comfortable on ambiguous problems.";
  const close =
    "What I'm looking for next is a team that lets me operate at that intersection of technical depth and business impact — happy to walk through specifics whenever you'd like.";
  return `${lead} ${middle} ${close}`;
}
