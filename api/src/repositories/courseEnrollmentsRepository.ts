/**
 * Learner-side course persistence: enrolment rows, issued certificates,
 * and the cohort / learning-path links the progress fan-out walks.
 */
import { and, desc, eq } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const {
  courses,
  courseEnrollments,
  courseCertificates,
  cohortMembers,
  learningPathCourses,
  learningPaths,
} = schema;

export type CourseEnrollmentRow = typeof courseEnrollments.$inferSelect;

/** Enrolment by id, only when it belongs to `userId` (never leaks others'). */
export async function findEnrollmentForUser(
  db: Db,
  enrollmentId: string,
  userId: string,
): Promise<CourseEnrollmentRow | null> {
  const [row] = await db.select()
    .from(courseEnrollments)
    .where(and(eq(courseEnrollments.id, enrollmentId), eq(courseEnrollments.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function findEnrollmentByUserAndCourse(
  db: Db,
  userId: string,
  courseId: string,
): Promise<CourseEnrollmentRow | null> {
  const [row] = await db.select().from(courseEnrollments)
    .where(and(eq(courseEnrollments.userId, userId), eq(courseEnrollments.courseId, courseId)))
    .limit(1);
  return row ?? null;
}

export async function insertEnrollment(
  db: Db,
  values: { courseId: string; userId: string },
): Promise<CourseEnrollmentRow | undefined> {
  const [created] = await db.insert(courseEnrollments)
    .values(values as typeof courseEnrollments.$inferInsert)
    .returning();
  return created;
}

export async function deleteEnrollmentById(db: Db, enrollmentId: string): Promise<void> {
  await db.delete(courseEnrollments).where(eq(courseEnrollments.id, enrollmentId));
}

export async function updateEnrollmentById(
  db: Db,
  enrollmentId: string,
  patch: Record<string, unknown>,
): Promise<CourseEnrollmentRow | undefined> {
  const [updated] = await db.update(courseEnrollments)
    .set(patch as Partial<typeof courseEnrollments.$inferInsert>)
    .where(eq(courseEnrollments.id, enrollmentId))
    .returning();
  return updated;
}

/** The caller's enrolments joined to their course, newest first. */
export async function listEnrollmentsWithCourse(db: Db, userId: string) {
  return db
    .select({ enrollment: courseEnrollments, course: courses })
    .from(courseEnrollments)
    .innerJoin(courses, eq(courseEnrollments.courseId, courses.id))
    .where(eq(courseEnrollments.userId, userId))
    .orderBy(desc(courseEnrollments.enrolledAt));
}

// ---------------------------------------------------------------------------
// Certificates
// ---------------------------------------------------------------------------

/** Public-safe certificate columns (signed payload + PII stay server-side). */
export async function findCertificateSummaryForEnrollment(db: Db, enrollmentId: string) {
  const [row] = await db.select({
    certNumber: courseCertificates.certNumber,
    issuedAt: courseCertificates.issuedAt,
    expiresAt: courseCertificates.expiresAt,
  })
    .from(courseCertificates)
    .where(eq(courseCertificates.enrollmentId, enrollmentId))
    .limit(1);
  return row ?? null;
}

export async function enrollmentHasCertificate(db: Db, enrollmentId: string): Promise<boolean> {
  const [row] = await db.select({ id: courseCertificates.id }).from(courseCertificates)
    .where(eq(courseCertificates.enrollmentId, enrollmentId))
    .limit(1);
  return row != null;
}

export async function listCertificatesForUser(db: Db, userId: string) {
  return db.select().from(courseCertificates)
    .where(eq(courseCertificates.userId, userId))
    .orderBy(desc(courseCertificates.issuedAt));
}

// ---------------------------------------------------------------------------
// Cohort + learning-path links (progress fan-out)
// ---------------------------------------------------------------------------

/** Every cohort the user is an active member of (one indexed query). */
export async function listActiveCohortIdsForUser(db: Db, userId: string): Promise<string[]> {
  const rows = await db
    .select({ cohortId: cohortMembers.cohortId })
    .from(cohortMembers)
    .where(and(eq(cohortMembers.userId, userId), eq(cohortMembers.status, "active")));
  return rows.map((r) => r.cohortId);
}

export async function listPathIdsContainingCourse(db: Db, courseId: string): Promise<string[]> {
  const rows = await db.select({ pathId: learningPathCourses.pathId })
    .from(learningPathCourses)
    .where(eq(learningPathCourses.courseId, courseId));
  return rows.map((r) => r.pathId);
}

export async function findLearningPathTitleSlug(db: Db, pathId: string) {
  const [row] = await db.select({ title: learningPaths.title, slug: learningPaths.slug })
    .from(learningPaths)
    .where(eq(learningPaths.id, pathId))
    .limit(1);
  return row ?? null;
}
