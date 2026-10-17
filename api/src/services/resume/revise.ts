/**
 * Revise a résumé from a plain-language request — the /build chat ("make it
 * punchier", "one page", "tailor it to product roles") applied IN PLACE to the
 * draft on screen, instead of handing the visitor off to the studio.
 *
 * The chat also gets questions ("how did you decide I have a career
 * break?"). Those must never be applied as edits. `classifyMessageIntent`
 * recognises them in code and sends them down an answer-only path (a
 * plain-text reply; any résumé the model returns is ignored). Messages it
 * can't place go to the edit prompt, where the model may still answer as
 * `{"reply": "..."}`. Answers are grounded in the same `analyzeResume` facts
 * the workspace shows.
 *
 * Pure use case: the model call is an injected port (`AiTextCaller`), the
 * output is healed + validated by the same pipe every stored résumé passes,
 * so a malformed model reply can never replace the visitor's draft.
 *
 * Guard rails live in the prompt AND in code: the model may rewrite wording,
 * reorder and trim, but `preserveIdentity` puts back the facts it must not
 * touch (name, contact details, employers, dates) whatever it returns, and
 * `keepUnrequestedRemovals` puts back a summary / headline the model emptied
 * when the owner didn't ask for that. Each revision reports the areas it
 * changed, so the chat can say what happened instead of a bare "Done".
 */
import type { AiTextCaller } from "../adapters/ai-text-caller.js";
import { extractJson, normalizeJsonResume } from "./parse.js";
import { healAndValidateContent } from "./content.js";
import { classifyMessageIntent } from "./message-intent.js";
import { analyzeResume, CAREER_BREAK_MONTHS } from "../../../../shared/resume-insights.js";
import {
  pinOwnerOverrides,
  readVideoPlan,
  SCENE_SECONDS_MAX,
  SCENE_SECONDS_MIN,
  VIDEO_LOOK_IDS,
  VIDEO_SCENE_IDS,
  ReviseFocusSchema,
  VideoPlanSchema,
  type ReviseFocus,
} from "../../../../shared/video-plan.js";
import type { ResumeContent } from "../../../../shared/resume.js";
import { logger } from "../../lib/logger.js";

export const REVISE_INSTRUCTION_MAX = 500;
/** What the AI caller may read for a revise (prompt + the whole compact
 *  résumé). Never slice the résumé itself: a model handed a cut-off résumé
 *  rightly refuses to edit it. */
export const REVISE_MAX_INPUT_CHARS = 60_000;
const REPLY_MAX_CHARS = 1_200;

/** Workspace bookkeeping the model never edits — large, and restored from
 *  the original by preserveIdentity (`meta.video` is sent on its own). */
const NOT_FOR_THE_MODEL = ["skillEvidence", "metaData", "meta"] as const;

/** The résumé as the model reads it: everything it may edit, nothing else. */
export function promptResume(original: Json): string {
  const view: Json = { ...original };
  for (const key of NOT_FOR_THE_MODEL) delete view[key];
  return JSON.stringify(view);
}

/** What a revision touched, for the chat's "Done — changed …" line. Top-level
 *  sections by their JSON Resume key; basics split into headline / summary /
 *  the rest; the video plan (`meta.video`) is "video". */
export type ChangedArea = "headline" | "summary" | "basics" | "video" | (string & {});

export type ReviseResult =
  | { ok: true; content: Record<string, unknown>; changed: ChangedArea[] }
  | { ok: true; reply: string }
  | { ok: false; code: "INVALID_INSTRUCTION" | "AI_FAILED" | "INVALID_OUTPUT"; message: string };

