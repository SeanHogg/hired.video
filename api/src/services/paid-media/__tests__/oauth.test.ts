/**
 * Paid-media OAuth helper tests (#1344 — the paid-media domain had zero unit
 * tests). Covers the security-relevant pure surface: the signed OAuth `state`
 * round-trips and rejects a wrong secret / tampering / a missing secret, and
 * the workspace param serializes ↔ parses losslessly across all selection kinds.
 *
 * Run: node --import tsx --test src/services/paid-media/__tests__/oauth.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  signOAuthState,
  verifyOAuthState,
  parseWorkspaceParam,
  serializeWorkspace,
  type OAuthStateClaims,
} from "../oauth.js";

const ENV = { JWT_SECRET: "test-secret-please-rotate-in-prod-0123456789" };
const CLAIMS: OAuthStateClaims = {
  userId: "11111111-1111-4111-8111-111111111111",
  platform: "meta" as OAuthStateClaims["platform"],
  workspace: "company:22222222-2222-4222-8222-222222222222",
  redirectTo: "/advertising",
};

describe("signOAuthState / verifyOAuthState", () => {
  it("round-trips the claims", async () => {
    const state = await signOAuthState(ENV, CLAIMS);
    const out = await verifyOAuthState(ENV, state);
    assert.equal(out.userId, CLAIMS.userId);
    assert.equal(out.platform, CLAIMS.platform);
    assert.equal(out.workspace, CLAIMS.workspace);
    assert.equal(out.redirectTo, CLAIMS.redirectTo);
  });

  it("rejects a state signed with a different secret", async () => {
    const state = await signOAuthState({ JWT_SECRET: "a-totally-different-secret-value-here" }, CLAIMS);
    await assert.rejects(() => verifyOAuthState(ENV, state));
  });

  it("rejects a tampered token", async () => {
    const state = await signOAuthState(ENV, CLAIMS);
    // Flip a character in the payload segment.
    const parts = state.split(".");
    parts[1] = parts[1].slice(0, -1) + (parts[1].endsWith("A") ? "B" : "A");
    await assert.rejects(() => verifyOAuthState(ENV, parts.join(".")));
  });

  it("throws when the secret is not configured", async () => {
    await assert.rejects(() => signOAuthState({}, CLAIMS), /JWT_SECRET not configured/);
  });
});

describe("workspace param round-trip", () => {
  it("serializes and parses every selection kind losslessly", () => {
    const cases = [
      { kind: "personal" as const },
      { kind: "company" as const, companyId: "c-123" },
      { kind: "delegated" as const, subjectUserId: "u-456" },
    ];
    for (const sel of cases) {
      assert.deepEqual(parseWorkspaceParam(serializeWorkspace(sel)), sel);
    }
  });

  it("falls back to personal for empty / unknown input", () => {
    assert.deepEqual(parseWorkspaceParam(""), { kind: "personal" });
    assert.deepEqual(parseWorkspaceParam("garbage"), { kind: "personal" });
  });
});
