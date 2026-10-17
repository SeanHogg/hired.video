/**
 * Course owner use cases (POST/GET/PATCH/DELETE /api/courses, publish,
 * unpublish, clone) plus the #1502 review workflow (submit-for-review,
 * reviewer queue). Throws DomainError on rule violations; returns rows.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { slugify } from "../../../../shared/slugify.js";
import { bumpSearchVersion } from "../../utils/search-cache.js";
import {
  countCourseLessons,
  courseSlugTaken,
  deleteCourseById,
  findCourseById,
  findCourseScoped,
  insertCourse,
  listCoursesByOwner,
  listCoursesInReview,
  updateCourseById,
  type CourseRow,
} from "../../repositories/coursesRepository.js";
import { listCourseLessons, listCourseModules } from "../../repositories/courseContentRepository.js";
import { cloneCourseModulesAndLessons, pickFreeCourseSlug } from "../../repositories/courseCloneRepository.js";
import { assertCanEditCourse, resolveCourseAuthorEligibility, type CourseActor } from "./courseAccess.js";

/** Fields the create body carries (validated by the route's zod schema). */
export interface CreateCourseInput {
  title: string;
  summary?: string;
  description?: string;
  coverImageUrl?: string;
  category?: string;
  tags?: string[];
  difficulty?: string;
  estimatedMinutes?: number;
  learningOutcomes?: string[];
  requirements?: string[];
  priceCents?: number;
  priceVisible?: boolean;
  issuesCertificate?: boolean;
  passingScorePct?: number;
}

/** PATCH-able course columns (whitelist — anything else in the body is ignored). */
const UPDATABLE_COURSE_FIELDS = [
  "title", "summary", "description", "coverImageUrl", "category", "tags",
  "difficulty", "estimatedMinutes", "learningOutcomes", "requirements",
  "priceCents", "priceVisible",
  "issuesCertificate", "passingScorePct", "slug", "assignedReviewerId",
  "themeId", "themeTokens",
] as const;

/** Copy the whitelisted keys present on `input` onto a patch with `updatedAt`. */
export function pickPatch(input: object, keys: readonly string[]): Record<string, unknown> {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  const source = input as Record<string, unknown>;
  for (const k of keys) {
    if (k in source) patch[k] = source[k];
  }
  return patch;
}

/** Unique slug per author: base, base-2 … base-50, then a timestamp suffix. */
async function nextFreeSlug(db: ReturnType<typeof getDb>, userId: string, title: string): Promise<string> {
  const baseSlug = slugify(title, { fallback: () => `course-${Date.now()}` });
  let slug = baseSlug;
  let n = 1;
  while (await courseSlugTaken(db, userId, slug)) {
    n += 1;
    slug = `${baseSlug}-${n}`;
    if (n > 50) { slug = `${baseSlug}-${Date.now()}`; break; }
  }
  return slug;
}

export async function createCourse(actor: CourseActor, input: CreateCourseInput): Promise<CourseRow | undefined> {
  const db = getDb();
  const eligibility = await resolveCourseAuthorEligibility(db, actor);
  if (!eligibility.ok) {
    throw new DomainError(
      403,
      "AUTHORING_NOT_ELIGIBLE",
      "Authoring courses requires the Courses Creator Program (creators) or the employer role. Visit /services to enroll.",
    );
  }
  const slug = await nextFreeSlug(db, actor.userId, input.title);
  return insertCourse(db, {
    userId: actor.userId,
    slug,
    title: input.title,
    summary: input.summary ?? null,
    description: input.description ?? null,
    coverImageUrl: input.coverImageUrl ?? null,
    category: input.category ?? null,
    tags: input.tags ?? [],
    difficulty: input.difficulty ?? null,
    estimatedMinutes: input.estimatedMinutes ?? null,
    learningOutcomes: input.learningOutcomes ?? [],
    requirements: input.requirements ?? [],
    priceCents: input.priceCents ?? 0,
    priceVisible: input.priceVisible ?? true,
    issuesCertificate: input.issuesCertificate ?? false,
    passingScorePct: input.passingScorePct ?? null,
    isEmployerAuthored: eligibility.isEmployerAuthored,
    status: "draft",
  });
}

export function listMyCourses(userId: string): Promise<CourseRow[]> {
  return listCoursesByOwner(getDb(), userId);
}

/** #1502 — in_review courses assigned to the caller; SuperAdmin sees all. */
export function listReviewQueue(actor: CourseActor): Promise<CourseRow[]> {
  return listCoursesInReview(getDb(), actor.isSuperAdmin ? null : actor.userId);
}

