/**
 * NotificationService — the one place that writes to the notifications
 * table. Routes never call `db.insert(notifications)` directly; they
 * call `emitNotification` so every notification ends up with the same
 * `data` shape and the actor lookup happens in one place.
 *
 * Stable `data` envelope:
 *   { actor: UserActor | null, target?: { id, type }, ...extraData }
 *
 * Frontends parse this once. Adding a new notification type — follow,
 * post-comment, like, message-received — does not require new
 * deserialisation logic; it just picks a new `type` discriminant and
 * supplies a title/message.
 *
 * Layering: this is a service, so it depends on `repos` via DI and
 * never touches Drizzle directly. The repo composes the user-actor
 * join; the service composes the notification insert.
 */

import type { Repos } from "../../repositories/index.js";
import { actorDisplayName, toUserActor, type UserActor } from "../user/userActor.js";

export type NotificationServiceDeps = { repos: Pick<Repos, "users" | "notifications"> };

/** Reference to the entity the notification is about. The frontend can
 *  use this to deep-link from the inbox to the relevant page. */
export interface NotificationTarget {
  id: string;
  type: string;
}

export interface EmitNotificationInput {
  /** Users to deliver to. The actor is filtered out automatically so a
   *  user never gets notified about their own actions. */
  recipientIds: string[];
  /** Discriminant the inbox uses to pick an icon and route accept/decline
   *  affordances. e.g. "connection_request", "feed_mention". */
  type: string;
  /** Pre-resolved actor (preferred when the route already loaded one).
   *  Pass null only if the actor genuinely is the system. */
  actor: UserActor | null;
  title: string;
  /** Defaults to `title` when omitted, since most notification types
   *  have nothing useful to add beyond the title. */
  message?: string;
  /** Optional reference to the entity that triggered the notification
   *  (connection id, post id, comment id, etc.). */
  target?: NotificationTarget;
  /** Anything else the frontend might want — kept open so unusual
   *  notification types don't have to extend the envelope. */
  extraData?: Record<string, unknown>;
}

/** Look up an actor and a display name in one shot. Use this when the
 *  caller hasn't already loaded the actor; otherwise build a `UserActor`
 *  yourself and pass it directly to `emitNotification`. */
export async function resolveActor(
  deps: NotificationServiceDeps,
  actorId: string,
): Promise<{ actor: UserActor | null; actorName: string }> {
  const [row] = await deps.repos.users.findActorsByIds([actorId]);
  const actor = row ? toUserActor(row) : null;
  return { actor, actorName: actorDisplayName(actor) };
}

/** Insert one notification row per recipient. Self-notifications are
 *  filtered (a user mentioning themselves gets nothing). */
export async function emitNotification(
  deps: NotificationServiceDeps,
  input: EmitNotificationInput,
): Promise<void> {
  const actorId = input.actor?.id;
  const recipients = Array.from(
    new Set(input.recipientIds.filter((id) => id && id !== actorId)),
  );
  if (recipients.length === 0) return;

  const data = {
    actor: input.actor,
    ...(input.target ? { target: input.target } : {}),
    ...(input.extraData ?? {}),
  };
  const message = input.message ?? input.title;

  await Promise.all(
    recipients.map((userId) =>
      deps.repos.notifications.insertNotification({
        userId,
        type: input.type,
        title: input.title,
        message,
        data: data as any,
      } as any),
    ),
  );
}
