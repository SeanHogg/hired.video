/**
 * Tests for the shared validation schemas, focused on the two UUID
 * validators that gate every route + every domain schema in the API:
 *
 *   - `UuidSchema`     — strict RFC 4122 (Zod 4 `.uuid()`), reserved
 *                        for IDs generated fresh in app code.
 *   - `UuidLikeSchema` — permissive 8-4-4-4-12 hex, no version/variant
 *                        constraint. Required for IDs that arrive from
 *                        the DB because seed migrations cast
 *                        `md5(slug)::uuid` (no RFC variant bits).
 *
 * The split exists because a production support ticket (#1522) showed
 * the strict schema rejecting seed-derived lesson IDs — the variant
 * nibble landed outside `[89abAB]`. These tests pin both schemas to
 * their intended semantics so the next reviewer doesn't accidentally
 * swap one for the other.
 *
 * Run: node --import tsx --test shared/__tests__/validation.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  UUID_LIKE_REGEX,
  UuidLikeSchema,
  UuidSchema,
} from "../validation.js";
import {
  MAX_UUID,
  NIL_UUID,
  SEED_DERIVED_UUID,
  SHAPE_FAILURES,
  V1_UUID,
  V4_UUID,
  V7_UUID_RFC,
} from "./uuid-fixtures.js";

const {
  tooShort: TOO_SHORT,
  tooLong: TOO_LONG,
  nonHex: NON_HEX,
  wrongSeparators: WRONG_SEPARATORS,
  noSeparators: NO_SEPARATORS,
  trailingWhitespace: TRAILING_WHITESPACE,
  leadingWhitespace: LEADING_WHITESPACE,
  empty: EMPTY,
} = SHAPE_FAILURES;

describe("UUID_LIKE_REGEX (raw pattern)", () => {
  it("matches gen_random_uuid v4 output", () => {
    assert.equal(UUID_LIKE_REGEX.test(V4_UUID), true);
  });

  it("matches md5-seed-derived UUID (no RFC variant bits)", () => {
    assert.equal(UUID_LIKE_REGEX.test(SEED_DERIVED_UUID), true);
  });

  it("matches uppercase hex (server sometimes echoes uppercase)", () => {
    assert.equal(UUID_LIKE_REGEX.test(V4_UUID.toUpperCase()), true);
  });

  it("matches the all-zero nil UUID", () => {
    assert.equal(UUID_LIKE_REGEX.test(NIL_UUID), true);
  });

  it("matches the all-f max UUID", () => {
    assert.equal(UUID_LIKE_REGEX.test(MAX_UUID), true);
  });

  it("rejects shape length drift (one short, one long)", () => {
    assert.equal(UUID_LIKE_REGEX.test(TOO_SHORT), false);
    assert.equal(UUID_LIKE_REGEX.test(TOO_LONG), false);
  });

  it("rejects non-hex characters", () => {
    assert.equal(UUID_LIKE_REGEX.test(NON_HEX), false);
  });

  it("rejects wrong separator characters", () => {
    assert.equal(UUID_LIKE_REGEX.test(WRONG_SEPARATORS), false);
    assert.equal(UUID_LIKE_REGEX.test(NO_SEPARATORS), false);
  });

  it("rejects leading/trailing whitespace (anchored ^…$)", () => {
    assert.equal(UUID_LIKE_REGEX.test(LEADING_WHITESPACE), false);
    assert.equal(UUID_LIKE_REGEX.test(TRAILING_WHITESPACE), false);
  });

  it("rejects empty string", () => {
    assert.equal(UUID_LIKE_REGEX.test(EMPTY), false);
  });
});

describe("UuidLikeSchema — permissive (DB-row IDs)", () => {
  it("accepts a runtime-generated v4 UUID", () => {
    assert.equal(UuidLikeSchema.safeParse(V4_UUID).success, true);
  });

  it("accepts a seed-derived md5(slug)::uuid (regression for #1522)", () => {
    assert.equal(UuidLikeSchema.safeParse(SEED_DERIVED_UUID).success, true);
  });

  it("accepts v1 and RFC-compliant v7 UUIDs", () => {
    assert.equal(UuidLikeSchema.safeParse(V1_UUID).success, true);
    assert.equal(UuidLikeSchema.safeParse(V7_UUID_RFC).success, true);
  });

  it("accepts nil and max UUIDs", () => {
    assert.equal(UuidLikeSchema.safeParse(NIL_UUID).success, true);
    assert.equal(UuidLikeSchema.safeParse(MAX_UUID).success, true);
  });

  it("accepts uppercase hex", () => {
    assert.equal(UuidLikeSchema.safeParse(V4_UUID.toUpperCase()).success, true);
  });

  it("rejects shape length drift", () => {
    assert.equal(UuidLikeSchema.safeParse(TOO_SHORT).success, false);
    assert.equal(UuidLikeSchema.safeParse(TOO_LONG).success, false);
  });

  it("rejects non-hex, wrong separators, no separators", () => {
    assert.equal(UuidLikeSchema.safeParse(NON_HEX).success, false);
    assert.equal(UuidLikeSchema.safeParse(WRONG_SEPARATORS).success, false);
    assert.equal(UuidLikeSchema.safeParse(NO_SEPARATORS).success, false);
  });

  it("rejects leading/trailing whitespace", () => {
    assert.equal(UuidLikeSchema.safeParse(LEADING_WHITESPACE).success, false);
    assert.equal(UuidLikeSchema.safeParse(TRAILING_WHITESPACE).success, false);
  });

  it("rejects empty string, null, undefined, numbers, objects", () => {
    assert.equal(UuidLikeSchema.safeParse(EMPTY).success, false);
    assert.equal(UuidLikeSchema.safeParse(null).success, false);
    assert.equal(UuidLikeSchema.safeParse(undefined).success, false);
    assert.equal(UuidLikeSchema.safeParse(42).success, false);
    assert.equal(UuidLikeSchema.safeParse({}).success, false);
    assert.equal(UuidLikeSchema.safeParse([V4_UUID]).success, false);
  });

  it("surfaces 'Invalid UUID format' when the shape fails", () => {
    const r = UuidLikeSchema.safeParse("not-a-uuid");
    assert.equal(r.success, false);
    if (!r.success) {
      assert.equal(r.error.issues[0]?.message, "Invalid UUID format");
    }
  });
});

describe("UuidSchema — strict RFC 4122 (app-generated IDs only)", () => {
  it("accepts a runtime-generated v4 UUID", () => {
    assert.equal(UuidSchema.safeParse(V4_UUID).success, true);
  });

  it("accepts v1 and RFC-compliant v7 UUIDs (variant is `[89abAB]`)", () => {
    assert.equal(UuidSchema.safeParse(V1_UUID).success, true);
    assert.equal(UuidSchema.safeParse(V7_UUID_RFC).success, true);
  });

  // This is the contract that motivated #1522: strict UuidSchema MUST
  // reject seed-derived UUIDs so any caller that still uses it knows
  // it's only safe for IDs generated by gen_random_uuid()/randomUUID().
  it("rejects seed-derived md5(slug)::uuid (non-RFC variant — by design)", () => {
    assert.equal(UuidSchema.safeParse(SEED_DERIVED_UUID).success, false);
  });

  it("rejects shape failures (length, non-hex, separators)", () => {
    assert.equal(UuidSchema.safeParse(TOO_SHORT).success, false);
    assert.equal(UuidSchema.safeParse(TOO_LONG).success, false);
    assert.equal(UuidSchema.safeParse(NON_HEX).success, false);
    assert.equal(UuidSchema.safeParse(WRONG_SEPARATORS).success, false);
  });

  it("rejects empty, null, undefined, non-string types", () => {
    assert.equal(UuidSchema.safeParse(EMPTY).success, false);
    assert.equal(UuidSchema.safeParse(null).success, false);
    assert.equal(UuidSchema.safeParse(undefined).success, false);
    assert.equal(UuidSchema.safeParse(42).success, false);
  });
});
