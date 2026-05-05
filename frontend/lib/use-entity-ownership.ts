/**
 * useEntityOwnership — single-source-of-truth hook that decides whether
 * the authenticated viewer owns a given entity (resume, job, company,
 * profile, article, etc.).
 *
 * Cards and shared components (`<EntityVideos>`, action menus, owner-only
 * badges) all consume this hook so the same predicate isn't re-derived
 * with subtle drift in 5+ places. Anonymous viewers always come back
 * `isOwner: false` — the hook short-circuits before the userId compare.
 *
 * Resolution order:
 *   1. Explicit `ownership` from the API ("owned" | "tracked" | …) wins
 *      when present — backend-classified rows shouldn't be re-derived.
 *   2. Viewer must be authenticated; otherwise `isOwner: false`.
 *   3. `viewer.id === ownerUserId`.
 *   4. Any caller-supplied predicate returns true (e.g. company team
 *      membership where ownership extends past the single `userId`).
 *   5. Default `isOwner: false`.
 */

import { useAuth } from "@/lib/auth";

export type OwnershipClassification =
  | "owned"
  | "account_owned"
  | "tracked"
  | "connected"
  | "none";

export interface EntityOwnershipInput {
  /** The entity's owner user id — `resume.userId`, `job.userId`,
   *  `company.userId`, `person.id`, etc. Pass `undefined`/`null` when
   *  the entity has no single owner; the viewer will never be reported
   *  as owner in that case. */
  ownerUserId?: string | null;
  /** Optional explicit classification from the API (e.g.
   *  `ResumeWithOwnership.ownership`). When `"owned"` it short-circuits
   *  to `isOwner: true` without consulting auth — backend already did
   *  the work. Other values fall through to the auth comparison. */
  ownership?: OwnershipClassification;
  /** Extra owner predicates beyond the userId match — e.g. company
   *  team-member arrays, account-level ownership, delegated-subject
   *  membership. Each is invoked with the current viewer's user id;
   *  any `true` flips the viewer to owner. Skipped when the viewer is
   *  anonymous. */
  extraOwnerPredicates?: Array<(viewerUserId: string) => boolean>;
}

export interface EntityOwnership {
  isOwner: boolean;
  isTracked: boolean;
  isAuthenticated: boolean;
  viewerUserId: string | null;
}

export function useEntityOwnership({
  ownerUserId,
  ownership,
  extraOwnerPredicates,
}: EntityOwnershipInput): EntityOwnership {
  const { user } = useAuth();
  const viewerUserId = user?.id ?? null;
  const isAuthenticated = !!user;

  if (ownership === "owned" || ownership === "account_owned") {
    return { isOwner: true, isTracked: false, isAuthenticated, viewerUserId };
  }
  if (ownership === "tracked") {
    return { isOwner: false, isTracked: true, isAuthenticated, viewerUserId };
  }

  if (!isAuthenticated || !viewerUserId) {
    return { isOwner: false, isTracked: false, isAuthenticated, viewerUserId };
  }

  if (ownerUserId && ownerUserId === viewerUserId) {
    return { isOwner: true, isTracked: false, isAuthenticated, viewerUserId };
  }

  if (extraOwnerPredicates?.some((pred) => pred(viewerUserId))) {
    return { isOwner: true, isTracked: false, isAuthenticated, viewerUserId };
  }

  return { isOwner: false, isTracked: false, isAuthenticated, viewerUserId };
}
