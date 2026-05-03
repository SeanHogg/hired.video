/**
 * useCommHub — single source of truth for the unified Communication Hub.
 * Aggregates three streams into one chronologically-sorted feed:
 *   1. Direct-message conversations
 *   2. System notifications (live SignalR + persisted)
 *   3. Pending connection requests
 *
 * All three are fetched in **one** round-trip via `/api/inbox`. Earlier
 * versions fanned out three separate authenticated requests on every
 * refresh — three rate-limiter hits, three auth checks, three queries.
 * Polling at 60s × 3 calls would push past the 100-req/min IP cap on a
 * busy session and trigger 429s.
 *
 * Each merged item carries a `kind` discriminant so the UI can render the
 * right affordances (open chat / mark read / accept-decline) without the
 * three streams needing to know about each other.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useSignalR } from "@/hooks/use-signalr";
import { apiClient } from "@/lib/api-client";
import { chatBus } from "@/lib/chat-bus";
import { userService } from "@/lib/services/user-service";
import type { ConversationListItem } from "@/types/communication";
import type { Connection } from "@/lib/services/user-service";
import type { Notification as LiveNotification } from "@/lib/services/signalr-service";

export type HubItemKind = "message" | "notification" | "request";

export interface HubItem {
  /** Stable cross-stream id (`m-…`, `n-…`, `r-…`) for React keys. */
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

/** Mirrors `InboxResponse` on the backend (`services/messaging/inboxService.ts`). */
interface InboxResponse {
  conversations: ConversationListItem[];
  notifications: PersistedNotification[];
  pendingRequests: Connection[];
}

const POLL_INTERVAL_MS = 60_000;

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
}

export function useCommHub(): UseCommHubReturn {
  const { isAuthenticated } = useAuth();
  const {
    notifications: liveNotifs,
    isConnected,
    markNotificationAsRead: markLiveNotifRead,
  } = useSignalR();

  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [persistedNotifs, setPersistedNotifs] = useState<PersistedNotification[]>([]);
  const [requests, setRequests] = useState<Connection[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) return;
    setIsLoading(true);
    try {
      const response = await apiClient.get<InboxResponse>("/api/inbox");
      const inbox = response.data;
      setConversations(inbox?.conversations ?? []);
      setPersistedNotifs(inbox?.notifications ?? []);
      setRequests(inbox?.pendingRequests ?? []);
    } catch {
      // 401s during sign-out / 429s from a momentary spike are expected;
      // keep the last-known state and let the next tick try again.
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  // Initial load + low-frequency polling fallback for streams that don't have
  // a SignalR push channel (conversations + connection requests).
  useEffect(() => {
    if (!isAuthenticated) {
      setConversations([]);
      setPersistedNotifs([]);
      setRequests([]);
      return;
    }
    refresh();
    const t = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [isAuthenticated, refresh]);

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

    arr.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    return arr;
  }, [conversations, liveNotifs, persistedNotifs, requests]);

  const unreadCount = useMemo(
    () => items.filter((i) => !i.isRead).length,
    [items],
  );

  const openMessage = useCallback((conversationId: string) => {
    chatBus.open(conversationId);
    // Optimistically zero the unread badge for that conversation.
    setConversations((cs) =>
      cs.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c)),
    );
  }, []);

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
    [markLiveNotifRead],
  );

  const markAllRead = useCallback(async () => {
    setPersistedNotifs((ns) => ns.map((n) => ({ ...n, isRead: true })));
    setConversations((cs) => cs.map((c) => ({ ...c, unreadCount: 0 })));
    try {
      await apiClient.post("/api/notifications/mark-all-read");
    } catch {
      /* best-effort */
    }
  }, []);

  const acceptRequest = useCallback(async (connectionId: string) => {
    setRequests((rs) => rs.filter((r) => r.id !== connectionId));
    try {
      await userService.acceptConnectionRequest(connectionId);
    } catch {
      // Roll back on failure by refetching the truth.
      refresh();
    }
  }, [refresh]);

  const declineRequest = useCallback(async (connectionId: string) => {
    setRequests((rs) => rs.filter((r) => r.id !== connectionId));
    try {
      await userService.rejectConnectionRequest(connectionId);
    } catch {
      refresh();
    }
  }, [refresh]);

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
