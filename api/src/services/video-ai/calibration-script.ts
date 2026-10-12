/**
 * Voice-clone calibration script (#1997). On clone setup the LLM writes a
 * ~45-second read-aloud script grounded in the user's profile — varied
 * sentence shapes, numbers, a question and an exclamation so the sample
 * covers the intonation a clone needs — plus a suggested voice name and
 * description. Lowers the "what do I even say for 30 seconds?" friction.
 */
import type { LLMClient, LLMCallOpts } from "../adapters/llm-client.js";
import {
  CalibrationScriptResponseSchema,
  type CalibrationScriptRequest,
  type CalibrationScriptResponse,
} from "../../../../shared/video-ai.js";

export const CALIBRATION_SYSTEM_PROMPT = `You write a read-aloud script someone records to clone their voice.
Rules:
- 110-140 words (about 45 seconds spoken), in the requested language.
- First person, natural and warm, about the speaker's work if profile facts are given (never invent employers, titles or numbers that are not in the facts).
- Cover varied sounds: include one question, one exclamation, one number read aloud, and a mix of short and long sentences.
- No stage directions, no brackets, no markdown.
Also suggest a short voice name (<= 4 words) and a one-line description of the voice's intended use.
Return ONLY JSON: {"script":"...","suggestedName":"...","suggestedDescription":"..."}`;

export function buildCalibrationUserMessage(input: CalibrationScriptRequest): string {
  const facts = input.profileSummary?.trim()
    ? `Profile facts:\n${input.profileSummary.trim()}`
    : "No profile facts — keep it about professional life in general.";
  return `Language: ${input.language}\n${facts}\n\nWrite the calibration script.`;
}

export async function generateCalibrationScript(
  llm: LLMClient,
  input: CalibrationScriptRequest,
  opts?: LLMCallOpts,
): Promise<CalibrationScriptResponse> {
  const { data } = await llm.callJson(
    "voice_calibration_script",
    {
      useCase: "voice_calibration_script",
      systemPrompt: CALIBRATION_SYSTEM_PROMPT,
      userMessage: buildCalibrationUserMessage(input),
    },
    CalibrationScriptResponseSchema,
    opts,
  );
  return data;
}
