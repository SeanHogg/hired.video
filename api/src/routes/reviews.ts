/**
 * Polymorphic reviews API.
 *
 * One router serves every subject type (company, promo_project,
 * service, voice_clone, …). The shape of each form is declared by the
 * descriptor in shared/reviews/subject-descriptors.ts; this router
 * validates the payload against that descriptor and stores it in the
 * single `reviews` / `review_comments` pair.
 *
 *   GET    /api/reviews/:subjectType/:subjectId           public list
 *   GET    /api/reviews/:subjectType/:subjectId/aggregate avg + distribution
 *   GET    /api/reviews/:subjectType/:subjectId/me        own review (auth)
 *   POST   /api/reviews/:subjectType/:subjectId           create/upsert (descriptor gates pro / eligibility)
 *   PUT    /api/reviews/:reviewId                         edit own
 *   DELETE /api/reviews/:reviewId                         delete own
 *   GET    /api/reviews/:reviewId/comments                threaded list
 *   POST   /api/reviews/:reviewId/comments                add comment (auth, parentId optional)
 *   DELETE /api/reviews/comments/:commentId               delete own comment
 *
 * Aggregate cache columns on the parent (e.g. companies.review_count)
 * are NOT updated here — that lives in Phase D. See migration 0032 for
 * the data folding from the legacy single-purpose tables.
 */

