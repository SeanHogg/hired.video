/**
 * Creators / Promo Video Marketplace (gap #101)
 *
 * Routes:
 *   Creator profile
 *     POST   /api/creators/opt-in                — start a new enrollment row (programs[], terms, profile)
 *     PATCH  /api/creators/me                    — update creator profile fields on active row
 *     GET    /api/creators/me                    — get active enrollment row (or null)
 *     POST   /api/creators/me/programs/:program  — enable a program (video|voice|services)
 *     DELETE /api/creators/me/programs/:program  — disable a program (flag false; row stays open)
 *     POST   /api/creators/me/cancel             — leave the program (sets ended_at; new row on re-enroll)
 *     POST   /api/creators/me/payout             — link payout account ref
 *     GET    /api/creators/public/:userId        — public creator profile + portfolio + reviews
 *     GET    /api/creators/browse                — discovery list (rating-sorted)
 *
 *   Portfolio
 *     GET    /api/creators/portfolio             — own items
 *     POST   /api/creators/portfolio             — create item
 *     PUT    /api/creators/portfolio/:id         — update item
 *     DELETE /api/creators/portfolio/:id         — delete item
 *     POST   /api/creators/portfolio/:id/feature — set as featured (clears other)
 *     GET    /api/creators/portfolio/public/:userId — public gallery for any user
 *
 *   Promo projects
 *     POST   /api/creators/projects                       — create project from inquiry
 *     GET    /api/creators/projects                       — list (creator or customer view)
 *     GET    /api/creators/projects/:id                   — single project + revisions
 *     POST   /api/creators/projects/:id/revisions         — submit a new revision
 *     POST   /api/creators/projects/:id/revisions/:revId/decision — approve / request changes
 *     POST   /api/creators/projects/:id/buy-extra-revision        — purchase extra revision
 *     POST   /api/creators/projects/:id/accept                    — accept delivery, release escrow
 *     POST   /api/creators/projects/:id/dispute                   — open dispute
 *     POST   /api/creators/projects/:id/review                    — leave review (customer only)
 */

import { Hono } from "hono";
import { eq, and, or, desc, sql } from "drizzle-orm";
import type { Variables } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { getSubscription } from "../services/billing/BillingService.js";
import { hasAcceptedCurrentLegalDoc } from "./legal.js";

const {
  creatorProfiles,
  portfolioItems,
  promoProjects,
  promoProjectRevisions,
  promoProjectExtraRevisionPurchases,
  reviews,
  serviceInquiries,
  serviceOfferings,
  conversations,
  conversationParticipants,
  studioReviewComments,
  userProfiles,
  users,
  notifications,
} = schema;

const DEFAULT_PLATFORM_FEE_BPS = 500; // 5% (+ CC processing passed to buyer at checkout)
const ESCROW_AUTO_RELEASE_DAYS = 7;
const INCLUDED_REVISIONS = 3;

type CreatorProgram = "video" | "voice" | "services" | "articles" | "courses";
const CREATOR_PROGRAMS: CreatorProgram[] = ["video", "voice", "services", "articles", "courses"];
const PROGRAM_TERMS_KIND: Record<CreatorProgram, string> = {
  video: "program_video_terms",
  voice: "program_voice_terms",
  services: "program_services_terms",
  articles: "program_articles_terms",
  courses: "program_courses_terms",
};
function flagFor(program: CreatorProgram) {
  return program === "video" ? "videoActive"
    : program === "voice" ? "voiceActive"
    : program === "services" ? "servicesActive"
    : program === "articles" ? "articlesActive"
    : "coursesActive";
}
function isValidProgram(p: unknown): p is CreatorProgram {
  return typeof p === "string" && (CREATOR_PROGRAMS as string[]).includes(p);
}

export const creatorRoutes = new Hono<{ Variables: Variables }>();

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

function requireAuth(c: any): string | Response {
  const userId = uid(c);
  if (!userId) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  return userId;
}

async function notify(
  db: ReturnType<typeof getDb>,
  userId: string,
  type: string,
  title: string,
  message: string,
  data?: Record<string, unknown>,
) {
  await db
    .insert(notifications)
    .values({ userId, type, title, message, data: data ?? null } as any)
    .catch(() => undefined);
}

function calcFees(priceCents: number, feeBps: number) {
  const platformFeeCents = Math.round((priceCents * feeBps) / 10000);
  const creatorCutCents = priceCents - platformFeeCents;
  return { platformFeeCents, creatorCutCents };
}

async function getCreator(db: ReturnType<typeof getDb>, userId: string) {
  const [row] = await db
    .select()
    .from(creatorProfiles)
    .where(and(eq(creatorProfiles.userId, userId), sql`${creatorProfiles.endedAt} IS NULL`))
    .limit(1);
  return row ?? null;
}

function deriveIsActive(flags: { videoActive: boolean; voiceActive: boolean; servicesActive: boolean; articlesActive: boolean; coursesActive: boolean }) {
  return flags.videoActive || flags.voiceActive || flags.servicesActive || flags.articlesActive || flags.coursesActive;
}

