# API Migration Task List (Legacy → New `/api` Cloudflare Worker)

This document tracks the migration of the legacy .NET API (in `/myvideoresume-api`) into the new Cloudflare Worker API implementation (`/api`).

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

### Users
- [x] `GET /api/users/me` (authenticated profile)
- [x] `GET /api/users/public` (public user listing)
- [ ] `GET /api/users/{id}`
- [ ] `PUT /api/users/me` (update profile?)

### Resumes
- [x] `/api/resumes` CRUD (list, create, update, delete)
- [x] `/api/resumes/:id` (get resume)
- [ ] `/api/resumes/:id/publish`
- [ ] `/api/resumes/:id/clone`
- [ ] `/api/resume/public` (public resume listing)
- [ ] `/api/resume/parse` (file parsing - currently used via raw request)

### Jobs
- [x] `/api/jobs` CRUD
- [ ] `/api/jobs/public` (public listings)
- [ ] `/api/job/match` / `/api/job/analytics` etc. (depending on UI usage)

### Companies (currently stubbed; frontend used it)
- [x] `/api/companies/public` (added stub)
- [ ] `/api/companies/{id}` (company details)
- [ ] `/api/companies/{id}/jobs`
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

### Billing (stubbed)
- [ ] `GET /api/Billing/subscription`
- [ ] `GET /api/Billing/payment-methods`
- [ ] `GET /api/Billing/invoices`
- [ ] `GET /api/Billing/ai-usage/month`

### Affiliates (stubbed)
- [ ] `/api/affiliates/*`

### Match / Recommendation (stubbed)
- [ ] `/api/match/*`

### Notifications (stubbed)
- [ ] `/api/notifications/*`

### Settings (stubbed)
- [ ] `/api/settings/*`

### Locations (stubbed)
- [ ] `/api/locations/*`

### Dashboard (stubbed)
- [ ] `/api/dashboard/*`

### Marketing (stubbed)
- [ ] `/api/marketing/*`

### Recruiter / Admin / Studio
- [ ] `/api/recruiter/*`
- [ ] `/api/admin/*`
- [ ] `/api/studio/*`

### AI / Chat / Misc
- [ ] `/api/ai/*` (stubbed)
- [ ] `/api/upload/*` (upload endpoint)

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
