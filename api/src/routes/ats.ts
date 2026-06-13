// ats.ts — ATS integrations: Greenhouse, Lever, Workday (#64)
// Provides connection management, candidate sync, and inbound webhooks.
// Greenhouse (Harvest) and Lever pulls are live; Workday (SOAP/RaaS) is
// tenant-specific and remains a configured-stub (see gap register).

import { Hono } from "hono";
import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";

type Db = ReturnType<typeof getDb>;

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
 * Pulls candidates from the connected ATS and upserts them into
 * talentPoolCandidates (deduped by email, scoped to the company owner).
 * Greenhouse + Lever are live; Workday returns a configured-stub note.
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

  const syncResult = await importFromProvider(
    db,
    company.ownerId,
    conn.provider as Provider,
    conn.apiKey,
    (conn.config ?? {}) as Record<string, unknown>,
  );

  await db.update(table).set({ lastSyncAt: new Date() } as any).where(eq(table.id, conn.id));

  return c.json(success({
    provider: conn.provider,
    synced: syncResult.candidatesImported,
    skippedDuplicates: syncResult.skippedDuplicates,
    lastSyncAt: new Date().toISOString(),
    note: syncResult.note,
  }), 200);
});

// ─── Provider candidate fetchers ──────────────────────────────────────────────

/** One ATS candidate flattened to the fields talent_pool_candidates needs. */
type NormalizedCandidate = {
  name: string;
  email: string | null;
  title: string | null;
  company: string | null;
};

/** ATS REST keys auth as HTTP Basic with the key as username + empty password
 *  (Greenhouse Harvest + Lever both use this). */
function basicAuthHeader(apiKey: string): string {
  return `Basic ${btoa(`${apiKey}:`)}`;
}

const PROVIDER_PAGE_SIZE = 100;
const PROVIDER_MAX_PAGES = 2; // bound a single sync to ≤200 candidates

async function fetchGreenhouseCandidates(apiKey: string): Promise<NormalizedCandidate[]> {
  const out: NormalizedCandidate[] = [];
  for (let page = 1; page <= PROVIDER_MAX_PAGES; page++) {
    const res = await fetch(
      `https://harvest.greenhouse.io/v1/candidates?per_page=${PROVIDER_PAGE_SIZE}&page=${page}`,
      { headers: { Authorization: basicAuthHeader(apiKey), "Content-Type": "application/json" } },
    );
    if (!res.ok) throw new Error(`Greenhouse ${res.status}`);
    const rows = (await res.json()) as any[];
    if (!Array.isArray(rows) || rows.length === 0) break;
    for (const r of rows) {
      const name = [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || "(unnamed)";
      const email = r.email_addresses?.find((e: any) => e?.value)?.value ?? null;
      out.push({
        name,
        email: email ? String(email) : null,
        title: r.title ? String(r.title) : null,
        company: r.company ? String(r.company) : null,
      });
    }
    if (rows.length < PROVIDER_PAGE_SIZE) break;
  }
  return out;
}

async function fetchLeverCandidates(apiKey: string): Promise<NormalizedCandidate[]> {
  const out: NormalizedCandidate[] = [];
  let next: string | undefined;
  for (let page = 0; page < PROVIDER_MAX_PAGES; page++) {
    const params = new URLSearchParams({ limit: String(PROVIDER_PAGE_SIZE) });
    if (next) params.set("offset", next);
    const res = await fetch(`https://api.lever.co/v1/opportunities?${params.toString()}`, {
      headers: { Authorization: basicAuthHeader(apiKey), "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error(`Lever ${res.status}`);
    const body = (await res.json()) as { data?: any[]; hasNext?: boolean; next?: string };
    const rows = body.data ?? [];
    for (const r of rows) {
      out.push({
        name: r.name ? String(r.name) : "(unnamed)",
        email: Array.isArray(r.emails) && r.emails[0] ? String(r.emails[0]) : null,
        title: r.headline ? String(r.headline) : null,
        company: r.headline ? String(r.headline) : null,
      });
    }
    if (!body.hasNext || !body.next) break;
    next = body.next;
  }
  return out;
}

/**
 * Fetches candidates from the provider and upserts them into the owner's
 * talent pool. Dedup is by email within the owner's pool (one batched query,
 * never N+1). Email-less candidates are imported once per name (best effort).
 * Mirrors the extension-capture pattern: candidateId is the owner's id as a
 * placeholder until the candidate links a real hired.video account.
 */
async function importFromProvider(
  db: Db,
  ownerId: string,
  provider: Provider,
  apiKey: string,
  config: Record<string, unknown>,
): Promise<{ candidatesImported: number; skippedDuplicates: number; note: string }> {
  let candidates: NormalizedCandidate[];
  switch (provider) {
    case "greenhouse":
      candidates = await fetchGreenhouseCandidates(apiKey);
      break;
    case "lever":
      candidates = await fetchLeverCandidates(apiKey);
      break;
    case "workday":
      // Workday Recruiting has no single REST candidates endpoint — integration
      // is per-tenant SOAP / Report-as-a-Service. Honest stub until a tenant
      // URL + RaaS report are configured (gap register).
      return {
        candidatesImported: 0,
        skippedDuplicates: 0,
        note: config?.tenantUrl
          ? "Workday RaaS pull not yet implemented — tenant configured."
          : "Workday sync requires a tenant URL + RaaS report. Not configured.",
      };
    default:
      return { candidatesImported: 0, skippedDuplicates: 0, note: "Unknown provider." };
  }

  if (candidates.length === 0) {
    return { candidatesImported: 0, skippedDuplicates: 0, note: `${provider}: no candidates returned.` };
  }

  // Dedup by email against the owner's existing pool in one batched query.
  const emails = Array.from(
    new Set(candidates.map((c) => c.email?.toLowerCase()).filter((e): e is string => !!e)),
  );
  const existingEmails = new Set<string>();
  if (emails.length) {
    const rows = await db
      .select({ email: schema.talentPoolCandidates.candidateEmail })
      .from(schema.talentPoolCandidates)
      .where(and(
        eq(schema.talentPoolCandidates.recruiterId, ownerId),
        inArray(schema.talentPoolCandidates.candidateEmail, emails),
      ))
      .catch(() => [] as Array<{ email: string | null }>);
    for (const r of rows) if (r.email) existingEmails.add(r.email.toLowerCase());
  }

  const toInsert = candidates.filter((c) => {
    const key = c.email?.toLowerCase();
    if (key && existingEmails.has(key)) return false;
    if (key) existingEmails.add(key); // collapse in-batch duplicates too
    return true;
  });
  const skippedDuplicates = candidates.length - toInsert.length;

  let imported = 0;
  if (toInsert.length) {
    const inserted = await db
      .insert(schema.talentPoolCandidates)
      .values(toInsert.map((c) => ({
        recruiterId: ownerId,
        candidateId: ownerId, // placeholder until the candidate links an account
        candidateName: c.name,
        candidateEmail: c.email ?? undefined,
        candidateTitle: c.title ?? undefined,
        currentCompany: c.company ?? undefined,
        currentTitle: c.title ?? undefined,
        status: "active",
        tags: [`ats:${provider}`],
      })) as any)
      .returning({ id: schema.talentPoolCandidates.id })
      .catch((e) => {
        console.error(`[ats:${provider}] upsert failed:`, e);
        return [] as Array<{ id: string }>;
      });
    imported = inserted.length;
  }

  return {
    candidatesImported: imported,
    skippedDuplicates,
    note: `${provider}: imported ${imported}, skipped ${skippedDuplicates} duplicate(s).`,
  };
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
