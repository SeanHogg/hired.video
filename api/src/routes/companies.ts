import { Hono } from "hono";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { UuidLikeSchema } from "../../../shared/validation.js";
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { buildAIErrorEnvelope } from "../services/adapters/llm-error.js";
import { getDb, schema } from "../db/index.js";
import { createLLMClient, hasAnyLLMProviderKey } from "../services/adapters/llm-client.js";
import type { CompanyBenefits } from "../db/schema/companies.js";
import { findCompanyByIdOrSlug, requireCompanyOwner } from "../services/company/companyOwnership.js";
import { slugify } from "../../../shared/slugify.js";
import { COMPANY_LIST_FIELDS, parseFields, projectRows } from "../../../shared/projection.js";
import { bumpSearchVersion } from "../utils/search-cache.js";
import { servicesProcessor } from "../domains/services-processing/index.js";
import { withCacheHeaders } from "../utils/cache-headers.js";
import { recordArtifactView, ipCountryFromCtx } from "../services/analytics/artifactView.js";
import { buildApiDeps } from "../services/apiDeps.js";
import { LocationService } from "../services/location/LocationService.js";

const {
  companyProfiles,
  companyFollowers,
  companyLocations,
  companyTeamMembers,
  companyViews,
  jobItems,
  userCompanyRoleAssociations,
  employerBrandingPages,
} = schema;

export const companyRoutes = new Hono<AppEnv>();

function userId(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

/** Render a structured headquarters object as a single display string —
 *  matches what the directory cards and the public CompanyMetadata.location
 *  field expect (free-text "City, State, Country" or null). */
function headquartersDisplay(hq: typeof companyProfiles.$inferSelect["headquarters"]): string | null {
  if (!hq) return null;
  const parts = [hq.city, hq.state, hq.country].filter((p): p is string => Boolean(p));
  if (parts.length > 0) return parts.join(", ");
  return hq.address ?? null;
}

function rowToCompanyMeta(row: typeof companyProfiles.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    website: row.website,
    logo: row.logoUrl,
    logoUrl: row.logoUrl,
    industry: row.industry,
    size: row.size,
    foundedYear: row.foundedYear,
    founded: row.foundedYear,
    headquarters: row.headquarters,
    location: headquartersDisplay(row.headquarters),
    isVerified: row.isVerified,
    isActive: row.isActive,
    status: row.isActive ? "active" : "inactive",
    visibility: "public",
    // Cached review aggregate — kept in sync by recomputeAggregateCache
    // in routes/reviews.ts. Surfaced here so directory cards / OG can
    // show ratings without a second fetch against /api/reviews.
    reviewCount: row.reviewCount ?? 0,
    reviewAvgOverall: row.reviewAvgOverall != null ? Number(row.reviewAvgOverall) : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    // Surface ownerId as `userId` so directory cards can derive
    // ownership via useEntityOwnership without a second fetch — the
    // CompanyMetadata schema already declares the field, it was just
    // never populated. Without this, owners see no Edit affordance on
    // /companies because every row reports as un-owned.
    userId: row.ownerId,
  };
}

/** Per-request extras that rowToCompanyProfile needs but can't compute
 *  on its own. The route handler gathers counts + loads child tables
 *  (locations, team members) and passes them in — keeping the serializer
 *  pure so it's trivially unit-testable without a DB. */
export interface CompanyProfileExtras {
  jobCount: number;
  activeJobCount: number;
  followerCount: number;
  viewCount: number;
  locations: typeof companyLocations.$inferSelect[];
  teamMembers: typeof companyTeamMembers.$inferSelect[];
}

/** Builds the detail DTO for a company. Every field is either a real
 *  column on `company_profiles`, a real row from `company_locations` /
 *  `company_team_members`, or an aggregate on `company_views`. No
 *  placeholders, no fabricated booleans. */
