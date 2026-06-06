/**
 * AssignmentService — assign a course or path to a cohort (or one member)
 * with a due date + required flag (#1888).
 *
 * Enrollment is otherwise self-serve; this is the layer that lets an
 * educator/employer push "you must do X by Y". On create we materialise
 * the underlying enrollment rows (course_enrollments / learning_path_
 * enrollments) for every targeted member so progress tracking starts
 * immediately — the existing per-learner tables stay the SSoT for
 * completion; an assignment is just the obligation on top.
 *
 * Ownership is delegated to CohortService.getManageable (the canActFor
 * seam). The learner-facing `listForLearner` powers the "Assigned to me"
 * surface (#1889).
 */

import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { getDb } from "../../db/index.js";
import { schema } from "../../db/index.js";
import { CohortService } from "./cohort-service.js";
import { invalidateCohortAnalyticsCache } from "./cohort-analytics.js";
import { NotificationService } from "../notifications/notification-service.js";

type DbHandle = ReturnType<typeof getDb>;

const {
  learningCohorts,
  cohortMembers,
  learningAssignments,
  courses,
  courseEnrollments,
  learningPaths,
  learningPathEnrollments,
} = schema;

export class AssignmentSubjectNotFoundError extends Error {
  readonly code = "ASSIGNMENT_SUBJECT_NOT_FOUND" as const;
  constructor(message = "The assigned course or path does not exist.") {
    super(message);
    this.name = "AssignmentSubjectNotFoundError";
  }
}

export interface CreateAssignmentInput {
  subjectType: "course" | "path";
  subjectId: string;
  memberId?: string | null;
  required?: boolean;
  dueAt?: Date | null;
}

export class AssignmentService {
  private readonly cohorts: CohortService;
  constructor(private readonly db: DbHandle) {
    this.cohorts = new CohortService(db);
  }

  /** Create an assignment + fan out enrollments. Actor must manage the
   *  cohort (canActFor seam in getManageable). */
  async createAssignment(actorUserId: string, cohortId: string, input: CreateAssignmentInput) {
    await this.cohorts.getManageable(actorUserId, cohortId);

    // Subject must exist (avoids assigning a phantom course/path). Grab the
    // title for the learner notification.
    let subjectTitle = "training";
    if (input.subjectType === "course") {
      const [c] = await this.db.select({ id: courses.id, title: courses.title }).from(courses).where(eq(courses.id, input.subjectId)).limit(1);
      if (!c) throw new AssignmentSubjectNotFoundError();
      subjectTitle = c.title;
    } else {
      const [p] = await this.db.select({ id: learningPaths.id, title: learningPaths.title }).from(learningPaths).where(eq(learningPaths.id, input.subjectId)).limit(1);
      if (!p) throw new AssignmentSubjectNotFoundError();
      subjectTitle = p.title;
    }

    const [assignment] = await this.db
      .insert(learningAssignments)
      .values({
        cohortId,
        memberId: input.memberId ?? null,
        assignedByUserId: actorUserId,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        required: input.required ?? true,
        dueAt: input.dueAt ?? null,
        status: "active",
      } as never)
      .returning();

    const targetedUserIds = await this.fanOutEnrollments(cohortId, input.memberId ?? null, input.subjectType, input.subjectId);
    invalidateCohortAnalyticsCache(cohortId);

    // Notify each targeted learner ("assigned to you"), best-effort. Persists
    // to the notification center + pushes through the consolidated pipeline.
    const dueSuffix = input.dueAt
      ? ` — due ${new Date(input.dueAt).toLocaleDateString()}`
      : "";
    await Promise.allSettled(
      targetedUserIds.map((userId) =>
        NotificationService.notify({
          userId,
          type: "assignment",
          title: "New training assigned",
          message: `${subjectTitle}${dueSuffix}`,
          url: "/tools?tab=my-learning",
          refType: "learning_assignment",
          refId: assignment?.id,
        }),
      ),
    );

    return assignment;
  }

  /** Materialise enrollments for the targeted member(s). Idempotent via
   *  onConflictDoNothing against the per-(user,subject) unique indexes.
   *  Returns the targeted user ids so the caller can notify them. */
  private async fanOutEnrollments(
    cohortId: string,
    memberId: string | null,
    subjectType: "course" | "path",
    subjectId: string,
  ): Promise<string[]> {
    let userIds: string[];
    if (memberId) {
      const [m] = await this.db
        .select({ userId: cohortMembers.userId })
        .from(cohortMembers)
        .where(and(eq(cohortMembers.id, memberId), eq(cohortMembers.status, "active")))
        .limit(1);
      userIds = m?.userId ? [m.userId] : [];
    } else {
      userIds = await this.cohorts.activeMemberUserIds(cohortId);
    }
    if (userIds.length === 0) return [];

    if (subjectType === "course") {
      const inserted = await this.db
        .insert(courseEnrollments)
        .values(userIds.map((userId) => ({ courseId: subjectId, userId })) as never)
        .onConflictDoNothing()
        .returning({ id: courseEnrollments.id });
      if (inserted.length > 0) {
        await this.db
          .update(courses)
          .set({ enrollmentCount: sql`${courses.enrollmentCount} + ${inserted.length}` } as never)
          .where(eq(courses.id, subjectId))
          .catch(() => undefined);
      }
    } else {
      const inserted = await this.db
        .insert(learningPathEnrollments)
        .values(userIds.map((userId) => ({ pathId: subjectId, userId })) as never)
        .onConflictDoNothing()
        .returning({ id: learningPathEnrollments.id });
      if (inserted.length > 0) {
        await this.db
          .update(learningPaths)
          .set({ enrollmentCount: sql`${learningPaths.enrollmentCount} + ${inserted.length}` } as never)
          .where(eq(learningPaths.id, subjectId))
          .catch(() => undefined);
      }
    }
    return userIds;
  }