async function assertProgramTerms(
  db: ReturnType<typeof getDb>,
  userId: string,
  programs: CreatorProgram[],
): Promise<{ ok: boolean; missing: CreatorProgram[] }> {
  const missing: CreatorProgram[] = [];
  for (const p of programs) {
    const accepted = await hasAcceptedCurrentLegalDoc(db, userId, PROGRAM_TERMS_KIND[p]);
    if (!accepted) missing.push(p);
  }
  return { ok: missing.length === 0, missing };
}

// ===========================================================================
// Creator profile
// ===========================================================================

// POST /opt-in — start a new Creator Program enrollment.
//
// Body: { programs: ('video'|'voice'|'services')[], displayName?, tagline?,
//         bio?, categories?, languages? }
//
// Gates (in order):
//   1. Authenticated user
//   2. Active paid subscription
//   3. At least one program selected
//   4. Current per-program terms acceptance for each selected program
//      (frontend wizard must POST /api/legal/accept for each kind first)
//   5. No existing active enrollment row (use program-toggle / cancel endpoints
//      instead). Cancel-all + re-enroll is the path for fully re-onboarding.
creatorRoutes.post("/opt-in", async (c) => {
  const userId = requireAuth(c);
  if (typeof userId !== "string") return userId;

  const body = await c.req.json().catch(() => ({})) as {
    programs?: unknown;
    displayName?: string;
    tagline?: string;
    bio?: string;
    categories?: string[];
    languages?: string[];
  };

  const db = getDb();

  const programs = Array.isArray(body.programs) ? body.programs.filter(isValidProgram) : [];
  if (programs.length === 0) {
    return c.json(error("VALIDATION_ERROR", "Select at least one program (video, voice, services)"), 400);
  }

  const sub = await getSubscription(userId);
  if (!sub.isPremium) {
    return c.json(
      error(
        "UPGRADE_REQUIRED",
        "Becoming a creator requires a paid Creator subscription ($9.95/mo). Please upgrade before opting in.",
      ),
      402,
    );
  }

  const termsCheck = await assertProgramTerms(db, userId, programs);
  if (!termsCheck.ok) {
    return c.json(
      error(
        "TERMS_NOT_ACCEPTED",
        `Accept the current terms for: ${termsCheck.missing.join(", ")}. POST /api/legal/accept for each program kind first.`,
      ),
      400,
    );
  }

  if (await getCreator(db, userId)) {
    return c.json(
      error("ALREADY_ENROLLED", "Active enrollment exists. Toggle programs via /me/programs/:program or cancel all via /me/cancel."),
      409,
    );
  }

  const now = new Date();
  const flags = {
    videoActive: programs.includes("video"),
    voiceActive: programs.includes("voice"),
    servicesActive: programs.includes("services"),
    articlesActive: programs.includes("articles"),
    coursesActive: programs.includes("courses"),
  };

  const [created] = await db
    .insert(creatorProfiles)
    .values({
      userId,
      ...flags,
      isActive: deriveIsActive(flags),
      displayName: body.displayName ?? null,
      tagline: body.tagline ?? null,
      bio: body.bio ?? null,
      categories: body.categories ?? [],
      languages: body.languages ?? [],
      platformFeeBps: DEFAULT_PLATFORM_FEE_BPS,
    } as any)
    .returning();
  await db.update(userProfiles).set({ providesServices: true, updatedAt: now } as any).where(eq(userProfiles.userId, userId));
  return c.json(success(created), 201);
});

// POST /me/programs/:program — enable a program on the active enrollment.
// Requires current terms acceptance for the program.
creatorRoutes.post("/me/programs/:program", async (c) => {
  const userId = requireAuth(c);
  if (typeof userId !== "string") return userId;
  const program = c.req.param("program");
  if (!isValidProgram(program)) {
    return c.json(error("VALIDATION_ERROR", "Unknown program"), 400);
  }
  const db = getDb();
  const existing = await getCreator(db, userId);
  if (!existing) return c.json(error("NOT_FOUND", "No active enrollment. Use /opt-in first."), 404);

  const termsCheck = await assertProgramTerms(db, userId, [program]);
  if (!termsCheck.ok) {
    return c.json(
      error("TERMS_NOT_ACCEPTED", `Accept the current ${program} program terms first.`),
      400,
    );
  }

  const flagKey = flagFor(program);
  const next = {
    videoActive: existing.videoActive,
    voiceActive: existing.voiceActive,
    servicesActive: existing.servicesActive,
    articlesActive: existing.articlesActive,
    coursesActive: existing.coursesActive,
    [flagKey]: true,
  };
  const [updated] = await db
    .update(creatorProfiles)
    .set({ ...next, isActive: deriveIsActive(next), updatedAt: new Date() } as any)
    .where(eq(creatorProfiles.id, existing.id))
    .returning();
  return c.json(success(updated), 200);
});

