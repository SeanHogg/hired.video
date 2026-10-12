/**
 * Tests for AES-256-GCM tax-ID encryption used by the payouts pipeline.
 *
 * These are pure-function tests with no DB dependency — they exercise the
 * happy path, key/nonce edge cases, and tamper-detection guarantees the
 * GCM tag is supposed to enforce. The encryption helper is the only thing
 * standing between a database leak and unredacted SSN/EIN/foreign-TIN
 * exposure, so it gets covered before the launch worker ships.
 *
 * Run: node --import tsx --test src/services/__tests__/payout-encryption.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import {
  encryptTaxId,
  decryptTaxId,
  generateTaxIdKey,
} from "../payout/encryption.js";

function freshEnv(): Record<string, string | undefined> {
  return {
    PAYOUT_TAX_ID_KEY: randomBytes(32).toString("base64"),
    PAYOUT_TAX_ID_KEY_ID: "v1",
  };
}

describe("payout/encryption", () => {
  it("round-trips an SSN", async () => {
    const env = freshEnv();
    const enc = await encryptTaxId("123456789", env);
    assert.equal(enc.kmsKeyId, "v1");
    assert.equal(enc.nonce.length, 12);
    // ciphertext is plaintext + 16-byte GCM tag
    assert.equal(enc.ciphertext.length, 9 + 16);

    const decoded = await decryptTaxId(enc.ciphertext, enc.nonce, env);
    assert.equal(decoded, "123456789");
  });

  it("round-trips a longer foreign TIN", async () => {
    const env = freshEnv();
    const plaintext = "GBR-1234-5678-90AB";
    const enc = await encryptTaxId(plaintext, env);
    const decoded = await decryptTaxId(enc.ciphertext, enc.nonce, env);
    assert.equal(decoded, plaintext);
  });

  it("uses a different nonce for repeated encryptions of the same value", async () => {
    const env = freshEnv();
    const a = await encryptTaxId("111223333", env);
    const b = await encryptTaxId("111223333", env);
    assert.notDeepStrictEqual(a.nonce, b.nonce);
    assert.notDeepStrictEqual(a.ciphertext, b.ciphertext);
  });

  it("captures the active key id so rotation can find rows wrapped under prior keys", async () => {
    const env = { ...freshEnv(), PAYOUT_TAX_ID_KEY_ID: "v7" };
    const enc = await encryptTaxId("999999999", env);
    assert.equal(enc.kmsKeyId, "v7");
  });

  it("throws when PAYOUT_TAX_ID_KEY is missing", async () => {
    await assert.rejects(() => encryptTaxId("123", {}), /PAYOUT_TAX_ID_KEY/);
  });

  it("throws when PAYOUT_TAX_ID_KEY is not 32 bytes", async () => {
    await assert.rejects(
      () => encryptTaxId("123", { PAYOUT_TAX_ID_KEY: "dGVzdA==" }), // 4 bytes
      /32-byte/,
    );
  });

  it("rejects a tampered ciphertext via the GCM tag", async () => {
    const env = freshEnv();
    const enc = await encryptTaxId("123456789", env);
    const tampered = Buffer.from(enc.ciphertext);
    // Flip a bit in the encrypted payload (not the tag region) so the auth
    // tag verification fails on decrypt instead of producing garbled output.
    tampered[0] ^= 0x01;
    await assert.rejects(() => decryptTaxId(tampered, enc.nonce, env), /Unsupported|tag/i);
  });

  it("rejects a wrong-length nonce", async () => {
    const env = freshEnv();
    const enc = await encryptTaxId("123", env);
    const wrongNonce = Buffer.alloc(8); // GCM standard is 12
    await assert.rejects(() => decryptTaxId(enc.ciphertext, wrongNonce, env), /Nonce must be/);
  });

  it("generateTaxIdKey produces a 32-byte base64 value usable by encryptTaxId", async () => {
    const key = await generateTaxIdKey();
    const buf = Buffer.from(key, "base64");
    assert.equal(buf.length, 32);

    const env = { PAYOUT_TAX_ID_KEY: key };
    const enc = await encryptTaxId("424242424", env);
    const decoded = await decryptTaxId(enc.ciphertext, enc.nonce, env);
    assert.equal(decoded, "424242424");
  });
});
