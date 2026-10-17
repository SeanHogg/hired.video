/**
 * Course module + lesson authoring use cases (owner OR SuperAdmin, gated
 * through the parent course). Lesson delete also cleans the SCORM
 * package's R2 prefix (#1440).
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import {
  deleteLessonById,
  deleteModuleById,
  findLessonCourseId,
  findLessonForDelete,
  findModuleCourseId,
  insertLesson,
  insertModule,
  updateLessonById,
  updateModuleById,
} from "../../repositories/courseContentRepository.js";
import { getVideoBucket } from "../storage/object-store.js";
import { assertCanEditCourse, canEditCourse, type CourseActor } from "./courseAccess.js";
import { pickPatch } from "./courseAuthoringService.js";

const UPDATABLE_MODULE_FIELDS = ["title", "summary", "sortOrder"] as const;

const UPDATABLE_LESSON_FIELDS = [
  "title", "summary", "moduleId", "sourceType", "studioProjectId",
  "scormManifestUrl", "scormEntryUrl", "scormVersion", "scormPkgId", "externalUrl",
  "bodyMd", "bodyJson", "estimatedMinutes", "isRequired", "knowledgeCheckFormId", "sortOrder",
] as const;

export interface CreateModuleInput {
  title: string;
  summary?: string;
  sortOrder?: number;
}

export interface CreateLessonInput {
  title: string;
  summary?: string;
  moduleId?: string;
  sourceType: string;
  studioProjectId?: string;
  scormManifestUrl?: string;
  scormEntryUrl?: string;
  scormVersion?: string;
  scormPkgId?: string;
  externalUrl?: string;
  bodyMd?: string;
  bodyJson?: unknown;
  estimatedMinutes?: number;
  isRequired?: boolean;
  knowledgeCheckFormId?: string;
  sortOrder?: number;
}

// ---------------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------------

export async function addModule(actor: CourseActor, courseId: string, input: CreateModuleInput) {
  const db = getDb();
  await assertCanEditCourse(db, actor, courseId);
  return insertModule(db, {
    courseId,
    title: input.title,
    summary: input.summary ?? null,
    sortOrder: input.sortOrder ?? 0,
  });
}

/** Authorise a module edit via its parent course; 404 "Module not found" otherwise. */
async function assertCanEditModule(db: ReturnType<typeof getDb>, actor: CourseActor, moduleId: string) {
  const courseId = await findModuleCourseId(db, moduleId);
  if (!courseId || !(await canEditCourse(db, actor, courseId))) {
    throw new DomainError(404, "NOT_FOUND", "Module not found");
  }
}

export async function updateModule(actor: CourseActor, moduleId: string, input: object) {
  const db = getDb();
  await assertCanEditModule(db, actor, moduleId);
  return updateModuleById(db, moduleId, pickPatch(input, UPDATABLE_MODULE_FIELDS));
}

export async function deleteModule(actor: CourseActor, moduleId: string): Promise<void> {
  const db = getDb();
  await assertCanEditModule(db, actor, moduleId);
  await deleteModuleById(db, moduleId);
}

// ---------------------------------------------------------------------------
// Lessons
// ---------------------------------------------------------------------------

export async function addLesson(actor: CourseActor, courseId: string, input: CreateLessonInput) {
  const db = getDb();
  await assertCanEditCourse(db, actor, courseId);
  return insertLesson(db, {
    courseId,
    moduleId: input.moduleId ?? null,
    title: input.title,
    summary: input.summary ?? null,
    sourceType: input.sourceType,
    studioProjectId: input.studioProjectId ?? null,
    scormManifestUrl: input.scormManifestUrl ?? null,
    scormEntryUrl: input.scormEntryUrl ?? null,
    scormVersion: input.scormVersion ?? null,
    scormPkgId: input.scormPkgId ?? null,
    externalUrl: input.externalUrl ?? null,
    bodyMd: input.bodyMd ?? null,
    bodyJson: input.bodyJson ?? null,
    estimatedMinutes: input.estimatedMinutes ?? null,
    isRequired: input.isRequired ?? true,
    knowledgeCheckFormId: input.knowledgeCheckFormId ?? null,
    sortOrder: input.sortOrder ?? 0,
  });
}

export async function updateLesson(actor: CourseActor, lessonId: string, input: object) {
  const db = getDb();
  const courseId = await findLessonCourseId(db, lessonId);
  if (!courseId || !(await canEditCourse(db, actor, courseId))) {
    throw new DomainError(404, "NOT_FOUND", "Lesson not found");
  }
  return updateLessonById(db, lessonId, pickPatch(input, UPDATABLE_LESSON_FIELDS));
}

export async function deleteLesson(actor: CourseActor, lessonId: string): Promise<void> {
  const db = getDb();
  const existing = await findLessonForDelete(db, lessonId);
  if (!existing || !(await canEditCourse(db, actor, existing.courseId))) {
    throw new DomainError(404, "NOT_FOUND", "Lesson not found");
  }
  await deleteLessonById(db, lessonId);
  if (existing.sourceType === "scorm_package" && existing.scormPkgId) {
    await deleteScormPackageObjects(existing.ownerId, existing.scormPkgId);
  }
}

/** #1440 — bulk-delete a SCORM package's R2 prefix. Best-effort: failures
 *  leave recoverable orphans and never block the lesson delete. The prefix
 *  is keyed on the course OWNER, not the caller (SuperAdmin deletes). */
async function deleteScormPackageObjects(ownerId: string, pkgId: string): Promise<void> {
  try {
    const bucket: R2Bucket | undefined = getVideoBucket();
    if (!bucket) return;
    const prefix = `uploads/${ownerId}/scorm/${pkgId}/`;
    const listed = await bucket.list({ prefix, limit: 1000 });
    if (listed.objects.length > 0) {
      await bucket.delete(listed.objects.map((o) => o.key));
    }
    // Re-list once for packages that ship >1000 files; covers the 99% case
    // without a cursor loop.
    if (listed.truncated) {
      const more = await bucket.list({ prefix, limit: 1000 });
      if (more.objects.length > 0) await bucket.delete(more.objects.map((o) => o.key));
    }
  } catch {
    // swallow — orphaned R2 keys are recoverable; missing lesson row isn't.
  }
}
