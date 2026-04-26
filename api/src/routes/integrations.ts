/**
 * Integrations API — registry, sourcing lookup, creator submissions, DSR.
 *
 * Mounted at:
 *   /api/admin/integrations/*   — SuperAdmin: manage system + creator integrations
 *   /api/sourcing/*             — Authenticated users: cache-first lookup
 *   /api/creators/integrations  — Authenticated creators: submit/manage own integrations
 *   /api/data-subject-requests  — Public: submit GDPR/CCPA requests
 *   /api/admin/data-subject-requests/* — SuperAdmin: process DSRs
 *   /api/admin/suppression-list/* — SuperAdmin: manage suppression list
 */

import { Hono } from "hono";
import { and, count, desc, eq, gte, lt, sql } from "drizzle-orm";
import { z } from "zod";
import type { Variables } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { superAdminMiddleware } from "../middleware/superAdmin.js";
import { ok } from "../utils/response.js";
import {
  userSourcingLookup,
  adminSourcingLookup,
  listRecentRuns,
  InsufficientCreditsError,
} from "../services/sourcing/sourcingService.js";
import { getProvider, listSystemProviderSlugs } from "../services/sourcing/registry.js";
import { addToSuppressionList } from "../services/sourcing/suppression.js";
import { hashEmail } from "../services/sourcing/hash.js";
import {
  findPersonCandidatesForUser,
  findUserCandidatesForPerson,
  flagMergeCandidate,
  mergeSourcedPersonIntoUser,
  rejectMergeCandidate,
  runReconciliationPass,
  unmergeSourcedPerson,
} from "../services/sourcing/reconciliation.js";
import type { SourcingQuery } from "../services/sourcing/types.js";

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

const QuerySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("email"), value: z.string().email() }),
  z.object({ kind: z.literal("linkedin_url"), value: z.string().url() }),
  z.object({ kind: z.literal("github_login"), value: z.string().min(1).max(128) }),
  z.object({
    kind: z.literal("name_company"),
    name: z.string().min(1).max(255),
    company: z.string().min(1).max(255),
  }),
  z.object({ kind: z.literal("domain"), value: z.string().min(3).max(253) }),
]);

// ---------------------------------------------------------------------------
// SuperAdmin: integrations management
// ---------------------------------------------------------------------------
export const adminIntegrationsRoutes = new Hono<{ Variables: Variables }>();
adminIntegrationsRoutes.use("*", superAdminMiddleware);

// GET /api/admin/integrations — list all
adminIntegrationsRoutes.get("/", async (c) => {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.integrations)
    .orderBy(schema.integrations.kind, schema.integrations.displayName);

  // Hydrate each with credential presence (NOT the secret) and recent run stats.
  const withMeta = await Promise.all(
    rows.map(async (r) => {
      const [cred] = await db
        .select()
        .from(schema.integrationCredentials)
        .where(eq(schema.integrationCredentials.integrationId, r.id))
        .limit(1);
      const env = (c.env ?? {}) as Record<string, unknown>;
      const credentialsResolved = cred ? !!env[cred.envVarName] : false;

      const since = new Date(Date.now() - 7 * 86_400_000);
      const stats = await db
        .select({
          total: count(),
          successes: sql<number>`SUM(CASE WHEN ${schema.integrationRuns.status} IN ('success','cache_hit') THEN 1 ELSE 0 END)`,
          errors: sql<number>`SUM(CASE WHEN ${schema.integrationRuns.status} = 'error' THEN 1 ELSE 0 END)`,
          spend: sql<number>`SUM(${schema.integrationRuns.costCents})`,
          cacheHits: sql<number>`SUM(CASE WHEN ${schema.integrationRuns.cacheHit} THEN 1 ELSE 0 END)`,
        })
        .from(schema.integrationRuns)
        .where(and(eq(schema.integrationRuns.integrationId, r.id), gte(schema.integrationRuns.createdAt, since)));

      return {
        ...r,
        credentialEnvVar: cred?.envVarName ?? null,
        credentialsResolved,
        provider: !!getProvider(r.slug),
        stats7d: stats[0] ?? { total: 0, successes: 0, errors: 0, spend: 0, cacheHits: 0 },
      };
    }),
  );
  return c.json(ok(withMeta));
});

