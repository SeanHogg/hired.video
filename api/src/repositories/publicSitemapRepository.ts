/**
 * PublicSitemapRepository — the Drizzle reads behind GET /sitemap.xml: one
 * method per crawlable public kind, each applying that kind's public gate
 * (status / visibility, and `emailVerified` on user-authored content so
 * unverified spam signups stay out of search indexes), newest-first and
 * capped. No rendering — services/seo/sitemap.ts builds the XML.
 */
import { and, desc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import { publicStudioProjectWhere } from "./studioPublicEngagementRepository.js";

const {
  jobItems,
  companyProfiles,
  userProfiles,
  users,
  studioTemplates,
  studioProjects,
  articles,
  courses,
  scheduledEvents,
} = schema;

/** Active jobs. */
export function listSitemapJobs(limit: number) {
  return getDb()
    .select({ id: jobItems.id, title: jobItems.title, updatedAt: jobItems.updatedAt })
    .from(jobItems)
    .where(eq((jobItems as any).status, "active"))
    .orderBy(desc(jobItems.updatedAt))
    .limit(limit);
}

/** Company pages (+ review count, for the reviews sub-page). */
export function listSitemapCompanies(limit: number) {
  return getDb()
    .select({
      id: companyProfiles.id,
      slug: companyProfiles.slug,
      updatedAt: companyProfiles.updatedAt,
      reviewCount: (companyProfiles as any).reviewCount ?? null,
    })
    .from(companyProfiles)
    .orderBy(desc(companyProfiles.updatedAt))
    .limit(limit);
}

/** Public profiles of verified users. */
export function listSitemapProfiles(limit: number) {
  return getDb()
    .select({ id: userProfiles.userId, slug: userProfiles.customUrlSlug, updatedAt: userProfiles.updatedAt })
    .from(userProfiles)
    .innerJoin(users, eq(users.id, userProfiles.userId))
    .where(and(eq(userProfiles.profileVisibility, "public"), eq(users.emailVerified, true)))
    .orderBy(desc(userProfiles.updatedAt))
    .limit(limit);
}

/** Creator-published (public, slugged) marketplace templates. */
export function listSitemapCreatorTemplates(limit: number) {
  return getDb()
    .select({ slug: studioTemplates.listingSlug, updatedAt: studioTemplates.updatedAt })
    .from(studioTemplates)
    .where(and(eq(studioTemplates.visibility, "public"), isNotNull(studioTemplates.listingSlug)))
    .orderBy(desc(studioTemplates.updatedAt))
    .limit(limit);
}

/** Public studio projects (every mediaKind) by verified owners. */
export function listSitemapStudioProjects(limit: number) {
  return getDb()
    .select({
      id: studioProjects.id,
      storyboard: studioProjects.storyboard,
      name: studioProjects.name,
      mediaKind: studioProjects.mediaKind,
      ownerName: users.name,
      updatedAt: studioProjects.updatedAt,
    })
    .from(studioProjects)
    .innerJoin(users, eq(users.id, studioProjects.userId))
    .where(and(publicStudioProjectWhere(), eq(users.emailVerified, true)))
    .orderBy(desc(studioProjects.updatedAt))
    .limit(limit);
}

/** Published articles by verified authors (authorSlug = customUrlSlug ?? userId). */
export function listSitemapArticles(limit: number) {
  return getDb()
    .select({
      slug: articles.slug,
      title: articles.title,
      userId: articles.userId,
      authorSlug: userProfiles.customUrlSlug,
      updatedAt: articles.updatedAt,
    })
    .from(articles)
    .innerJoin(users, eq(users.id, articles.userId))
    .leftJoin(userProfiles, eq(userProfiles.userId, articles.userId))
    .where(and(eq(articles.status, "published"), eq(users.emailVerified, true)))
    .orderBy(desc(articles.updatedAt))
    .limit(limit);
}

/** Published courses by verified authors. */
export function listSitemapCourses(limit: number) {
  return getDb()
    .select({
      slug: courses.slug,
      userId: courses.userId,
      authorSlug: userProfiles.customUrlSlug,
      updatedAt: courses.updatedAt,
    })
    .from(courses)
    .innerJoin(users, eq(users.id, courses.userId))
    .leftJoin(userProfiles, eq(userProfiles.userId, courses.userId))
    .where(and(eq(courses.status, "published"), eq(users.emailVerified, true)))
    .orderBy(desc(courses.updatedAt))
    .limit(limit);
}

/** Public, non-cancelled networking events. */
export function listSitemapEvents(limit: number) {
  return getDb()
    .select({ id: scheduledEvents.id, slug: scheduledEvents.slug, updatedAt: scheduledEvents.updatedAt })
    .from(scheduledEvents)
    .where(
      and(
        eq(scheduledEvents.visibility, "public"),
        inArray(scheduledEvents.type, ["event", "coffee"]),
        ne(scheduledEvents.status, "cancelled"),
      ),
    )
    .orderBy(desc(scheduledEvents.updatedAt))
    .limit(limit);
}