import { Hono } from "hono";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { UuidLikeSchema } from "../../../shared/validation.js";
import type { Variables, AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { getSubscription } from "../services/billing/BillingService.js";
import { USER_ROLES } from "../../../shared/user-roles.js";
import { TIER_COPY, UPGRADE_URL } from "../../../shared/tier-copy.js";
import {
  getSubjectDescriptor,
  isSubjectType,
  type SubjectType,
  type SubjectDescriptor,
} from "../../../shared/reviews/subject-descriptors.js";

const {
  reviews,
  reviewComments,
  feedPosts,
  companyProfiles,
  promoProjects,
  creatorProfiles,
  users,
  articles,
  courses,
  courseEnrollments,
  courseCertificates,
  resumeTemplates,
  studioTemplates,
  templateLicenses,
} = schema;

export const reviewRoutes = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function userId(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

/** Inline Pro check that mirrors requirePro's admin bypass.
 *  Returns null when the caller may proceed, or a 402 Response when
 *  they're blocked. Used by handlers whose Pro-required-ness is
 *  driven by the subject descriptor (so it can't be expressed as a
 *  static middleware factory). */
async function proGate(c: any, featureName: string): Promise<Response | null> {
  const uid = (c.var.user?.sub as string | undefined) ?? null;
  if (!uid) {
    return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  }
  const roles = (c.var.user?.roles as string[] | undefined) ?? [];
  const role = (c.var.user as any)?.role ?? "";
  if (
    roles.includes(USER_ROLES.SUPER_ADMIN) ||
    roles.includes(USER_ROLES.ADMIN) ||
    role === USER_ROLES.SUPER_ADMIN ||
    role === USER_ROLES.ADMIN
  ) {
    return null;
  }
  const sub = await getSubscription(uid);
  if (!sub.isPro) {
    return c.json(
      {
        success: false,
        error: {
          code: "PRO_REQUIRED",
          message: TIER_COPY.proFeatureRequired(featureName),
          upgradeUrl: UPGRADE_URL,
        },
      },
      402,
    );
  }
  return null;
}

/** Same scheme as companies.ts hashClientIp — non-cryptographic, daily salt. */
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

/** Pull the registrable domain out of a website URL. Returns null on
 *  bad input. Naive but adequate for "alice@acme.com vs acme.com" —
 *  drops the "www." prefix and ignores subdomains beyond the eTLD+1
 *  level we control by looking at the last two parts. */
function domainFromWebsite(website: string | null | undefined): string | null {
  if (!website) return null;
  try {
    const url = new URL(website.startsWith("http") ? website : `https://${website}`);
    return url.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function domainFromEmail(email: string | null | undefined): string | null {
  if (!email || !email.includes("@")) return null;
  return email.split("@")[1]?.toLowerCase() ?? null;
}

/** A resolved subject — what the route handler needs to know about
 *  whatever's being reviewed. `ownerId` blocks self-reviews; `buyerId`
 *  is checked when the descriptor is `buyer_only`; `verifyAgainst`
 *  carries the data the verification rule needs (e.g. company website
 *  domain). Returning `null` means the subject doesn't exist. */
interface ResolvedSubject {
  ownerId: string;
  buyerId?: string;
  /** Required state for buyer_only subjects (e.g. promo_project must be 'accepted' to review). */
  requiredState?: { actual: string; required: string };
  verifyAgainst: {
    websiteDomain?: string | null;
  };
}

async function resolveSubject(
  db: ReturnType<typeof getDb>,
  type: SubjectType,
  id: string,
  /** Reviewer's user id. Optional for backwards compatibility with the
   *  is-owner check at comment-resolve time. Required to populate
   *  `buyerId` on many-buyer subjects (course / template / certification)
   *  where the buyer is identified by a license/enrollment row, not a
   *  single column on the subject itself. */
  reviewerId?: string,
): Promise<ResolvedSubject | null> {
  switch (type) {
    case "company": {
      const [row] = await db
        .select({
          id: companyProfiles.id,
          ownerId: companyProfiles.ownerId,
          website: companyProfiles.website,
        })
        .from(companyProfiles)
        .where(eq(companyProfiles.id, id))
        .limit(1);
      if (!row) return null;
      return {
        ownerId: row.ownerId,
        verifyAgainst: { websiteDomain: domainFromWebsite(row.website) },
      };
    }
    case "promo_project": {
      const [row] = await db
        .select({
          id: promoProjects.id,
          customerId: promoProjects.customerId,
          creatorId: promoProjects.creatorId,
          status: promoProjects.status,
        })
        .from(promoProjects)
        .where(eq(promoProjects.id, id))
        .limit(1);
      if (!row) return null;
      return {
        ownerId: row.creatorId,
        buyerId: row.customerId,
        requiredState: { actual: row.status, required: "accepted" },
        verifyAgainst: {},
      };
    }
    case "article": {
      const [row] = await db
        .select({ ownerId: articles.userId })
        .from(articles)
        .where(eq(articles.id, id))
        .limit(1);
      if (!row) return null;
      return { ownerId: row.ownerId, verifyAgainst: {} };
    }
    case "course": {
      const [row] = await db
        .select({ ownerId: courses.userId })
        .from(courses)
        .where(eq(courses.id, id))
        .limit(1);
      if (!row) return null;
      // For many-buyer subjects we resolve the reviewer's enrollment to
      // populate `buyerId`. Without an enrollment, `buyerId` stays
      // undefined and the buyer_only eligibility check fails closed.
      let buyerId: string | undefined;
      if (reviewerId) {
        const [enrol] = await db
          .select({ userId: courseEnrollments.userId })
          .from(courseEnrollments)
          .where(and(eq(courseEnrollments.courseId, id), eq(courseEnrollments.userId, reviewerId)))
          .limit(1);
        if (enrol) buyerId = enrol.userId;
      }
      return { ownerId: row.ownerId, buyerId, verifyAgainst: {} };
    }
    case "resume_template": {
      const [row] = await db
        .select({ ownerId: resumeTemplates.createdBy })
        .from(resumeTemplates)
        .where(eq(resumeTemplates.id, id))
        .limit(1);
      if (!row) return null;
      // resume_templates.createdBy is nullable (platform-seeded templates
      // have no creator). Fall back to a sentinel so `ownerId === reviewerId`
      // self-review block never spuriously matches.
      const ownerId = row.ownerId ?? "00000000-0000-0000-0000-000000000000";
      let buyerId: string | undefined;
      if (reviewerId) {
        const [lic] = await db
          .select({ userId: templateLicenses.userId })
          .from(templateLicenses)
          .where(
            and(
              eq(templateLicenses.templateKind, "resume"),
              eq(templateLicenses.templateId, id),
              eq(templateLicenses.userId, reviewerId),
            ),
          )
          .limit(1);
        if (lic) buyerId = lic.userId;
      }
      return { ownerId, buyerId, verifyAgainst: {} };
    }
    case "video_template": {
      const [row] = await db
        .select({ ownerId: studioTemplates.creatorId })
        .from(studioTemplates)
        .where(eq(studioTemplates.id, id))
        .limit(1);
      if (!row) return null;
      let buyerId: string | undefined;
      if (reviewerId) {
        const [lic] = await db
          .select({ userId: templateLicenses.userId })
          .from(templateLicenses)
          .where(
            and(
              eq(templateLicenses.templateKind, "studio"),
              eq(templateLicenses.templateId, id),
              eq(templateLicenses.userId, reviewerId),
            ),
          )
          .limit(1);
        if (lic) buyerId = lic.userId;
      }
      return { ownerId: row.ownerId, buyerId, verifyAgainst: {} };
    }
    case "certification": {
      const [row] = await db
        .select({ ownerId: courseCertificates.userId })
        .from(courseCertificates)
        .where(eq(courseCertificates.id, id))
        .limit(1);
      if (!row) return null;
      // For certs the "buyer" semantic == the cert holder. Self-attestation
      // reviews are intentional (Coursera-style "what this cert did for me").
      return { ownerId: row.ownerId, buyerId: row.ownerId, verifyAgainst: {} };
    }
    // Stubbed — descriptor exists, subject lookup not wired yet. The
    // route returns 501 so callers don't silently no-op.
    case "service":
    case "voice_clone":
      return null;
    default:
      return null;
  }
}

type ValidationResult = NormalizedReviewBody | { __validationError: unknown };

/** Validate a payload against a subject descriptor. Returns the
 *  normalized body, or `{ __validationError }` on failure (caller
 *  narrows with `'__validationError' in result`). */
function validatePayload(
  raw: unknown,
  descriptor: SubjectDescriptor,
): ValidationResult {
  const schemaShape: Record<string, z.ZodTypeAny> = {
    overallRating: z.number().int().min(1).max(5),
    title: z.string().trim().min(5).max(200),
    body: z.string().trim().max(4000).nullish(),
    subRatings: z.record(z.string(), z.number().int().min(1).max(5)).optional(),
    metadata: z.record(z.string(), z.union([z.string().max(4000), z.null()])).optional(),
  };
  const parsed = z.object(schemaShape).safeParse(raw);
  if (!parsed.success) return { __validationError: parsed.error.flatten() };
  const data = parsed.data as {
    overallRating: number;
    title: string;
    body?: string | null;
    subRatings?: Record<string, number>;
    metadata?: Record<string, string | null | undefined>;
  };

  // Whitelist sub-rating keys against the descriptor — extra axes are
  // dropped silently rather than 400'd, so a stale frontend doesn't
  // hard-fail when the registry adds a new optional axis.
  const allowedAxes = new Set(descriptor.subRatings.map((a) => a.key));
  const cleanSubRatings: Record<string, number> = {};
  for (const [k, v] of Object.entries(data.subRatings ?? {})) {
    if (allowedAxes.has(k)) cleanSubRatings[k] = v;
  }

  // Same whitelisting for metadata. Body sections (pros/cons/advice)
  // are also valid metadata keys.
  const allowedMeta = new Set<string>(descriptor.metadataFields.map((f) => f.key));
  for (const section of descriptor.bodySections) {
    if (section.key !== "body") allowedMeta.add(section.key);
  }
  const cleanMeta: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(data.metadata ?? {})) {
    if (allowedMeta.has(k)) cleanMeta[k] = v ?? null;
  }

  return {
    overallRating: data.overallRating,
    title: data.title,
    body: data.body ?? null,
    subRatings: cleanSubRatings,
    metadata: cleanMeta,
  };
}

interface NormalizedReviewBody {
  overallRating: number;
  title: string;
  body: string | null;
  subRatings: Record<string, number>;
  metadata: Record<string, string | null>;
}

/** Compute the verified-employee / verified-buyer flag at write time.
 *  The descriptor decides which method runs. Returns null when the
 *  descriptor opts out of verification entirely. */
async function computeVerification(
  db: ReturnType<typeof getDb>,
  descriptor: SubjectDescriptor,
  reviewerUserId: string,
  subject: ResolvedSubject,
): Promise<{ isVerified: boolean; method: string | null }> {
  if (descriptor.verification === "none") return { isVerified: false, method: null };

  if (descriptor.verification === "email_domain") {
    const subjectDomain = subject.verifyAgainst.websiteDomain ?? null;
    if (!subjectDomain) return { isVerified: false, method: null };
    const [u] = await db
      .select({ email: users.email, emailVerified: users.emailVerified })
      .from(users)
      .where(eq(users.id, reviewerUserId))
      .limit(1);
    if (!u || !u.emailVerified) return { isVerified: false, method: "email_domain" };
    const userDomain = domainFromEmail(u.email);
    return {
      isVerified: !!userDomain && userDomain === subjectDomain,
      method: "email_domain",
    };
  }

  if (descriptor.verification === "was_buyer") {
    return {
      isVerified: subject.buyerId === reviewerUserId,
      method: "was_buyer",
    };
  }

  return { isVerified: false, method: null };
}

function rowToReview(row: typeof reviews.$inferSelect) {
  return {
    id: row.id,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    userId: row.userId,
    overallRating: row.overallRating,
    title: row.title,
    body: row.body,
    subRatings: row.subRatings as Record<string, number>,
    metadata: row.metadata as Record<string, string | null>,
    isVerified: row.isVerified,
    verificationMethod: row.verificationMethod,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Build the embed payload that the feed renderer reads. Kept small —
 *  enough for a card preview. The full review is fetched on expand. */
function buildEmbedPayload(
  review: typeof reviews.$inferSelect,
  descriptor: SubjectDescriptor,
): Record<string, unknown> {
  const excerptSource = review.body || (review.metadata as Record<string, string | null>)?.pros || "";
  return {
    kind: "review",
    subjectType: review.subjectType,
    subjectId: review.subjectId,
    subjectPath: descriptor.subjectPath(review.subjectId),
    subjectNoun: descriptor.noun,
    overallRating: review.overallRating,
    title: review.title,
    excerpt: excerptSource.length > 240 ? excerptSource.slice(0, 237) + "…" : excerptSource,
    isVerified: review.isVerified,
    verificationMethod: review.verificationMethod,
  };
}

/** Emit (or update) the feed post that surfaces a review. Idempotent
 *  per (subject_type='review', subject_id=reviewId) — re-running on
 *  edit just updates the embed payload. Failures are swallowed: feed
 *  surfacing is a downstream concern; a hiccup here shouldn't 500 the
 *  review write. */
async function syncFeedPostForReview(
  db: ReturnType<typeof getDb>,
  review: typeof reviews.$inferSelect,
): Promise<void> {
  if (!isSubjectType(review.subjectType)) return;
  if (review.status !== "published") {
    // Reviewer flagged / hid: tear down the feed surfacing too.
    await db
      .delete(feedPosts)
      .where(and(eq(feedPosts.subjectType, "review"), eq(feedPosts.subjectId, review.id)));
    return;
  }
  const descriptor = getSubjectDescriptor(review.subjectType);
  const embed = buildEmbedPayload(review, descriptor);
  const content = `Reviewed a ${descriptor.noun}: ${review.title}`;

  const [existing] = await db
    .select({ id: feedPosts.id })
    .from(feedPosts)
    .where(and(eq(feedPosts.subjectType, "review"), eq(feedPosts.subjectId, review.id)))
    .limit(1);

  if (existing) {
    await db
      .update(feedPosts)
      .set({ content, embedPayload: embed, updatedAt: new Date() } as any)
      .where(eq(feedPosts.id, existing.id));
    return;
  }

  await db
    .insert(feedPosts)
    .values({
      userId: review.userId,
      content,
      privacy: "Public",
      subjectType: "review",
      subjectId: review.id,
      embedPayload: embed,
    } as any);
}

async function deleteFeedPostForReview(
  db: ReturnType<typeof getDb>,
  reviewId: string,
): Promise<void> {
  await db
    .delete(feedPosts)
    .where(and(eq(feedPosts.subjectType, "review"), eq(feedPosts.subjectId, reviewId)));
}

/** Recompute the cached review aggregate on the parent row. Called
 *  on every review write/delete so directory / card / OG renders can
 *  read a denormalized count + avg without re-scanning the
 *  polymorphic `reviews` table. Per-subject-type implementation —
 *  unwired types are no-ops, matching the cache-column rollout. */
async function recomputeAggregateCache(
  db: ReturnType<typeof getDb>,
  subjectType: string,
  subjectId: string,
): Promise<void> {
  if (subjectType === "company") {
    const [agg] = await db
      .select({
        cnt: sql<number>`count(*)::int`,
        avg: sql<number | null>`avg(${reviews.overallRating})::float`,
      })
      .from(reviews)
      .where(
        and(
          eq(reviews.subjectType, "company"),
          eq(reviews.subjectId, subjectId),
          eq(reviews.status, "published"),
        ),
      );
    await db
      .update(companyProfiles)
      .set({
        reviewCount: agg?.cnt ?? 0,
        reviewAvgOverall: agg?.avg != null ? agg.avg.toFixed(2) : null,
        updatedAt: new Date(),
      } as any)
      .where(eq(companyProfiles.id, subjectId));
    return;
  }

  if (subjectType === "promo_project") {
    // The "subject" of a promo_project review is the project, but
    // the cache lives on the creator. Look up the creator via the
    // project, then aggregate across all of that creator's projects.
    const [project] = await db
      .select({ creatorId: promoProjects.creatorId })
      .from(promoProjects)
      .where(eq(promoProjects.id, subjectId))
      .limit(1);
    if (!project) return;
    const [agg] = await db
      .select({
        cnt: sql<number>`count(*)::int`,
        avg: sql<number | null>`avg(${reviews.overallRating})::float`,
      })
      .from(reviews)
      .innerJoin(promoProjects, eq(promoProjects.id, reviews.subjectId))
      .where(
        and(
          eq(reviews.subjectType, "promo_project"),
          eq(reviews.status, "published"),
          eq(promoProjects.creatorId, project.creatorId),
        ),
      );
    await db
      .update(creatorProfiles)
      .set({
        averageRating: agg?.avg != null ? agg.avg.toFixed(2) : null,
        ratingCount: agg?.cnt ?? 0,
        updatedAt: new Date(),
      } as any)
      .where(eq(creatorProfiles.userId, project.creatorId));
    return;
  }

  if (subjectType === "course") {
    const [agg] = await db
      .select({
        cnt: sql<number>`count(*)::int`,
        avg: sql<number | null>`avg(${reviews.overallRating})::float`,
      })
      .from(reviews)
      .where(
        and(
          eq(reviews.subjectType, "course"),
          eq(reviews.subjectId, subjectId),
          eq(reviews.status, "published"),
        ),
      );
    await db
      .update(courses)
      .set({
        averageRating: agg?.avg ?? null,
        ratingCount: agg?.cnt ?? 0,
        updatedAt: new Date(),
      } as any)
      .where(eq(courses.id, subjectId));
    return;
  }

  // service / voice_clone / article / resume_template / video_template /
  // certification — cache columns don't exist yet, no-op. See gap #793
  // for the schema additions that would let these subjects denormalise
  // rating count + avg onto their listing rows.
}

function rowToComment(row: typeof reviewComments.$inferSelect) {
  return {
    id: row.id,
    reviewId: row.reviewId,
    userId: row.userId,
    parentId: row.parentId,
    body: row.body,
    isSubjectOwner: row.isSubjectOwner,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Subject-scoped routes  /api/reviews/:subjectType/:subjectId/...
// ---------------------------------------------------------------------------

/** Parses + validates the subject_type param, returning a 400 if invalid. */
function parseSubjectType(c: any): SubjectType | Response {
  const raw = c.req.param("subjectType");
  if (!isSubjectType(raw)) {
    return c.json(error("BAD_REQUEST", `Unknown subject type: ${raw}`), 400);
  }
  return raw;
}

reviewRoutes.get("/:subjectType/:subjectId", async (c) => {
  const subjectType = parseSubjectType(c);
  if (typeof subjectType !== "string") return subjectType;

  const subjectId = c.req.param("subjectId");
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const limit = Math.min(50, Math.max(1, Number(c.req.query("limit") ?? 10)));
  const offset = (page - 1) * limit;

  const db = getDb();
  const where = and(
    eq(reviews.subjectType, subjectType),
    eq(reviews.subjectId, subjectId),
    eq(reviews.status, "published"),
  );

  const [rows, [countRow]] = await Promise.all([
    db
      .select()
      .from(reviews)
      .where(where)
      .orderBy(desc(reviews.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(reviews).where(where),
  ]);

  const total = countRow?.count ?? 0;
  const totalPages = Math.ceil(total / limit);
  return c.json(
    success({
      items: rows.map(rowToReview),
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    }),
    200,
  );
});

reviewRoutes.get("/:subjectType/:subjectId/aggregate", async (c) => {
  const subjectType = parseSubjectType(c);
  if (typeof subjectType !== "string") return subjectType;

  const subjectId = c.req.param("subjectId");
  const db = getDb();
  const where = and(
    eq(reviews.subjectType, subjectType),
    eq(reviews.subjectId, subjectId),
    eq(reviews.status, "published"),
  );

  const [aggRow] = await db
    .select({
      total: sql<number>`count(*)::int`,
      avgOverall: sql<number | null>`avg(${reviews.overallRating})::float`,
    })
    .from(reviews)
    .where(where);

  const distRows = await db
    .select({ bucket: reviews.overallRating, count: sql<number>`count(*)::int` })
    .from(reviews)
    .where(where)
    .groupBy(reviews.overallRating);

  const distribution: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of distRows) {
    const b = r.bucket as 1 | 2 | 3 | 4 | 5;
    if (b >= 1 && b <= 5) distribution[b] = r.count;
  }

  // Average each sub-rating axis declared by the descriptor. Done in
  // app code rather than SQL because the keys vary per subject type
  // and a generic `jsonb_object_agg(avg(...))` query is more contortion
  // than the row volumes warrant.
  const descriptor = getSubjectDescriptor(subjectType);
  const allRows = await db
    .select({ subRatings: reviews.subRatings })
    .from(reviews)
    .where(where);
  const axisAverages: Record<string, number | null> = {};
  for (const axis of descriptor.subRatings) {
    let sum = 0;
    let count = 0;
    for (const r of allRows) {
      const value = (r.subRatings as Record<string, number>)?.[axis.key];
      if (typeof value === "number" && value >= 1 && value <= 5) {
        sum += value;
        count++;
      }
    }
    axisAverages[axis.key] = count > 0 ? sum / count : null;
  }

  return c.json(
    success({
      total: aggRow?.total ?? 0,
      averages: {
        overall: aggRow?.avgOverall ?? null,
        ...axisAverages,
      },
      distribution,
    }),
    200,
  );
});

reviewRoutes.get("/:subjectType/:subjectId/me", async (c) => {
  const subjectType = parseSubjectType(c);
  if (typeof subjectType !== "string") return subjectType;

  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const [row] = await db
    .select()
    .from(reviews)
    .where(
      and(
        eq(reviews.subjectType, subjectType),
        eq(reviews.subjectId, c.req.param("subjectId")),
        eq(reviews.userId, uid),
      ),
    )
    .limit(1);
  return c.json(success({ review: row ? rowToReview(row) : null }), 200);
});

/** Create-or-update the caller's review on a subject. The descriptor
 *  decides whether pro is required, who's eligible, and how the
 *  reviewer gets a verified badge. */
async function upsertHandler(c: any): Promise<Response> {
  const raw = c.req.param("subjectType");
  if (!isSubjectType(raw)) {
    return c.json(error("BAD_REQUEST", `Unknown subject type: ${raw}`), 400);
  }
  const subjectType: SubjectType = raw;
  const descriptor = getSubjectDescriptor(subjectType);
  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const subjectId = c.req.param("subjectId");
  const db = getDb();

  const subject = await resolveSubject(db, subjectType, subjectId, uid);
  if (!subject) {
    return c.json(error("NOT_FOUND", `${descriptor.noun} not found`), 404);
  }

  // Eligibility — owner_blocked / buyer_only.
  if (descriptor.eligibility === "owner_blocked" && subject.ownerId === uid) {
    return c.json(error("FORBIDDEN", `You cannot review your own ${descriptor.noun}`), 403);
  }
  if (descriptor.eligibility === "buyer_only") {
    if (subject.buyerId !== uid) {
      return c.json(error("FORBIDDEN", "Only the buyer can review this"), 403);
    }
    if (subject.requiredState && subject.requiredState.actual !== subject.requiredState.required) {
      return c.json(
        error(
          "INVALID_STATE",
          `${descriptor.noun} must be ${subject.requiredState.required} before reviewing (currently ${subject.requiredState.actual})`,
        ),
        400,
      );
    }
  }

  const body = await c.req.json().catch(() => null);
  const validation = validatePayload(body, descriptor);
  if ("__validationError" in validation) {
    return c.json(error("BAD_REQUEST", "Invalid review payload", validation.__validationError), 400);
  }
  const v = validation;

  // 1-per-day-per-IP throttle on NEW reviews. Edits to an existing
  // review are unrestricted (the unique index gives "1 per
  // subject/user" all by itself, so the rate limit is for cross-
  // subject spam from the same network).
  const ipHash = hashClientIp(c);
  const [existing] = await db
    .select({ id: reviews.id })
    .from(reviews)
    .where(
      and(eq(reviews.subjectType, subjectType), eq(reviews.subjectId, subjectId), eq(reviews.userId, uid)),
    )
    .limit(1);
  const isNew = !existing;
  if (isNew && ipHash) {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [recent] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(reviews)
      .where(
        and(
          eq(reviews.submitterIpHash, ipHash),
          sql`${reviews.createdAt} >= ${dayAgo.toISOString()}::timestamptz`,
        ),
      );
    if ((recent?.count ?? 0) >= 1) {
      return c.json(
        error(
          "RATE_LIMITED",
          "Only one new review per day from this network. Please try again tomorrow.",
        ),
        429,
      );
    }
  }

  const verification = await computeVerification(db, descriptor, uid, subject);

  const [row] = await db
    .insert(reviews)
    .values({
      subjectType,
      subjectId,
      userId: uid,
      overallRating: v.overallRating,
      title: v.title,
      body: v.body,
      subRatings: v.subRatings,
      metadata: v.metadata,
      isVerified: verification.isVerified,
      verificationMethod: verification.method,
      submitterIpHash: ipHash,
    } as any)
    .onConflictDoUpdate({
      target: [reviews.subjectType, reviews.subjectId, reviews.userId],
      set: {
        overallRating: v.overallRating,
        title: v.title,
        body: v.body,
        subRatings: v.subRatings,
        metadata: v.metadata,
        isVerified: verification.isVerified,
        verificationMethod: verification.method,
        updatedAt: new Date(),
      } as any,
    })
    .returning();

  // Surface in the dashboard feed + recompute parent's cached
  // aggregate. Both are best-effort — downstream concerns shouldn't
  // fail the write.
  try {
    await syncFeedPostForReview(db, row);
  } catch (err) {
    console.warn("[reviews] feed sync failed:", err);
  }
  try {
    await recomputeAggregateCache(db, row.subjectType, row.subjectId);
  } catch (err) {
    console.warn("[reviews] aggregate cache recompute failed:", err);
  }

  // Award the reviewer for posting a company review (new reviews only;
  // edits re-run upsert but don't re-earn). Deduped on review id in the
  // helper too. Fire-and-forget — never fails the write.
  if (subjectType === "company" && isNew) {
    const { withGamification } = await import("../domains/gamification/with-gamification.js");
    await withGamification(c, "company-review-posted", (game, role, uidEarner) =>
      game.onCompanyReviewPosted({ userId: uidEarner, role, reviewId: row.id }),
    );
  }

  return c.json(success({ review: rowToReview(row) }), 200);
}

// Pro gate is descriptor-driven (some types charge to write,
// others — marketplace transactional reviews — gate on buyer status
// instead). The descriptor decides; the handler runs the inline gate.
reviewRoutes.post("/:subjectType/:subjectId", async (c) => {
  const raw = c.req.param("subjectType");
  if (!isSubjectType(raw)) {
    return c.json(error("BAD_REQUEST", `Unknown subject type: ${raw}`), 400);
  }
  const descriptor = getSubjectDescriptor(raw);
  if (descriptor.requiresProToWrite) {
    const blocked = await proGate(c, `${descriptor.sectionTitle} for ${descriptor.noun}s`);
    if (blocked) return blocked;
  }
  return upsertHandler(c);
});

// ---------------------------------------------------------------------------
// Review-scoped routes  /api/reviews/:reviewId/...
// ---------------------------------------------------------------------------

reviewRoutes.put("/:reviewId", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const [existing] = await db
    .select()
    .from(reviews)
    .where(eq(reviews.id, c.req.param("reviewId")))
    .limit(1);
  if (!existing) return c.json(error("NOT_FOUND", "Review not found"), 404);
  if (existing.userId !== uid) {
    return c.json(error("FORBIDDEN", "You can only edit your own review"), 403);
  }

  if (!isSubjectType(existing.subjectType)) {
    return c.json(error("INTERNAL_ERROR", "Review has unknown subject type"), 500);
  }
  const descriptor = getSubjectDescriptor(existing.subjectType);

  if (descriptor.requiresProToWrite) {
    const blocked = await proGate(c, `${descriptor.sectionTitle} for ${descriptor.noun}s`);
    if (blocked) return blocked;
  }
  return editHandler(c, existing);
});

async function editHandler(c: any, existing: typeof reviews.$inferSelect): Promise<Response> {
  const descriptor = getSubjectDescriptor(existing.subjectType as SubjectType);
  const body = await c.req.json().catch(() => null);
  const validation = validatePayload(body, descriptor);
  if ("__validationError" in validation) {
    return c.json(error("BAD_REQUEST", "Invalid review payload", validation.__validationError), 400);
  }
  const v = validation;
  const db = getDb();
  const [row] = await db
    .update(reviews)
    .set({
      overallRating: v.overallRating,
      title: v.title,
      body: v.body,
      subRatings: v.subRatings,
      metadata: v.metadata,
      updatedAt: new Date(),
    } as any)
    .where(eq(reviews.id, existing.id))
    .returning();

  try {
    await syncFeedPostForReview(db, row);
  } catch (err) {
    console.warn("[reviews] feed sync failed:", err);
  }
  try {
    await recomputeAggregateCache(db, row.subjectType, row.subjectId);
  } catch (err) {
    console.warn("[reviews] aggregate cache recompute failed:", err);
  }

  return c.json(success({ review: rowToReview(row) }), 200);
}

reviewRoutes.delete("/:reviewId", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [existing] = await db
    .select({
      id: reviews.id,
      userId: reviews.userId,
      subjectType: reviews.subjectType,
      subjectId: reviews.subjectId,
    })
    .from(reviews)
    .where(eq(reviews.id, c.req.param("reviewId")))
    .limit(1);
  if (!existing) return c.json(error("NOT_FOUND", "Review not found"), 404);
  if (existing.userId !== uid) {
    return c.json(error("FORBIDDEN", "You can only delete your own review"), 403);
  }
  await db.delete(reviews).where(eq(reviews.id, existing.id));
  try {
    await deleteFeedPostForReview(db, existing.id);
  } catch (err) {
    console.warn("[reviews] feed teardown failed:", err);
  }
  try {
    await recomputeAggregateCache(db, existing.subjectType, existing.subjectId);
  } catch (err) {
    console.warn("[reviews] aggregate cache recompute failed:", err);
  }
  return c.json(success({ deleted: true }), 200);
});

// ---------------------------------------------------------------------------
// Threaded comments under a review
// ---------------------------------------------------------------------------

reviewRoutes.get("/:reviewId/comments", async (c) => {
  const db = getDb();
  const reviewId = c.req.param("reviewId");
  const rows = await db
    .select()
    .from(reviewComments)
    .where(and(eq(reviewComments.reviewId, reviewId), eq(reviewComments.status, "published")))
    .orderBy(asc(reviewComments.createdAt));
  return c.json(success({ items: rows.map(rowToComment) }), 200);
});

const CommentBodySchema = z.object({
  body: z.string().trim().min(1).max(4000),
  parentId: UuidLikeSchema.nullish(),
});

reviewRoutes.post("/:reviewId/comments", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);

  const db = getDb();
  const reviewId = c.req.param("reviewId");
  const [review] = await db
    .select()
    .from(reviews)
    .where(eq(reviews.id, reviewId))
    .limit(1);
  if (!review) return c.json(error("NOT_FOUND", "Review not found"), 404);

  const raw = await c.req.json().catch(() => null);
  const parsed = CommentBodySchema.safeParse(raw);
  if (!parsed.success) {
    return c.json(error("BAD_REQUEST", "Invalid comment", parsed.error.flatten()), 400);
  }

  // is_subject_owner = the commenter owns the underlying subject.
  // Lets the UI highlight "company says:" etc.
  let isSubjectOwner = false;
  if (isSubjectType(review.subjectType)) {
    const subject = await resolveSubject(db, review.subjectType, review.subjectId);
    isSubjectOwner = !!subject && subject.ownerId === uid;
  }

  // If parentId is provided, verify it belongs to the same review.
  if (parsed.data.parentId) {
    const [parent] = await db
      .select({ id: reviewComments.id, reviewId: reviewComments.reviewId })
      .from(reviewComments)
      .where(eq(reviewComments.id, parsed.data.parentId))
      .limit(1);
    if (!parent || parent.reviewId !== reviewId) {
      return c.json(error("BAD_REQUEST", "Parent comment doesn't belong to this review"), 400);
    }
  }

  const [row] = await db
    .insert(reviewComments)
    .values({
      reviewId,
      userId: uid,
      parentId: parsed.data.parentId ?? null,
      body: parsed.data.body,
      isSubjectOwner,
    } as any)
    .returning();

  return c.json(success({ comment: rowToComment(row) }), 201);
});

reviewRoutes.delete("/comments/:commentId", async (c) => {
  const uid = userId(c);
  if (!uid) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [existing] = await db
    .select({ id: reviewComments.id, userId: reviewComments.userId })
    .from(reviewComments)
    .where(eq(reviewComments.id, c.req.param("commentId")))
    .limit(1);
  if (!existing) return c.json(error("NOT_FOUND", "Comment not found"), 404);
  if (existing.userId !== uid) {
    return c.json(error("FORBIDDEN", "You can only delete your own comment"), 403);
  }
  await db.delete(reviewComments).where(eq(reviewComments.id, existing.id));
  return c.json(success({ deleted: true }), 200);
});

reviewRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Reviews endpoint not found" } }, 404),
);
