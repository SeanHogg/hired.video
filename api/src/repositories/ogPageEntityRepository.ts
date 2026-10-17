/**
 * OG / crawler-meta reads for page entities (companies, articles, people,
 * jobs, courses, events). Consumed only by services/og. Visibility filters
 * that decide indexability live in the WHERE clauses here so a private row
 * is never loaded onto the crawler path.
 */
import { and, eq, inArray } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";
import { isUuid } from "../../../shared/value-types.js";

const { users, companyProfiles, userProfiles, articles, jobItems, courses, scheduledEvents } = schema;

/** Resolve a `/<userRef>/…` path segment (UUID or customUrlSlug) to a userId. */
export async function resolveOgAuthorUserId(db: Db, userRef: string): Promise<string | null> {
  if (isUuid(userRef)) return userRef;
  const [p] = await db
    .select({ userId: userProfiles.userId })
    .from(userProfiles)
    .where(eq(userProfiles.customUrlSlug, userRef))
    .limit(1);
  return p?.userId ?? null;
}

/** Company profile by UUID or slug, incl. the cached review aggregate. */
export async function findOgCompany(db: Db, idOrSlug: string) {
  const [row] = await db
    .select({
      id: companyProfiles.id,
      name: companyProfiles.name,
      tagline: companyProfiles.tagline,
      description: companyProfiles.description,
      website: companyProfiles.website,
      logoUrl: companyProfiles.logoUrl,
      headquarters: companyProfiles.headquarters,
      reviewCount: companyProfiles.reviewCount,
      reviewAvg: companyProfiles.reviewAvgOverall,
    })
    .from(companyProfiles)
    .where(isUuid(idOrSlug) ? eq(companyProfiles.id, idOrSlug) : eq(companyProfiles.slug, idOrSlug))
    .limit(1);
  return row ?? null;
}
export type OgCompanyRow = Awaited<ReturnType<typeof findOgCompany>>;

/** Published article (verified author) by author userId + slug. */
export async function findOgPublishedArticle(db: Db, authorUserId: string, slug: string) {
  const [row] = await db
    .select({
      title: articles.title,
      summary: articles.summary,
      coverImageUrl: articles.coverImageUrl,
      category: articles.category,
      tags: articles.tags,
      publishedAt: articles.publishedAt,
      updatedAt: articles.updatedAt,
      authorName: users.name,
      authorSlug: userProfiles.customUrlSlug,
      authorId: users.id,
    })
    .from(articles)
    .innerJoin(users, eq(articles.userId, users.id))
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(and(
      eq(articles.userId, authorUserId),
      eq(articles.slug, slug),
      eq(articles.status, "published"),
      eq(users.emailVerified, true),
    ))
    .limit(1);
  return row ?? null;
}
export type OgArticleRow = Awaited<ReturnType<typeof findOgPublishedArticle>>;

/** Email-verified user + profile by UUID or customUrlSlug. */
export async function findOgPerson(db: Db, userRef: string) {
  const [row] = await db
    .select({
      name: users.name,
      headline: userProfiles.headline,
      avatarUrl: userProfiles.avatarUrl,
      slug: userProfiles.customUrlSlug,
      visibility: userProfiles.profileVisibility,
    })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(and(
      isUuid(userRef) ? eq(users.id, userRef) : eq(userProfiles.customUrlSlug, userRef),
      eq(users.emailVerified, true),
    ))
    .limit(1);
  return row ?? null;
}
export type OgPersonRow = Awaited<ReturnType<typeof findOgPerson>>;

/** Job posting by UUID joined to its company profile. */
export async function findOgJob(db: Db, id: string) {
  const [row] = await db
    .select({
      title: jobItems.title,
      description: jobItems.description,
      company: jobItems.company,
      location: jobItems.location,
      jobType: jobItems.jobType,
      salaryMin: jobItems.salaryMin,
      salaryMax: jobItems.salaryMax,
      salaryCurrency: jobItems.salaryCurrency,
      skillsRequired: jobItems.skillsRequired,
      isRemote: jobItems.isRemote,
      isActive: jobItems.isActive,
      expiresAt: jobItems.expiresAt,
      createdAt: jobItems.createdAt,
      heroImageUrl: jobItems.heroImageUrl,
      companyName: companyProfiles.name,
      companyLogo: companyProfiles.logoUrl,
      companyWebsite: companyProfiles.website,
    })
    .from(jobItems)
    .leftJoin(companyProfiles, eq(companyProfiles.id, jobItems.companyId))
    .where(eq(jobItems.id, id))
    .limit(1);
  return row ?? null;
}
export type OgJobRow = Awaited<ReturnType<typeof findOgJob>>;

/** Published course (verified author) by author userId + slug. */
export async function findOgPublishedCourse(db: Db, authorUserId: string, slug: string) {
  const [row] = await db
    .select({
      title: courses.title,
      summary: courses.summary,
      description: courses.description,
      coverImageUrl: courses.coverImageUrl,
      category: courses.category,
      authorName: users.name,
      authorSlug: userProfiles.customUrlSlug,
      authorId: users.id,
    })
    .from(courses)
    .innerJoin(users, eq(courses.userId, users.id))
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(and(
      eq(courses.userId, authorUserId),
      eq(courses.slug, slug),
      eq(courses.status, "published"),
      eq(users.emailVerified, true),
    ))
    .limit(1);
  return row ?? null;
}
export type OgCourseRow = Awaited<ReturnType<typeof findOgPublishedCourse>>;

/** PUBLIC event/coffee by UUID or slug (unlisted/private never resolve). */
export async function findOgPublicEvent(db: Db, idOrSlug: string) {
  const [row] = await db
    .select({
      id: scheduledEvents.id,
      title: scheduledEvents.title,
      description: scheduledEvents.description,
      startAt: scheduledEvents.startAt,
      endAt: scheduledEvents.endAt,
      location: scheduledEvents.location,
      meetingUrl: scheduledEvents.meetingUrl,
      eventFormat: scheduledEvents.eventFormat,
      coverImageUrl: scheduledEvents.coverImageUrl,
      slug: scheduledEvents.slug,
      status: scheduledEvents.status,
      hostName: users.name,
    })
    .from(scheduledEvents)
    .leftJoin(users, eq(users.id, scheduledEvents.hostUserId))
    .where(and(
      isUuid(idOrSlug) ? eq(scheduledEvents.id, idOrSlug) : eq(scheduledEvents.slug, idOrSlug),
      eq(scheduledEvents.visibility, "public"),
      inArray(scheduledEvents.type, ["event", "coffee"]),
    ))
    .limit(1);
  return row ?? null;
}
export type OgEventRow = Awaited<ReturnType<typeof findOgPublicEvent>>;
