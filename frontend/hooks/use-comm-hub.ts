/**
 * useCommHub — single source of truth for the unified Communication Hub.
 * Aggregates four streams into one chronologically-sorted feed:
 *   1. Direct-message conversations
 *   2. System notifications (live SignalR + persisted)
 *   3. Pending connection requests
 *   4. External-email messages from synced mailboxes (Gmail, Outlook)
 *
 * All four are fetched in **one** round-trip via `/api/inbox`. Earlier
 * versions fanned out separate authenticated requests on every refresh —
 * each charged against the 100-req/min IP rate limiter. One endpoint =
 * one auth + one limiter hit per refresh.
 *
 * Each merged item carries a `kind` discriminant so the UI can render the
 * right affordances (open chat / mark read / accept-decline / open thread)
 * without the streams needing to know about each other.
 */

import { useCallback, useMemo } from "react";
import { useGatedResource } from "@/hooks/use-gated-resource";
import { useSignalR } from "@/hooks/use-signalr";
import { apiClient } from "@/lib/api-client";
import { chatBus } from "@/lib/chat-bus";
import { userService } from "@/lib/services/user-service";
import type { ConversationListItem } from "@/types/communication";
import type { Connection } from "@/lib/services/user-service";
import type { Notification as LiveNotification } from "@/lib/services/signalr-service";

export type HubItemKind = "message" | "notification" | "request" | "external_email";

export type ExternalEmailProvider = "gmail" | "outlook";

export interface HubItem {
  /** Stable cross-stream id (`m-…`, `n-…`, `r-…`, `e-…`) for React keys. */
  id: string;
  kind: HubItemKind;
  title: string;
  preview: string;
  /** ISO timestamp used for sort + display. */
  timestamp: string;
  isRead: boolean;
  /** Notification type / icon variant — `info` for messages and requests. */
  iconType: string;
  /** kind === "message" */
  conversationId?: string;
  /** kind === "notification" */
  notificationId?: string;
  /** kind === "request" */
  connectionId?: string;
  requesterName?: string;
  /** kind === "external_email" */
  externalEmailId?: string;
  provider?: ExternalEmailProvider | string;
  /** User-chosen account label, falls back to mailbox addr. */
  accountLabel?: string;
  /** Filled by the classifier (P2). */
  category?: string;
  /** Set by dedup (P3) when the email is bound to an applied/followed job. */
  linkedJobId?: string;
}

/** Persisted notification row — superset of the SignalR live shape since
 *  the DB has `createdAt` instead of `timestamp`. */
interface PersistedNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

/** Mirrors `InboxExternalEmailDto` on the backend
 *  (`services/messaging/inboxService.ts`). */
interface PersistedExternalEmail {
  id: string;
  provider: string;
  accountLabel: string;
  fromEmail: string;
  fromName: string | null;
  subject: string | null;
  snippet: string | null;
  category: string | null;
  score: number | null;
  summary: string | null;
  linkedJobId: string | null;
  isRead: boolean;
  receivedAt: string;
}

/** Mirrors `InboxResponse` on the backend (`services/messaging/inboxService.ts`). */
interface InboxResponse {
  conversations: ConversationListItem[];
  notifications: PersistedNotification[];
  pendingRequests: Connection[];
  externalEmails: PersistedExternalEmail[];
}

const POLL_INTERVAL_MS = 60_000;

const EMPTY_INBOX: InboxResponse = {
  conversations: [],
  notifications: [],
  pendingRequests: [],
  externalEmails: [],
};