/** Owner (or SuperAdmin, any course — #1521) editor fetch, any status. */
export async function getCourseForEditor(actor: CourseActor, courseId: string) {
  const db = getDb();
  const course = await findCourseScoped(db, courseId, actor.isSuperAdmin ? null : actor.userId);
  if (!course) throw new DomainError(404, "NOT_FOUND", "Course not found");
  const modules = await listCourseModules(db, course.id);
  const lessons = await listCourseLessons(db, course.id);
  return { course, modules, lessons };
}

export async function updateCourse(actor: CourseActor, courseId: string, input: object) {
  const db = getDb();
  await assertCanEditCourse(db, actor, courseId);
  const updated = await updateCourseById(db, courseId, pickPatch(input, UPDATABLE_COURSE_FIELDS));
  // Title/summary edits surface in unified search for published courses.
  bumpSearchVersion();
  return updated;
}

/** Flip to published. `firstPublish` is true only when the course was never
 *  published before — the caller awards COURSE_PUBLISHED on that edge. */
export async function publishCourse(actor: CourseActor, courseId: string) {
  const db = getDb();
  const eligibility = await resolveCourseAuthorEligibility(db, actor);
  if (!eligibility.ok) {
    throw new DomainError(403, "AUTHORING_NOT_ELIGIBLE", "Re-enable the Courses Creator Program at /services to publish (or hold the employer role).");
  }
  await assertCanEditCourse(db, actor, courseId);
  const existing = await findCourseById(db, courseId);
  if (!existing) throw new DomainError(404, "NOT_FOUND", "Course not found");
  if ((await countCourseLessons(db, existing.id)) === 0) {
    throw new DomainError(400, "VALIDATION_ERROR", "Add at least one lesson before publishing.");
  }
  const firstPublish = existing.publishedAt == null;
  const updated = await updateCourseById(db, existing.id, {
    status: "published",
    publishedAt: new Date(),
    updatedAt: new Date(),
  });
  bumpSearchVersion();
  return { course: updated, previous: existing, firstPublish };
}

export async function unpublishCourse(actor: CourseActor, courseId: string) {
  const db = getDb();
  await assertCanEditCourse(db, actor, courseId);
  const updated = await updateCourseById(db, courseId, { status: "draft", publishedAt: null, updatedAt: new Date() });
  if (!updated) throw new DomainError(404, "NOT_FOUND", "Course not found");
  bumpSearchVersion();
  return updated;
}

/** Authorisation half of submit-for-review — runs before body validation. */
export async function ensureCourseEditable(actor: CourseActor, courseId: string): Promise<void> {
  await assertCanEditCourse(getDb(), actor, courseId);
}

/** #1502 — flip to in_review and (optionally) record the assigned reviewer. */
export async function submitCourseForReview(
  courseId: string,
  input: { assignedReviewerId?: string | null },
) {
  const patch: Record<string, unknown> = { status: "in_review", updatedAt: new Date() };
  if ("assignedReviewerId" in input) {
    patch.assignedReviewerId = input.assignedReviewerId ?? null;
  }
  const updated = await updateCourseById(getDb(), courseId, patch);
  if (!updated) throw new DomainError(404, "NOT_FOUND", "Course not found");
  return updated;
}

export async function deleteCourse(actor: CourseActor, courseId: string): Promise<string> {
  const db = getDb();
  await assertCanEditCourse(db, actor, courseId);
  const deleted = await deleteCourseById(db, courseId);
  if (!deleted) throw new DomainError(404, "NOT_FOUND", "Course not found");
  bumpSearchVersion();
  return deleted;
}

/** Deep-clone a course (modules + lessons) under the caller. SuperAdmin may
 *  clone any course; others only their own. Clone resets to draft. */
export async function cloneCourse(actor: CourseActor, courseId: string) {
  const db = getDb();
  const original = await findCourseScoped(db, courseId, actor.isSuperAdmin ? null : actor.userId);
  if (!original) throw new DomainError(404, "NOT_FOUND", "Course not found");

  const baseSlug = slugify(`${original.title}-copy`, {
    fallback: () => `course-${crypto.randomUUID().slice(0, 8)}`,
    maxLen: 50,
  });
  const candidateSlug = await pickFreeCourseSlug(db, actor.userId, baseSlug);

  const {
    id: _omitId, createdAt: _omitCreated, updatedAt: _omitUpdated,
    publishedAt: _omitPublished, enrollmentCount: _omitEnroll,
    completionCount: _omitComplete, averageRating: _omitRating,
    ratingCount: _omitRatingCount,
    ...rest
  } = original;
  const clone = await insertCourse(db, {
    ...rest,
    userId: actor.userId,
    title: `${original.title} (Copy)`,
    slug: candidateSlug,
    status: "draft",
  });

  // Module ids change; the repo remaps lesson FKs in memory.
  await cloneCourseModulesAndLessons(db, original.id, clone!.id);
  return { id: clone!.id, slug: candidateSlug };
}
