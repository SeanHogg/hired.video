/**
 * Entry contract into the studio workspace's new career kit — SSoT for every
 * surface that hands a visitor off to it (landing hero, final CTA, mobile
 * bottom bar + header "Make your video", in-app "new" links).
 *
 *   - Kit    → `navigate(NEW_KIT_PATH, { state: kitEntryState(...) })`
 *              — résumé / description + photo + cover letter + job at once
 *              (kit-intake.ts, KitDropZone)
 *   - Prompt → `/studio/new?prompt=<encoded text>` starts a draft
 *
 * Pure (no React) so it is unit-testable and reusable by the workspace when
 * it reads the incoming prompt / file back.
 */

/** A new career kit in the studio workspace — the ONE public entry (SEO,
 *  sitemap) and what every "new" link opens. Once the kit has a project the
 *  address becomes /studio/<projectId>. */
export const NEW_KIT_PATH = "/studio/new";

/** `accept` attribute for resume pickers: PDF, Word, plain text, Markdown, photos. */
export const RESUME_FILE_ACCEPT = ".pdf,.doc,.docx,.txt,.md,image/*";

const ACCEPTED_EXTENSIONS = [".pdf", ".doc", ".docx", ".txt", ".md"] as const;

/** Router state carried to a new kit: a file to start from, or — with
 *  `?resume=` — a review to open on it (the merge / tailor tool pages hand
 *  off here with a dropped résumé file or a pasted job post). */
export interface BuildEntryState {
  file?: File;
  mergeFile?: File;
  /** Name of the résumé merging in (`?merge=<id>`), for the review header. */
  mergeLabel?: string;
  jobText?: string;
  jobLabel?: string;
  /** With `jobText`: create a new version for the job instead of tailoring. */
  createForJob?: boolean;
  /** Words about the person to parse when there is no file (a description,
   *  or a dropped cover letter's text) — too long for `?prompt=`. */
  prompt?: string;
  /** The person's photo — becomes the résumé photo once the draft is ready. */
  photo?: File;
  /** A cover letter's text — becomes the draft's letter once it is ready. */
  letterText?: string;
}

/**
 * True when the file matches RESUME_FILE_ACCEPT. Drag-and-drop bypasses the
 * input's `accept` filter, so drops must be checked explicitly.
 */
export function isAcceptedResumeFile(file: Pick<File, "name" | "type">): boolean {
  if (file.type.startsWith("image/")) return true;
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}
