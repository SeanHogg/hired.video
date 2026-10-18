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
 *
 * The payload lives in the ISOLATE cache (one key per user — a KV write per
 * fill would burn the Workers Free quota), so invalidation clears this
 * isolate only; other isolates converge within the (short) read TTL.
 */

import { invalidateIsolateKey } from "../../utils/isolate-cache.js";

export const publicReferencesCacheKey = (userId: string): string => `refs:public:${userId}`;

export function invalidatePublicReferences(userId: string): void {
  invalidateIsolateKey(publicReferencesCacheKey(userId));
}
