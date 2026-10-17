/**
 * Descriptor-driven Pro gate for writing reviews. Mirrors requirePro's
 * admin bypass, but runs inline because whether a subject type charges to
 * write is decided by its descriptor (marketplace transactional reviews
 * gate on buyer status instead).
 */

import type { SubjectDescriptor } from "../../../../shared/reviews/subject-descriptors.js";
import { TIER_COPY, UPGRADE_URL } from "../../../../shared/tier-copy.js";
import { DomainError, requireUserId } from "../../domains/errors.js";
import { isAdminRole } from "../../middleware/superAdmin.js";
import { getSubscription } from "../billing/BillingService.js";
import type { JwtPayload } from "../../types/index.js";

/** 402 PRO_REQUIRED — rendered with `upgradeUrl` inside the error object
 *  (the stable envelope frontend hooks pattern-match on). */
export class ProRequiredError extends DomainError {
  readonly upgradeUrl = UPGRADE_URL;
  constructor(featureName: string) {
    super(402, "PRO_REQUIRED", TIER_COPY.proFeatureRequired(featureName));
    this.name = "ProRequiredError";
  }
}

/** No-op unless the descriptor requires Pro to write; then 401 for
 *  anonymous, pass for admins, 402 for non-Pro. */
export async function assertCanWriteReview(
  user: JwtPayload | null | undefined,
  descriptor: SubjectDescriptor,
): Promise<void> {
  if (!descriptor.requiresProToWrite) return;
  const uid = requireUserId(user?.sub);
  if (isAdminRole(user)) return;
  const sub = await getSubscription(uid);
  if (!sub.isPro) throw new ProRequiredError(`${descriptor.sectionTitle} for ${descriptor.noun}s`);
}
