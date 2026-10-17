/**
 * Creator Program enrollment rows (`creator_profiles`) + the public
 * creator-discovery reads (browse list, public profile card, promo-project
 * reviews). Exactly one open row per user (`ended_at IS NULL`); cancelling
 * closes it and re-enrolling inserts a new one.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const { creatorProfiles, promoProjects, reviews, userProfiles, users } = schema;

export type CreatorProfileRow = typeof creatorProfiles.$inferSelect;
export type CreatorProfileInsert = typeof creatorProfiles.$inferInsert;
export type CreatorProfilePatch = Partial<CreatorProfileInsert>;

/** The caller's open enrollment row, or null. */
export async function findActiveEnrollment(db: Db, userId: string): Promise<CreatorProfileRow | null> {
  const [row] = await db
    .select()
    .from(creatorProfiles)
    .where(and(eq(creatorProfiles.userId, userId), sql`${creatorProfiles.endedAt} IS NULL`))
    .limit(1);
  return row ?? null;
}

export async function insertEnrollment(db: Db, values: CreatorProfileInsert): Promise<CreatorProfileRow> {
  const [created] = await db.insert(creatorProfiles).values(values).returning();
  return created;
}

export async function updateEnrollment(
  db: Db,
  rowId: string,
  patch: CreatorProfilePatch,
): Promise<CreatorProfileRow> {
  const [updated] = await db
    .update(creatorProfiles)
    .set(patch)
    .where(eq(creatorProfiles.id, rowId))
    .returning();
  return updated;
}

/** Mirror enrollment state onto `user_profiles.provides_services`. */
export async function setUserProvidesServices(db: Db, userId: string, providesServices: boolean, now: Date): Promise<void> {
  await db
    .update(userProfiles)
    .set({ providesServices, updatedAt: now })
    .where(eq(userProfiles.userId, userId));
}

/** Bump the open row's completed-projects counter after an accepted delivery. */
export async function incrementCompletedProjects(db: Db, creatorUserId: string, now: Date): Promise<void> {
  await db
    .update(creatorProfiles)
    .set({
      completedProjectsCount: sql`${creatorProfiles.completedProjectsCount} + 1`,
      updatedAt: now,
    })
    .where(and(eq(creatorProfiles.userId, creatorUserId), sql`${creatorProfiles.endedAt} IS NULL`));
}

/**
 * Active, email-verified creators (optionally in one marketplace category),
 * rating-sorted. The caller over-fetches and post-filters on paid visibility.
 */
export async function listBrowseCandidates(db: Db, opts: { category?: string; limit: number }) {
  const conds = [
    eq(creatorProfiles.isActive, true),
    sql`${creatorProfiles.endedAt} IS NULL`,
    // Hide unverified accounts — keeps spam signups out of the creator
    // marketplace until they prove ownership of the email address.
    eq(users.emailVerified, true),
  ];
  // Category filter on jsonb categories array
  if (opts.category) {
    conds.push(sql`${creatorProfiles.categories} ? ${opts.category}`);
  }
  return db
    .select({
      creator: creatorProfiles,
      user: { id: users.id, name: users.name },
      profile: { avatarUrl: userProfiles.avatarUrl, headline: userProfiles.headline },
    })
    .from(creatorProfiles)
    .innerJoin(users, eq(creatorProfiles.userId, users.id))
    .leftJoin(userProfiles, eq(creatorProfiles.userId, userProfiles.userId))
    .where(and(...conds))
    .orderBy(desc(creatorProfiles.averageRating), desc(creatorProfiles.completedProjectsCount))
    .limit(opts.limit);
}

/** The user's open AND active enrollment row (public-profile gate). */
export async function findActivePublicCreator(db: Db, userId: string): Promise<CreatorProfileRow | null> {
  const [row] = await db
    .select()
    .from(creatorProfiles)
    .where(and(
      eq(creatorProfiles.userId, userId),
      eq(creatorProfiles.isActive, true),
      sql`${creatorProfiles.endedAt} IS NULL`,
    ))
    .limit(1);
  return row ?? null;
}

/**
 * Published reviews of any of this creator's promo projects. The polymorphic
 * `reviews` table is keyed on (subject_type, subject_id) — for promo_project
 * rows the subject_id is the project, so we join back through promo_projects
 * to filter by creator.
 */
export async function listPublishedPromoReviews(db: Db, creatorUserId: string, limit: number) {
  return db
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
        eq(promoProjects.creatorId, creatorUserId),
      ),
    )
    .orderBy(desc(reviews.createdAt))
    .limit(limit);
}

/** Avatar + headline for the public creator card. */
export async function findProfileCard(db: Db, userId: string) {
  return db
    .select({ avatarUrl: userProfiles.avatarUrl, headline: userProfiles.headline })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
}