// PATCH /api/admin/integrations/:id — partial update (display fields, capabilities, cost)
const PatchSchema = z.object({
  displayName:        z.string().min(1).max(128).optional(),
  description:        z.string().max(2000).nullable().optional(),
  homepageUrl:        z.string().url().nullable().optional(),
  docsUrl:            z.string().url().nullable().optional(),
  category:           z.string().max(32).optional(),
  pricingModel:       z.enum(["free", "paid", "freemium"]).optional(),
  costPerCallCents:   z.number().int().min(0).max(10_000).optional(),
  capabilities:       z.record(z.string(), z.boolean()).optional(),
  configSchema:       z.record(z.string(), z.unknown()).optional(),
});
adminIntegrationsRoutes.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.message } }, 400);
  }
  const db = getDb();
  const [updated] = await db
    .update(schema.integrations)
    .set({ ...parsed.data, updatedAt: new Date() } as any)
    .where(eq(schema.integrations.id, id))
    .returning();
  if (!updated) return c.json({ success: false, error: { code: "NOT_FOUND", message: "Integration not found" } }, 404);
  return c.json(ok(updated));
});

// POST /api/admin/integrations/:id/enable | /disable
adminIntegrationsRoutes.post("/:id/enable", async (c) => {
  const id = c.req.param("id");
  const db = getDb();
  const [updated] = await db
    .update(schema.integrations)
    .set({ enabled: true, updatedAt: new Date() } as any)
    .where(eq(schema.integrations.id, id))
    .returning();
  if (!updated) return c.json({ success: false, error: { code: "NOT_FOUND", message: "Integration not found" } }, 404);
  return c.json(ok(updated));
});
adminIntegrationsRoutes.post("/:id/disable", async (c) => {
  const id = c.req.param("id");
  const db = getDb();
  const [updated] = await db
    .update(schema.integrations)
    .set({ enabled: false, updatedAt: new Date() } as any)
    .where(eq(schema.integrations.id, id))
    .returning();
  if (!updated) return c.json({ success: false, error: { code: "NOT_FOUND", message: "Integration not found" } }, 404);
  return c.json(ok(updated));
});

// PUT /api/admin/integrations/:id/credentials — set/update env var name
const CredentialsSchema = z.object({
  envVarName: z.string().regex(/^[A-Z][A-Z0-9_]{2,127}$/, "env var must be UPPER_SNAKE"),
  extra: z.record(z.string(), z.string()).optional(),
});
adminIntegrationsRoutes.put("/:id/credentials", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const parsed = CredentialsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.message } }, 400);
  }
  const db = getDb();
  const env = (c.env ?? {}) as Record<string, unknown>;
  const verified = !!env[parsed.data.envVarName];

  const [existing] = await db
    .select()
    .from(schema.integrationCredentials)
    .where(eq(schema.integrationCredentials.integrationId, id))
    .limit(1);

  if (existing) {
    await db
      .update(schema.integrationCredentials)
      .set({
        envVarName: parsed.data.envVarName,
        extra: parsed.data.extra ?? {},
        lastVerifiedAt: verified ? new Date() : null,
        updatedAt: new Date(),
      } as any)
      .where(eq(schema.integrationCredentials.id, existing.id));
  } else {
    await db.insert(schema.integrationCredentials).values({
      integrationId: id,
      envVarName: parsed.data.envVarName,
      extra: parsed.data.extra ?? {},
      lastVerifiedAt: verified ? new Date() : null,
    } as any);
  }
  return c.json(ok({ envVarName: parsed.data.envVarName, verified }));
});

// POST /api/admin/integrations/:id/review — approve or reject creator submissions
const ReviewSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  rejectionReason: z.string().max(1000).optional(),
});
adminIntegrationsRoutes.post("/:id/review", async (c) => {
  const id = c.req.param("id");
  const userId = uid(c);
  const body = await c.req.json().catch(() => ({}));
  const parsed = ReviewSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.message } }, 400);
  }
  const db = getDb();
  const [updated] = await db
    .update(schema.integrations)
    .set({
      reviewStatus: parsed.data.decision === "approve" ? "approved" : "rejected",
      reviewedBy: userId,
      reviewedAt: new Date(),
      rejectionReason: parsed.data.decision === "reject" ? (parsed.data.rejectionReason ?? null) : null,
      updatedAt: new Date(),
    } as any)
    .where(eq(schema.integrations.id, id))
    .returning();
  if (!updated) return c.json({ success: false, error: { code: "NOT_FOUND", message: "Integration not found" } }, 404);
  return c.json(ok(updated));
});

