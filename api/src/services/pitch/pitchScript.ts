/**
 * Video Pitch Lab — starter-script drafting (POST /api/video-pitch/script).
 * Builds a short résumé context, asks the LLM for a script sized to the
 * requested length, and falls back to a hand-rolled template when no LLM is
 * configured or the call fails (the tool stays usable either way).
 */
import { z } from "zod";
import type { ResumeContent } from "../../../../shared/resume.js";
import { getPrompt } from "../../../../shared/ai-prompts/index.js";
import { logger } from "../../lib/logger.js";
import { createLLMClient, hasAnyLLMProviderKey, type LLMEnv } from "../adapters/llm-client.js";
import { liveResumes } from "../resume/deps.js";
import type { JwtPayload } from "../../types/index.js";

export interface PitchScriptInput {
  resumeId?: string;
  length: 30 | 60 | 90;
  tone: "casual" | "professional" | "enthusiastic";
}

export interface PitchScriptResult {
  script: string;
  targetWordCount: number;
}

const ScriptResponseSchema = z.object({
  script: z.string().min(40),
});

// Spoken-word pacing assumption: ~150 wpm comfortable, 130 wpm clear. We
// target 140 wpm so the candidate doesn't have to rush. Cap derived from
// (wpm * lengthSec / 60).
const WORDS_PER_MIN = 140;

/** Résumé bones for the prompt — headline + most-recent role + top skills
 *  only; that's all the model needs and trims prompt cost vs. the whole blob. */
async function resumeContextFor(resumeId: string | undefined, userId: string): Promise<string> {
  if (!resumeId) return "";
  const row = await liveResumes().findByIdForOwner(resumeId, userId);
  if (!row?.content) return "";
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
    lines.push(`Most recent role: ${recent.position}${recent.company ? ` at ${recent.company}` : ""}`);
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
  return lines.join("\n");
}

export async function draftPitchScript(
  env: LLMEnv | undefined,
  user: JwtPayload,
  input: PitchScriptInput,
): Promise<PitchScriptResult> {
  const targetWordCount = Math.round((WORDS_PER_MIN * input.length) / 60);
  const resumeContext = await resumeContextFor(input.resumeId, user.sub);

  if (!hasAnyLLMProviderKey(env)) {
    return { script: mockScript(input.tone, resumeContext), targetWordCount };
  }

  const systemPrompt = getPrompt("video-pitch").render({ targetWordCount, tone: input.tone });
  const userMessage = resumeContext
    ? `Resume context:\n${resumeContext}\n\nWrite the pitch.`
    : `No resume context supplied — write a generic but punchy pitch the candidate can edit.`;

  try {
    const llm = createLLMClient(env, user);
    const { data } = await llm.callJson(
      "video_pitch_script",
      { useCase: "video_pitch_script", systemPrompt, userMessage },
      ScriptResponseSchema,
    );
    return { script: data.script, targetWordCount };
  } catch (err) {
    logger.error("[video-pitch] LLM call failed, using mock", err);
    return { script: mockScript(input.tone, resumeContext), targetWordCount };
  }
}

function mockScript(tone: string, resumeContext: string): string {
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
