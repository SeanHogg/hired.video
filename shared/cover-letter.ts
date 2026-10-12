/**
 * Cover letter — the letter that goes with a résumé tailored to ONE job.
 *
 * It lives on that tailored version's content (`content.meta.coverLetter`),
 * beside the video plan (`meta.video`): one draft, one autosave, one Undo,
 * and the letter can never drift from the version it was written for. The
 * sender's name and contact line are NOT stored — they are read from the
 * résumé's `basics` when the letter renders, so editing the résumé header
 * updates the letter too (one fact in one place).
 *
 * Written by POST /api/match/cover-letter (api/src/services/job/cover-
 * letter-handler.ts) from the tailored résumé + the job, evidence-only.
 */
import { z } from "zod";
import type { ResumeContent } from "./resume.js";

/**
 * The tones the inspector can rewrite a letter in (POST /api/match/cover-
 * letter/tone). Free for every signed-in viewer — the one AI letter action
 * that is not Pro. New tones are added here and in the API's TONE_GUIDES.
 */
export const COVER_LETTER_TONES = ["warm", "confident", "formal", "brief"] as const;
export const CoverLetterToneSchema = z.enum(COVER_LETTER_TONES);
export type CoverLetterTone = z.infer<typeof CoverLetterToneSchema>;

/** Letter type sizes the style control offers, in points. */
export const LETTER_FONT_SIZE_MIN = 9;
export const LETTER_FONT_SIZE_MAX = 14;

/**
 * How the letter is set on paper — font family, size, line spacing and the
 * paper it prints on. Optional on the letter: a letter written before styles
 * existed has none and renders with the defaults (letter-style.ts).
 */
export const CoverLetterStyleSchema = z.object({
  font: z.enum(["sans", "serif", "mono"]),
  /** Body size in points. */
  size: z.number().min(LETTER_FONT_SIZE_MIN).max(LETTER_FONT_SIZE_MAX),
  spacing: z.enum(["tight", "normal", "relaxed"]),
  paper: z.enum(["letter", "a4"]),
});
export type CoverLetterStyle = z.infer<typeof CoverLetterStyleSchema>;

export const CoverLetterSchema = z.object({
  /** The role as the posting names it ("Chief Information Officer"). */
  jobTitle: z.string().default(""),
  /** The hiring organisation ("Macomb Community College"). */
  organization: z.string().default(""),
  /** Inside address, one line each — only what the posting states. */
  recipientLines: z.array(z.string()).default([]),
  /** "Dear Members of the Search Committee:" */
  salutation: z.string().min(1),
  /** Opening paragraph(s) — why this role, the headline credential. */
  opening: z.array(z.string().min(1)).min(1),
  /** One line introducing the evidence list (optional). */
  highlightsIntro: z.string().default(""),
  /** The evidence: each maps a job priority to résumé proof. */
  highlights: z
    .array(z.object({ label: z.string().default(""), text: z.string().min(1) }))
    .default([]),
  /** Mission fit + the ask. */
  closing: z.array(z.string().min(1)).default([]),
  /** "Sincerely," */
  signOff: z.string().min(1),
  /** ISO date the letter is dated. */
  date: z.string().min(1),
  /** How it is set on paper; absent → the defaults. */
  style: CoverLetterStyleSchema.optional(),
  /** The tone the letter was last rewritten in (the inspector's Tone);
   *  absent → never rewritten. */
  tone: CoverLetterToneSchema.optional(),
});
export type CoverLetter = z.infer<typeof CoverLetterSchema>;

/** The letter stored on a résumé, or null (absent or malformed). */
export function readCoverLetter(content: ResumeContent | null | undefined): CoverLetter | null {
  const raw = (content?.meta as Record<string, unknown> | undefined)?.coverLetter;
  if (!raw) return null;
  const parsed = CoverLetterSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  // A bad style never costs the letter: drop it and use the defaults.
  if (typeof raw === "object" && "style" in raw) {
    const { style: _style, ...rest } = raw as Record<string, unknown>;
    const unstyled = CoverLetterSchema.safeParse(rest);
    if (unstyled.success) return unstyled.data;
  }
  return null;
}

