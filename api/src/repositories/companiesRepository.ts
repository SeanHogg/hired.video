/**
 * CompaniesRepository — company-side aggregate:
 *   • companyProfiles             — public company page data
 *   • candidateSubmissions        — resumes submitted to a company
 *   • candidateResumes            — recruiter-managed candidate folder
 *   • candidateResumeShares       — per-share ACL for candidate resumes
 *   • candidateInteractions       — recruiter notes / status changes
 *
 * All company-ownership reads/writes flow through this module so the
 * layering rule holds even across the recruiter UI.
 */

import { and, count, desc, eq, gte, ilike, inArray, or } from "drizzle-orm";
import { schema } from "../db/index.js";
import { NON_CANDIDATE_ROLES } from "../../../shared/user-roles.js";

const {
  companyProfiles,
  candidateSubmissions,
  candidateResumes,
  candidateResumeShares,
  candidateInteractions,
  recruiterMatchScores,
  users,
  talentPoolCandidates,
} = schema;

export type DbLike = any;

export type CompanyProfileRow = typeof companyProfiles.$inferSelect;
export type CompanyProfileInsert = typeof companyProfiles.$inferInsert;
export type CandidateSubmissionRow = typeof candidateSubmissions.$inferSelect;
export type CandidateSubmissionInsert = typeof candidateSubmissions.$inferInsert;
export type CandidateResumeRow = typeof candidateResumes.$inferSelect;
export type CandidateResumeInsert = typeof candidateResumes.$inferInsert;
export type CandidateResumeShareRow = typeof candidateResumeShares.$inferSelect;
export type CandidateInteractionRow = typeof candidateInteractions.$inferSelect;
export type RecruiterMatchScoreRow = typeof recruiterMatchScores.$inferSelect;
export type RecruiterMatchScoreInsert = typeof recruiterMatchScores.$inferInsert;
export type TalentPoolCandidateRow = typeof talentPoolCandidates.$inferSelect;
export type TalentPoolCandidateInsert = typeof talentPoolCandidates.$inferInsert;

export interface ICompaniesRepository {
  // companyProfiles
  findCompanyById(id: string): Promise<CompanyProfileRow | null>;
  findCompaniesByIds(ids: string[]): Promise<CompanyProfileRow[]>;
  listActiveCompanies(search?: string, limit?: number): Promise<CompanyProfileRow[]>;
  countCompanies(): Promise<number>;
  countCompaniesCreatedSince(since: Date): Promise<number>;
  insertCompany(input: CompanyProfileInsert): Promise<CompanyProfileRow>;
  updateCompanyById(id: string, patch: Partial<CompanyProfileInsert>): Promise<CompanyProfileRow | null>;
  deleteCompanyById(id: string): Promise<boolean>;
  // candidateSubmissions
  findSubmissionsByRecruiter(recruiterId: string): Promise<CandidateSubmissionRow[]>;
  insertSubmission(input: CandidateSubmissionInsert): Promise<CandidateSubmissionRow>;
  // candidateResumes
  findCandidateResumeById(id: string): Promise<CandidateResumeRow | null>;
  findCandidateResumesForCompany(companyId: string): Promise<CandidateResumeRow[]>;
  insertCandidateResume(input: CandidateResumeInsert): Promise<CandidateResumeRow>;
  // shares
  findSharesForCandidateResume(candidateResumeId: string): Promise<CandidateResumeShareRow[]>;
  // interactions (keyed by recruiter + candidate user ids)
  findInteractionsByRecruiterCandidate(recruiterId: string, candidateId: string): Promise<CandidateInteractionRow[]>;
  // recruiter-side matching + talent pool (the sourcing side of the pipeline)
  findRecruiterMatchByPair(recruiterId: string, candidateId: string): Promise<RecruiterMatchScoreRow | null>;
  upsertRecruiterMatch(input: RecruiterMatchScoreInsert): Promise<void>;
  findTalentPoolForRecruiter(recruiterId: string): Promise<TalentPoolCandidateRow[]>;
  insertTalentPoolCandidate(input: TalentPoolCandidateInsert): Promise<TalentPoolCandidateRow>;
  removeTalentPoolCandidate(id: string, recruiterId: string): Promise<boolean>;
}

