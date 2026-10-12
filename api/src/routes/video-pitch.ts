/**
 * Video Pitch Lab — AI script generator + the "current pitch" pointer.
 *
 * The pitch itself is a studio project (`purpose: "pitch"`) saved through
 * the ordinary studio endpoints, with takes uploaded by the existing studio
 * recording pipeline (`uploadRecording`). This route drafts the starter
 * script and reads / sets which pitch project is the user's current one.
 */

import { Hono } from "hono";
import { z } from "zod";
import { UuidLikeSchema } from "../../../shared/validation.js";
import type { AppEnv } from "../types/index.js";
import { getDb } from "../db/index.js";
import { buildRepos } from "../repositories/index.js";
import { createLLMClient, hasAnyLLMProviderKey } from "../services/adapters/llm-client.js";
import { attachTokenBudget } from "../middleware/tierEnforcement.js";
import type { ResumeContent } from "../../../shared/resume.js";
import { getPrompt } from "../../../shared/ai-prompts/index.js";
import {
  PitchError,
  clearCurrentPitch,
  getCurrentPitch,
  invalidatePitchCaches,
  setCurrentPitch,
  type PitchErrorCode,
} from "../services/pitch/pitchService.js";

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
  resumeId: UuidLikeSchema.optional(),
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

  const systemPrompt = getPrompt("video-pitch").render({
    targetWordCount,
    tone: parsed.data.tone,
  });

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

// ─── Current pitch (#1237 / #2133) ─────────────────────────────────────────
//
// The pitch is a studio project with `purpose: "pitch"` — created and saved
// through the ordinary studio endpoints (POST /api/studio/save-draft, takes
// via POST /api/studio/recording/upload with that projectId). These two
// routes only read / move the per-user "current pitch" pointer.

const SetCurrentPitchSchema = z.object({
  /** The pitch project to surface; `null` removes the pitch from the profile. */
  projectId: UuidLikeSchema.nullable(),
});

const PITCH_ERROR_STATUS: Record<PitchErrorCode, 400 | 403 | 404 | 409> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  NOT_A_PITCH: 400,
  NO_MEDIA: 409,
};

/** GET /api/video-pitch/current — the caller's current pitch (or null). */
videoPitchRoutes.get("/current", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Sign in"), 401);
  const repos = buildRepos(getDb());
  return c.json(ok({ pitch: await getCurrentPitch(user.sub, repos.pitches) }));
});

/** PUT /api/video-pitch/current — "set as my pitch" (or clear with null). */
videoPitchRoutes.put("/current", async (c) => {
  const user = c.var.user;
  if (!user?.sub) return c.json(fail("UNAUTHORIZED", "Sign in"), 401);
  const parsed = SetCurrentPitchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(fail("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);
  }
  const repos = buildRepos(getDb());
  if (parsed.data.projectId === null) {
    await clearCurrentPitch(user.sub, repos.pitches);
    await invalidatePitchCaches(user.sub);
    return c.json(ok({ pitch: null }));
  }
  try {
    const pitch = await setCurrentPitch(user.sub, parsed.data.projectId, repos.pitches);
    // The partner payload embeds the pitch and is read-through cached.
    await invalidatePitchCaches(user.sub);
    return c.json(ok({ pitch }));
  } catch (err) {
    if (err instanceof PitchError) {
      return c.json(fail(err.code, err.message), PITCH_ERROR_STATUS[err.code]);
    }
    throw err;
  }
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
