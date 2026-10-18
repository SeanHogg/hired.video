/**
 * SSE Notification Service
 *
 * Replaces the @microsoft/signalr client with a native fetch-based SSE reader.
 * Cloudflare Workers serve raw SSE (not SignalR-framed), so we parse events
 * directly.  The backend endpoint dumps unread notifications then closes, so
 * we reconnect on a heartbeat, sending a `since` cursor so only newer rows
 * come back (a server ignoring it re-sends all unread; consumers dedupe by id).
 *
 * Public API is kept compatible with the old SignalRService so that
 * `use-signalr.ts` and `use-comm-hub.ts` work without changes.
 */

import { apiClient } from "../api-client";
import { getAuthToken } from "../api/auth-token";
import { newerIso, notificationsHubPath, parseSseBlock, visibleRepollDelay } from "./notification-sse";

// ── Types ────────────────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "error" | "job_application";
  data?: any;
  timestamp: string;
  isRead: boolean;
}

export interface UserStatusUpdate {
  userId: string;
  userName: string;
  status: "online" | "away" | "busy" | "offline";
  timestamp: string;
}

export type NotificationHandler = (notification: Notification) => void;
export type UserStatusHandler = (statusUpdate: UserStatusUpdate) => void;
export type ConnectionStateHandler = (state: ConnectionState) => void;

/** The hub's `summary` event (sent after the unread dump). */
export interface NotificationSummary {
  unreadCount: number;
  /** Next poll's `since` cursor (servers without cursor support omit it). */
  cursor?: string | null;
}
export type SummaryHandler = (summary: NotificationSummary) => void;

/** Mirrors the subset of HubConnectionState the UI cares about. */
export enum ConnectionState {
  Disconnected = "Disconnected",
  Connecting = "Connecting",
  Connected = "Connected",
  Reconnecting = "Reconnecting",
}

// ── Retry config ─────────────────────────────────────────────────────────────

const BACKOFF_MS = [0, 2_000, 10_000, 30_000]; // same as old signalr config
const MAX_BACKOFF_MS = 30_000;
// The hub dumps unread notifications + a `summary` event and then closes, so a
// NORMAL close is a poll cycle — re-poll on this heartbeat, not the error backoff.
const HEARTBEAT_MS = 60_000;
// Tab-visible re-polls early only past this gap (tab switching ≠ hammering).
const VISIBLE_REPOLL_MIN_MS = 30_000;

// ── Service ──────────────────────────────────────────────────────────────────

class NotificationSSEService {
  private notificationHandlers: NotificationHandler[] = [];
  private userStatusHandlers: UserStatusHandler[] = [];
  private connectionStateHandlers: ConnectionStateHandler[] = [];
  private summaryHandlers: SummaryHandler[] = [];
  // A reconnect that came due while the tab was hidden; runs on visible.
  private reconnectDeferred = false;

  private _state: ConnectionState = ConnectionState.Disconnected;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private retryCount = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  // Bumped per connect(); a superseded connection never schedules a reconnect.
  private generation = 0;
  // Newest createdAt seen (`?since=`); committed only when a poll's stream
  // completes, so a cut stream (newest-first) never skips undelivered rows.
  private cursor: string | null = null;
  private pollCursor: string | null = null;
  // When the last poll started (ms); gates the on-visible early re-poll.
  private lastPollAt = 0;

  // ── Connection lifecycle ─────────────────────────────────────────────────

