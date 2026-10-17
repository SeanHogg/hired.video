/**
 * CandidateVideoConsentRepository — data access for candidate_video_consents
 * (migration 0534) plus the few reads the consent use cases need from the
 * tables around it (the project's owner + subjects, the talent-pool row, the
 * public-page context). Use cases live in domains/candidate-consent/.
 *
 * Every state transition is a conditional UPDATE (`WHERE status = 'pending'`,
 * or `= 'approved'` for a withdrawal) so two concurrent responses can never
 * both win.
 */

import { and, desc, eq, gt, inArray, or, sql } from "drizzle-orm";
import { schema } from "../db/index.js";
import type { CandidateVideoConsentStatus } from "../../../shared/candidate-video-consent.js";
import type {
  CandidateVideoConsentRow,
  NewCandidateVideoConsentRow,
} from "../db/schema/candidate-video-consents.js";

const {
  candidateVideoConsents: consents,
  studioProjects,
  studioProjectSubjects,
  talentPoolCandidates,
  users,
  jobItems,
  companyProfiles,
  userCompanyRoleAssociations,
  videos,
} = schema;

export type DbLike = any;

export type { CandidateVideoConsentRow };

export interface ConsentProjectOwner {
  id: string;
  userId: string;
  companyId: string | null;
}

export interface ConsentTalentPoolCandidate {
  id: string;
  candidateName: string;
  candidateEmail: string | null;
}

/** What the candidate's public page shows beside the consent row. */
export interface ConsentPublicContext {
  recruiterName: string | null;
  jobTitle: string | null;
  companyName: string | null;
  /** R2 key of the project's rendered video, when one exists. The watch page
   *  shows a non-public project as "pending", so the preview is the file. */
  videoR2Key: string | null;
}

/** What a project currently shows — the approval pins one of these. */
export interface ConsentProjectContent {
  videoId: string | null;
  /** The rendered file (a re-render reuses the videos row with a new key). */
  videoR2Key: string | null;
  /** `studio_projects.revision` (save-draft's content revision; 0 before #2242). */
  revision: number;
}

/** The recruiter's own address + the websites of the companies they act for. */
export interface ConsentRecruiterIdentity {
  email: string | null;
  companyWebsites: string[];
}

export interface ICandidateVideoConsentRepository {
  findProjectOwner(projectId: string): Promise<ConsentProjectOwner | null>;
  /** The `talent_pool_candidate` subject id linked to the project, if any. */
  findCandidateSubjectId(projectId: string): Promise<string | null>;
  /** Link the project to the talent-pool row (idempotent) so the gate binds. */
  linkCandidateSubject(projectId: string, talentPoolCandidateId: string): Promise<void>;
  /** A talent-pool row the recruiter owns (null when not theirs / missing). */
  findTalentPoolCandidate(id: string, recruiterId: string): Promise<ConsentTalentPoolCandidate | null>;
  insert(row: NewCandidateVideoConsentRow): Promise<CandidateVideoConsentRow>;
  /** Supersede the project's live asks — every pending or approved row →
   *  `revoked` (no withdrawn_at), so one link per project stays live. */
  supersedeForProject(projectId: string): Promise<void>;
  findById(id: string): Promise<CandidateVideoConsentRow | null>;
  findByTokenHash(tokenHash: string): Promise<CandidateVideoConsentRow | null>;
  /** Newest first. */
  listForProject(projectId: string): Promise<CandidateVideoConsentRow[]>;
  latestForProject(projectId: string): Promise<CandidateVideoConsentRow | null>;
  /** New token + expiry on a pending / expired row; back to `pending`. */
  reissue(id: string, tokenHash: string, expiresAt: Date): Promise<CandidateVideoConsentRow | null>;
  markExpired(id: string): Promise<void>;
  /** pending + unexpired → `status`; null when the guard didn't match. An
   *  approval also pins `approved` (what the candidate said yes to). */
  respond(
    id: string,
    status: CandidateVideoConsentStatus,
    ip: string | null,
    approved?: ConsentProjectContent | null,
  ): Promise<CandidateVideoConsentRow | null>;
  /** approved → `revoked` + withdrawn_at (any expiry); null when not approved.
   *  response_ip keeps the approving IP. */
  withdraw(id: string): Promise<CandidateVideoConsentRow | null>;
  findProjectContent(projectId: string): Promise<ConsentProjectContent | null>;
  /** The recruiter's email + the websites of the project's company and the
   *  companies the recruiter owns or is a member of. */
  findRecruiterIdentity(recruiterId: string, projectCompanyId: string | null): Promise<ConsentRecruiterIdentity>;
  loadPublicContext(row: CandidateVideoConsentRow): Promise<ConsentPublicContext>;
}