export function rowToCompanyProfile(
  row: typeof companyProfiles.$inferSelect,
  extras: CompanyProfileExtras,
  _viewerId: string | null,
) {
  // Nested DTO matching CompanyProfileSchema in the front-end:
  // top-level holds the artifact (id, slug, status, …); content fields
  // live under `data` so downstream code reads `company.data.X` cleanly.
  return {
    id: row.id,
    slug: row.slug,
    data: {
      name: row.name,
      logo: row.logoUrl,
      website: row.website,
      tagline: row.tagline ?? null,
      description: row.description,
      industry: row.industry,
      size: row.size,
      founded: row.foundedYear,
      headquarters: row.headquarters ?? {},
      contact: row.contact ?? {},
      locations: extras.locations,
      culture: (row.culture as string[] | null) ?? [],
      technologies: (row.technologies as string[] | null) ?? [],
      perks: (row.perks as string[] | null) ?? [],
      mission: row.mission ?? null,
      vision: row.vision ?? null,
      values: (row.values as string[] | null) ?? [],
      benefits: (row.benefits as CompanyBenefits | null) ?? {},
    },
    status: row.isActive ? "active" : "inactive",
    visibility: "public",
    onboardingTasks: [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    views: extras.viewCount,
    followers: extras.followerCount,
    jobCount: extras.jobCount,
    activeJobCount: extras.activeJobCount,
    reviewCount: row.reviewCount ?? 0,
    reviewAvgOverall: row.reviewAvgOverall != null ? Number(row.reviewAvgOverall) : null,
    userId: row.ownerId,
    teamMembers: extras.teamMembers,
  };
}

/** Record a single company view event. No-op when the viewer is the
 *  owner — owners refreshing their own profile shouldn't inflate count. */
async function recordCompanyView(
  db: ReturnType<typeof getDb>,
  companyId: string,
  ownerId: string,
  viewer: { userId: string | null; ipHash?: string | null; referrer?: string | null; userAgent?: string | null },
): Promise<void> {
  if (viewer.userId && viewer.userId === ownerId) return;
  await db.insert(companyViews).values({
    companyId,
    viewerId: viewer.userId,
    ipHash: viewer.ipHash ?? null,
    referrer: viewer.referrer ?? null,
    userAgent: viewer.userAgent ?? null,
  } as any);
}

/** Short, non-cryptographic hash of the client IP + daily salt. Mirrors
 *  hashClientIp in routes/resumes.ts — shared pattern for anonymous
 *  dedup without storing the raw address. */
function hashClientIp(c: any): string | null {
  const ip =
    c.req.header?.("cf-connecting-ip") ??
    c.req.header?.("x-forwarded-for")?.split(",")[0]?.trim() ??
    null;
  if (!ip) return null;
  const salt = new Date().toISOString().slice(0, 10);
  const enc = new TextEncoder().encode(`${ip}|${salt}`);
  let h = 0x811c9dc5;
  for (let i = 0; i < enc.length; i++) {
    h ^= enc[i];
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

// Public company listing
/** Fire-and-forget: tag a company's headquarters into `content_locations`
 *  (kind "company") so the structured geo filter on /public can match it
 *  (#1178). Resolves the display string through the same geocoder the rest of
 *  search uses; never blocks the write. */
function tagCompanyGeo(c: any, companyId: string, hq: unknown) {
  const display = headquartersDisplay(hq as any);
  if (!display) return;
  (async () => {
    try {
      const svc = new LocationService(buildApiDeps((c.env ?? {}) as Record<string, string | undefined>));
      const resolved = await svc.resolveFreeText(display);
      if (resolved) {
        await svc.setForEntity("company", companyId, {
          origin: {
            countryId: resolved.countryId ?? undefined,
            stateId: resolved.stateId ?? undefined,
            cityId: resolved.cityId ?? undefined,
            latitude: resolved.latitude ?? undefined,
            longitude: resolved.longitude ?? undefined,
            label: display,
          },
          serves: [],
        });
      }
    } catch (err) {
      console.error("[company] geo tag failed:", err);
    }
  })();
}

companyRoutes.get("/public", async (c) => {
  const db = getDb();
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 10)));
  const search = c.req.query("search")?.trim();
  const offset = (page - 1) * limit;

  // Structured geo filter (#1178): mirror the unified-search pattern — resolve
  // the (countryId/stateId/cityId/text/remote) filter to an allowlist of
  // company ids via content_locations, then constrain the query. `null` = no
  // geo filter; `[]` = filter set but nothing matched (→ empty page).
  const geo = {
    countryId: c.req.query("countryId") ? Number(c.req.query("countryId")) : undefined,
    stateId: c.req.query("stateId") || undefined,
    cityId: c.req.query("cityId") || undefined,
    remote: c.req.query("isRemote") === "true" ? true : undefined,
    text: c.req.query("location") || undefined,
  };
  const hasGeo =
    geo.countryId != null || !!geo.stateId || !!geo.cityId || geo.remote || !!geo.text;
  let geoAllow: string[] | null = null;
  if (hasGeo) {
    const svc = new LocationService(buildApiDeps((c.env ?? {}) as Record<string, string | undefined>));
    geoAllow = await svc.applyLocationFilter("company", geo as any);
  }

  const searchWhere = search
    ? or(ilike(companyProfiles.name, `%${search}%`), ilike(companyProfiles.description, `%${search}%`))
    : undefined;
  const where =
    geoAllow != null
      ? and(searchWhere, inArray(companyProfiles.id, geoAllow.length ? geoAllow : [""]))
      : searchWhere;

  const [rows, [countRow]] = await Promise.all([
    db.select().from(companyProfiles).where(where).orderBy(desc(companyProfiles.createdAt)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(companyProfiles).where(where),
  ]);

  const total = countRow?.count ?? 0;
  const totalPages = Math.ceil(total / limit);

  // CDN-cacheable: anonymous + no side effects. 60s browser / 5min edge
  // means a new company shows up in the public list within a few minutes
  // of being created, which is fine — the company already advertised
  // itself via every other surface (their own profile URL, jobs feed).
  withCacheHeaders(c, { scope: "public", maxAge: 60, sMaxAge: 300, swr: 600 });
  // `?fields=` projection (gap #1370) — strips description / culture / values
  // / mission JSONB blobs when the caller only needs the card-view fields.
  const fields = parseFields(c.req.query("fields"), COMPANY_LIST_FIELDS);
  const items = projectRows(rows.map(rowToCompanyMeta) as Array<Record<string, unknown>>, fields);
  return c.json(success({ items, total, page, limit, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 }), 200);
});

// Trending companies (most followers)
companyRoutes.get("/trending", async (c) => {
  const db = getDb();
  const rows = await db
    .select({ company: companyProfiles, followerCount: sql<number>`count(${companyFollowers.userId})::int` })
    .from(companyProfiles)
    .leftJoin(companyFollowers, eq(companyFollowers.companyId, companyProfiles.id))
    .groupBy(companyProfiles.id)
    .orderBy(desc(sql`count(${companyFollowers.userId})`))
    .limit(10);
  return c.json(success(rows.map((r) => ({ ...rowToCompanyMeta(r.company), followerCount: r.followerCount }))), 200);
});

// Companies the current user follows
companyRoutes.get("/me/followed", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const rows = await db
    .select({ company: companyProfiles })
    .from(companyFollowers)
    .innerJoin(companyProfiles, eq(companyProfiles.id, companyFollowers.companyId))
    .where(eq(companyFollowers.userId, uid))
    .orderBy(desc(companyFollowers.createdAt));
  return c.json(success(rows.map((r) => rowToCompanyMeta(r.company))), 200);
});

