/**
 * Learning-path use cases (authoring, public reads, learner enrollment and
 * progress) behind /api/learning/paths. Owner operations are scoped to the
 * signed-in user; a path the caller doesn't own resolves to `null`.
 *
 * Publishing is a status change on the path (`PATCH { status }`): moving to
 * "published" requires at least one attached course and stamps publishedAt;
 * moving back to "draft" clears it.
 */
import { getDb } from "../../db/index.js";
import type { LearningPath } from "../../db/schema/learning.js";
import { slugify } from "../../../../shared/slugify.js";
import * as repo from "../../repositories/learningPathsRepository.js";
import { LearningPathService } from "./learning-path-service.js";
import { resolveAuthorEligibility } from "./author-eligibility.js";

export const PATH_STATUSES = ["draft", "published"] as const;
export type PathStatus = (typeof PATH_STATUSES)[number];

const EDITABLE_FIELDS = [
  "title", "summary", "description", "coverImageUrl", "category", "tags",
  "difficulty", "issuesCertificate", "slug",
] as const;

export interface CreatePathInput {
  title: string;
  summary?: string;
  description?: string;
  coverImageUrl?: string;
  category?: string;
  tags?: string[];
  difficulty?: "beginner" | "intermediate" | "advanced";
  issuesCertificate?: boolean;
}

export type UpdatePathInput = Partial<CreatePathInput> & { slug?: string; status?: PathStatus };

// ── Public ───────────────────────────────────────────────────────────────────

export async function listPublicPaths(limit: number): Promise<LearningPath[]> {
  try {
    return await repo.listPublishedPaths(getDb(), limit);
  } catch {
    return [];
  }
}

export async function getPublicPath(id: string) {
  const db = getDb();
  const path = await repo.findPublishedPath(db, id);
  if (!path) return null;
  const slots = await repo.listSlotsWithCourses(db, path.id);
  return {
    path,
    courses: slots.map((s) => ({
      slot: s.slot,
      course: {
        id: s.course.id,
        title: s.course.title,
        slug: s.course.slug,
        summary: s.course.summary,
        coverImageUrl: s.course.coverImageUrl,
        estimatedMinutes: s.course.estimatedMinutes,
        difficulty: s.course.difficulty,
        priceCents: s.course.priceVisible ? s.course.priceCents : null,
        issuesCertificate: s.course.issuesCertificate,
      },
    })),
  };
}

// ── Owner ────────────────────────────────────────────────────────────────────

/** Create a draft path. `null` when the user isn't eligible to author. */
export async function createPath(userId: string, roles: string[], input: CreatePathInput): Promise<LearningPath | null> {
  const db = getDb();
  const eligibility = await resolveAuthorEligibility(db, userId, roles);
  if (!eligibility.ok) return null;

  const baseSlug = slugify(input.title, { fallback: () => `path-${Date.now()}` });
  let slug = baseSlug;
  for (let n = 1; n <= 50; n++) {
    if (!(await repo.ownerSlugExists(db, userId, slug))) break;
    slug = `${baseSlug}-${n + 1}`;
  }

  return repo.insertPath(db, {
    userId,
    slug,
    title: input.title,
    summary: input.summary ?? null,
    description: input.description ?? null,
    coverImageUrl: input.coverImageUrl ?? null,
    category: input.category ?? null,
    tags: input.tags ?? [],
    difficulty: input.difficulty ?? null,
    issuesCertificate: input.issuesCertificate ?? false,
    isEmployerAuthored: eligibility.isEmployerAuthored,
    status: "draft",
  });
}

export function listMyPaths(userId: string): Promise<LearningPath[]> {
  return repo.listPathsByOwner(getDb(), userId);
}

export async function getMyPath(userId: string, id: string) {
  const db = getDb();
  const path = await repo.findOwnedPath(db, userId, id);
  if (!path) return null;
  const courses = await repo.listSlotsWithCourses(db, id);
  return { path, courses };
}

export type UpdatePathResult =
  | { kind: "not_found" }
  | { kind: "no_courses" }
  | { kind: "updated"; path: LearningPath };

