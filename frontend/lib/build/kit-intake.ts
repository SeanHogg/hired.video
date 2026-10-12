/**
 * Kit intake — "drop what you have" for making a résumé, its cover letter and
 * its video in one go. The rules shared by every drop zone that hands off to
 * the kit workspace (the home page hero, the studio's start band):
 *
 *   photo     an image                      → the résumé photo (basics.image)
 *   résumé    PDF / Word / text / a photo   → parsed into the draft
 *   letter    PDF / Word / text             → the draft's cover letter
 *   job       the job post's TEXT (a link   → a tailor review once the draft
 *             is read into text first,        is on the page (it auto-writes
 *             kit-drop.ts)                    a letter for that job)
 *
 * Any one is enough to start EXCEPT a photo or a job alone: those need a
 * person to be about (a résumé, a cover letter, or a few words about you).
 *
 * Pure (no React) so the slotting rules are unit-testable.
 */
import { isAcceptedResumeFile, type BuildEntryState } from "@/lib/build-entry";
import { jobLabel } from "@/lib/tools/job-label";

export const KIT_FILE_SLOTS = ["photo", "resume", "letter"] as const;
export type KitFileSlot = (typeof KIT_FILE_SLOTS)[number];

export interface KitDraft {
  photo: File | null;
  resume: File | null;
  letter: File | null;
  /** The job post's text, pasted. */
  job: string;
  /** "Or describe yourself" — stands in for a résumé. */
  prompt: string;
}

export const EMPTY_KIT: KitDraft = { photo: null, resume: null, letter: null, job: "", prompt: "" };

function isImage(file: Pick<File, "type">): boolean {
  return file.type.startsWith("image/");
}

/** True when the file can go in that slot (a photo must be an image; the
 *  résumé takes any accepted résumé file; a letter takes documents only). */
export function fitsSlot(slot: KitFileSlot, file: Pick<File, "name" | "type">): boolean {
  if (slot === "photo") return isImage(file);
  if (!isAcceptedResumeFile(file)) return false;
  return slot === "resume" || !isImage(file);
}

/** The slot a file dropped on the whole zone fills: an image is the photo
 *  (or, once there is one, a photographed résumé); a document is the résumé,
 *  then the letter. Null = it doesn't fit anywhere still open. */
export function slotForFile(file: Pick<File, "name" | "type">, draft: KitDraft): KitFileSlot | null {
  if (!isAcceptedResumeFile(file)) return null;
  if (isImage(file)) {
    if (!draft.photo) return "photo";
    return draft.resume ? null : "resume";
  }
  if (!draft.resume) return "resume";
  return draft.letter ? null : "letter";
}

/** A pasted job that is only a link — read through the job importer
 *  (use-job-link-import.ts) before it can stand for the job. */
export function isBareLink(text: string): boolean {
  return /^https?:\/\/\S+$/i.test(text.trim());
}

/** Something the kit can be about: a résumé, a letter, or words about you. */
export function canStartKit(draft: KitDraft): boolean {
  return !!(draft.resume || draft.letter || draft.prompt.trim());
}

/** The first line of a job post, as the review's label ("CIO · Macomb"). */
export { jobLabel };

/**
 * The kit entry for a kit. `letterText` is the letter file's text (read
 * by the caller). With no résumé, the description — or else the letter,
 * which says who the person is — is parsed into the draft.
 */
export function kitEntryState(draft: KitDraft, letterText: string, untitledJob: string): BuildEntryState {
  const state: BuildEntryState = {};
  const prompt = draft.prompt.trim() || letterText.trim();
  if (draft.resume) state.file = draft.resume;
  else if (prompt) state.prompt = prompt;
  if (draft.photo) state.photo = draft.photo;
  if (letterText.trim()) state.letterText = letterText.trim();
  const job = draft.job.trim();
  if (job && !isBareLink(job)) {
    state.jobText = job;
    state.jobLabel = jobLabel(job, untitledJob);
  }
  return state;
}