// Look up by slug
companyRoutes.get("/slug/:slug", async (c) => {
  const db = getDb();
  const [row] = await db.select().from(companyProfiles).where(eq(companyProfiles.slug, c.req.param("slug"))).limit(1);
  if (!row) return c.json(error("NOT_FOUND", "Company not found"), 404);
  return c.json(success(rowToCompanyMeta(row)), 200);
});

// Jobs at a company
companyRoutes.get("/:id/jobs", async (c) => {
  const db = getDb();
  const company = await findCompanyByIdOrSlug(db, c.req.param("id"));
  if (!company) return c.json(error("NOT_FOUND", "Company not found"), 404);
  const rows = await db.select().from(jobItems).where(and(eq(jobItems.company, company.id), eq(jobItems.isActive, true))).orderBy(desc(jobItems.createdAt));
  return c.json(success(rows), 200);
});

// Follow a company
companyRoutes.post("/:id/follow", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const company = await findCompanyByIdOrSlug(db, c.req.param("id"));
  if (!company) return c.json(error("NOT_FOUND", "Company not found"), 404);
  await db.insert(companyFollowers).values({ userId: uid, companyId: company.id }).onConflictDoNothing();
  return c.json(success({ success: true }), 200);
});

// Unfollow a company
companyRoutes.delete("/:id/follow", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const company = await findCompanyByIdOrSlug(db, c.req.param("id"));
  if (!company) return c.json(error("NOT_FOUND", "Company not found"), 404);
  await db.delete(companyFollowers).where(and(eq(companyFollowers.userId, uid), eq(companyFollowers.companyId, company.id)));
  return c.json(success({ success: true }), 200);
});

// Is the current user following this company?
companyRoutes.get("/:id/following-status", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json(success({ isFollowing: false }), 200);
  const db = getDb();
  const company = await findCompanyByIdOrSlug(db, c.req.param("id"));
  if (!company) return c.json(success({ isFollowing: false }), 200);
  const [row] = await db.select({ id: companyFollowers.userId }).from(companyFollowers).where(and(eq(companyFollowers.userId, uid), eq(companyFollowers.companyId, company.id))).limit(1);
  return c.json(success({ isFollowing: !!row }), 200);
});