// DELETE /me/programs/:program — flip a program flag false.
// Per spec: cancelling a single program does NOT end the enrollment row;
// it just disables that program. The row stays open with ended_at null.
creatorRoutes.delete("/me/programs/:program", async (c) => {
  const userId = requireAuth(c);
  if (typeof userId !== "string") return userId;
  const program = c.req.param("program");
  if (!isValidProgram(program)) {
    return c.json(error("VALIDATION_ERROR", "Unknown program"), 400);
  }
  const db = getDb();
  const existing = await getCreator(db, userId);
  if (!existing) return c.json(error("NOT_FOUND", "No active enrollment"), 404);

  const flagKey = flagFor(program);
  const next = {
    videoActive: existing.videoActive,
    voiceActive: existing.voiceActive,
    servicesActive: existing.servicesActive,
    articlesActive: existing.articlesActive,
    coursesActive: existing.coursesActive,
    [flagKey]: false,
  };
  const [updated] = await db
    .update(creatorProfiles)
    .set({ ...next, isActive: deriveIsActive(next), updatedAt: new Date() } as any)
    .where(eq(creatorProfiles.id, existing.id))
    .returning();
  return c.json(success(updated), 200);
});

// POST /me/cancel — leave the Creator Program entirely.
// Sets ended_at on the active row and clears all program flags. Re-enrolling
// is done by hitting /opt-in again (which inserts a new row).
creatorRoutes.post("/me/cancel", async (c) => {
  const userId = requireAuth(c);
  if (typeof userId !== "string") return userId;
  const db = getDb();
  const existing = await getCreator(db, userId);
  if (!existing) return c.json(error("NOT_FOUND", "No active enrollment"), 404);

  const now = new Date();
  const [updated] = await db
    .update(creatorProfiles)
    .set({
      endedAt: now,
      videoActive: false,
      voiceActive: false,
      servicesActive: false,
      articlesActive: false,
      coursesActive: false,
      isActive: false,
      updatedAt: now,
    } as any)
    .where(eq(creatorProfiles.id, existing.id))
    .returning();
  await db.update(userProfiles).set({ providesServices: false, updatedAt: now } as any).where(eq(userProfiles.userId, userId));
  return c.json(success(updated), 200);
});

// GET /me — own creator profile
creatorRoutes.get("/me", async (c) => {
  const userId = requireAuth(c);
  if (typeof userId !== "string") return userId;
  const db = getDb();
  const row = await getCreator(db, userId);
  return c.json(success(row), 200);
});

// PATCH /me — update creator profile fields
creatorRoutes.patch("/me", async (c) => {
  const userId = requireAuth(c);
  if (typeof userId !== "string") return userId;
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const db = getDb();
  const existing = await getCreator(db, userId);
  if (!existing) return c.json(error("NOT_FOUND", "Opt in first via /opt-in"), 404);

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  // is_active is derived from per-program flags; toggle programs via
  // /me/programs/:program. Cancel-all via /me/cancel. PATCH is profile-only.
  for (const k of [
    "displayName", "tagline", "bio", "categories", "languages",
    "defaultPriceCents", "extraRevisionPriceCents", "averageDeliveryDays",
  ] as const) {
    if (k in body) patch[k] = (body as any)[k];
  }

  const [updated] = await db
    .update(creatorProfiles)
    .set(patch as any)
    .where(eq(creatorProfiles.id, existing.id))
    .returning();
  return c.json(success(updated), 200);
});

// POST /me/payout — link payout account
creatorRoutes.post("/me/payout", async (c) => {
  const userId = requireAuth(c);
  if (typeof userId !== "string") return userId;
  const body = await c.req.json().catch(() => ({})) as {
    provider?: string;
    accountId?: string;
    country?: string;
    currency?: string;
  };
  if (!body.provider || !body.accountId) {
    return c.json(error("VALIDATION_ERROR", "provider and accountId are required"), 400);
  }
  const db = getDb();
  const existing = await getCreator(db, userId);
  if (!existing) return c.json(error("NOT_FOUND", "Opt in first via /opt-in"), 404);

  const [updated] = await db
    .update(creatorProfiles)
    .set({
      payoutProvider: body.provider,
      payoutAccountId: body.accountId,
      payoutOnboardedAt: new Date(),
      payoutCountry: body.country ?? null,
      payoutCurrency: body.currency ?? "USD",
      updatedAt: new Date(),
    } as any)
    .where(eq(creatorProfiles.id, existing.id))
    .returning();
  return c.json(success(updated), 200);
});

// GET /browse — public discovery list
creatorRoutes.get("/browse", async (c) => {
  const db = getDb();
  const limit = Math.min(parseInt(c.req.query("limit") ?? "30", 10) || 30, 100);
  const category = c.req.query("category");

  const baseConds = [
    eq(creatorProfiles.isActive, true),
    sql`${creatorProfiles.endedAt} IS NULL`,
    // Hide unverified accounts — keeps spam signups out of the creator
    // marketplace until they prove ownership of the email address.
    eq(users.emailVerified, true),
  ];
  // Category filter on jsonb categories array
  if (category) {
    baseConds.push(sql`${creatorProfiles.categories} ? ${category}`);
  }

  const rows = await db
    .select({
      creator: creatorProfiles,
      user: { id: users.id, name: users.name },
      profile: { avatarUrl: userProfiles.avatarUrl, headline: userProfiles.headline },
    })
    .from(creatorProfiles)
    .innerJoin(users, eq(creatorProfiles.userId, users.id))
    .leftJoin(userProfiles, eq(creatorProfiles.userId, userProfiles.userId))
    .where(and(...baseConds))
    .orderBy(desc(creatorProfiles.averageRating), desc(creatorProfiles.completedProjectsCount))
    .limit(limit);

  return c.json(success(rows), 200);
});

