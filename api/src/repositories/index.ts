/**
 * Repositories container — single entry point for every data-access
 * object in the api. Services take a `Repos` (or just the one repo they
 * need) via DI; production wiring calls `buildRepos(getDb())` once per
 * request and threads the result through; tests construct a `Repos`
 * where each field is a hand-rolled mock.
 *
 * Layering rule (see README.md §13):
 *   • One repository per aggregate (transactional unit).
 *   • Bounded-context grouping happens in `services/<domain>/`, not
 *     here — this file stays flat.
 *   • Services compose repos; repos never compose each other.
 *
 * Adding a new repo:
 *   1. Create `xxxRepository.ts` with `IXxxRepository` interface.
 *   2. Import below, add to `Repos`, add to `buildRepos()`.
 *   3. Re-export the interface + row/insert types.
 */

import type { getDb } from "../db/index.js";
import { ResumeRepository, type IResumeRepository } from "./resumeRepository.js";
import { UsersRepository, type IUsersRepository } from "./usersRepository.js";
import { PreferencesRepository, type IPreferencesRepository } from "./preferencesRepository.js";
import { AutofillRepository, type IAutofillRepository } from "./autofillRepository.js";
import { JobsRepository, type IJobsRepository } from "./jobsRepository.js";
import { CompaniesRepository, type ICompaniesRepository } from "./companiesRepository.js";
import { HiringPipelineRepository, type IHiringPipelineRepository } from "./hiringPipelineRepository.js";
import { SubscriptionsRepository, type ISubscriptionsRepository } from "./subscriptionsRepository.js";
import { TokensRepository, type ITokensRepository } from "./tokensRepository.js";
import { InvoicesRepository, type IInvoicesRepository } from "./invoicesRepository.js";
import { AuthTokensRepository, type IAuthTokensRepository } from "./authTokensRepository.js";
import { AuthzRepository, type IAuthzRepository } from "./authzRepository.js";
import { AuditRepository, type IAuditRepository } from "./auditRepository.js";
import { NotificationsRepository, type INotificationsRepository } from "./notificationsRepository.js";
import { ConversationsRepository, type IConversationsRepository } from "./conversationsRepository.js";
import { FollowUpsRepository, type IFollowUpsRepository } from "./followUpsRepository.js";
import { MediaRepository, type IMediaRepository } from "./mediaRepository.js";
import { MarketingRepository, type IMarketingRepository } from "./marketingRepository.js";
import { PlatformRepository, type IPlatformRepository } from "./platformRepository.js";

type DbHandle = ReturnType<typeof getDb>;

/** All 19 repositories the app needs. One per aggregate; bounded-context
 *  grouping is a service-layer concern (see `services/<domain>/`). */
export interface Repos {
  // resume aggregate module
  resumes: IResumeRepository;
  // user aggregate module
  users: IUsersRepository;
  preferences: IPreferencesRepository;
  autofill: IAutofillRepository;
  // job aggregate module
  jobs: IJobsRepository;
  // company aggregate module
  companies: ICompaniesRepository;
  hiringPipeline: IHiringPipelineRepository;
  // billing aggregate module
  subscriptions: ISubscriptionsRepository;
  tokens: ITokensRepository;
  invoices: IInvoicesRepository;
  // auth aggregate module
  authTokens: IAuthTokensRepository;
  authz: IAuthzRepository;
  audit: IAuditRepository;
  // messaging aggregate module
  notifications: INotificationsRepository;
  conversations: IConversationsRepository;
  followUps: IFollowUpsRepository;
  // media aggregate module
  media: IMediaRepository;
  // marketing aggregate module
  marketing: IMarketingRepository;
  // platform aggregate module
  platform: IPlatformRepository;
}

/** Wire every interface to its concrete implementation. */
export function buildRepos(db: DbHandle, now: () => Date = () => new Date()): Repos {
  return {
    resumes: new ResumeRepository(db, now),
    users: new UsersRepository(db, now),
    preferences: new PreferencesRepository(db, now),
    autofill: new AutofillRepository(db, now),
    jobs: new JobsRepository(db, now),
    companies: new CompaniesRepository(db, now),
    hiringPipeline: new HiringPipelineRepository(db, now),
    subscriptions: new SubscriptionsRepository(db, now),
    tokens: new TokensRepository(db, now),
    invoices: new InvoicesRepository(db, now),
    authTokens: new AuthTokensRepository(db, now),
    authz: new AuthzRepository(db, now),
    audit: new AuditRepository(db, now),
    notifications: new NotificationsRepository(db, now),
    conversations: new ConversationsRepository(db, now),
    followUps: new FollowUpsRepository(db, now),
    media: new MediaRepository(db, now),
    marketing: new MarketingRepository(db, now),
    platform: new PlatformRepository(db, now),
  };
}

