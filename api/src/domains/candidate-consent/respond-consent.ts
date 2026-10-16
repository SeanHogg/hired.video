/**
 * Candidate-side consent use cases, reached through the tokenized email link.
 * Fail closed: a malformed, unknown or superseded token is NOT_FOUND.
 *
 *   approve / decline — only from pending and before expires_at. An approval
 *     pins the project's current content (render + revision); the gate
 *     refuses once that changes.
 *   revoke — withdraws an approval. Allowed for as long as the approval
 *     stands, whatever expires_at says: the expiry bounds the first answer,
 *     not the candidate's right to change their mind.
 *
 * Every outcome other than an approval forces the project unlisted.
 */
import type { CandidateVideoConsentRow } from "../../repositories/candidateVideoConsentRepository.js";
import { cdnUrl } from "../../utils/cdn.js";
import type {
  CandidateVideoConsentDecision,
  PublicCandidateVideoConsent,
} from "../../../../shared/candidate-video-consent.js";
import {
  CandidateConsentError,
  effectiveStatus,
  hashConsentToken,
  isWellFormedConsentToken,
  type CandidateConsentDeps,
} from "./ports.js";

async function findByToken(token: string, deps: CandidateConsentDeps): Promise<CandidateVideoConsentRow> {
  if (!isWellFormedConsentToken(token)) throw new CandidateConsentError("NOT_FOUND", "Consent link not found");
  const row = await deps.repo.findByTokenHash(await hashConsentToken(token));
  // A superseded link is indistinguishable from an unknown one; a withdrawn
  // approval (revoked + withdrawn_at) still shows the candidate its state.
  if (!row || (row.status === "revoked" && !row.withdrawnAt)) {
    throw new CandidateConsentError("NOT_FOUND", "Consent link not found");
  }
  return row;
}

async function toPublic(row: CandidateVideoConsentRow, deps: CandidateConsentDeps): Promise<PublicCandidateVideoConsent> {
  const ctx = await deps.repo.loadPublicContext(row);
  return {
    candidateName: row.candidateName,
    recruiterName: ctx.recruiterName ?? "A recruiter",
    jobTitle: ctx.jobTitle,
    companyName: ctx.companyName,
    // The rendered file's unlisted CDN URL — the /m watch page answers
    // "pending" for a project that isn't public yet.
    videoUrl: ctx.videoR2Key ? cdnUrl(ctx.videoR2Key) : null,
    status: effectiveStatus(row, deps.now()),
    expiresAt: new Date(row.expiresAt).toISOString(),
  };
}

/** What the consent page shows. Read-only: a lapsed pending link reads as
 *  expired without being written (the POST paths persist it). */
export async function getPublicConsent(token: string, deps: CandidateConsentDeps): Promise<PublicCandidateVideoConsent> {
  return toPublic(await findByToken(token, deps), deps);
}

/** response_ip keeps the approving IP — the record of who said yes. */
async function withdrawApproval(row: CandidateVideoConsentRow, deps: CandidateConsentDeps): Promise<CandidateVideoConsentRow> {
  if (row.status !== "approved") throw new CandidateConsentError("NOT_APPROVED", "There is no approval to withdraw");
  const updated = await deps.repo.withdraw(row.id);
  if (!updated) throw new CandidateConsentError("NOT_APPROVED", "There is no approval to withdraw");
  await deps.forceUnlisted(row.projectId);
  return updated;
}

async function answerPending(
  row: CandidateVideoConsentRow,
  decision: "approve" | "decline",
  ip: string | null,
  deps: CandidateConsentDeps,
): Promise<CandidateVideoConsentRow> {
  const status = effectiveStatus(row, deps.now());
  if (status === "expired") {
    if (row.status === "pending") await deps.repo.markExpired(row.id);
    await deps.forceUnlisted(row.projectId);
    throw new CandidateConsentError("EXPIRED", "This consent link has expired");
  }
  if (status !== "pending") throw new CandidateConsentError("ALREADY_RESPONDED", "You already answered this request");

  // The approval is of what the project shows right now.
  const approved = decision === "approve" ? await deps.repo.findProjectContent(row.projectId) : null;
  const updated = await deps.repo.respond(row.id, decision === "approve" ? "approved" : "declined", ip, approved);
  if (!updated) throw new CandidateConsentError("ALREADY_RESPONDED", "You already answered this request");
  if (decision === "decline") await deps.forceUnlisted(row.projectId);
  return updated;
}

/** Approve, decline or withdraw. The repository updates are conditional,
 *  so a double submit answers ALREADY_RESPONDED / NOT_APPROVED. */
export async function respondToConsent(
  token: string,
  decision: CandidateVideoConsentDecision,
  ip: string | null,
  deps: CandidateConsentDeps,
): Promise<PublicCandidateVideoConsent> {
  const row = await findByToken(token, deps);
  const updated = decision === "revoke"
    ? await withdrawApproval(row, deps)
    : await answerPending(row, decision, ip, deps);
  return toPublic(updated, deps);
}
