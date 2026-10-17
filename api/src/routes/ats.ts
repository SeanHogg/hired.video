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
import { logger } from "../lib/logger.js";
import { hexToBytes, hmacSha256Verify } from "../utils/crypto.js";
import { openCredential, sealCredential } from "../services/crypto/credential-columns.js";

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

  const sealed = await sealCredential(apiKey);
  const [row] = (await db.insert(table).values({
    companyId,
    provider,
    apiKey: sealed.plain,
    apiKeyEnc: sealed.enc,
    webhookSecret: webhookSecret ?? null,
    config: config ?? {},
    isActive: true,
  } as any).onConflictDoUpdate({
    target: [table.companyId, table.provider],
    set: { apiKey: sealed.plain, apiKeyEnc: sealed.enc, webhookSecret: webhookSecret ?? null, config: config ?? {}, isActive: true, updatedAt: new Date() } as any,
  }).returning({
    id: table.id,
    companyId: table.companyId,
    provider: table.provider,
    config: table.config,
    isActive: table.isActive,
    lastSyncAt: table.lastSyncAt,
    createdAt: table.createdAt,
    updatedAt: table.updatedAt,
  }).catch(() => [])) as any[];

  // Never echo the API key or webhook secret back to the client.
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
    (await openCredential(conn.apiKeyEnc, conn.apiKey)) ?? "",
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
 * Workday Recruiting has no single REST candidates endpoint — integration is
 * per-tenant via Report-as-a-Service (RaaS). The connection stores the full
 * RaaS report URL + ISU username in `config`; `apiKey` is the ISU password.
 * RaaS returns `{ Report_Entry: [...] }` when `?format=json` is appended.
 * Because report field names are tenant-defined, callers may supply
 * `config.fieldMap` to override the defaults below.
 */
