/**
 * Tenant learning portability (#2281) — the "company transitioning in / company
 * leaving" migration story.
 *
 * EXPORT (company leaving): an owner drains everything about their learning
 * content in portable, open shapes —
 *   • manifest  — JSON summary of their courses + totals,
 *   • results   — enrollments + scores as CSV,
 *   • statements — a conformant xAPI statement array combining the platform LRS
 *                  (lrs_statements, mig 0490) and the internal store
 *                  (xapi_statements, mig 0126) for their content.
 *
 * IMPORT (company transitioning in): bulk-ingest an xAPI statement array from
 * another platform's export into one of the owner's LRS credentials — reusing
 * the LRS core (`storeStatements`) so there's ONE write path, not a second one.
 *
 * NOT cached: an export is a point-in-time migration snapshot that MUST reflect
 * the latest data at the moment it's taken (a stale export during an offboarding
 * = silent data loss), it's owner-scoped, and it's large — exactly the shape the
 * read-through cache is wrong for.
 *
 * Perf: every query is batched (owner course-ids once, then IN-list fetches +
 * in-JS aggregation) — no per-course round-trips.
 */
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { storeStatements, type ResolvedLrsCredential } from "./lrs-service.js";

const { courses, courseEnrollments, courseCertificates, users, lrsCredentials, lrsStatements, xapiStatements } =
  schema;

type DbHandle = ReturnType<typeof getDb>;

/** Hard cap on a single statements-export call. Beyond this the caller must page
 *  (surfaced as `truncated: true` — never a silent cut). Cursored full export is
 *  tracked as a residual on #2281. */
export const STATEMENT_EXPORT_CAP = 50_000;
/** Chunk size for bulk import so one call can't build an unbounded insert. */
const IMPORT_CHUNK = 500;

export const EXPORT_FORMAT = "hired.video/learning-export";
export const EXPORT_VERSION = 1;

async function ownerCourses(ownerUserId: string, db: DbHandle) {
  return db.select({
    id: courses.id, slug: courses.slug, title: courses.title, status: courses.status,
  }).from(courses).where(eq(courses.userId, ownerUserId));
}

export interface ExportManifest {
  format: string;
  version: number;
  exportedAt: string;
  owner: { userId: string };
  courses: Array<{ id: string; slug: string; title: string; status: string; enrollments: number; passed: number }>;
  totals: { courses: number; enrollments: number; certificates: number };
}

/** JSON summary of the owner's courses + enrollment/pass counts + totals. */
export async function exportManifest(
  ownerUserId: string,
  exportedAt: string,
  db: DbHandle = getDb(),
): Promise<ExportManifest> {
  const courseRows = await ownerCourses(ownerUserId, db);
  const courseIds = courseRows.map((c) => c.id);

  const enrollments = courseIds.length
    ? await db.select({ courseId: courseEnrollments.courseId, passed: courseEnrollments.passed })
        .from(courseEnrollments).where(inArray(courseEnrollments.courseId, courseIds))
    : [];
  const certs = courseIds.length
    ? await db.select({ id: courseCertificates.id }).from(courseCertificates)
        .where(inArray(courseCertificates.courseId, courseIds))
    : [];

  const byCourse = new Map<string, { enrollments: number; passed: number }>();
  for (const id of courseIds) byCourse.set(id, { enrollments: 0, passed: 0 });
  for (const e of enrollments) {
    const agg = byCourse.get(e.courseId);
    if (!agg) continue;
    agg.enrollments += 1;
    if (e.passed) agg.passed += 1;
  }

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt,
    owner: { userId: ownerUserId },
    courses: courseRows.map((c) => ({
      id: c.id, slug: c.slug, title: c.title, status: c.status,
      enrollments: byCourse.get(c.id)?.enrollments ?? 0,
      passed: byCourse.get(c.id)?.passed ?? 0,
    })),
    totals: { courses: courseRows.length, enrollments: enrollments.length, certificates: certs.length },
  };
}

/** RFC-4180 CSV cell escaping. */
export function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  const lines = [header.map(csvCell).join(",")];
  for (const r of rows) lines.push(r.map(csvCell).join(","));
  return lines.join("\r\n");
}

