/**
 * StudioRoom — Cloudflare Durable Object for real-time collaborative
 * studio editing (gap #2243). One DO instance per `studio_projects.id`.
 *
 * Unlike GameSignalingRoom (which only signals WebRTC and lets gameplay
 * flow peer-to-peer), studio editing is **relayed through the DO**: edits
 * are low-frequency (debounced document snapshots, not 60fps positions),
 * so the DO is the authoritative hub. It:
 *
 *   - **Presence** — tracks who's in the room; broadcasts join/leave so
 *     every editor sees "N people editing" + avatars.
 *   - **Authoritative document** — holds the latest collaborative snapshot
 *     (the raw per-kind editor state) in DO storage with a monotonic
 *     `version`. A late joiner is sync'd to the current version on connect
 *     so they never start from a stale base.
 *   - **Edit relay** — an inbound `edit` bumps the version, persists the
 *     snapshot to DO storage, and broadcasts to every OTHER peer. Clients
 *     apply a remote edit only when its version exceeds their last-applied
 *     version (monotonic ordering; last-write-wins at document grain).
 *   - **Host election** — the oldest live session is the "host". Only the
 *     host's client autosaves to the database, so concurrent collaborators
 *     can never clobber each other's DB writes (single writer). On host
 *     leave the DO promotes the next-oldest and broadcasts `host_changed`.
 *   - **Cursor presence** — relays ephemeral selection/cursor frames.
 *
 * One DO per projectId. Hibernation keeps idle rooms ~free. Pattern
 * mirrors [GameSignalingRoom.ts](./GameSignalingRoom.ts) + [ChatRoom.ts](./ChatRoom.ts)
 * — same `acceptWebSocket` + attachment-deserialize hibernation seam.
 *
 * Auth is enforced UPSTREAM in [routes/studio-socket.ts](../routes/studio-socket.ts)
 * (verifies the query-param JWT — browsers can't set an Authorization header
 * on a WebSocket — then `canActFor` against the project's real owner). The
 * DO trusts the `userId` the route forwards and never re-authenticates.
 *
 * Wire protocol — every frame is a JSON envelope:
 *
 *   inbound:
 *     { kind: "edit",   doc: <raw per-kind editor state> }   // debounced snapshot
 *     { kind: "cursor", payload: <selection/cursor frame> }
 *
 *   outbound:
 *     { kind: "sync",         self, peers, isHost, version, doc }   // on join
 *     { kind: "peer_joined",  peer }
 *     { kind: "peer_left",    peerId }
 *     { kind: "host_changed", hostSessionId }
 *     { kind: "edit",         from, version, doc }
 *     { kind: "cursor",       from, displayName, payload }
 */

interface SessionMeta {
  /** Stable session id, minted by the DO so a client can't impersonate. */
  sessionId: string;
  userId: string;
  displayName: string;
  projectId: string;
  /** Join order — the lowest live `joinedAt` is the host (single DB writer). */
  joinedAt: number;
}

interface InboundEnvelope {
  kind: "edit" | "cursor";
  doc?: unknown;
  payload?: unknown;
}

/** Persisted authoritative document. `version` is monotonic so clients can
 *  discard out-of-order frames. */
interface RoomDoc {
  version: number;
  doc: unknown;
}

const DOC_STORAGE_KEY = "studio-room-doc";

export class StudioRoom {
  private state: DurableObjectState;
  private sessions: Map<WebSocket, SessionMeta> = new Map();
  /** In-memory mirror of the persisted doc; lazily loaded on first need. */
  private roomDoc: RoomDoc | null = null;
  private docLoaded = false;
  /** Monotonic join counter so host election is deterministic even when two
   *  sockets accept within the same millisecond (Date.now collisions). */
  private joinSeq = 0;

  constructor(state: DurableObjectState) {
    this.state = state;
    // Re-attach metadata for sockets accepted before hibernation.
    for (const ws of this.state.getWebSockets()) {
      const meta = ws.deserializeAttachment() as SessionMeta | null;
      if (meta) {
        this.sessions.set(ws, meta);
        if (meta.joinedAt >= this.joinSeq) this.joinSeq = meta.joinedAt + 1;
      }
    }
  }

