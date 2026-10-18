/**
 * /api/security/* — geo-eligibility check, region waitlist, TOTP setup,
 * backup codes management. Mounted at /api/security in the worker.
 *
 * Each handler is a thin adapter; business logic lives in services/auth/*.
 */

import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { requireUser } from "./helpers/routerHelpers.js";
import { classifySignupEligibility, detectCountry } from "../services/auth/geo.js";
import { joinRegionWaitlist } from "../services/auth/regionWaitlist.js";
import {
  countBackupCodes,
  enableTotp,
  regenerateBackupCodes,
  startTotpSetup,
  turnOffTotp,
} from "../services/auth/twoFactorSettings.js";
import { mintTrustedDeviceCookie } from "../services/auth/trustedDevice.js";
import { validateJson } from "./helpers/validate.js";

export const securityRoutes = new Hono<AppEnv>();

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

securityRoutes.post("/region-waitlist", validateJson(RegionWaitlistSchema, () => error("VALIDATION_ERROR", "Invalid request body"), { emptyBody: null }), async (c) => {
  const body = c.req.valid("json");
  const country = detectCountry({
    get: (name: string) => (c.req.header(name) as string | null) ?? null,
  });
  // 400 UNKNOWN_COUNTRY / 409 CONFLICT (already supported) are DomainErrors.
  await joinRegionWaitlist({ email: body.email, reason: body.reason ?? null, country });
  return c.json(success({ recorded: true }), 200);
});

// ---------------------------------------------------------------------
// TOTP setup / verify / disable
// ---------------------------------------------------------------------

securityRoutes.post("/totp/setup", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await startTotpSetup(userId)));
});

const ConfirmTotpSchema = z.object({ code: z.string().regex(/^\d{6}$/) });

securityRoutes.post("/totp/confirm", validateJson(ConfirmTotpSchema, () => error("VALIDATION_ERROR", "Invalid request body"), { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  // First-time enable also seeds backup codes — show plaintext once.
  const codes = await enableTotp(userId, c.req.valid("json").code);
  return c.json(success({ enabled: true, backupCodes: codes }));
});

securityRoutes.post("/totp/disable", validateJson(ConfirmTotpSchema, () => error("VALIDATION_ERROR", "Invalid request body"), { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  await turnOffTotp(userId, c.req.valid("json").code);
  return c.json(success({ disabled: true }));
});

// ---------------------------------------------------------------------
// Backup codes — count + regenerate
// ---------------------------------------------------------------------

securityRoutes.get("/backup-codes/count", async (c) => {
  const userId = requireUser(c);
  return c.json(success({ remaining: await countBackupCodes(userId) }));
});

securityRoutes.post("/backup-codes/regenerate", async (c) => {
  const userId = requireUser(c);
  return c.json(success({ codes: await regenerateBackupCodes(userId) }));
});

// ---------------------------------------------------------------------
// Trust device — set the HMAC-signed cookie. Called by the FE after a
// successful 2FA verify when the user ticked "trust this device".
// ---------------------------------------------------------------------
securityRoutes.post("/trust-device", async (c) => {
  const userId = requireUser(c);
  const cookie = await mintTrustedDeviceCookie(userId);
  c.header(
    "Set-Cookie",
    `hv_trusted_device=${encodeURIComponent(cookie)}; Path=/; Max-Age=${30 * 24 * 60 * 60}; HttpOnly; Secure; SameSite=Lax`,
    { append: true },
  );
  return c.json(success({ trusted: true }));
});