async function fetchWorkdayCandidates(
  password: string,
  config: Record<string, unknown>,
): Promise<NormalizedCandidate[]> {
  const raasUrl = typeof config.raasUrl === "string" ? config.raasUrl : "";
  const username = typeof config.username === "string" ? config.username : "";
  if (!raasUrl || !username) {
    throw new Error("Workday requires config.raasUrl + config.username");
  }
  const url = `${raasUrl}${raasUrl.includes("?") ? "&" : "?"}format=json`;
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${btoa(`${username}:${password}`)}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Workday ${res.status}`);
  const data = (await res.json()) as { Report_Entry?: any[] };
  const rows = Array.isArray(data.Report_Entry) ? data.Report_Entry : [];
  const fieldMap = (config.fieldMap ?? {}) as Record<string, string>;

  const pick = (r: any, key: string, fallbacks: string[]): string | null => {
    const keys = [fieldMap[key], ...fallbacks].filter(Boolean) as string[];
    for (const k of keys) {
      if (r[k] != null && String(r[k]).trim()) return String(r[k]).trim();
    }
    return null;
  };

  return rows
    .slice(0, PROVIDER_PAGE_SIZE * PROVIDER_MAX_PAGES)
    .map((r) => ({
      name: pick(r, "name", ["candidateName", "Candidate", "Worker", "fullName", "Full_Name", "Legal_Name"]) ?? "(unnamed)",
      email: pick(r, "email", ["email", "Email", "emailAddress", "Email_Address", "primaryEmail", "Primary_Email"]),
      title: pick(r, "title", ["title", "Title", "jobTitle", "Job_Title", "currentTitle", "Job_Profile"]),
      company: pick(r, "company", ["company", "Company", "currentCompany", "Current_Company", "employer", "Employer"]),
    }));
}

/**
 * Fetches candidates from the provider and upserts them into the owner's
 * talent pool via `upsertCandidatesForOwner` (email-deduped, no N+1).
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
      if (!config?.raasUrl || !config?.username) {
        return {
          candidatesImported: 0,
          skippedDuplicates: 0,
          note: "Workday sync requires config.raasUrl + config.username (RaaS report + ISU). Not configured.",
        };
      }
      candidates = await fetchWorkdayCandidates(apiKey, config);
      break;
    default:
      return { candidatesImported: 0, skippedDuplicates: 0, note: "Unknown provider." };
  }

  const { imported, skipped } = await upsertCandidatesForOwner(db, ownerId, candidates, provider);
  return {
    candidatesImported: imported,
    skippedDuplicates: skipped,
    note: `${provider}: imported ${imported}, skipped ${skipped} duplicate(s).`,
  };
}

/**
 * Upserts normalized candidates into the owner's talent pool, deduped by email
 * within that pool (one batched query, never N+1). Returns counts plus an
 * email→talentPoolCandidateId map covering BOTH pre-existing and newly inserted
 * rows, so webhook callers can resolve the candidate id without a re-query.
 * Mirrors the extension-capture pattern: candidateId is the owner's id as a
 * placeholder until the candidate links a real hired.video account.
 *
 * Shared by the manual pull (`importFromProvider`) and the inbound webhook
 * handler so the two paths can't drift on dedup or insert shape.
 */
async function upsertCandidatesForOwner(
  db: Db,
  ownerId: string,
  candidates: NormalizedCandidate[],
  provider: Provider,
): Promise<{ imported: number; skipped: number; idByEmail: Map<string, string> }> {
  const idByEmail = new Map<string, string>();
  if (candidates.length === 0) return { imported: 0, skipped: 0, idByEmail };

  // Dedup by email against the owner's existing pool in one batched query.
  const emails = Array.from(
    new Set(candidates.map((c) => c.email?.toLowerCase()).filter((e): e is string => !!e)),
  );
  const existing = new Set<string>();
  if (emails.length) {
    const rows = await db
      .select({ id: schema.talentPoolCandidates.id, email: schema.talentPoolCandidates.candidateEmail })
      .from(schema.talentPoolCandidates)
      .where(and(
        eq(schema.talentPoolCandidates.recruiterId, ownerId),
        inArray(schema.talentPoolCandidates.candidateEmail, emails),
      ))
      .catch(() => [] as Array<{ id: string; email: string | null }>);
    for (const r of rows) {
      if (!r.email) continue;
      const key = r.email.toLowerCase();
      existing.add(key);
      idByEmail.set(key, r.id);
    }
  }

  const toInsert = candidates.filter((c) => {
    const key = c.email?.toLowerCase();
    if (key && existing.has(key)) return false;
    if (key) existing.add(key); // collapse in-batch duplicates too
    return true;
  });
  const skipped = candidates.length - toInsert.length;

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
      .returning({ id: schema.talentPoolCandidates.id, email: schema.talentPoolCandidates.candidateEmail })
      .catch((e) => {
        logger.error(`[ats:${provider}] upsert failed`, e);
        return [] as Array<{ id: string; email: string | null }>;
      });
    imported = inserted.length;
    for (const r of inserted) if (r.email) idByEmail.set(r.email.toLowerCase(), r.id);
  }

  return { imported, skipped, idByEmail };
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

  const db = getDb();
  const table = getAtsTable();
  if (!table) return c.json({ received: true }, 200);

  // Resolve the connection for this provider (carries webhookSecret + the
  // company whose owner the candidate mirrors into). NOTE: webhooks don't carry
  // our connection id, so we use the first connection for the provider — see
  // gap register #2016 for per-connection attribution.
  const [conn] = await db
    .select({ companyId: table.companyId, webhookSecret: table.webhookSecret })
    .from(table)
    .where(eq(table.provider, providerName))
    .limit(1);

  if (conn?.webhookSecret && sig) {
    const valid = await verifyHmacSignature(sig, JSON.stringify(body), conn.webhookSecret);
    if (!valid) return c.json(error("UNAUTHORIZED", "Invalid webhook signature"), 401);
  }

  const eventType: string = body.action ?? body.event ?? body.type ?? "unknown";

  if (conn?.companyId) {
    const [company] = await db
      .select({ ownerId: schema.companyProfiles.ownerId })
      .from(schema.companyProfiles)
      .where(eq(schema.companyProfiles.id, conn.companyId))
      .limit(1);
    if (company?.ownerId) {
      await handleWebhookEvent(db, providerName, company.ownerId, eventType, body);
    }
  } else {
    logger.info(`[ats:${providerName}] webhook event — no connection, not processed`, { eventType });
  }

  return c.json({ received: true }, 200);
});

async function verifyHmacSignature(sig: string, payload: string, secret: string): Promise<boolean> {
  try {
    return await hmacSha256Verify(secret, payload, hexToBytes(sig));
  } catch {
    return false;
  }
}

/** Best-effort candidate extraction from a provider webhook payload. Returns
 *  null when the event carries no identifiable candidate (the shapes are thin
 *  and vary by event type, so every access is defensive). */
function extractCandidateFromWebhook(provider: Provider, body: any): NormalizedCandidate | null {
  if (provider === "greenhouse") {
    const p = body.payload ?? {};
    const cand = p.candidate ?? p.application?.candidate ?? null;
    if (!cand) return null;
    const name = [cand.first_name, cand.last_name].filter(Boolean).join(" ").trim() || cand.name || "(unnamed)";
    const email = cand.email_addresses?.find((e: any) => e?.value)?.value ?? cand.email ?? null;
    return {
      name,
      email: email ? String(email) : null,
      title: cand.title ?? p.application?.jobs?.[0]?.name ?? null,
      company: cand.company ?? null,
    };
  }
  if (provider === "lever") {
    const d = body.data ?? body ?? {};
    const cand = d.contact ?? d.candidate ?? d.opportunity ?? d;
    const name = cand?.name ? String(cand.name) : null;
    const email = Array.isArray(cand?.emails) && cand.emails[0] ? String(cand.emails[0]) : (cand?.email ?? null);
    if (!name && !email) return null;
    return {
      name: name ?? "(unnamed)",
      email: email ? String(email) : null,
      title: cand?.headline ? String(cand.headline) : null,
      company: cand?.headline ? String(cand.headline) : null,
    };
  }
  return null;
}

/** Best-effort pipeline-stage extraction (for the interaction note). */
function extractStage(provider: Provider, body: any): string | null {
  if (provider === "greenhouse") {
    return body.payload?.application?.current_stage?.name ?? null;
  }
  if (provider === "lever") {
    return body.data?.toStage?.text ?? body.data?.toStageId ?? null;
  }
  return null;
}

/**
 * Processes an inbound ATS webhook: mirrors the candidate into the owner's
 * talent pool (via the shared upsert, deduped by email) and records the event
 * on the candidate timeline (`candidate_interactions`). This replaces the old
 * log-only no-op so stage-change / new-candidate events actually land in
 * hired.video between manual `POST /sync` pulls.
 */
async function handleWebhookEvent(
  db: Db,
  provider: Provider,
  ownerId: string,
  eventType: string,
  body: any,
): Promise<void> {
  logger.info(`[ats:${provider}] webhook event`, { eventType });

  const candidate = extractCandidateFromWebhook(provider, body);
  let talentPoolId: string | null = null;
  if (candidate && (candidate.email || candidate.name !== "(unnamed)")) {
    const { idByEmail } = await upsertCandidatesForOwner(db, ownerId, [candidate], provider);
    talentPoolId = candidate.email ? idByEmail.get(candidate.email.toLowerCase()) ?? null : null;
  }

  const stage = extractStage(provider, body);
  await db
    .insert(schema.candidateInteractions)
    .values({
      recruiterId: ownerId,
      candidateId: ownerId, // placeholder until the candidate links an account
      talentPoolId: talentPoolId ?? undefined,
      type: "ats_webhook",
      subject: eventType,
      notes: stage ? `ATS ${provider} stage: ${stage}` : `ATS ${provider} event: ${eventType}`,
      metadata: { provider, eventType, stage } as any,
    } as any)
    .catch((e) => logger.error(`[ats:${provider}] interaction insert failed`, e));
}

atsRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "ATS endpoint not found" } }, 404),
);
