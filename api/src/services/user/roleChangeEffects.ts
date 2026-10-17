/**
 * Role-change cache effects — the ONE place that lists every cache keyed on
 * a user's role, so each role write path (self-serve PUT /api/users/me,
 * account admin role change, invite accept, SuperAdmin role assignment)
 * busts the same set:
 *
 *   • effective plan (`plan:{userId}`) — role is a resolver input;
 *   • public references summary — role-keyed profile-section defaults;
 *   • pitch caches (partner payload) — the pitch rides the role-keyed
 *     "videoResume" section default (#2391), so a role flip can show or hide
 *     it without any stored override changing.
 *
 * Best-effort: the pitch bust reads the user's partner connections and
 * touches KV, and must never fail the role change itself.
 */

import { invalidateSubscriptionCache } from "../billing/BillingService.js";
import { invalidatePublicReferences } from "../profile/public-references-cache.js";
import { invalidatePitchCaches } from "../pitch/pitchService.js";
import { invalidatePartnerProfilesForUser } from "../partner/connections.js";
import type { getDb } from "../../db/index.js";
import { logger } from "../../lib/logger.js";

export interface RoleChangeCacheBusters {
  subscription: (userId: string) => void;
  publicReferences: (userId: string) => void;
  pitch: (userId: string) => Promise<void>;
}

/** Production wiring. `db` routes the pitch bust's connection lookup
 *  through the caller's handle (services that take an injected db). */
export function defaultRoleChangeCacheBusters(db?: ReturnType<typeof getDb>): RoleChangeCacheBusters {
  return {
    subscription: invalidateSubscriptionCache,
    publicReferences: invalidatePublicReferences,
    // An undefined `db` falls back to the helper's own getDb() default.
    pitch: (userId) => invalidatePitchCaches(userId, (id) => invalidatePartnerProfilesForUser(id, db)),
  };
}

export async function onUserRoleChanged(
  userId: string,
  busters: RoleChangeCacheBusters = defaultRoleChangeCacheBusters(),
): Promise<void> {
  busters.subscription(userId);
  busters.publicReferences(userId);
  await busters.pitch(userId).catch((err) =>
    logger.warn("[role-change] pitch cache invalidation failed", err),
  );
}
