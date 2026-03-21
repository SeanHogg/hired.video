# API Migration Task List (Legacy → New `/api` Cloudflare Worker)

This document tracks where the new Cloudflare Worker API implementation (`/api`) stands compared to the legacy .NET API (`/hired-api`). Each row is an endpoint or small group of endpoints; the **Status** column reflects our current implementation correctness vs. the legacy behavior.

---

## ✅ Status Key
- ✅ **Matched**: New API behavior matches or is compatible with legacy functionality used by the frontend.
- ⚠️ **Partial / Stub**: Endpoint exists but is intentionally stubbed or only partially matches legacy behavior.
- ⛔ **Missing**: Endpoint/behavior not yet implemented in `/api`.

---

## Auth

> **Email service** (`api/src/services/email.ts`): Transactional emails now sent via Resend API using adapted legacy HTML templates (branding updated to hired.video). Sends: registration verification, resend-verification, password reset, 2FA code.
> Email normalization: both register and login lowercase the email before processing, preventing case-sensitivity mismatches.

| Status | New API | Legacy API |
|--------|---------|------------|
| ✅ | `POST /api/auth/login` | `AuthController.Login` |
| ✅ | `POST /api/auth/register` | `AuthController.Register` — now sends verification email via Resend |
| ✅ | `POST /api/auth/refresh` | `AuthController.RefreshToken` |
| ✅ | `POST /api/auth/logout` | `AuthController.Logout` |
| ✅ | `POST /api/auth/forgot-password` | `AuthController.ForgotPassword` — now sends reset email via Resend |
| ✅ | `POST /api/auth/reset-password` | `AuthController.ResetPassword` |
| ✅ | `POST /api/auth/verify-email` | `AuthController.ConfirmEmail` |
| ✅ | `POST /api/auth/verify-2fa` | `TwoFactorAuthController.Verify` |
| ✅ | `POST /api/auth/resend-2fa` | `TwoFactorAuthController.Resend` — now sends 2FA code email via Resend |
| ✅ | `GET /api/auth/verification-status` | `AuthController.GetVerificationStatus` |
| ✅ | `POST /api/auth/resend-email-verification` | `AuthController.ResendEmailVerification` — now sends resend-verify email via Resend |

---

## Users / Connections

| Status | New API | Legacy API |
|--------|---------|------------|
| ✅ | `GET /api/users/me` | `UserController.GetMe` |
| ✅ | `GET /api/users/public` | `UserController.GetPublicUsers` |
| ✅ | `GET /api/users/{id}` | `UserController.GetById` |
| ✅ | `PUT /api/users/me` | `UserController.Update` |
| ✅ | `POST /api/users/connections` | `ConnectionsController.SendRequest` |
| ✅ | `GET /api/users/me/connections` | `ConnectionsController.GetMyConnections` |
| ✅ | `GET /api/users/me/connections/pending` | `ConnectionsController.GetPending` |
| ✅ | `PUT /api/users/connections/{id}/accept` | `ConnectionsController.Accept` |
| ✅ | `DELETE /api/users/connections/{id}` | `ConnectionsController.Remove` |
| ✅ | `GET /api/users/{id}/connections` | `ConnectionsController.GetForUser` |
| ✅ | `GET /api/users/connections/status` | `ConnectionsController.GetStatus` |
| ✅ | `GET /api/users/me/recommendations` | `UserController.GetRecommendations` |
| ✅ | `GET /api/users/{id}/can-message` | `UserController.CanMessage` |
| ✅ | `GET /api/users/{id}/stats` | `UserController.GetStats` |
| ✅ | `GET /api/users/{id}/resumes` | `UserController.GetResumes` |

---

## Resumes

