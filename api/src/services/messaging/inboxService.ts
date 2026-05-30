/**
 * InboxService — single read-side aggregator for the Communication Hub
 * dropdown (the bell icon at the top of the app).
 *
 * The hub wants four streams in one render:
 *   1. recent direct/group conversations (with `lastMessage` for previews)
 *   2. system notifications
 *   3. pending incoming connection requests (with the actor populated)
 *   4. recent external-email messages from synced mailboxes (Gmail/Outlook)
 *
 * Without this aggregator, every poll fired separate authenticated
 * round-trips, each charged against the IP rate limiter (100 req/min).
 * On a busy session that produced 429s. One endpoint = one auth + one
 * limiter hit per refresh.
 *
 * The shape returned here is the single source of truth for the comm-hub
 * inbox feed; `useCommHub` parses it directly and never recombines
 * fields from elsewhere.
 */

import type { Repos } from "../../repositories/index.js";
import type { ConversationRow } from "../../repositories/conversationsRepository.js";
import type { NotificationRow } from "../../repositories/notificationsRepository.js";
import type {
  ExternalEmailInboxRow,
  FindInboxOptions,
} from "../../repositories/externalEmailMessagesRepository.js";
import type { ExternalEmailAccountRow } from "../../repositories/externalEmailAccountsRepository.js";
import { toUserActor, type UserActor } from "../user/userActor.js";

export type InboxServiceDeps = {
  repos: Pick<
    Repos,
    | "users"
    | "notifications"
    | "conversations"
    | "externalEmailMessages"
    | "externalEmailAccounts"
  >;
};

export interface InboxConversationDto {
  id: string;
  /** Display title — the other participant's name for direct threads,
   *  the conversation subject for groups. */
  title: string;
  type: string;
  participantCount: number;
  lastMessage?: {
    content: string;
    senderName: string;
    timestamp: string;
  };
  /** Unread message count for the viewer in this conversation (#531).
   *  Computed via LEFT JOIN against `message_read_receipts` so the
   *  inbox bell + per-row badge reflect real read state. */
  unreadCount: number;
  isArchived: boolean;
  isMuted: boolean;
}

export interface InboxNotificationDto {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  /** Free-form per-notification payload — used by typed rows (e.g. a
   *  `contact_inquiry` row carries `{ leadId, email, inquiryType, page }`
   *  so the inbox row can render status-transition buttons that PATCH
   *  `/api/marketing/leads/:id/status`). Null when the row was inserted
   *  without a JSONB payload. */
  data: Record<string, unknown> | null;
}

export interface InboxConnectionRequestDto {
  id: string;
  fromUserId: string;
  toUserId: string;
  message: string;
  createdAt: string;
  fromUser: UserActor | null;
}

export interface InboxExternalEmailDto {
  id: string;
  provider: string;                       // 'gmail' | 'outlook' (kept open for future providers)
  accountLabel: string;                   // user-chosen label or fallback to mailbox addr
  fromEmail: string;
  fromName: string | null;
  subject: string | null;
  snippet: string | null;
  /** Filled by the classifier (P2). Null until then. */
  category: string | null;
  /** 0–1 confidence. Null until classifier runs. */
  score: number | null;
  /** AI-generated summary (P2). Null until then. */
  summary: string | null;
  /** Set by dedup (P3) when this email is bound to a job the candidate
   *  applied to or follows. */
  linkedJobId: string | null;
  /** Title of the linked job — joined in the repo so the inbox row can
   *  render `→ Senior Engineer at Acme` without a second round-trip
   *  (#539). Null when `linkedJobId` is null or the job was deleted. */
  linkedJobTitle: string | null;
  /** Company name on the linked job (denormalised text — `jobItems.company`).
   *  Pairs with `linkedJobTitle` so the inbox row reads
   *  `<title> at <company>` even when the candidate left the company. */
  linkedJobCompany: string | null;
  isRead: boolean;
  receivedAt: string;
}

export interface InboxAccountDto {
  id: string;
  provider: string;
  accountEmail: string;
  accountLabel: string | null;
  status: string;
  minJobScore: number;
  lastSyncedAt: string | null;
  /** Last refresh / sync error from the account row — present whenever
   *  `status === "error"`. The Inbox tab uses this to render an inline
   *  "Reconnect <provider>" banner instead of a red global toast when
   *  Google/Microsoft revokes the refresh token. */
  lastError: string | null;
}

export interface InboxResponse {
  conversations: InboxConversationDto[];
  notifications: InboxNotificationDto[];
  pendingRequests: InboxConnectionRequestDto[];
  externalEmails: InboxExternalEmailDto[];
  /** Mailboxes connected to the user — surfaced for the filter dropdown
   *  on the Outreach Inbox tab so the client can render account chips
   *  without a second round-trip. */
  accounts: InboxAccountDto[];
  /** Opaque cursor for the next page of the email stream — null when
   *  the current chunk reached the end. Encoded `<receivedAtIso>__<id>`
   *  so the route + client never need to handle the tuple themselves. */
  nextEmailCursor: string | null;
}

