/**
 * In-memory stand-ins for the candidate-consent ports (same guard semantics
 * as the Drizzle repository), shared by the domain tests.
 */
import type {
  CandidateVideoConsentRow,
  ConsentProjectContent,
  ConsentPublicContext,
  ConsentRecruiterIdentity,
  ConsentTalentPoolCandidate,
  ICandidateVideoConsentRepository,
} from "../../../repositories/candidateVideoConsentRepository.js";
import type { NewCandidateVideoConsentRow } from "../../../db/schema/candidate-video-consents.js";
import type { CandidateVideoConsentStatus } from "../../../../../shared/candidate-video-consent.js";
import type { CandidateConsentDeps, ConsentEmail } from "../ports.js";

export const RECRUITER = "6a1f0c2e-8b3d-4f5a-9c7e-1d2b3a4c5e6f";
export const STRANGER = "2c9e7b1a-4d6f-4e8a-b0c2-3f5a7c9e1b2d";
export const PROJECT = "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a";
export const POOL_ROW = "4b5c6d7e-8f90-4a1b-9c2d-3e4f5a6b7c8d";
export const OTHER_POOL_ROW = "5c6d7e8f-9012-4b3c-8d4e-5f6a7b8c9d0e";
export const VIDEO = "3a4b5c6d-7e8f-4901-8a2b-3c4d5e6f7a8b";
export const T0 = new Date("2026-10-16T15:00:00.000Z");
export const DAY = 24 * 60 * 60 * 1000;

export class FakeConsentRepo implements ICandidateVideoConsentRepository {
  rows: CandidateVideoConsentRow[] = [];
  subjects = new Map<string, string>();
  projects = new Map([[PROJECT, { id: PROJECT, userId: RECRUITER, companyId: null as string | null }]]);
  content = new Map<string, ConsentProjectContent>([[PROJECT, { videoId: VIDEO, videoR2Key: "studio/abc/render-1.mp4", revision: 3 }]]);
  pool: (ConsentTalentPoolCandidate & { recruiterId: string })[] = [
    { id: POOL_ROW, recruiterId: RECRUITER, candidateName: "Dana Whitfield", candidateEmail: "Dana.Whitfield@example.com" },
  ];
  identity: ConsentRecruiterIdentity = { email: "morgan.reyes@northwind-logistics.com", companyWebsites: ["https://www.northwind-logistics.com/careers"] };
  private seq = 0;
  constructor(private readonly clock: () => Date) {}

  async findProjectOwner(projectId: string) { return this.projects.get(projectId) ?? null; }
  async findCandidateSubjectId(projectId: string) { return this.subjects.get(projectId) ?? null; }
  async linkCandidateSubject(projectId: string, id: string) { this.subjects.set(projectId, id); }
  async findTalentPoolCandidate(id: string, recruiterId: string) {
    const p = this.pool.find((r) => r.id === id && r.recruiterId === recruiterId);
    return p ? { id: p.id, candidateName: p.candidateName, candidateEmail: p.candidateEmail } : null;
  }
  async insert(row: NewCandidateVideoConsentRow) {
    const now = this.clock();
    const full = {
      id: `00000000-0000-4000-8000-00000000000${++this.seq}`,
      talentPoolCandidateId: null,
      message: null,
      respondedAt: null,
      responseIp: null,
      approvedVideoId: null,
      approvedVideoR2Key: null,
      approvedRevision: null,
      withdrawnAt: null,
      createdAt: now,
      updatedAt: now,
      status: "pending",
      requestedAt: now,
      ...row,
    } as CandidateVideoConsentRow;
    this.rows.push(full);
    return full;
  }
  async supersedeForProject(projectId: string) {
    for (const r of this.rows) {
      if (r.projectId === projectId && (r.status === "pending" || r.status === "approved")) r.status = "revoked";
    }
  }
  async findById(id: string) { return this.rows.find((r) => r.id === id) ?? null; }
  async findByTokenHash(h: string) { return this.rows.find((r) => r.tokenHash === h) ?? null; }
  async listForProject(projectId: string) {
    return this.rows
      .filter((r) => r.projectId === projectId)
      .sort((a, b) => +b.requestedAt - +a.requestedAt || b.id.localeCompare(a.id));
  }
  async latestForProject(projectId: string) { return (await this.listForProject(projectId))[0] ?? null; }
  async reissue(id: string, tokenHash: string, expiresAt: Date) {
    const r = this.rows.find((x) => x.id === id && (x.status === "pending" || x.status === "expired"));
    if (!r) return null;
    Object.assign(r, { tokenHash, expiresAt, status: "pending", requestedAt: this.clock(), respondedAt: null, responseIp: null });
    return r;
  }
  async markExpired(id: string) {
    const r = this.rows.find((x) => x.id === id && x.status === "pending");
    if (r) r.status = "expired";
  }
  async respond(id: string, status: CandidateVideoConsentStatus, ip: string | null, approved?: ConsentProjectContent | null) {
    const now = this.clock();
    const r = this.rows.find((x) => x.id === id && x.status === "pending" && +x.expiresAt > +now);
    if (!r) return null;
    Object.assign(r, { status, respondedAt: now, responseIp: ip });
    if (approved) {
      Object.assign(r, { approvedVideoId: approved.videoId, approvedVideoR2Key: approved.videoR2Key, approvedRevision: approved.revision });
    }
    return r;
  }
  async withdraw(id: string) {
    const r = this.rows.find((x) => x.id === id && x.status === "approved");
    if (!r) return null;
    Object.assign(r, { status: "revoked", withdrawnAt: this.clock() });
    return r;
  }
  async findProjectContent(projectId: string) {
    const c = this.content.get(projectId);
    return c ? { ...c } : null;
  }
  async findRecruiterIdentity(): Promise<ConsentRecruiterIdentity> { return this.identity; }
  async loadPublicContext(): Promise<ConsentPublicContext> {
    return { recruiterName: "Morgan Reyes", jobTitle: "Senior Data Analyst", companyName: "Northwind Logistics", videoR2Key: "studio/abc/video.mp4" };
  }
}

export interface ConsentHarness {
  repo: FakeConsentRepo;
  sent: ConsentEmail[];
  /** Project ids forceUnlisted ran for, in order. */
  unlisted: string[];
  deps: CandidateConsentDeps;
  setNow(d: Date): void;
}

export function consentHarness(): ConsentHarness {
  let now = T0;
  const repo = new FakeConsentRepo(() => now);
  const sent: ConsentEmail[] = [];
  const unlisted: string[] = [];
  return {
    repo,
    sent,
    unlisted,
    setNow: (d) => {
      now = d;
    },
    deps: {
      repo,
      canWrite: async (actor, owner) => actor === owner,
      sendEmail: async (input) => {
        sent.push(input);
      },
      forceUnlisted: async (projectId) => {
        unlisted.push(projectId);
      },
      now: () => now,
    },
  };
}
