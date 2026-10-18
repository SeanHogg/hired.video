/**
 * Cache key + invalidation for the public (non-PII) reference summary list
 * served by `GET /api/references/public/:userId` (#1677).
 *
 * The cached payload depends on (a) the owner's reference contacts, (b) the
 * owner's `references` profile-section visibility and (c) the owner's role
 * (role-keyed visibility defaults). EVERY write to any of those must call
 * `invalidatePublicReferences(userId)` — otherwise a hidden section keeps
 * leaking summaries until the TTL lapses:
 *   - contact create / update / delete  (services/references/referenceService.ts)
 *   - profileSections update            (routes/users.ts PUT /me)
 *   - role flips                        (services/user/account.ts)
 */

import { invalidateCachedKey } from "../../utils/edge-cache.js";

export const publicReferencesCacheKey = (userId: string): string => `refs:public:${userId}`;

export function invalidatePublicReferences(userId: string): void {
  invalidateCachedKey(publicReferencesCacheKey(userId));
}
