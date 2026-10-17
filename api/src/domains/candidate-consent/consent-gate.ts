/**
 * assertCandidateConsent — THE gate every "make this video public / post it"
 * path runs: the visibility toggle, the status PATCH
 * and publishProjectVideo (post-now AND scheduled self posts), plus managed
 * promotion submissions and queued distribution jobs.
 *
 * A project is a candidate video when it carries a `talent_pool_candidate`
 * subject — or once any consent was ever requested for it, so unlinking the
 * subject can't bypass a pending / declined ask. For those, the latest
 * request must be `approved` AND the project must still show what was
 * approved; anything else throws CandidateConsentRequiredError with a
 * `reason` (`content_changed` when only the content moved on). Every other
 * project passes untouched.
 *
 * enforceCandidateConsent is the write-side twin: wherever a project's
 * candidate status or content can change (subject linked, re-render,
 * save-draft of a public project) it forces the project unlisted when the
 * gate no longer passes.
 */
import {
  CANDIDATE_CONSENT_REQUIRED_CODE,
  type CandidateConsentBlockReason,
} from "../../../../shared/candidate-video-consent.js";
import type {
  CandidateVideoConsentRow,
  ConsentProjectContent,
  ICandidateVideoConsentRepository,
} from "../../repositories/candidateVideoConsentRepository.js";
import { effectiveStatus } from "./ports.js";

const DEFAULT_MESSAGE = "The candidate must approve this video before it can be made public or posted.";
const CONTENT_CHANGED_MESSAGE = "The video changed after the candidate approved it. Ask them to approve it again.";

export class CandidateConsentRequiredError extends Error {
  readonly code = CANDIDATE_CONSENT_REQUIRED_CODE;
  constructor(public readonly reason: CandidateConsentBlockReason = "not_requested", message?: string) {
    super(message ?? (reason === "content_changed" ? CONTENT_CHANGED_MESSAGE : DEFAULT_MESSAGE));
    this.name = "CandidateConsentRequiredError";
  }

  /** The `details` of the CONSENT_REQUIRED envelope. */
  get details(): { reason: CandidateConsentBlockReason } {
    return { reason: this.reason };
  }
}

export type AssertCandidateConsent = (projectId: string) => Promise<void>;

export type ConsentGateRepo = Pick<
  ICandidateVideoConsentRepository,
  "findCandidateSubjectId" | "latestForProject" | "findProjectContent"
>;

/** The approval still covers the project: same rendered file when one was
 *  approved; otherwise still unrendered at the approved revision. */
export function approvalCoversContent(row: CandidateVideoConsentRow, content: ConsentProjectContent | null): boolean {
  if (!content) return false;
  if (row.approvedVideoR2Key) return content.videoR2Key === row.approvedVideoR2Key;
  return !content.videoR2Key && content.revision === (row.approvedRevision ?? -1);
}

export async function assertCandidateConsent(projectId: string, repo: ConsentGateRepo, now: Date = new Date()): Promise<void> {
  const [subjectId, latest] = await Promise.all([
    repo.findCandidateSubjectId(projectId),
    repo.latestForProject(projectId),
  ]);
  if (!subjectId && !latest) return;
  if (!latest) throw new CandidateConsentRequiredError("not_requested");
  // An approval by one candidate doesn't cover a video now about another.
  if (subjectId && latest.talentPoolCandidateId && latest.talentPoolCandidateId !== subjectId) {
    throw new CandidateConsentRequiredError("not_requested");
  }
  const status = effectiveStatus(latest, now);
  if (status !== "approved") throw new CandidateConsentRequiredError(status);
  if (!approvalCoversContent(latest, await repo.findProjectContent(projectId))) {
    throw new CandidateConsentRequiredError("content_changed");
  }
}

/** Force the project unlisted when the gate fails. Returns true when it did. */
export async function enforceCandidateConsent(
  projectId: string,
  deps: { repo: ConsentGateRepo; forceUnlisted: (projectId: string) => Promise<void>; now?: () => Date },
): Promise<boolean> {
  try {
    await assertCandidateConsent(projectId, deps.repo, deps.now?.() ?? new Date());
    return false;
  } catch (e) {
    if (!(e instanceof CandidateConsentRequiredError)) throw e;
    await deps.forceUnlisted(projectId);
    return true;
  }
}
