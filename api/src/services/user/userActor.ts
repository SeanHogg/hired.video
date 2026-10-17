/**
 * UserActor — the canonical "who triggered this" shape.
 *
 * Every cross-user surface (notifications, mentions, comments, follows,
 * connection requests, message threads) needs the same minimal projection
 * of a user: id, display name, avatar, slug. This is that shape, and
 * `toUserActor` is the one place that constructs it.
 *
 * Why it lives here and not on each route file: three of those routes
 * already had their own ad-hoc `name.split(" ")` + avatar-cdn-url logic.
 * Each new notification type would have added a fourth.
 *
 * Repository contract: `IUsersRepository.findActorsByIds` returns the
 * `UserActorRow` shape. Routes/services convert via `toUserActor` and
 * never split names by hand.
 */

import { cdnUrl } from "../../utils/cdn.js";
import type { UserActorRow } from "../../repositories/usersRepository.js";
// users.name → first/last lives in shared/person-name.ts (one splitter for
// actors, public cards, profile DTOs, People-Ops and enrichment).
import { splitPersonName } from "../../../../shared/person-name.js";

/** The DTO that gets serialised into notification.data, comment authors,
 *  connection.fromUser, etc. Frontends parse exactly this shape. */
export interface UserActor {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  /** Resolved CDN URL or null if the user hasn't uploaded an avatar. */
  profilePicture: string | null;
  /** Vanity slug, falling back to the user id so links never 404. */
  slug: string;
}

export function toUserActor(row: UserActorRow): UserActor {
  const { firstName, lastName } = splitPersonName(row.name);
  return {
    id: row.id,
    email: row.email ?? "",
    firstName,
    lastName,
    profilePicture: row.avatarUrl ? cdnUrl(row.avatarUrl) : null,
    slug: row.customUrlSlug ?? row.id,
  };
}

/** Convenience: render a display name for inline strings like
 *  `${actorName} wants to connect`. Falls back to "Someone" so titles
 *  are never blank. */
export function actorDisplayName(actor: UserActor | null | undefined): string {
  if (!actor) return "Someone";
  const full = [actor.firstName, actor.lastName].filter(Boolean).join(" ").trim();
  return full || actor.email || "Someone";
}
