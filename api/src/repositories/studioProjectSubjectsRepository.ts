/**
 * `studio_project_subjects` — the many-to-many links between a studio
 * project and the entities it is about (résumé, job, company, candidate,
 * creator credit …, migration 0061). The single-project read
 * (`loadProjectSubjects`) stays in services/studio/project-visibility.ts,
 * which the visibility writer shares. Split out of routes/studio.ts (W2-3a).
 */
import { and, eq, inArray } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const { studioProjectSubjects } = schema;

export interface SubjectRef {
  kind: string;
  id: string;
}

/** Replace the project's subjects with the supplied array (empty clears all).
 *  De-duped in memory first so a duplicate pair can't trip the unique triple. */
export async function replaceProjectSubjects(db: Db, projectId: string, subjects: SubjectRef[]): Promise<void> {
  await db.delete(studioProjectSubjects).where(eq(studioProjectSubjects.projectId, projectId));
  if (subjects.length === 0) return;
  const seen = new Set<string>();
  const rows = subjects.flatMap((s) => {
    const key = `${s.kind}:${s.id}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ projectId, subjectKind: s.kind, subjectId: s.id }];
  });
  if (rows.length) {
    await db.insert(studioProjectSubjects).values(rows).onConflictDoNothing();
  }
}

/** Add one link; true when it was new (false = it already existed). */
export async function insertProjectSubject(db: Db, projectId: string, subject: SubjectRef): Promise<boolean> {
  const inserted = await db
    .insert(studioProjectSubjects)
    .values({ projectId, subjectKind: subject.kind, subjectId: subject.id })
    .onConflictDoNothing()
    .returning({ id: studioProjectSubjects.projectId });
  return inserted.length > 0;
}

export async function deleteProjectSubject(db: Db, projectId: string, subject: SubjectRef): Promise<void> {
  await db
    .delete(studioProjectSubjects)
    .where(and(
      eq(studioProjectSubjects.projectId, projectId),
      eq(studioProjectSubjects.subjectKind, subject.kind),
      eq(studioProjectSubjects.subjectId, subject.id),
    ));
}

/** Idempotent `creator_credit` link — surfaces delegated work on the
 *  contributor's own profile. */
export async function ensureCreatorCredit(db: Db, projectId: string, contributorUserId: string): Promise<void> {
  await insertProjectSubject(db, projectId, { kind: "creator_credit", id: contributorUserId });
}

/** Subjects of many projects in ONE query, in creation order per project. */
export async function loadProjectSubjectsBulk(db: Db, projectIds: string[]): Promise<Map<string, SubjectRef[]>> {
  if (projectIds.length === 0) return new Map();
  const rows = await db
    .select({
      projectId: studioProjectSubjects.projectId,
      kind: studioProjectSubjects.subjectKind,
      id: studioProjectSubjects.subjectId,
    })
    .from(studioProjectSubjects)
    .where(inArray(studioProjectSubjects.projectId, projectIds))
    .orderBy(studioProjectSubjects.createdAt);
  const map = new Map<string, SubjectRef[]>();
  for (const r of rows) {
    const list = map.get(r.projectId) ?? [];
    list.push({ kind: r.kind, id: r.id });
    map.set(r.projectId, list);
  }
  return map;
}

/** Ids of every project linked to the given subject. */
export async function findProjectIdsForSubject(db: Db, subject: SubjectRef): Promise<string[]> {
  const rows = await db
    .select({ projectId: studioProjectSubjects.projectId })
    .from(studioProjectSubjects)
    .where(and(eq(studioProjectSubjects.subjectKind, subject.kind), eq(studioProjectSubjects.subjectId, subject.id)));
  return rows.map((r) => r.projectId);
}
