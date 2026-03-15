# API Migration Task List (Legacy → New `/api` Cloudflare Worker)

This document tracks where the new Cloudflare Worker API implementation (`/api`) stands compared to the legacy .NET API (`/hired-api`). Each row is an endpoint or small group of endpoints; the **Status** column reflects our current implementation correctness vs. the legacy behavior.

---

## ✅ Status Key
- ✅ **Matched**: New API behavior matches or is compatible with legacy functionality used by the frontend.
- ⚠️ **Partial / Stub**: Endpoint exists but is intentionally stubbed or only partially matches legacy behavior.
- ⛔ **Missing**: Endpoint/behavior not yet implemented in `/api`.

---

## Auth

| Status | New API | Legacy API |
|--------|---------|------------|
| ✅ | `POST /api/auth/login` | `AuthController.Login` |
| ✅ | `POST /api/auth/register` | `AuthController.Register` |
| ✅ | `POST /api/auth/refresh` | `AuthController.RefreshToken` |
| ✅ | `POST /api/auth/logout` | `AuthController.Logout` |
| ✅ | `POST /api/auth/forgot-password` | `AuthController.ForgotPassword` |
| ✅ | `POST /api/auth/reset-password` | `AuthController.ResetPassword` |
| ✅ | `POST /api/auth/verify-email` | `AuthController.ConfirmEmail` |
| ✅ | `POST /api/auth/verify-2fa` | `TwoFactorAuthController.Verify` |
| ✅ | `POST /api/auth/resend-2fa` | `TwoFactorAuthController.Resend` |
| ✅ | `GET /api/auth/verification-status` | `AuthController.GetVerificationStatus` |
| ✅ | `POST /api/auth/resend-email-verification` | `AuthController.ResendEmailVerification` |

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
| ⚠️ | `POST /api/resume/public` | `ResumeController.GetPublicResume` (stubbed public resume response) |
| ✅ | `POST /api/resume/parse` | `ResumeController.Parse` |
| ✅ | `POST /api/resume/createfromfile` | `ResumeController.CreateFromFile` |
| ⚠️ | `POST /api/resume/save` | `ResumeController.Save` (stubbed) |
| ⚠️ | `POST /api/resume/summarize` | `ResumeController.Summarize` (stubbed) |
| ⚠️ | `POST /api/resume/sentimentprediction` | `ResumeController.SentimentPrediction` (stubbed) |
| ⚠️ | `/api/resume/:id/setmaster|setactive|setprivacy|promote|createvariation` | various resume owner actions (stubbed) |
| ⚠️ | `/api/resume/mastergroups|withownership|validateslug|watch|unwatch` | resume metadata actions (stubbed) |

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
| ⚠️ | `GET /api/search/public` | `SearchController.PublicSearch` (supports jobs/companies/people/resumes merge)

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
| ⚠️ | `POST /api/account/deleteaccount` | `AccountController.DeleteAccount` (stubbed) |
| ⚠️ | `POST /api/account/reset-password` | legacy frontend route (stubbed) |
| ⚠️ | `POST /api/account/confirm-password-reset` | legacy frontend route (stubbed) |

---

## Billing & Payment (stubbed)

| Status | New API | Legacy API |
|--------|---------|------------|
| ⚠️ | `GET /api/Billing/subscription` | `BillingController.GetSubscription` |
| ⚠️ | `GET /api/Billing/payment-methods` | `BillingController.GetPaymentMethods` |
| ⚠️ | `GET /api/Billing/invoices` | `BillingController.GetInvoices` |
| ⚠️ | `GET /api/Billing/ai-usage/month` | `BillingController.GetAiUsage` |
| ⚠️ | `POST /api/Payment/create-setup-session` | `PaymentController.CreateSetupSession` |
| ⚠️ | `DELETE /api/Payment/payment-methods/{id}` | `PaymentController.DeletePaymentMethod` |
| ⚠️ | `POST /api/Billing/refund-request` | `BillingController.RequestRefund` |
| ⚠️ | `GET /api/Billing/refund-requests` | `BillingController.GetRefundRequests` |
| ⚠️ | `POST /api/Billing/cancel-account` | `BillingController.CancelAccount` |
| ⚠️ | `GET /api/Billing/cancellation-requests` | `BillingController.GetCancellationRequests` |
| ⚠️ | `GET /api/Billing/refund-policy` | `BillingController.GetRefundPolicy` |
| ⚠️ | `GET /api/Billing/refund-reasons` | `BillingController.GetRefundReasons` |

---

## Affiliates (stubbed)

| Status | New API | Legacy API |
|--------|---------|------------|
| ⚠️ | `/api/affiliates/profile` | `AffiliateController.Profile` |
| ⚠️ | `/api/affiliates/dashboard` | `AffiliateController.Dashboard` |
| ⚠️ | `/api/affiliates/payout/request` | `AffiliateController.RequestPayout` |
| ⚠️ | `/api/affiliates/admin/*` | `AffiliateController.Admin*` |

---

## Match / Recommendation (stubbed)

| Status | New API | Legacy API |
|--------|---------|------------|
| ⚠️ | `POST /api/match` | `MatchController.Match` |
| ⚠️ | `POST /api/match/byid` | `MatchController.MatchById` |
| ⚠️ | `POST /api/match/bycontent` | `MatchController.MatchByContent` |
| ⚠️ | `POST /api/match/analyze` | `MatchController.Analyze` |
| ⚠️ | `POST /api/match/tailor` | `MatchController.Tailor` |

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

## Recruiter / Admin / Studio (mostly stubbed)