// Company stats
companyRoutes.get("/:id/stats", async (c) => {
  const db = getDb();
  const company = await findCompanyByIdOrSlug(db, c.req.param("id"));
  if (!company) return c.json(error("NOT_FOUND", "Company not found"), 404);
  const id = company.id;
  const [jobsRow, followersRow] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(jobItems).where(eq(jobItems.company, id)),
    db.select({ count: sql<number>`count(*)::int` }).from(companyFollowers).where(eq(companyFollowers.companyId, id)),
  ]);
  const jobsCount = jobsRow[0]?.count ?? 0;
  const followersCount = followersRow[0]?.count ?? 0;
  const [activeRow] = await db.select({ count: sql<number>`count(*)::int` }).from(jobItems).where(and(eq(jobItems.company, id), eq(jobItems.isActive, true)));
  return c.json(success({ jobsCount, followersCount, activeJobsCount: activeRow?.count ?? 0 }), 200);
});

// Create company. Mirrors PUT's accepted field set so the builder can
// capture tagline / mission / values / benefits / etc. on first save —
// otherwise the user has to immediately bounce to /companies/edit/:id.
const WRITABLE_BASIC = ["description", "website", "logoUrl", "industry", "size", "foundedYear", "headquarters", "contact"] as const;
const WRITABLE_EXTENDED = ["tagline", "mission", "vision", "technologies", "perks", "culture", "values", "benefits"] as const;

function buildWritableFields(body: any): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of WRITABLE_BASIC) if (key in body) out[key] = body[key];
  for (const key of WRITABLE_EXTENDED) if (key in body) out[key] = body[key];
  return out;
}

companyRoutes.post("/", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => ({}));
  if (!body.name) return c.json(error("BAD_REQUEST", "Company name is required"), 400);

  // Closes gap-register #780: enforce Free-tier 50-companies/mo cap that
  // was previously declared in entitlement-catalog but never enforced at
  // the write site. SuperAdmins bypass automatically via isAdminRole.
  const blocked = await servicesProcessor.enforce(c, "company_db_write");
  if (blocked) return blocked;

  const slug = String(body.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const db = getDb();
  const [row] = await db.insert(companyProfiles).values({ ownerId: uid, name: body.name, slug, ...buildWritableFields(body) } as any).returning();

  servicesProcessor.meterEvent(c, "company_db_write", { id: row?.id });
  bumpSearchVersion();
  if (row?.id) tagCompanyGeo(c, row.id, row.headquarters);

  return c.json(success(rowToCompanyMeta(row)), 201);
});

// Companies owned by a given user (public). Drives the Company tab on
// the People profile — anyone visiting an employer's profile can see
// which companies they're associated with.
async function listCompaniesByOwner(ownerId: string) {
  const db = getDb();
  return db
    .select()
    .from(companyProfiles)
    .where(eq(companyProfiles.ownerId, ownerId))
    .orderBy(desc(companyProfiles.createdAt));
}

companyRoutes.get("/me", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const rows = await listCompaniesByOwner(uid);
  return c.json(success(rows.map(rowToCompanyMeta)), 200);
});

companyRoutes.get("/by-user/:userId", async (c) => {
  const rows = await listCompaniesByOwner(c.req.param("userId"));
  return c.json(success(rows.map(rowToCompanyMeta)), 200);
});

