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
 * (`/api/moderation/reports` with entityType "community_resource"); no bespoke flag
 * endpoint lives here.
 */
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import {
  listMyResources,
  listResourceDirectory,
  listResourcesByStatus,
  reviewResource,
  submitResource,
} from "../services/community/communityResources.js";
import { isSuperAdmin } from "../middleware/superAdmin.js";
import { withGamification } from "../domains/gamification/with-gamification.js";
import {
  RESOURCE_AUDIENCES,
  RESOURCE_CATEGORIES,
  resourceHasContact,
} from "../../../shared/community-resources.js";
import { requireUser } from "./helpers/routerHelpers.js";
import { validateJson } from "./helpers/validate.js";

export const communityResourceRoutes = new Hono<AppEnv>();
export const adminCommunityResourceRoutes = new Hono<AppEnv>();

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
  const rows = await listResourceDirectory({
    country,
    state: c.req.query("state"),
    city: c.req.query("city"),
    audience: c.req.query("audience"),
    category: c.req.query("category"),
  });
  return c.json(success({ items: rows }), 200);
});

communityResourceRoutes.post("/", validateJson(SubmitSchema, (e) => error("VALIDATION_ERROR", e.issues[0]?.message ?? "Invalid body")), async (c) => {
  const userId = requireUser(c);
  const row = await submitResource(userId, c.req.valid("json"));

  // Award points + (first/10th) badge. Fire-and-forget — a gamification
  // glitch must not fail the submission.
  await withGamification(c, "resource-submitted", (game, role, submitterId) =>
    game.onResourceSubmitted({ userId: submitterId, role, resourceId: row.id }),
  );

  return c.json(success({ resource: row }), 201);
});

communityResourceRoutes.get("/mine", async (c) => {
  const userId = requireUser(c);
  const rows = await listMyResources(userId);
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
  const rows = await listResourcesByStatus(status);
  return c.json(success({ items: rows }), 200);
});

adminCommunityResourceRoutes.patch("/:id/review", validateJson(ReviewSchema, (e) => error("VALIDATION_ERROR", e.issues[0]?.message ?? "Invalid body")), async (c) => {
  if (!isSuperAdmin(c.var.user)) return c.json(error("FORBIDDEN", "SuperAdmin only"), 403);
  const reviewerId = requireUser(c);
  const row = await reviewResource(c.req.param("id"), reviewerId, c.req.valid("json"));
  if (!row) return c.json(error("NOT_FOUND", "Resource not found"), 404);
  return c.json(success({ resource: row }), 200);
});
