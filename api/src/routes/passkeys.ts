// passkeys.ts — FIDO2/WebAuthn (Passkey) routes. Thin HTTP layer over
// services/auth/passkeys.ts (ceremony logic) — ES256 (P-256 ECDSA).
//
// Flow:
//   Registration:
//     POST /api/auth/passkey/register/begin    → returns challenge + options
//     POST /api/auth/passkey/register/complete → verifies attestation, stores credential
//
//   Authentication:
//     POST /api/auth/passkey/login/begin       → returns challenge + options (no userId needed)
//     POST /api/auth/passkey/login/complete    → verifies assertion, returns JWT

import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { requireUser } from "./helpers/routerHelpers.js";
import { validateJson } from "./helpers/validate.js";
import { extractClientIp, extractUserAgent } from "../services/auth/deps.js";
import {
  beginPasskeyLogin,
  beginPasskeyRegistration,
  completePasskeyLogin,
  completePasskeyRegistration,
  deletePasskey,
  listPasskeys,
  type PasskeyClient,
} from "../services/auth/passkeys.js";

export const passkeyRoutes = new Hono<AppEnv>();

function passkeyClient(c: Context<AppEnv>): PasskeyClient {
  return { origin: c.req.header("origin") ?? null, ipAddress: extractClientIp(c), userAgent: extractUserAgent(c) };
}

// ─── Registration ────────────────────────────────────────────────────────────

passkeyRoutes.post("/register/begin", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await beginPasskeyRegistration(userId, passkeyClient(c))), 200);
});

const RegisterCompleteSchema = z.object({
  id: z.string(),
  rawId: z.string(),
  type: z.literal("public-key"),
  response: z.object({
    clientDataJSON: z.string(),
    attestationObject: z.string(),
  }),
  name: z.string().max(100).default("My Passkey"),
});

passkeyRoutes.post("/register/complete", validateJson(RegisterCompleteSchema, () => error("VALIDATION_ERROR", "Invalid credential data"), { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const result = await completePasskeyRegistration(userId, c.req.valid("json"), passkeyClient(c));
  return c.json(success(result), 201);
});

// ─── Authentication ──────────────────────────────────────────────────────────

passkeyRoutes.post("/login/begin", async (c) => {
  return c.json(success(await beginPasskeyLogin(passkeyClient(c))), 200);
});

const LoginCompleteSchema = z.object({
  id: z.string(),
  rawId: z.string(),
  type: z.literal("public-key"),
  response: z.object({
    clientDataJSON: z.string(),
    authenticatorData: z.string(),
    signature: z.string(),
    userHandle: z.string().optional(),
  }),
});

passkeyRoutes.post("/login/complete", validateJson(LoginCompleteSchema, () => error("VALIDATION_ERROR", "Invalid assertion data"), { emptyBody: null }), async (c) => {
  const result = await completePasskeyLogin(c.req.valid("json"), passkeyClient(c));
  return c.json(success(result), 200);
});

// ─── List / Delete registered passkeys ───────────────────────────────────────

passkeyRoutes.get("/credentials", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await listPasskeys(userId)), 200);
});

passkeyRoutes.delete("/credentials/:id", async (c) => {
  const userId = requireUser(c);
  await deletePasskey(userId, c.req.param("id"));
  return c.json(success(true), 200);
});