// Get by ID *or slug* — returns the full CompanyProfile shape consumed
// by CompanyDetail.tsx. Slug-form URLs (`/companies/hired-video-company`)
// land here too because the frontend route `/companies/:id` passes the
// path segment straight through; without slug resolution Postgres would
// 500 trying to cast a non-UUID into the `id` column.
companyRoutes.get("/:id", async (c) => {
  const db = getDb();
  const callerSub = userId(c);

  const row = await findCompanyByIdOrSlug(db, c.req.param("id"));
  if (!row) return c.json(error("NOT_FOUND", "Company not found"), 404);
  const id = row.id;

  // Record the view before computing extras so the fresh count is
  // reflected in the response. `recordCompanyView` no-ops when the
  // viewer is the company owner. Also dual-writes to artifact_views for
  // the unified creator-stats rollup (Gap Register #1019).
  const ipHash = hashClientIp(c);
  const referrer = c.req.header("referer") ?? c.req.header("referrer") ?? null;
  const userAgent = c.req.header("user-agent") ?? null;
  await recordCompanyView(db, id, row.ownerId, {
    userId: callerSub,
    ipHash,
    referrer,
    userAgent,
  });
  await recordArtifactView({
    artifactKind: "company",
    artifactId: id,
    ownerUserId: row.ownerId,
    viewerId: callerSub,
    ipHash,
    ipCountry: ipCountryFromCtx(c),
    referrer,
    userAgent,
    engagementUnit: "%",
  });

  const [jobsRow, activeJobsRow, followersRow, viewsRow, locations, teamMembers] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(jobItems).where(eq(jobItems.company, id)),
    db.select({ count: sql<number>`count(*)::int` }).from(jobItems).where(and(eq(jobItems.company, id), eq(jobItems.isActive, true))),
    db.select({ count: sql<number>`count(*)::int` }).from(companyFollowers).where(eq(companyFollowers.companyId, id)),
    db.select({ count: sql<number>`count(*)::int` }).from(companyViews).where(eq(companyViews.companyId, id)),
    db.select().from(companyLocations).where(eq(companyLocations.companyId, id)).orderBy(asc(companyLocations.displayOrder)),
    db.select().from(companyTeamMembers).where(eq(companyTeamMembers.companyId, id)).orderBy(asc(companyTeamMembers.displayOrder)),
  ]);

  return c.json(
    success(
      rowToCompanyProfile(
        row,
        {
          jobCount: jobsRow[0]?.count ?? 0,
          activeJobCount: activeJobsRow[0]?.count ?? 0,
          followerCount: followersRow[0]?.count ?? 0,
          viewCount: viewsRow[0]?.count ?? 0,
          locations,
          teamMembers,
        },
        callerSub,
      ),
    ),
    200,
  );
});

// Update company
companyRoutes.put("/:id", async (c) => {
  const { denied, access } = await requireCompanyOwner(c, c.req.param("id"));
  if (denied) return denied;
  const db = getDb();
  const body = await c.req.json().catch(() => ({}));
  const updates: Record<string, unknown> = { updatedAt: new Date(), ...buildWritableFields(body) };
  if ("name" in body) updates.name = body.name;
  const [row] = await db.update(companyProfiles).set(updates as any).where(eq(companyProfiles.id, access!.companyId)).returning();
  bumpSearchVersion();
  if ("headquarters" in updates && row?.id) tagCompanyGeo(c, row.id, row.headquarters);
  return c.json(success(rowToCompanyMeta(row)), 200);
});

// ─── Company Locations ────────────────────────────────────────────────────
// CRUD for the multi-office structure referenced by CompanyProfile.locations.

const LocationSchema = z.object({
  label: z.string().max(100).optional().nullable(),
  address: z.string().max(255).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  region: z.string().max(100).optional().nullable(),
  postalCode: z.string().max(20).optional().nullable(),
  countryCode: z.string().max(8).optional().nullable(),
  isPrimary: z.boolean().optional(),
  displayOrder: z.number().int().min(0).optional(),
});

companyRoutes.get("/:id/locations", async (c) => {
  const db = getDb();
  const company = await findCompanyByIdOrSlug(db, c.req.param("id"));
  if (!company) return c.json(error("NOT_FOUND", "Company not found"), 404);
  const rows = await db
    .select()
    .from(companyLocations)
    .where(eq(companyLocations.companyId, company.id))
    .orderBy(asc(companyLocations.displayOrder));
  return c.json(success(rows), 200);
});

companyRoutes.post("/:id/locations", async (c) => {
  const { denied, access } = await requireCompanyOwner(c, c.req.param("id"));
  if (denied) return denied;
  const parsed = LocationSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid location", parsed.error.flatten()), 400);
  const db = getDb();
  const [row] = await db
    .insert(companyLocations)
    .values({ companyId: access!.companyId, ...parsed.data } as any)
    .returning();
  return c.json(success(row), 201);
});

companyRoutes.put("/:id/locations/:locationId", async (c) => {
  const { denied, access } = await requireCompanyOwner(c, c.req.param("id"));
  if (denied) return denied;
  const parsed = LocationSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid location", parsed.error.flatten()), 400);
  const db = getDb();
  const [row] = await db
    .update(companyLocations)
    .set({ ...parsed.data, updatedAt: new Date() } as any)
    .where(and(
      eq(companyLocations.id, c.req.param("locationId")),
      eq(companyLocations.companyId, access!.companyId),
    ))
    .returning();
  if (!row) return c.json(error("NOT_FOUND", "Location not found"), 404);
  return c.json(success(row), 200);
});