/** Enrollments + results across the owner's courses, as CSV. Learner email +
 *  course title resolved via batched IN-list lookups (no per-row queries). */
export async function exportResultsCsv(ownerUserId: string, db: DbHandle = getDb()): Promise<string> {
  const header = ["course_id", "course_title", "learner_user_id", "learner_email", "enrolled_at", "completed_at", "final_score_pct", "passed"];
  const courseRows = await ownerCourses(ownerUserId, db);
  const courseIds = courseRows.map((c) => c.id);
  if (courseIds.length === 0) return toCsv(header, []);

  const titleById = new Map(courseRows.map((c) => [c.id, c.title]));
  const enrollments = await db.select({
    courseId: courseEnrollments.courseId, userId: courseEnrollments.userId,
    enrolledAt: courseEnrollments.enrolledAt, completedAt: courseEnrollments.completedAt,
    finalScorePct: courseEnrollments.finalScorePct, passed: courseEnrollments.passed,
  }).from(courseEnrollments).where(inArray(courseEnrollments.courseId, courseIds));

  const userIds = [...new Set(enrollments.map((e) => e.userId))];
  const emailById = new Map<string, string>();
  if (userIds.length) {
    const userRows = await db.select({ id: users.id, email: users.email }).from(users)
      .where(inArray(users.id, userIds));
    for (const u of userRows) emailById.set(u.id, u.email ?? "");
  }

  const rows = enrollments.map((e) => [
    e.courseId, titleById.get(e.courseId) ?? "", e.userId, emailById.get(e.userId) ?? "",
    e.enrolledAt instanceof Date ? e.enrolledAt.toISOString() : e.enrolledAt ?? "",
    e.completedAt instanceof Date ? e.completedAt.toISOString() : e.completedAt ?? "",
    e.finalScorePct ?? "", e.passed ? "true" : "false",
  ]);
  return toCsv(header, rows);
}

export interface StatementExport {
  count: number;
  truncated: boolean;
  statements: Record<string, unknown>[];
}

/** Conformant xAPI statement array for the owner: the platform LRS
 *  (lrs_statements under the owner's credentials, non-voided) plus the internal
 *  store (xapi_statements for the owner's courses). Capped; `truncated` flags an
 *  over-cap result rather than silently cutting. */
export async function exportStatements(ownerUserId: string, db: DbHandle = getDb()): Promise<StatementExport> {
  const credRows = await db.select({ id: lrsCredentials.id }).from(lrsCredentials)
    .where(eq(lrsCredentials.ownerUserId, ownerUserId));
  const credIds = credRows.map((c) => c.id);

  const lrsRows = credIds.length
    ? await db.select({ statement: lrsStatements.statement }).from(lrsStatements)
        .where(and(inArray(lrsStatements.credentialId, credIds), eq(lrsStatements.voided, false)))
        .limit(STATEMENT_EXPORT_CAP + 1)
    : [];

  const courseRows = await ownerCourses(ownerUserId, db);
  const courseIds = courseRows.map((c) => c.id);
  const internalRows = courseIds.length
    ? await db.select({ statement: xapiStatements.statement }).from(xapiStatements)
        .where(inArray(xapiStatements.courseId, courseIds))
        .limit(STATEMENT_EXPORT_CAP + 1)
    : [];

  const all = [...lrsRows, ...internalRows].map((r) => r.statement as Record<string, unknown>);
  const truncated = all.length > STATEMENT_EXPORT_CAP;
  return { count: Math.min(all.length, STATEMENT_EXPORT_CAP), truncated, statements: all.slice(0, STATEMENT_EXPORT_CAP) };
}

/** Bulk-import an xAPI statement array into one of the owner's LRS credentials.
 *  Reuses the LRS write core (`storeStatements`) so there is exactly one storage
 *  path; chunks so a single call can't build an unbounded insert. */
export async function importStatements(
  credential: ResolvedLrsCredential,
  statements: Record<string, unknown>[],
  db: DbHandle = getDb(),
): Promise<{ imported: number }> {
  let imported = 0;
  for (let i = 0; i < statements.length; i += IMPORT_CHUNK) {
    const chunk = statements.slice(i, i + IMPORT_CHUNK);
    const { ids } = await storeStatements(credential, chunk, db);
    imported += ids.length;
  }
  return { imported };
}
