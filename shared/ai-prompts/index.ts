/**
 * AI Prompt Registry — single source of truth for every system prompt
 * the platform ships.
 *
 * Why a registry: routes, the AIChatPanel, and (under gap #1620) the
 * MCP `prompts/list` endpoint all need the same persona text. Prior to
 * this registry, each surface inlined its own `const SYSTEM_PROMPT`
 * which drifted independently. Adding a prompt = one file under this
 * directory + one entry in `PROMPTS` below + one entry in the
 * `PromptId` union in `types.ts`.
 *
 * Consumers should call `getPrompt(id).render(vars)` rather than
 * touching the prompt files directly — the registry is the load-bearing
 * surface and is what MCP will iterate.
 */

import type { PromptDef, PromptId } from "./types.js";
import { careerCoachPrompt } from "./career-coach.js";
import {
  consolidateHighlightsPrompt,
  shortenBulletPrompt,
} from "./resume-editor.js";
import { resumeRoastPrompt } from "./resume-roast.js";
import {
  interviewAnswerCoachPrompt,
  interviewQuestionGeneratorPrompt,
} from "./interview.js";
import { careerResiliencePrompt } from "./career.js";
import { valuePropositionPrompt } from "./value-proposition.js";
import { videoPitchPrompt } from "./video-pitch.js";

export type { PromptDef, PromptId, PromptArgument, CareerCoachVars } from "./types.js";
export type { InterviewQuestionVars } from "./interview.js";
export type { VideoPitchVars } from "./video-pitch.js";

/** Every shipped prompt. Keyed by PromptId for O(1) lookup. */
export const PROMPTS = {
  "career-coach": careerCoachPrompt,
  "career-resilience": careerResiliencePrompt,
  "resume-editor-consolidate": consolidateHighlightsPrompt,
  "resume-editor-shorten": shortenBulletPrompt,
  "resume-roast": resumeRoastPrompt,
  "interview-question-generator": interviewQuestionGeneratorPrompt,
  "interview-answer-coach": interviewAnswerCoachPrompt,
  "value-proposition": valuePropositionPrompt,
  "video-pitch": videoPitchPrompt,
} as const satisfies Record<PromptId, PromptDef<any>>;

/** Look up a prompt by id. Throws on unknown id so a typo at a call
 *  site fails loudly rather than silently sending the user an empty
 *  system message. */
export function getPrompt<Id extends PromptId>(id: Id): (typeof PROMPTS)[Id] {
  const prompt = PROMPTS[id];
  if (!prompt) {
    throw new Error(`[ai-prompts] Unknown prompt id: ${String(id)}`);
  }
  return prompt;
}

/** All registered prompt ids — useful for MCP `prompts/list`, sitemap
 *  generation, and the SuperAdmin prompt browser. */
export const PROMPT_IDS = Object.keys(PROMPTS) as PromptId[];