companyRoutes.delete("/:id/locations/:locationId", async (c) => {
  const { denied, access } = await requireCompanyOwner(c, c.req.param("id"));
  if (denied) return denied;
  const db = getDb();
  await db
    .delete(companyLocations)
    .where(and(
      eq(companyLocations.id, c.req.param("locationId")),
      eq(companyLocations.companyId, access!.companyId),
    ));
  return c.json(success(null, "Location deleted"), 200);
});

// ─── Company Team Members ─────────────────────────────────────────────────

const TeamMemberSchema = z.object({
  userId: UuidLikeSchema.optional().nullable(),
  name: z.string().min(1).max(255),
  title: z.string().max(255).optional().nullable(),
  bio: z.string().max(2000).optional().nullable(),
  avatarUrl: z.string().url().optional().nullable(),
  linkedinUrl: z.string().url().optional().nullable(),
  displayOrder: z.number().int().min(0).optional(),
});

companyRoutes.get("/:id/team", async (c) => {
  const db = getDb();
  const company = await findCompanyByIdOrSlug(db, c.req.param("id"));
  if (!company) return c.json(error("NOT_FOUND", "Company not found"), 404);
  const rows = await db
    .select()
    .from(companyTeamMembers)
    .where(eq(companyTeamMembers.companyId, company.id))
    .orderBy(asc(companyTeamMembers.displayOrder));
  return c.json(success(rows), 200);
});

companyRoutes.post("/:id/team", async (c) => {
  const { denied, access } = await requireCompanyOwner(c, c.req.param("id"));
  if (denied) return denied;
  const parsed = TeamMemberSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid team member", parsed.error.flatten()), 400);
  const db = getDb();
  const [row] = await db
    .insert(companyTeamMembers)
    .values({ companyId: access!.companyId, ...parsed.data } as any)
    .returning();
  return c.json(success(row), 201);
});

companyRoutes.put("/:id/team/:memberId", async (c) => {
  const { denied, access } = await requireCompanyOwner(c, c.req.param("id"));
  if (denied) return denied;
  const parsed = TeamMemberSchema.partial().safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid team member", parsed.error.flatten()), 400);
  const db = getDb();
  const [row] = await db
    .update(companyTeamMembers)
    .set({ ...parsed.data, updatedAt: new Date() } as any)
    .where(and(
      eq(companyTeamMembers.id, c.req.param("memberId")),
      eq(companyTeamMembers.companyId, access!.companyId),
    ))
    .returning();
  if (!row) return c.json(error("NOT_FOUND", "Team member not found"), 404);
  return c.json(success(row), 200);
});

companyRoutes.delete("/:id/team/:memberId", async (c) => {
  const { denied, access } = await requireCompanyOwner(c, c.req.param("id"));
  if (denied) return denied;
  const db = getDb();
  await db
    .delete(companyTeamMembers)
    .where(and(
      eq(companyTeamMembers.id, c.req.param("memberId")),
      eq(companyTeamMembers.companyId, access!.companyId),
    ));
  return c.json(success(null, "Team member deleted"), 200);
});

// Delete company
companyRoutes.delete("/:id", async (c) => {
  const { denied, access } = await requireCompanyOwner(c, c.req.param("id"));
  if (denied) return denied;
  const db = getDb();
  await db.delete(companyProfiles).where(eq(companyProfiles.id, access!.companyId));
  bumpSearchVersion();
  return c.json(success(null, "Company deleted"), 200);
});

/** POST /api/companies/:id/clone — duplicate a company the caller owns.
 *  Name + slug both get " (Copy)" / "-copy[-N]" suffixes; engagement +
 *  verification metadata reset on the clone. Mirrors the job + resume +
 *  studio-project clone pattern. */
