/**
 * Studio Template Marketplace Routes — thin HTTP layer over
 * `StudioTemplatesService`. Per the SOLID/DDD layering rule the route file
 * stays focused on:
 *   • Hono routing + auth middleware (Variables.user is set upstream)
 *   • Request parsing + zod validation
 * Service errors (StudioTemplatesError) are DomainErrors carrying their own
 * status; the global error handler renders them.
 *
 * All business rules (creator gate, consent, slug, fee snapshot) live in
 * StudioTemplatesService; license grants in StudioTemplateLicensesService.
 *
 * These are the ONLY template endpoints: every creator template — video,
 * podcast, résumé (document_kind 'resume'), job… — is published, browsed,
 * licensed and fetched here.
 *
 * Mounts at /api/studio. Endpoints:
 *   POST   /templates                       — publish a new template
 *   POST   /templates/from-resume/:resumeId — save the caller's résumé design as a résumé template
 *   GET    /templates/public                — every visibility='public' listing (anon ok)
 *   GET    /templates/me                    — caller's own templates
 *   GET    /templates/me/earnings           — per-template earnings rollup (creator only)
 *   GET    /templates/me/licensed           — studio templates the caller claimed/purchased (joined w/ template row)
 *   GET    /templates/listing/:slug         — public listing detail (anon ok)
 *   GET    /templates/:id                   — listing detail (anon ok)
 *   PATCH  /templates/:id                   — edit / publish / unpublish
 *   DELETE /templates/:id                   — owner only
 *   POST   /templates/:id/claim             — claim a free public template
 *   POST   /templates/:id/license           — record a paid grant (post-checkout)
 *   GET    /templates/licenses/me           — caller's owned templates (all kinds)
 */

import { Hono, type Context } from "hono";
import { z } from "zod";
import { UuidLikeSchema } from "../../../shared/validation.js";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { StudioTemplatesService, MAX_PRICE_CENTS } from "../services/studio/StudioTemplatesService.js";
import {
  StudioTemplateLicensesService,
  GRANTABLE_TEMPLATE_KINDS,
} from "../services/studio/StudioTemplateLicensesService.js";
import { clampLimit } from "../utils/pagination.js";
import { requireUser } from "./helpers/routerHelpers.js";
import { validateJson } from "./helpers/validate.js";

/** `?limit` for the public listings: absent → service default; else clamp 1..200 (default 100). */
function optionalTemplateLimit(raw: string | undefined): number | undefined {
  return raw ? clampLimit(raw, 100, 200) : undefined;
}

export const studioTemplatesRoutes = new Hono<AppEnv>();

// ─── Helpers ────────────────────────────────────────────────────────────────

function readClientHeaders(c: Context<AppEnv>) {
  return {
    consentIp: (c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? null) as string | null,
    consentUa: (c.req.header("user-agent") ?? null) as string | null,
  };
}

// ─── Schemas ────────────────────────────────────────────────────────────────

/** Listing fields every publish takes, whatever its source. */
const PublishFieldsSchema = z.object({
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
  /** Optional inline VideoScript — V2 callers pass `canvasStateToScript(state)`
   *  at click time so the V2 project row doesn't have to mirror a v1
   *  storyboard column on every save (#637 — no duplicate content).
   *  Accepted as unknown JSON; the service trusts the caller (same auth
   *  context as the project owner) and sanitises before persistence. */
  videoScript: z.unknown().optional(),
});

const PublishSchema = PublishFieldsSchema.extend({ sourceProjectId: UuidLikeSchema });

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
  // 'resume' is legacy (built-in résumé presets are free; creator résumé
  // templates are 'studio') — no new grant is recorded under it.
  templateKind: z.enum(GRANTABLE_TEMPLATE_KINDS),
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

function licenses(): StudioTemplateLicensesService {
  return new StudioTemplateLicensesService();
}

// ═══════════════════════════════════════════════════════════════════════════
// Publish + edit + delete
// ═══════════════════════════════════════════════════════════════════════════

/** ONE publish handler for every source: validate the listing fields, then
 *  hand the source + fields to the single publish use case. */
async function publishFrom(
  c: Context<AppEnv>,
  userId: string,
  source: { sourceProjectId: string } | { sourceResumeId: string },
  fields: z.infer<typeof PublishFieldsSchema>,
) {
  const row = await svc().publish({ ...fields, ...source, creatorUserId: userId, ...readClientHeaders(c) });
  return c.json(success(row), 201);
}

function invalidBody(c: Context<AppEnv>, flattened: unknown) {
  return c.json(error("VALIDATION_ERROR", "Invalid request body", flattened), 400);
}