// ── Re-export interfaces ────────────────────────────────────────────────────
// Services should import I*Repository from here, not from the individual
// repo files, so a later reshuffle of repo file paths doesn't ripple.

export type {
  IResumeRepository,
  IUsersRepository,
  IPreferencesRepository,
  IAutofillRepository,
  IJobsRepository,
  ICompaniesRepository,
  IHiringPipelineRepository,
  ISubscriptionsRepository,
  ITokensRepository,
  IInvoicesRepository,
  IAuthTokensRepository,
  IAuthzRepository,
  IAuditRepository,
  INotificationsRepository,
  IConversationsRepository,
  IFollowUpsRepository,
  IMediaRepository,
  IMarketingRepository,
  IPlatformRepository,
};

// ── Re-export row / insert / patch types ───────────────────────────────────

export type { ResumeRow, ResumeInsert, ResumePatch, PaginationOptions } from "./resumeRepository.js";
export type { UserRow, UserInsert, UserPatch, UserSearchFilters, UserSearchResult, UserProfileRow, UserProfileInsert, UserConnectionRow, UserConnectionInsert } from "./usersRepository.js";
export type { AccountPreferencesRow, AccountPreferencesInsert, PrivacyPreferencesRow, PrivacyPreferencesInsert, CookiePreferencesRow, CookiePreferencesInsert, JobPreferencesRow, JobPreferencesInsert } from "./preferencesRepository.js";
export type { AnswerCacheRow, AnswerCacheInsert, ApplicationFormAnswerRow, ApplicationFormAnswerInsert } from "./autofillRepository.js";
export type { JobRow, JobInsert, JobApplicationRow, JobApplicationInsert, SavedJobRow, SavedJobInsert, JobSearchFilters, ResumeMatchScoreRow, ResumeMatchScoreInsert } from "./jobsRepository.js";
export type { CompanyProfileRow, CompanyProfileInsert, CandidateSubmissionRow, CandidateSubmissionInsert, CandidateResumeRow, CandidateResumeInsert, RecruiterMatchScoreRow, RecruiterMatchScoreInsert, TalentPoolCandidateRow, TalentPoolCandidateInsert } from "./companiesRepository.js";
export type { InterviewSessionRow, InterviewSessionInsert, OfferLetterRow, OfferLetterInsert, OnboardingChecklistRow, OnboardingTaskRow, OnboardingTaskInsert } from "./hiringPipelineRepository.js";
export type { SubscriptionRow, SubscriptionInsert, SubscriptionPlanRow, PlanOverrideRow, PlanOverrideInsert } from "./subscriptionsRepository.js";
export type { UserTokenBalanceRow, TokenPackPurchaseRow, TokenPackPurchaseInsert, AiUsageRow, AiUsageInsert, ToolRunRow, ToolRunInsert } from "./tokensRepository.js";
export type { InvoiceRow, InvoiceInsert, BillingEventInsert } from "./invoicesRepository.js";
export type {
  PasswordResetTokenRow, PasswordResetTokenInsert,
  EmailVerificationTokenRow, EmailVerificationTokenInsert,
  TwoFactorCodeRow, TwoFactorCodeInsert,
  RefreshTokenRow, RefreshTokenInsert,
  PasskeyRow, PasskeyInsert,
  OauthAccountRow, OauthAccountInsert,
} from "./authTokensRepository.js";
export type {
  ModuleRow, ModuleInsert,
  UserModuleAssignmentRow, UserModuleAssignmentInsert,
  UserPermissionOverrideRow, UserPermissionOverrideInsert,
  ApiKeyRow, ApiKeyInsert,
} from "./authzRepository.js";
export type {
  AdminAuditLogRow, AdminAuditLogInsert,
  ImpersonationSessionRow, ImpersonationSessionInsert,
  ImpersonationRoleSwitchRow, ImpersonationRoleSwitchInsert,
  ActivityLogRow, ActivityLogInsert,
} from "./auditRepository.js";
export type { NotificationRow, NotificationInsert, TaskRow, TaskInsert } from "./notificationsRepository.js";
export type { ConversationParticipantRow, AiChatSessionRow, AiChatMessageRow } from "./conversationsRepository.js";
export type { FollowUpSequenceRow, FollowUpStepRow, FollowUpEnrollmentRow, FollowUpLogRow } from "./followUpsRepository.js";
export type { VideoRow, VideoInsert, StudioVoiceCloneRow, StudioProjectRow, PitchDeckRow, FeedPostRow } from "./mediaRepository.js";
export type { MarketingLeadRow, AffiliateProfileRow, EmailCampaignRow } from "./marketingRepository.js";
export type { WhitelabelTenantRow, FeatureFlagRow, AccountInvitationRow, AccountInvitationInsert } from "./platformRepository.js";