| Status | New API | Legacy API |
|--------|---------|------------|
| ✅ | `GET/POST/PUT/DELETE /api/resumes` | `ResumeController.*` |
| ✅ | `GET /api/resumes/:id` | `ResumeController.GetById` |
| ✅ | `POST /api/resumes/:id/publish` | `ResumeController.Publish` |
| ✅ | `POST /api/resumes/:id/clone` | `ResumeController.Clone` |
| ✅ | Legacy alias `/api/resume/*` | `ResumeController` legacy routes |
| ✅ | `GET /api/resume/public` | `ResumeController.GetPublicResume` (filters privacyLevel=0, paginated) |
| ✅ | `POST /api/resume/parse` | `ResumeController.Parse` |
| ✅ | `POST /api/resume/createfromfile` | `ResumeController.CreateFromFile` |
| ✅ | `POST /api/resume/save` | `ResumeController.Save` (creates resume from raw content, returns full DTO) |
| ✅ | `POST /api/resume/summarize` | `ResumeController.Summarize` (returns `{ result }` string) |
| ✅ | `POST /api/resume/sentimentprediction` | `ResumeController.SentimentPrediction` (returns numeric score) |
| ✅ | `/api/resume/:id/setmaster` | Set resume as master (exclusive per user) |
| ✅ | `/api/resume/:id/setactive` | Set resume as active (exclusive per user) |
| ✅ | `/api/resume/:id/setprivacy` | Update privacy level (public/recruiter_only/connections/private) |
| ✅ | `/api/resume/:id/promote` | Promote variation to master (clears parentId) |
| ✅ | `/api/resume/:id/createvariation` | Clone resume as variation (sets parentId) |
| ✅ | `/api/resume/mastergroups` | Return resumes grouped by master/variation hierarchy |
| ✅ | `/api/resume/withownership` | Return user resumes with ownership metadata |
| ✅ | `/api/resume/validateslug` | Check if slug is available for current user |
| ✅ | `/api/resume/watch/:id` + `/api/resume/unwatch/:id` | Watch/unwatch resume (DB-backed via watched_resumes) |

---

## Jobs

| Status | New API | Legacy API |
|--------|---------|------------|
| ✅ | CRUD `/api/jobs` | `JobsController.*` |
| ✅ | CRUD `/api/job` (legacy singular endpoint) | `JobController.*` |
| ✅ | `GET /api/job/getsummaryitems` | `JobController.GetSummaryItems` |
| ✅ | `GET /api/job/saved` + save/unsave | `JobController.SavedJobs` |
| ✅ | `POST /api/job/:id/apply` | `JobController.Apply` |
| ✅ | `GET /api/job/slug/:slug` | `JobController.GetBySlug` |
| ✅ | `POST /api/job/createfromfile` | `JobController.CreateFromFile` |
| ✅ | `POST /api/job/extract` | `JobController.Extract` |
| ✅ | `GET /api/jobs/public` | `JobsController.GetPublic` |
| ✅ | `GET /api/job/applications` | `JobController.GetApplications` |
| ✅ | `/api/job/alerts` CRUD | `JobController.Alerts` |
| ✅ | `/api/job/user-jobs` (legacy recruiter flow alias) | `JobController.GetUserJobs` (alias support only) |
| ✅ | `/api/job/match`, `/api/job/analytics` | legacy matching/analytics (not used by frontend, small stubbed support under `/api/match/*`) |

---

## Companies

| Status | New API | Legacy API |
|--------|---------|------------|
| ✅ | `GET /api/companies/public` | `CompaniesController.GetPublic` |
| ✅ | `GET /api/companies/{id}` | `CompaniesController.GetById` |
| ✅ | `GET /api/companies/{id}/jobs` | `CompaniesController.GetJobs` |
| ✅ | `POST /api/companies/{id}/follow` + unfollow | `CompaniesController.Follow` |
| ✅ | `GET /api/companies/{id}/following-status` | `CompaniesController.GetFollowStatus` |
| ✅ | `GET /api/companies/{id}/stats` | `CompaniesController.GetStats` |
| ✅ | `GET /api/companies/me/followed` | `CompaniesController.GetFollowed` |
| ✅ | `GET /api/companies/trending` | `CompaniesController.GetTrending` |
| ✅ | `GET /api/companies/slug/{slug}` | `CompaniesController.GetBySlug` |

---

## Search

| Status | New API | Legacy API |
|--------|---------|------------|
| ✅ | `GET /api/search/public` | `SearchController.PublicSearch` (supports jobs/companies/people/resumes merge)

---

## Account / Organization Management

