/**
 * ChatRoom — Cloudflare Durable Object that holds open WebSocket
 * connections for one conversationId and broadcasts message / typing /
 * presence events to every connected client.
 *
 * One DO per conversation. Hibernation keeps the runtime cheap when
 * idle (`acceptWebSocket` + persistent state in `ctx.storage`). Closes
 * the LinkedIn / modern-ATS real-time chat parity gap (#1230).
 *
 * Wire protocol — every frame is a JSON envelope:
 *   { kind: "message",  body: string, sentAt: ISO, fromUserId, fromName }
 *   { kind: "typing",   isTyping: boolean, fromUserId, fromName }
 *   { kind: "presence", online: string[] }
 *
 * The DO doesn't persist messages — durable storage of chat history
 * lives in the `aiChatMessages` table via the existing REST routes.
 * This layer is the *transport* — instant delivery + presence — that
 * makes the chat surface feel like LinkedIn InMail.
 */

interface ChatEnvIn {
  kind: "message" | "typing";
  body?: string;
  isTyping?: boolean;
}

interface SessionMeta {
  userId: string;
  name: string;
}

export class ChatRoom {
  private state: DurableObjectState;
  /** Per-WebSocket session metadata. Map is recreated on hibernation
   *  wake — we re-hydrate from `ws.deserializeAttachment()` for each
   *  accepted socket so a sleeping room doesn't lose its presence list. */
  private sessions: Map<WebSocket, SessionMeta> = new Map();

  constructor(state: DurableObjectState) {
    this.state = state;
    // Re-attach metadata for any sockets accepted before the previous
    // hibernation. The Worker runtime keeps the open WS list available
    // via getWebSockets(); we rebuild the local Map from their saved
    // attachments. Cheap (a few sockets, not all conversations).
    for (const ws of this.state.getWebSockets()) {
      const meta = ws.deserializeAttachment() as SessionMeta | null;
      if (meta) this.sessions.set(ws, meta);
    }
  }

  /** Worker entry point. Expects an `/api/chat/socket/:conversationId`
   *  Upgrade request with `?userId=…&name=…` query (authMiddleware
   *  already validated the JWT on the parent worker — we trust the
   *  upstream-attached identity). */
  async fetch(req: Request): Promise<Response> {
    const upgrade = req.headers.get("Upgrade");
    if (upgrade !== "websocket") {
      return new Response("Expected websocket upgrade", { status: 426 });
    }
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");
    const name = url.searchParams.get("name") ?? "Anonymous";
    if (!userId) return new Response("Missing userId", { status: 400 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Accept + hibernate. The DO will sleep between messages; the
    // runtime wakes it on each frame and re-invokes webSocketMessage().
    this.state.acceptWebSocket(server);
    const meta: SessionMeta = { userId, name };
    server.serializeAttachment(meta);
    this.sessions.set(server, meta);

    // Broadcast presence to everyone (including the newly-joined client).
    this.broadcastPresence();

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const meta = this.sessions.get(ws) ?? (ws.deserializeAttachment() as SessionMeta | null);
    if (!meta) {
      ws.close(1008, "Unknown session");
      return;
    }
    const text = typeof message === "string" ? message : new TextDecoder().decode(message);
    let parsed: ChatEnvIn;
    try {
      parsed = JSON.parse(text) as ChatEnvIn;
    } catch {
      return; // Ignore malformed frames.
    }
    if (parsed.kind === "message" && typeof parsed.body === "string" && parsed.body.length > 0) {
      this.broadcast({
        kind: "message",
        body: parsed.body.slice(0, 8000), // hard cap
        sentAt: new Date().toISOString(),
        fromUserId: meta.userId,
        fromName: meta.name,
      });
    } else if (parsed.kind === "typing") {
      this.broadcast({
        kind: "typing",
        isTyping: !!parsed.isTyping,
        fromUserId: meta.userId,
        fromName: meta.name,
      });
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.sessions.delete(ws);
    this.broadcastPresence();
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.sessions.delete(ws);
    this.broadcastPresence();
  }

  // ── helpers ──────────────────────────────────────────────────────

  private broadcast(payload: Record<string, unknown>): void {
    const text = JSON.stringify(payload);
    for (const ws of this.state.getWebSockets()) {
      try {
        ws.send(text);
      } catch {
        // Drop sockets that fail to send — they'll come back through
        // webSocketError next tick.
      }
    }
  }

  private broadcastPresence(): void {
    this.broadcast(buildPresencePayload([...this.sessions.values()].map((m) => m.userId)));
  }
}

// Pure presence-frame builder — the one shape `broadcastPresence` sends,
// unit-testable without the DurableObjectState mock.
export function buildPresencePayload(userIds: string[]): { kind: "presence"; online: string[] } {
  return { kind: "presence", online: [...new Set(userIds)] };
}
