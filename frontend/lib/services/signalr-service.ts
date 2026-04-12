/**
 * SSE Notification Service
 *
 * Replaces the @microsoft/signalr client with a native fetch-based SSE reader.
 * Cloudflare Workers serve raw SSE (not SignalR-framed), so we parse events
 * directly.  The backend endpoint dumps unread notifications then closes, so
 * we reconnect on a configurable interval (heartbeat).
 *
 * Public API is kept compatible with the old SignalRService so that
 * `use-signalr.ts` and `use-comm-hub.ts` work without changes.
 */

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

// ── Service ──────────────────────────────────────────────────────────────────

class NotificationSSEService {
  private notificationHandlers: NotificationHandler[] = [];
  private userStatusHandlers: UserStatusHandler[] = [];
  private connectionStateHandlers: ConnectionStateHandler[] = [];

  private _state: ConnectionState = ConnectionState.Disconnected;
  private abortController: AbortController | null = null;
  private retryCount = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

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
    await this.connect();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.clearRetryTimer();
    this.abortController?.abort();
    this.abortController = null;
    this.setState(ConnectionState.Disconnected);
  }

  // ── Internal connect ─────────────────────────────────────────────────────

  private async connect(): Promise<void> {
    if (this.stopped) return;

    const apiBaseUrl =
      (window as any).APP_CONFIG?.API_URL ||
      import.meta.env.VITE_API_URL ||
      "http://localhost:5000";

    const token = localStorage.getItem("authToken") || "";
    if (!token) {
      this.setState(ConnectionState.Disconnected);
      return;
    }

    this.setState(
      this.retryCount === 0
        ? ConnectionState.Connecting
        : ConnectionState.Reconnecting,
    );

    this.abortController?.abort();
    this.abortController = new AbortController();

    try {
      const res = await fetch(
        `${apiBaseUrl}/api/hubs/notifications`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "text/event-stream",
          },
          credentials: "include",
          signal: this.abortController.signal,
        },
      );

      if (!res.ok) {
        throw new Error(`SSE HTTP ${res.status}`);
      }

      this.retryCount = 0;
      this.setState(ConnectionState.Connected);

      await this.readStream(res);

      // Stream closed normally — schedule reconnect to pick up new events
      if (!this.stopped) {
        this.scheduleReconnect();
      }
    } catch (err: any) {
      if (err?.name === "AbortError" || this.stopped) return;
      console.warn("[NotificationSSE] connection error:", err.message);
      this.scheduleReconnect();
    }
  }

  // ── SSE stream reader ────────────────────────────────────────────────────

  private async readStream(res: Response): Promise<void> {
    const reader = res.body?.getReader();
    if (!reader) return;

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
      reader.releaseLock();
    }
  }

  private parseSSEBlock(block: string): void {
    let eventType = "message";
    let dataLines: string[] = [];

    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        dataLines.push(line.slice(6));
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5));
      }
    }

    if (dataLines.length === 0) return;

    const raw = dataLines.join("\n");
    let data: any;
    try {
      data = JSON.parse(raw);
    } catch {
      return; // skip malformed data
    }

    this.handleEvent(eventType, data);
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
      case "connected":
      case "summary":
        // lifecycle events — no action needed
        break;
      default:
        break;
    }
  }

  // ── Reconnection ─────────────────────────────────────────────────────────

  private scheduleReconnect(): void {
    if (this.stopped) return;

    this.setState(ConnectionState.Reconnecting);
    const delay =
      BACKOFF_MS[Math.min(this.retryCount, BACKOFF_MS.length - 1)] ??
      MAX_BACKOFF_MS;
    this.retryCount++;

    this.clearRetryTimer();
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, delay);
  }

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