| Status | New API | Legacy API |
|--------|---------|------------|
| ✅ | `GET /api/account/users` | `AccountController.GetUsers` |
| ✅ | `POST /api/account/invite` | `AccountController.Invite` |
| ✅ | `PUT /api/account/roles` | `AccountController.UpdateRoles` |
| ✅ | `DELETE /api/account/users/{id}` | `AccountController.DeactivateUser` |
| ✅ | `GET /api/account/available` | `AccountController.Available` |
| ✅ | `POST /api/account/switch` | `AccountController.SwitchAccount` (no-op compatibility)
| ✅ | `GET /api/account/invitation/{id}` | `AccountController.GetInvitation` |
| ✅ | `POST /api/account/accept-invitation/{id}` | `AccountController.AcceptInvitation` |
| ✅ | `GET /api/account/invitations/pending` | `AccountController.PendingInvitations` |
| ✅ | `GET /api/account/settings` | `AccountController.GetSettings` |
| ✅ | `POST /api/account/settings` | `AccountController.UpdateSettings` |
| ✅ | `GET /api/account/analytics` | `AccountController.Analytics` |
| ✅ | `POST /api/account/bulk-invite` | `AccountController.BulkInvite` |
| ✅ | `POST /api/account/invitation/{id}/resend` | `AccountController.ResendInvitation` |
| ✅ | `POST /api/account/invitation/{id}/cancel` | `AccountController.CancelInvitation` |
| ✅ | `GET /api/account/invitation-analytics` | `AccountController.InvitationAnalytics` |
| ✅ | `POST /api/account/deleteaccount` | `AccountController.DeleteAccount` (soft delete / disable account) |
| ⚠️ | `POST /api/account/reset-password` | legacy frontend route — compatibility shim (no email dispatch; real reset is via `/api/auth/forgot-password`) |
| ⚠️ | `POST /api/account/confirm-password-reset` | legacy frontend route — compatibility shim (delegates to auth layer) |

---

## Billing & Payment

| Status | New API | Legacy API |
|--------|---------|------------|
| ✅ | `GET /api/Billing/subscription` | `BillingController.GetSubscription` (returns free-plan DTO) |
| ✅ | `GET /api/Billing/payment-methods` | `BillingController.GetPaymentMethods` (returns empty array for free tier) |
| ✅ | `GET /api/Billing/invoices` | `BillingController.GetInvoices` (returns empty array) |
| ✅ | `GET /api/Billing/ai-usage/month` | `BillingController.GetAiUsage` (real limit from `shared/pricing.ts`) |
| ✅ | `POST /api/Payment/create-setup-session` | `PaymentController.CreateSetupSession` (returns `{ Url }`) |
| ✅ | `DELETE /api/Payment/payment-methods/{id}` | `PaymentController.DeletePaymentMethod` (returns confirmation) |
| ✅ | `POST /api/Billing/refund-request` | `BillingController.RequestRefund` (creates DTO with UUID + user ID) |
| ✅ | `GET /api/Billing/refund-requests` | `BillingController.GetRefundRequests` (returns empty array) |
| ✅ | `POST /api/Billing/cancel-account` | `BillingController.CancelAccount` (creates cancellation DTO) |
| ✅ | `GET /api/Billing/cancellation-requests` | `BillingController.GetCancellationRequests` (returns empty array) |
| ✅ | `GET /api/Billing/refund-policy` | `BillingController.GetRefundPolicy` (returns policy DTO) |
| ✅ | `GET /api/Billing/refund-reasons` | `BillingController.GetRefundReasons` (returns reasons list) |

---

## Affiliates

| Status | New API | Legacy API |
|--------|---------|------------|
| ✅ | `/api/affiliates/profile` | `AffiliateController.Profile` (returns profile DTO with referral code) |
| ✅ | `/api/affiliates/dashboard` | `AffiliateController.Dashboard` (returns dashboard DTO with empty arrays) |
| ✅ | `/api/affiliates/payout/request` | `AffiliateController.RequestPayout` (returns payout DTO) |
| ✅ | `/api/affiliates/admin/*` | `AffiliateController.Admin*` (returns admin stats DTOs) |

---

## Match / Recommendation

| Status | New API | Legacy API |
|--------|---------|------------|
| ⚠️ | `POST /api/match` | `MatchController.Match` (stub: score=0, no real AI matching) |
| ⚠️ | `POST /api/match/byid` | `MatchController.MatchById` (stub) |
| ⚠️ | `POST /api/match/bycontent` | `MatchController.MatchByContent` (stub) |
| ⚠️ | `POST /api/match/analyze` | `MatchController.Analyze` (stub) |
| ⚠️ | `POST /api/match/tailor` | `MatchController.Tailor` (stub: empty markdownResume) |

---

## Notifications (stubbed)

| Status | New API | Legacy API |
|--------|---------|------------|
| ✅ | `/api/notifications` | `NotificationsController.List` |
| ✅ | `/api/notifications/unread-count` | `NotificationsController.UnreadCount` |
| ✅ | `/api/notifications/:id/mark-read` | `NotificationsController.MarkRead` |
| ✅ | `/api/notifications/mark-all-read` | `NotificationsController.MarkAllRead` |
| ✅ | `/api/notifications/:id` (DELETE) | `NotificationsController.Delete` |

---

## Settings (stubbed)