companyRoutes.post("/:id/clone", async (c) => {
  const { denied, access } = await requireCompanyOwner(c, c.req.param("id"));
  if (denied) return denied;
  const db = getDb();
  const [original] = await db
    .select()
    .from(companyProfiles)
    .where(eq(companyProfiles.id, access!.companyId))
    .limit(1);
  if (!original) return c.json(error("NOT_FOUND", "Company not found"), 404);

  // Closes gap-register #780: clones create a new company_profiles row,
  // so they consume the same cap as POST /api/companies. Otherwise the
  // 50/mo Free cap is trivially bypassed via repeated clone calls.
  const blocked = await servicesProcessor.enforce(c, "company_db_write");
  if (blocked) return blocked;

  // Slug is uniquely constrained — derive from the cloned name, then append
  // a numeric suffix until we land on an unused slug. Caps at 50 attempts
  // to avoid a pathological loop on a degenerate name.
  const baseSlug = slugify(`${original.name}-copy`, {
    fallback: () => `company-${crypto.randomUUID().slice(0, 8)}`,
    maxLen: 50,
  });
  let candidateSlug: string | null = baseSlug;
  for (let i = 1; i <= 50; i++) {
    const test = i === 1 ? baseSlug : `${baseSlug}-${i}`;
    const [conflict] = await db
      .select({ id: companyProfiles.id })
      .from(companyProfiles)
      .where(eq(companyProfiles.slug, test))
      .limit(1);
    if (!conflict) { candidateSlug = test; break; }
    candidateSlug = null;
  }

  const {
    id: _omitId,
    createdAt: _omitCreated,
    updatedAt: _omitUpdated,
    isVerified: _omitVerified,
    featured: _omitFeatured,
    featuredUntil: _omitFeaturedUntil,
    featuredRankBoost: _omitFeaturedRank,
    reviewCount: _omitReviewCount,
    reviewAvgOverall: _omitReviewAvg,
    ...rest
  } = original as Record<string, unknown>;
  const [clone] = await db
    .insert(companyProfiles)
    .values({
      ...rest,
      ownerId: c.var.user!.sub,
      name: `${original.name} (Copy)`,
      slug: candidateSlug,
      isActive: false,
    } as any)
    .returning();

  servicesProcessor.meterEvent(c, "company_db_write", { id: clone?.id });

  return c.json(success(rowToCompanyMeta(clone!)), 201);
});

// ─── Employer Branding Pages ──────────────────────────────────────────────────

const BrandingPageSchema = z.object({
  heroVideoUrl: z.string().url().optional().nullable(),
  heroHeadline: z.string().max(200).optional().nullable(),
  heroSubtitle: z.string().max(500).optional().nullable(),
  cultureStatement: z.string().max(2000).optional().nullable(),
  values: z.array(z.object({ title: z.string(), description: z.string(), emoji: z.string().optional() })).default([]),
  perks: z.array(z.object({ title: z.string(), description: z.string(), icon: z.string().optional() })).default([]),
  mediaGallery: z.array(z.object({ url: z.string(), type: z.enum(["image", "video"]), caption: z.string().optional() })).default([]),
  teamHighlights: z.array(z.object({ name: z.string(), role: z.string(), quote: z.string(), avatarUrl: z.string().optional() })).default([]),
  awardsAndRecognition: z.array(z.object({ title: z.string(), year: z.number().optional(), imageUrl: z.string().optional() })).default([]),
  primaryColor: z.string().max(20).optional(),
  isPublished: z.boolean().optional(),
});

/** GET /api/companies/:id/branding — public (no auth) */
companyRoutes.get("/:id/branding", async (c) => {
  const db = getDb();
  const company = await findCompanyByIdOrSlug(db, c.req.param("id"));
  if (!company) return c.json(error("NOT_FOUND", "Branding page not found"), 404);
  const [page] = await db
    .select()
    .from(employerBrandingPages)
    .where(eq(employerBrandingPages.companyId, company.id))
    .limit(1);
  if (!page || !page.isPublished) return c.json(error("NOT_FOUND", "Branding page not found"), 404);
  return c.json(success(page), 200);
});

/** PATCH /api/companies/:id/branding — owner only; upserts the branding page */
companyRoutes.patch("/:id/branding", async (c) => {
  const { denied, access } = await requireCompanyOwner(c, c.req.param("id"));
  if (denied) return denied;
  const companyId = access!.companyId;
  const db = getDb();

  const body = await c.req.json().catch(() => ({}));
  const parsed = BrandingPageSchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid branding data"), 400);

  const data = parsed.data;
  const [existing] = await db.select({ id: employerBrandingPages.id }).from(employerBrandingPages).where(eq(employerBrandingPages.companyId, companyId)).limit(1);

  const now = new Date();
  if (existing) {
    const [updated] = await db
      .update(employerBrandingPages)
      .set({
        ...data,
        publishedAt: data.isPublished ? now : undefined,
        updatedAt: now,
      } as any)
      .where(eq(employerBrandingPages.companyId, companyId))
      .returning();
    return c.json(success(updated), 200);
  }

  const [created] = await db
    .insert(employerBrandingPages)
    .values({
      companyId,
      ...data,
      publishedAt: data.isPublished ? now : null,
    } as any)
    .returning();
  return c.json(success(created), 201);
});

