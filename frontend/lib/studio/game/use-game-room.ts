/**
 * useGameRoom — React hook owning the WebSocket connection to the
 * 3D-world signaling Durable Object (gap #1636) plus the WebRTC mesh
 * to every peer in the room.
 *
 * Architecture:
 *
 *   - One WebSocket to `/api/games/:projectId/socket` — handles peer
 *     discovery, SDP/ICE forwarding, presence, and authoritative
 *     challenge-claim broadcasts.
 *   - One RTCPeerConnection + data channel per remote peer — carries
 *     per-frame player position + ephemeral events (lowest latency,
 *     zero server cost).
 *
 * Per the DRY rule, the room is the single seam for multiplayer state
 * in the editor:
 *
 *   - `peers` — map of remote peer id → latest known state (position,
 *     rotation, displayName, score). Scene3D iterates this to render
 *     other-player avatars.
 *   - `broadcastPosition(pos, rot)` — fan-out to every data channel.
 *   - `claimChallenge(challengeId)` — server-authoritative score
 *     award via the signaling DO; the DO routes through the existing
 *     `/api/games/:projectId/challenge-complete` route so the
 *     gamification ledger path is unchanged.
 *
 * Gated on the environment — if `VITE_GAME_REALTIME_URL` is unset (or
 * we're in SSR), the hook returns a no-op stub with `connected: false`
 * and an empty peers map. The editor + the play surface fall back to
 * single-player gracefully (DRY: no `isMultiplayerAvailable` boolean
 * threaded through the tree).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface RemotePeer {
  id: string;
  userId: string;
  displayName: string;
  position: [number, number, number];
  rotation: [number, number, number];
  score: number;
  lastUpdateMs: number;
}

export interface GameRoomState {
  /** True once the WebSocket is open. WebRTC peers may still be
   *  establishing — check `peers` for per-peer readiness. */
  connected: boolean;
  /** True when the hook is configured (env var set, projectId
   *  present). Use this for `<MultiplayerBadge />`-style UI gating;
   *  the hook self-gates the actual network work. */
  enabled: boolean;
  peers: Map<string, RemotePeer>;
  selfId: string | null;
  /** Fire-and-forget. Throttles internally so the caller can dump on
   *  every frame without saturating the data channel. */
  broadcastPosition: (
    position: [number, number, number],
    rotation: [number, number, number],
  ) => void;
  /** Authoritative claim. The DO validates session-level dedup +
   *  forwards to the gamification ledger. */
  claimChallenge: (challengeId: string) => void;
}

const POSITION_BROADCAST_HZ = 15; // every ~66ms
const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

// ─── Public hook ──────────────────────────────────────────────────────

