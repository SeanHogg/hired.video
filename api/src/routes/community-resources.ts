/**
 * /api/community-resources — location-scoped, user-submitted resource
 * directory (government agencies, unemployment offices, job boards, training,
 * legal aid, veterans services).
 *
 * Public:
 *   GET   /                      approved directory for ?country=&state= (+ optional audience/category)
 *   POST  /                      submit a resource (auth) — lands `pending`, awards points/badge
 *   GET   /mine                  my submissions across every status (auth)
 *
 * Admin (SuperAdmin only — mounted at /api/admin/community-resources):
 *   GET   /?status=pending       moderation queue
 *   PATCH /:id/review            approve / reject
 *
 * Flagging a bad/incorrect resource reuses the shared content-report flow
 * (`/api/reports` with entityType "community_resource"); no bespoke flag
 * endpoint lives here.
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb } from "../db/index.js";
import { buildRepos } from "../repositories/index.js";
import { isSuperAdmin } from "../middleware/superAdmin.js";
import { withGamification } from "../domains/gamification/with-gamification.js";
import {
  RESOURCE_AUDIENCES,
  RESOURCE_CATEGORIES,
  resourceHasContact,
} from "../../../shared/community-resources.js";

export const communityResourceRoutes = new Hono<AppEnv>();
export const adminCommunityResourceRoutes = new Hono<AppEnv>();

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

/** Geo slugs are lowercased so /in/us/tx and ?country=US&state=Tx collapse. */
const slug = (s: string) => s.trim().toLowerCase();

export const SubmitSchema = z
  .object({
    title: z.string().trim().min(3).max(200),
    description: z.string().trim().min(10).max(2000),
    url: z.string().trim().url().max(500).optional().or(z.literal("")),
    phone: z.string().trim().max(64).optional().or(z.literal("")),
    category: z.enum(RESOURCE_CATEGORIES),
    audience: z.enum(RESOURCE_AUDIENCES),
    countryCode: z.string().trim().min(2).max(8),
    stateCode: z.string().trim().max(16).optional().nullable(),
    citySlug: z.string().trim().max(96).optional().nullable(),
  })
  .refine((d) => resourceHasContact({ url: d.url ?? null, phone: d.phone ?? null }), {
    message: "Provide a link, a phone number, or both",
    path: ["url"],
  });

communityResourceRoutes.get("/", async (c) => {
  const country = c.req.query("country");
  if (!country) return c.json(error("VALIDATION_ERROR", "country is required"), 400);
  const repos = buildRepos(getDb());
  const rows = await repos.communityResources.listApproved({
    countryCode: slug(country),
    stateCode: c.req.query("state") ? slug(c.req.query("state")!) : null,
    citySlug: c.req.query("city") ? slug(c.req.query("city")!) : null,
    audience: c.req.query("audience") ?? null,
    category: c.req.query("category") ?? null,
  });
  return c.json(success({ items: rows }), 200);
});

communityResourceRoutes.post("/", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = SubmitSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);
  }
  const d = parsed.data;
  const repos = buildRepos(getDb());
  const row = await repos.communityResources.insert({
    submittedBy: userId,
    title: d.title,
    description: d.description,
    url: d.url ? d.url : null,
    phone: d.phone ? d.phone : null,
    category: d.category,
    audience: d.audience,
    countryCode: slug(d.countryCode),
    stateCode: d.stateCode ? slug(d.stateCode) : null,
    citySlug: d.citySlug ? slug(d.citySlug) : null,
    status: "pending",
  });

  // Award points + (first/10th) badge. Fire-and-forget — a gamification
  // glitch must not fail the submission.
  await withGamification(c, "resource-submitted", (game, role, submitterId) =>
    game.onResourceSubmitted({ userId: submitterId, role, resourceId: row.id }),
  );

  return c.json(success({ resource: row }), 201);
});

communityResourceRoutes.get("/mine", async (c) => {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const repos = buildRepos(getDb());
  const rows = await repos.communityResources.listBySubmitter(userId);
  return c.json(success({ items: rows }), 200);
});

// ── Admin (SuperAdmin only) ──────────────────────────────────────────────
const ReviewSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  rejectionReason: z.string().trim().max(2000).optional(),
});

adminCommunityResourceRoutes.get("/", async (c) => {
  if (!isSuperAdmin(c.var.user)) return c.json(error("FORBIDDEN", "SuperAdmin only"), 403);
  const statusQ = c.req.query("status");
  const status =
    statusQ === "approved" || statusQ === "rejected" ? statusQ : "pending";
  const repos = buildRepos(getDb());
  const rows = await repos.communityResources.listByStatus(status);
  return c.json(success({ items: rows }), 200);
});

adminCommunityResourceRoutes.patch("/:id/review", async (c) => {
  if (!isSuperAdmin(c.var.user)) return c.json(error("FORBIDDEN", "SuperAdmin only"), 403);
  const reviewerId = uid(c);
  if (!reviewerId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = ReviewSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid body"), 400);
  }
  const repos = buildRepos(getDb());
  const row = await repos.communityResources.review(c.req.param("id"), {
    status: parsed.data.status,
    reviewedBy: reviewerId,
    rejectionReason: parsed.data.status === "rejected" ? parsed.data.rejectionReason ?? null : null,
  });
  if (!row) return c.json(error("NOT_FOUND", "Resource not found"), 404);
  return c.json(success({ resource: row }), 200);
});
