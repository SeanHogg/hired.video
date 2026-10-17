/**
 * Public course reads (GET /api/courses/public*): marketplace feed,
 * per-author listing, and the public course detail page. Free creators'
 * courses are hidden (#314 paywall).
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import {
  findPublishedCourseByAuthorSlug,
  listPublicLessonOutline,
  listPublishedCoursesWithAuthors,
  type PublishedCourseWithAuthor,
} from "../../repositories/coursePublicRepository.js";
import { listCourseModules } from "../../repositories/courseContentRepository.js";
import { resolveUserRef } from "../user/resolveUserRef.js";
import { filterVisibleCreators, isCreatorVisible } from "../creators/visibility.js";

/** Marketplace card shape shared by the feed + per-author listing. */
function toPublicCourseCard(r: PublishedCourseWithAuthor) {
  return {
    id: r.course.id,
    type: "course" as const,
    title: r.course.title,
    slug: r.course.slug,
    summary: r.course.summary,
    coverImageUrl: r.course.coverImageUrl,
    category: r.course.category,
    tags: r.course.tags,
    difficulty: r.course.difficulty,
    estimatedMinutes: r.course.estimatedMinutes,
    priceCents: r.course.priceVisible ? r.course.priceCents : null,
    issuesCertificate: r.course.issuesCertificate,
    enrollmentCount: r.course.enrollmentCount,
    averageRating: r.course.averageRating,
    ratingCount: r.course.ratingCount,
    publishedAt: r.course.publishedAt,
    author: {
      id: r.author.id,
      name: r.author.name,
      avatarUrl: r.authorProfile?.avatarUrl ?? null,
      slug: r.authorProfile?.customUrlSlug ?? r.author.id,
    },
  };
}

/** Published-course feed. Degrades to [] if the courses tables aren't
 *  applied to this environment's DB yet (migrations 0041/0042). */
export async function listPublicCourses(limit: number): Promise<unknown[]> {
  const db = getDb();
  try {
    const rows = await listPublishedCoursesWithAuthors(db, { limit });
    const visible = await filterVisibleCreators(rows.map((r) => r.author.id));
    return rows.filter((r) => visible.has(r.author.id)).map(toPublicCourseCard);
  } catch {
    return [];
  }
}

/** Every published course by one author; hidden / unverified authors get []
 *  (not 404) so the profile tab renders a clean empty state. */
export async function listPublicCoursesByAuthor(authorId: string, limit: number): Promise<unknown[]> {
  const db = getDb();
  if (!(await isCreatorVisible(authorId))) return [];
  try {
    const rows = await listPublishedCoursesWithAuthors(db, { limit, authorId });
    return rows.map(toPublicCourseCard);
  } catch {
    return [];
  }
}

/** Public course detail. `userIdOrSlug` is a UUID or a customUrlSlug. */
export async function getPublicCourseDetail(userIdOrSlug: string, slug: string) {
  const db = getDb();
  const authorUserId = await resolveUserRef(db, userIdOrSlug);
  if (!authorUserId) throw new DomainError(404, "NOT_FOUND", "Course not found");
  const row = await findPublishedCourseByAuthorSlug(db, authorUserId, slug);
  if (!row) throw new DomainError(404, "NOT_FOUND", "Course not found");
  if (!(await isCreatorVisible(row.author.id))) {
    throw new DomainError(404, "NOT_FOUND", "Course not found");
  }

  const modules = await listCourseModules(db, row.course.id);
  const lessons = await listPublicLessonOutline(db, row.course.id);

  return {
    course: {
      id: row.course.id,
      title: row.course.title,
      slug: row.course.slug,
      summary: row.course.summary,
      description: row.course.description,
      coverImageUrl: row.course.coverImageUrl,
      category: row.course.category,
      tags: row.course.tags,
      difficulty: row.course.difficulty,
      estimatedMinutes: row.course.estimatedMinutes,
      learningOutcomes: row.course.learningOutcomes ?? [],
      requirements: row.course.requirements ?? [],
      priceCents: row.course.priceVisible ? row.course.priceCents : null,
      issuesCertificate: row.course.issuesCertificate,
      passingScorePct: row.course.passingScorePct,
      enrollmentCount: row.course.enrollmentCount,
      completionCount: row.course.completionCount,
      averageRating: row.course.averageRating,
      ratingCount: row.course.ratingCount,
      publishedAt: row.course.publishedAt,
      author: {
        id: row.author.id,
        name: row.author.name,
        avatarUrl: row.authorProfile?.avatarUrl ?? null,
        slug: row.authorProfile?.customUrlSlug ?? row.author.id,
        headline: row.authorProfile?.headline ?? null,
        bio: row.authorProfile?.summary ?? null,
      },
    },
    modules,
    lessons,
  };
}