// ─── Company Extraction (from page HTML) ─────────────────────────────────────
// POST /extract — AI-extract company details from page HTML.
// Public: deduplicates against existing company_profiles by name similarity.
// Merges new fields into existing records when a match is found.

const ExtractCompanySchema = z.object({
  html: z.string().min(50),
  sourceUrl: z.string().min(1),
});

const CompanyExtractionResponseSchema = z.object({
  name: z.string(),
  industry: z.string().optional().default(""),
  size: z.string().optional().default(""),
  location: z.string().optional().default(""),
  website: z.string().optional().default(""),
  description: z.string().optional().default(""),
  foundedYear: z.number().nullable().optional(),
});

companyRoutes.post("/extract", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const body = await c.req.json().catch(() => null);
  const parsed = ExtractCompanySchema.safeParse(body);
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid request", parsed.error.flatten()), 400);

  const { html, sourceUrl } = parsed.data;
  const db = getDb();

  // Strip HTML to plain text
  const plainText = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 10000);

  // Extract via LLM
  let extracted: z.infer<typeof CompanyExtractionResponseSchema>;

  if (hasAnyLLMProviderKey(c.env as any)) {
    try {
      const llm = createLLMClient(c.env as any, c.var.user);
      const { data } = await llm.callJson(
        "company_extract_brief",
        {
          systemPrompt: `You extract company/business information from a web page.
Return valid JSON with the company's details. If a field is not found, use an empty string.`,
          userMessage: `Extract company details from this page:

${plainText}

Return JSON: { "name": "...", "industry": "...", "size": "...", "location": "...", "website": "...", "description": "...", "foundedYear": null }`,
          responseFormat: "json_object",
          useCase: "company_brief",
        },
        CompanyExtractionResponseSchema,
      );
      extracted = data;
    } catch (err) {
      // #529: surface the upgrade banner when our AI plan is exhausted; else
      // keep the generic extract-failed message.
      const envelope = buildAIErrorEnvelope(err);
      if (envelope) return c.json(error(envelope.code, envelope.message, envelope.payload), envelope.status);
      return c.json(error("AI_ERROR", "Failed to extract company details. Please try again."), 500);
    }
  } else {
    extracted = {
      name: "Unknown Company",
      industry: "", size: "", location: "", website: "", description: "", foundedYear: null,
    };
  }

  // Dedup: check for existing company by name (case-insensitive)
  const slug = extracted.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);

  const [existing] = await db
    .select()
    .from(companyProfiles)
    .where(
      or(
        eq(companyProfiles.slug, slug),
        ilike(companyProfiles.name, extracted.name),
      ),
    )
    .limit(1);

  if (existing) {
    // Merge new fields into existing record (only fill blanks)
    const updates: Record<string, unknown> = {};
    if (!existing.industry && extracted.industry) updates.industry = extracted.industry;
    if (!existing.size && extracted.size) updates.size = extracted.size;
    if (!existing.headquarters && extracted.location) updates.headquarters = { address: extracted.location };
    if (!existing.website && extracted.website) updates.website = extracted.website;
    if (!existing.description && extracted.description) updates.description = extracted.description;
    if (!existing.foundedYear && extracted.foundedYear) updates.foundedYear = extracted.foundedYear;

    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date();
      await db
        .update(companyProfiles)
        .set(updates as any)
        .where(eq(companyProfiles.id, existing.id));
    }

    return c.json(success({
      company: { ...existing, ...updates },
      duplicate: true,
      existingId: existing.id,
    }), 200);
  }

  // Closes gap-register #780: only the new-row branch consumes the cap —
  // the dedup-and-merge branch above is a PATCH equivalent, not a create.
  const blocked = await servicesProcessor.enforce(c, "company_db_write");
  if (blocked) return blocked;

  // Create new company record
  const [created] = await db
    .insert(companyProfiles)
    .values({
      ownerId: uid,
      name: extracted.name,
      slug,
      description: extracted.description || null,
      website: extracted.website || null,
      industry: extracted.industry || null,
      size: extracted.size || null,
      headquarters: extracted.location ? { address: extracted.location } : null,
      foundedYear: extracted.foundedYear ?? null,
    } as any)
    .returning();

  servicesProcessor.meterEvent(c, "company_db_write", { id: created?.id });

  return c.json(success({
    company: created,
    duplicate: false,
  }), 201);
});

// Reviews used to live here as /api/companies/:id/reviews — now served
// polymorphically at /api/reviews/company/:id (see api/src/routes/reviews.ts
// + shared/reviews/subject-descriptors.ts).


companyRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Company endpoint not found" } }, 404),
);