  /** Worker entry. `GET .../collab-socket?userId=&name=&projectId=` */
  async fetch(req: Request): Promise<Response> {
    const upgrade = req.headers.get("Upgrade");
    if (upgrade !== "websocket") {
      return new Response("Expected websocket upgrade", { status: 426 });
    }
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");
    const projectId = url.searchParams.get("projectId");
    const name = url.searchParams.get("name") ?? "Guest";
    if (!userId || !projectId) {
      return new Response("Missing userId or projectId", { status: 400 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server);

    const sessionId = crypto.randomUUID();
    const meta: SessionMeta = {
      sessionId,
      userId,
      displayName: name,
      projectId,
      joinedAt: this.joinSeq++,
    };
    server.serializeAttachment(meta);
    this.sessions.set(server, meta);

    await this.ensureDocLoaded();

    // Send the joiner the current roster + authoritative doc + their host
    // status, then announce their arrival to everyone else.
    const others = [...this.sessions.entries()]
      .filter(([ws]) => ws !== server)
      .map(([, m]) => this.publicPeer(m));
    safeSend(server, {
      kind: "sync",
      self: this.publicPeer(meta),
      peers: others,
      isHost: this.hostSessionId() === sessionId,
      version: this.roomDoc?.version ?? 0,
      doc: this.roomDoc?.doc ?? null,
    });
    this.broadcast({ kind: "peer_joined", peer: this.publicPeer(meta) }, server);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const meta = this.sessions.get(ws) ?? (ws.deserializeAttachment() as SessionMeta | null);
    if (!meta) {
      ws.close(1008, "Unknown session");
      return;
    }
    const text = typeof message === "string" ? message : new TextDecoder().decode(message);
    let parsed: InboundEnvelope;
    try {
      parsed = JSON.parse(text) as InboundEnvelope;
    } catch {
      return; // Drop malformed frames.
    }

    if (parsed.kind === "edit" && parsed.doc !== undefined) {
      await this.ensureDocLoaded();
      const version = (this.roomDoc?.version ?? 0) + 1;
      this.roomDoc = { version, doc: parsed.doc };
      // Persist so a late joiner (or a room that hibernated between edits)
      // resumes from the latest collaborative state, not the last DB save.
      await this.state.storage.put(DOC_STORAGE_KEY, this.roomDoc);
      this.broadcast({ kind: "edit", from: meta.sessionId, version, doc: parsed.doc }, ws);
      return;
    }

    if (parsed.kind === "cursor") {
      // Ephemeral — never persisted; relayed to peers for live cursors.
      this.broadcast(
        { kind: "cursor", from: meta.sessionId, displayName: meta.displayName, payload: parsed.payload },
        ws,
      );
      return;
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const meta = this.sessions.get(ws);
    const wasHost = meta ? this.hostSessionId() === meta.sessionId : false;
    this.sessions.delete(ws);
    if (meta) {
      this.broadcast({ kind: "peer_left", peerId: meta.sessionId });
      // Promote the next-oldest session so exactly one client keeps
      // persisting to the DB (single-writer invariant).
      if (wasHost) {
        const nextHost = this.hostSessionId();
        if (nextHost) this.broadcast({ kind: "host_changed", hostSessionId: nextHost });
      }
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  private async ensureDocLoaded(): Promise<void> {
    if (this.docLoaded) return;
    const stored = await this.state.storage.get<RoomDoc>(DOC_STORAGE_KEY);
    if (stored) this.roomDoc = stored;
    this.docLoaded = true;
  }

  /** Host = the live session with the smallest `joinedAt`. Deterministic so
   *  every client computes the same host from the roster. */
  private hostSessionId(): string | null {
    let host: SessionMeta | null = null;
    for (const meta of this.sessions.values()) {
      if (!host || meta.joinedAt < host.joinedAt) host = meta;
    }
    return host?.sessionId ?? null;
  }

  private publicPeer(m: SessionMeta): { id: string; userId: string; displayName: string } {
    return { id: m.sessionId, userId: m.userId, displayName: m.displayName };
  }

  private broadcast(env: Record<string, unknown>, except?: WebSocket): void {
    for (const ws of this.sessions.keys()) {
      if (ws === except) continue;
      safeSend(ws, env);
    }
  }
}

function safeSend(ws: WebSocket, env: Record<string, unknown>): void {
  try {
    ws.send(JSON.stringify(env));
  } catch {
    // Closed sockets throw — drop the frame and let webSocketClose run.
  }
}
