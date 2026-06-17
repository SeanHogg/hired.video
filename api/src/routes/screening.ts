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
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { UuidLikeSchema } from "../../../shared/validation.js";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import {
  resolveCompanyScope,
  userCanAccessCompany,
} from "../services/company/scope.js";
import {
  SCREENING_ITEM_CATALOG,
  SCREENING_ITEM_TYPES,
  getScreeningCatalogEntry,
  type ScreeningItemType,
} from "../../../shared/screening.js";
import {
  archiveTemplate,
  createTemplate,
  getTemplateWithItems,
  listTemplates,
  updateTemplate,
} from "../services/screening/template-service.js";
import {
  claimRequest,
  createScreeningRequest,
  getRequestByToken,
  listRequests,
  resolveApplicationForScreening,
  satisfyRequestItem,
} from "../services/screening/request-service.js";
import { sendScreeningInvitationEmail } from "../services/adapters/email.js";

export const screeningRoutes = new Hono<AppEnv>();
export const screeningPublicRoutes = new Hono<AppEnv>();

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

/**
 * Best-effort invite send + stamp, shared by the standalone send, the resend,
 * and the from-application send (#1855). A send failure must NOT roll back the
 * row — the recruiter can always resend (mirrors the account-invite pattern).
 * `incrementResend` bumps the resend counter for the resend path only.
 */
async function deliverInvitation(
  request: {
    id: string;
    candidateEmail: string;
    candidateName: string | null;
    token: string;
    message: string | null;
    resendCount?: number | null;
  },
  opts?: { incrementResend?: boolean },
) {
  await sendScreeningInvitationEmail({
    to: request.candidateEmail,
    candidateName: request.candidateName,
    token: request.token,
    message: request.message,
  }).catch(() => undefined);
  const now = new Date();
  const [updated] = await getDb()
    .update(schema.screeningRequests)
    .set({
      lastSentAt: now,
      updatedAt: now,
      ...(opts?.incrementResend
        ? { resendCount: (request.resendCount ?? 0) + 1 }
        : {}),
    })
    .where(eq(schema.screeningRequests.id, request.id))
    .returning();
  return updated;
}

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
screeningRoutes.get("/templates", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const scope = await resolveCompanyScope(userId, c.req.query("companyId"));
  if (scope.companyIds.length === 0) return c.json(success([]), 200);
  const filter = c.req.query("companyId");
  if (filter && !scope.companyIds.includes(filter)) {
    return c.json(error("FORBIDDEN", "Access denied"), 403);
  }
  const rows = await listTemplates(
    getDb(),
    filter ? [filter] : scope.companyIds,
  );
  return c.json(success(rows), 200);
});

screeningRoutes.get("/templates/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const loaded = await getTemplateWithItems(getDb(), c.req.param("id"));
  if (!loaded) return c.json(error("NOT_FOUND", "Template not found"), 404);
  if (!(await userCanAccessCompany(userId, loaded.template.companyId))) {
    return c.json(error("FORBIDDEN", "Access denied"), 403);
  }
  return c.json(success(loaded), 200);
});

screeningRoutes.post("/templates", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = CreateTemplateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid template", parsed.error.flatten()), 400);
  }
  if (!(await userCanAccessCompany(userId, parsed.data.companyId))) {
    return c.json(error("FORBIDDEN", "Access denied"), 403);
  }
  try {
    const created = await createTemplate(getDb(), {
      companyId: parsed.data.companyId,
      createdByUserId: userId,
      name: parsed.data.name,
      description: parsed.data.description,
      roleFamily: parsed.data.roleFamily,
      jobId: parsed.data.jobId,
      items: parsed.data.items,
    });
    return c.json(success(created), 201);
  } catch (e) {
    return c.json(error("VALIDATION_ERROR", e instanceof Error ? e.message : "Invalid item"), 400);
  }
});

screeningRoutes.patch("/templates/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const loaded = await getTemplateWithItems(getDb(), c.req.param("id"));
  if (!loaded) return c.json(error("NOT_FOUND", "Template not found"), 404);
  if (!(await userCanAccessCompany(userId, loaded.template.companyId))) {
    return c.json(error("FORBIDDEN", "Access denied"), 403);
  }
  const parsed = UpdateTemplateSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid template", parsed.error.flatten()), 400);
  }
  try {
    const updated = await updateTemplate(getDb(), c.req.param("id"), parsed.data);
    return c.json(success(updated), 200);
  } catch (e) {
    return c.json(error("VALIDATION_ERROR", e instanceof Error ? e.message : "Invalid item"), 400);
  }
});

screeningRoutes.delete("/templates/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const loaded = await getTemplateWithItems(getDb(), c.req.param("id"));
  if (!loaded) return c.json(error("NOT_FOUND", "Template not found"), 404);
  if (!(await userCanAccessCompany(userId, loaded.template.companyId))) {
    return c.json(error("FORBIDDEN", "Access denied"), 403);
  }
  await archiveTemplate(getDb(), c.req.param("id"));
  return c.json(success({ id: c.req.param("id") }), 200);
});

// ─────────────────────────────────────────────────────────────────────────────
// Recruiter: requests
// ─────────────────────────────────────────────────────────────────────────────
screeningRoutes.get("/requests", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const scope = await resolveCompanyScope(userId, c.req.query("companyId"));
  if (scope.companyIds.length === 0) return c.json(success([]), 200);
  const filter = c.req.query("companyId");
  if (filter && !scope.companyIds.includes(filter)) {
    return c.json(error("FORBIDDEN", "Access denied"), 403);
  }
  const rows = await listRequests(getDb(), filter ? [filter] : scope.companyIds);
  return c.json(success(rows), 200);
});