// POST /api/admin/integrations/lookup — admin-side sourcing tool (no credit gate)
adminIntegrationsRoutes.post("/lookup", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json({ success: false, error: { code: "UNAUTHORIZED" } }, 401);
  const body = await c.req.json().catch(() => ({}));
  const parsed = QuerySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.message } }, 400);
  }
  const db = getDb();
  const env = (c.env ?? {}) as Record<string, unknown>;
  const outcome = await adminSourcingLookup(db, env, userId, parsed.data as SourcingQuery);
  return c.json(ok(outcome));
});

// GET /api/admin/integrations/runs — recent runs across all integrations
adminIntegrationsRoutes.get("/runs", async (c) => {
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10) || 50, 200);
  const db = getDb();
  const rows = await listRecentRuns(db, limit);
  return c.json(ok(rows));
});

// ---------------------------------------------------------------------------
// SuperAdmin: sourced people reconciliation / merge tool
// ---------------------------------------------------------------------------

// GET /api/admin/integrations/people — paged list with filter
adminIntegrationsRoutes.get("/people", async (c) => {
  const status = c.req.query("status");                  // 'unclaimed' | 'pending_review' | 'merged' | 'rejected_match'
  const limit = Math.min(parseInt(c.req.query("limit") ?? "50", 10) || 50, 200);
  const db = getDb();
  const where = status ? eq(schema.sourcedPeople.mergeStatus, status) : undefined;
  const rows = await db
    .select()
    .from(schema.sourcedPeople)
    .where(where as any)
    .orderBy(desc(schema.sourcedPeople.mergeDetectedAt), desc(schema.sourcedPeople.createdAt))
    .limit(limit);
  return c.json(ok(rows));
});

// GET /api/admin/integrations/people/:id — single row + candidates + sources + log
adminIntegrationsRoutes.get("/people/:id", async (c) => {
  const id = c.req.param("id");
  const db = getDb();
  const [person] = await db.select().from(schema.sourcedPeople).where(eq(schema.sourcedPeople.id, id)).limit(1);
  if (!person) return c.json({ success: false, error: { code: "NOT_FOUND" } }, 404);
  const identifiers = await db.select().from(schema.personIdentifiers).where(eq(schema.personIdentifiers.personId, id));
  const sources = await db.select().from(schema.personSources).where(eq(schema.personSources.personId, id));
  const log = await db
    .select()
    .from(schema.sourcedPersonMergeLog)
    .where(eq(schema.sourcedPersonMergeLog.personId, id))
    .orderBy(desc(schema.sourcedPersonMergeLog.createdAt));
  const candidates = await findUserCandidatesForPerson(db, id);
  // Hydrate candidate users for the frontend.
  const candidateRows = await Promise.all(
    candidates.map(async (cand) => {
      const [u] = await db
        .select({
          id: schema.users.id,
          email: schema.users.email,
          name: schema.users.name,
        })
        .from(schema.users)
        .where(eq(schema.users.id, cand.userId))
        .limit(1);
      return { ...cand, user: u ?? null };
    }),
  );
  return c.json(ok({ person, identifiers, sources, log, candidates: candidateRows }));
});

// POST /api/admin/integrations/people/:id/merge { userId, notes? }
const MergeSchema = z.object({
  userId: z.string().uuid(),
  notes: z.string().max(2000).optional(),
});
adminIntegrationsRoutes.post("/people/:id/merge", async (c) => {
  const id = c.req.param("id");
  const adminId = uid(c);
  const body = await c.req.json().catch(() => ({}));
  const parsed = MergeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.message } }, 400);
  }
  const db = getDb();
  // Re-derive matched identifiers at merge time (audit-quality data).
  const candidates = await findUserCandidatesForPerson(db, id);
  const matched = candidates.find((cand) => cand.userId === parsed.data.userId)?.matchedIdentifiers ?? [];
  const outcome = await mergeSourcedPersonIntoUser(
    db,
    id,
    parsed.data.userId,
    adminId,
    matched,
    parsed.data.notes,
  );
  return c.json(ok(outcome));
});

