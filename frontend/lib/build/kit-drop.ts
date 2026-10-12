/**
 * What was just dropped or pasted on a kit drop zone, sorted into the kit's
 * slots (kit-intake.ts):
 *
 *   photo / resume / letter   a file, by type and the slots still open
 *   jobUrl                    a link (text/uri-list, or text that IS a URL)
 *                             → read through the job importer
 *   jobText                   text that reads like a job post
 *   about                     text that reads like a résumé → "describe
 *                             yourself"
 *   rejected                  a file with no open slot, or text we can't place
 *
 * Files win over text: dragging an image off a web page carries its URL too.
 * Pure (no React) so the rules are unit-testable.
 */
import type { JobSummary } from "@/lib/services/job-service";
import { classifyText } from "./review/attachment-router";
import { isBareLink, slotForFile, type KitDraft, type KitFileSlot } from "./kit-intake";

export type DroppedItem =
  | { kind: KitFileSlot; file: File }
  | { kind: "jobUrl"; url: string }
  | { kind: "jobText"; text: string }
  | { kind: "about"; text: string }
  | { kind: "rejected" };

/** The parts of a drop / paste we read (DataTransfer's, flattened). */
export interface DropPayload {
  files: readonly File[];
  /** `text/uri-list`: one URL per line, `#` lines are comments. */
  uriList?: string;
  /** `text/plain`. */
  text?: string;
}

/** The first URL of a `text/uri-list`. */
export function firstUri(uriList: string | undefined): string | null {
  const line = (uriList ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("#"));
  return line && isBareLink(line) ? line : null;
}

function classifyTextDrop(text: string, looseText: boolean): DroppedItem | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (isBareLink(trimmed)) return { kind: "jobUrl", url: trimmed };
  const kind = classifyText(trimmed);
  if (kind === "job") return { kind: "jobText", text: trimmed };
  if (kind === "resume") return { kind: "about", text: trimmed };
  return looseText ? { kind: "jobText", text: trimmed } : { kind: "rejected" };
}

/** Sort a drop / paste. `draft` decides which file slots are still open;
 *  `looseText` (the job slot's own Paste) takes text that reads as neither
 *  a job nor a résumé as the job, instead of rejecting it. */
export function classifyDrop(payload: DropPayload, draft: KitDraft, { looseText = false } = {}): DroppedItem[] {
  if (payload.files.length > 0) {
    const items: DroppedItem[] = [];
    let open = draft;
    for (const file of payload.files) {
      const slot = slotForFile(file, open);
      if (!slot) {
        items.push({ kind: "rejected" });
        continue;
      }
      open = { ...open, [slot]: file };
      items.push({ kind: slot, file });
    }
    return items;
  }
  const uri = firstUri(payload.uriList);
  if (uri) return [{ kind: "jobUrl", url: uri }];
  const fromText = classifyTextDrop(payload.text ?? "", looseText);
  return fromText ? [fromText] : [];
}

export interface AppliedDrop {
  draft: KitDraft;
  rejected: number;
  /** A job link to read (the job slot fills once it is read). */
  jobUrl: string | null;
}

/** Put sorted items into the draft. */
export function applyDrop(draft: KitDraft, items: readonly DroppedItem[]): AppliedDrop {
  let next = draft;
  let rejected = 0;
  let jobUrl: string | null = null;
  for (const item of items) {
    if (item.kind === "rejected") rejected += 1;
    else if (item.kind === "jobUrl") jobUrl = item.url;
    else if (item.kind === "jobText") next = { ...next, job: item.text };
    else if (item.kind === "about") next = { ...next, prompt: item.text };
    else next = { ...next, [item.kind]: item.file };
  }
  return { draft: next, rejected, jobUrl };
}

/** An imported job as the job post's text: its title line first (the
 *  review's label, see jobLabel), then what the posting says. */
export function jobTextFromSummary(job: Pick<JobSummary, "title" | "company" | "location" | "description" | "requirements" | "skills">): string {
  const heading = [job.title, job.company].filter((part) => part && part.trim()).join(" · ");
  const lines = [heading, job.location ?? "", "", job.description ?? ""];
  if (job.requirements?.length) lines.push("", ...job.requirements.map((r) => `- ${r}`));
  if (job.skills?.length) lines.push("", job.skills.join(", "));
  return lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type JobLinkError = "unsupported" | "signIn" | "unreadable";

/** Why a job link couldn't be read, from the importer's error code. */
export function jobLinkError(code: string): JobLinkError {
  if (code === "UNAUTHORIZED" || code === "AUTHENTICATION_ERROR") return "signIn";
  if (code === "NOT_A_JOB_POSTING" || code === "EXTRACTION_FAILED") return "unsupported";
  return "unreadable";
}
