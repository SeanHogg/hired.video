// ats.ts — ATS integrations: Greenhouse, Lever, Workday (#64)
// Provides connection management, candidate sync, and inbound webhooks.
// Greenhouse (Harvest) and Lever pulls are live; Workday (SOAP/RaaS) is
// tenant-specific and remains a configured-stub (see gap register).
// Use cases: services/ats/ats-sync.ts; provider adapters:
// services/ats/provider-candidates.ts.

import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import {
  connectAts,
  disconnectAts,
  listAtsConnections,
  processAtsWebhook,
  syncAtsConnection,
} from "../services/ats/ats-sync.js";
import { SUPPORTED_ATS_PROVIDERS, isAtsProvider } from "../services/ats/provider-candidates.js";
import { requireUser } from "./helpers/routerHelpers.js";

export const atsRoutes = new Hono<AppEnv>();

const ConnectSchema = z.object({
  provider: z.enum(SUPPORTED_ATS_PROVIDERS),
  apiKey: z.string().min(1),
  webhookSecret: z.string().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

// ─── Connection management ────────────────────────────────────────────────────

/** GET /api/ats/connections — list all ATS connections for the company */
atsRoutes.get("/connections", async (c) => {
  const userId = requireUser(c);

  const companyId = c.req.query("companyId");
  if (!companyId) return c.json(error("VALIDATION_ERROR", "companyId query param required"), 400);

  return c.json(success(await listAtsConnections(userId, companyId)), 200);
});

/** POST /api/ats/connections — connect a new ATS */
atsRoutes.post("/connections", async (c) => {
  const userId = requireUser(c);

  const body = await c.req.json().catch(() => null);
  const parsed = ConnectSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid connection data", parsed.error.flatten()), 400);

  const { provider, apiKey, webhookSecret, config } = parsed.data;
  const companyId = String(body?.companyId ?? "");
  if (!companyId) return c.json(error("VALIDATION_ERROR", "companyId is required"), 400);

  const row = await connectAts(userId, { companyId, provider, apiKey, webhookSecret, config: config ?? {} });

  // Never echo the API key or webhook secret back to the client.
  return c.json(success(row ?? {}), row ? 201 : 503);
});

/** DELETE /api/ats/connections/:id — disconnect an ATS */
atsRoutes.delete("/connections/:id", async (c) => {
  const userId = requireUser(c);
  await disconnectAts(userId, c.req.param("id"));
  return c.json(success(null, "ATS connection removed"), 200);
});

// ─── Candidate sync ───────────────────────────────────────────────────────────

/**
 * POST /api/ats/sync/:connectionId
 * Pulls candidates from the connected ATS and upserts them into
 * talentPoolCandidates (deduped by email, scoped to the company owner).
 * Greenhouse + Lever are live; Workday returns a configured-stub note.
 */
atsRoutes.post("/sync/:connectionId", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await syncAtsConnection(userId, c.req.param("connectionId"))), 200);
});

// ─── Inbound webhooks (provider → platform) ──────────────────────────────────

/**
 * POST /api/ats/webhook/:provider
 * Receives stage-change / new-candidate events from ATS platforms.
 * Validates HMAC signature where supported. Answers a raw `{ received: true }`.
 */
atsRoutes.post("/webhook/:provider", async (c) => {
  const providerName = c.req.param("provider").toLowerCase();
  if (!isAtsProvider(providerName)) {
    return c.json(error("NOT_FOUND", "Unknown provider"), 404);
  }

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json(error("BAD_REQUEST", "Invalid payload"), 400);

  // Signature verification (Greenhouse uses X-Greenhouse-Signature, Lever uses X-Lever-Signature)
  const sig = c.req.header("x-greenhouse-signature") ?? c.req.header("x-lever-signature") ?? null;

  await processAtsWebhook(providerName, body, sig);
  return c.json({ received: true }, 200);
});
