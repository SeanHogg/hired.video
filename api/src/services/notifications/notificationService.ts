/**
 * The single notification dispatcher. Every notification — system-
 * originated (badge / points / certificate / service-inquiry) and
 * actor-originated (connection request / mention / new message /
 * moderation) — flows through `emitNotification`, which:
 *
 *   1. PERSISTS one durable row per recipient in the `notifications`
 *      table (the bell/inbox history — always written), and
 *   2. fans out a preference-gated Web Push to each recipient
 *      (`isChannelAllowed(prefs, "push", type)`; gap #254 + #2098).
 *
 * Stable `data` envelope:
 *   { actor: UserActor | null, target?: { id, type }, url?, ...extraData }
 * The frontend bell parses this once (e.g. `data.url` deep-links on
 * click — CommunicationHub.tsx); a new notification type just picks a new
 * `type` discriminant and supplies a title/message.
 *
 * `NotificationService.notify` is the thin single-recipient,
 * system-actor convenience wrapper for callers that don't carry `repos`
 * (gamification, learning, services) — it builds repos from the global
 * db and delegates here, so there is exactly ONE persist+push+gate
 * implementation. (Consolidated 2026-06-14 — previously a second
 * persist-only path in notification-service.ts never pushed.)
 *
 * Layering: this is a service, so it depends on `repos` via DI for the
 * write. The preference read + push transport are global best-effort
 * side-channels (cached + VAPID), independent of the injected repos.
 */

import type { Repos } from "../../repositories/index.js";
import { buildRepos } from "../../repositories/index.js";
import { getDb } from "../../db/index.js";
import { actorDisplayName, toUserActor, type UserActor } from "../user/userActor.js";
import { isPushConfigured, sendPushToSubscriptions } from "../push/web-push.js";
import {
  PushSubscriptionsRepository,
  type PushSubscriptionRow,
} from "../../repositories/pushSubscriptionsRepository.js";
import { getEmailProvider } from "../adapters/email/transport.js";
import { buildNotificationEmail } from "../adapters/email/templates/notifications.js";
import { isChannelAllowed } from "../../../../shared/notification-preferences.js";
import { loadNotificationPreferences } from "./preferences.js";
import type { NotificationInsert } from "../../repositories/notificationsRepository.js";

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
   *  affordances, AND the key the push gate maps to a preference category
   *  (see categoryForNotificationType). e.g. "connection_request",
   *  "feed_mention", "message_received". */
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
  /** Deep link opened on click (stored at `data.url`) and used as the
   *  push notification's url. */
  url?: string;
  /** Anything else the frontend might want — kept open so unusual
   *  notification types don't have to extend the envelope. */
  extraData?: Record<string, unknown>;
  /** Set false to persist the bell row(s) only, with no push fan-out.
   *  Default true. */
  push?: boolean;
  /** Set true to ALSO send a transactional email (opt-in — most
   *  notifications are bell+push only, so email defaults OFF to avoid
   *  inbox spam). Still pref-gated on the recipient's email toggle. */
  email?: boolean;
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

/**
 * Fan the OUTBOUND channels (push + optional email) out to each recipient,
 * gated by that recipient's notification preferences. One prefs load per
 * recipient gates both channels (no double lookup). Best-effort: a
 * prefs-lookup failure errs toward sending (a cache/DB hiccup never
 * silently swallows a notification), and a transport failure is swallowed
 * (the durable bell row already landed).
 */
async function fanOutChannels(
  deps: NotificationServiceDeps,
  recipients: string[],
  opts: {
    type: string;
    title: string;
    message: string;
    url: string | undefined;
    push: boolean;
    email: boolean;
  },
): Promise<void> {
  // Resolve recipient emails once (single query, no N+1) only when email
  // is opted in AND a provider is actually configured.
  const emailProvider = opts.email ? getEmailProvider() : null;
  const emailById = new Map<string, string>();
  if (emailProvider) {
    for (const row of await deps.repos.users.findManyByIds(recipients)) {
      if (row.email) emailById.set(row.id, row.email);
    }
  }

  // Batch-load every recipient's push subscriptions in ONE query (was one
  // subscription query per recipient inside sendPushToUser). Skipped when
  // push is off or VAPID isn't configured. A load failure degrades to "no
  // push" — the durable bell row already landed.
  const pushRepo = opts.push && isPushConfigured()
    ? new PushSubscriptionsRepository(getDb())
    : null;
  const subsByUser: Map<string, PushSubscriptionRow[]> = pushRepo
    ? await pushRepo.listForUsers(recipients).catch(() => new Map<string, PushSubscriptionRow[]>())
    : new Map<string, PushSubscriptionRow[]>();

  await Promise.all(
    recipients.map(async (userId) => {
      let prefs: Awaited<ReturnType<typeof loadNotificationPreferences>> | null = null;
      try {
        prefs = await loadNotificationPreferences(userId);
      } catch {
        prefs = null; // err toward sending
      }

      const subs = subsByUser.get(userId);
      if (pushRepo && subs?.length && (!prefs || isChannelAllowed(prefs, "push", opts.type))) {
        await sendPushToSubscriptions(subs, {
          title: opts.title,
          body: opts.message,
          url: opts.url,
        }, pushRepo).catch(() => undefined);
      }

      if (emailProvider && (!prefs || isChannelAllowed(prefs, "email", opts.type))) {
        const to = emailById.get(userId);
        if (to) {
          const { subject, html } = buildNotificationEmail({
            title: opts.title,
            message: opts.message,
            url: opts.url,
          });
          await emailProvider.send({ to, subject, html }).catch(() => undefined);
        }
      }
    }),
  );
}

