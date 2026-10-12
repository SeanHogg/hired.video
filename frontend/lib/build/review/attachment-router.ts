/**
 * What did the person just hand the kit workspace, and what do they want done with it?
 *
 *   classifyText  a résumé, a job post, or neither — from the text itself
 *   jobLinkIn     a job URL pasted into the message
 *   intentFrom    an intent typed in words ("merge it", "tailor my résumé
 *                 for this job") — a typed intent skips the question
 *
 * Pure and heuristic on purpose: it only decides which question to ask
 * (or skips it); every flow it starts shows its result for review before
 * anything is saved, so a wrong guess costs one click, not data.
 */

export type AttachmentKind = "resume" | "job";
export type ReviewIntent = "merge" | "replace" | "compare" | "tailor" | "create" | "score";

/** Intents offered for each kind, first = the suggested one. */
export const INTENTS_FOR: Record<AttachmentKind, readonly ReviewIntent[]> = {
  resume: ["merge", "replace", "compare"],
  job: ["tailor", "create", "score"],
};

const JOB_SIGNALS = [
  /\bresponsibilities\b/i,
  /\brequirements?\b/i,
  /\bqualifications?\b/i,
  /\bwhat you('|’)ll do\b/i,
  /\bwe('|’)re looking for\b/i,
  /\babout the role\b/i,
  /\byou will\b/i,
  /\bnice to have\b/i,
  /\b(apply|application) (now|today)\b/i,
  /\bbenefits\b/i,
  /\bequal opportunity\b/i,
  /\bmust have\b/i,
  /\bpreferred\b/i,
  /\b\d\+? years of experience\b/i,
];

const RESUME_SIGNALS = [
  /\b(work )?experience\b/i,
  /\beducation\b/i,
  /\bskills\b/i,
  /\b(19|20)\d{2}\s*[-–—]\s*((19|20)\d{2}|present|current)\b/i,
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? (19|20)\d{2}\b/i,
  /[\w.+-]+@[\w-]+\.[\w.]+/,
  /\b(bachelor|master|b\.?sc|m\.?sc|mba|ph\.?d)\b/i,
  /\b(led|managed|built|delivered|increased|reduced)\b/i,
];

const count = (text: string, signals: readonly RegExp[]) => signals.reduce((n, re) => n + (re.test(text) ? 1 : 0), 0);

/** A résumé reads like dated first-person history; a job post like
 *  requirements addressed to "you". Null when it is neither (a chat
 *  message, a one-liner). */
export function classifyText(text: string): AttachmentKind | null {
  const sample = text.slice(0, 20_000);
  if (sample.trim().length < 200) return null;
  const job = count(sample, JOB_SIGNALS);
  const resume = count(sample, RESUME_SIGNALS);
  if (job >= 3 && job >= resume - 1) return "job";
  if (resume >= 3) return "resume";
  return job >= 2 ? "job" : null;
}

/** The first http(s) URL in a message — a pasted job link. */
export function jobLinkIn(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>"')]+/i);
  return match ? match[0].replace(/[.,;]+$/, "") : null;
}

const JOB_WORD = "(job|role|position|posting|job post|opening)";
const INTENT_WORDS: Array<[ReviewIntent, RegExp]> = [
  ["merge", /\b(merge|combine (it|them|both|the two)|fold (it )?in|add (it|this) to my (master|résumé|resume))\b/i],
  ["replace", /\b(start over|replace (it|mine|my résumé|my resume)|use this one instead)\b/i],
  ["compare", /\b(compare|side by side|what('|’)s different)\b/i],
  [
    "create",
    new RegExp(
      String.raw`\b(create|make|build|write) (me )?(a )?(new |fresh |separate )?(one|résumé|resume|cv)\b.*\b(for|from)\b|\bnew (one|résumé|resume) for (this|the|that) ${JOB_WORD}\b`,
      "i",
    ),
  ],
  ["score", /\b(match score|score (my|the) match|how (well )?do i (match|fit))\b/i],
  [
    "tailor",
    new RegExp(String.raw`\btailor\b|\b(adapt|target|update|fit)\b[^.]*\b${JOB_WORD}\b|\bfor (this|the|that|a) ${JOB_WORD}\b`, "i"),
  ],
];

/** The intent a typed message states, if any. */
export function intentFrom(text: string): ReviewIntent | null {
  for (const [intent, re] of INTENT_WORDS) if (re.test(text)) return intent;
  return null;
}

/** An intent only makes sense for the kind it belongs to. */
export function intentFits(intent: ReviewIntent, kind: AttachmentKind): boolean {
  return INTENTS_FOR[kind].includes(intent);
}
