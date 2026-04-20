/**
 * Schema + pure-helper tests for the auth surface.
 *
 * Covers:
 *   • LoginSchema                        — email normalisation, password length
 *   • RegisterSchema                     — all 4 user roles (job_seeker /
 *                                          recruiter / employer / admin),
 *                                          PascalCase role normalisation,
 *                                          name vs firstName/lastName,
 *                                          email+password validation
 *   • ForgotPasswordSchema               — email required
 *   • ResetPasswordSchema                — token + password min length
 *   • VerifyEmailSchema                  — token required
 *   • VerifyTwoFactorSchema              — token + code required
 *   • ResendTwoFactorSchema              — token required
 *   • hashPassword / verifyPassword      — PBKDF2 round trip, salt uniqueness
 *   • generateVerificationCode           — 6-digit numeric code
 *
 * These are the highest-value unit tests we can write for the auth module
 * without a real database. Route-level handler tests live in a separate
 * file and stub getDb().
 *
 * Run: node --import tsx --test src/routes/__tests__/auth-schemas.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  LoginSchema,
  RegisterSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  VerifyEmailSchema,
  VerifyTwoFactorSchema,
  ResendTwoFactorSchema,
  hashPassword,
  verifyPassword,
  generateVerificationCode,
} from "../auth.js";

// ═══════════════════════════════════════════════════════════════════════════
// LoginSchema
// ═══════════════════════════════════════════════════════════════════════════

describe("LoginSchema", () => {
  it("accepts a valid email + password pair", () => {
    const r = LoginSchema.safeParse({ email: "user@example.com", password: "secret1" });
    assert.equal(r.success, true);
  });

  it("lowercases the email (case-insensitive login)", () => {
    const r = LoginSchema.parse({ email: "User@Example.COM", password: "secret1" });
    assert.equal(r.email, "user@example.com");
  });

  it("rejects invalid email formats", () => {
    assert.equal(LoginSchema.safeParse({ email: "not-an-email", password: "secret1" }).success, false);
    assert.equal(LoginSchema.safeParse({ email: "", password: "secret1" }).success, false);
  });

  it("rejects passwords shorter than 6 characters", () => {
    assert.equal(LoginSchema.safeParse({ email: "u@e.com", password: "short" }).success, false);
    assert.equal(LoginSchema.safeParse({ email: "u@e.com", password: "" }).success, false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// RegisterSchema — all roles + shape
// ═══════════════════════════════════════════════════════════════════════════

describe("RegisterSchema — role normalisation", () => {
  const base = { email: "new@example.com", password: "password123", name: "New User" };

  it("accepts the canonical lower_snake role values", () => {
    for (const role of ["job_seeker", "recruiter", "employer", "admin"]) {
      const r = RegisterSchema.safeParse({ ...base, role });
      assert.equal(r.success, true, `should accept "${role}"`);
      if (r.success) assert.equal(r.data.role, role);
    }
  });

  it("rejects PascalCase roles — clients must send the canonical snake_case value", () => {
    // The schema deliberately does NOT normalise "JobSeeker" → "job_seeker"
    // any more; both sides of the wire agree on one form (shared/user-roles.ts).
    for (const bad of ["JobSeeker", "Recruiter", "Employer", "Admin"]) {
      assert.equal(
        RegisterSchema.safeParse({ ...base, role: bad }).success,
        false,
        `should reject PascalCase "${bad}"`,
      );
    }
  });

  it("rejects 'affiliate' as a role — affiliate is a service, not a role", () => {
    // Affiliate status is controlled by `enableAffiliate: true`. The
    // underlying role must still be one of the four enum values.
    assert.equal(RegisterSchema.safeParse({ ...base, role: "affiliate" }).success, false);
    assert.equal(RegisterSchema.safeParse({ ...base, role: "Affiliate" }).success, false);
  });

  it("defaults to job_seeker when no role is supplied", () => {
    assert.equal(RegisterSchema.parse(base).role, "job_seeker");
  });

  it("rejects unknown role strings", () => {
    const r = RegisterSchema.safeParse({ ...base, role: "god_emperor" });
    assert.equal(r.success, false);
  });

  it("rejects the Candidate role (not a separate tier — job_seeker covers it)", () => {
    // The register endpoint intentionally does NOT accept "candidate" as a
    // separate role; the JobSeeker tier is the canonical name. If this
    // changes, the roles enum must change too — tests then update here.
    const r = RegisterSchema.safeParse({ ...base, role: "candidate" });
    assert.equal(r.success, false);
  });

  it("rejects the SuperAdmin role at registration (must be granted post-hoc)", () => {
    // SuperAdmin is a DB-level flag, never set via self-service signup.
    const r = RegisterSchema.safeParse({ ...base, role: "SuperAdmin" });
    assert.equal(r.success, false);
  });
});

describe("RegisterSchema — name shape", () => {
  const baseRole = { email: "u@e.com", password: "password123", role: "job_seeker" };

  it("accepts a single `name` field", () => {
    const r = RegisterSchema.safeParse({ ...baseRole, name: "Ada Lovelace" });
    assert.equal(r.success, true);
  });

  it("accepts firstName + lastName pair", () => {
    const r = RegisterSchema.safeParse({ ...baseRole, firstName: "Ada", lastName: "Lovelace" });
    assert.equal(r.success, true);
  });

  it("accepts firstName alone or lastName alone", () => {
    assert.equal(RegisterSchema.safeParse({ ...baseRole, firstName: "Ada" }).success, true);
    assert.equal(RegisterSchema.safeParse({ ...baseRole, lastName: "Lovelace" }).success, true);
  });

  it("rejects payloads with neither name nor firstName/lastName", () => {
    const r = RegisterSchema.safeParse(baseRole);
    assert.equal(r.success, false);
    if (!r.success) {
      const msg = r.error.issues.find((i) => i.path.includes("name"))?.message ?? "";
      assert.match(msg, /name|firstName|lastName/);
    }
  });
});

describe("RegisterSchema — credentials", () => {
  const baseUser = { name: "Test User", role: "job_seeker" };

  it("rejects invalid emails", () => {
    assert.equal(RegisterSchema.safeParse({ ...baseUser, email: "notemail", password: "password123" }).success, false);
  });

  it("lowercases the email on registration", () => {
    const r = RegisterSchema.parse({ ...baseUser, email: "New@Example.COM", password: "password123" });
    assert.equal(r.email, "new@example.com");
  });

  it("rejects passwords shorter than 8 characters (stricter than login for new accounts)", () => {
    assert.equal(RegisterSchema.safeParse({ ...baseUser, email: "u@e.com", password: "short12" }).success, false);
    assert.equal(RegisterSchema.safeParse({ ...baseUser, email: "u@e.com", password: "" }).success, false);
  });

  it("accepts the enableAffiliate flag", () => {
    const r = RegisterSchema.parse({ ...baseUser, email: "u@e.com", password: "password123", enableAffiliate: true });
    assert.equal(r.enableAffiliate, true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Password-recovery + verification schemas
// ═══════════════════════════════════════════════════════════════════════════

describe("ForgotPasswordSchema", () => {
  it("accepts a valid email", () => {
    assert.equal(ForgotPasswordSchema.safeParse({ email: "user@example.com" }).success, true);
  });

  it("rejects missing or malformed email", () => {
    assert.equal(ForgotPasswordSchema.safeParse({}).success, false);
    assert.equal(ForgotPasswordSchema.safeParse({ email: "" }).success, false);
    assert.equal(ForgotPasswordSchema.safeParse({ email: "nope" }).success, false);
  });
});

describe("ResetPasswordSchema", () => {
  it("accepts a token + new password", () => {
    assert.equal(
      ResetPasswordSchema.safeParse({ token: "abcdef", password: "newpass123" }).success,
      true,
    );
  });

  it("rejects an empty token", () => {
    assert.equal(ResetPasswordSchema.safeParse({ token: "", password: "newpass123" }).success, false);
  });

  it("rejects passwords shorter than 8 chars", () => {
    assert.equal(ResetPasswordSchema.safeParse({ token: "abc", password: "short12" }).success, false);
  });
});

describe("VerifyEmailSchema", () => {
  it("accepts a non-empty token", () => {
    assert.equal(VerifyEmailSchema.safeParse({ token: "verification-token-xyz" }).success, true);
  });

  it("rejects missing or empty token", () => {
    assert.equal(VerifyEmailSchema.safeParse({}).success, false);
    assert.equal(VerifyEmailSchema.safeParse({ token: "" }).success, false);
  });
});

describe("VerifyTwoFactorSchema", () => {
  it("accepts both tempAuthToken and verificationCode", () => {
    assert.equal(
      VerifyTwoFactorSchema.safeParse({ tempAuthToken: "abc", verificationCode: "123456" }).success,
      true,
    );
  });

  it("rejects missing tempAuthToken", () => {
    assert.equal(
      VerifyTwoFactorSchema.safeParse({ verificationCode: "123456" }).success,
      false,
    );
  });

  it("rejects missing verificationCode", () => {
    assert.equal(
      VerifyTwoFactorSchema.safeParse({ tempAuthToken: "abc" }).success,
      false,
    );
  });

  it("rejects empty strings on either field", () => {
    assert.equal(
      VerifyTwoFactorSchema.safeParse({ tempAuthToken: "", verificationCode: "123456" }).success,
      false,
    );
    assert.equal(
      VerifyTwoFactorSchema.safeParse({ tempAuthToken: "abc", verificationCode: "" }).success,
      false,
    );
  });
});

describe("ResendTwoFactorSchema", () => {
  it("accepts a non-empty token", () => {
    assert.equal(ResendTwoFactorSchema.safeParse({ tempAuthToken: "abc" }).success, true);
  });

  it("rejects empty or missing token", () => {
    assert.equal(ResendTwoFactorSchema.safeParse({}).success, false);
    assert.equal(ResendTwoFactorSchema.safeParse({ tempAuthToken: "" }).success, false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// hashPassword / verifyPassword — PBKDF2 round trip
// ═══════════════════════════════════════════════════════════════════════════

describe("hashPassword / verifyPassword", () => {
  it("verifies a password hashed with the same function (round trip)", async () => {
    const hash = await hashPassword("correct horse battery staple");
    assert.equal(await verifyPassword("correct horse battery staple", hash), true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("password123");
    assert.equal(await verifyPassword("wrong-password", hash), false);
  });

  it("produces different hashes for the same password (random salt)", async () => {
    const h1 = await hashPassword("password123");
    const h2 = await hashPassword("password123");
    assert.notEqual(h1, h2, "salt must differ between calls");
    // Both must still verify
    assert.equal(await verifyPassword("password123", h1), true);
    assert.equal(await verifyPassword("password123", h2), true);
  });

  it("emits salt:hash format", async () => {
    const hash = await hashPassword("password123");
    assert.match(hash, /^[0-9a-f]{32}:[0-9a-f]{64}$/);
  });

  it("verifyPassword returns false on null/undefined/empty stored hash (deleted/no password)", async () => {
    assert.equal(await verifyPassword("anything", null), false);
    assert.equal(await verifyPassword("anything", undefined), false);
    assert.equal(await verifyPassword("anything", ""), false);
  });

  it("verifyPassword returns false on malformed stored hash", async () => {
    assert.equal(await verifyPassword("password", "not-a-valid-hash"), false);
    assert.equal(await verifyPassword("password", "missingcolon"), false);
    // Valid-looking salt:hash separator but hex digits are nonsense — still false.
    assert.equal(await verifyPassword("password", "only:one"), false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// generateVerificationCode
// ═══════════════════════════════════════════════════════════════════════════

describe("generateVerificationCode", () => {
  it("returns a 6-digit numeric string", () => {
    for (let i = 0; i < 20; i++) {
      const code = generateVerificationCode();
      assert.equal(code.length, 6);
      assert.match(code, /^\d{6}$/);
    }
  });

  it("is not deterministic (different calls produce different codes sometimes)", () => {
    // 6 random digits = 10^6 outcomes; over 50 calls we should see at least
    // one pair that differs (probability of all-same is ~1e-294).
    const codes = new Set<string>();
    for (let i = 0; i < 50; i++) codes.add(generateVerificationCode());
    assert.ok(codes.size > 1, "expected varied codes across 50 calls");
  });
});
