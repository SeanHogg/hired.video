/**
 * Tests for the StudioRoom client protocol reducer (`handleMessage`) and the
 * socket-URL builder (gap #2243). Pins the wire contract the real-time
 * collaboration layer depends on:
 *   - `sync` seeds selfId / host / peers + adopts the authoritative version
 *     and applies the doc.
 *   - `edit` applies ONLY newer versions (monotonic ordering drops stale /
 *     echoed frames) and advances the version cursor.
 *   - `peer_joined` / `peer_left` maintain the roster without duplicates.
 *   - `host_changed` flips host status by comparing against selfId.
 *   - malformed frames are dropped.
 *   - the socket URL carries the token + ws(s) scheme; null without a token.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { handleMessage, type CollabPeer } from "../use-studio-room";
import { studioCollabSocketUrl } from "../studio-collab-api";

/** Build a ctx whose setters mutate a captured store, mirroring the hook's
 *  React state so assertions read like the live behaviour. */
function makeCtx(initial?: { selfId?: string; isHost?: boolean; peers?: CollabPeer[]; version?: number }) {
  const store = {
    selfId: initial?.selfId ?? null as string | null,
    isHost: initial?.isHost ?? false,
    peers: initial?.peers ?? ([] as CollabPeer[]),
  };
  const versionRef = { current: initial?.version ?? 0 };
  const applied: unknown[] = [];
  const ctx = {
    setSelfId: (u: React.SetStateAction<string | null>) => {
      store.selfId = typeof u === "function" ? (u as (p: string | null) => string | null)(store.selfId) : u;
    },
    setIsHost: (u: React.SetStateAction<boolean>) => {
      store.isHost = typeof u === "function" ? (u as (p: boolean) => boolean)(store.isHost) : u;
    },
    setPeers: (u: React.SetStateAction<CollabPeer[]>) => {
      store.peers = typeof u === "function" ? (u as (p: CollabPeer[]) => CollabPeer[])(store.peers) : u;
    },
    lastVersionRef: versionRef,
    applyRemote: (doc: unknown) => applied.push(doc),
  };
  return { ctx, store, versionRef, applied };
}

const peerA: CollabPeer = { id: "s1", userId: "u1", displayName: "Ann" };
const peerB: CollabPeer = { id: "s2", userId: "u2", displayName: "Bob" };

describe("handleMessage", () => {
  it("sync seeds self/host/peers + version + applies the doc", () => {
    const { ctx, store, versionRef, applied } = makeCtx();
    handleMessage(
      JSON.stringify({ kind: "sync", self: peerA, peers: [peerB], isHost: true, version: 7, doc: { title: "X" } }),
      ctx,
    );
    expect(store.selfId).toBe("s1");
    expect(store.isHost).toBe(true);
    expect(store.peers).toEqual([peerB]);
    expect(versionRef.current).toBe(7);
    expect(applied).toEqual([{ title: "X" }]);
  });

  it("sync with null doc does not apply", () => {
    const { ctx, applied } = makeCtx();
    handleMessage(JSON.stringify({ kind: "sync", self: peerA, peers: [], isHost: true, version: 0, doc: null }), ctx);
    expect(applied).toEqual([]);
  });

  it("edit applies a newer version and advances the cursor", () => {
    const { ctx, versionRef, applied } = makeCtx({ version: 3 });
    handleMessage(JSON.stringify({ kind: "edit", from: "s2", version: 4, doc: { v: 4 } }), ctx);
    expect(versionRef.current).toBe(4);
    expect(applied).toEqual([{ v: 4 }]);
  });

  it("edit drops stale / equal versions (echo guard)", () => {
    const { ctx, versionRef, applied } = makeCtx({ version: 5 });
    handleMessage(JSON.stringify({ kind: "edit", from: "s2", version: 5, doc: { v: 5 } }), ctx);
    handleMessage(JSON.stringify({ kind: "edit", from: "s2", version: 2, doc: { v: 2 } }), ctx);
    expect(versionRef.current).toBe(5);
    expect(applied).toEqual([]);
  });

  it("peer_joined adds without duplicating", () => {
    const { ctx, store } = makeCtx({ peers: [peerA] });
    handleMessage(JSON.stringify({ kind: "peer_joined", peer: peerB }), ctx);
    handleMessage(JSON.stringify({ kind: "peer_joined", peer: peerB }), ctx);
    expect(store.peers).toEqual([peerA, peerB]);
  });

  it("peer_left removes by id", () => {
    const { ctx, store } = makeCtx({ peers: [peerA, peerB] });
    handleMessage(JSON.stringify({ kind: "peer_left", peerId: "s1" }), ctx);
    expect(store.peers).toEqual([peerB]);
  });

  it("host_changed promotes me when the new host is my session", () => {
    const { ctx, store } = makeCtx({ selfId: "s2", isHost: false });
    handleMessage(JSON.stringify({ kind: "host_changed", hostSessionId: "s2" }), ctx);
    expect(store.isHost).toBe(true);
  });

  it("host_changed demotes me when the new host is someone else", () => {
    const { ctx, store } = makeCtx({ selfId: "s2", isHost: true });
    handleMessage(JSON.stringify({ kind: "host_changed", hostSessionId: "s1" }), ctx);
    expect(store.isHost).toBe(false);
  });

  it("drops malformed frames", () => {
    const { ctx, store, applied } = makeCtx({ peers: [peerA] });
    handleMessage("not json", ctx);
    handleMessage(JSON.stringify({ kind: "unknown" }), ctx);
    expect(store.peers).toEqual([peerA]);
    expect(applied).toEqual([]);
  });
});

describe("studioCollabSocketUrl", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      store: {} as Record<string, string>,
      getItem(k: string) {
        return this.store[k] ?? null;
      },
      setItem(k: string, v: string) {
        this.store[k] = v;
      },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null without an auth token", () => {
    expect(studioCollabSocketUrl("proj-1")).toBeNull();
  });

  it("builds a wss URL carrying the token + projectId", () => {
    globalThis.localStorage.setItem("auth_token", "jwt-123");
    const url = studioCollabSocketUrl("proj-1");
    expect(url).toBeTruthy();
    const parsed = new URL(String(url));
    expect(parsed.protocol).toMatch(/^wss?:$/);
    expect(parsed.pathname).toContain("/api/studio/proj-1/collab-socket");
    expect(parsed.searchParams.get("access_token")).toBe("jwt-123");
  });
});