export interface UseCommHubReturn {
  items: HubItem[];
  unreadCount: number;
  isConnected: boolean;
  isLoading: boolean;
  refresh: () => Promise<void>;
  openMessage: (conversationId: string) => void;
  markNotificationRead: (notificationId: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  acceptRequest: (connectionId: string) => Promise<void>;
  declineRequest: (connectionId: string) => Promise<void>;
  markExternalEmailRead: (externalEmailId: string) => Promise<void>;
}

export function useCommHub(): UseCommHubReturn {
  const {
    notifications: liveNotifs,
    isConnected,
    markNotificationAsRead: markLiveNotifRead,
  } = useSignalR();

  // The inbox aggregate (conversations + persisted notifs + pending requests)
  // inherits the api-ready gate + polling cadence from the base hook. SignalR
  // adds the live notification push channel on top.
  const { data: inbox, isLoading, refresh, setData: setInbox } =
    useGatedResource<InboxResponse>({
      fetcher: async () => {
        const response = await apiClient.get<InboxResponse>("/api/inbox");
        return response.data ?? EMPTY_INBOX;
      },
      defaults: EMPTY_INBOX,
      pollMs: POLL_INTERVAL_MS,
    });

  const conversations = inbox.conversations;
  const persistedNotifs = inbox.notifications;
  const requests = inbox.pendingRequests;
  const externalEmails = inbox.externalEmails;

  // Local mutators used by the optimistic update paths below — we splice
  // into the cached `inbox` aggregate via `setInbox` so the gate predicate
  // remains the only place that decides whether the wire is hit.
  const setConversations = useCallback(
    (updater: (cs: ConversationListItem[]) => ConversationListItem[]) =>
      setInbox((prev) => ({ ...prev, conversations: updater(prev.conversations) })),
    [setInbox],
  );
  const setPersistedNotifs = useCallback(
    (updater: (ns: PersistedNotification[]) => PersistedNotification[]) =>
      setInbox((prev) => ({ ...prev, notifications: updater(prev.notifications) })),
    [setInbox],
  );
  const setRequests = useCallback(
    (updater: (rs: Connection[]) => Connection[]) =>
      setInbox((prev) => ({ ...prev, pendingRequests: updater(prev.pendingRequests) })),
    [setInbox],
  );
  const setExternalEmails = useCallback(
    (updater: (es: PersistedExternalEmail[]) => PersistedExternalEmail[]) =>
      setInbox((prev) => ({ ...prev, externalEmails: updater(prev.externalEmails) })),
    [setInbox],
  );

  const items = useMemo<HubItem[]>(() => {
    const arr: HubItem[] = [];

    for (const c of conversations) {
      if (!c.lastMessage) continue;
      arr.push({
        id: `m-${c.id}`,
        kind: "message",
        title: c.lastMessage.senderName || c.title,
        preview: c.lastMessage.content,
        timestamp: c.lastMessage.timestamp,
        isRead: (c.unreadCount ?? 0) === 0,
        iconType: "message",
        conversationId: c.id,
      });
    }

    // Live SignalR notifs are authoritative when both sources have the same id.
    const seen = new Set<string>();
    for (const n of liveNotifs) {
      seen.add(n.id);
      arr.push(notificationToHubItem(n));
    }
    for (const n of persistedNotifs) {
      if (seen.has(n.id)) continue;
      arr.push({
        id: `n-${n.id}`,
        kind: "notification",
        title: n.title,
        preview: n.message,
        timestamp: n.createdAt,
        isRead: n.isRead,
        iconType: n.type,
        notificationId: n.id,
      });
    }

    for (const r of requests) {
      const requesterName =
        [r.fromUser?.firstName, r.fromUser?.lastName].filter(Boolean).join(" ") ||
        r.fromUser?.email ||
        "Someone";
      arr.push({
        id: `r-${r.id}`,
        kind: "request",
        title: requesterName,
        preview: r.message?.trim() || "wants to connect with you",
        timestamp: r.createdAt,
        isRead: false,
        iconType: "request",
        connectionId: r.id,
        requesterName,
      });
    }

    for (const e of externalEmails) {
      const senderTitle = (e.fromName?.trim() || e.fromEmail || "Email").trim();
      // Prefer the AI summary once the classifier fills it in; until then,
      // fall back to the provider snippet so users still see something.
      const preview = e.summary?.trim() || e.snippet?.trim() || e.subject?.trim() || "";
      arr.push({
        id: `e-${e.id}`,
        kind: "external_email",
        title: e.subject?.trim() || senderTitle,
        preview,
        timestamp: e.receivedAt,
        isRead: e.isRead,
        iconType: e.category ?? "external_email",
        externalEmailId: e.id,
        provider: e.provider,
        accountLabel: e.accountLabel,
        category: e.category ?? undefined,
        linkedJobId: e.linkedJobId ?? undefined,
      });
    }

    arr.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    return arr;
  }, [conversations, liveNotifs, persistedNotifs, requests, externalEmails]);

  const unreadCount = useMemo(
    () => items.filter((i) => !i.isRead).length,
    [items],
  );

  const openMessage = useCallback(
    (conversationId: string) => {
      chatBus.open(conversationId);
      // Optimistically zero the unread badge for that conversation.
      setConversations((cs) =>
        cs.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c)),
      );
    },
    [setConversations],
  );

  const markNotificationRead = useCallback(
    async (notificationId: string) => {
      markLiveNotifRead(notificationId);
      setPersistedNotifs((ns) =>
        ns.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n)),
      );
      try {
        await apiClient.post(`/api/notifications/${notificationId}/mark-read`);
      } catch {
        // Best-effort: server may already have it as read or be offline.
      }
    },
    [markLiveNotifRead, setPersistedNotifs],
  );

  const markAllRead = useCallback(async () => {
    setPersistedNotifs((ns) => ns.map((n) => ({ ...n, isRead: true })));
    setConversations((cs) => cs.map((c) => ({ ...c, unreadCount: 0 })));
    setExternalEmails((es) => es.map((e) => ({ ...e, isRead: true })));
    // Notifications + external emails have separate mark-all endpoints —
    // fan out so neither blocks the other on partial failure.
    await Promise.allSettled([
      apiClient.post("/api/notifications/mark-all-read"),
      apiClient.post("/api/inbox/external-emails/mark-all-read"),
    ]);
  }, [setConversations, setPersistedNotifs, setExternalEmails]);

  const markExternalEmailRead = useCallback(
    async (externalEmailId: string) => {
      setExternalEmails((es) =>
        es.map((e) => (e.id === externalEmailId ? { ...e, isRead: true } : e)),
      );
      try {
        await apiClient.post(`/api/inbox/external-emails/${externalEmailId}/mark-read`);
      } catch {
        // Best-effort: refresh on next poll will reconcile.
      }
    },
    [setExternalEmails],
  );

  const acceptRequest = useCallback(
    async (connectionId: string) => {
      setRequests((rs) => rs.filter((r) => r.id !== connectionId));
      try {
        await userService.acceptConnectionRequest(connectionId);
      } catch {
        // Roll back on failure by refetching the truth.
        refresh();
      }
    },
    [refresh, setRequests],
  );

  const declineRequest = useCallback(
    async (connectionId: string) => {
      setRequests((rs) => rs.filter((r) => r.id !== connectionId));
      try {
        await userService.rejectConnectionRequest(connectionId);
      } catch {
        refresh();
      }
    },
    [refresh, setRequests],
  );

  return {
    items,
    unreadCount,
    isConnected,
    isLoading,
    refresh,
    openMessage,
    markNotificationRead,
    markAllRead,
    acceptRequest,
    declineRequest,
    markExternalEmailRead,
  };
}

function notificationToHubItem(n: LiveNotification): HubItem {
  return {
    id: `n-${n.id}`,
    kind: "notification",
    title: n.title,
    preview: n.message,
    timestamp: n.timestamp,
    isRead: n.isRead,
    iconType: n.type,
    notificationId: n.id,
  };
}