studioTemplatesRoutes.post("/templates", validateJson(PublishSchema, (e, c) => invalidBody(c, e.flatten()), { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  const { sourceProjectId, ...fields } = body;
  return publishFrom(c, userId, { sourceProjectId }, fields);
});

// The career kit's "Save design as template": the caller's résumé design
// (the live one in `videoScript`, else the résumé's stored design) becomes a
// résumé template — same rules as any publish; owner-only, content stripped.
studioTemplatesRoutes.post("/templates/from-resume/:resumeId", validateJson(PublishFieldsSchema, (e, c) => invalidBody(c, e.flatten()), { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const resumeId = UuidLikeSchema.safeParse(c.req.param("resumeId"));
  if (!resumeId.success) return invalidBody(c, resumeId.error.flatten());
  return publishFrom(c, userId, { sourceResumeId: resumeId.data }, c.req.valid("json"));
});

studioTemplatesRoutes.get("/templates/me", async (c) => {
  const userId = requireUser(c);
  const rows = await svc().listForCreator(userId);
  return c.json(success(rows));
});

// Per-template earnings rollup for the creator's /services dashboard
// (#631). Returns one row per owned template (including zero-sale rows)
// plus aggregate totals so the consumer doesn't recompute them. Path is
// `/templates/me/earnings` rather than `/templates/earnings/me` so the
// `/templates/me` prefix scopes both reads under one mental model.
studioTemplatesRoutes.get("/templates/me/earnings", async (c) => {
  const userId = requireUser(c);
  const data = await svc().earningsForCreator(userId);
  return c.json(success(data));
});

// Studio templates the caller has claimed (free) or purchased (paid).
// Used by /studio "Your templates" so the user can browse + open the
// templates they own without going through the marketplace. Joined with
// the template row so a single round-trip is enough to render cards.
// `owner` licenses are excluded — those mirror `/templates/me` and the
// consumer wants Created and Purchased rendered as distinct lists.
studioTemplatesRoutes.get("/templates/me/licensed", async (c) => {
  const userId = requireUser(c);
  const rows = await licenses().listLicensedStudioTemplatesForUser(userId);
  return c.json(success(rows));
});

// Public marketplace listing — visibility='public' rows across all creators.
// No auth: anonymous browsers + logged-in users both see the same set, which
// is what makes the marketplace a marketplace (gap #629). The service's
// listPublic supports ?search and ?limit; both are optional and clamped.
studioTemplatesRoutes.get("/templates/public", async (c) => {
  const search = c.req.query("search")?.trim() || undefined;
  const limit = optionalTemplateLimit(c.req.query("limit"));
  const rows = await svc().listPublicCached({ search, limit });
  return c.json(success(rows));
});

// Per-creator public listing — every visibility='public' template authored
// by :userId. Registered above /templates/:id so Hono's router doesn't
// match the literal `public` segment as id="public".
studioTemplatesRoutes.get("/templates/public/by-user/:userId", async (c) => {
  const userId = c.req.param("userId");
  const limit = optionalTemplateLimit(c.req.query("limit"));
  const rows = await svc().listPublicForCreatorCached(userId, { limit });
  return c.json(success(rows));
});

// Order matters in Hono — keep these specific routes BEFORE the generic
// /templates/:id matcher so /templates/listing/... and /templates/licenses/...
// don't get captured as id="listing".
studioTemplatesRoutes.get("/templates/listing/:slug", async (c) => {
  const slug = c.req.param("slug");
  const row = await svc().getPublicBySlugCached(slug);
  if (!row) return c.json(error("NOT_FOUND", "Template not found"), 404);
  return c.json(success(row));
});

studioTemplatesRoutes.get("/templates/licenses/me", async (c) => {
  const userId = requireUser(c);
  const rows = await licenses().listLicensesForUser(userId);
  return c.json(success(rows));
});

studioTemplatesRoutes.get("/templates/:id", async (c) => {
  const id = c.req.param("id");
  const userId = c.var.userId;
  const row = await svc().getById(id);
  if (!row) return c.json(error("NOT_FOUND", "Template not found"), 404);
  // Private + unlisted templates only visible to the creator.
  if (row.visibility !== "public" && row.creatorId !== userId) {
    return c.json(error("NOT_FOUND", "Template not found"), 404);
  }
  return c.json(success(row));
});

studioTemplatesRoutes.patch("/templates/:id", validateJson(UpdateSchema, (e) => error("VALIDATION_ERROR", "Invalid request body", e.flatten()), { emptyBody: null }), async (c) => {
  const userId = requireUser(c);

  const id = c.req.param("id");
  const body = c.req.valid("json");

  const headers = readClientHeaders(c);
  const row = await svc().update({
    templateId: id,
    creatorUserId: userId,
    patch: {
      ...body,
      consentIp: headers.consentIp,
      consentUa: headers.consentUa,
    },
  });
  return c.json(success(row));
});

studioTemplatesRoutes.delete("/templates/:id", async (c) => {
  const userId = requireUser(c);
  const id = c.req.param("id");
  await svc().deleteById(id, userId);
  return c.json(success({ deleted: true }));
});

// ═══════════════════════════════════════════════════════════════════════════
// License grants
// ═══════════════════════════════════════════════════════════════════════════

studioTemplatesRoutes.post("/templates/:id/claim", async (c) => {
  const userId = requireUser(c);
  const id = c.req.param("id");
  const license = await licenses().claimFree(userId, id);
  return c.json(success(license), 201);
});

// Trusted-frontend post-purchase fulfilment. The frontend cart already
// records the price + payment ref locally; this endpoint mirrors that into
// the server-truth license ledger so a logged-in user retains access on
// other devices. The Stripe / Helcim webhook can also POST here — both
// paths are idempotent thanks to uq_template_licenses_grant.
studioTemplatesRoutes.post("/templates/license", validateJson(LicensePurchaseSchema, (e) => error("VALIDATION_ERROR", "Invalid request body", e.flatten()), { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  const license = await licenses().grantPurchase({
    userId,
    kind: body.templateKind,
    templateId: body.templateId,
    pricePaidCents: body.pricePaidCents,
    paymentRef: body.paymentRef,
  });
  return c.json(success(license), 201);
});
