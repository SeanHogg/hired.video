# API Migration Task List (Legacy → New `/api` Cloudflare Worker)

This document tracks the migration of the legacy .NET API (in `/hired-api`) into the new Cloudflare Worker API implementation (`/api`).

## ✅ Migration Approach

1. **Inventory frontend API usage** (all `/api/*` endpoints used by the UI)
2. **Map each endpoint to the legacy .NET controller/DTO** (for behavior + shape)
3. **Implement the endpoint in `/api`**
   - Add or update route handler in `api/src/routes/*`
   - Add shared DTO/schema types to `shared/` when useful
   - Ensure response matches frontend schema expectations (especially envelopes like `{ success: true, data: ... }`)
4. **Test** via `npm run dev` and by exercising the UI

---

## ✅ Domains + Endpoint Tasks

### Auth (already mostly implemented)
- [x] `POST /api/auth/login` → `api/src/routes/auth.ts`
- [x] `POST /api/auth/register`
- [x] `POST /api/auth/refresh`
- [x] `POST /api/auth/logout`
- [ ] `POST /api/auth/forgot-password` (stubbed)
- [ ] `POST /api/auth/reset-password` (stubbed)
- [ ] `POST /api/auth/verify-email` (stubbed)
- [x] `POST /api/auth/verify-2fa` (stubbed)
- [x] `POST /api/auth/resend-2fa` (stubbed)
- [x] `GET /api/auth/verification-status` (stubbed)
- [x] `POST /api/auth/resend-email-verification` (stubbed)
- [x] `POST /api/auth/verify-2fa` (stubbed)
- [x] `POST /api/auth/resend-2fa` (stubbed)
- [x] `GET /api/auth/verification-status` (stubbed)
- [x] `POST /api/auth/resend-email-verification` (stubbed)

### Users
- [x] `GET /api/users/me` (authenticated profile)
- [x] `GET /api/users/public` (public user listing)
- [x] `GET /api/users/{id}`
- [x] `PUT /api/users/me` (update profile)
- [x] `POST /api/users/connections`
- [x] `GET /api/users/me/connections`
- [x] `GET /api/users/me/connections/pending`
- [x] `PUT /api/users/connections/{id}/accept`
- [x] `DELETE /api/users/connections/{id}`
- [x] `GET /api/users/{id}/connections`
- [x] `GET /api/users/connections/status`
- [x] `GET /api/users/me/recommendations`
- [x] `GET /api/users/{id}/can-message`
- [x] `GET /api/users/{id}/stats`
- [x] `GET /api/users/{id}/resumes`
- [x] `POST /api/users/connections`
- [x] `GET /api/users/me/connections`
- [x] `GET /api/users/me/connections/pending`
- [x] `PUT /api/users/connections/{id}/accept`
- [x] `DELETE /api/users/connections/{id}`
- [x] `GET /api/users/{id}/connections`
- [x] `GET /api/users/connections/status`
- [x] `GET /api/users/me/recommendations`
- [x] `GET /api/users/{id}/can-message`
- [x] `GET /api/users/{id}/stats`
- [x] `GET /api/users/{id}/resumes`

### Resumes
- [x] `/api/resumes` CRUD (list, create, update, delete)
- [x] `/api/resumes/:id` (get resume)
- [x] `/api/resumes/:id/publish`
- [x] `/api/resumes/:id/clone`
- [x] Legacy alias `/api/resume/*`
- [x] `/api/resume/public` (stubbed)
- [x] `/api/resume/parse` and `/api/resume/createfromfile` (stubbed)
- [x] `/api/resume/save`, `/api/resume/summarize`, `/api/resume/sentimentprediction` (stubbed)
- [x] `/api/resume/:id/setmaster|setactive|setprivacy|promote|createvariation` (stubbed)
- [x] `/api/resume/mastergroups|withownership|validateslug|watch|unwatch` (stubbed)

### Jobs (stubbed via `api/src/routes/jobs.ts`)
- [x] `/api/jobs` CRUD (user-owned jobs)
- [x] `/api/job` CRUD (legacy singular endpoint)
- [x] `/api/Job/GetSummaryItems` + `/api/job/getsummaryitems` (user job summaries)
- [x] `/api/Job/saved` + save/unsave endpoints
- [x] `/api/Job/:id/apply` (stubbed)
- [x] `/api/Job/slug/:slug` (stubbed)
- [x] `/api/Job/CreateFromFile` + `/api/job/createfromfile` (stubbed)
- [x] `/api/Job/Extract` + `/api/job/extract` (stubbed)
- [x] `/api/jobs/public` (stubbed public listings)
- [x] `/api/Job/applications` (stubbed)
- [x] `/api/Job/alerts` CRUD + toggle (stubbed)
- [x] `/api/job/user-jobs` (legacy recruiter flow alias)
- [ ] `/api/job/match` / `/api/job/analytics` etc. (depending on UI usage)

