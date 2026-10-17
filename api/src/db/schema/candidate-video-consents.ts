import { sql } from "drizzle-orm";
import { pgTable, uuid, varchar, text, integer, timestamp, index, uniqueIndex, check } from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { studioProjects } from "./resumes.js";
import { talentPoolCandidates } from "./recruiter.js";
import { videos } from "./videos.js";

/**
 * candidate_video_consents — a candidate's approval of a recruiter's
 * candidate-for-job video (migration 0534). See
 * shared/candidate-video-consent.ts for the status vocabulary; the CHECK
 * below mirrors CANDIDATE_VIDEO_CONSENT_STATUSES (pinned by
 * candidate-video-consent-schema.test.ts). `token_hash` is the sha256 hex of
 * the emailed token — the raw token is never stored. The `approved_*`
 * columns pin the content the candidate approved (see the migration);
 * `withdrawn_at` marks an approval the candidate withdrew.
 */
export const candidateVideoConsents = pgTable(
  "candidate_video_consents",
  {
    id:                    uuid("id").primaryKey().defaultRandom(),
    projectId:             uuid("project_id").notNull().references(() => studioProjects.id, { onDelete: "cascade" }),
    recruiterId:           uuid("recruiter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    talentPoolCandidateId: uuid("talent_pool_candidate_id").references(() => talentPoolCandidates.id, { onDelete: "set null" }),
    candidateName:         varchar("candidate_name", { length: 255 }).notNull(),
    candidateEmail:        varchar("candidate_email", { length: 255 }).notNull(),
    tokenHash:             varchar("token_hash", { length: 64 }).notNull(),
    status:                varchar("status", { length: 16 }).notNull().default("pending"),
    message:               text("message"),
    requestedAt:           timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
    respondedAt:           timestamp("responded_at", { withTimezone: true }),
    expiresAt:             timestamp("expires_at", { withTimezone: true }).notNull(),
    responseIp:            varchar("response_ip", { length: 64 }),
    approvedVideoId:       uuid("approved_video_id").references(() => videos.id, { onDelete: "set null" }),
    approvedVideoR2Key:    text("approved_video_r2_key"),
    approvedRevision:      integer("approved_revision"),
    withdrawnAt:           timestamp("withdrawn_at", { withTimezone: true }),
    createdAt:             timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt:             timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_candidate_video_consents_token_hash").on(t.tokenHash),
    index("idx_candidate_video_consents_project_requested").on(t.projectId, t.requestedAt.desc().nullsFirst()),
    index("idx_candidate_video_consents_recruiter_requested").on(t.recruiterId, t.requestedAt.desc().nullsFirst()),
    check(
      "candidate_video_consents_status_check",
      sql`${t.status} IN ('pending', 'approved', 'declined', 'expired', 'revoked')`,
    ),
    index("idx_candidate_video_consents_approved_video_id").on(t.approvedVideoId),
    index("idx_candidate_video_consents_talent_pool_candidate_id").on(t.talentPoolCandidateId),
  ],
);

export type CandidateVideoConsentRow = typeof candidateVideoConsents.$inferSelect;
export type NewCandidateVideoConsentRow = typeof candidateVideoConsents.$inferInsert;