// GET /public/:userId — public creator profile + portfolio + recent reviews
creatorRoutes.get("/public/:userId", async (c) => {
  const db = getDb();
  const targetId = c.req.param("userId");

  // Block unverified creators from public surfaces. Returning 404 (rather than
  // a verification-specific error) avoids confirming the existence of a
  // half-created account to anonymous callers.
  const [owner] = await db
    .select({ emailVerified: users.emailVerified })
    .from(users)
    .where(eq(users.id, targetId))
    .limit(1);
  if (!owner || !owner.emailVerified) return c.json(error("NOT_FOUND", "Creator not found"), 404);

  const [creator] = await db
    .select()
    .from(creatorProfiles)
    .where(and(
      eq(creatorProfiles.userId, targetId),
      eq(creatorProfiles.isActive, true),
      sql`${creatorProfiles.endedAt} IS NULL`,
    ))
    .limit(1);
  if (!creator) return c.json(error("NOT_FOUND", "Creator not found"), 404);

  const [portfolio, projectReviews, profile] = await Promise.all([
    db
      .select()
      .from(portfolioItems)
      .where(and(eq(portfolioItems.userId, targetId), eq(portfolioItems.isPublic, true)))
      .orderBy(desc(portfolioItems.isFeatured), portfolioItems.sortOrder, desc(portfolioItems.createdAt)),
    // Reviews of any of this creator's promo projects. The polymorphic
    // `reviews` table is keyed on (subject_type, subject_id) — for
    // promo_project rows the subject_id is the project, so we join
    // back through promo_projects to filter by creator.
    db
      .select({
        review: reviews,
        customer: { id: users.id, name: users.name },
      })
      .from(reviews)
      .innerJoin(promoProjects, eq(promoProjects.id, reviews.subjectId))
      .innerJoin(users, eq(reviews.userId, users.id))
      .where(
        and(
          eq(reviews.subjectType, "promo_project"),
          eq(reviews.status, "published"),
          eq(promoProjects.creatorId, targetId),
        ),
      )
      .orderBy(desc(reviews.createdAt))
      .limit(20),
    db
      .select({ avatarUrl: userProfiles.avatarUrl, headline: userProfiles.headline })
      .from(userProfiles)
      .where(eq(userProfiles.userId, targetId))
      .limit(1),
  ]);

  return c.json(
    success({
      creator,
      profile: profile[0] ?? null,
      portfolio,
      reviews: projectReviews,
    }),
    200,
  );
});

// ===========================================================================
// Portfolio
// ===========================================================================

// GET /portfolio — own items
creatorRoutes.get("/portfolio", async (c) => {
  const userId = requireAuth(c);
  if (typeof userId !== "string") return userId;
  const db = getDb();
  const rows = await db
    .select()
    .from(portfolioItems)
    .where(eq(portfolioItems.userId, userId))
    .orderBy(desc(portfolioItems.isFeatured), portfolioItems.sortOrder, desc(portfolioItems.createdAt));
  return c.json(success(rows), 200);
});

// GET /portfolio/public/:userId — public gallery (no auth)
creatorRoutes.get("/portfolio/public/:userId", async (c) => {
  const db = getDb();
  const targetId = c.req.param("userId");

  // Block portfolios belonging to unverified accounts. Same 404-as-not-found
  // pattern as the other public surfaces above.
  const [owner] = await db
    .select({ emailVerified: users.emailVerified })
    .from(users)
    .where(eq(users.id, targetId))
    .limit(1);
  if (!owner || !owner.emailVerified) return c.json(success([]), 200);

  const rows = await db
    .select()
    .from(portfolioItems)
    .where(and(eq(portfolioItems.userId, targetId), eq(portfolioItems.isPublic, true)))
    .orderBy(desc(portfolioItems.isFeatured), portfolioItems.sortOrder, desc(portfolioItems.createdAt));
  return c.json(success(rows), 200);
});

// POST /portfolio — create item
creatorRoutes.post("/portfolio", async (c) => {
  const userId = requireAuth(c);
  if (typeof userId !== "string") return userId;
  const body = await c.req.json().catch(() => ({})) as {
    title?: string;
    description?: string;
    mediaType?: string;
    mediaUrl?: string;
    thumbnailUrl?: string;
    durationMs?: number;
    category?: string;
    tags?: string[];
    isPublic?: boolean;
  };
  if (!body.title?.trim() || !body.mediaUrl || !body.mediaType) {
    return c.json(error("VALIDATION_ERROR", "title, mediaUrl, mediaType are required"), 400);
  }
  if (!["video", "image"].includes(body.mediaType)) {
    return c.json(error("VALIDATION_ERROR", "mediaType must be 'video' or 'image'"), 400);
  }
  const db = getDb();
  const [row] = await db
    .insert(portfolioItems)
    .values({
      userId,
      title: body.title.trim(),
      description: body.description ?? null,
      mediaType: body.mediaType,
      mediaUrl: body.mediaUrl,
      thumbnailUrl: body.thumbnailUrl ?? null,
      durationMs: body.durationMs ?? null,
      category: body.category ?? null,
      tags: body.tags ?? [],
      isPublic: body.isPublic ?? true,
      source: "upload",
    } as any)
    .returning();
  return c.json(success(row), 201);
});