const REVISE_SYSTEM_PROMPT = [
  "You edit resumes stored as JSON Resume (jsonresume.org schema).",
  "You receive the current resume JSON, how the workspace read it, and one message from its owner.",
  "If the message is a QUESTION or comment (not a request to change the resume), do NOT edit anything:",
  'return {"reply": "<a short, plain answer>"} and nothing else. Answer from the resume and the workspace reading only; when asked why the workspace decided something, explain the rule and the facts behind it.',
  "Otherwise apply ONLY the requested change and return the COMPLETE updated resume as a single JSON object with the same schema.",
  "Rules for changes:",
  "- Never invent facts: no new employers, titles, dates, degrees, numbers, metrics or skills the resume does not already support.",
  "- Keep every quantified fact that you keep exactly as written.",
  "- Do not change the person's name, email, phone, url, location, employer names or any start/end dates.",
  "- You may rewrite wording, reorder items, shorten or remove bullets, and rewrite the summary and headline (basics.label).",
  "- Keep every array present (use [] rather than dropping a key). Keep each item's `id` when it has one.",
  "- The resume JSON you receive is complete. Workspace bookkeeping (skill evidence, metadata) is left out on purpose and kept automatically — never say the resume was cut off or incomplete.",
  "- The resume also makes a video. Its plan is `meta.video` (given separately below). Change the plan only when the message is about the video; otherwise return it unchanged.",
  '- When the message is ONLY about the video, return just {"meta": {"video": <the updated plan>}} — the resume itself stays exactly as it is. A clear change request is never answered with a reply instead of the change.',
  `- Video plan shape: {"scenes": {<scene>: {"off"?: true, "duration"?: ${SCENE_SECONDS_MIN}-${SCENE_SECONDS_MAX} (whole seconds), "look"?: one of ${VIDEO_LOOK_IDS.join("|")}, "title"?: string, "lines"?: up to 3 strings, "roles"?: work item ids (proof only, up to 4), "voiceover"?: what the narrator says over the scene (string)}}, "music"?: track id, "canvas"?: frame-level hand edits}. Scenes: ${VIDEO_SCENE_IDS.join(", ")}. "proof" is built from work experience; setting "title"/"lines" replaces the scene's wording.`,
  "- `meta.video.canvas` and `meta.video.musicMix` hold the owner's own hand edits to the video frames and music mix. Return them exactly as given — never add, change or remove them.",
  '- A scene may carry "notes": the owner\'s director\'s notes for that scene. Follow them whenever you write that scene\'s title, lines, voiceover or length. Scenes may also carry the owner\'s own look ("background", "filters", "effects", "transitionIn", "palette", "font", "motion") and the plan an "export" — return all of these exactly as given.',
  "- Output JSON only. No prose, no markdown fences.",
].join("\n");

const ANSWER_SYSTEM_PROMPT = [
  "You answer questions about a resume for its owner.",
  "You receive the resume JSON, how the workspace read it, and the owner's question.",
  "Answer from the resume and the workspace reading only. When asked why the workspace decided something, explain the rule and the exact facts behind it (dates, months, counts). If the reading looks wrong for this resume, say so plainly and say how to fix it (e.g. add the missing dates).",
  "You cannot change the resume. Do not output JSON or a resume. Reply in plain text, at most 4 short sentences.",
].join("\n");

type Json = Record<string, unknown>;

/** The workspace's reading of the résumé (structure pick, career pattern),
 *  as plain facts the model can cite when the owner asks "why". */
export function describeReading(content: Json): string {
  const i = analyzeResume(content as unknown as ResumeContent);
  return [
    `Career pattern: ${i.pattern}. Rule: a gap of more than ${CAREER_BREAK_MONTHS} months between dated roles reads as a career break ("gaps"), unless some role has no readable start date; fewer than 2 years of work reads as early-career; a latest role in a different field from earlier roles reads as a pivot; otherwise steady. Overlapping roles count once.`,
    i.longestGap
      ? `Longest gap between dated roles: ${i.longestGap.months} months, with no dated role from ${i.longestGap.from} to ${i.longestGap.to}.`
      : "Longest gap between dated roles: none.",
    `Roles without a readable start date: ${i.undatedRoles}.`,
    `Years of experience (overlaps removed): ${i.yearsExperience}. Seniority: ${i.seniority}. Industry: ${i.industry ?? "unknown"}.`,
    `Recommended structure: ${i.recommendedStructure} (steady → chronological, career break → functional/skills-first, otherwise hybrid).`,
  ].join("\n");
}