// POST /api/admin/integrations/people/:id/reject-merge { notes? }
adminIntegrationsRoutes.post("/people/:id/reject-merge", async (c) => {
  const id = c.req.param("id");
  const adminId = uid(c);
  const body = await c.req.json().catch(() => ({}));
  const notes = typeof body?.notes === "string" ? body.notes : undefined;
  const db = getDb();
  await rejectMergeCandidate(db, id, adminId, notes);
  return c.json(ok({ rejected: true }));
});

// POST /api/admin/integrations/people/:id/unmerge { notes? }
adminIntegrationsRoutes.post("/people/:id/unmerge", async (c) => {
  const id = c.req.param("id");
  const adminId = uid(c);
  const body = await c.req.json().catch(() => ({}));
  const notes = typeof body?.notes === "string" ? body.notes : undefined;
  const db = getDb();
  await unmergeSourcedPerson(db, id, adminId, notes);
  return c.json(ok({ unmerged: true }));
});

// POST /api/admin/integrations/reconcile/run — trigger reconciliation pass
adminIntegrationsRoutes.post("/reconcile/run", async (c) => {
  const limit = Math.min(parseInt(c.req.query("limit") ?? "500", 10) || 500, 5_000);
  const db = getDb();
  const result = await runReconciliationPass(db, limit);
  return c.json(ok(result));
});

// POST /api/admin/integrations/reconcile/scan-user/:userId — scan one user
adminIntegrationsRoutes.post("/reconcile/scan-user/:userId", async (c) => {
  const userId = c.req.param("userId");
  const db = getDb();
  const candidates = await findPersonCandidatesForUser(db, userId);
  let flagged = 0;
  for (const cand of candidates) {
    if (cand.confidence >= 50) {
      await flagMergeCandidate(db, cand.personId, {
        userId,
        confidence: cand.confidence,
        matchedIdentifiers: cand.matchedIdentifiers,
      });
      flagged++;
    }
  }
  return c.json(ok({ scanned: candidates.length, flagged, candidates }));
});

// GET /api/admin/integrations/_health — full check (registered providers vs DB)
adminIntegrationsRoutes.get("/_health", async (c) => {
  const db = getDb();
  const env = (c.env ?? {}) as Record<string, unknown>;
  const dbRows = await db.select().from(schema.integrations);
  const dbSlugs = new Set(dbRows.map((r) => r.slug));
  const codeSlugs = listSystemProviderSlugs();
  const missingInDb = codeSlugs.filter((s) => !dbSlugs.has(s));
  const orphanInDb = dbRows.filter((r) => r.kind === "system" && !codeSlugs.includes(r.slug)).map((r) => r.slug);

  let unconfigured = 0;
  for (const r of dbRows) {
    if (!r.enabled) continue;
    const [cred] = await db
      .select()
      .from(schema.integrationCredentials)
      .where(eq(schema.integrationCredentials.integrationId, r.id))
      .limit(1);
    if (cred && !env[cred.envVarName]) unconfigured++;
    if (!cred && r.pricingModel !== "free") unconfigured++;
  }
  return c.json(ok({ missingInDb, orphanInDb, unconfigured }));
});

// ---------------------------------------------------------------------------
// User-facing sourcing lookup (cache-first, charges credits)
// ---------------------------------------------------------------------------
export const sourcingRoutes = new Hono<{ Variables: Variables }>();

sourcingRoutes.post("/lookup", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json({ success: false, error: { code: "UNAUTHORIZED" } }, 401);
  const body = await c.req.json().catch(() => ({}));
  const parsed = QuerySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.message } }, 400);
  }
  const db = getDb();
  const env = (c.env ?? {}) as Record<string, unknown>;
  try {
    const outcome = await userSourcingLookup(db, env, userId, parsed.data as SourcingQuery);
    return c.json(ok(outcome));
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return c.json(
        { success: false, error: { code: "INSUFFICIENT_CREDITS", message: "Purchase enrichment credits to continue." } },
        402,
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ success: false, error: { code: "INTERNAL_ERROR", message: msg } }, 500);
  }
});