// PUT /portfolio/:id — update item
creatorRoutes.put("/portfolio/:id", async (c) => {
  const userId = requireAuth(c);
  if (typeof userId !== "string") return userId;
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const db = getDb();
  const [existing] = await db
    .select()
    .from(portfolioItems)
    .where(and(eq(portfolioItems.id, c.req.param("id")), eq(portfolioItems.userId, userId)))
    .limit(1);
  if (!existing) return c.json(error("NOT_FOUND", "Portfolio item not found"), 404);

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of ["title", "description", "thumbnailUrl", "category", "tags", "isPublic", "sortOrder"] as const) {
    if (k in body) patch[k] = (body as any)[k];
  }
  const [updated] = await db
    .update(portfolioItems)
    .set(patch as any)
    .where(eq(portfolioItems.id, c.req.param("id")))
    .returning();
  return c.json(success(updated), 200);
});

// DELETE /portfolio/:id
creatorRoutes.delete("/portfolio/:id", async (c) => {
  const userId = requireAuth(c);
  if (typeof userId !== "string") return userId;
  const db = getDb();
  const [existing] = await db
    .select({ id: portfolioItems.id })
    .from(portfolioItems)
    .where(and(eq(portfolioItems.id, c.req.param("id")), eq(portfolioItems.userId, userId)))
    .limit(1);
  if (!existing) return c.json(error("NOT_FOUND", "Portfolio item not found"), 404);
  await db.delete(portfolioItems).where(eq(portfolioItems.id, c.req.param("id")));
  return c.json(success({ deleted: true }), 200);
});

// POST /portfolio/:id/feature — set as featured (clears other featured items first)
creatorRoutes.post("/portfolio/:id/feature", async (c) => {
  const userId = requireAuth(c);
  if (typeof userId !== "string") return userId;
  const db = getDb();
  const [item] = await db
    .select()
    .from(portfolioItems)
    .where(and(eq(portfolioItems.id, c.req.param("id")), eq(portfolioItems.userId, userId)))
    .limit(1);
  if (!item) return c.json(error("NOT_FOUND", "Portfolio item not found"), 404);

  // Clear existing featured flag (partial unique index requires this)
  await db
    .update(portfolioItems)
    .set({ isFeatured: false, updatedAt: new Date() } as any)
    .where(and(eq(portfolioItems.userId, userId), eq(portfolioItems.isFeatured, true)));

  const [updated] = await db
    .update(portfolioItems)
    .set({ isFeatured: true, updatedAt: new Date() } as any)
    .where(eq(portfolioItems.id, c.req.param("id")))
    .returning();
  return c.json(success(updated), 200);
});

// ===========================================================================
// Promo projects
// ===========================================================================