export class CompaniesRepository implements ICompaniesRepository {
  constructor(private readonly db: DbLike, private readonly now: () => Date = () => new Date()) {}

  // ── companyProfiles ───────────────────────────────────────────────────────

  async findCompanyById(id: string): Promise<CompanyProfileRow | null> {
    const [row] = await this.db.select().from(companyProfiles).where(eq(companyProfiles.id, id)).limit(1);
    return (row as CompanyProfileRow) ?? null;
  }

  async findCompaniesByIds(ids: string[]): Promise<CompanyProfileRow[]> {
    if (ids.length === 0) return [];
    return (await this.db.select().from(companyProfiles).where(inArray(companyProfiles.id, ids))) as CompanyProfileRow[];
  }

  async listActiveCompanies(search?: string, limit = 100): Promise<CompanyProfileRow[]> {
    const active = eq(companyProfiles.isActive, true);
    const where = search
      ? and(active, or(
          ilike(companyProfiles.name, `%${search}%`),
          ilike(companyProfiles.description, `%${search}%`),
        ))
      : active;
    return (await this.db
      .select()
      .from(companyProfiles)
      .where(where)
      .orderBy(desc(companyProfiles.createdAt))
      .limit(Math.min(500, Math.max(1, limit)))) as CompanyProfileRow[];
  }

  async countCompanies(): Promise<number> {
    const [row] = await this.db.select({ n: count() }).from(companyProfiles);
    return Number(row?.n ?? 0);
  }

  async countCompaniesCreatedSince(since: Date): Promise<number> {
    const [row] = await this.db.select({ n: count() }).from(companyProfiles).where(gte(companyProfiles.createdAt, since));
    return Number(row?.n ?? 0);
  }

  async insertCompany(input: CompanyProfileInsert): Promise<CompanyProfileRow> {
    const [created] = await this.db.insert(companyProfiles).values(input as any).returning();
    return created as CompanyProfileRow;
  }

  async updateCompanyById(id: string, patch: Partial<CompanyProfileInsert>): Promise<CompanyProfileRow | null> {
    const [updated] = await this.db
      .update(companyProfiles)
      .set({ ...patch, updatedAt: this.now() } as any)
      .where(eq(companyProfiles.id, id))
      .returning();
    return (updated as CompanyProfileRow) ?? null;
  }

  async deleteCompanyById(id: string): Promise<boolean> {
    const existing = await this.findCompanyById(id);
    if (!existing) return false;
    await this.db.delete(companyProfiles).where(eq(companyProfiles.id, id));
    return true;
  }

  // ── candidateSubmissions ──────────────────────────────────────────────────

  async findSubmissionsByRecruiter(recruiterId: string): Promise<CandidateSubmissionRow[]> {
    return (await this.db
      .select()
      .from(candidateSubmissions)
      .where(eq(candidateSubmissions.recruiterId, recruiterId))) as CandidateSubmissionRow[];
  }

  async insertSubmission(input: CandidateSubmissionInsert): Promise<CandidateSubmissionRow> {
    const [row] = await this.db.insert(candidateSubmissions).values(input as any).returning();
    return row as CandidateSubmissionRow;
  }

  // ── candidateResumes ──────────────────────────────────────────────────────
  // candidateResumes is keyed by `companyId` (recruiter's company), not by
  // recruiter user id — finder reflects that.

  async findCandidateResumeById(id: string): Promise<CandidateResumeRow | null> {
    const [row] = await this.db.select().from(candidateResumes).where(eq(candidateResumes.id, id)).limit(1);
    return (row as CandidateResumeRow) ?? null;
  }

