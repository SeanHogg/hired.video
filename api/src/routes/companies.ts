import { Hono } from "hono";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { callLLMJson, getApiKey } from "../services/adapters/ai.js";
import type { CompanyBenefits } from "../db/schema/companies.js";

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

export const companyRoutes = new Hono<{ Variables: Variables }>();

function userId(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
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
    location: row.headquarters,
    isVerified: row.isVerified,
    isActive: row.isActive,
    status: row.isActive ? "active" : "inactive",
    visibility: "public",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
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
  viewerId: string | null,
) {
  const isOwner = viewerId !== null && viewerId === row.ownerId;
  return {
    ...rowToCompanyMeta(row),
    tagline: row.tagline ?? null,
    mission: row.mission ?? null,
    vision: row.vision ?? null,
    technologies: (row.technologies as string[] | null) ?? [],
    perks: (row.perks as string[] | null) ?? [],
    culture: (row.culture as string[] | null) ?? [],
    values: (row.values as string[] | null) ?? [],
    benefits: (row.benefits as CompanyBenefits | null) ?? {},
    locations: extras.locations,
    teamMembers: extras.teamMembers,
    followers: extras.followerCount,
    followerCount: extras.followerCount,
    jobCount: extras.jobCount,
    activeJobCount: extras.activeJobCount,
    views: extras.viewCount,
    userId: row.ownerId,
    canEdit: isOwner,
    isOwner,
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
companyRoutes.get("/public", async (c) => {
  const db = getDb();
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 10)));
  const search = c.req.query("search")?.trim();
  const offset = (page - 1) * limit;

  const where = search ? or(ilike(companyProfiles.name, `%${search}%`), ilike(companyProfiles.description, `%${search}%`)) : undefined;

  const [rows, [countRow]] = await Promise.all([
    db.select().from(companyProfiles).where(where).orderBy(desc(companyProfiles.createdAt)).limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(companyProfiles).where(where),
  ]);

  const total = countRow?.count ?? 0;
  const totalPages = Math.ceil(total / limit);

  return c.json(success({ items: rows.map(rowToCompanyMeta), total, page, limit, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 }), 200);
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
  const rows = await db.select().from(jobItems).where(and(eq(jobItems.company, c.req.param("id")), eq(jobItems.isActive, true))).orderBy(desc(jobItems.createdAt));
  return c.json(success(rows), 200);
});

// Follow a company
companyRoutes.post("/:id/follow", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  await db.insert(companyFollowers).values({ userId: uid, companyId: c.req.param("id") }).onConflictDoNothing();
  return c.json(success({ success: true }), 200);
});

// Unfollow a company
companyRoutes.delete("/:id/follow", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  await db.delete(companyFollowers).where(and(eq(companyFollowers.userId, uid), eq(companyFollowers.companyId, c.req.param("id"))));
  return c.json(success({ success: true }), 200);
});

// Is the current user following this company?
companyRoutes.get("/:id/following-status", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json(success({ isFollowing: false }), 200);
  const db = getDb();
  const [row] = await db.select({ id: companyFollowers.userId }).from(companyFollowers).where(and(eq(companyFollowers.userId, uid), eq(companyFollowers.companyId, c.req.param("id")))).limit(1);
  return c.json(success({ isFollowing: !!row }), 200);
});

// Company stats
companyRoutes.get("/:id/stats", async (c) => {
  const db = getDb();
  const [jobsRow, followersRow] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(jobItems).where(eq(jobItems.company, c.req.param("id"))),
    db.select({ count: sql<number>`count(*)::int` }).from(companyFollowers).where(eq(companyFollowers.companyId, c.req.param("id"))),
  ]);
  const jobsCount = jobsRow[0]?.count ?? 0;
  const followersCount = followersRow[0]?.count ?? 0;
  const [activeRow] = await db.select({ count: sql<number>`count(*)::int` }).from(jobItems).where(and(eq(jobItems.company, c.req.param("id")), eq(jobItems.isActive, true)));
  return c.json(success({ jobsCount, followersCount, activeJobsCount: activeRow?.count ?? 0 }), 200);
});

// Create company
companyRoutes.post("/", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const body = await c.req.json().catch(() => ({}));
  if (!body.name) return c.json(error("BAD_REQUEST", "Company name is required"), 400);
  const slug = String(body.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const db = getDb();
  const [row] = await db.insert(companyProfiles).values({ ownerId: uid, name: body.name, slug, description: body.description ?? null, website: body.website ?? null, logoUrl: body.logoUrl ?? null, industry: body.industry ?? null, size: body.size ?? null, foundedYear: body.foundedYear ?? null, headquarters: body.headquarters ?? null } as any).returning();
  return c.json(success(rowToCompanyMeta(row)), 201);
});