// POST /projects — create a promo project from an inquiry
// Body: { inquiryId, title, briefResumeId?, briefJobId?, briefNotes?, briefAssets?, conversationId? }
creatorRoutes.post("/projects", async (c) => {
  const userId = requireAuth(c);
  if (typeof userId !== "string") return userId;
  const body = await c.req.json().catch(() => ({})) as {
    inquiryId?: string;
    title?: string;
    briefResumeId?: string;
    briefJobId?: string;
    briefNotes?: string;
    briefAssets?: Array<{ url: string; type: string; name?: string }>;
    conversationId?: string;
  };
  if (!body.inquiryId || !body.title?.trim()) {
    return c.json(error("VALIDATION_ERROR", "inquiryId and title are required"), 400);
  }

  const db = getDb();
  const [inquiry] = await db
    .select()
    .from(serviceInquiries)
    .where(eq(serviceInquiries.id, body.inquiryId))
    .limit(1);
  if (!inquiry) return c.json(error("NOT_FOUND", "Inquiry not found"), 404);

  // Only the customer (fromUserId) can convert their own inquiry into a project
  if (inquiry.fromUserId !== userId) {
    return c.json(error("FORBIDDEN", "Only the buyer can create the project"), 403);
  }

  const [offering] = await db
    .select()
    .from(serviceOfferings)
    .where(eq(serviceOfferings.id, inquiry.serviceId))
    .limit(1);
  if (!offering) return c.json(error("NOT_FOUND", "Service offering missing"), 404);

  const creator = await getCreator(db, inquiry.providerId);
  if (!creator || !creator.isActive) {
    return c.json(error("CREATOR_INACTIVE", "Creator is not currently accepting projects"), 400);
  }
  if (!creator.payoutAccountId) {
    return c.json(error("CREATOR_NO_PAYOUT", "Creator has not configured payout — cannot accept paid orders"), 400);
  }
  // Real-time subscription check — a lapsed Creator subscription must block
  // new orders even if isActive hasn't been reconciled yet.
  const creatorSub = await getSubscription(inquiry.providerId);
  if (!creatorSub.isPremium) {
    return c.json(error("CREATOR_SUBSCRIPTION_LAPSED", "Creator subscription is no longer active"), 400);
  }

  const priceCents = offering.priceCents ?? 0;
  const feeBps = creator.platformFeeBps ?? DEFAULT_PLATFORM_FEE_BPS;
  const { platformFeeCents, creatorCutCents } = calcFees(priceCents, feeBps);

  // Auto-create a 1:1 conversation if one wasn't passed in
  let conversationId = body.conversationId ?? null;
  if (!conversationId) {
    const [conv] = await db
      .insert(conversations)
      .values({
        subject: `Promo project: ${body.title.trim()}`,
        type: "promo_project",
      } as any)
      .returning();
    conversationId = conv.id;
    await db.insert(conversationParticipants).values([
      { conversationId, userId: inquiry.fromUserId, role: "customer" } as any,
      { conversationId, userId: inquiry.providerId, role: "creator" } as any,
    ]);
  }

  const [project] = await db
    .insert(promoProjects)
    .values({
      customerId: inquiry.fromUserId,
      creatorId: inquiry.providerId,
      inquiryId: inquiry.id,
      serviceOfferingId: offering.id,
      conversationId,
      title: body.title.trim(),
      briefResumeId: body.briefResumeId ?? null,
      briefJobId: body.briefJobId ?? null,
      briefNotes: body.briefNotes ?? null,
      briefAssets: body.briefAssets ?? [],
      status: "brief",
      revisionsAllowed: INCLUDED_REVISIONS,
      revisionsUsed: 0,
      priceCents,
      currency: "USD",
      platformFeeBps: feeBps,
      platformFeeCents,
      creatorCutCents,
      // Payment is recorded on a separate /pay endpoint once Helcim/Stripe wires up.
      // For v1 we mark as paid immediately if priceCents=0 (free/quote).
      paidAt: priceCents === 0 ? new Date() : null,
    } as any)
    .returning();

  // Mark inquiry accepted
  await db
    .update(serviceInquiries)
    .set({ status: "accepted", updatedAt: new Date() } as any)
    .where(eq(serviceInquiries.id, inquiry.id));

  await notify(
    db,
    inquiry.providerId,
    "promo_project_created",
    `New promo project: ${project.title}`,
    `A customer has started a promo project with you.`,
    { projectId: project.id },
  );

  return c.json(success(project), 201);
});

// GET /projects — list, filtered by role (creator | customer)
creatorRoutes.get("/projects", async (c) => {
  const userId = requireAuth(c);
  if (typeof userId !== "string") return userId;
  const db = getDb();
  const role = c.req.query("role"); // "creator" | "customer"
  const where =
    role === "creator"
      ? eq(promoProjects.creatorId, userId)
      : role === "customer"
        ? eq(promoProjects.customerId, userId)
        : or(eq(promoProjects.creatorId, userId), eq(promoProjects.customerId, userId));
  const rows = await db
    .select()
    .from(promoProjects)
    .where(where)
    .orderBy(desc(promoProjects.createdAt));
  return c.json(success(rows), 200);
});

// GET /projects/:id — single project + revisions + comments
creatorRoutes.get("/projects/:id", async (c) => {
  const userId = requireAuth(c);
  if (typeof userId !== "string") return userId;
  const db = getDb();
  const [project] = await db
    .select()
    .from(promoProjects)
    .where(eq(promoProjects.id, c.req.param("id")))
    .limit(1);
  if (!project) return c.json(error("NOT_FOUND", "Project not found"), 404);
  if (project.creatorId !== userId && project.customerId !== userId) {
    return c.json(error("FORBIDDEN", "Not a participant"), 403);
  }
  const [revisions, comments] = await Promise.all([
    db
      .select()
      .from(promoProjectRevisions)
      .where(eq(promoProjectRevisions.projectId, project.id))
      .orderBy(promoProjectRevisions.revisionNumber),
    project.studioProjectId
      ? db
          .select()
          .from(studioReviewComments)
          .where(eq(studioReviewComments.projectId, project.studioProjectId))
          .orderBy(desc(studioReviewComments.createdAt))
      : Promise.resolve([]),
  ]);
  return c.json(success({ project, revisions, comments }), 200);
});

