/**
 * Tests for the TOTP (RFC 6238) implementation.
 *
 * Verifies:
 *   • A round-trip: a code generated for `now` verifies in the same second.
 *   • Drift tolerance: ±1 step (~30s) verifies; ±2 steps does NOT.
 *   • Wrong format / wrong secret rejected.
 *
 * Run: node --import tsx --test src/services/__tests__/totp.test.ts
 */

import { describe, it, before, after } from "node:test";
import { mock } from "node:test";
import assert from "node:assert/strict";

import { verifyTotp } from "../auth/totp.js";

// Re-derive the same primitives the production code uses so the test
// can mint codes for arbitrary counters without exporting internals.
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Decode(b32: string): Uint8Array {
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (let i = 0; i < b32.length; i++) {
    const idx = BASE32.indexOf(b32[i]!);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}
async function totpAt(secret: string, counter: number): Promise<string> {
  const key = base32Decode(secret);
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  view.setUint32(0, Math.floor(counter / 0x100000000));
  view.setUint32(4, counter >>> 0);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, new Uint8Array(buf)));
  const offset = sig[sig.length - 1]! & 0x0f;
  const code =
    ((sig[offset]! & 0x7f) << 24) |
    ((sig[offset + 1]! & 0xff) << 16) |
    ((sig[offset + 2]! & 0xff) << 8) |
    (sig[offset + 3]! & 0xff);
  return (code % 10 ** 6).toString().padStart(6, "0");
}

const SECRET = "JBSWY3DPEHPK3PXP"; // Google Authenticator's canonical test vector

// Freeze the clock at a mid-step instant. Each test computes its `counter`
// from Date.now() and then verifyTotp() reads Date.now() again internally;
// without a frozen clock a TOTP step rollover landing between those two reads
// shifts the verification window and intermittently reds the build (e.g. a
// counter+2 code falls within verifyTotp's ±1 window). 1_700_000_000_000ms is
// ~0.67 of the way through its 30s step, far from either boundary.
const FROZEN_NOW_MS = 1_700_000_000_000;

describe("verifyTotp", () => {
  before(() => {
    mock.timers.enable({ apis: ["Date"], now: FROZEN_NOW_MS });
  });
  after(() => {
    mock.timers.reset();
  });

  it("accepts the code for the current step", async () => {
    const counter = Math.floor(Date.now() / 1000 / 30);
    const code = await totpAt(SECRET, counter);
    assert.equal(await verifyTotp(SECRET, code), true);
  });

  it("accepts the previous step (drift -1)", async () => {
    const counter = Math.floor(Date.now() / 1000 / 30);
    const code = await totpAt(SECRET, counter - 1);
    assert.equal(await verifyTotp(SECRET, code), true);
  });

  it("accepts the next step (drift +1)", async () => {
    const counter = Math.floor(Date.now() / 1000 / 30);
    const code = await totpAt(SECRET, counter + 1);
    assert.equal(await verifyTotp(SECRET, code), true);
  });

  it("rejects steps further than ±1", async () => {
    const counter = Math.floor(Date.now() / 1000 / 30);
    const farPast = await totpAt(SECRET, counter - 2);
    const farFuture = await totpAt(SECRET, counter + 2);
    assert.equal(await verifyTotp(SECRET, farPast), false);
    assert.equal(await verifyTotp(SECRET, farFuture), false);
  });

  it("rejects malformed inputs", async () => {
    assert.equal(await verifyTotp(SECRET, "12345"), false);
    assert.equal(await verifyTotp(SECRET, "abcdef"), false);
    assert.equal(await verifyTotp(SECRET, "1234567"), false);
    assert.equal(await verifyTotp(SECRET, ""), false);
  });

  it("rejects a valid-format code from a different secret", async () => {
    const counter = Math.floor(Date.now() / 1000 / 30);
    const otherSecret = "MFRGGZDFMZTWQ2LK";
    const code = await totpAt(otherSecret, counter);
    assert.equal(await verifyTotp(SECRET, code), false);
  });
});