const MAX_CONVERSATIONS = 25;
const MAX_NOTIFICATIONS = 50;
const MAX_EXTERNAL_EMAILS = 50;

const EMAIL_CURSOR_SEPARATOR = "__";

/** Round-trip the (receivedAt, id) anchor through one opaque string so
 *  callers don't need to know its shape. ISO timestamps never contain
 *  underscores and UUIDs never contain them either, so a `__` split is
 *  unambiguous. */
export function encodeEmailCursor(receivedAt: string, id: string): string {
  return `${receivedAt}${EMAIL_CURSOR_SEPARATOR}${id}`;
}

export function decodeEmailCursor(
  raw: string | null | undefined,
): { receivedAt: string; id: string } | undefined {
  if (!raw) return undefined;
  const idx = raw.indexOf(EMAIL_CURSOR_SEPARATOR);
  if (idx <= 0 || idx === raw.length - EMAIL_CURSOR_SEPARATOR.length) return undefined;
  const receivedAt = raw.slice(0, idx);
  const id = raw.slice(idx + EMAIL_CURSOR_SEPARATOR.length);
  if (!receivedAt || !id) return undefined;
  return { receivedAt, id };
}

export async function getInboxFor(
  deps: InboxServiceDeps,
  userId: string,
  emailOpts: FindInboxOptions = {},
): Promise<InboxResponse> {
  // Pull `limit + 1` rows so we can tell whether another page exists
  // without an extra COUNT — if N+1 came back the (N+1)-th row's
  // (receivedAt, id) becomes the next-page cursor anchor.
  const emailLimit = emailOpts.limit ?? MAX_EXTERNAL_EMAILS;
  // Fan out the repo reads in parallel — they're independent and hitting
  // the DB pool, not the public API rate limiter. External-email read is
  // safe to include even with no integrations connected: the repo returns
  // an empty array when no rows exist.
  const [
    conversationRows,
    notificationRows,
    pendingRows,
    externalEmailRows,
    accountRows,
  ] = await Promise.all([
    deps.repos.conversations.findConversationsForUser(userId),
    deps.repos.notifications.findNotificationsForUser(userId, MAX_NOTIFICATIONS),
    deps.repos.users.findConnectionsForUser(userId),
    deps.repos.externalEmailMessages.findInboxForUser(userId, {
      ...emailOpts,
      limit: emailLimit + 1,
    }),
    deps.repos.externalEmailAccounts.findAllForUser(userId),
  ]);

  const hasMoreEmails = externalEmailRows.length > emailLimit;
  const emailPage = hasMoreEmails
    ? externalEmailRows.slice(0, emailLimit)
    : externalEmailRows;

  const conversations = await buildConversationDtos(deps, userId, conversationRows);
  const notifications = notificationRows.map(toNotificationDto);
  const pendingRequests = await buildPendingRequestDtos(deps, userId, pendingRows);
  const externalEmails = emailPage.map(toExternalEmailDto);
  const accounts = accountRows.map(toAccountDto);

  const lastEmail = emailPage[emailPage.length - 1];
  const nextEmailCursor =
    hasMoreEmails && lastEmail
      ? encodeEmailCursor(
          lastEmail.receivedAt instanceof Date
            ? lastEmail.receivedAt.toISOString()
            : new Date(lastEmail.receivedAt).toISOString(),
          lastEmail.id,
        )
      : null;

  return {
    conversations,
    notifications,
    pendingRequests,
    externalEmails,
    accounts,
    nextEmailCursor,
  };
}

function toAccountDto(row: ExternalEmailAccountRow): InboxAccountDto {
  return {
    id: row.id,
    provider: row.provider,
    accountEmail: row.accountEmail,
    accountLabel: row.accountLabel,
    status: row.status,
    minJobScore: Number(row.minJobScore ?? "0.5"),
    lastSyncedAt: row.lastSyncedAt ? new Date(row.lastSyncedAt).toISOString() : null,
    lastError: row.lastError ?? null,
  };
}

