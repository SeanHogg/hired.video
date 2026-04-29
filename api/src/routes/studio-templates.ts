/**
 * Studio Template Marketplace Routes — thin HTTP layer over
 * `StudioTemplatesService`. Per the SOLID/DDD layering rule the route file
 * stays focused on:
 *   • Hono routing + auth middleware (Variables.user is set upstream)
 *   • Request parsing + zod validation
 *   • Mapping service errors to HTTP status codes
 *
 * All business rules (creator gate, consent, slug, fee snapshot, license
 * grants) live in the service.
 *
 * Mounts at /api/studio. Endpoints:
 *   POST   /templates                       — publish a new template
 *   GET    /templates/me                    — caller's own templates
 *   GET    /templates/listing/:slug         — public listing detail (anon ok)
 *   GET    /templates/:id                   — listing detail (anon ok)
 *   PATCH  /templates/:id                   — edit / publish / unpublish
 *   DELETE /templates/:id                   — owner only
 *   POST   /templates/:id/claim             — claim a free public template
 *   POST   /templates/:id/license           — record a paid grant (post-checkout)
 *   GET    /templates/licenses/me           — caller's owned templates (all kinds)
 */

import { Hono } from "hono";
import { z } from "zod";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import {
  StudioTemplatesService,
  StudioTemplatesError,
  type StudioTemplatesErrorCode,
  MAX_PRICE_CENTS,
} from "../services/studio/StudioTemplatesService.js";
import type { TemplateKind } from "../repositories/index.js";

export const studioTemplatesRoutes = new Hono<{ Variables: Variables }>();

// ─── Helpers ────────────────────────────────────────────────────────────────

function requireUserId(c: any): string | Response {
  const userId = c.var.user?.sub as string | undefined;
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  return userId;
}

function statusForCode(code: StudioTemplatesErrorCode): number {
  switch (code) {
    case "NOT_FOUND":
      return 404;
    case "FORBIDDEN":
      return 403;
    case "NOT_A_CREATOR":
    case "PROGRAM_NOT_ACTIVE":
      return 403;
    case "CONSENT_REQUIRED":
    case "VALIDATION_ERROR":
    case "INVALID_PRICE":
      return 400;
    default:
      return 500;
  }
}

function mapServiceError(c: any, err: unknown) {
  if (err instanceof StudioTemplatesError) {
    return c.json(error(err.code, err.message), statusForCode(err.code) as any);
  }
  const message = err instanceof Error ? err.message : "Internal error";
  return c.json(error("INTERNAL_ERROR", message), 500);
}

function readClientHeaders(c: any) {
  return {
    consentIp: (c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? null) as string | null,
    consentUa: (c.req.header("user-agent") ?? null) as string | null,
  };
}

const TEMPLATE_KINDS = ["resume", "job", "studio"] as const;

// ─── Schemas ────────────────────────────────────────────────────────────────

const PublishSchema = z.object({
  sourceProjectId: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(4000).nullable().optional(),
  thumbnailUrl: z.string().url().nullable().optional(),
  previewVideoUrl: z.string().url().nullable().optional(),
  language: z.string().max(20).nullable().optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  priceCents: z.number().int().min(0).max(MAX_PRICE_CENTS).default(0),
  currency: z.enum(["USD"]).optional(),
  visibility: z.enum(["private", "unlisted", "public"]).optional(),
  consentAccepted: z.boolean().optional(),
});

const UpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(4000).nullable().optional(),
  thumbnailUrl: z.string().url().nullable().optional(),
  previewVideoUrl: z.string().url().nullable().optional(),
  language: z.string().max(20).nullable().optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  priceCents: z.number().int().min(0).max(MAX_PRICE_CENTS).optional(),
  currency: z.enum(["USD"]).optional(),
  visibility: z.enum(["private", "unlisted", "public"]).optional(),
  consentAccepted: z.boolean().optional(),
});

const LicensePurchaseSchema = z.object({
  templateKind: z.enum(TEMPLATE_KINDS),
  templateId: z.string().min(1).max(200),
  pricePaidCents: z.number().int().min(0).max(MAX_PRICE_CENTS).default(0),
  paymentRef: z.string().max(200).nullable().optional(),
});

// ─── Service factory ────────────────────────────────────────────────────────
// One service instance per request — the service itself is cheap (no I/O at
// construction). Lets tests substitute via constructor in unit tests if they
// reach for the routes directly.
function svc(): StudioTemplatesService {
  return new StudioTemplatesService();
}

// ═══════════════════════════════════════════════════════════════════════════
// Publish + edit + delete
// ═══════════════════════════════════════════════════════════════════════════