// GET /api/integrations/providers — list of enabled enrichment providers
// (used by the sourcing UI to show which providers are available).
sourcingRoutes.get("/providers", async (c) => {
  const db = getDb();
  const rows = await db
    .select({
      slug: schema.integrations.slug,
      displayName: schema.integrations.displayName,
      category: schema.integrations.category,
      pricingModel: schema.integrations.pricingModel,
      capabilities: schema.integrations.capabilities,
      kind: schema.integrations.kind,
    })
    .from(schema.integrations)
    .where(and(eq(schema.integrations.enabled, true), eq(schema.integrations.reviewStatus, "approved")));
  return c.json(ok(rows));
});

// ---------------------------------------------------------------------------
// Creator-facing integration submissions
// ---------------------------------------------------------------------------
export const creatorIntegrationsRoutes = new Hono<{ Variables: Variables }>();

const CreatorSubmissionSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{3,64}$/, "slug must be kebab-case 3-64 chars"),
  displayName: z.string().min(2).max(128),
  category: z.enum(["enrichment", "sourcing", "data_dump", "job_board", "other"]),
  pricingModel: z.enum(["free", "paid", "freemium"]).default("free"),
  costPerCallCents: z.number().int().min(0).max(10_000).default(0),
  description: z.string().min(20).max(2000),
  homepageUrl: z.string().url().optional(),
  docsUrl: z.string().url().optional(),
  capabilities: z.record(z.string(), z.boolean()).default({}),
  configSchema: z.record(z.string(), z.unknown()).default({}),
});

// POST /api/creators/integrations — submit a new creator integration
creatorIntegrationsRoutes.post("/", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json({ success: false, error: { code: "UNAUTHORIZED" } }, 401);
  const body = await c.req.json().catch(() => ({}));
  const parsed = CreatorSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.message } }, 400);
  }

  const db = getDb();
  // Ensure slug is unique.
  const [existing] = await db.select().from(schema.integrations).where(eq(schema.integrations.slug, parsed.data.slug)).limit(1);
  if (existing) {
    return c.json({ success: false, error: { code: "CONFLICT", message: "Slug already taken" } }, 409);
  }
  const [created] = await db
    .insert(schema.integrations)
    .values({
      ...parsed.data,
      kind: "creator",
      enabled: false,
      reviewStatus: "pending",
      ownerUserId: userId,
    } as any)
    .returning();
  return c.json(ok(created));
});

// GET /api/creators/integrations — list own submissions
creatorIntegrationsRoutes.get("/", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json({ success: false, error: { code: "UNAUTHORIZED" } }, 401);
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.integrations)
    .where(eq(schema.integrations.ownerUserId, userId))
    .orderBy(desc(schema.integrations.createdAt));
  return c.json(ok(rows));
});

// PATCH /api/creators/integrations/:id — update own draft (only while pending or rejected)
creatorIntegrationsRoutes.patch("/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json({ success: false, error: { code: "UNAUTHORIZED" } }, 401);
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const parsed = CreatorSubmissionSchema.partial().safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.message } }, 400);
  }
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.integrations)
    .where(and(eq(schema.integrations.id, id), eq(schema.integrations.ownerUserId, userId)))
    .limit(1);
  if (!row) return c.json({ success: false, error: { code: "NOT_FOUND" } }, 404);
  if (row.reviewStatus === "approved") {
    return c.json({ success: false, error: { code: "FORBIDDEN", message: "Approved integrations cannot be edited; submit a new version." } }, 403);
  }
  const [updated] = await db
    .update(schema.integrations)
    .set({ ...parsed.data, reviewStatus: "pending", rejectionReason: null, updatedAt: new Date() } as any)
    .where(eq(schema.integrations.id, id))
    .returning();
  return c.json(ok(updated));
});

// ---------------------------------------------------------------------------
// Public DSR submission + admin processing
// ---------------------------------------------------------------------------
export const dsrPublicRoutes = new Hono<{ Variables: Variables }>();
export const dsrAdminRoutes = new Hono<{ Variables: Variables }>();
dsrAdminRoutes.use("*", superAdminMiddleware);

const DsrSubmissionSchema = z.object({
  requestType: z.enum(["access", "erasure", "rectification", "portability", "objection", "opt_out"]),
  subjectEmail: z.string().email(),
  identifiers: z.array(z.object({ type: z.string(), value: z.string() })).max(10).default([]),
  jurisdiction: z.enum(["eu", "uk", "california", "other"]).optional(),
  notes: z.string().max(2000).optional(),
});

