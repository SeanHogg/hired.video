/**
 * Recruiter-side consent use cases: ask a candidate to approve their
 * candidate-for-job video, resend the ask, list a project's asks.
 *
 * Every one runs the studio write rule on the project first (owner, company
 * member or delegate — the same rule the studio routes use). Asking (and
 * re-asking) forces the project unlisted: a candidate video is never public
 * while an answer is outstanding.
 */
import type { CandidateVideoConsentRow, ConsentProjectOwner } from "../../repositories/candidateVideoConsentRepository.js";
import type {
  CandidateVideoConsent,
  RequestCandidateVideoConsentInput,
} from "../../../../shared/candidate-video-consent.js";
import {
  CandidateConsentError,
  consentExpiry,
  generateConsentToken,
  hashConsentToken,
  toConsentDto,
  type CandidateConsentDeps,
} from "./ports.js";
import { assertApproverEmailAllowed, resolveApproverEmail } from "./approver-email.js";
import { logger } from "../../lib/logger.js";

export interface ConsentActor {
  userId: string;
}

async function assertProjectWritable(
  actor: ConsentActor,
  projectId: string,
  deps: CandidateConsentDeps,
): Promise<ConsentProjectOwner> {
  const owner = await deps.repo.findProjectOwner(projectId);
  if (!owner) throw new CandidateConsentError("NOT_FOUND", "Project not found");
  if (!(await deps.canWrite(actor.userId, owner.userId, owner.companyId))) {
    throw new CandidateConsentError("FORBIDDEN", "You do not have permission to act on this workspace.");
  }
  return owner;
}

/** Email the raw token. Best-effort, like the screening invite: a failed
 *  send never rolls the row back — the recruiter can resend. */
async function emailConsentLink(row: CandidateVideoConsentRow, token: string, deps: CandidateConsentDeps): Promise<void> {
  try {
    const ctx = await deps.repo.loadPublicContext(row);
    await deps.sendEmail({
      to: row.candidateEmail,
      candidateName: row.candidateName,
      recruiterName: ctx.recruiterName ?? "A recruiter",
      jobTitle: ctx.jobTitle,
      companyName: ctx.companyName,
      message: row.message,
      token,
      expiresAt: new Date(row.expiresAt),
    });
  } catch (e) {
    logger.error("[candidate-consent] consent email failed", { consentId: row.id, error: (e as Error).message });
  }
}

export async function requestConsent(
  actor: ConsentActor,
  input: RequestCandidateVideoConsentInput,
  deps: CandidateConsentDeps,
): Promise<CandidateVideoConsent> {
  const owner = await assertProjectWritable(actor, input.projectId, deps);

  const poolId = input.talentPoolCandidateId ?? (await deps.repo.findCandidateSubjectId(input.projectId));
  const pool = poolId ? await deps.repo.findTalentPoolCandidate(poolId, actor.userId) : null;
  if (input.talentPoolCandidateId && !pool) {
    throw new CandidateConsentError("NOT_FOUND", "Candidate not found in your talent pool");
  }
  const candidateName = input.candidateName ?? pool?.candidateName?.trim();
  // The pool row's email is authoritative; a different typed one is refused.
  const candidateEmail = resolveApproverEmail(pool?.candidateEmail, input.candidateEmail);
  if (!candidateName || !candidateEmail) {
    throw new CandidateConsentError("VALIDATION", "The candidate's name and email are required");
  }
  assertApproverEmailAllowed(candidateEmail, await deps.repo.findRecruiterIdentity(actor.userId, owner.companyId));

  // A video about a pool candidate is bound to the gate from here on, and
  // stays unlisted until the candidate answers yes.
  if (pool) await deps.repo.linkCandidateSubject(input.projectId, pool.id);
  await deps.forceUnlisted(input.projectId);
  // One live ask per project: an earlier pending (or approved) link stops
  // working — the new ask is the one the candidate answers or withdraws.
  await deps.repo.supersedeForProject(input.projectId);

  const token = generateConsentToken();
  const now = deps.now();
  const row = await deps.repo.insert({
    projectId: input.projectId,
    recruiterId: actor.userId,
    talentPoolCandidateId: pool?.id ?? null,
    candidateName,
    candidateEmail,
    tokenHash: await hashConsentToken(token),
    status: "pending",
    message: input.message ?? null,
    requestedAt: now,
    expiresAt: consentExpiry(now),
  });
  await emailConsentLink(row, token, deps);
  return toConsentDto(row, now);
}

/** New token + new expiry, re-emailed. Only a pending or expired ask can be
 *  resent; an answered (or superseded) one needs a fresh request. */
export async function resendConsent(
  actor: ConsentActor,
  consentId: string,
  deps: CandidateConsentDeps,
): Promise<CandidateVideoConsent> {
  const existing = await deps.repo.findById(consentId);
  if (!existing) throw new CandidateConsentError("NOT_FOUND", "Consent request not found");
  await assertProjectWritable(actor, existing.projectId, deps);

  const token = generateConsentToken();
  const now = deps.now();
  const row = await deps.repo.reissue(existing.id, await hashConsentToken(token), consentExpiry(now));
  if (!row) throw new CandidateConsentError("NOT_RESENDABLE", "This request was already answered or replaced");
  await deps.forceUnlisted(row.projectId);
  await emailConsentLink(row, token, deps);
  return toConsentDto(row, now);
}

export async function listConsents(
  actor: ConsentActor,
  projectId: string,
  deps: CandidateConsentDeps,
): Promise<CandidateVideoConsent[]> {
  await assertProjectWritable(actor, projectId, deps);
  const now = deps.now();
  return (await deps.repo.listForProject(projectId)).map((row) => toConsentDto(row, now));
}