// Get by ID — returns the full CompanyProfile shape consumed by CompanyDetail.tsx
companyRoutes.get("/:id", async (c) => {
  const db = getDb();
  const id = c.req.param("id");
  const callerSub = userId(c);

  const [row] = await db.select().from(companyProfiles).where(eq(companyProfiles.id, id)).limit(1);
  if (!row) return c.json(error("NOT_FOUND", "Company not found"), 404);

  // Record the view before computing extras so the fresh count is
  // reflected in the response. `recordCompanyView` no-ops when the
  // viewer is the company owner.
  await recordCompanyView(db, id, row.ownerId, {
    userId: callerSub,
    ipHash: hashClientIp(c),
    referrer: c.req.header("referer") ?? c.req.header("referrer") ?? null,
    userAgent: c.req.header("user-agent") ?? null,
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
  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [existing] = await db.select({ ownerId: companyProfiles.ownerId }).from(companyProfiles).where(eq(companyProfiles.id, c.req.param("id"))).limit(1);
  if (!existing) return c.json(error("NOT_FOUND", "Company not found"), 404);
  if (existing.ownerId !== uid) return c.json(error("FORBIDDEN", "Only the owner can update this company"), 403);
  const body = await c.req.json().catch(() => ({}));
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  // Basic profile fields (existing).
  for (const key of ["name", "description", "website", "logoUrl", "industry", "size", "foundedYear", "headquarters"] as const) {
    if (key in body) updates[key] = (body as any)[key];
  }
  // New profile fields added in migration 0023 (tagline / mission / vision
  // / technologies / perks / culture / values / benefits). Accepted verbatim
  // — callers are expected to post already-validated data from the editor.
  for (const key of ["tagline", "mission", "vision", "technologies", "perks", "culture", "values", "benefits"] as const) {
    if (key in body) updates[key] = (body as any)[key];
  }
  const [row] = await db.update(companyProfiles).set(updates as any).where(eq(companyProfiles.id, c.req.param("id"))).returning();
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

async function assertCompanyOwner(c: any, companyId: string): Promise<string | Response> {
  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [existing] = await db
    .select({ ownerId: companyProfiles.ownerId })
    .from(companyProfiles)
    .where(eq(companyProfiles.id, companyId))
    .limit(1);
  if (!existing) return c.json(error("NOT_FOUND", "Company not found"), 404);
  if (existing.ownerId !== uid) return c.json(error("FORBIDDEN", "Only the owner can modify this company"), 403);
  return uid;
}

companyRoutes.get("/:id/locations", async (c) => {
  const db = getDb();
  const rows = await db
    .select()
    .from(companyLocations)
    .where(eq(companyLocations.companyId, c.req.param("id")))
    .orderBy(asc(companyLocations.displayOrder));
  return c.json(success(rows), 200);
});

companyRoutes.post("/:id/locations", async (c) => {
  const guard = await assertCompanyOwner(c, c.req.param("id"));
  if (typeof guard !== "string") return guard;
  const parsed = LocationSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid location", parsed.error.flatten()), 400);
  const db = getDb();
  const [row] = await db
    .insert(companyLocations)
    .values({ companyId: c.req.param("id"), ...parsed.data } as any)
    .returning();
  return c.json(success(row), 201);
});

companyRoutes.put("/:id/locations/:locationId", async (c) => {
  const guard = await assertCompanyOwner(c, c.req.param("id"));
  if (typeof guard !== "string") return guard;
  const parsed = LocationSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid location", parsed.error.flatten()), 400);
  const db = getDb();
  const [row] = await db
    .update(companyLocations)
    .set({ ...parsed.data, updatedAt: new Date() } as any)
    .where(and(
      eq(companyLocations.id, c.req.param("locationId")),
      eq(companyLocations.companyId, c.req.param("id")),
    ))
    .returning();
  if (!row) return c.json(error("NOT_FOUND", "Location not found"), 404);
  return c.json(success(row), 200);
});

companyRoutes.delete("/:id/locations/:locationId", async (c) => {
  const guard = await assertCompanyOwner(c, c.req.param("id"));
  if (typeof guard !== "string") return guard;
  const db = getDb();
  await db
    .delete(companyLocations)
    .where(and(
      eq(companyLocations.id, c.req.param("locationId")),
      eq(companyLocations.companyId, c.req.param("id")),
    ));
  return c.json(success(null, "Location deleted"), 200);
});

// ─── Company Team Members ─────────────────────────────────────────────────

const TeamMemberSchema = z.object({
  userId: z.string().uuid().optional().nullable(),
  name: z.string().min(1).max(255),
  title: z.string().max(255).optional().nullable(),
  bio: z.string().max(2000).optional().nullable(),
  avatarUrl: z.string().url().optional().nullable(),
  linkedinUrl: z.string().url().optional().nullable(),
  displayOrder: z.number().int().min(0).optional(),
});

companyRoutes.get("/:id/team", async (c) => {
  const db = getDb();
  const rows = await db
    .select()
    .from(companyTeamMembers)
    .where(eq(companyTeamMembers.companyId, c.req.param("id")))
    .orderBy(asc(companyTeamMembers.displayOrder));
  return c.json(success(rows), 200);
});

companyRoutes.post("/:id/team", async (c) => {
  const guard = await assertCompanyOwner(c, c.req.param("id"));
  if (typeof guard !== "string") return guard;
  const parsed = TeamMemberSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid team member", parsed.error.flatten()), 400);
  const db = getDb();
  const [row] = await db
    .insert(companyTeamMembers)
    .values({ companyId: c.req.param("id"), ...parsed.data } as any)
    .returning();
  return c.json(success(row), 201);
});

companyRoutes.put("/:id/team/:memberId", async (c) => {
  const guard = await assertCompanyOwner(c, c.req.param("id"));
  if (typeof guard !== "string") return guard;
  const parsed = TeamMemberSchema.partial().safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json(error("VALIDATION_ERROR", "Invalid team member", parsed.error.flatten()), 400);
  const db = getDb();
  const [row] = await db
    .update(companyTeamMembers)
    .set({ ...parsed.data, updatedAt: new Date() } as any)
    .where(and(
      eq(companyTeamMembers.id, c.req.param("memberId")),
      eq(companyTeamMembers.companyId, c.req.param("id")),
    ))
    .returning();
  if (!row) return c.json(error("NOT_FOUND", "Team member not found"), 404);
  return c.json(success(row), 200);
});

companyRoutes.delete("/:id/team/:memberId", async (c) => {
  const guard = await assertCompanyOwner(c, c.req.param("id"));
  if (typeof guard !== "string") return guard;
  const db = getDb();
  await db
    .delete(companyTeamMembers)
    .where(and(
      eq(companyTeamMembers.id, c.req.param("memberId")),
      eq(companyTeamMembers.companyId, c.req.param("id")),
    ));
  return c.json(success(null, "Team member deleted"), 200);
});

// Delete company
companyRoutes.delete("/:id", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [existing] = await db.select({ ownerId: companyProfiles.ownerId }).from(companyProfiles).where(eq(companyProfiles.id, c.req.param("id"))).limit(1);
  if (!existing) return c.json(error("NOT_FOUND", "Company not found"), 404);
  if (existing.ownerId !== uid) return c.json(error("FORBIDDEN", "Only the owner can delete this company"), 403);
  await db.delete(companyProfiles).where(eq(companyProfiles.id, c.req.param("id")));
  return c.json(success(null, "Company deleted"), 200);
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
  const [page] = await db
    .select()
    .from(employerBrandingPages)
    .where(eq(employerBrandingPages.companyId, c.req.param("id")))
    .limit(1);
  if (!page || !page.isPublished) return c.json(error("NOT_FOUND", "Branding page not found"), 404);
  return c.json(success(page), 200);
});

/** PATCH /api/companies/:id/branding — owner only; upserts the branding page */
companyRoutes.patch("/:id/branding", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const companyId = c.req.param("id");
  const db = getDb();

  const [company] = await db.select({ ownerId: companyProfiles.ownerId }).from(companyProfiles).where(eq(companyProfiles.id, companyId)).limit(1);
  if (!company) return c.json(error("NOT_FOUND", "Company not found"), 404);
  if (company.ownerId !== uid) return c.json(error("FORBIDDEN", "Only the company owner can update branding"), 403);

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
  const apiKey = getApiKey((c.env as any) ?? {});
  let extracted: z.infer<typeof CompanyExtractionResponseSchema>;

  if (apiKey) {
    try {
      extracted = await callLLMJson(
        apiKey,
        {
          systemPrompt: `You extract company/business information from a web page.
Return valid JSON with the company's details. If a field is not found, use an empty string.`,
          userMessage: `Extract company details from this page:

${plainText}

Return JSON: { "name": "...", "industry": "...", "size": "...", "location": "...", "website": "...", "description": "...", "foundedYear": null }`,
          responseFormat: "json_object",
          temperature: 0.2,
        },
        CompanyExtractionResponseSchema,
      );
    } catch {
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
    if (!existing.headquarters && extracted.location) updates.headquarters = extracted.location;
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
      headquarters: extracted.location || null,
      foundedYear: extracted.foundedYear ?? null,
    } as any)
    .returning();

  return c.json(success({
    company: created,
    duplicate: false,
  }), 201);
});

companyRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Company endpoint not found" } }, 404),
);