// POST /api/data-subject-requests — public submission. Always returns 202;
// verification email is sent to subject_email before any data is touched.
dsrPublicRoutes.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = DsrSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.message } }, 400);
  }
  const db = getDb();
  const emailHash = await hashEmail(parsed.data.subjectEmail);
  const verificationToken = crypto.randomUUID().replace(/-/g, "");

  const [created] = await db
    .insert(schema.dataSubjectRequests)
    .values({
      requestType: parsed.data.requestType,
      subjectEmail: parsed.data.subjectEmail,
      subjectEmailHash: emailHash,
      identifiers: parsed.data.identifiers,
      jurisdiction: parsed.data.jurisdiction ?? null,
      notes: parsed.data.notes ?? null,
      status: "verifying_identity",
      verificationToken,
    } as any)
    .returning({ id: schema.dataSubjectRequests.id });

  // Email delivery is handled by the existing follow-up email worker — for
  // now we just return success; the worker picks up status='verifying_identity'.
  return c.json(
    ok({
      id: created.id,
      status: "verifying_identity",
      message: "Submitted. Check your email for a verification link to complete the request.",
    }),
    202,
  );
});

// GET /api/data-subject-requests/verify?token=...
dsrPublicRoutes.get("/verify", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: "Token required" } }, 400);
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.dataSubjectRequests)
    .where(eq(schema.dataSubjectRequests.verificationToken, token))
    .limit(1);
  if (!row) return c.json({ success: false, error: { code: "NOT_FOUND" } }, 404);
  if (row.status !== "verifying_identity") {
    return c.json(ok({ status: row.status, message: "Already verified or processed." }));
  }
  await db
    .update(schema.dataSubjectRequests)
    .set({ status: "pending", verificationCompletedAt: new Date(), updatedAt: new Date() } as any)
    .where(eq(schema.dataSubjectRequests.id, row.id));
  return c.json(ok({ status: "pending", message: "Verified. SuperAdmin will process within statutory window." }));
});

// SuperAdmin DSR processing
dsrAdminRoutes.get("/", async (c) => {
  const db = getDb();
  const status = c.req.query("status");
  const where = status ? eq(schema.dataSubjectRequests.status, status) : undefined;
  const rows = await db
    .select()
    .from(schema.dataSubjectRequests)
    .where(where as any)
    .orderBy(desc(schema.dataSubjectRequests.createdAt))
    .limit(200);
  return c.json(ok(rows));
});

// POST /api/admin/data-subject-requests/:id/process — execute the request
dsrAdminRoutes.post("/:id/process", async (c) => {
  const id = c.req.param("id");
  const adminId = uid(c);
  const db = getDb();
  const [dsr] = await db.select().from(schema.dataSubjectRequests).where(eq(schema.dataSubjectRequests.id, id)).limit(1);
  if (!dsr) return c.json({ success: false, error: { code: "NOT_FOUND" } }, 404);
  if (dsr.status === "completed" || dsr.status === "rejected") {
    return c.json({ success: false, error: { code: "CONFLICT", message: `DSR already ${dsr.status}` } }, 409);
  }

  let summary = "";
  if (dsr.requestType === "erasure") {
    // 1. Find all sourced_people with matching email_hash; redact them.
    const matches = await db
      .select()
      .from(schema.sourcedPeople)
      .where(eq(schema.sourcedPeople.primaryEmailHash, dsr.subjectEmailHash));
    for (const p of matches) {
      await db
        .update(schema.sourcedPeople)
        .set({
          fullName: null,
          givenName: null,
          familyName: null,
          primaryEmail: null,
          primaryLinkedinUrl: null,
          primaryGithubLogin: null,
          currentTitle: null,
          currentCompany: null,
          location: null,
          isRedacted: true,
          redactedAt: new Date(),
          redactionReason: "dsr_erasure",
          updatedAt: new Date(),
        } as any)
        .where(eq(schema.sourcedPeople.id, p.id));
      // Drop all source payloads + identifiers for this person.
      await db.delete(schema.personSources).where(eq(schema.personSources.personId, p.id));
      await db.delete(schema.personIdentifiers).where(eq(schema.personIdentifiers.personId, p.id));
      await db.delete(schema.enrichmentCache).where(eq(schema.enrichmentCache.personId, p.id));
    }

    // 2. Add suppression-list entries so re-import is blocked.
    await addToSuppressionList(db, {
      identifierType: "email",
      identifierValue: dsr.subjectEmail,
      reason: "erasure_request",
      sourceDsrId: dsr.id,
      addedBy: adminId,
    });
    for (const ident of (dsr.identifiers as any[]) ?? []) {
      if (ident?.type && ident?.value) {
        await addToSuppressionList(db, {
          identifierType: ident.type,
          identifierValue: ident.value,
          reason: "erasure_request",
          sourceDsrId: dsr.id,
          addedBy: adminId,
        });
      }
    }
    summary = `Redacted ${matches.length} sourced_people row(s); added suppression entries.`;
  } else if (dsr.requestType === "access" || dsr.requestType === "portability") {
    const matches = await db
      .select()
      .from(schema.sourcedPeople)
      .where(eq(schema.sourcedPeople.primaryEmailHash, dsr.subjectEmailHash));
    summary = `Found ${matches.length} sourced_people row(s). Compile export and email subject.`;
  } else if (dsr.requestType === "opt_out" || dsr.requestType === "objection") {
    await addToSuppressionList(db, {
      identifierType: "email",
      identifierValue: dsr.subjectEmail,
      reason: "user_opt_out",
      sourceDsrId: dsr.id,
      addedBy: adminId,
    });
    summary = "Email added to suppression list (opt_out).";
  } else if (dsr.requestType === "rectification") {
    summary = "Rectification — apply edits manually then mark complete.";
  }

  await db
    .update(schema.dataSubjectRequests)
    .set({
      status: "completed",
      processedBy: adminId,
      processedAt: new Date(),
      resultSummary: summary,
      updatedAt: new Date(),
    } as any)
    .where(eq(schema.dataSubjectRequests.id, id));
  return c.json(ok({ id, status: "completed", summary }));
});

