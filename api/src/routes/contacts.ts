/**
 * Contacts graph (mounted at /api/contacts, authenticated, owner-scoped).
 *
 *   GET    /                         — list (?q=&lifecycle=&limit=&offset=)
 *   POST   /                         — create-or-update by email (+ duplicate reconcile)
 *   GET    /merge-queue              — pending duplicate pairs
 *   POST   /merge-queue/:id/approve  — merge source into target
 *   POST   /merge-queue/:id/reject   — keep both, never re-queue the pair
 *   GET    /merge-policy             — auto vs review + threshold
 *   PUT    /merge-policy
 *   GET    /:id                      — one contact + its job links
 *   PATCH  /:id                      — owner edit
 *   DELETE /:id
 *   POST   /:id/enrich               — spend 1 enrichment credit, fill gaps
 *   POST   /:id/jobs                 — link to a job pipeline { jobId, stage }
 *   DELETE /:id/jobs/:jobId
 *
 * Not cached: every response is the caller's private, frequently-written
 * CRM data (each write would invalidate it), and lists are bounded by limit.
 */
import { Hono, type Context } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb } from "../db/index.js";
import { buildRepos } from "../repositories/index.js";
import { upsertContact, updateContact } from "../services/contacts/upsert.js";
import { decideMerge, resolveMergePolicy } from "../services/contacts/merge.js";
import { canManageJob, linkContactToJob, listContactJobs, unlinkContactFromJob } from "../services/contacts/pipeline.js";
import { enrichContact } from "../services/contacts/enrich.js";
import {
  CONTACT_JOB_STAGES,
  CONTACT_LIFECYCLES,
  MERGE_POLICY_MODES,
  MIN_DUPLICATE_CONFIDENCE_BPS,
} from "../../../shared/contacts.js";

export const contactRoutes = new Hono<AppEnv>();

const MAX_PAGE = 100;

const FieldsSchema = z.object({
  email: z.string().email().max(320).nullish(),
  fullName: z.string().max(255).nullish(),
  company: z.string().max(255).nullish(),
  title: z.string().max(255).nullish(),
  phone: z.string().max(64).nullish(),
  linkedinUrl: z.string().url().max(2048).nullish(),
  notes: z.string().max(5000).nullish(),
  lifecycle: z.enum(CONTACT_LIFECYCLES).optional(),
});

const CreateSchema = FieldsSchema.refine((v) => Boolean(v.email || v.fullName), {
  message: "email or fullName is required",
});