export function useGameRoom(
  projectId: string | null,
  identity: { userId: string; displayName: string } | null,
  active: boolean,
): GameRoomState {
  const enabled = resolveEnabled(projectId, identity, active);

  const [connected, setConnected] = useState(false);
  const [selfId, setSelfId] = useState<string | null>(null);
  // Peers stored in a Map ref + mirrored into state for renders. The
  // ref is the hot path (data-channel update at 15Hz); the state
  // mirror is a shallow clone reconciled on join/leave + every ~200ms
  // throttled tick so React doesn't re-render at 15Hz.
  const peersRef = useRef<Map<string, RemotePeer>>(new Map());
  const [peers, setPeers] = useState<Map<string, RemotePeer>>(new Map());

  const wsRef = useRef<WebSocket | null>(null);
  const peerConnsRef = useRef<Map<string, PeerConn>>(new Map());
  const broadcastQueueRef = useRef<{ pos?: [number, number, number]; rot?: [number, number, number] }>({});

  // ─── WebSocket lifecycle ───────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !projectId || !identity) return;

    const wsUrl = buildSocketUrl(projectId, identity);
    if (!wsUrl) return;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.addEventListener("open", () => setConnected(true));
    ws.addEventListener("close", () => {
      setConnected(false);
      // Tear down every RTC connection on disconnect — peers will
      // re-establish when the socket reopens.
      for (const pc of peerConnsRef.current.values()) pc.close();
      peerConnsRef.current.clear();
      peersRef.current.clear();
      setPeers(new Map());
    });
    ws.addEventListener("error", (e) => {
      // eslint-disable-next-line no-console
      console.warn("[useGameRoom] socket error", e);
    });

    ws.addEventListener("message", (event) => {
      handleSignalingMessage(event.data, {
        wsRef,
        peerConnsRef,
        peersRef,
        setPeers,
        setSelfId,
      });
    });

    return () => {
      ws.close();
      for (const pc of peerConnsRef.current.values()) pc.close();
      peerConnsRef.current.clear();
      peersRef.current.clear();
      setPeers(new Map());
      setConnected(false);
      setSelfId(null);
      wsRef.current = null;
    };
  }, [enabled, projectId, identity?.userId, identity?.displayName]);

  // ─── Throttled position broadcast ──────────────────────────────────
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      const q = broadcastQueueRef.current;
      if (!q.pos || !q.rot) return;
      const env = JSON.stringify({ kind: "pos", position: q.pos, rotation: q.rot });
      for (const pc of peerConnsRef.current.values()) {
        pc.send(env);
      }
      broadcastQueueRef.current = {};
    }, Math.round(1000 / POSITION_BROADCAST_HZ));
    return () => window.clearInterval(id);
  }, [enabled]);

  // ─── Public API ────────────────────────────────────────────────────
  const broadcastPosition = useCallback(
    (position: [number, number, number], rotation: [number, number, number]) => {
      broadcastQueueRef.current = { pos: position, rot: rotation };
    },
    [],
  );

  /** Award a challenge. ALWAYS posts to `/api/games/:projectId/challenge-complete`
   *  so the gamification ledger is written exactly once via the existing
   *  route (the SSoT for award semantics — daily cap, role gating, dedup
   *  by `(projectId, challengeId, userId)`). Additionally broadcasts to
   *  the room so other peers see the "claimed" event in their HUD. The
   *  duplicate write is harmless — the route is idempotent on the dedup
   *  key. */
  const claimChallenge = useCallback(
    (challengeId: string) => {
      if (projectId) {
        void fetch(`/api/games/${projectId}/challenge-complete`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ challengeId }),
        }).catch(() => {
          // Network failures shouldn't break the play loop.
        });
      }
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ kind: "claim_challenge", challengeId }));
      }
    },
    [projectId],
  );

  return useMemo(
    () => ({ connected, enabled, peers, selfId, broadcastPosition, claimChallenge }),
    [connected, enabled, peers, selfId, broadcastPosition, claimChallenge],
  );
}

// ─── Disabled fallback ────────────────────────────────────────────────

function resolveEnabled(
  projectId: string | null,
  identity: { userId: string } | null,
  active: boolean,
): boolean {
  if (!active) return false;
  if (!projectId || !identity) return false;
  if (typeof window === "undefined") return false;
  // Env var is set in vite config. Empty / undefined → multiplayer off.
  const url = (import.meta as { env?: Record<string, string | undefined> }).env
    ?.VITE_GAME_REALTIME_URL;
  return Boolean(url);
}

function buildSocketUrl(
  projectId: string,
  identity: { userId: string; displayName: string },
): string | null {
  const base = (import.meta as { env?: Record<string, string | undefined> }).env
    ?.VITE_GAME_REALTIME_URL;
  if (!base) return null;
  const proto = base.startsWith("https") ? "wss" : base.startsWith("http") ? "ws" : null;
  if (!proto) {
    // Already a ws/wss url — pass through.
    return `${base.replace(/\/$/, "")}/${projectId}/socket?userId=${encodeURIComponent(identity.userId)}&name=${encodeURIComponent(identity.displayName)}`;
  }
  const u = new URL(base);
  u.protocol = proto;
  u.pathname = `${u.pathname.replace(/\/$/, "")}/${projectId}/socket`;
  u.searchParams.set("userId", identity.userId);
  u.searchParams.set("name", identity.displayName);
  return u.toString();
}

// ─── Signaling envelope handling ──────────────────────────────────────

interface SignalingCtx {
  wsRef: React.MutableRefObject<WebSocket | null>;
  peerConnsRef: React.MutableRefObject<Map<string, PeerConn>>;
  peersRef: React.MutableRefObject<Map<string, RemotePeer>>;
  setPeers: React.Dispatch<React.SetStateAction<Map<string, RemotePeer>>>;
  setSelfId: React.Dispatch<React.SetStateAction<string | null>>;
}

interface PeersEnvelope {
  kind: "peers";
  self: { id: string; userId: string; displayName: string };
  peers: { id: string; userId: string; displayName: string }[];
}