function isObject(v: unknown): v is Json {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/**
 * Put back the facts a revision must never change, by position for work /
 * education entries that still line up. The prompt asks for this too; this
 * makes it true regardless of what the model sends.
 */
export function preserveIdentity(original: Json, revised: Json): Json {
  const out: Json = { ...revised };

  const ob = isObject(original.basics) ? original.basics : {};
  // Basics left out (a video-only reply) → unchanged.
  const rb = isObject(revised.basics) ? revised.basics : ob;
  const basics: Json = { ...rb };
  for (const key of ["name", "email", "phone", "url", "location", "profiles", "image"]) {
    if (ob[key] !== undefined) basics[key] = ob[key];
  }
  out.basics = basics;

  const pin = (section: string, keys: string[]) => {
    const o = Array.isArray(original[section]) ? (original[section] as unknown[]) : [];
    const r = Array.isArray(revised[section]) ? (revised[section] as unknown[]) : null;
    if (!r) {
      out[section] = o;
      return;
    }
    out[section] = r.map((item, i) => {
      const src = o[i];
      if (!isObject(item) || !isObject(src)) return item;
      const fixed: Json = { ...item };
      for (const key of keys) if (src[key] !== undefined) fixed[key] = src[key];
      return fixed;
    });
  };
  pin("work", ["id", "name", "startDate", "endDate"]);
  pin("education", ["id", "institution", "studyType", "area", "startDate", "endDate"]);
  pin("volunteer", ["id", "organization", "startDate", "endDate"]);
  pin("projects", ["id", "startDate", "endDate"]);

  // A section the model dropped entirely comes back unchanged.
  for (const [key, value] of Object.entries(original)) {
    if (out[key] === undefined) out[key] = value;
  }

  // Metadata is the workspace's, not the model's — except the video plan,
  // which it may change, and only to a plan that validates.
  const om = isObject(original.meta) ? original.meta : {};
  const rm = isObject(revised.meta) ? revised.meta : {};
  const meta: Json = { ...om };
  // Omitted → unchanged; invalid → unchanged; valid → the model's plan.
  const video = rm.video === undefined ? null : VideoPlanSchema.safeParse(rm.video);
  if (video?.success) {
    // Hand edits to the frames and the hand music mix are the owner's:
    // pinned to the original.
    const { canvas: _canvas, musicMix: _musicMix, ...plan } = video.data;
    const originalPlan = readVideoPlan(original);
    const { canvas: handEdits, musicMix: handMix } = originalPlan;
    // So are the scenes' look overrides, director's notes and export settings.
    const pinned = pinOwnerOverrides(
      {
        ...plan,
        ...(handEdits ? { canvas: handEdits } : {}),
        ...(handMix ? { musicMix: handMix } : {}),
      },
      originalPlan,
    );
    if (Object.keys(pinned).length > 0) meta.video = pinned;
    else delete meta.video;
  }
  if (Object.keys(meta).length > 0 || original.meta !== undefined) out.meta = meta;
  else delete out.meta;
  return out;
}

/** Asked to remove `what`? ("drop the summary", "no headline"). */
function asksToRemove(instruction: string, what: RegExp): boolean {
  return /\b(remove|delete|drop|cut|lose|without|no|get rid of|clear)\b/i.test(instruction) && what.test(instruction);
}

/** basics fields a revision must not silently empty, and the words that
 *  name them in a request. */
const GUARDED_BASICS: ReadonlyArray<[key: string, names: RegExp]> = [
  ["summary", /\b(summary|summaries|profile|intro|about)\b/i],
  ["label", /\b(headline|title|label|tagline)\b/i],
];

/**
 * Put back a summary / headline the model emptied or omitted when the owner
 * didn't ask for it to go — the failure mode behind "I asked a question and
 * my summary disappeared".
 */
export function keepUnrequestedRemovals(original: Json, revised: Json, instruction: string): Json {
  const ob = isObject(original.basics) ? original.basics : {};
  const rb: Json = isObject(revised.basics) ? { ...revised.basics } : {};
  for (const [key, names] of GUARDED_BASICS) {
    const before = typeof ob[key] === "string" ? (ob[key] as string).trim() : "";
    const after = typeof rb[key] === "string" ? (rb[key] as string).trim() : "";
    if (before && !after && !asksToRemove(instruction, names)) rb[key] = ob[key];
  }
  return { ...revised, basics: rb };
}

/** Areas that differ between two healed résumés. */
export function changedAreas(before: Json, after: Json): ChangedArea[] {
  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const out: ChangedArea[] = [];
  const ob: Json = isObject(before.basics) ? before.basics : {};
  const ab: Json = isObject(after.basics) ? after.basics : {};
  if (!same(ob.label, ab.label)) out.push("headline");
  if (!same(ob.summary, ab.summary)) out.push("summary");
  const rest = (b: Json) => Object.fromEntries(Object.entries(b).filter(([k]) => k !== "label" && k !== "summary"));
  if (!same(rest(ob), rest(ab))) out.push("basics");
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  keys.delete("basics");
  keys.delete("meta");
  for (const key of keys) if (!same(before[key], after[key])) out.push(key);
  if (!same(readVideoPlan(before), readVideoPlan(after))) out.push("video");
  return out;
}

/** The answer-only path: a question about the résumé. Never edits. */
async function answerQuestion(original: Json, question: string, callAI: AiTextCaller): Promise<ReviseResult> {
  let raw: string;
  try {
    raw = await callAI(
      ANSWER_SYSTEM_PROMPT,
      `Owner's question: ${question}\n\nHow the workspace read this resume:\n${describeReading(original)}\n\nResume JSON:\n${promptResume(original)}`,
    );
  } catch (err) {
    logger.warn("[revise] AI answer failed", err);
    return { ok: false, code: "AI_FAILED", message: "The AI couldn't answer that right now. Try again shortly." };
  }
  const reply = readReply(raw);
  if (!reply) return { ok: false, code: "INVALID_OUTPUT", message: "The AI didn't answer that. Try rephrasing it." };
  return { ok: true, reply: reply.slice(0, REPLY_MAX_CHARS) };
}

/** Plain text, or `{"reply": "..."}` from a model that answered in JSON
 *  anyway. Anything else JSON-shaped (a résumé) is not an answer. */
function readReply(raw: string): string {
  const text = raw.trim();
  if (!text.startsWith("{") && !text.startsWith("```")) return text;
  try {
    const parsed = extractJson(text);
    return typeof parsed.reply === "string" ? parsed.reply.trim() : "";
  } catch {
    return "";
  }
}

/** The request's `focus`, when it is a valid one. */
export function parseReviseFocus(value: unknown): ReviseFocus | undefined {
  const parsed = ReviseFocusSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/** "The owner is looking at …" — so "make this shorter" has a target. */
function describeFocus(focus: ReviseFocus | undefined, original: Json): string {
  if (!focus) return "";
  if (focus.view !== "video") return "The owner is looking at the resume page.\n\n";
  const notes = readVideoPlan(original).scenes?.[focus.scene]?.notes?.trim();
  const direction = notes ? ` Their director's notes for this scene: "${notes}" — follow them.` : "";
  return `The owner is looking at the video, scene "${focus.scene}". "This"/"it" means that scene unless they say otherwise.${direction}\n\n`;
}

export async function reviseResumeContent(
  content: unknown,
  instruction: string,
  callAI: AiTextCaller,
  focus?: ReviseFocus,
): Promise<ReviseResult> {
  const ask = instruction.trim();
  if (!ask || ask.length > REVISE_INSTRUCTION_MAX) {
    return {
      ok: false,
      code: "INVALID_INSTRUCTION",
      message: `Describe the change in 1–${REVISE_INSTRUCTION_MAX} characters.`,
    };
  }

  const healedIn = healAndValidateContent(normalizeJsonResume(content));
  if (!healedIn.ok) {
    return { ok: false, code: "INVALID_OUTPUT", message: "That resume couldn't be read." };
  }
  const original = healedIn.content as unknown as Json;

  if (classifyMessageIntent(ask) === "question") return answerQuestion(original, ask, callAI);

  let raw: string;
  try {
    raw = await callAI(
      REVISE_SYSTEM_PROMPT,
      `${describeFocus(focus, original)}Owner's message: ${ask}\n\nHow the workspace read this resume:\n${describeReading(original)}\n\nCurrent video plan (meta.video):\n${JSON.stringify(readVideoPlan(original))}\n\nCurrent resume JSON:\n${promptResume(original)}`,
    );
  } catch (err) {
    logger.warn("[revise] AI call failed", err);
    return { ok: false, code: "AI_FAILED", message: "The AI couldn't make that change right now. Try again shortly." };
  }

  let parsed: unknown;
  try {
    parsed = extractJson(raw);
  } catch {
    parsed = null;
  }
  // An answer, not an edit. A blank one must not fall through to the edit
  // path — preserveIdentity would rebuild the original and report "Done".
  if (isObject(parsed) && "reply" in parsed) {
    const reply = typeof parsed.reply === "string" ? parsed.reply.trim() : "";
    if (!reply) {
      return { ok: false, code: "INVALID_OUTPUT", message: "The AI didn't answer that. Try rephrasing it." };
    }
    return { ok: true, reply: reply.slice(0, REPLY_MAX_CHARS) };
  }
  if (!isObject(parsed) || Object.keys(parsed).length === 0) {
    return { ok: false, code: "INVALID_OUTPUT", message: "The AI reply wasn't a resume. Try rephrasing the change." };
  }

  const merged = keepUnrequestedRemovals(original, preserveIdentity(original, normalizeJsonResume(parsed)), ask);
  const healedOut = healAndValidateContent(merged);
  if (!healedOut.ok) {
    return { ok: false, code: "INVALID_OUTPUT", message: "The AI reply wasn't a valid resume. Try rephrasing the change." };
  }
  const revised = healedOut.content as unknown as Json;
  return { ok: true, content: revised, changed: changedAreas(original, revised) };
}