const ListSchema = z.object({
  q: z.string().max(200).optional(),
  lifecycle: z.enum(CONTACT_LIFECYCLES).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const LinkSchema = z.object({
  jobId: z.string().uuid(),
  stage: z.enum(CONTACT_JOB_STAGES).default("sourced"),
});

const PolicySchema = z.object({
  mode: z.enum(MERGE_POLICY_MODES),
  autoThresholdBps: z.number().int().min(MIN_DUPLICATE_CONFIDENCE_BPS).max(10000),
});

function ownerId(c: Context<AppEnv>): string | null {
  return c.var.user?.sub ?? null;
}

function repos() {
  return buildRepos(getDb());
}

const unauthorized = (c: Context<AppEnv>) => c.json(error("UNAUTHORIZED", "Authentication required"), 401);
const notFound = (c: Context<AppEnv>) => c.json(error("NOT_FOUND", "Contact not found"), 404);

contactRoutes.get("/", async (c) => {
  const owner = ownerId(c);
  if (!owner) return unauthorized(c);
  const parsed = ListSchema.safeParse(c.req.query());
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid query", parsed.error.flatten()), 400);
  const rows = await repos().contacts.list(owner, parsed.data);
  return c.json(success(rows), 200);
});

contactRoutes.post("/", async (c) => {
  const owner = ownerId(c);
  if (!owner) return unauthorized(c);
  const parsed = CreateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid contact", parsed.error.flatten()), 400);
  const result = await upsertContact(repos(), owner, { ...parsed.data, source: "manual" });
  return c.json(success(result), result.created ? 201 : 200);
});

contactRoutes.get("/merge-queue", async (c) => {
  const owner = ownerId(c);
  if (!owner) return unauthorized(c);
  return c.json(success(await repos().personMerge.listPending(owner)), 200);
});

for (const [action, approve] of [["approve", true], ["reject", false]] as const) {
  contactRoutes.post(`/merge-queue/:id/${action}`, async (c) => {
    const owner = ownerId(c);
    if (!owner) return unauthorized(c);
    const outcome = await decideMerge(repos(), owner, c.req.param("id"), approve);
    if (outcome === "not_found") return c.json(error("NOT_FOUND", "Merge request not found"), 404);
    if (outcome === "stale") return c.json(error("CONFLICT", "Merge request is no longer pending"), 409);
    return c.json(success({ outcome }), 200);
  });
}

contactRoutes.get("/merge-policy", async (c) => {
  const owner = ownerId(c);
  if (!owner) return unauthorized(c);
  const { mode, autoThresholdBps } = await resolveMergePolicy(repos(), owner);
  return c.json(success({ mode, autoThresholdBps }), 200);
});

contactRoutes.put("/merge-policy", async (c) => {
  const owner = ownerId(c);
  if (!owner) return unauthorized(c);
  const parsed = PolicySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid policy", parsed.error.flatten()), 400);
  const r = repos();
  const workspaceId = await r.personMerge.ensurePersonalWorkspaceId(owner);
  const row = await r.personMerge.upsertPolicy(workspaceId, parsed.data.mode, parsed.data.autoThresholdBps);
  return c.json(success({ mode: row.mode, autoThresholdBps: row.autoThresholdBps }), 200);
});

contactRoutes.get("/:id", async (c) => {
  const owner = ownerId(c);
  if (!owner) return unauthorized(c);
  const r = repos();
  const contact = await r.contacts.findById(owner, c.req.param("id"));
  if (!contact) return notFound(c);
  const jobs = await listContactJobs(r, owner, contact.id);
  return c.json(success({ ...contact, jobs: jobs ?? [] }), 200);
});

contactRoutes.patch("/:id", async (c) => {
  const owner = ownerId(c);
  if (!owner) return unauthorized(c);
  const parsed = FieldsSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid contact", parsed.error.flatten()), 400);
  try {
    const row = await updateContact(repos(), owner, c.req.param("id"), parsed.data);
    return row ? c.json(success(row), 200) : notFound(c);
  } catch (err) {
    // Unique (owner, lower(email)) — another contact already has this email.
    if (err instanceof Error && /uq_contacts_owner_email|duplicate key/i.test(err.message)) {
      return c.json(error("CONFLICT", "Another contact already uses this email"), 409);
    }
    throw err;
  }
});

contactRoutes.delete("/:id", async (c) => {
  const owner = ownerId(c);
  if (!owner) return unauthorized(c);
  const deleted = await repos().contacts.delete(owner, c.req.param("id"));
  return deleted ? c.json(success({ deleted: true }), 200) : notFound(c);
});

contactRoutes.post("/:id/enrich", async (c) => {
  const owner = ownerId(c);
  if (!owner) return unauthorized(c);
  const result = await enrichContact(repos(), owner, c.req.param("id"));
  if ("reason" in result) {
    if (result.reason === "not_found") return notFound(c);
    return c.json(error("INSUFFICIENT_CREDITS", "No enrichment credits remaining. Purchase a pack to continue."), 402);
  }
  return c.json(success(result), 200);
});

contactRoutes.post("/:id/jobs", async (c) => {
  const owner = ownerId(c);
  if (!owner) return unauthorized(c);
  const parsed = LinkSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid link", parsed.error.flatten()), 400);
  const result = await linkContactToJob(
    { contacts: repos().contacts, canManageJob },
    owner,
    c.req.param("id"),
    parsed.data.jobId,
    parsed.data.stage,
  );
  if ("reason" in result) {
    if (result.reason === "contact_not_found") return notFound(c);
    return c.json(error("FORBIDDEN", "You can't manage that job's pipeline"), 403);
  }
  return c.json(success(result.link), 200);
});

contactRoutes.delete("/:id/jobs/:jobId", async (c) => {
  const owner = ownerId(c);
  if (!owner) return unauthorized(c);
  const removed = await unlinkContactFromJob(repos(), owner, c.req.param("id"), c.req.param("jobId"));
  return removed ? c.json(success({ removed: true }), 200) : notFound(c);
});
