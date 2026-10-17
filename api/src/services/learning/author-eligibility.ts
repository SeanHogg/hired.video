/**
 * Author / educator eligibility — the single seam deciding who may author
 * learning content (courses, paths, cohorts) on the platform.
 *
 * Per the 2026-05-25 design decision (project_learning_pathways) + the
 * #1886 educator-persona decision: Educator is NOT a new top-level role.
 * Authoring is open to:
 *   • creator-program enrollees (`creator_profiles.courses_active`), and
 *   • any user holding the `employer` role (internal / required training).
 *
 * Employers get `isEmployerAuthored = true` stamped on the row so the
 * public marketplace can scope listings.
 *
 * This was duplicated inline in courses.ts (`resolveAuthorEligibility`)
 * and the learning-paths route (`checkAuthorEligibility`); both now call here
 * (rule: feedback_extract_on_duplication). Cohort authoring reuses it too.
 */

import { and, eq, sql } from "drizzle-orm";
import type { getDb } from "../../db/index.js";
import { schema } from "../../db/index.js";
import { USER_ROLES } from "../../../../shared/user-roles.js";

type DbHandle = ReturnType<typeof getDb>;

export type AuthorEligibility =
  | { ok: true; isEmployerAuthored: boolean }
  | { ok: false };

/** Resolve whether `userId` (with JWT `roles`) may author learning
 *  content. Framework-agnostic — callers pass the primitives so the same
 *  logic serves Hono routes and services alike. */
export async function resolveAuthorEligibility(
  db: DbHandle,
  userId: string | null,
  roles: readonly string[],
): Promise<AuthorEligibility> {
  if (!userId) return { ok: false };
  if (roles.includes(USER_ROLES.EMPLOYER)) {
    return { ok: true, isEmployerAuthored: true };
  }
  const [creator] = await db
    .select({ id: schema.creatorProfiles.id })
    .from(schema.creatorProfiles)
    .where(
      and(
        eq(schema.creatorProfiles.userId, userId),
        sql`${schema.creatorProfiles.endedAt} IS NULL`,
        eq(schema.creatorProfiles.coursesActive, true),
      ),
    )
    .limit(1);
  if (creator) return { ok: true, isEmployerAuthored: false };
  return { ok: false };
}