interface PeerJoinedEnvelope {
  kind: "peer_joined";
  peer: { id: string; userId: string; displayName: string };
}

interface PeerLeftEnvelope {
  kind: "peer_left";
  peerId: string;
}

interface SignalEnvelope {
  kind: "signal";
  from: string;
  payload: RTCSessionDescriptionInit | RTCIceCandidateInit | { kind: "ice"; candidate: RTCIceCandidateInit };
}

function handleSignalingMessage(raw: unknown, ctx: SignalingCtx): void {
  if (typeof raw !== "string") return;
  let env: Record<string, unknown>;
  try {
    env = JSON.parse(raw);
  } catch {
    return;
  }
  switch (env.kind) {
    case "peers":
      handlePeersRoster(env as unknown as PeersEnvelope, ctx);
      return;
    case "peer_joined":
      handlePeerJoined(env as unknown as PeerJoinedEnvelope, ctx);
      return;
    case "peer_left":
      handlePeerLeft(env as unknown as PeerLeftEnvelope, ctx);
      return;
    case "signal":
      void handleSignal(env as unknown as SignalEnvelope, ctx);
      return;
  }
}

function handlePeersRoster(env: PeersEnvelope, ctx: SignalingCtx): void {
  ctx.setSelfId(env.self.id);
  // Initiate WebRTC offers to every existing peer (joiner is the
  // offerer; existing peers will answer). Lexicographic ordering
  // would also work; using "the new joiner offers" gives us a
  // deterministic, symmetric rule.
  for (const peer of env.peers) {
    void establishOutboundPeer(peer, ctx, true);
  }
}

function handlePeerJoined(env: PeerJoinedEnvelope, ctx: SignalingCtx): void {
  // Existing peers wait for the joiner to offer — they only register
  // the peer in their roster (with a placeholder state). The actual
  // RTC connection lights up when the joiner's offer arrives.
  ctx.peersRef.current.set(env.peer.id, {
    id: env.peer.id,
    userId: env.peer.userId,
    displayName: env.peer.displayName,
    position: [0, 1, 0],
    rotation: [0, 0, 0],
    score: 0,
    lastUpdateMs: Date.now(),
  });
  ctx.setPeers(new Map(ctx.peersRef.current));
}

function handlePeerLeft(env: PeerLeftEnvelope, ctx: SignalingCtx): void {
  const pc = ctx.peerConnsRef.current.get(env.peerId);
  if (pc) pc.close();
  ctx.peerConnsRef.current.delete(env.peerId);
  ctx.peersRef.current.delete(env.peerId);
  ctx.setPeers(new Map(ctx.peersRef.current));
}

async function handleSignal(env: SignalEnvelope, ctx: SignalingCtx): Promise<void> {
  const fromPeerId = env.from;
  const payload = env.payload as Record<string, unknown>;

  let pc = ctx.peerConnsRef.current.get(fromPeerId);
  if (!pc) {
    // Inbound offer — we're the answerer. Create the connection lazily.
    const peerMeta = ctx.peersRef.current.get(fromPeerId);
    if (!peerMeta) return; // Unknown peer — drop.
    pc = await establishOutboundPeer(
      { id: fromPeerId, userId: peerMeta.userId, displayName: peerMeta.displayName },
      ctx,
      false,
    );
    if (!pc) return;
  }

  if (payload.type === "offer" || payload.type === "answer") {
    // Cast via `unknown` — TS can't infer that a `Record<string,unknown>`
    // with `type === "offer" | "answer"` satisfies RTCSessionDescriptionInit
    // (the latter requires `sdp?: string`, which our envelope does carry
    // but isn't proven by the discriminant alone). The peer's wire shape
    // is validated by the RTC API itself when we call setRemoteDescription.
    await pc.handleDescription(payload as unknown as RTCSessionDescriptionInit);
  } else if ("candidate" in payload) {
    await pc.handleIce(payload as unknown as RTCIceCandidateInit);
  }
}