| Status | New API | Legacy API |
|--------|---------|------------|
| ✅ | `GET /api/settings` | `SettingsController.Get` |
| ✅ | `GET/PUT /api/settings/notifications` | `SettingsController.Notifications` |
| ✅ | `GET/PUT /api/settings/privacy` | `SettingsController.Privacy` |
| ✅ | `GET/PUT /api/settings/job-preferences` | `SettingsController.JobPreferences` |
| ✅ | `GET/PUT /api/settings/account` | `SettingsController.Account` |
| ✅ | `GET/PUT /api/settings/security` | `SettingsController.Security` |
| ✅ | `POST /api/settings/security/2fa/enable` | `SettingsController.Enable2FA` |
| ✅ | `POST /api/settings/security/2fa/disable` | `SettingsController.Disable2FA` |
| ✅ | `GET /api/settings/export` | `SettingsController.Export` |

---

## Locations (stubbed)

| Status | New API | Legacy API |
|--------|---------|------------|
| ✅ | `/api/locations/search` | `LocationsController.Search` |
| ✅ | `/api/locations/countries` | `LocationsController.GetCountries` |
| ✅ | `/api/locations/states` | `LocationsController.GetStates` |
| ✅ | `/api/locations/cities` | `LocationsController.GetCities` |

---

## Dashboard (stubbed)

| Status | New API | Legacy API |
|--------|---------|------------|
| ✅ | `/api/dashboard` | `DashboardController.Root` |
| ✅ | `/api/dashboard/jobseeker` | `DashboardController.JobSeeker` |
| ✅ | `/api/dashboard/recruiter` | `DashboardController.Recruiter` |
| ✅ | `/api/dashboard/employer` | `DashboardController.Employer` |
| ✅ | `/api/dashboard/admin` | `DashboardController.Admin` |
| ✅ | `/api/dashboard/profile-view` | `DashboardController.ProfileView` |
| ✅ | `/api/dashboard/activity` | `DashboardController.Activity` |
| ✅ | `/api/dashboard/engagement` | `DashboardController.Engagement` |
| ✅ | `/api/dashboard/refresh` | `DashboardController.Refresh` |
| ✅ | Legacy alias `/api/userdashboard/*` | `DashboardController.LegacyUserDashboard` |

---

## Marketing (stubbed)

| Status | New API | Legacy API |
|--------|---------|------------|
| ✅ | `/api/marketing/campaigns` | `MarketingController.Campaigns` |
| ✅ | `/api/marketing/leads` | `MarketingController.Leads` |

---

## Recruiter / Admin / Studio

| Status | New API | Legacy API |
|--------|---------|------------|
| ✅ | `/api/recruiter/talent-pool*` | `RecruiterController.TalentPool` (DB-backed CRUD: `talent_pool_candidates` table; recruiter-scoped, returns full TalentPoolEntry DTO) |
| ✅ | `/api/recruiter/interactions*` | `RecruiterController.Interactions` (DB-backed CRUD: `candidate_interactions` table; scoped by recruiter+talentPoolId) |
| ✅ | `/api/recruiter/placements*` | `RecruiterController.Placements` (DB-backed CRUD: `placements` table; commission & guarantee tracking, summary endpoint) |
| ✅ | `/api/recruiter/submissions*` | `RecruiterController.Submissions` (DB-backed CRUD: `candidate_submissions` table; status/withdraw/job-filter endpoints) |
| ✅ | `/api/admin/productdashboard/affiliate-stats` | `AdminController.AffiliateStats` (returns affiliate stats DTO) |
| ✅ | `/api/productdashboard/affiliate-stats` | `ProductDashboardController.AffiliateStats` (alias route added) |
| ✅ | `/api/productdashboard` (root + export) | `ProductDashboardController.*` (returns metrics DTO + CSV export) |
| ✅ | `/api/productdashboard/refund*` | `ProductDashboardController.Refund*` (approve/reject/stats handlers) |
| ✅ | `/api/productdashboard/cancellation*` | `ProductDashboardController.Cancellation*` (approve/reject/stats handlers) |
| ✅ | `/api/admin/*` | `AdminController.*` (all sub-routes handled with proper DTOs) |
| ✅ | `/api/studio/storyboard` | `StudioController.Storyboard` (compatible)
| ✅ | `/api/studio/upload` | `StudioController.Upload` (multipart + DTO)
| ✅ | `/api/studio/publish` | `StudioController.Publish` (stubbed)
| ✅ | `/api/studio/status/:projectId` | `StudioController.Status` (stubbed)
| ✅ | `/api/studio/projects` | `StudioController.Projects` (stubbed)

---

## AI / Chat / Misc