### Companies (currently stubbed; frontend used it)
- [x] `/api/companies/public` (added stub)
- [x] `/api/companies/{id}` (stubbed)
- [x] `/api/companies/{id}/jobs` (stubbed)
- [x] `/api/companies/{id}/follow` and unfollow (stubbed)
- [x] `/api/companies/{id}/following-status` (stubbed)
- [x] `/api/companies/{id}/stats` (stubbed)
- [x] `/api/companies/me/followed` (stubbed)
- [x] `/api/companies/trending` (stubbed)
- [x] `/api/companies/slug/{slug}` (stubbed)
- [ ] other company endpoints

### Search (stubbed)
- [x] `/api/search/public` (added stub)

### Account / Organization Management (implemented as stubs)
**Frontend expectations (from `frontend/lib/services/account-service.ts`)**
- [x] `GET /api/account/users` (stubbed via `accountRoutes` + service)
- [x] `POST /api/account/invite` (stubbed)
- [x] `PUT /api/account/roles` (stubbed)
- [x] `DELETE /api/account/users/{id}` (stubbed)
- [x] `GET /api/account/available` (stubbed)
- [x] `POST /api/account/switch` (stubbed)
- [x] `GET /api/account/invitation/{id}` (stubbed)
- [x] `POST /api/account/accept-invitation/{id}` (stubbed)
- [x] `GET /api/account/invitations/pending` (stubbed)
- [x] `GET /api/account/settings` (stubbed)
- [x] `POST /api/account/settings` (stubbed)
- [x] `GET /api/account/analytics` (stubbed)
- [x] `POST /api/account/bulk-invite` (stubbed)
- [x] `POST /api/account/invitation/{id}/resend` (stubbed)
- [x] `POST /api/account/invitation/{id}/cancel` (stubbed)
- [x] `GET /api/account/invitation-analytics` (stubbed)
- [x] `POST /api/account/deleteaccount` (stubbed)
- [x] `POST /api/account/reset-password` (stubbed legacy forgot-password flow)
- [x] `POST /api/account/confirm-password-reset` (stubbed legacy reset confirmation)

### Billing and Payment (stubbed)
- [x] `GET /api/Billing/subscription` (stubbed)
- [x] `GET /api/Billing/payment-methods` (stubbed)
- [x] `GET /api/Billing/invoices` (stubbed)
- [x] `GET /api/Billing/ai-usage/month` (stubbed)
- [x] `POST /api/Payment/create-setup-session` (stubbed)
- [x] `DELETE /api/Payment/payment-methods/{id}` (stubbed)
- [x] `POST /api/Billing/refund-request` (stubbed)
- [x] `GET /api/Billing/refund-requests` + detail (stubbed)
- [x] `POST /api/Billing/cancel-account` + `GET /api/Billing/cancellation-requests` (stubbed)
- [x] `GET /api/Billing/refund-policy` + `/refund-reasons` (stubbed)

### Affiliates (stubbed)
- [x] `/api/affiliates/profile` (stubbed)
- [x] `/api/affiliates/dashboard` (stubbed)
- [x] `/api/affiliates/payout/request` (stubbed)
- [x] `/api/affiliates/admin/*` (stubbed)

### Match / Recommendation (stubbed)
- [x] `POST /api/match`
- [x] `POST /api/match/byid`
- [x] `POST /api/match/bycontent`
- [x] `POST /api/match/analyze`
- [x] `POST /api/match/tailor`

### Notifications (stubbed)
- [x] `/api/notifications` list (stubbed)
- [x] `/api/notifications/unread-count` (stubbed)
- [x] `/api/notifications/:id/mark-read` + `/mark-all-read` (stubbed)
- [x] `/api/notifications/:id` delete (stubbed)

### Settings (stubbed)
- [x] `GET /api/settings`
- [x] `GET/PUT /api/settings/notifications`
- [x] `GET/PUT /api/settings/privacy`
- [x] `GET/PUT /api/settings/job-preferences`
- [x] `GET/PUT /api/settings/account`
- [x] `GET/PUT /api/settings/security`
- [x] `POST /api/settings/security/2fa/enable`
- [x] `POST /api/settings/security/2fa/disable`
- [x] `GET /api/settings/export`

### Locations (stubbed)
- [x] `/api/locations/search` (stubbed)
- [x] `/api/locations/countries|states|cities` (stubbed)

### Dashboard (stubbed)
- [x] `/api/dashboard` base endpoint
- [x] `/api/dashboard/jobseeker`
- [x] `/api/dashboard/recruiter`
- [x] `/api/dashboard/employer`
- [x] `/api/dashboard/admin`
- [x] `/api/dashboard/profile-view`
- [x] `/api/dashboard/activity`
- [x] `/api/dashboard/engagement`
- [x] `/api/dashboard/refresh`
- [x] Legacy alias `/api/userdashboard/*`

