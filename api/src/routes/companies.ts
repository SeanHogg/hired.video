import { Hono } from "hono";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";

const { companyProfiles, companyFollowers, jobItems, userCompanyRoleAssociations, employerBrandingPages } = schema;

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
    logoUrl: row.logoUrl,
    industry: row.industry,
    size: row.size,
    foundedYear: row.foundedYear,
    headquarters: row.headquarters,
    isVerified: row.isVerified,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
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

// Get by ID
companyRoutes.get("/:id", async (c) => {
  const db = getDb();
  const [row] = await db.select().from(companyProfiles).where(eq(companyProfiles.id, c.req.param("id"))).limit(1);
  if (!row) return c.json(error("NOT_FOUND", "Company not found"), 404);
  return c.json(success(rowToCompanyMeta(row)), 200);
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
  for (const key of ["name", "description", "website", "logoUrl", "industry", "size", "foundedYear", "headquarters"] as const) {
    if (key in body) updates[key] = (body as any)[key];
  }
  const [row] = await db.update(companyProfiles).set(updates as any).where(eq(companyProfiles.id, c.req.param("id"))).returning();
  return c.json(success(rowToCompanyMeta(row)), 200);
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

companyRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Company endpoint not found" } }, 404),
);