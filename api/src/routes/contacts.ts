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
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import {
  createContact,
  decideMergeRequest,
  deleteContact,
  editContact,
  enrichOwnedContact,
  getContact,
  getMergePolicy,
  linkJob,
  listContacts,
  listMergeQueue,
  setMergePolicy,
  unlinkJob,
} from "../services/contacts/contactsService.js";
import {
  CONTACT_JOB_STAGES,
  CONTACT_LIFECYCLES,
  MERGE_POLICY_MODES,
  MIN_DUPLICATE_CONFIDENCE_BPS,
} from "../../../shared/contacts.js";
import { requireUser } from "./helpers/routerHelpers.js";
import { validateJson } from "./helpers/validate.js";

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

contactRoutes.get("/", async (c) => {
  const owner = requireUser(c);
  const parsed = ListSchema.safeParse(c.req.query());
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid query", parsed.error.flatten()), 400);
  return c.json(success(await listContacts(owner, parsed.data)), 200);
});

contactRoutes.post("/", validateJson(CreateSchema, (e) => error("VALIDATION_ERROR", "Invalid contact", e.flatten()), { emptyBody: null }), async (c) => {
  const owner = requireUser(c);
  const result = await createContact(owner, c.req.valid("json"));
  return c.json(success(result), result.created ? 201 : 200);
});

contactRoutes.get("/merge-queue", async (c) => {
  const owner = requireUser(c);
  return c.json(success(await listMergeQueue(owner)), 200);
});

for (const [action, approve] of [["approve", true], ["reject", false]] as const) {
  contactRoutes.post(`/merge-queue/:id/${action}`, async (c) => {
    const owner = requireUser(c);
    const outcome = await decideMergeRequest(owner, c.req.param("id"), approve);
    return c.json(success({ outcome }), 200);
  });
}

contactRoutes.get("/merge-policy", async (c) => {
  const owner = requireUser(c);
  return c.json(success(await getMergePolicy(owner)), 200);
});

contactRoutes.put("/merge-policy", validateJson(PolicySchema, (e) => error("VALIDATION_ERROR", "Invalid policy", e.flatten()), { emptyBody: null }), async (c) => {
  const owner = requireUser(c);
  const body = c.req.valid("json");
  return c.json(success(await setMergePolicy(owner, body.mode, body.autoThresholdBps)), 200);
});

contactRoutes.get("/:id", async (c) => {
  const owner = requireUser(c);
  return c.json(success(await getContact(owner, c.req.param("id"))), 200);
});

contactRoutes.patch("/:id", validateJson(FieldsSchema, (e) => error("VALIDATION_ERROR", "Invalid contact", e.flatten()), { emptyBody: null }), async (c) => {
  const owner = requireUser(c);
  return c.json(success(await editContact(owner, c.req.param("id"), c.req.valid("json"))), 200);
});

contactRoutes.delete("/:id", async (c) => {
  const owner = requireUser(c);
  await deleteContact(owner, c.req.param("id"));
  return c.json(success({ deleted: true }), 200);
});

contactRoutes.post("/:id/enrich", async (c) => {
  const owner = requireUser(c);
  return c.json(success(await enrichOwnedContact(owner, c.req.param("id"))), 200);
});

contactRoutes.post("/:id/jobs", validateJson(LinkSchema, (e) => error("VALIDATION_ERROR", "Invalid link", e.flatten()), { emptyBody: null }), async (c) => {
  const owner = requireUser(c);
  const body = c.req.valid("json");
  return c.json(success(await linkJob(owner, c.req.param("id"), body.jobId, body.stage)), 200);
});

contactRoutes.delete("/:id/jobs/:jobId", async (c) => {
  const owner = requireUser(c);
  await unlinkJob(owner, c.req.param("id"), c.req.param("jobId"));
  return c.json(success({ removed: true }), 200);
});
