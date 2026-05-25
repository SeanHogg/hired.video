// ats.ts — ATS integrations: Greenhouse, Lever, Workday (#64)
// Provides connection management, candidate sync, and inbound webhooks.
// Provider API calls are stubbed where credentials are unavailable.

import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";

export const atsRoutes = new Hono<AppEnv>();

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

const SUPPORTED_PROVIDERS = ["greenhouse", "lever", "workday"] as const;
type Provider = typeof SUPPORTED_PROVIDERS[number];

const ConnectSchema = z.object({
  provider: z.enum(SUPPORTED_PROVIDERS),
  apiKey: z.string().min(1),
  webhookSecret: z.string().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

function getAtsTable() {
  return (schema as any).atsConnections ?? null;
}

// ─── Connection management ────────────────────────────────────────────────────

/** GET /api/ats/connections — list all ATS connections for the company */
atsRoutes.get("/connections", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const companyId = c.req.query("companyId");
  if (!companyId) return c.json(error("VALIDATION_ERROR", "companyId query param required"), 400);

  const db = getDb();
  const table = getAtsTable();
  if (!table) return c.json(success([]), 200);

  // Verify ownership
  const [company] = await db
    .select({ ownerId: schema.companyProfiles.ownerId })
    .from(schema.companyProfiles)
    .where(eq(schema.companyProfiles.id, companyId))
    .limit(1);
  if (!company || company.ownerId !== userId) return c.json(error("FORBIDDEN", "Access denied"), 403);

  const rows = await db
    .select({
      id: table.id,
      provider: table.provider,
      isActive: table.isActive,
      lastSyncAt: table.lastSyncAt,
      createdAt: table.createdAt,
    })
    .from(table)
    .where(eq(table.companyId, companyId));

  return c.json(success(rows), 200);
});

/** POST /api/ats/connections — connect a new ATS */
atsRoutes.post("/connections", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = ConnectSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid connection data", parsed.error.flatten()), 400);

  const { provider, apiKey, webhookSecret, config } = parsed.data;
  const companyId = String(body?.companyId ?? "");
  if (!companyId) return c.json(error("VALIDATION_ERROR", "companyId is required"), 400);

  const db = getDb();
  const [company] = await db
    .select({ ownerId: schema.companyProfiles.ownerId })
    .from(schema.companyProfiles)
    .where(eq(schema.companyProfiles.id, companyId))
    .limit(1);
  if (!company || company.ownerId !== userId) return c.json(error("FORBIDDEN", "Access denied"), 403);

  const table = getAtsTable();
  if (!table) return c.json(error("SERVICE_UNAVAILABLE", "ATS connections not available"), 503);

  const [row] = (await db.insert(table).values({
    companyId,
    provider,
    apiKey,
    webhookSecret: webhookSecret ?? null,
    config: config ?? {},
    isActive: true,
  } as any).onConflictDoUpdate({
    target: [table.companyId, table.provider],
    set: { apiKey, webhookSecret: webhookSecret ?? null, config: config ?? {}, isActive: true, updatedAt: new Date() } as any,
  }).returning().catch(() => [])) as any[];

  return c.json(success(row ?? {}), row ? 201 : 503);
});

/** DELETE /api/ats/connections/:id — disconnect an ATS */
atsRoutes.delete("/connections/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const table = getAtsTable();
  if (!table) return c.json(error("NOT_FOUND", "Connection not found"), 404);

  const [conn] = await db
    .select({ companyId: table.companyId })
    .from(table)
    .where(eq(table.id, c.req.param("id")))
    .limit(1);
  if (!conn) return c.json(error("NOT_FOUND", "Connection not found"), 404);

  const [company] = await db
    .select({ ownerId: schema.companyProfiles.ownerId })
    .from(schema.companyProfiles)
    .where(eq(schema.companyProfiles.id, conn.companyId))
    .limit(1);
  if (!company || company.ownerId !== userId) return c.json(error("FORBIDDEN", "Access denied"), 403);

  await db.delete(table).where(eq(table.id, c.req.param("id")));
  return c.json(success(null, "ATS connection removed"), 200);
});

// ─── Candidate sync ───────────────────────────────────────────────────────────