// POST /projects/:id/revisions — creator submits a new revision
creatorRoutes.post("/projects/:id/revisions", async (c) => {
  const userId = requireAuth(c);
  if (typeof userId !== "string") return userId;
  const body = await c.req.json().catch(() => ({})) as {
    videoUrl?: string;
    thumbnailUrl?: string;
    storyboardSnapshot?: unknown;
    durationMs?: number;
    creatorNotes?: string;
  };
  if (!body.videoUrl) {
    return c.json(error("VALIDATION_ERROR", "videoUrl is required"), 400);
  }
  const db = getDb();
  const [project] = await db
    .select()
    .from(promoProjects)
    .where(eq(promoProjects.id, c.req.param("id")))
    .limit(1);
  if (!project) return c.json(error("NOT_FOUND", "Project not found"), 404);
  if (project.creatorId !== userId) {
    return c.json(error("FORBIDDEN", "Only the creator can submit revisions"), 403);
  }
  if (project.status === "accepted" || project.status === "cancelled" || project.status === "refunded") {
    return c.json(error("INVALID_STATE", `Project is ${project.status}`), 400);
  }
  if (project.revisionsUsed >= project.revisionsAllowed) {
    return c.json(
      error("REVISION_LIMIT", "Revision limit reached. Customer must purchase an extra revision."),
      402,
    );
  }

  const nextNumber = project.revisionsUsed + 1;
  const isPaidExtra = nextNumber > INCLUDED_REVISIONS;

  const [rev] = await db
    .insert(promoProjectRevisions)
    .values({
      projectId: project.id,
      revisionNumber: nextNumber,
      isPaidExtra,
      videoUrl: body.videoUrl,
      thumbnailUrl: body.thumbnailUrl ?? null,
      storyboardSnapshot: body.storyboardSnapshot ?? null,
      durationMs: body.durationMs ?? null,
      creatorNotes: body.creatorNotes ?? null,
    } as any)
    .returning();

  await db
    .update(promoProjects)
    .set({
      revisionsUsed: nextNumber,
      status: "delivered",
      deliveredVideoUrl: body.videoUrl,
      deliveredAt: new Date(),
      autoReleaseAt: new Date(Date.now() + ESCROW_AUTO_RELEASE_DAYS * 24 * 60 * 60 * 1000),
      updatedAt: new Date(),
    } as any)
    .where(eq(promoProjects.id, project.id));

  await notify(
    db,
    project.customerId,
    "promo_revision_submitted",
    `Revision ${nextNumber} delivered: ${project.title}`,
    `Your creator submitted revision ${nextNumber} for review.`,
    { projectId: project.id, revisionId: rev.id },
  );

  return c.json(success(rev), 201);
});

// POST /projects/:id/revisions/:revId/decision — customer approves / requests changes
creatorRoutes.post("/projects/:id/revisions/:revId/decision", async (c) => {
  const userId = requireAuth(c);
  if (typeof userId !== "string") return userId;
  const body = await c.req.json().catch(() => ({})) as { decision?: string; feedback?: string };
  if (!body.decision || !["approved", "changes_requested"].includes(body.decision)) {
    return c.json(error("VALIDATION_ERROR", "decision must be 'approved' or 'changes_requested'"), 400);
  }
  const db = getDb();
  const [project] = await db
    .select()
    .from(promoProjects)
    .where(eq(promoProjects.id, c.req.param("id")))
    .limit(1);
  if (!project) return c.json(error("NOT_FOUND", "Project not found"), 404);
  if (project.customerId !== userId) {
    return c.json(error("FORBIDDEN", "Only the customer can decide on revisions"), 403);
  }
  const [rev] = await db
    .select()
    .from(promoProjectRevisions)
    .where(and(eq(promoProjectRevisions.id, c.req.param("revId")), eq(promoProjectRevisions.projectId, project.id)))
    .limit(1);
  if (!rev) return c.json(error("NOT_FOUND", "Revision not found"), 404);

  await db
    .update(promoProjectRevisions)
    .set({
      customerDecision: body.decision,
      customerFeedback: body.feedback ?? null,
      decidedAt: new Date(),
    } as any)
    .where(eq(promoProjectRevisions.id, rev.id));

  // If approved, transition to delivered (already delivered, just leave the
  // status). The customer must call /accept to release escrow.
  // If changes_requested, return to in_progress.
  if (body.decision === "changes_requested") {
    await db
      .update(promoProjects)
      .set({ status: "in_progress", updatedAt: new Date() } as any)
      .where(eq(promoProjects.id, project.id));
  }

  await notify(
    db,
    project.creatorId,
    "promo_revision_decision",
    `Revision ${rev.revisionNumber} ${body.decision === "approved" ? "approved" : "needs changes"}`,
    body.feedback ?? "",
    { projectId: project.id, revisionId: rev.id },
  );

  return c.json(success({ ok: true }), 200);
});

// POST /projects/:id/buy-extra-revision — customer pays for an additional revision
creatorRoutes.post("/projects/:id/buy-extra-revision", async (c) => {
  const userId = requireAuth(c);
  if (typeof userId !== "string") return userId;
  const db = getDb();
  const [project] = await db
    .select()
    .from(promoProjects)
    .where(eq(promoProjects.id, c.req.param("id")))
    .limit(1);
  if (!project) return c.json(error("NOT_FOUND", "Project not found"), 404);
  if (project.customerId !== userId) {
    return c.json(error("FORBIDDEN", "Only the customer can purchase revisions"), 403);
  }
  if (project.status === "accepted" || project.status === "cancelled" || project.status === "refunded") {
    return c.json(error("INVALID_STATE", `Project is ${project.status}`), 400);
  }
  const creator = await getCreator(db, project.creatorId);
  if (!creator) return c.json(error("NOT_FOUND", "Creator profile missing"), 404);

  const priceCents = creator.extraRevisionPriceCents > 0
    ? creator.extraRevisionPriceCents
    : Math.max(Math.round(project.priceCents * 0.25), 500); // default = 25% of base, min $5
  const feeBps = project.platformFeeBps;
  const { platformFeeCents, creatorCutCents } = calcFees(priceCents, feeBps);

  const [purchase] = await db
    .insert(promoProjectExtraRevisionPurchases)
    .values({
      projectId: project.id,
      customerId: userId,
      priceCents,
      currency: project.currency,
      platformFeeBps: feeBps,
      platformFeeCents,
      creatorCutCents,
      paidAt: new Date(), // payment provider integration handled separately
      revisionsAdded: 1,
    } as any)
    .returning();

  await db
    .update(promoProjects)
    .set({ revisionsAllowed: project.revisionsAllowed + 1, updatedAt: new Date() } as any)
    .where(eq(promoProjects.id, project.id));

  await notify(
    db,
    project.creatorId,
    "promo_extra_revision_purchased",
    `Extra revision purchased: ${project.title}`,
    `Customer purchased an extra revision.`,
    { projectId: project.id, purchaseId: purchase.id },
  );

  return c.json(success(purchase), 201);
});