  async findCandidateResumesForCompany(companyId: string): Promise<CandidateResumeRow[]> {
    return (await this.db
      .select()
      .from(candidateResumes)
      .where(eq(candidateResumes.companyId, companyId))) as CandidateResumeRow[];
  }

  async insertCandidateResume(input: CandidateResumeInsert): Promise<CandidateResumeRow> {
    // #1407 — Reject inserts when the linked user has a workforce role.
    // Employees are scoped to one employer and never surface in
    // pitch-deck candidate selection. The schema's `linkedUserId` is
    // nullable, so unlinked rows pass through unchanged.
    const linkedUserId = (input as { linkedUserId?: string | null }).linkedUserId;
    if (linkedUserId) {
      const [u] = await this.db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, linkedUserId))
        .limit(1);
      if (u && (NON_CANDIDATE_ROLES as readonly string[]).includes(u.role)) {
        throw new Error(`User ${linkedUserId} has a non-candidate role (${u.role}) and cannot be added to a candidate resume`);
      }
    }
    const [row] = await this.db.insert(candidateResumes).values(input as any).returning();
    return row as CandidateResumeRow;
  }

  async findSharesForCandidateResume(candidateResumeId: string): Promise<CandidateResumeShareRow[]> {
    return (await this.db
      .select()
      .from(candidateResumeShares)
      .where(eq(candidateResumeShares.candidateResumeId, candidateResumeId))) as CandidateResumeShareRow[];
  }

  /** Interactions are keyed by `(recruiterId, candidateId)` — recruiter
   *  notes about a candidate — not by candidateResume. */
  async findInteractionsByRecruiterCandidate(
    recruiterId: string,
    candidateId: string,
  ): Promise<CandidateInteractionRow[]> {
    return (await this.db
      .select()
      .from(candidateInteractions)
      .where(and(
        eq(candidateInteractions.recruiterId, recruiterId),
        eq(candidateInteractions.candidateId, candidateId),
      ))) as CandidateInteractionRow[];
  }

  // ── recruiter matching + talent pool ─────────────────────────────────────
  //
  // Lives here (not in Jobs) because the recruiter owns the pairing
  // between themselves and a candidate — it's a sourcing/qualifying
  // artifact. Resume ↔ job matches (seeker-initiated) live in
  // JobsRepository instead.

  async findRecruiterMatchByPair(recruiterId: string, candidateId: string): Promise<RecruiterMatchScoreRow | null> {
    const [row] = await this.db
      .select()
      .from(recruiterMatchScores)
      .where(and(
        eq(recruiterMatchScores.recruiterId, recruiterId),
        eq(recruiterMatchScores.candidateId, candidateId),
      ))
      .limit(1);
    return (row as RecruiterMatchScoreRow) ?? null;
  }

  async upsertRecruiterMatch(input: RecruiterMatchScoreInsert): Promise<void> {
    await this.db.insert(recruiterMatchScores).values(input as any);
  }

  async findTalentPoolForRecruiter(recruiterId: string): Promise<TalentPoolCandidateRow[]> {
    return (await this.db
      .select()
      .from(talentPoolCandidates)
      .where(eq(talentPoolCandidates.recruiterId, recruiterId))) as TalentPoolCandidateRow[];
  }

  async insertTalentPoolCandidate(input: TalentPoolCandidateInsert): Promise<TalentPoolCandidateRow> {
    const [row] = await this.db.insert(talentPoolCandidates).values(input as any).returning();
    return row as TalentPoolCandidateRow;
  }

  async removeTalentPoolCandidate(id: string, recruiterId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: talentPoolCandidates.id })
      .from(talentPoolCandidates)
      .where(and(
        eq(talentPoolCandidates.id, id),
        eq(talentPoolCandidates.recruiterId, recruiterId),
      ))
      .limit(1);
    if (!row) return false;
    await this.db
      .delete(talentPoolCandidates)
      .where(and(
        eq(talentPoolCandidates.id, id),
        eq(talentPoolCandidates.recruiterId, recruiterId),
      ));
    return true;
  }
}
