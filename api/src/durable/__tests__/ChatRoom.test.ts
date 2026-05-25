/**
 * Pure-helper test for the chat-room presence-payload builder. The
 * Durable Object wiring (acceptWebSocket, hibernation, broadcast) lives
 * behind the Cloudflare runtime and isn't easily mockable in a node:test
 * runner — but the dedup invariant on the presence list IS pure, and
 * dedup correctness is what the UI's "X is online" pill renders against,
 * so it gets locked down here.
 *
 * Run: node --import tsx --test src/durable/__tests__/ChatRoom.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildPresencePayload } from "../ChatRoom.js";

describe("buildPresencePayload", () => {
  it("dedups multiple sockets for the same user (multi-tab)", () => {
    const payload = buildPresencePayload(["alice", "bob", "alice", "alice"]);
    assert.deepEqual([...payload.online].sort(), ["alice", "bob"]);
  });

  it("returns an empty list for an empty input", () => {
    assert.deepEqual(buildPresencePayload([]), { kind: "presence", online: [] });
  });

  it("preserves order of first appearance", () => {
    const payload = buildPresencePayload(["carol", "alice", "bob", "alice"]);
    assert.deepEqual(payload.online, ["carol", "alice", "bob"]);
  });

  it("carries the correct envelope kind", () => {
    assert.equal(buildPresencePayload(["x"]).kind, "presence");
  });
});