/** Resolve an input to its de-duplicated, actor-filtered recipients + the
 *  stable `data` envelope. Shared by the single and batch emitters. */
function prepareEmit(input: EmitNotificationInput) {
  const actorId = input.actor?.id;
  const recipients = Array.from(
    new Set(input.recipientIds.filter((id) => id && id !== actorId)),
  );
  const data: Record<string, unknown> = {
    actor: input.actor,
    ...(input.target ? { target: input.target } : {}),
    ...(input.url ? { url: input.url } : {}),
    ...(input.extraData ?? {}),
  };
  const message = input.message ?? input.title;
  return { recipients, data, message };
}

/**
 * Persist one notification row per recipient (single bulk write — no
 * N+1) and fan out the preference-gated push. Self-notifications are
 * filtered (a user mentioning themselves gets nothing).
 */
export async function emitNotification(
  deps: NotificationServiceDeps,
  input: EmitNotificationInput,
): Promise<void> {
  await emitNotifications(deps, [input]);
}

/**
 * Batch form of `emitNotification` for callers that produce several
 * DIFFERENT notifications at once (e.g. the inbox action engine — one
 * per matched email). Every row across every input lands in ONE
 * multi-row insert; each input then fans out over its own channels.
 */
export async function emitNotifications(
  deps: NotificationServiceDeps,
  inputs: EmitNotificationInput[],
): Promise<void> {
  const prepared = inputs
    .map((input) => ({ input, ...prepareEmit(input) }))
    .filter((p) => p.recipients.length > 0);
  if (prepared.length === 0) return;

  const rows: NotificationInsert[] = prepared.flatMap((p) =>
    p.recipients.map((userId) => ({
      userId,
      type: p.input.type,
      title: p.input.title,
      message: p.message,
      data: p.data,
    })),
  );
  await deps.repos.notifications.insertNotifications(rows);

  for (const p of prepared) {
    if (p.input.push === false && p.input.email !== true) continue;
    await fanOutChannels(deps, p.recipients, {
      type: p.input.type,
      title: p.input.title,
      message: p.message,
      url: p.input.url,
      push: p.input.push !== false,
      email: p.input.email === true,
    });
  }
}

// ---------------------------------------------------------------------------
// Single-recipient, system-actor convenience wrapper
// ---------------------------------------------------------------------------

export type NotificationType =
  | "badge"
  | "points"
  | "course"
  | "assignment"
  | "certificate"
  | "service_inquiry"
  | "review"
  | "system";

export interface NotifyInput {
  userId: string;
  /** Maps to notifications.type — drives icon + smart-feed weighting +
   *  the push preference category. */
  type: NotificationType;
  title: string;
  /** Maps to notifications.message (defaults to title). */
  message?: string;
  /** Deep link opened on click. Stored in notifications.data.url. */
  url?: string;
  /** Optional source entity, stashed in notifications.data for "view source". */
  refType?: string;
  refId?: string;
  /** Set false to persist only (no Web Push). Default true. */
  push?: boolean;
  /** Set true to ALSO send a transactional email (opt-in, pref-gated). */
  email?: boolean;
}

export const NotificationService = {
  /** Persist a single system notification in the canonical `notifications`
   *  table + push it, honouring the recipient's push preferences. Best-
   *  effort: a failure never blocks the action that triggered it. */
  async notify(input: NotifyInput): Promise<void> {
    try {
      const extraData: Record<string, unknown> = {};
      if (input.refType) extraData.refType = input.refType;
      if (input.refId) extraData.refId = input.refId;
      await emitNotification(
        { repos: buildRepos(getDb()) },
        {
          recipientIds: [input.userId],
          type: input.type,
          actor: null,
          title: input.title.slice(0, 255),
          message: input.message,
          url: input.url,
          extraData,
          push: input.push,
          email: input.email,
        },
      );
    } catch {
      // Never let a notification hiccup take down the triggering action.
    }
  },
};