  async start(): Promise<void> {
    if (
      this._state === ConnectionState.Connected ||
      this._state === ConnectionState.Connecting
    ) {
      return;
    }

    this.stopped = false;
    this.retryCount = 0;
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.handleVisibilityChange);
    }
    await this.connect();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.reconnectDeferred = false;
    // Sign-out / user switch: the next session starts with a full burst.
    this.cursor = null;
    this.pollCursor = null;
    this.lastPollAt = 0;
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    }
    this.clearRetryTimer();
    this.cancelReader();
    this.setState(ConnectionState.Disconnected);
  }

  // ── Internal connect ─────────────────────────────────────────────────────

  private async connect(): Promise<void> {
    if (this.stopped) return;

    // Same bearer + X-Emulation-Token + base URL as every apiClient call.
    if (!getAuthToken()) {
      this.setState(ConnectionState.Disconnected);
      return;
    }

    // A heartbeat re-poll stays Connected — the state must not flap per poll.
    if (this._state !== ConnectionState.Connected) this.setState(
      this.retryCount === 0
        ? ConnectionState.Connecting
        : ConnectionState.Reconnecting,
    );

    this.cancelReader();
    const generation = ++this.generation;
    const superseded = () => this.stopped || generation !== this.generation;

    this.lastPollAt = Date.now();
    const path = notificationsHubPath(this.cursor);
    this.pollCursor = this.cursor;
    try {
      const res = await apiClient.openStream(path, {
        headers: { Accept: "text/event-stream" },
        // Background hub: a dropped connection just reconnects, never toasts.
        suppressErrorEvent: true,
      });
      if (superseded()) {
        void res.body?.cancel().catch(() => undefined);
        return;
      }

      this.retryCount = 0;
      this.setState(ConnectionState.Connected);

      await this.readStream(res);
      if (!superseded()) this.cursor = this.pollCursor;

      // Stream closed normally — re-poll on the heartbeat for new events.
      if (!superseded()) {
        this.scheduleReconnect("heartbeat");
      }
    } catch (err) {
      if (superseded()) return;
      console.warn("[NotificationSSE] connection error:", err instanceof Error ? err.message : err);
      this.scheduleReconnect("error");
    }
  }

  private cancelReader(): void {
    void this.reader?.cancel().catch(() => undefined);
    this.reader = null;
  }

  // ── SSE stream reader ────────────────────────────────────────────────────

  private async readStream(res: Response): Promise<void> {
    const reader = res.body?.getReader();
    if (!reader) return;
    this.reader = reader;

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse complete SSE blocks (double-newline delimited)
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || ""; // keep incomplete tail

        for (const block of parts) {
          this.parseSSEBlock(block);
        }
      }

      // Flush remaining buffer
      if (buffer.trim()) {
        this.parseSSEBlock(buffer);
      }
    } finally {
      if (this.reader === reader) this.reader = null;
      try {
        reader.releaseLock();
      } catch {
        // Already released by cancel().
      }
    }
  }

  private parseSSEBlock(block: string): void {
    const parsed = parseSseBlock(block);
    if (parsed) this.handleEvent(parsed.event, parsed.data);
  }

  private handleEvent(eventType: string, data: any): void {
    switch (eventType) {
      case "notification": {
        const notification: Notification = {
          id: data.id,
          title: data.title ?? "",
          message: data.message ?? "",
          type: data.type ?? "info",
          data: data.data,
          timestamp: data.createdAt ?? data.timestamp ?? new Date().toISOString(),
          isRead: data.isRead ?? false,
        };
        // Only a server-stamped createdAt advances the cursor.
        this.pollCursor = newerIso(this.pollCursor, typeof data.createdAt === "string" ? data.createdAt : null);
        this.notificationHandlers.forEach((h) => h(notification));
        break;
      }
      case "userStatus": {
        const status: UserStatusUpdate = {
          userId: data.userId,
          userName: data.userName ?? "",
          status: data.status,
          timestamp: data.timestamp ?? new Date().toISOString(),
        };
        this.userStatusHandlers.forEach((h) => h(status));
        break;
      }
      case "summary": {
        const cursor = typeof data?.cursor === "string" ? data.cursor : null;
        this.pollCursor = newerIso(this.pollCursor, cursor);
        const summary: NotificationSummary = { unreadCount: Number(data?.unreadCount) || 0, cursor };
        this.summaryHandlers.forEach((h) => h(summary));
        break;
      }
      case "connected":
        // lifecycle event — no action needed
        break;
      default:
        break;
    }
  }

  // ── Reconnection ─────────────────────────────────────────────────────────

  /**
   * `heartbeat`: the stream closed normally — stay Connected and re-poll in
   * HEARTBEAT_MS. `error`: back off 0/2s/10s/30s as Reconnecting. Either way a
   * reconnect that comes due while the tab is hidden waits for visibility.
   */
  private scheduleReconnect(kind: "heartbeat" | "error"): void {
    if (this.stopped) return;

    let delay: number;
    if (kind === "heartbeat") {
      delay = HEARTBEAT_MS;
    } else {
      this.setState(ConnectionState.Reconnecting);
      delay =
        BACKOFF_MS[Math.min(this.retryCount, BACKOFF_MS.length - 1)] ??
        MAX_BACKOFF_MS;
      this.retryCount++;
    }

    this.armReconnect(delay);
  }

  /** (Re)arm the reconnect timer; one that comes due while the tab is
   *  hidden is deferred until it becomes visible. */
  private armReconnect(delay: number): void {
    this.clearRetryTimer();
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        this.reconnectDeferred = true;
        return;
      }
      void this.connect();
    }, delay);
  }

  private handleVisibilityChange = (): void => {
    if (this.stopped || document.visibilityState !== "visible") return;
    // Back in view: run a deferred reconnect, or cut a pending heartbeat
    // short so the unread state is fresh the moment the user looks — but
    // never sooner than VISIBLE_REPOLL_MIN_MS after the last poll.
    if (!this.reconnectDeferred && this.retryTimer == null) return;
    const wait = visibleRepollDelay(this.lastPollAt, Date.now(), VISIBLE_REPOLL_MIN_MS);
    if (wait > 0) {
      // A pending timer fires on its own; a deferred one re-arms.
      if (this.reconnectDeferred) {
        this.reconnectDeferred = false;
        this.armReconnect(wait);
      }
      return;
    }
    this.reconnectDeferred = false;
    this.clearRetryTimer();
    void this.connect();
  };

  private clearRetryTimer(): void {
    if (this.retryTimer != null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  // ── State management ─────────────────────────────────────────────────────

  private setState(state: ConnectionState): void {
    if (this._state === state) return;
    this._state = state;
    this.connectionStateHandlers.forEach((h) => h(state));
  }

  // ── Public event registration ────────────────────────────────────────────

  onNotification(handler: NotificationHandler): () => void {
    this.notificationHandlers.push(handler);
    return () => {
      const i = this.notificationHandlers.indexOf(handler);
      if (i > -1) this.notificationHandlers.splice(i, 1);
    };
  }

  onUserStatusChange(handler: UserStatusHandler): () => void {
    this.userStatusHandlers.push(handler);
    return () => {
      const i = this.userStatusHandlers.indexOf(handler);
      if (i > -1) this.userStatusHandlers.splice(i, 1);
    };
  }

  /** Fires on each `summary` event; returns an unsubscribe fn. */
  onSummary(handler: SummaryHandler): () => void {
    this.summaryHandlers.push(handler);
    return () => this.offSummary(handler);
  }

  offSummary(handler: SummaryHandler): void {
    const i = this.summaryHandlers.indexOf(handler);
    if (i > -1) this.summaryHandlers.splice(i, 1);
  }

  onConnectionStateChange(handler: ConnectionStateHandler): () => void {
    this.connectionStateHandlers.push(handler);
    return () => {
      const i = this.connectionStateHandlers.indexOf(handler);
      if (i > -1) this.connectionStateHandlers.splice(i, 1);
    };
  }

  // ── Stubs for features that need server-side support ─────────────────────
  // SSE is server→client only.  These are no-ops kept for API compatibility.

  async joinGroup(_groupName: string): Promise<void> {}
  async leaveGroup(_groupName: string): Promise<void> {}
  async updateStatus(
    _status: "online" | "away" | "busy" | "offline",
  ): Promise<void> {}

  get connectionState(): ConnectionState {
    return this._state;
  }

  get isConnected(): boolean {
    return this._state === ConnectionState.Connected;
  }
}

// Export a singleton instance
export const signalRService = new NotificationSSEService();
export default signalRService;
