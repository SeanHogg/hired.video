/**
 * RecruiterSearchRepository — Drizzle reads/writes behind the recruiter
 * Boolean candidate search (`POST /api/search/recruiter`) and saved
 * searches (`/api/search/saved`). No business logic: the service turns the
 * request into a `CandidateSearchCriteria` (tsquery already built, geo
 * already resolved to an id allowlist) and this repo turns that into SQL.
 */

import { and, desc, eq, ilike, inArray, sql, type SQL } from "drizzle-orm";
import { schema, type getDb } from "../db/index.js";

const { users, userProfiles, savedSearches } = schema;

type DbHandle = ReturnType<typeof getDb>;

export type SavedSearchRow = typeof savedSearches.$inferSelect;
export type SavedSearchInsert = typeof savedSearches.$inferInsert;

export interface CandidateSearchCriteria {
  /** Structured-geo allowlist of user ids; null = no geo filter. */
  allowUserIds: string[] | null;
  /** PostgreSQL tsquery over name + work-history titles/companies. */
  tsQuery: string | null;
  /** Every skill must substring-match one of the candidate's skills. */
  skills: string[];
  /** Legacy free-text location fallback (only when no structured geo). */
  locationText: string | null;
  /** Exclude candidates whose confidential blocklist names this company. */
  viewerCompany: string | null;
  limit: number;
  offset: number;
}

export class RecruiterSearchRepository {
  constructor(private readonly db: DbHandle) {}

  /** The viewing recruiter's own current company, or "" when unset. */
  async findViewerCompany(userId: string): Promise<string> {
    const [viewer] = await this.db
      .select({ company: userProfiles.currentCompany })
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);
    return (viewer?.company ?? "").trim();
  }

  async searchCandidates(c: CandidateSearchCriteria) {
    const conditions: SQL[] = [];

    if (c.allowUserIds !== null) conditions.push(inArray(users.id, c.allowUserIds));

    if (c.tsQuery) {
      conditions.push(sql`
        to_tsvector('english', coalesce(${users.name}, '') || ' ' ||
          coalesce((SELECT string_agg(coalesce(e->>'title','') || ' ' || coalesce(e->>'company',''), ' ')
                    FROM jsonb_array_elements(coalesce((SELECT work_experience FROM user_profiles WHERE user_id = ${users.id}), '[]'::jsonb)) e), ''))
        @@ to_tsquery('english', ${c.tsQuery})
      `);
    }

    for (const skill of c.skills) {
      conditions.push(sql`EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(coalesce(
          (SELECT skills FROM user_profiles WHERE user_id = ${users.id}), '[]'::jsonb)
        ) s WHERE lower(s) LIKE ${"%" + skill.toLowerCase() + "%"}
      )`);
    }

    if (c.locationText) conditions.push(ilike(userProfiles.location, `%${c.locationText}%`));

    // Confidential employer blocklist (#1679) — case-insensitive.
    if (c.viewerCompany) {
      conditions.push(sql`NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(coalesce(
          (SELECT confidential_blocklist FROM user_profiles WHERE user_id = ${users.id}), '[]'::jsonb)
        ) b WHERE lower(b) = lower(${c.viewerCompany})
      )`);
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countRows, rows] = await Promise.all([
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
        .where(whereClause),
      this.db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          headline: userProfiles.headline,
          location: userProfiles.location,
          avatarUrl: userProfiles.avatarUrl,
        })
        .from(users)
        .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
        .where(whereClause)
        .orderBy(desc(users.createdAt))
        .limit(c.limit)
        .offset(c.offset),
    ]);

    return { total: countRows[0]?.count ?? 0, rows };
  }

  // ─── Saved searches ─────────────────────────────────────────────────────────

  async listSavedSearches(userId: string): Promise<SavedSearchRow[]> {
    return this.db
      .select()
      .from(savedSearches)
      .where(eq(savedSearches.userId, userId))
      .orderBy(desc(savedSearches.createdAt));
  }

  async insertSavedSearch(input: SavedSearchInsert): Promise<SavedSearchRow | undefined> {
    const [row] = await this.db.insert(savedSearches).values(input).returning();
    return row;
  }

  async deleteSavedSearch(id: string, userId: string): Promise<void> {
    await this.db.delete(savedSearches).where(and(eq(savedSearches.id, id), eq(savedSearches.userId, userId)));
  }
}

export type CandidateRow = Awaited<ReturnType<RecruiterSearchRepository["searchCandidates"]>>["rows"][number];
