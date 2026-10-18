/**
 * /api/recruit/screening  — recruiter/employer authoring + sending
 * /api/public/screening   — candidate magic-link portal (token-authorized)
 *
 * A company authors reusable per-role screening templates, then sends one to a
 * candidate as a screening request. The request mints a magic link; the
 * candidate completes outstanding items in the public portal. Items the
 * candidate already has on file are pre-satisfied by the pitch-book resolver at
 * send time, so the portal only asks for what's missing.
 *
 * Recruiter surface (auth required; company-scoped via resolveCompanyScope):
 *   GET    /templates?companyId=          list role templates
 *   GET    /templates/:id                 template + ordered items
 *   POST   /templates                     create  { companyId, name, items[] , … }
 *   PATCH  /templates/:id                 update  (items = replace-all)
 *   DELETE /templates/:id                 archive
 *   GET    /requests?companyId=           sent requests (newest first)
 *   GET    /requests/:id                  request + items
 *   POST   /requests                      send    { companyId, templateId, candidateEmail, … }
 *   POST   /requests/:id/resend           re-send the invitation email
 *
 * Candidate portal (token = bearer; optional-auth so a signed-in candidate
 * binds + benefits from pull-don't-ask, anonymous candidates still proceed):
 *   GET    /:token                        portal view (outstanding items)
 *   POST   /:token/claim                  bind signed-in user + re-resolve
 *   POST   /:token/items/:itemId/satisfy  complete one item with a result pointer
 */

import { Hono } from "hono";
import { z } from "zod";
import { UuidLikeSchema } from "../../../shared/validation.js";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import {
  SCREENING_ITEM_CATALOG,
  SCREENING_ITEM_TYPES,
  getScreeningCatalogEntry,
  type ScreeningItemType,
} from "../../../shared/screening.js";
import type { RequestWithItems } from "../services/screening/request-service.js";
import {
  archiveScreeningTemplate,
  claimScreeningPortal,
  createScreeningTemplate,
  getScreeningRequest,
  getScreeningTemplate,
  listScreeningRequests,
  listScreeningTemplates,
  loadScreeningPortal,
  resendScreeningRequest,
  satisfyScreeningPortalItem,
  sendScreeningFromApplication,
  sendScreeningRequest,
  updateScreeningTemplate,
} from "../services/screening/screening-use-cases.js";
import { requireUser } from "./helpers/routerHelpers.js";
import { validateJson, type InvalidBodyHook } from "./helpers/validate.js";

export const screeningRoutes = new Hono<AppEnv>();
export const screeningPublicRoutes = new Hono<AppEnv>();

// ── Shared zod ───────────────────────────────────────────────────────────────
const ItemTypeEnum = z.enum(
  SCREENING_ITEM_TYPES as unknown as [ScreeningItemType, ...ScreeningItemType[]],
);

const TemplateItemSchema = z.object({
  itemType: ItemTypeEnum,
  refId: UuidLikeSchema.nullable().optional(),
  config: z.unknown().optional(),
  isRequired: z.boolean().optional(),
  displayOrder: z.number().int().min(0).optional(),
});

const CreateTemplateSchema = z.object({
  companyId: UuidLikeSchema,
  name: z.string().min(1).max(255),
  description: z.string().max(4000).nullable().optional(),
  roleFamily: z.string().max(120).nullable().optional(),
  jobId: UuidLikeSchema.nullable().optional(),
  items: z.array(TemplateItemSchema).max(50).default([]),
});

const UpdateTemplateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(4000).nullable().optional(),
  roleFamily: z.string().max(120).nullable().optional(),
  jobId: UuidLikeSchema.nullable().optional(),
  items: z.array(TemplateItemSchema).max(50).optional(),
});

const CreateRequestSchema = z.object({
  companyId: UuidLikeSchema,
  templateId: UuidLikeSchema,
  candidateEmail: z.string().email(),
  candidateName: z.string().max(255).optional(),
  candidateUserId: UuidLikeSchema.optional(),
  jobId: UuidLikeSchema.optional(),
  applicationId: UuidLikeSchema.optional(),
  message: z.string().max(4000).optional(),
  expiresInDays: z.number().int().min(1).max(60).optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Recruiter: catalog
// ─────────────────────────────────────────────────────────────────────────────
screeningRoutes.get("/catalog", (c) => c.json(success(SCREENING_ITEM_CATALOG), 200));

// ─────────────────────────────────────────────────────────────────────────────
// Recruiter: templates
// ─────────────────────────────────────────────────────────────────────────────
const invalidTemplate: InvalidBodyHook = (e) => error("VALIDATION_ERROR", "Invalid template", e.flatten());

screeningRoutes.get("/templates", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await listScreeningTemplates(userId, c.req.query("companyId"))), 200);
});

