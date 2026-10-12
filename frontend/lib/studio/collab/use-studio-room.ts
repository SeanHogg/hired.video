/**
 * useStudioRoom — React hook owning the WebSocket connection to the
 * `StudioRoom` Durable Object for real-time collaborative studio editing
 * (gap #2243).
 *
 * Responsibilities (single seam for collab state in the editor):
 *   - **Presence** — `peers` (remote editors) + `selfId`, kept in sync via
 *     the DO's join/leave broadcasts. Drives the "N people editing" bar.
 *   - **Live sync** — `broadcast(doc)` relays a local document snapshot to
 *     peers; `onRemoteDoc(doc)` fires when a NEWER remote snapshot arrives
 *     (monotonic `version` ordering, so out-of-order frames are dropped).
 *   - **Host election** — `isHost` is true for exactly one connected client
 *     (the oldest session). The editor lets only the host autosave to the
 *     DB, so concurrent collaborators can't clobber each other's writes.
 *   - **Resilience** — auto-reconnect with capped backoff; the DO re-sends
 *     the authoritative `sync` on every (re)connect so a dropped client
 *     re-converges.
 *
 * WS-only (no WebRTC): edits are debounced low-frequency snapshots, so
 * relaying through the DO — which also persists the latest snapshot for late
 * joiners — is simpler and cheaper than a peer mesh.
 *
 * Disabled-fallback: when `studioRealtimeEnabled()` is false (the default —
 * opt-in via `VITE_STUDIO_REALTIME`) or identity/projectId is missing, the
 * hook is a no-op stub with `connected: false` and an empty peer list; the
 * editor runs solo autosave exactly as before. No `isCollab` boolean is
 * threaded through the tree — consumers read `connected` / `isHost`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  studioCollabSocketUrl,
  studioRealtimeEnabled,
} from "./studio-collab-api";

export interface CollabPeer {
  id: string;
  userId: string;
  displayName: string;
}

export interface StudioRoomState {
  /** True once the WebSocket is open. */
  connected: boolean;
  /** True when collaboration is configured (flag on, identity + project
   *  present). Use for UI gating; the hook self-gates the network work. */
  enabled: boolean;
  /** Remote editors currently in the room (excludes self). */
  peers: CollabPeer[];
  selfId: string | null;
  /** True for exactly one connected client — the single DB writer. When not
   *  connected, defaults to true so solo autosave is unaffected. */
  isHost: boolean;
  /** Relay a local document snapshot to peers. No-op when disconnected. */
  broadcast: (doc: unknown) => void;
}

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15000;

interface Options {
  projectId: string | null;
  identity: { userId: string; displayName: string } | null;
  /** Signed-in + project loaded — the editor's gate for live collab. */
  active: boolean;
  /** Apply a remote document snapshot into the editor state. Stored in a ref
   *  so changing the callback never re-subscribes the socket. */
  onRemoteDoc: (doc: unknown) => void;
}