| Status | New API | Legacy API |
|--------|---------|------------|
| ⚠️ | `/api/recruiter/talent-pool*` | `RecruiterController.TalentPool` |
| ⚠️ | `/api/recruiter/interactions*` | `RecruiterController.Interactions` |
| ⚠️ | `/api/recruiter/placements*` | `RecruiterController.Placements` |
| ⚠️ | `/api/recruiter/submissions*` | `RecruiterController.Submissions` |
| ⚠️ | `/api/admin/productdashboard/affiliate-stats` | `AdminController.AffiliateStats` |
| ⚠️ | `/api/productdashboard/affiliate-stats` | `ProductDashboardController.AffiliateStats` |
| ⚠️ | `/api/productdashboard` (root + export) | `ProductDashboardController.*` |
| ⚠️ | `/api/productdashboard/refund*` | `ProductDashboardController.Refund*` |
| ⚠️ | `/api/productdashboard/cancellation*` | `ProductDashboardController.Cancellation*` |
| ⚠️ | `/api/admin/*` | `AdminController.*` |
| ✅ | `/api/studio/storyboard` | `StudioController.Storyboard` (compatible)
| ✅ | `/api/studio/upload` | `StudioController.Upload` (multipart + DTO)
| ✅ | `/api/studio/publish` | `StudioController.Publish` (stubbed)
| ✅ | `/api/studio/status/:projectId` | `StudioController.Status` (stubbed)
| ✅ | `/api/studio/projects` | `StudioController.Projects` (stubbed)

---

## AI / Chat / Misc

| Status | New API | Legacy API |
|--------|---------|------------|
| ⚠️ | `POST /api/ai/context` | `AIController.Context` (stubbed)
| ⚠️ | `POST /api/chat/message` | `ChatController.Message` (legacy alias; stubbed)
| ✅ | `/api/upload/video` | `UploadController.Video` (multipart + metadata)
| ✅ | `/api/upload/image` | `UploadController.Image` |
| ✅ | `/api/upload/single` | `UploadController.Single` |
| ⚠️ | `/api/video/*` | `VideoController.*` (legacy alias stubs)
| ✅ | `/api/youtube/*` (auth/callback/disconnect/publish/company) | `YoutubeController.*` |
| ✅ | `/api/communication/*` | `CommunicationController.*` (messages, conversations, templates, campaigns, tracking) |
| ✅ | `/api/passwordmanagement/requirements` | `PasswordManagementController.Requirements` |
| ✅ | `/api/passwordmanagement/validate-strength` | `PasswordManagementController.ValidatePassword` |
| ✅ | `/api/passwordmanagement/force-change` | `PasswordManagementController.ForceChange` |
| ⚠️ | `/api/resumescorer/*` | `ResumeScorerController.*` (stubbed) |
| ⚠️ | `/api/resumeoptimizer/*` | `ResumeOptimizerController.*` (stubbed) |
| ⚠️ | `/sentiment/sentimentprediction` | legacy sentiment endpoint (stubbed) |
| ⚠️ | `/sentiment/resume/sentimentprediction` | legacy sentiment endpoint alias (stubbed) |
| ⚠️ | `/api/salaryanalyzer/analyze` | `SalaryAnalyzerController.Analyze` (stubbed) |
| ⚠️ | `/api/salaryanalyzer/negotiation-tips` | `SalaryAnalyzerController.NegotiationTips` (stubbed) |
| ⚠️ | `/api/salarycalculator/analyze` | `SalaryCalculatorController.Analyze` (stubbed) |
| ⚠️ | `/api/valueproposition/generate/*` | `ValuePropositionController.Generate` (stubbed) |
| ⚠️ | `/api/featureflag` | `FeatureFlagController.*` (stubbed) |
| ⛔ | `/api/hubs/notifications*` | SignalR/hubs (explicitly not implemented) |

---

## Feed (stubbed)

| Status | New API | Legacy API |
|--------|---------|------------|
| ⚠️ | `/api/feed/posts` | `FeedController.Posts` |
| ⚠️ | `/api/feed/posts/:id` | `FeedController.Post` |
| ⚠️ | `/api/feed/posts/:id/like` | `FeedController.Like` |
| ⚠️ | `/api/feed/comments` | `FeedController.Comments` |
| ⚠️ | `/api/feed/comments/:id` | `FeedController.Comment` |
| ⚠️ | `/api/feed/search` | `FeedController.Search` |
| ⚠️ | `/api/feed/link-preview` | `FeedController.LinkPreview` |

---

## Task (stubbed)

| Status | New API | Legacy API |
|--------|---------|------------|
| ⚠️ | `/api/task` | `TaskController.List` |
| ⚠️ | `/api/task/:id` | `TaskController.Get/Delete` |
| ⚠️ | `/api/task/save` | `TaskController.Save` |
| ⚠️ | `POST /api/task/:id` (legacy fallback) | `TaskController.LegacyPost` |

---

## Notes / Next Steps

1. **Convert stubbed endpoints (⚠️) into real behavior**, focusing first on the areas the UI currently touches (e.g., search, billing, notifications, settings, resume tooling).
2. **Sync shared DTOs with frontend**: add `shared/*` models for entities like `AccountUser`, `Job`, `Resume`, `Company`, `Message`, etc.
3. **Implement missing legacy behaviors** where the UI expects parity (e.g., full 2FA flow with rate limiting, full search results, AI provider integration).
4. **Add regression tests** for critical paths (auth, jobs, resumes, messaging/communications).

---

> Tip: When updating this document, update the `Status` cell rather than adding new checkboxes. It keeps the migration status clear and comparable to the legacy behavior.