// POST /api/admin/data-subject-requests/:id/reject
dsrAdminRoutes.post("/:id/reject", async (c) => {
  const id = c.req.param("id");
  const adminId = uid(c);
  const body = await c.req.json().catch(() => ({}));
  const reason = typeof body?.reason === "string" ? body.reason : "Rejected without reason";
  const db = getDb();
  const [updated] = await db
    .update(schema.dataSubjectRequests)
    .set({
      status: "rejected",
      processedBy: adminId,
      processedAt: new Date(),
      resultSummary: reason,
      updatedAt: new Date(),
    } as any)
    .where(eq(schema.dataSubjectRequests.id, id))
    .returning();
  if (!updated) return c.json({ success: false, error: { code: "NOT_FOUND" } }, 404);
  return c.json(ok(updated));
});

// ---------------------------------------------------------------------------
// SuperAdmin: suppression list
// ---------------------------------------------------------------------------
export const adminSuppressionRoutes = new Hono<{ Variables: Variables }>();
adminSuppressionRoutes.use("*", superAdminMiddleware);

adminSuppressionRoutes.get("/", async (c) => {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.dataSuppressionList)
    .orderBy(desc(schema.dataSuppressionList.createdAt))
    .limit(500);
  return c.json(ok(rows));
});

const AddSuppressionSchema = z.object({
  identifierType: z.enum(["email", "linkedin_url", "github_login", "twitter_handle", "phone_e164", "domain"]),
  identifierValue: z.string().min(2).max(512),
  reason: z.enum(["erasure_request", "user_opt_out", "admin_action", "bounce", "spam_complaint"]),
  notes: z.string().max(1000).optional(),
});
adminSuppressionRoutes.post("/", async (c) => {
  const userId = uid(c);
  const body = await c.req.json().catch(() => ({}));
  const parsed = AddSuppressionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.message } }, 400);
  }
  const db = getDb();
  await addToSuppressionList(db, {
    ...parsed.data,
    addedBy: userId,
  });
  return c.json(ok({ added: true }));
});

adminSuppressionRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const db = getDb();
  await db.delete(schema.dataSuppressionList).where(eq(schema.dataSuppressionList.id, id));
  return c.json(ok({ deleted: true }));
});

// Re-export a single combined route bundle for app.ts mounting convenience.
export const integrationsRouteBundle = {
  adminIntegrationsRoutes,
  sourcingRoutes,
  creatorIntegrationsRoutes,
  dsrPublicRoutes,
  dsrAdminRoutes,
  adminSuppressionRoutes,
};