/** Edit fields and/or change publish status in one write. */
export async function updatePath(userId: string, id: string, input: UpdatePathInput): Promise<UpdatePathResult> {
  const db = getDb();
  const now = new Date();
  const patch: Record<string, unknown> = { updatedAt: now };
  for (const k of EDITABLE_FIELDS) {
    if (k in input) patch[k] = input[k];
  }

  if (input.status === "published") {
    const existing = await repo.findOwnedPath(db, userId, id);
    if (!existing) return { kind: "not_found" };
    if ((await repo.countSlots(db, id)) === 0) return { kind: "no_courses" };
    patch.status = "published";
    patch.publishedAt = now;
  } else if (input.status === "draft") {
    patch.status = "draft";
    patch.publishedAt = null;
  }

  const updated = await repo.updateOwnedPath(db, userId, id, patch);
  return updated ? { kind: "updated", path: updated } : { kind: "not_found" };
}

export function deletePath(userId: string, id: string): Promise<string | null> {
  return repo.deleteOwnedPath(getDb(), userId, id);
}

// ── Path → courses ───────────────────────────────────────────────────────────

export type SlotResult<T> = { kind: "path_not_found" } | { kind: "slot_not_found" } | { kind: "conflict" } | { kind: "ok"; value: T };

export async function attachCourse(
  userId: string,
  pathId: string,
  input: { courseId: string; displayOrder?: number; isRequired?: boolean },
): Promise<SlotResult<unknown>> {
  const db = getDb();
  if (!(await repo.findOwnedPath(db, userId, pathId))) return { kind: "path_not_found" };
  const created = await repo.insertSlot(db, {
    pathId,
    courseId: input.courseId,
    displayOrder: input.displayOrder ?? 0,
    isRequired: input.isRequired ?? true,
  });
  return created ? { kind: "ok", value: created } : { kind: "conflict" };
}

export async function updateCourseSlot(
  userId: string,
  pathId: string,
  courseId: string,
  patch: { displayOrder?: number; isRequired?: boolean },
): Promise<SlotResult<unknown>> {
  const db = getDb();
  if (!(await repo.findOwnedPath(db, userId, pathId))) return { kind: "path_not_found" };
  const updated = await repo.updateSlot(db, pathId, courseId, patch);
  return updated ? { kind: "ok", value: updated } : { kind: "slot_not_found" };
}

export async function detachCourse(userId: string, pathId: string, courseId: string): Promise<SlotResult<string>> {
  const db = getDb();
  if (!(await repo.findOwnedPath(db, userId, pathId))) return { kind: "path_not_found" };
  const deleted = await repo.deleteSlot(db, pathId, courseId);
  return deleted ? { kind: "ok", value: deleted } : { kind: "slot_not_found" };
}

// ── Learner ──────────────────────────────────────────────────────────────────

export function listMyPathEnrollments(userId: string) {
  return repo.listEnrollmentsWithPaths(getDb(), userId);
}

/** Enroll in a published path. Idempotent: an existing enrollment is returned
 *  with `created: false`. `null` when the path isn't published. */
export async function enrollInPath(userId: string, pathId: string) {
  const db = getDb();
  if (!(await repo.findPublishedPath(db, pathId))) return null;
  const existing = await repo.findEnrollment(db, userId, pathId);
  if (existing) return { enrollment: existing, created: false };
  const enrollment = await repo.insertEnrollment(db, userId, pathId);
  await repo.bumpPathEnrollmentCount(db, pathId).catch(() => undefined);
  return { enrollment, created: true };
}

export async function getPathProgress(userId: string, pathId: string) {
  const db = getDb();
  const courseIds = await repo.listSlotCourseIds(db, pathId);
  if (courseIds.length === 0) return { unlocked: [], passed: [], locked: [], complete: false };
  const service = new LearningPathService(db);
  const [unlockState, completion] = await Promise.all([
    service.computeUnlockState(userId, courseIds),
    service.isPathComplete(userId, pathId),
  ]);
  return {
    unlocked: [...unlockState.unlocked],
    passed: [...unlockState.passed],
    locked: [...unlockState.locked.entries()].map(([cid, missing]) => ({ courseId: cid, missing })),
    complete: completion.complete,
  };
}