screeningRoutes.get("/requests/:id", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [request] = await db
    .select()
    .from(schema.screeningRequests)
    .where(eq(schema.screeningRequests.id, c.req.param("id")))
    .limit(1);
  if (!request) return c.json(error("NOT_FOUND", "Request not found"), 404);
  if (!(await userCanAccessCompany(userId, request.companyId))) {
    return c.json(error("FORBIDDEN", "Access denied"), 403);
  }
  const items = await db
    .select()
    .from(schema.screeningRequestItems)
    .where(eq(schema.screeningRequestItems.requestId, request.id))
    .orderBy(schema.screeningRequestItems.displayOrder);
  return c.json(success({ request, items }), 200);
});

screeningRoutes.post("/requests", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = CreateRequestSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);
  }
  if (!(await userCanAccessCompany(userId, parsed.data.companyId))) {
    return c.json(error("FORBIDDEN", "Access denied"), 403);
  }
  const created = await createScreeningRequest(getDb(), {
    companyId: parsed.data.companyId,
    createdByUserId: userId,
    templateId: parsed.data.templateId,
    candidateEmail: parsed.data.candidateEmail,
    candidateName: parsed.data.candidateName,
    candidateUserId: parsed.data.candidateUserId,
    jobId: parsed.data.jobId,
    applicationId: parsed.data.applicationId,
    message: parsed.data.message,
    expiresInDays: parsed.data.expiresInDays,
  });
  if (!created) return c.json(error("NOT_FOUND", "Template not found for this company"), 404);

  await deliverInvitation(created.request);
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
screeningRoutes.post("/requests/from-application", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = FromApplicationSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);
  }

  const ctx = await resolveApplicationForScreening(getDb(), parsed.data.applicationId);
  if (!ctx) return c.json(error("NOT_FOUND", "Application not found"), 404);
  if (!ctx.companyId) {
    return c.json(
      error("CONFLICT", "Link this job to a company before sending a screening"),
      409,
    );
  }
  if (!ctx.candidateEmail) {
    return c.json(error("CONFLICT", "This applicant has no email on file"), 409);
  }
  if (!(await userCanAccessCompany(userId, ctx.companyId))) {
    return c.json(error("FORBIDDEN", "Access denied"), 403);
  }

  const created = await createScreeningRequest(getDb(), {
    companyId: ctx.companyId,
    createdByUserId: userId,
    templateId: parsed.data.templateId,
    candidateEmail: ctx.candidateEmail,
    candidateName: ctx.candidateName,
    candidateUserId: ctx.candidateUserId,
    jobId: ctx.jobId,
    applicationId: ctx.applicationId,
    message: parsed.data.message,
    expiresInDays: parsed.data.expiresInDays,
  });
  if (!created) return c.json(error("NOT_FOUND", "Template not found for this company"), 404);

  await deliverInvitation(created.request);
  return c.json(success({ ...created }), 201);
});

screeningRoutes.post("/requests/:id/resend", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [request] = await db
    .select()
    .from(schema.screeningRequests)
    .where(eq(schema.screeningRequests.id, c.req.param("id")))
    .limit(1);
  if (!request) return c.json(error("NOT_FOUND", "Request not found"), 404);
  if (!(await userCanAccessCompany(userId, request.companyId))) {
    return c.json(error("FORBIDDEN", "Access denied"), 403);
  }
  await sendScreeningInvitationEmail({
    to: request.candidateEmail,
    candidateName: request.candidateName,
    token: request.token,
    message: request.message,
  }).catch(() => undefined);
  const [updated] = await db
    .update(schema.screeningRequests)
    .set({
      lastSentAt: new Date(),
      resendCount: (request.resendCount ?? 0) + 1,
      updatedAt: new Date(),
    })
    .where(eq(schema.screeningRequests.id, request.id))
    .returning();
  return c.json(success(updated), 200);
});

// ─────────────────────────────────────────────────────────────────────────────
// Candidate portal (token-authorized)
// ─────────────────────────────────────────────────────────────────────────────

/** Shape returned to the portal — never leaks recruiter-internal fields. */
function toPortalView(loaded: NonNullable<Awaited<ReturnType<typeof getRequestByToken>>>) {
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
  const loaded = await getRequestByToken(getDb(), c.req.param("token"));
  if (!loaded) return c.json(error("NOT_FOUND", "This screening link is no longer available"), 404);
  return c.json(success(toPortalView(loaded)), 200);
});

screeningPublicRoutes.post("/:token/claim", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Sign in to link this screening"), 401);
  const loaded = await claimRequest(getDb(), c.req.param("token"), userId);
  if (!loaded) return c.json(error("NOT_FOUND", "This screening link is no longer available"), 404);
  return c.json(success(toPortalView(loaded)), 200);
});

const SatisfySchema = z.object({
  resultRef: z.record(z.string(), z.unknown()).optional(),
});

screeningPublicRoutes.post("/:token/items/:itemId/satisfy", async (c) => {
  const parsed = SatisfySchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid payload"), 400);
  const loaded = await satisfyRequestItem(getDb(), c.req.param("token"), c.req.param("itemId"), {
    resultRef: parsed.data.resultRef,
    candidateUserId: uid(c),
  });
  if (!loaded) return c.json(error("NOT_FOUND", "This screening link is no longer available"), 404);
  return c.json(success(toPortalView(loaded)), 200);
});
