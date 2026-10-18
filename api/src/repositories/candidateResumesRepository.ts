/**
 * CandidateResumesRepository — agency recruiting `candidate_resumes`
 * aggregate (gap #99): recruiter-owned résumé records with a variant tree
 * (`parent_id`) and at most one active variant per
 * (company, talent_pool_candidate) bucket.
 *
 * Function-style (same as talentPoolRepository.ts). Company scoping is the
 * caller's job (services/recruit/*) — these functions only filter by the
 * ids they are handed.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";

const { candidateResumes } = schema;

export type CandidateResumeRow = typeof candidateResumes.$inferSelect;
export type CandidateResumeInsert = typeof candidateResumes.$inferInsert;

export interface CandidateResumeListFilter {
  /** Rows of exactly this company (takes precedence over `companyIds`). */
  companyId?: string;
  /** Rows of any of these companies. */
  companyIds: string[];
  talentPoolCandidateId?: string;
  activeOnly?: boolean;
}

/** Candidate résumés matching the filter, most recently updated first. */
export async function listCandidateResumes(filter: CandidateResumeListFilter): Promise<CandidateResumeRow[]> {
  const conditions = [
    filter.companyId
      ? eq(candidateResumes.companyId, filter.companyId)
      : inArray(candidateResumes.companyId, filter.companyIds),
  ];
  if (filter.talentPoolCandidateId) {
    conditions.push(eq(candidateResumes.talentPoolCandidateId, filter.talentPoolCandidateId));
  }
  if (filter.activeOnly) conditions.push(eq(candidateResumes.isActive, true));
  return getDb()
    .select()
    .from(candidateResumes)
    .where(and(...conditions))
    .orderBy(desc(candidateResumes.updatedAt));
}

export async function findCandidateResumeById(id: string): Promise<CandidateResumeRow | null> {
  const [row] = await getDb().select().from(candidateResumes).where(eq(candidateResumes.id, id)).limit(1);
  return row ?? null;
}

/** Bulk lookup by id (public pitch-deck view: one round-trip for every slide). */
export async function findCandidateResumesByIds(ids: string[]): Promise<CandidateResumeRow[]> {
  if (ids.length === 0) return [];
  return getDb().select().from(candidateResumes).where(inArray(candidateResumes.id, ids));
}

/** {id,label,content} for the given ids, restricted to `companyIds`
 *  (bulk scoring reads only the caller's own companies' résumés). */
export async function findCandidateResumeContentsForCompanies(
  ids: string[],
  companyIds: string[],
): Promise<Array<Pick<CandidateResumeRow, "id" | "label" | "content">>> {
  if (ids.length === 0 || companyIds.length === 0) return [];
  return getDb()
    .select({ id: candidateResumes.id, label: candidateResumes.label, content: candidateResumes.content })
    .from(candidateResumes)
    .where(and(inArray(candidateResumes.id, ids), inArray(candidateResumes.companyId, companyIds)));
}

export async function insertCandidateResume(values: CandidateResumeInsert): Promise<CandidateResumeRow> {
  const [row] = await getDb().insert(candidateResumes).values(values).returning();
  return row;
}

export async function insertCandidateResumes(values: CandidateResumeInsert[]): Promise<CandidateResumeRow[]> {
  return getDb().insert(candidateResumes).values(values).returning();
}

/** Patch one row (stamps `updatedAt`); null when it no longer exists. */
export async function updateCandidateResume(
  id: string,
  patch: Partial<CandidateResumeInsert>,
): Promise<CandidateResumeRow | null> {
  const [row] = await getDb()
    .update(candidateResumes)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(candidateResumes.id, id))
    .returning();
  return row ?? null;
}

export async function deleteCandidateResume(id: string): Promise<void> {
  await getDb().delete(candidateResumes).where(eq(candidateResumes.id, id));
}

/** Flip every currently-active variant in the (company, candidate) bucket off. */
export async function deactivateActiveVariants(companyId: string, talentPoolCandidateId: string): Promise<void> {
  await getDb()
    .update(candidateResumes)
    .set({ isActive: false, updatedAt: new Date() })
    .where(
      and(
        eq(candidateResumes.companyId, companyId),
        eq(candidateResumes.talentPoolCandidateId, talentPoolCandidateId),
        eq(candidateResumes.isActive, true),
      ),
    );
}
