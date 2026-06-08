/**
 * Single source of truth for the SuperAdmin-curated dashboard feed.
 *
 * A "feed feature" is a card the SuperAdmin pins to the dashboard of one
 * or more user roles. The empty job-seeker dashboard (and every other
 * role's) fills from this curated set: tools (Career 360), pages (the
 * Chrome extension), articles, videos, jobs, resumes — anything that can
 * render as a card.
 *
 * Storage is polymorphic, mirroring `content_locations`: one row points at
 * one (entityKind, entityId) tuple. Because the curated set spans both
 * DB-backed entities (uuid ids) AND static catalogue entries (tool / page
 * slugs), `entityId` is a free string, not a uuid.
 *
 * The card itself is rendered from a cached `embedPayload` snapshot taken
 * at curation time (same trick as `feed_posts.embedPayload`) so the
 * dashboard read never N+1s back to the source table. The payload is a
 * `RawApiItem`-shaped object the frontend card factory already knows how
 * to render.
 *
 * Both backend (services/feed/FeedFeatureService.ts, routes/feed-features.ts)
 * and frontend (lib/services/feed-features-service.ts, the admin curation
 * page + DashboardFeed component) import from here so the enum surface and
 * the wire shape can't drift.
 *
 * See migration 0202_feed_features.sql for storage layout.
 */
import { z } from "zod";
import { USER_ROLES, type UserRole } from "./user-roles.js";

/**
 * Every kind of thing the SuperAdmin can feature. This is a superset of
 * the frontend `CardFeedType` plus the static surfaces that aren't DB
 * entities:
 *   - `tool`  — an entry in TOOLS_CATALOG (e.g. Career 360); id = tool id,
 *     rendered via <ToolCard>.
 *   - `page`  — an arbitrary marketing/app page (e.g. /chrome-extension);
 *     id = a stable slug, rendered via the generic featured-link card.
 * Adding a new kind here is the only place required to onboard it — the
 * renderer is generic over `embedPayload.type`.
 */
export const FEED_FEATURE_KINDS = [
  "tool",
  "page",
  "article",
  "guide",
  "faq",
  "video",
  "job",
  "resume",
  "company",
  "people",
  "template",
  "event",
] as const;
export type FeedFeatureKind = (typeof FEED_FEATURE_KINDS)[number];

/**
 * Roles a feature can be targeted at. We allow every USER_ROLE so internal
 * roles (employee/admin) can also get a curated dashboard, but the curation
 * UI leads with the three market-facing roles. An empty `roles` array means
 * "show to every role" (a global feature).
 */
export const FEED_FEATURE_ROLES: readonly UserRole[] = [
  USER_ROLES.JOB_SEEKER,
  USER_ROLES.RECRUITER,
  USER_ROLES.EMPLOYER,
  USER_ROLES.EMPLOYEE,
  USER_ROLES.ADMIN,
  USER_ROLES.SUPER_ADMIN,
] as const;

/**
 * Resolve the feed role a viewer should see from their JWT `roles` claim.
 * Falls back to job_seeker — the broadest consumer dashboard — so an
 * unknown/empty claim still gets the default curated set rather than an
 * empty page.
 */
export function resolveFeedRole(roles: readonly string[] | null | undefined): UserRole {
  if (roles) {
    for (const r of FEED_FEATURE_ROLES) {
      if (roles.includes(r)) return r;
    }
  }
  return USER_ROLES.JOB_SEEKER;
}

/**
 * Does a feature (with its target `roles`) apply to `viewerRole`?
 * Empty target list = global = applies to everyone. Single seam so the
 * cached read path and any client-side filter agree.
 */
export function featureAppliesToRole(
  featureRoles: readonly string[] | null | undefined,
  viewerRole: string,
): boolean {
  if (!featureRoles || featureRoles.length === 0) return true;
  return featureRoles.includes(viewerRole);
}

/**
 * The cached, render-ready card the dashboard read returns. This is a
 * deliberately loose `RawApiItem`-shaped object: `type` drives the card
 * factory, and the rest of the keys are whatever that card needs. We pin
 * the handful the renderer + admin list always rely on and allow the rest
 * through.
 */
export const FeedFeatureCardSchema = z
  .object({
    /** The feed_features row id — lets the admin UI edit/remove without a
     *  second lookup, and de-dupes on the dashboard. */
    featureId: z.string(),
    /** Card factory discriminator (mirrors CardFeedType / FeedFeatureKind). */
    type: z.string(),
    /** Source entity id (uuid for DB entities, slug for tool/page). */
    id: z.string(),
    title: z.string().optional(),
    name: z.string().optional(),
    summary: z.string().optional(),
    href: z.string().optional(),
    /** Curation order — lower sorts first. Echoed for the admin list. */
    rank: z.number().int().default(0),
  })
  .passthrough();
export type FeedFeatureCard = z.infer<typeof FeedFeatureCardSchema>;

/** Payload the admin UI posts to pin a new feature. `embedPayload` is the
 *  RawApiItem snapshot of the picked card (sans `featureId`/`rank`, which
 *  the server stamps). */
export const CreateFeedFeatureSchema = z.object({
  entityKind: z.enum(FEED_FEATURE_KINDS),
  entityId: z.string().min(1).max(128),
  roles: z.array(z.enum(FEED_FEATURE_ROLES as unknown as [string, ...string[]])).default([]),
  title: z.string().min(1).max(500),
  rank: z.number().int().min(0).max(100000).optional(),
  isActive: z.boolean().optional(),
  embedPayload: z.record(z.string(), z.unknown()),
});
export type CreateFeedFeatureInput = z.infer<typeof CreateFeedFeatureSchema>;

/** Partial update — every field optional; `id` travels in the route. */
export const UpdateFeedFeatureSchema = z.object({
  roles: z.array(z.enum(FEED_FEATURE_ROLES as unknown as [string, ...string[]])).optional(),
  title: z.string().min(1).max(500).optional(),
  rank: z.number().int().min(0).max(100000).optional(),
  isActive: z.boolean().optional(),
  embedPayload: z.record(z.string(), z.unknown()).optional(),
});
export type UpdateFeedFeatureInput = z.infer<typeof UpdateFeedFeatureSchema>;