export class CandidateVideoConsentRepository implements ICandidateVideoConsentRepository {
  constructor(private readonly db: DbLike, private readonly now: () => Date = () => new Date()) {}

  async findProjectOwner(projectId: string): Promise<ConsentProjectOwner | null> {
    const [row] = await this.db
      .select({ id: studioProjects.id, userId: studioProjects.userId, companyId: studioProjects.companyId })
      .from(studioProjects)
      .where(eq(studioProjects.id, projectId))
      .limit(1);
    return row ?? null;
  }

  async findCandidateSubjectId(projectId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: studioProjectSubjects.subjectId })
      .from(studioProjectSubjects)
      .where(and(
        eq(studioProjectSubjects.projectId, projectId),
        eq(studioProjectSubjects.subjectKind, "talent_pool_candidate"),
      ))
      .limit(1);
    return row?.id ?? null;
  }

  async linkCandidateSubject(projectId: string, talentPoolCandidateId: string): Promise<void> {
    await this.db
      .insert(studioProjectSubjects)
      .values({ projectId, subjectKind: "talent_pool_candidate", subjectId: talentPoolCandidateId })
      .onConflictDoNothing();
  }

  async findTalentPoolCandidate(id: string, recruiterId: string): Promise<ConsentTalentPoolCandidate | null> {
    const [row] = await this.db
      .select({
        id: talentPoolCandidates.id,
        candidateName: talentPoolCandidates.candidateName,
        candidateEmail: talentPoolCandidates.candidateEmail,
      })
      .from(talentPoolCandidates)
      .where(and(eq(talentPoolCandidates.id, id), eq(talentPoolCandidates.recruiterId, recruiterId)))
      .limit(1);
    return row ?? null;
  }

  async insert(row: NewCandidateVideoConsentRow): Promise<CandidateVideoConsentRow> {
    const [created] = await this.db.insert(consents).values(row).returning();
    return created;
  }

  async supersedeForProject(projectId: string): Promise<void> {
    await this.db
      .update(consents)
      .set({ status: "revoked", updatedAt: this.now() })
      .where(and(eq(consents.projectId, projectId), inArray(consents.status, ["pending", "approved"])));
  }

  async findById(id: string): Promise<CandidateVideoConsentRow | null> {
    const [row] = await this.db.select().from(consents).where(eq(consents.id, id)).limit(1);
    return row ?? null;
  }

  async findByTokenHash(tokenHash: string): Promise<CandidateVideoConsentRow | null> {
    const [row] = await this.db.select().from(consents).where(eq(consents.tokenHash, tokenHash)).limit(1);
    return row ?? null;
  }

  async listForProject(projectId: string): Promise<CandidateVideoConsentRow[]> {
    return this.db
      .select()
      .from(consents)
      .where(eq(consents.projectId, projectId))
      .orderBy(desc(consents.requestedAt));
  }

  async latestForProject(projectId: string): Promise<CandidateVideoConsentRow | null> {
    const [row] = await this.db
      .select()
      .from(consents)
      .where(eq(consents.projectId, projectId))
      .orderBy(desc(consents.requestedAt))
      .limit(1);
    return row ?? null;
  }

  async reissue(id: string, tokenHash: string, expiresAt: Date): Promise<CandidateVideoConsentRow | null> {
    const now = this.now();
    const [row] = await this.db
      .update(consents)
      .set({ tokenHash, expiresAt, status: "pending", requestedAt: now, respondedAt: null, responseIp: null, updatedAt: now })
      .where(and(eq(consents.id, id), inArray(consents.status, ["pending", "expired"])))
      .returning();
    return row ?? null;
  }

  async markExpired(id: string): Promise<void> {
    await this.db
      .update(consents)
      .set({ status: "expired", updatedAt: this.now() })
      .where(and(eq(consents.id, id), eq(consents.status, "pending")));
  }

  async respond(
    id: string,
    status: CandidateVideoConsentStatus,
    ip: string | null,
    approved?: ConsentProjectContent | null,
  ): Promise<CandidateVideoConsentRow | null> {
    const now = this.now();
    const pin = approved
      ? { approvedVideoId: approved.videoId, approvedVideoR2Key: approved.videoR2Key, approvedRevision: approved.revision }
      : {};
    const [row] = await this.db
      .update(consents)
      .set({ status, respondedAt: now, responseIp: ip, updatedAt: now, ...pin })
      .where(and(eq(consents.id, id), eq(consents.status, "pending"), gt(consents.expiresAt, now)))
      .returning();
    return row ?? null;
  }

  async withdraw(id: string): Promise<CandidateVideoConsentRow | null> {
    const now = this.now();
    const [row] = await this.db
      .update(consents)
      .set({ status: "revoked", withdrawnAt: now, updatedAt: now })
      .where(and(eq(consents.id, id), eq(consents.status, "approved")))
      .returning();
    return row ?? null;
  }

  async findProjectContent(projectId: string): Promise<ConsentProjectContent | null> {
    const [row] = await this.db
      .select({
        videoId: studioProjects.videoId,
        videoR2Key: videos.r2Key,
        revision: studioProjects.revision,
      })
      .from(studioProjects)
      .leftJoin(videos, eq(videos.id, studioProjects.videoId))
      .where(eq(studioProjects.id, projectId))
      .limit(1);
    if (!row) return null;
    return { videoId: row.videoId ?? null, videoR2Key: row.videoR2Key ?? null, revision: Number(row.revision) || 0 };
  }

  async findRecruiterIdentity(recruiterId: string, projectCompanyId: string | null): Promise<ConsentRecruiterIdentity> {
    const [[user], companies] = await Promise.all([
      this.db.select({ email: users.email }).from(users).where(eq(users.id, recruiterId)).limit(1),
      // The project's company, companies the recruiter owns, and those they
      // are an active member of (the studio write rule's company scope).
      this.db
        .select({ website: companyProfiles.website })
        .from(companyProfiles)
        .where(or(
          eq(companyProfiles.ownerId, recruiterId),
          inArray(
            companyProfiles.id,
            this.db
              .select({ id: userCompanyRoleAssociations.companyId })
              .from(userCompanyRoleAssociations)
              .where(and(eq(userCompanyRoleAssociations.userId, recruiterId), eq(userCompanyRoleAssociations.isActive, true))),
          ),
          ...(projectCompanyId ? [eq(companyProfiles.id, projectCompanyId)] : []),
        )),
    ]);
    return {
      email: user?.email ?? null,
      companyWebsites: (companies as Array<{ website: string | null }>).flatMap((c) => (c.website ? [c.website] : [])),
    };
  }

  async loadPublicContext(row: CandidateVideoConsentRow): Promise<ConsentPublicContext> {
    const [[recruiter], [project], [job]] = await Promise.all([
      this.db.select({ name: users.name }).from(users).where(eq(users.id, row.recruiterId)).limit(1),
      this.db
        .select({ r2Key: videos.r2Key, companyName: companyProfiles.name })
        .from(studioProjects)
        .leftJoin(companyProfiles, eq(companyProfiles.id, studioProjects.companyId))
        .leftJoin(videos, eq(videos.id, studioProjects.videoId))
        .where(eq(studioProjects.id, row.projectId))
        .limit(1),
      this.db
        .select({ title: jobItems.title, company: jobItems.company })
        .from(studioProjectSubjects)
        // subject_id is text (polymorphic), job_items.id is uuid.
        .innerJoin(jobItems, sql`${jobItems.id}::text = ${studioProjectSubjects.subjectId}`)
        .where(and(eq(studioProjectSubjects.projectId, row.projectId), eq(studioProjectSubjects.subjectKind, "job")))
        .limit(1),
    ]);
    return {
      recruiterName: recruiter?.name ?? null,
      jobTitle: job?.title ?? null,
      companyName: job?.company ?? project?.companyName ?? null,
      videoR2Key: project?.r2Key ?? null,
    };
  }
}
