/**
 * Entity ownership — single source of truth for "does this viewer own
 * this entity?" across every card, page, and feed surface.
 *
 * Two entry points wrap one pure predicate:
 *
 *   • `deriveEntityOwnership({ itemUserId, viewerUserId, ownership })` —
 *     pure function. Used by card normalizers (no React context) and any
 *     other non-hook caller.
 *
 *   • `useEntityOwnership({ ownerUserId, ownership })` — React hook that
 *     reads the auth viewer and forwards to `deriveEntityOwnership`. Used
 *     by every card and `<EntityMedia>` so action menus, edit chips, and
 *     analytics rows agree on a single classification.
 *
 * Resolution order (in `deriveEntityOwnership`):
 *   1. Explicit `ownership` from the API ("owned" / "account_owned" /
 *      "tracked" / "connected") wins — backend-classified rows shouldn't
 *      be re-derived.
 *   2. Anonymous viewer (no viewerUserId) → never owner.
 *   3. `viewerUserId === itemUserId` → owner.
 *   4. Any caller-supplied predicate returns true (e.g. company team
 *      membership where ownership extends past the single `userId`) →
 *      owner.
 *   5. Default → not owner, not tracked.
 *
 * SuperAdmin gets no admin-override. SA acts as a regular user on every
 * entity surface; to manage someone else's content they impersonate,
 * which swaps the auth viewerUserId to the target's so the userId-match
 * path (rule 3) lights up naturally.
 */

import { useAuth } from "@/lib/auth";

export type OwnershipClassification =
  | "owned"
  | "account_owned"
  | "tracked"
  | "connected"
  | "none";

export interface DeriveOwnershipInput {
  /** The entity's owner user id — `resume.userId`, `job.userId`,
   *  `company.userId`, `person.id`, etc. */
  itemUserId?: string | null;
  /** The viewer's user id — pulled from auth in the hook, or from the
   *  card-renderer context in pure call sites. `null`/`undefined` is
   *  treated as anonymous. */
  viewerUserId?: string | null;
  /** Optional explicit classification from the API. When `"owned"` /
   *  `"account_owned"` it short-circuits to owner without consulting
   *  the userId. */
  ownership?: OwnershipClassification;
  /** Extra owner predicates beyond the userId match — e.g. company
   *  team-member arrays, account-level ownership, delegated subjects.
   *  Each is invoked with the current viewer's user id; any `true`
   *  flips the viewer to owner. Skipped when anonymous. */
  extraOwnerPredicates?: Array<(viewerUserId: string) => boolean>;
}

export interface DeriveOwnershipResult {
  isOwner: boolean;
  isTracked: boolean;
  /** Final classification — useful when callers need to round-trip the
   *  category back into a normalized payload (e.g. card normalizers). */
  classification: OwnershipClassification;
}

export function deriveEntityOwnership({
  itemUserId,
  viewerUserId,
  ownership,
  extraOwnerPredicates,
}: DeriveOwnershipInput): DeriveOwnershipResult {
  if (ownership === "owned" || ownership === "account_owned") {
    return { isOwner: true, isTracked: false, classification: ownership };
  }
  if (ownership === "tracked") {
    return { isOwner: false, isTracked: true, classification: "tracked" };
  }
  if (ownership === "connected") {
    return { isOwner: false, isTracked: false, classification: "connected" };
  }

  if (!viewerUserId) {
    return { isOwner: false, isTracked: false, classification: "none" };
  }

  if (itemUserId && itemUserId === viewerUserId) {
    return { isOwner: true, isTracked: false, classification: "owned" };
  }

  if (extraOwnerPredicates?.some((pred) => pred(viewerUserId))) {
    return { isOwner: true, isTracked: false, classification: "owned" };
  }

  return { isOwner: false, isTracked: false, classification: "none" };
}

export interface EntityOwnershipInput {
  /** The entity's owner user id. */
  ownerUserId?: string | null;
  /** Optional explicit classification from the API. */
  ownership?: OwnershipClassification;
  /** Extra owner predicates (team membership etc.). */
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

  const { isOwner, isTracked } = deriveEntityOwnership({
    itemUserId: ownerUserId,
    viewerUserId,
    ownership,
    extraOwnerPredicates,
  });

  return { isOwner, isTracked, isAuthenticated, viewerUserId };
}
