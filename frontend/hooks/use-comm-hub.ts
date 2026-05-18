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

/** Connected mailbox metadata — surfaced to the inbox filter UI so the
 *  page-tab toolbar can render account chips without a second fetch. */
export interface InboxAccount {
  id: string;
  provider: string;
  accountEmail: string;
  accountLabel: string | null;
  status: string;
  minJobScore: number;
  lastSyncedAt: string | null;
}

/** Filters the page-tab Inbox surface applies to the external-email
 *  stream. Forwarded to `/api/inbox` as query params. */
export interface EmailInboxFilters {
  accountIds?: string[];
  unreadOnly?: boolean;
  includeArchived?: boolean;
  /** Junk view — surfaces ONLY messages a user "Mark as Junk" rule
   *  captured. Bypasses the default job-only filter so users can
   *  audit / restore false positives. Mutually exclusive with
   *  includeArchived (the junk view always includes archived rows
   *  since junked emails are archived on insert). */
  junkOnly?: boolean;
}

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
  accounts: InboxAccount[];
}

const POLL_INTERVAL_MS = 60_000;

const EMPTY_INBOX: InboxResponse = {
  conversations: [],
  notifications: [],
  pendingRequests: [],
  externalEmails: [],
  accounts: [],
};

function buildInboxQuery(filters?: EmailInboxFilters): string {
  if (!filters) return "";
  const params = new URLSearchParams();
  if (filters.accountIds && filters.accountIds.length > 0) {
    params.set("accountIds", filters.accountIds.join(","));
  }
  if (filters.unreadOnly) params.set("unread", "1");
  if (filters.includeArchived) params.set("archived", "1");
  if (filters.junkOnly) params.set("junk", "1");
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export interface UseCommHubReturn {
  items: HubItem[];
  accounts: InboxAccount[];
  unreadCount: number;
  isConnected: boolean;
  isLoading: boolean;
  refresh: () => Promise<void>;
  openMessage: (conversationId: string) => void;
  markNotificationRead: (notificationId: string) => Promise<void>;
  /** Hard-delete a single notification via DELETE /api/notifications/:id.
   *  Used by the per-row X button on the notification dropdown + the
   *  page-tab inbox so users can clear noise. */
  dismissNotification: (notificationId: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  acceptRequest: (connectionId: string) => Promise<void>;
  declineRequest: (connectionId: string) => Promise<void>;
  markExternalEmailRead: (externalEmailId: string) => Promise<void>;
  markExternalEmailUnread: (externalEmailId: string) => Promise<void>;
  /** Archive a single email — soft-delete that keeps it in the table
   *  but removes it from the inbox feed. The (accountId, providerMessageId)
   *  unique key prevents re-sync from reintroducing the row. */
  dismissExternalEmail: (externalEmailId: string) => Promise<void>;
  /** Bulk variant — single round-trip for the "Delete selected" action. */
  bulkDismissExternalEmails: (ids: string[]) => Promise<void>;
  /** Mark-as-Junk: archives this message AND creates a user rule so
   *  future syncs auto-junk every match. `choice` carries the
   *  sender/domain/sender+subject shape the user picked in the
   *  JunkConfirmDialog. */
  junkExternalEmail: (
    externalEmailId: string,
    choice: { matchKind: string; matchValue: string | null },
  ) => Promise<void>;
  /** Restore an archived/junked email back into the inbox feed. Used
   *  by the Junk filter's per-row "Restore" action. */
  restoreExternalEmail: (externalEmailId: string) => Promise<void>;
}

export interface UseCommHubOptions {
  /** Filters applied to the external-email stream. Default = unfiltered. */
  emailFilters?: EmailInboxFilters;
}

export function useCommHub(options: UseCommHubOptions = {}): UseCommHubReturn {
  const { emailFilters } = options;
  // Stringify the filter to use as the fetcher cache key — the fetch
  // closure captures it so changing filters triggers a refresh through
  // useGatedResource's polling cycle.
  const filterQuery = useMemo(() => buildInboxQuery(emailFilters), [
    emailFilters?.accountIds?.join(",") ?? "",
    emailFilters?.unreadOnly ?? false,
    emailFilters?.includeArchived ?? false,
  ]);
  const {
    notifications: liveNotifs,
    isConnected,
    markNotificationAsRead: markLiveNotifRead,
  } = useSignalR();

  // The inbox aggregate (conversations + persisted notifs + pending requests
  // + external emails + accounts) inherits the api-ready gate + polling
  // cadence from the base hook. SignalR adds the live notification push
  // channel on top.
  const { data: inbox, isLoading, refresh, setData: setInbox } =
    useGatedResource<InboxResponse>({
      fetcher: async () => {
        const response = await apiClient.get<InboxResponse>(`/api/inbox${filterQuery}`);
        return response.data ?? EMPTY_INBOX;
      },
      defaults: EMPTY_INBOX,
      pollMs: POLL_INTERVAL_MS,
      // Re-fetch when filter query string changes — toggling an account
      // chip or unread/archived flag flips the dep and the gated hook
      // re-runs the fetcher.
      deps: [filterQuery],
    });

  const conversations = inbox.conversations;
  const persistedNotifs = inbox.notifications;
  const requests = inbox.pendingRequests;
  const externalEmails = inbox.externalEmails;
  const accounts = inbox.accounts;

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

  const markExternalEmailUnread = useCallback(
    async (externalEmailId: string) => {
      setExternalEmails((es) =>
        es.map((e) => (e.id === externalEmailId ? { ...e, isRead: false } : e)),
      );
      try {
        await apiClient.post(`/api/inbox/external-emails/${externalEmailId}/mark-unread`);
      } catch {
        // Best-effort.
      }
    },
    [setExternalEmails],
  );

  const dismissExternalEmail = useCallback(
    async (externalEmailId: string) => {
      // Optimistic: drop from the local stream so the row disappears.
      setExternalEmails((es) => es.filter((e) => e.id !== externalEmailId));
      try {
        await apiClient.post(
          `/api/inbox/external-emails/${externalEmailId}/archive`,
          { archived: true },
        );
      } catch {
        refresh();
      }
    },
    [refresh, setExternalEmails],
  );

  const bulkDismissExternalEmails = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      setExternalEmails((es) => es.filter((e) => !idSet.has(e.id)));
      try {
        await apiClient.post("/api/inbox/external-emails/bulk-archive", {
          ids,
          archived: true,
        });
      } catch {
        refresh();
      }
    },
    [refresh, setExternalEmails],
  );

  const junkExternalEmail = useCallback(
    async (
      externalEmailId: string,
      choice: { matchKind: string; matchValue: string | null },
    ) => {
      // Optimistic remove — the row goes to the junk view + future
      // matches stop reaching the inbox.
      setExternalEmails((es) => es.filter((e) => e.id !== externalEmailId));
      try {
        await apiClient.post(
          `/api/inbox/external-emails/${externalEmailId}/junk`,
          choice,
        );
      } catch {
        refresh();
      }
    },
    [refresh, setExternalEmails],
  );

  const restoreExternalEmail = useCallback(
    async (externalEmailId: string) => {
      // Best-effort optimistic remove from the current view (the
      // junk filter); the regular inbox will pick it up on next
      // refresh.
      setExternalEmails((es) => es.filter((e) => e.id !== externalEmailId));
      try {
        await apiClient.post(
          `/api/inbox/external-emails/${externalEmailId}/archive`,
          { archived: false },
        );
      } catch {
        refresh();
      }
    },
    [refresh, setExternalEmails],
  );

  const dismissNotification = useCallback(
    async (notificationId: string) => {
      setPersistedNotifs((ns) => ns.filter((n) => n.id !== notificationId));
      try {
        await apiClient.delete(`/api/notifications/${notificationId}`);
      } catch {
        refresh();
      }
    },
    [refresh, setPersistedNotifs],
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
    accounts,
    unreadCount,
    isConnected,
    isLoading,
    refresh,
    openMessage,
    markNotificationRead,
    dismissNotification,
    markAllRead,
    acceptRequest,
    declineRequest,
    markExternalEmailRead,
    markExternalEmailUnread,
    dismissExternalEmail,
    bulkDismissExternalEmails,
    junkExternalEmail,
    restoreExternalEmail,
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