screeningRoutes.get("/templates/:id", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await getScreeningTemplate(userId, c.req.param("id"))), 200);
});

screeningRoutes.post("/templates", validateJson(CreateTemplateSchema, invalidTemplate), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  const created = await createScreeningTemplate(userId, {
    companyId: body.companyId,
    name: body.name,
    description: body.description,
    roleFamily: body.roleFamily,
    jobId: body.jobId,
    items: body.items,
  });
  return c.json(success(created), 201);
});

screeningRoutes.patch("/templates/:id", validateJson(UpdateTemplateSchema, invalidTemplate), async (c) => {
  const userId = requireUser(c);
  const updated = await updateScreeningTemplate(userId, c.req.param("id"), c.req.valid("json"));
  return c.json(success(updated), 200);
});

screeningRoutes.delete("/templates/:id", async (c) => {
  const userId = requireUser(c);
  await archiveScreeningTemplate(userId, c.req.param("id"));
  return c.json(success({ id: c.req.param("id") }), 200);
});

// ─────────────────────────────────────────────────────────────────────────────
// Recruiter: requests
// ─────────────────────────────────────────────────────────────────────────────
screeningRoutes.get("/requests", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await listScreeningRequests(userId, c.req.query("companyId"))), 200);
});

screeningRoutes.get("/requests/:id", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await getScreeningRequest(userId, c.req.param("id"))), 200);
});

screeningRoutes.post("/requests", validateJson(CreateRequestSchema), async (c) => {
  const userId = requireUser(c);
  const { companyId, templateId, candidateEmail, candidateName, candidateUserId, jobId, applicationId, message, expiresInDays } =
    c.req.valid("json");
  const created = await sendScreeningRequest(userId, {
    companyId,
    templateId,
    candidateEmail,
    candidateName,
    candidateUserId,
    jobId,
    applicationId,
    message,
    expiresInDays,
  });
  return c.json(success({ ...created }), 201);
});

const FromApplicationSchema = z.object({
  applicationId: UuidLikeSchema,
  templateId: UuidLikeSchema,
  message: z.string().max(4000).optional(),
  expiresInDays: z.number().int().min(1).max(60).optional(),
});

// Send a role's screening template to an existing applicant straight from the
// pipeline (#1855). Resolves candidate + company from the application, so the
// recruiter doesn't re-type the email — the application IS the candidate.
screeningRoutes.post("/requests/from-application", validateJson(FromApplicationSchema), async (c) => {
  const userId = requireUser(c);
  const created = await sendScreeningFromApplication(userId, c.req.valid("json"));
  return c.json(success({ ...created }), 201);
});

screeningRoutes.post("/requests/:id/resend", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await resendScreeningRequest(userId, c.req.param("id"))), 200);
});

// ─────────────────────────────────────────────────────────────────────────────
// Candidate portal (token-authorized)
// ─────────────────────────────────────────────────────────────────────────────

/** Shape returned to the portal — never leaks recruiter-internal fields. */
function toPortalView(loaded: RequestWithItems) {
  const { request, items } = loaded;
  return {
    status: request.status,
    candidateName: request.candidateName,
    candidateEmail: request.candidateEmail,
    message: request.message,
    expiresAt: request.tokenExpiresAt,
    jobId: request.jobId,
    items: items.map((i) => {
      const entry = getScreeningCatalogEntry(i.itemType as ScreeningItemType);
      return {
        id: i.id,
        itemType: i.itemType,
        title: entry.title,
        description: entry.description,
        refId: i.refId,
        config: i.config,
        isRequired: i.isRequired,
        status: i.status,
        satisfiedSource: i.satisfiedSource,
      };
    }),
  };
}

screeningPublicRoutes.get("/:token", async (c) => {
  return c.json(success(toPortalView(await loadScreeningPortal(c.req.param("token")))), 200);
});

screeningPublicRoutes.post("/:token/claim", async (c) => {
  const userId = requireUser(c);
  return c.json(success(toPortalView(await claimScreeningPortal(c.req.param("token"), userId))), 200);
});

const SatisfySchema = z.object({
  resultRef: z.record(z.string(), z.unknown()).optional(),
});

screeningPublicRoutes.post("/:token/items/:itemId/satisfy", validateJson(SatisfySchema, () => error("VALIDATION_ERROR", "Invalid payload")), async (c) => {
  const body = c.req.valid("json");
  const loaded = await satisfyScreeningPortalItem(c.req.param("token"), c.req.param("itemId"), {
    resultRef: body.resultRef,
    candidateUserId: c.var.userId,
  });
  return c.json(success(toPortalView(loaded)), 200);
});
