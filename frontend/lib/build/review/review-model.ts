/**
 * The review session contract — what every kit review (merge, pull the
 * master in, compare, tailor, create from a job, a chat revision) exposes
 * to the page, the chat column and the compare panel.
 *
 * One review is open at a time (useBuildReview). Each kind produces the
 * same core: a baseline ("Before"), a proposal ("After", with the person's
 * decisions applied), path-anchored changes, how many items still need the
 * person, and ONE primary action. Kind-specific state (merge decisions,
 * requirement evidence, gap answers) rides on the kind's own fields; the
 * UI picks the right panels / page cards from `kind`.
 */
import type { ResumeContent } from "@shared/resume";
import { readAt, type ContentPath } from "@shared/resume-path";
import type { ResumeLineage } from "@shared/resume-lineage";
import type { CoverLetterDraft } from "./use-cover-letter-writer";

export type ReviewKind = "merge" | "pull" | "compare" | "tailor" | "fromJob" | "revise";
export type ReviewView = "changes" | "before" | "after";

export type ChangeStatus = "kept" | "reverted";

export interface ReviewChange {
  id: string;
  /** Anchor on the After page (shared/resume-path.ts). */
  path: ContentPath;
  section: string;
  before: string;
  after: string;
  /** The model's reason (tailor / create-from-a-job); absent for diffs. */
  why?: string;
  status: ChangeStatus;
  /** Numbered pin on the page (1-based, list order). */
  pin: number;
}

export interface ReviewPrimary {
  /** i18n key of the button ("Save as version of master"). */
  labelKey: string;
  run: () => Promise<void>;
  busy: boolean;
}

export interface ReviewCore {
  kind: ReviewKind;
  status: "loading" | "ready" | "error";
  /** i18n key of a failure to show in the chat. */
  errorKey?: string;
  /** What is being reviewed ("FractionalCTO_2025.pdf", "VP Engineering · Northwind"). */
  subject: string;
  /** Null only while a review is still loading its source. */
  baseline: ResumeContent | null;
  proposed: ResumeContent | null;
  changes: readonly ReviewChange[];
  /** Items that still need the person — the primary action waits for 0. */
  remaining: number;
  setChange: (id: string, status: ChangeStatus) => void;
  setAll: (status: ChangeStatus) => void;
  /** Replace a change's proposed text (pin popover / compare footer "Edit"). */
  editChange?: (id: string, text: string) => void;
  primary: ReviewPrimary | null;
  discard: () => void;
  /** The job's cover letter, written with the review (tailor, create from
   *  a job); it rides on `proposed` as `meta.coverLetter`. */
  letter?: CoverLetterDraft;
}

/** What the open review needs from the kit workspace (a narrow port, so
 *  each review hook can be driven without the page). */
export interface ReviewHost {
  draft: ResumeContent | null;
  /** The open résumé's id when it is saved. */
  resumeId: string | null;
  /** Where the open résumé sits (master / version / standalone); null
   *  until known or when unsaved. Decides where a review saves. */
  lineage: ResumeLineage | null;
  /** Saves an unsaved draft (first résumé on an account becomes the master). */
  ensureSaved: () => Promise<string>;
  /** Apply content to the draft as ONE undo step. */
  commit: (next: ResumeContent) => void;
  /** Open another saved résumé in the workspace (a version just saved). */
  openResume: (content: ResumeContent, title: string, resumeId: string) => void;
  /** Lineage (master / version / staleness) changed server-side. */
  refreshLineage: () => void;
  /** A real account is required; returns false (and shows the sign-in
   *  sheet) when there is none. */
  requireAccount: (reasonKey: string) => boolean;
}

/** i18n key + params naming where a change is ("Headline", "AiM · bullets"). */
export function changeTitle(path: ContentPath, content: ResumeContent): { key: string; params: Record<string, string> } {
  const [section, index, field] = path.split(".");
  if (section === "basics") return { key: `review.where.basics.${field ?? "other"}`, params: {} };
  if (index === undefined || !/^\d+$/.test(index)) return { key: "review.where.section", params: { section } };
  const entry = (readAt(content, `${section}.${index}`) ?? {}) as Record<string, unknown>;
  const name = String(entry.name ?? entry.organization ?? entry.institution ?? entry.title ?? entry.language ?? "").trim();
  const where = field === "highlights" ? "bullets" : field === "summary" || field === "description" ? "summary" : "entry";
  return { key: `review.where.${where}`, params: { name: name || section, section } };
}