studioTemplatesRoutes.post("/templates", async (c) => {
  const userId = requireUserId(c);
  if (typeof userId !== "string") return userId;

  const body = await c.req.json().catch(() => null);
  const parsed = PublishSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);
  }

  const headers = readClientHeaders(c);
  try {
    const row = await svc().publish({
      creatorUserId: userId,
      sourceProjectId: parsed.data.sourceProjectId,
      name: parsed.data.name,
      description: parsed.data.description,
      thumbnailUrl: parsed.data.thumbnailUrl,
      previewVideoUrl: parsed.data.previewVideoUrl,
      language: parsed.data.language,
      tags: parsed.data.tags,
      priceCents: parsed.data.priceCents,
      currency: parsed.data.currency,
      visibility: parsed.data.visibility,
      consentAccepted: parsed.data.consentAccepted,
      consentIp: headers.consentIp,
      consentUa: headers.consentUa,
    });
    return c.json(success(row), 201);
  } catch (err) {
    return mapServiceError(c, err);
  }
});

studioTemplatesRoutes.get("/templates/me", async (c) => {
  const userId = requireUserId(c);
  if (typeof userId !== "string") return userId;
  const rows = await svc().listForCreator(userId);
  return c.json(success(rows));
});

// Order matters in Hono — keep these specific routes BEFORE the generic
// /templates/:id matcher so /templates/listing/... and /templates/licenses/...
// don't get captured as id="listing".
studioTemplatesRoutes.get("/templates/listing/:slug", async (c) => {
  const slug = c.req.param("slug");
  const row = await svc().getBySlug(slug);
  if (!row || row.visibility !== "public") return c.json(error("NOT_FOUND", "Template not found"), 404);
  return c.json(success(row));
});

studioTemplatesRoutes.get("/templates/licenses/me", async (c) => {
  const userId = requireUserId(c);
  if (typeof userId !== "string") return userId;
  const rows = await svc().listLicensesForUser(userId);
  return c.json(success(rows));
});

studioTemplatesRoutes.get("/templates/:id", async (c) => {
  const id = c.req.param("id");
  const userId = c.var.user?.sub as string | undefined;
  const row = await svc().getById(id);
  if (!row) return c.json(error("NOT_FOUND", "Template not found"), 404);
  // Private + unlisted templates only visible to the creator.
  if (row.visibility !== "public" && row.creatorId !== userId) {
    return c.json(error("NOT_FOUND", "Template not found"), 404);
  }
  return c.json(success(row));
});

studioTemplatesRoutes.patch("/templates/:id", async (c) => {
  const userId = requireUserId(c);
  if (typeof userId !== "string") return userId;

  const id = c.req.param("id");
  const body = await c.req.json().catch(() => null);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);
  }

  const headers = readClientHeaders(c);
  try {
    const row = await svc().update({
      templateId: id,
      creatorUserId: userId,
      patch: {
        ...parsed.data,
        consentIp: headers.consentIp,
        consentUa: headers.consentUa,
      },
    });
    return c.json(success(row));
  } catch (err) {
    return mapServiceError(c, err);
  }
});

studioTemplatesRoutes.delete("/templates/:id", async (c) => {
  const userId = requireUserId(c);
  if (typeof userId !== "string") return userId;
  const id = c.req.param("id");
  try {
    await svc().deleteById(id, userId);
    return c.json(success({ deleted: true }));
  } catch (err) {
    return mapServiceError(c, err);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// License grants
// ═══════════════════════════════════════════════════════════════════════════

studioTemplatesRoutes.post("/templates/:id/claim", async (c) => {
  const userId = requireUserId(c);
  if (typeof userId !== "string") return userId;
  const id = c.req.param("id");
  try {
    const license = await svc().claimFree(userId, id);
    return c.json(success(license), 201);
  } catch (err) {
    return mapServiceError(c, err);
  }
});

// Trusted-frontend post-purchase fulfilment. The frontend cart already
// records the price + payment ref locally; this endpoint mirrors that into
// the server-truth license ledger so a logged-in user retains access on
// other devices. The Stripe / Helcim webhook can also POST here — both
// paths are idempotent thanks to uq_template_licenses_grant.
studioTemplatesRoutes.post("/templates/license", async (c) => {
  const userId = requireUserId(c);
  if (typeof userId !== "string") return userId;
  const body = await c.req.json().catch(() => null);
  const parsed = LicensePurchaseSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid request body", parsed.error.flatten()), 400);
  }
  try {
    const license = await svc().grantPurchase({
      userId,
      kind: parsed.data.templateKind as TemplateKind,
      templateId: parsed.data.templateId,
      pricePaidCents: parsed.data.pricePaidCents,
      paymentRef: parsed.data.paymentRef,
    });
    return c.json(success(license), 201);
  } catch (err) {
    return mapServiceError(c, err);
  }
});