/** The résumé with `letter` stored on it (null removes it). Pure. */
export function withCoverLetter(content: ResumeContent, letter: CoverLetter | null): ResumeContent {
  const meta = { ...(content.meta ?? {}) } as Record<string, unknown>;
  if (letter) meta.coverLetter = letter;
  else delete meta.coverLetter;
  return { ...content, meta } as ResumeContent;
}

const SALUTATION_RE = /^(dear|hello|hi|to whom)\b/i;
const SIGN_OFF_RE = /^(sincerely|best|regards|kind regards|best regards|warm regards|thank you|thanks|respectfully|cordialement|atentamente|saludos)\b/i;

/**
 * A cover letter someone already wrote (a dropped file's text) as the
 * letter the workspace edits: the "Dear …" paragraph is the salutation, the
 * closing line ("Sincerely,") the sign-off, the first paragraph the opening
 * and the rest the closing; whatever follows the sign-off (the name) is
 * dropped — the sender block comes from the résumé header. A text with no
 * body paragraph is not a letter (null). `defaults` fills a missing
 * salutation / sign-off in the reader's language. Pure.
 */
export function coverLetterFromText(
  text: string,
  defaults: { salutation: string; signOff: string; date: string },
): CoverLetter | null {
  const blocks = text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((block) =>
      block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    )
    .filter((lines) => lines.length > 0);
  let salutation = defaults.salutation;
  let signOff = defaults.signOff;
  const body: string[] = [];
  for (const lines of blocks) {
    const first = lines[0];
    if (body.length === 0 && SALUTATION_RE.test(first) && first.length <= 120) {
      salutation = first;
      if (lines.length > 1) body.push(lines.slice(1).join(" "));
      continue;
    }
    if (SIGN_OFF_RE.test(first) && first.length <= 40) {
      signOff = first;
      break;
    }
    body.push(lines.join(" "));
  }
  if (body.length === 0) return null;
  const parsed = CoverLetterSchema.safeParse({
    salutation,
    opening: [body[0]],
    closing: body.slice(1),
    signOff,
    date: defaults.date,
  });
  return parsed.success ? parsed.data : null;
}

/** The sender block, derived from the résumé header (never stored). */
export function coverLetterSender(content: ResumeContent): { name: string; contact: string[] } {
  const b = content.basics ?? ({} as NonNullable<ResumeContent["basics"]>);
  const loc = b.location;
  const place = [loc?.city, loc?.region].filter(Boolean).join(", ");
  return {
    name: (b.name ?? "").trim(),
    contact: [b.email, b.phone, b.url, place].map((s) => (s ?? "").trim()).filter(Boolean),
  };
}

/** Plain text of the whole letter (copy to clipboard, paste into a form). */
export function coverLetterToText(letter: CoverLetter, content: ResumeContent, formattedDate: string): string {
  const sender = coverLetterSender(content);
  const blocks: string[] = [];
  if (sender.name) blocks.push([sender.name, sender.contact.join(" · ")].filter(Boolean).join("\n"));
  blocks.push(formattedDate);
  if (letter.recipientLines.length) blocks.push(letter.recipientLines.join("\n"));
  blocks.push(letter.salutation);
  blocks.push(...letter.opening);
  if (letter.highlightsIntro) blocks.push(letter.highlightsIntro);
  if (letter.highlights.length) {
    blocks.push(letter.highlights.map((h) => `- ${h.label ? `${h.label}: ` : ""}${h.text}`).join("\n"));
  }
  blocks.push(...letter.closing);
  blocks.push([letter.signOff, sender.name].filter(Boolean).join("\n\n"));
  return blocks.join("\n\n");
}
