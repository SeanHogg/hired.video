/**
 * Course → LMS publishing (#200): push a course's SCORM package through the
 * caller's connected LMS connector, recording a lms_course_publishes row
 * (pending → published | failed), and list a course's publish history.
 * Throws DomainError; the global handler renders the envelope.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import type { LmsProvider } from "../../db/schema/courses.js";
import { findCourseOwnerId, findCourseScoped } from "../../repositories/coursesRepository.js";
import {
  insertPendingLmsPublish,
  listLmsPublishesByCourse,
  markLmsPublishFailed,
  markLmsPublishPublished,
  type LmsCoursePublishRow,
} from "../../repositories/lmsCoursePublishesRepository.js";
import { connectorFor } from "../lms/index.js";
import { LmsConnectors } from "../provider-connections/lms-connectors.js";

export { LMS_PROVIDERS } from "../../db/schema/courses.js";

export interface PublishToLmsInput {
  connectorId: string;
  scormPackageUrl: string;
}

/**
 * Publish a course to a connected LMS. `ownerId` null = SuperAdmin (any
 * course); otherwise the course must belong to `ownerId`.
 */
export async function publishCourseToLms(
  courseId: string,
  userId: string,
  ownerId: string | null,
  input: PublishToLmsInput,
): Promise<{ publish: LmsCoursePublishRow | undefined; launchUrl: string | undefined }> {
  const db = getDb();
  const course = await findCourseScoped(db, courseId, ownerId);
  if (!course) throw new DomainError(404, "NOT_FOUND", "Course not found");

  const conn = await new LmsConnectors(db).credentialsFor(input.connectorId, userId);
  if (!conn || conn.status !== "connected") {
    throw new DomainError(403, "FORBIDDEN", "Connector is not active");
  }

  const publishRow = await insertPendingLmsPublish(db, { connectorId: conn.id, courseId: course.id });

  try {
    const adapter = connectorFor(conn.provider as LmsProvider);
    const result = await adapter.publishCourse(
      {
        title: course.title,
        description: course.description ?? course.summary ?? undefined,
        scormPackageUrl: input.scormPackageUrl,
        externalId: course.slug,
        tags: course.tags as string[],
        category: course.category ?? undefined,
      },
      {
        accessToken: conn.accessToken,
        baseUrl: conn.baseUrl,
        metadata: conn.metadata,
      },
    );
    const done = await markLmsPublishPublished(db, publishRow.id, result.remoteId, new Date());
    return { publish: done, launchUrl: result.launchUrl };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await markLmsPublishFailed(db, publishRow.id, message, new Date());
    throw new DomainError(500, "LMS_PUBLISH_FAILED", message);
  }
}

/** A course's LMS publish history (owner only; 404 otherwise). */
export async function listCourseLmsPublishes(courseId: string, userId: string): Promise<LmsCoursePublishRow[]> {
  const db = getDb();
  const ownerId = await findCourseOwnerId(db, courseId);
  if (ownerId == null || ownerId !== userId) throw new DomainError(404, "NOT_FOUND", "Course not found");
  return listLmsPublishesByCourse(db, courseId);
}