async function buildConversationDtos(
  deps: InboxServiceDeps,
  userId: string,
  rows: ConversationRow[],
): Promise<InboxConversationDto[]> {
  if (rows.length === 0) return [];
  const limited = rows.slice(0, MAX_CONVERSATIONS);
  const ids = limited.map((r) => r.id);

  // Batch the latest-message lookup, the participant lookup, and the
  // unread-count lookup (#531) so the whole inbox costs at most a handful
  // of queries.
  const [latestMessages, participantsByConvo, unreadByConvo] = await Promise.all([
    deps.repos.conversations.findLatestMessagePerConversation(ids),
    loadParticipants(deps, ids),
    deps.repos.conversations.countUnreadPerConversation(userId, ids),
  ]);
  const lastByConvo = new Map(latestMessages.map((m) => [m.conversationId, m]));

  // Resolve sender names for the lastMessage previews + the "other party"
  // names used as direct-thread titles. One actor batch covers both.
  const actorIds = new Set<string>();
  for (const m of latestMessages) actorIds.add(m.senderId);
  for (const ids of participantsByConvo.values()) {
    for (const id of ids) if (id !== userId) actorIds.add(id);
  }
  const actors = await deps.repos.users.findActorsByIds([...actorIds]);
  const actorById = new Map(actors.map((a) => [a.id, toUserActor(a)]));

  return limited.map((row) => {
    const participantIds = participantsByConvo.get(row.id) ?? [];
    const otherIds = participantIds.filter((id) => id !== userId);
    const directOther = row.type === "direct" && otherIds.length === 1 ? actorById.get(otherIds[0]) : null;
    const title = directOther
      ? [directOther.firstName, directOther.lastName].filter(Boolean).join(" ").trim() || directOther.email
      : row.subject ?? "Conversation";

    const last = lastByConvo.get(row.id);
    const lastMessage = last
      ? {
          content: last.content,
          senderName: senderNameFor(actorById.get(last.senderId)),
          timestamp: new Date(last.createdAt).toISOString(),
        }
      : undefined;

    return {
      id: row.id,
      title,
      type: row.type,
      participantCount: participantIds.length,
      lastMessage,
      unreadCount: unreadByConvo.get(row.id) ?? 0,
      isArchived: row.isArchived,
      isMuted: false,
    };
  });
}

async function loadParticipants(
  deps: InboxServiceDeps,
  conversationIds: string[],
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  // The repo doesn't expose a batch lookup yet — the per-conversation
  // call is fine while inbox conversations are bounded to MAX_CONVERSATIONS.
  await Promise.all(
    conversationIds.map(async (id) => {
      const ids = await deps.repos.conversations.findParticipantUserIds(id);
      result.set(id, ids);
    }),
  );
  return result;
}

function senderNameFor(actor: UserActor | undefined): string {
  if (!actor) return "Someone";
  return [actor.firstName, actor.lastName].filter(Boolean).join(" ").trim() || actor.email || "Someone";
}

function toNotificationDto(row: NotificationRow): InboxNotificationDto {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    isRead: row.isRead,
    createdAt: new Date(row.createdAt).toISOString(),
    data: (row.data as Record<string, unknown> | null) ?? null,
  };
}

function toExternalEmailDto(row: ExternalEmailInboxRow): InboxExternalEmailDto {
  // Drizzle numeric columns surface as strings; coerce here so the wire
  // shape stays a real JSON number for the frontend.
  const score =
    row.score == null
      ? null
      : typeof row.score === "number"
        ? row.score
        : Number(row.score);
  return {
    id: row.id,
    provider: row.provider,
    accountLabel: row.accountLabel?.trim() || row.accountEmail,
    fromEmail: row.fromEmail,
    fromName: row.fromName,
    subject: row.subject,
    snippet: row.snippet,
    category: row.category,
    score: Number.isFinite(score as number) ? (score as number) : null,
    summary: row.summary,
    linkedJobId: row.linkedJobId,
    linkedJobTitle: row.linkedJobTitle ?? null,
    linkedJobCompany: row.linkedJobCompany ?? null,
    isRead: row.isRead,
    receivedAt: new Date(row.receivedAt).toISOString(),
  };
}

async function buildPendingRequestDtos(
  deps: InboxServiceDeps,
  userId: string,
  rows: { id: string; fromUserId: string; toUserId: string; status: string; requestMessage: string | null; createdAt: Date | string }[],
): Promise<InboxConnectionRequestDto[]> {
  const incoming = rows.filter((r) => r.toUserId === userId && (r.status ?? "").toLowerCase() === "pending");
  if (incoming.length === 0) return [];
  const senderIds = [...new Set(incoming.map((r) => r.fromUserId))];
  const actors = await deps.repos.users.findActorsByIds(senderIds);
  const actorById = new Map(actors.map((a) => [a.id, toUserActor(a)]));
  return incoming.map((r) => ({
    id: r.id,
    fromUserId: r.fromUserId,
    toUserId: r.toUserId,
    message: r.requestMessage ?? "",
    createdAt: new Date(r.createdAt).toISOString(),
    fromUser: actorById.get(r.fromUserId) ?? null,
  }));
}

