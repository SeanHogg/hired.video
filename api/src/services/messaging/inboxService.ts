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
import type { ExternalEmailInboxRow } from "../../repositories/externalEmailMessagesRepository.js";
import { toUserActor, type UserActor } from "../user/userActor.js";

export type InboxServiceDeps = {
  repos: Pick<
    Repos,
    "users" | "notifications" | "conversations" | "externalEmailMessages"
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
  /** Always 0 until read receipts ship; kept on the shape so the
   *  frontend doesn't have to special-case the missing field. */
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
  isRead: boolean;
  receivedAt: string;
}

export interface InboxResponse {
  conversations: InboxConversationDto[];
  notifications: InboxNotificationDto[];
  pendingRequests: InboxConnectionRequestDto[];
  externalEmails: InboxExternalEmailDto[];
}

const MAX_CONVERSATIONS = 25;
const MAX_NOTIFICATIONS = 50;
const MAX_EXTERNAL_EMAILS = 50;

export async function getInboxFor(
  deps: InboxServiceDeps,
  userId: string,
): Promise<InboxResponse> {
  // Fan out the repo reads in parallel — they're independent and hitting
  // the DB pool, not the public API rate limiter. External-email read is
  // safe to include even with no integrations connected: the repo returns
  // an empty array when no rows exist.
  const [conversationRows, notificationRows, pendingRows, externalEmailRows] =
    await Promise.all([
      deps.repos.conversations.findConversationsForUser(userId),
      deps.repos.notifications.findNotificationsForUser(userId, MAX_NOTIFICATIONS),
      deps.repos.users.findConnectionsForUser(userId),
      deps.repos.externalEmailMessages.findRecentForUser(userId, MAX_EXTERNAL_EMAILS),
    ]);

  const conversations = await buildConversationDtos(deps, userId, conversationRows);
  const notifications = notificationRows.map(toNotificationDto);
  const pendingRequests = await buildPendingRequestDtos(deps, userId, pendingRows);
  const externalEmails = externalEmailRows.map(toExternalEmailDto);

  return { conversations, notifications, pendingRequests, externalEmails };
}

async function buildConversationDtos(
  deps: InboxServiceDeps,
  userId: string,
  rows: ConversationRow[],
): Promise<InboxConversationDto[]> {
  if (rows.length === 0) return [];
  const limited = rows.slice(0, MAX_CONVERSATIONS);
  const ids = limited.map((r) => r.id);

  // Batch the latest-message lookup and the participant lookup so the
  // whole inbox costs at most a handful of queries.
  const [latestMessages, participantsByConvo] = await Promise.all([
    deps.repos.conversations.findLatestMessagePerConversation(ids),
    loadParticipants(deps, ids),
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
      unreadCount: 0,
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