// POST /projects/:id/accept — customer accepts delivery, escrow released
creatorRoutes.post("/projects/:id/accept", async (c) => {
  const userId = requireAuth(c);
  if (typeof userId !== "string") return userId;
  const body = await c.req.json().catch(() => ({})) as { portfolioConsent?: boolean };
  const db = getDb();
  const [project] = await db
    .select()
    .from(promoProjects)
    .where(eq(promoProjects.id, c.req.param("id")))
    .limit(1);
  if (!project) return c.json(error("NOT_FOUND", "Project not found"), 404);
  if (project.customerId !== userId) {
    return c.json(error("FORBIDDEN", "Only the customer can accept delivery"), 403);
  }
  if (project.status === "accepted") {
    return c.json(success(project), 200);
  }
  if (!project.deliveredAt) {
    return c.json(error("INVALID_STATE", "Nothing delivered to accept yet"), 400);
  }

  const now = new Date();
  await db
    .update(promoProjects)
    .set({
      status: "accepted",
      acceptedAt: now,
      escrowReleasedAt: now,
      portfolioConsent: body.portfolioConsent ?? false,
      updatedAt: now,
    } as any)
    .where(eq(promoProjects.id, project.id));

  // Update creator aggregates
  await db
    .update(creatorProfiles)
    .set({
      completedProjectsCount: sql`${creatorProfiles.completedProjectsCount} + 1`,
      totalEarnedCents: sql`${creatorProfiles.totalEarnedCents} + ${project.creatorCutCents}`,
      updatedAt: now,
    } as any)
    .where(and(eq(creatorProfiles.userId, project.creatorId), sql`${creatorProfiles.endedAt} IS NULL`));

  // Auto-add to portfolio if customer consented
  if (body.portfolioConsent && project.deliveredVideoUrl) {
    await db
      .insert(portfolioItems)
      .values({
        userId: project.creatorId,
        title: project.title,
        mediaType: "video",
        mediaUrl: project.deliveredVideoUrl,
        source: "promo_project",
        sourcePromoProjectId: project.id,
        customerConsent: true,
        isPublic: true,
      } as any)
      .catch(() => undefined);
  }

  await notify(
    db,
    project.creatorId,
    "promo_project_accepted",
    `Project accepted: ${project.title}`,
    `Funds released. Time to celebrate.`,
    { projectId: project.id },
  );

  return c.json(success({ accepted: true }), 200);
});

// POST /projects/:id/dispute — open dispute (manual admin resolution)
creatorRoutes.post("/projects/:id/dispute", async (c) => {
  const userId = requireAuth(c);
  if (typeof userId !== "string") return userId;
  const body = await c.req.json().catch(() => ({})) as { reason?: string };
  const db = getDb();
  const [project] = await db
    .select()
    .from(promoProjects)
    .where(eq(promoProjects.id, c.req.param("id")))
    .limit(1);
  if (!project) return c.json(error("NOT_FOUND", "Project not found"), 404);
  if (project.customerId !== userId && project.creatorId !== userId) {
    return c.json(error("FORBIDDEN", "Not a participant"), 403);
  }
  await db
    .update(promoProjects)
    .set({ status: "disputed", updatedAt: new Date() } as any)
    .where(eq(promoProjects.id, project.id));

  // Notify the other party + flag for admin via notification
  const otherParty = userId === project.customerId ? project.creatorId : project.customerId;
  await notify(db, otherParty, "promo_project_disputed", `Project disputed: ${project.title}`, body.reason ?? "", { projectId: project.id });

  return c.json(success({ disputed: true }), 200);
});

// Reviews on promo projects moved to the polymorphic system —
// POST /api/reviews/promo_project/:id (see api/src/routes/reviews.ts).
// The 410 keeps any stale clients from silently no-op'ing.
creatorRoutes.post("/projects/:id/review", (c) =>
  c.json(
    error(
      "GONE",
      "This endpoint has moved. POST /api/reviews/promo_project/:id with { overallRating, title, body, subRatings: { communication, quality, timeliness } } instead.",
    ),
    410,
  ),
);

creatorRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Creator route not found" } }, 404),
);