/**
 * POST /api/ats/sync/:connectionId
 * Pulls candidates from the connected ATS and upserts them into talentPoolCandidates.
 * Currently a stub — real provider calls require active API credentials.
 */
atsRoutes.post("/sync/:connectionId", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const table = getAtsTable();
  if (!table) return c.json(error("NOT_FOUND", "Connection not found"), 404);

  const [conn] = await db
    .select()
    .from(table)
    .where(eq(table.id, c.req.param("connectionId")))
    .limit(1);
  if (!conn) return c.json(error("NOT_FOUND", "Connection not found"), 404);

  const [company] = await db
    .select({ ownerId: schema.companyProfiles.ownerId })
    .from(schema.companyProfiles)
    .where(eq(schema.companyProfiles.id, conn.companyId))
    .limit(1);
  if (!company || company.ownerId !== userId) return c.json(error("FORBIDDEN", "Access denied"), 403);

  // Stub: in production, call provider-specific API
  const syncResult = await syncFromProvider(conn.provider as Provider, conn.apiKey, conn.config);

  // Update lastSyncAt
  await db.update(table).set({ lastSyncAt: new Date() } as any).where(eq(table.id, conn.id));

  return c.json(success({
    provider: conn.provider,
    synced: syncResult.candidatesImported,
    lastSyncAt: new Date().toISOString(),
    note: syncResult.note,
  }), 200);
});

async function syncFromProvider(
  provider: Provider,
  _apiKey: string,
  _config: Record<string, unknown>,
): Promise<{ candidatesImported: number; note: string }> {
  // Stub implementations — replace with real HTTP calls when provider creds available
  switch (provider) {
    case "greenhouse":
      return { candidatesImported: 0, note: "Greenhouse sync stub. Set GREENHOUSE_API_KEY and configure harvest board token." };
    case "lever":
      return { candidatesImported: 0, note: "Lever sync stub. Set LEVER_API_KEY." };
    case "workday":
      return { candidatesImported: 0, note: "Workday sync stub. Configure tenant URL and SOAP credentials." };
    default:
      return { candidatesImported: 0, note: "Unknown provider." };
  }
}

// ─── Inbound webhooks (provider → platform) ──────────────────────────────────

/**
 * POST /api/ats/webhook/:provider
 * Receives stage-change / new-candidate events from ATS platforms.
 * Validates HMAC signature where supported.
 */
atsRoutes.post("/webhook/:provider", async (c) => {
  const providerName = c.req.param("provider").toLowerCase() as Provider;
  if (!SUPPORTED_PROVIDERS.includes(providerName)) {
    return c.json(error("NOT_FOUND", "Unknown provider"), 404);
  }

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json(error("BAD_REQUEST", "Invalid payload"), 400);

  // Signature verification (Greenhouse uses X-Greenhouse-Signature, Lever uses X-Lever-Signature)
  const sig = c.req.header("x-greenhouse-signature") ?? c.req.header("x-lever-signature") ?? null;

  // Find the matching connection by provider to get webhookSecret
  const db = getDb();
  const table = getAtsTable();
  if (table && sig) {
    const [conn] = await db
      .select({ webhookSecret: table.webhookSecret })
      .from(table)
      .where(eq(table.provider, providerName))
      .limit(1);

    if (conn?.webhookSecret) {
      const valid = await verifyHmacSignature(sig, JSON.stringify(body), conn.webhookSecret);
      if (!valid) return c.json(error("UNAUTHORIZED", "Invalid webhook signature"), 401);
    }
  }

  // Route event type
  const eventType: string = body.action ?? body.event ?? body.type ?? "unknown";
  await handleWebhookEvent(providerName, eventType, body);

  return c.json({ received: true }, 200);
});

async function verifyHmacSignature(sig: string, payload: string, secret: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
    );
    const sigBytes = new Uint8Array(sig.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
    return crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(payload));
  } catch {
    return false;
  }
}

async function handleWebhookEvent(provider: Provider, eventType: string, payload: unknown): Promise<void> {
  // Log event — in production, route to a queue/durable object for processing
  console.info(`[ats:${provider}] webhook event=${eventType}`, typeof payload === "object" ? JSON.stringify(payload).slice(0, 200) : "");
  // Future: upsert candidate stage changes into jobApplications table
}

atsRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "ATS endpoint not found" } }, 404),
);
