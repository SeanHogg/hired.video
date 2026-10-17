/**
 * Candidate-résumé share use cases (agency recruiting, gap #99): tokenized
 * branded + redacted share links, and the unauthenticated reviewer view
 * that applies redaction + brand overlay at render time.
 */
import { DomainError } from "../../domains/errors.js";
import * as repo from "../../repositories/candidateResumeSharesRepository.js";
import type { CandidateResumeShareRow } from "../../repositories/candidateResumeSharesRepository.js";
import { findCandidateResumeById } from "../../repositories/candidateResumesRepository.js";
import { findRedactionProfileById } from "../../repositories/redactionProfilesRepository.js";
import { findPublicBrand } from "../../repositories/recruitBrandingRepository.js";
import { getVisiblePitch, pitchAllowedUnderRedaction } from "../pitch/pitchService.js";
import { applyRedaction } from "../resume/redaction.js";
import { randomHex } from "../../utils/crypto.js";
import { assertCompanyAccess, isShareLive, notFound, requireCompanyRow, rulesFromProfile } from "./access.js";
import { resolveCompanyScope } from "../company/scope.js";
import type { CreateShareInput, UpdateShareInput } from "./schemas.js";

const NOT_FOUND = "Share not found";

/** Shares across the caller's companies (optionally one résumé's). */
export async function listCandidateResumeShares(
  userId: string,
  query: { companyId?: string; candidateResumeId?: string },
): Promise<CandidateResumeShareRow[]> {
  // The companyId query only picks the primary company; the list always
  // spans the caller's whole scope.
  const scope = await resolveCompanyScope(userId, query.companyId);
  if (scope.companyIds.length === 0) return [];
  return repo.listCandidateResumeShares({
    companyIds: scope.companyIds,
    candidateResumeId: query.candidateResumeId,
  });
}

export async function createCandidateResumeShare(
  userId: string,
  input: CreateShareInput,
): Promise<CandidateResumeShareRow> {
  await assertCompanyAccess(userId, input.companyId);

  const resume = await findCandidateResumeById(input.candidateResumeId);
  if (!resume || resume.companyId !== input.companyId) {
    throw new DomainError(400, "VALIDATION_ERROR", "candidateResumeId does not belong to this company");
  }

  return repo.insertCandidateResumeShare({
    companyId: input.companyId,
    candidateResumeId: input.candidateResumeId,
    redactionProfileId: input.redactionProfileId ?? null,
    whitelabelTenantId: input.whitelabelTenantId ?? null,
    sharedByUserId: userId,
    shareToken: randomHex(16), // 32-char hex, fits varchar(64).
    name: input.name ?? null,
    recipientEmail: input.recipientEmail ?? null,
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
  });
}

export async function updateCandidateResumeShare(
  userId: string,
  id: string,
  input: UpdateShareInput,
): Promise<CandidateResumeShareRow | null> {
  await requireCompanyRow(userId, await repo.findCandidateResumeShareById(id), NOT_FOUND);
  return repo.updateCandidateResumeShare(id, {
    ...(input.name !== undefined && { name: input.name }),
    ...(input.recipientEmail !== undefined && { recipientEmail: input.recipientEmail }),
    ...(input.expiresAt !== undefined && {
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    }),
    ...(input.isActive !== undefined && { isActive: input.isActive }),
  });
}

export async function revokeCandidateResumeShare(userId: string, id: string): Promise<{ revoked: true }> {
  await requireCompanyRow(userId, await repo.findCandidateResumeShareById(id), NOT_FOUND);
  await repo.deleteCandidateResumeShare(id);
  return { revoked: true };
}

/**
 * GET /api/public/candidate-resume/:token — the redacted résumé + brand
 * overlay. Fails closed: expired, inactive or missing shares are all the
 * same 404 (never leak whether a token once existed). Every read bumps the
 * view counter fire-and-forget.
 */
export async function viewSharedCandidateResume(token: string) {
  if (!token) throw notFound(NOT_FOUND);
  const share = await repo.findCandidateResumeShareByToken(token);
  if (!share || !isShareLive(share)) throw notFound(NOT_FOUND);

  const [candidateResume, profile, brand] = await Promise.all([
    findCandidateResumeById(share.candidateResumeId),
    share.redactionProfileId ? findRedactionProfileById(share.redactionProfileId) : Promise.resolve(null),
    findPublicBrand(share.whitelabelTenantId),
  ]);
  if (!candidateResume) throw notFound(NOT_FOUND);

  const rules = rulesFromProfile(profile);
  const content = applyRedaction(candidateResume.content, rules);
  // #2133 — the candidate's current video pitch, only when the share's
  // redaction leaves their identity visible (a pitch shows face + voice)
  // and the candidate hasn't hidden their "videoResume" section (#2391).
  const pitch = candidateResume.linkedUserId && pitchAllowedUnderRedaction(rules)
    ? await getVisiblePitch(candidateResume.linkedUserId)
    : null;

  repo.recordCandidateResumeShareView(share.id).catch(() => {});

  return {
    share: { id: share.id, name: share.name, createdAt: share.createdAt },
    brand,
    content,
    pitch,
  };
}
