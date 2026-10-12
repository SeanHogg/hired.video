/**
 * socialCallbackFailureReason — the social OAuth callback reports a stable
 * reason code (never a raw exception message) back to the page that started
 * the connect.
 *
 * Run: node --import tsx --test src/routes/__tests__/social-oauth-callback.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { socialCallbackFailureReason } from "../social-oauth-callback.js";
import { SocialConnectionError } from "../../services/social/social-connection-service.js";
import { SecretsError, encryptSocialSecret } from "../../services/social/secrets.js";

describe("socialCallbackFailureReason", () => {
  it("maps a missing token-encryption key (the prod LinkedIn failure) to not_configured", async () => {
    const err = await encryptSocialSecret({}, "token").catch((e: unknown) => e);
    assert.ok(err instanceof SecretsError);
    assert.equal(socialCallbackFailureReason(err), "not_configured");
  });

  it("maps service error codes", () => {
    assert.equal(socialCallbackFailureReason(new SocialConnectionError("SCOPES_NOT_GRANTED", "x")), "scopes_not_granted");
    assert.equal(socialCallbackFailureReason(new SocialConnectionError("NOT_CONFIGURED", "x")), "not_configured");
    assert.equal(socialCallbackFailureReason(new SocialConnectionError("INVALID_STATE", "x")), "exchange_failed");
  });

  it("never leaks an arbitrary message — unknown errors are exchange_failed", () => {
    assert.equal(socialCallbackFailureReason(new Error("token exchange failed: 401 secret detail")), "exchange_failed");
    assert.equal(socialCallbackFailureReason("boom"), "exchange_failed");
  });
});