  async listAssignments(actorUserId: string, cohortId: string) {
    await this.cohorts.getManageable(actorUserId, cohortId);
    return this.db
      .select()
      .from(learningAssignments)
      .where(and(eq(learningAssignments.cohortId, cohortId), eq(learningAssignments.status, "active")))
      .orderBy(desc(learningAssignments.createdAt));
  }

  async removeAssignment(actorUserId: string, cohortId: string, assignmentId: string) {
    await this.cohorts.getManageable(actorUserId, cohortId);
    const [row] = await this.db
      .update(learningAssignments)
      .set({ status: "archived", updatedAt: new Date() } as never)
      .where(and(eq(learningAssignments.id, assignmentId), eq(learningAssignments.cohortId, cohortId)))
      .returning({ id: learningAssignments.id });
    invalidateCohortAnalyticsCache(cohortId);
    return Boolean(row);
  }

  /** "Assigned to me" — every active assignment applying to the learner
   *  across all cohorts they belong to, with the cohort name, subject
   *  title, and (for courses) the learner's enrollment id so the UI can
   *  deep-link to /learn/:enrollmentId. Fully batched. */
  async listForLearner(userId: string) {
    // Memberships → assignments that apply (cohort-wide OR member-specific).
    const rows = await this.db
      .select({ assignment: learningAssignments, cohortName: learningCohorts.name, cohortId: learningCohorts.id })
      .from(cohortMembers)
      .innerJoin(learningAssignments, and(
        eq(learningAssignments.cohortId, cohortMembers.cohortId),
        eq(learningAssignments.status, "active"),
        or(isNull(learningAssignments.memberId), eq(learningAssignments.memberId, cohortMembers.id)),
      ))
      .innerJoin(learningCohorts, eq(learningCohorts.id, cohortMembers.cohortId))
      .where(and(
        eq(cohortMembers.userId, userId),
        eq(cohortMembers.status, "active"),
        eq(learningCohorts.status, "active"),
      ))
      .orderBy(desc(learningAssignments.createdAt));

    if (rows.length === 0) return [];

    const courseIds = [...new Set(rows.filter((r) => r.assignment.subjectType === "course").map((r) => r.assignment.subjectId))];
    const pathIds = [...new Set(rows.filter((r) => r.assignment.subjectType === "path").map((r) => r.assignment.subjectId))];

    // Titles + the learner's own enrollment ids (batched).
    const [courseRows, pathRows, courseEnrolls] = await Promise.all([
      courseIds.length
        ? this.db.select({ id: courses.id, title: courses.title, slug: courses.slug }).from(courses).where(inArray(courses.id, courseIds))
        : Promise.resolve([] as { id: string; title: string; slug: string }[]),
      pathIds.length
        ? this.db.select({ id: learningPaths.id, title: learningPaths.title, slug: learningPaths.slug }).from(learningPaths).where(inArray(learningPaths.id, pathIds))
        : Promise.resolve([] as { id: string; title: string; slug: string }[]),
      courseIds.length
        ? this.db.select({ id: courseEnrollments.id, courseId: courseEnrollments.courseId, passed: courseEnrollments.passed })
            .from(courseEnrollments)
            .where(and(eq(courseEnrollments.userId, userId), inArray(courseEnrollments.courseId, courseIds)))
        : Promise.resolve([] as { id: string; courseId: string; passed: boolean }[]),
    ]);
    const titleById = new Map<string, { title: string; slug: string }>();
    for (const r of courseRows) titleById.set(r.id, { title: r.title, slug: r.slug });
    for (const r of pathRows) titleById.set(r.id, { title: r.title, slug: r.slug });
    const enrollByCourse = new Map(courseEnrolls.map((e) => [e.courseId, e]));

    return rows.map((r) => {
      const a = r.assignment;
      const meta = titleById.get(a.subjectId);
      const enroll = a.subjectType === "course" ? enrollByCourse.get(a.subjectId) : undefined;
      return {
        assignmentId: a.id,
        cohortId: r.cohortId,
        cohortName: r.cohortName,
        subjectType: a.subjectType,
        subjectId: a.subjectId,
        title: meta?.title ?? "Untitled",
        slug: meta?.slug ?? null,
        required: a.required,
        dueAt: a.dueAt ? a.dueAt.toISOString() : null,
        enrollmentId: enroll?.id ?? null,
        passed: enroll?.passed ?? false,
      };
    });
  }
}