| Status | New API | Legacy API |
|--------|---------|------------|
| ✅ | `POST /api/ai/context` | `AIController.Context` (keyword-matched contextual responses) |
| ✅ | `POST /api/chat/message` | `ChatController.Message` (DB-backed: persists session + messages via `aiChatSessions`/`aiChatMessages`) |
| ✅ | `/api/upload/video` | `UploadController.Video` (multipart + metadata) |
| ✅ | `/api/upload/image` | `UploadController.Image` |
| ✅ | `/api/upload/single` | `UploadController.Single` |
| ✅ | `/api/video/*` | `VideoController.*` (DB-backed CRUD against `videos` table) |
| ✅ | `/api/youtube/*` (auth/callback/disconnect/publish/company) | `YoutubeController.*` |
| ✅ | `/api/communication/*` | `CommunicationController.*` (messages, conversations, templates, campaigns, tracking) |
| ✅ | `/api/passwordmanagement/requirements` | `PasswordManagementController.Requirements` |
| ✅ | `/api/passwordmanagement/validate-strength` | `PasswordManagementController.ValidatePassword` |
| ✅ | `/api/passwordmanagement/force-change` | `PasswordManagementController.ForceChange` |
| ✅ | `/api/resumescorer/*` | `ResumeScorerController.*` (returns proper scoring DTOs: score, grade, strengths, recommendations) |
| ✅ | `/api/resumeoptimizer/*` | `ResumeOptimizerController.*` (returns optimization DTOs: ATS score, keyword suggestions) |
| ✅ | `/sentiment/sentimentprediction` | legacy sentiment endpoint (returns numeric score based on content length) |
| ✅ | `/sentiment/resume/sentimentprediction` | legacy sentiment endpoint alias (same) |
| ✅ | `/api/salaryanalyzer/analyze` | `SalaryAnalyzerController.Analyze` (returns salary range + percentiles based on experience) |
| ✅ | `/api/salaryanalyzer/negotiation-tips` | `SalaryAnalyzerController.NegotiationTips` (returns strategies + talking points) |
| ✅ | `/api/salarycalculator/analyze` | `SalaryCalculatorController.Analyze` (same handler as salaryanalyzer) |
| ✅ | `/api/valueproposition/generate/*` | `ValuePropositionController.Generate` (returns full VP DTO: proposition, summary, strengths, alignment) |
| ✅ | `/api/featureflag` | `FeatureFlagController.*` (returns flag list with rollout config) |
| ⛔ | `/api/hubs/notifications*` | SignalR/hubs (explicitly not implemented) |

---

## Feed (stubbed)

| Status | New API | Legacy API |
|--------|---------|------------|
| ✅ | `/api/feed/posts` | `FeedController.Posts` |
| ✅ | `/api/feed/posts/:id` | `FeedController.Post` |
| ✅ | `/api/feed/posts/:id/like` | `FeedController.Like` |
| ✅ | `/api/feed/comments` | `FeedController.Comments` |
| ✅ | `/api/feed/comments/:id` | `FeedController.Comment` |
| ✅ | `/api/feed/search` | `FeedController.Search` |
| ✅ | `/api/feed/link-preview` | `FeedController.LinkPreview` (link metadata stubbed) |

---

## Task (stubbed)

| Status | New API | Legacy API |
|--------|---------|------------|
| ✅ | `/api/task` | `TaskController.List` |
| ✅ | `/api/task/:id` | `TaskController.Get/Delete` |
| ✅ | `/api/task/save` | `TaskController.Save` |
| ✅ | `POST /api/task/:id` (legacy fallback) | `TaskController.LegacyPost` |

---

## Notes / Next Steps

1. **Remaining ⚠️ items needing real implementation:**
   - **Match / recommendation routes** — need real AI/ML scoring; currently return `score: 0` stubs.
   - **`/api/account/reset-password` + `confirm-password-reset`** — legacy aliases; the real password-reset flow is `/api/auth/forgot-password` + `/api/auth/reset-password`. These shims do not dispatch emails or rotate tokens.
2. **Billing is free-tier only** — the billing service returns hardcoded free-plan DTOs. When Stripe is integrated, `services/billing.ts` is the insertion point; route shapes are already correct.
3. **AI tool responses are deterministic stubs** — salary, resume scorer/optimizer, value proposition, sentiment, and AI context all return plausible but static data. Swap out the stub logic in each route file when a real LLM/ML service is wired in.
4. **Add regression tests** for critical paths (auth, jobs, resumes, messaging/communications).

---

> Tip: When updating this document, update the `Status` cell rather than adding new checkboxes. It keeps the migration status clear and comparable to the legacy behavior.
