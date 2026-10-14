/**
 * #1658 / #3157 — signed-in unverified users must be allowed to stay on `/`
 * (the marketing homepage). `/` is exact-match only so it does not open the
 * rest of the app. Auth, legal, and verify-email prefixes stay allowed.
 */
import { describe, expect, it } from "vitest";
import {
  isVerificationAllowedPath,
  VERIFICATION_ALLOWED_PREFIXES,
} from "../verification-allowed-paths";

describe("isVerificationAllowedPath (#1658 / #3157)", () => {
  it("lists `/` so the marketing homepage is not bounced to /verify-email", () => {
    expect(VERIFICATION_ALLOWED_PREFIXES).toContain("/");
  });

  it("allows the marketing homepage exactly", () => {
    expect(isVerificationAllowedPath("/")).toBe(true);
  });

  it("does not treat every path as allowed just because `/` is on the list", () => {
    expect(isVerificationAllowedPath("/dashboard")).toBe(false);
    expect(isVerificationAllowedPath("/studio")).toBe(false);
    expect(isVerificationAllowedPath("/feed")).toBe(false);
    expect(isVerificationAllowedPath("/jobs")).toBe(false);
  });

  it("allows verify-email, auth, and legal prefixes (and their subpaths)", () => {
    expect(isVerificationAllowedPath("/verify-email")).toBe(true);
    expect(isVerificationAllowedPath("/confirm-email")).toBe(true);
    expect(isVerificationAllowedPath("/login")).toBe(true);
    expect(isVerificationAllowedPath("/signup")).toBe(true);
    expect(isVerificationAllowedPath("/signup-success")).toBe(true);
    expect(isVerificationAllowedPath("/forgot-password")).toBe(true);
    expect(isVerificationAllowedPath("/reset-password")).toBe(true);
    expect(isVerificationAllowedPath("/auth/callback")).toBe(true);
    expect(isVerificationAllowedPath("/auth/callback/google")).toBe(true);
    expect(isVerificationAllowedPath("/auth/magic-link")).toBe(true);
    expect(isVerificationAllowedPath("/accept-invitation")).toBe(true);
    expect(isVerificationAllowedPath("/logout")).toBe(true);
    expect(isVerificationAllowedPath("/privacy")).toBe(true);
    expect(isVerificationAllowedPath("/privacy/anything")).toBe(true);
    expect(isVerificationAllowedPath("/terms")).toBe(true);
    expect(isVerificationAllowedPath("/cookies")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isVerificationAllowedPath("/Verify-Email")).toBe(true);
    expect(isVerificationAllowedPath("/LOGIN")).toBe(true);
  });
});
