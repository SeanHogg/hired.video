/**
 * /api/security/* — geo-eligibility check, region waitlist, TOTP setup,
 * backup codes management. Mounted at /api/security in the worker.
 *
 * Each handler is a thin adapter; business logic lives in services/auth/*.
 */

import { Hono } from "hono";
import { jwtVerify } from "jose";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { getJwtSecret } from "../utils/jwt.js";
import { classifySignupEligibility, detectCountry } from "../services/auth/geo.js";
import { recordBotBlock } from "../services/auth/botBlock.js";
import {
  beginTotpSetup,
  confirmTotpSetup,
  disableTotp,
  verifyTotp,
} from "../services/auth/totp.js";
import {
  generateBackupCodes,
  countUnusedBackupCodes,
} from "../services/auth/backupCodes.js";
import { mintTrustedDeviceCookie } from "../services/auth/trustedDevice.js";

const { users, regionWaitlist } = schema;

export const securityRoutes = new Hono<{ Variables: Variables }>();

async function requireUserId(c: any): Promise<string | null> {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const { payload } = await jwtVerify(
      authHeader.slice(7),
      new TextEncoder().encode(getJwtSecret()),
      { algorithms: ["HS256"] },
    );
    return (payload.sub as string) ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------
// Geo eligibility — public. The FE register page calls this and self-
// hides / shows-waitlist accordingly. No canSignup prop drilling.
// ---------------------------------------------------------------------
securityRoutes.get("/geo/eligible", (c) => {
  const country = detectCountry({
    get: (name: string) => (c.req.header(name) as string | null) ?? null,
  });
  const eligibility = classifySignupEligibility(country);
  return c.json(success({ countryCode: country, eligibility }));
});

// ---------------------------------------------------------------------
// Region waitlist — out-of-region users register interest. Public.
// Same email + status='pending' is unique by partial index, so the
// route is naturally idempotent.
// ---------------------------------------------------------------------

const RegionWaitlistSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
  reason: z.string().max(500).optional(),
});

securityRoutes.post("/region-waitlist", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = RegionWaitlistSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request body"), 400);
  }
  const country = detectCountry({
    get: (name: string) => (c.req.header(name) as string | null) ?? null,
  });
  if (!country) {
    return c.json(error("UNKNOWN_COUNTRY", "Could not determine country"), 400);
  }
  const eligibility = classifySignupEligibility(country);
  if (eligibility === "allowed") {
    return c.json(error("CONFLICT", "Your country is already supported. Please sign up directly."), 409);
  }
  const db = getDb();
  // Insert; on duplicate (same email+pending) the unique index will
  // throw — we catch and return 200 since the user-visible outcome is
  // the same: "you're on the list".
  try {
    await db.insert(regionWaitlist).values({
      email: parsed.data.email,
      countryCode: country,
      reason: parsed.data.reason ?? null,
    } as any);
  } catch {
    // Already on list — same response.
  }
  // Telemetry: this user wanted to sign up but couldn't.
  await recordBotBlock({
    db,
    endpoint: "region-waitlist",
    reason: eligibility === "sanctioned" ? "OFAC_BLOCKED" : "GEO_BLOCKED",
    countryCode: country,
    email: parsed.data.email,
  });
  return c.json(success({ recorded: true }), 200);
});

// ---------------------------------------------------------------------
// TOTP setup / verify / disable
// ---------------------------------------------------------------------

securityRoutes.post("/totp/setup", async (c) => {
  const userId = await requireUserId(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Auth required"), 401);
  const db = getDb();
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return c.json(error("NOT_FOUND", "User not found"), 404);
  const setup = await beginTotpSetup(db, userId, user.email);
  return c.json(success(setup));
});

const ConfirmTotpSchema = z.object({ code: z.string().regex(/^\d{6}$/) });

securityRoutes.post("/totp/confirm", async (c) => {
  const userId = await requireUserId(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Auth required"), 401);
  const body = await c.req.json().catch(() => null);
  const parsed = ConfirmTotpSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request body"), 400);
  const db = getDb();
  const ok = await confirmTotpSetup(db, userId, parsed.data.code);
  if (!ok) return c.json(error("INVALID_CODE", "Invalid TOTP code"), 400);
  // First-time enable also seeds backup codes — show plaintext once.
  const codes = await generateBackupCodes(db, userId);
  return c.json(success({ enabled: true, backupCodes: codes }));
});

securityRoutes.post("/totp/disable", async (c) => {
  const userId = await requireUserId(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Auth required"), 401);
  const body = await c.req.json().catch(() => null);
  const parsed = ConfirmTotpSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request body"), 400);
  const db = getDb();
  const ok = await disableTotp(db, userId, parsed.data.code);
  if (!ok) return c.json(error("INVALID_CODE", "Invalid TOTP code"), 400);
  return c.json(success({ disabled: true }));
});

// ---------------------------------------------------------------------
// Backup codes — count + regenerate
// ---------------------------------------------------------------------

securityRoutes.get("/backup-codes/count", async (c) => {
  const userId = await requireUserId(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Auth required"), 401);
  const db = getDb();
  const remaining = await countUnusedBackupCodes(db, userId);
  return c.json(success({ remaining }));
});

securityRoutes.post("/backup-codes/regenerate", async (c) => {
  const userId = await requireUserId(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Auth required"), 401);
  const db = getDb();
  const codes = await generateBackupCodes(db, userId);
  return c.json(success({ codes }));
});

// ---------------------------------------------------------------------
// Trust device — set the HMAC-signed cookie. Called by the FE after a
// successful 2FA verify when the user ticked "trust this device".
// ---------------------------------------------------------------------
securityRoutes.post("/trust-device", async (c) => {
  const userId = await requireUserId(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Auth required"), 401);
  const cookie = await mintTrustedDeviceCookie(userId);
  c.header(
    "Set-Cookie",
    `hv_trusted_device=${encodeURIComponent(cookie)}; Path=/; Max-Age=${30 * 24 * 60 * 60}; HttpOnly; Secure; SameSite=Lax`,
    { append: true },
  );
  return c.json(success({ trusted: true }));
});