async function establishOutboundPeer(
  remote: { id: string; userId: string; displayName: string },
  ctx: SignalingCtx,
  initiator: boolean,
): Promise<PeerConn | null> {
  const ws = ctx.wsRef.current;
  if (!ws) return null;

  const pc = new PeerConn({
    remoteId: remote.id,
    initiator,
    sendSignal: (payload) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ kind: "signal", to: remote.id, payload }));
    },
    onMessage: (msg) => onPeerMessage(remote.id, msg, ctx),
    onClose: () => {
      ctx.peerConnsRef.current.delete(remote.id);
    },
  });
  ctx.peerConnsRef.current.set(remote.id, pc);

  // Make sure the peer is in the roster (handlePeerJoined would
  // populate it on a separate join event, but the initial peers list
  // doesn't fire that — fill in here).
  if (!ctx.peersRef.current.has(remote.id)) {
    ctx.peersRef.current.set(remote.id, {
      id: remote.id,
      userId: remote.userId,
      displayName: remote.displayName,
      position: [0, 1, 0],
      rotation: [0, 0, 0],
      score: 0,
      lastUpdateMs: Date.now(),
    });
    ctx.setPeers(new Map(ctx.peersRef.current));
  }

  if (initiator) {
    await pc.start();
  }
  return pc;
}

function onPeerMessage(peerId: string, msg: string, ctx: SignalingCtx): void {
  let env: Record<string, unknown>;
  try {
    env = JSON.parse(msg);
  } catch {
    return;
  }
  if (env.kind === "pos" && Array.isArray(env.position) && Array.isArray(env.rotation)) {
    const current = ctx.peersRef.current.get(peerId);
    if (!current) return;
    current.position = env.position as [number, number, number];
    current.rotation = env.rotation as [number, number, number];
    current.lastUpdateMs = Date.now();
    // No state update here — Scene3D reads from the ref via a
    // shallow throttled tick. Updating state every 15Hz would cause
    // a full React reconcile. The peers Map identity is stable; the
    // entries are mutated in place + the renderer reads on each
    // useFrame tick.
  }
}

// ─── PeerConn — thin wrapper around RTCPeerConnection ─────────────────

interface PeerConnOpts {
  remoteId: string;
  initiator: boolean;
  sendSignal: (payload: unknown) => void;
  onMessage: (msg: string) => void;
  onClose: () => void;
}

class PeerConn {
  private pc: RTCPeerConnection;
  private dc: RTCDataChannel | null = null;
  private remoteId: string;
  private sendSignal: PeerConnOpts["sendSignal"];
  private onMessage: PeerConnOpts["onMessage"];
  private onClose: PeerConnOpts["onClose"];

  constructor(opts: PeerConnOpts) {
    this.remoteId = opts.remoteId;
    this.sendSignal = opts.sendSignal;
    this.onMessage = opts.onMessage;
    this.onClose = opts.onClose;
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    this.pc.addEventListener("icecandidate", (e) => {
      if (e.candidate) this.sendSignal(e.candidate.toJSON());
    });
    this.pc.addEventListener("connectionstatechange", () => {
      const s = this.pc.connectionState;
      if (s === "failed" || s === "closed" || s === "disconnected") {
        this.onClose();
      }
    });
    this.pc.addEventListener("datachannel", (e) => {
      this.attachDataChannel(e.channel);
    });

    if (opts.initiator) {
      // Open the data channel on the initiator side; the answerer's
      // `datachannel` event picks it up.
      this.attachDataChannel(this.pc.createDataChannel("world", { ordered: false, maxRetransmits: 0 }));
    }
  }

  private attachDataChannel(dc: RTCDataChannel): void {
    this.dc = dc;
    dc.addEventListener("message", (e) => {
      if (typeof e.data === "string") this.onMessage(e.data);
    });
    dc.addEventListener("close", () => this.onClose());
  }

  async start(): Promise<void> {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.sendSignal({ type: offer.type, sdp: offer.sdp });
  }

  async handleDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    await this.pc.setRemoteDescription(desc);
    if (desc.type === "offer") {
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      this.sendSignal({ type: answer.type, sdp: answer.sdp });
    }
  }

  async handleIce(candidate: RTCIceCandidateInit): Promise<void> {
    try {
      await this.pc.addIceCandidate(candidate);
    } catch {
      // Late candidates after close — drop.
    }
  }

  send(payload: string): void {
    if (this.dc && this.dc.readyState === "open") {
      try {
        this.dc.send(payload);
      } catch {
        // Channel may have closed between the readyState check + send.
      }
    }
  }

  close(): void {
    try {
      this.dc?.close();
    } catch {
      // ignore
    }
    try {
      this.pc.close();
    } catch {
      // ignore
    }
  }
}