### Marketing (stubbed)
- [x] `/api/marketing/campaigns` list/create (stubbed)
- [x] `/api/marketing/leads` list/create (stubbed)

### Recruiter / Admin / Studio
- [x] `/api/recruiter/talent-pool*` (stubbed)
- [x] `/api/recruiter/interactions*` (stubbed)
- [x] `/api/recruiter/placements*` (stubbed legacy envelope)
- [x] `/api/recruiter/submissions*` (stubbed legacy envelope)
- [x] `/api/admin/productdashboard/affiliate-stats` (stubbed)
- [x] Legacy alias `/api/productdashboard/affiliate-stats` (stubbed)
- [x] `/api/productdashboard` root + `/export/:format` (stubbed)
- [x] `/api/productdashboard/refund*` + `/cancellation*` stats/actions (stubbed)
- [x] `/api/admin/*` (stubbed)
- [x] `/api/studio/storyboard` (frontend-compatible response)
- [x] `/api/studio/upload` (multipart upload + project DTO)
- [x] `/api/studio/publish` (stubbed publish flow)
- [x] `/api/studio/status/:projectId` + `/api/studio/projects`

### AI / Chat / Misc
- [x] `POST /api/ai/context` (stubbed)
- [x] `POST /api/chat/message` (legacy alias, stubbed)
- [x] `/api/upload/video` (multipart + metadata response)
- [x] `/api/upload/image` + `/api/upload/single`
- [x] `/api/video/*` legacy alias + frontend schema-compatible stubs
- [x] `/api/youtube/*` account/auth/callback/disconnect/publish/company endpoints
- [x] `/api/communication/*` (conversations/messages/templates/campaigns/tracking/job-boards)
- [x] `/api/passwordmanagement/requirements`
- [x] `/api/passwordmanagement/validate-strength`
- [x] `/api/passwordmanagement/force-change`
- [x] `/api/resumescorer/*` (score/category/recommendations stubs)
- [x] `/api/resumeoptimizer/*` (optimize/analysis/keywords stubs)
- [x] `/sentiment/sentimentprediction` (legacy non-/api path)
- [x] `/sentiment/resume/sentimentprediction` (legacy nested alias)
- [x] `/api/salaryanalyzer/analyze` + `/api/salaryanalyzer/negotiation-tips` (stubbed)
- [x] `/api/salarycalculator/analyze` (stubbed alias)
- [x] `/api/valueproposition/generate/*` (stubbed)
- [x] `/api/featureflag` + legacy `/FeatureFlag` (stubbed)
- [x] `/api/hubs/notifications*` (explicit not-implemented responses)
- [x] `/api/featureflag` + legacy `/FeatureFlag` (stubbed)

### Feed (stubbed)
- [x] `/api/feed/posts` list/create
- [x] `/api/feed/posts/:id` get/update/delete
- [x] `/api/feed/posts/:id/like` post/delete
- [x] `/api/feed/comments` create
- [x] `/api/feed/comments/:id` update/delete
- [x] `/api/feed/search`
- [x] `/api/feed/link-preview`

### Task (stubbed)
- [x] `/api/task` list
- [x] `/api/task/:id` get/delete
- [x] `/api/task/save` create/update
- [x] Legacy fallback `POST /api/task/:id`

---

## ✅ Migration Status: All endpoints implemented or stubbed

All `/api/*` endpoints required for frontend compatibility are now implemented or stubbed. Remaining work involves converting stubs to real services and shared DTOs, as outlined below.

---

## ✅ Next migration steps (where I’ll start)
1. **Convert account stubs into real services** (replace stubbed responses with real DB/domain behavior). This will follow the pattern:
   - `/api/routes/*` handles HTTP + validation
   - `/api/services/*` contains business logic
   - `/shared/*` contains shared schema/DTO definitions
2. **Add shared DTO schemas to `/shared`** for the most-used objects (AccountUser, Invite, Company, Job, Resume, etc.) so the frontend and backend share a single source of truth.
3. **Implement the next domain (Jobs or Resumes)** by:
   - Identifying which endpoints are used by the UI
   - Mapping to legacy .NET controllers/DTOs
   - Adding route handlers + service functions + (eventually) persistence
4. **Ensure all routes return the standard envelope**: `{ success: true, data: ... }` (or `{ error: { ... } }` on failure), so frontend validation stays consistent.
5. **Write regression tests** for each domain using the existing `frontend/__tests__` patterns and new backend unit tests as needed.

---

## How to mark progress
- Update this file by checking off tasks as they get implemented.
- Add notes for any dependencies (e.g., “requires DB schema change” or “requires shared DTO update”).