export function useStudioRoom({
  projectId,
  identity,
  active,
  onRemoteDoc,
}: Options): StudioRoomState {
  const enabled = Boolean(
    active && projectId && identity && studioRealtimeEnabled(),
  );

  const [connected, setConnected] = useState(false);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(true);
  const [peers, setPeers] = useState<CollabPeer[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const lastVersionRef = useRef(0);
  const reconnectRef = useRef<{ attempts: number; timer: number | null }>({
    attempts: 0,
    timer: null,
  });
  const onRemoteDocRef = useRef(onRemoteDoc);
  onRemoteDocRef.current = onRemoteDoc;
  // Closed-over so the reconnect closure always sees the latest identity
  // without re-subscribing on every keystroke-driven render.
  const identityRef = useRef(identity);
  identityRef.current = identity;

  useEffect(() => {
    if (!enabled || !projectId) return;
    let disposed = false;

    const clearReconnect = () => {
      if (reconnectRef.current.timer !== null) {
        window.clearTimeout(reconnectRef.current.timer);
        reconnectRef.current.timer = null;
      }
    };

    const connect = () => {
      if (disposed) return;
      const url = studioCollabSocketUrl(projectId);
      if (!url) return;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.addEventListener("open", () => {
        if (disposed) return;
        setConnected(true);
        reconnectRef.current.attempts = 0;
      });

      ws.addEventListener("message", (event) => {
        if (disposed || typeof event.data !== "string") return;
        handleMessage(event.data, {
          setSelfId,
          setIsHost,
          setPeers,
          lastVersionRef,
          applyRemote: (doc) => onRemoteDocRef.current(doc),
        });
      });

      ws.addEventListener("close", () => {
        if (disposed) return;
        setConnected(false);
        // Reconnect with capped exponential backoff — the DO re-sends the
        // authoritative sync on reconnect so we re-converge.
        const attempts = ++reconnectRef.current.attempts;
        const delay = Math.min(RECONNECT_BASE_MS * 2 ** (attempts - 1), RECONNECT_MAX_MS);
        clearReconnect();
        reconnectRef.current.timer = window.setTimeout(connect, delay);
      });

      ws.addEventListener("error", () => {
        // Surfaced via the subsequent close event → reconnect path.
        try {
          ws.close();
        } catch {
          // already closing
        }
      });
    };

    connect();

    return () => {
      disposed = true;
      clearReconnect();
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) {
        try {
          ws.close();
        } catch {
          // ignore
        }
      }
      setConnected(false);
      setSelfId(null);
      setIsHost(true);
      setPeers([]);
      lastVersionRef.current = 0;
    };
    // Reconnect only when the room identity changes — NOT on every edit.
  }, [enabled, projectId, identity?.userId]);

  const broadcast = useCallback((doc: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ kind: "edit", doc }));
      } catch {
        // Channel closed between the check + send — the close handler
        // will reconnect; the next local change rebroadcasts.
      }
    }
  }, []);

  return useMemo(
    () => ({
      connected,
      enabled,
      peers,
      selfId,
      // When not connected, behave as sole writer so solo autosave runs.
      isHost: connected ? isHost : true,
      broadcast,
    }),
    [connected, enabled, peers, selfId, isHost, broadcast],
  );
}

// ─── Message handling ──────────────────────────────────────────────────

export interface MessageCtx {
  setSelfId: React.Dispatch<React.SetStateAction<string | null>>;
  setIsHost: React.Dispatch<React.SetStateAction<boolean>>;
  setPeers: React.Dispatch<React.SetStateAction<CollabPeer[]>>;
  lastVersionRef: React.MutableRefObject<number>;
  applyRemote: (doc: unknown) => void;
}

/** Pure protocol reducer over an inbound DO frame — exported for tests.
 *  Mutates the supplied setters/refs; safe to drive without a live socket. */
export function handleMessage(raw: string, ctx: MessageCtx): void {
  let env: Record<string, unknown>;
  try {
    env = JSON.parse(raw);
  } catch {
    return;
  }
  switch (env.kind) {
    case "sync": {
      const self = env.self as CollabPeer | undefined;
      if (self) ctx.setSelfId(self.id);
      ctx.setIsHost(Boolean(env.isHost));
      ctx.setPeers(Array.isArray(env.peers) ? (env.peers as CollabPeer[]) : []);
      // Adopt the authoritative version + doc the DO is holding (may be
      // ahead of the DB if peers edited while we were away).
      const version = typeof env.version === "number" ? env.version : 0;
      ctx.lastVersionRef.current = version;
      if (env.doc != null) ctx.applyRemote(env.doc);
      return;
    }
    case "peer_joined": {
      const peer = env.peer as CollabPeer | undefined;
      if (peer) {
        ctx.setPeers((prev) =>
          prev.some((p) => p.id === peer.id) ? prev : [...prev, peer],
        );
      }
      return;
    }
    case "peer_left": {
      const peerId = env.peerId as string | undefined;
      if (peerId) ctx.setPeers((prev) => prev.filter((p) => p.id !== peerId));
      return;
    }
    case "host_changed": {
      // Re-derive my host status from the DO's authoritative election. The
      // hook can't know its own sessionId here without a closure, so the
      // sync path set selfId; compare against it.
      const hostId = env.hostSessionId as string | undefined;
      ctx.setSelfId((self) => {
        ctx.setIsHost(self != null && self === hostId);
        return self;
      });
      return;
    }
    case "edit": {
      const version = typeof env.version === "number" ? env.version : 0;
      // Drop stale / echoed frames — only newer versions advance the doc.
      if (version <= ctx.lastVersionRef.current) return;
      ctx.lastVersionRef.current = version;
      if (env.doc !== undefined) ctx.applyRemote(env.doc);
      break;
    }
    // "cursor" frames are handled by a future live-cursor layer; ignored here.
  }
}
