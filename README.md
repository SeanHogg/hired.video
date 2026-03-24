# hired.video Platform

A full-stack platform for video resume creation and talent management. Combines an AI-powered resume/video builder with professional networking, recruiter tools, and multi-tenant organization management.

---

## Platform Overview

hired.video supports multiple user personas operating in the same platform:

- **Job Seekers** — Build resumes and video resumes, search/apply to jobs, network professionally
- **Recruiters** — Manage talent pools, submit candidates, track placements, communicate via outreach campaigns
- **Business Owners / Employers** — Post jobs, manage company profiles, invite team members, view analytics
- **Admins** — Platform management, affiliate oversight, billing/refund management

### Core Feature Areas

| Area | Description |
|------|-------------|
| Authentication & Security | JWT auth, email verification, 2FA, password reset, refresh tokens, OAuth (Google, LinkedIn, GitHub, Microsoft), magic links, passkeys |
| Resume Management | AI-powered builder, file parsing, versioning, analytics, cloning, publishing |
| Video Resume & Studio | AI video generation, storyboard editor, script editing, YouTube publishing |
| Job Management | Job CRUD, search, applications, alerts, AI-based matching and tailoring |
| Company Profiles | Company pages, follow system, trending, job listings |
| Professional Networking | User connections, social feed, recommendations |
| Recruiter Tools | Talent pools, submissions, placements, commission tracking |
| Communication | Conversations, email templates, campaigns, tracking, external contacts |
| AI Features | Resume scoring, optimizer, ATS analysis, value proposition, salary analysis, interview prep |
| Multi-tenant Accounts | Team invitations, role-based access, account switching |
| Billing & Payments | Subscriptions, payment methods, invoices, refunds, cancellations |
| Affiliate Program | Referral tracking, conversions, payouts |
| Admin Dashboard | Platform metrics, affiliate management, refund/cancellation approval |

---

## Tech Stack

### Backend API (`/api`)

| Concern | Technology |
|---------|-----------|
| Language | TypeScript |
| Framework | [Hono](https://hono.dev/) (lightweight, edge-native) |
| Runtime | Cloudflare Workers (edge serverless) |
| Database | PostgreSQL via [Neon](https://neon.tech/) (serverless) |
| ORM | [Drizzle ORM](https://orm.drizzle.team/) |
| Validation | [Zod](https://zod.dev/) |
| Auth | JWT (jose) + PBKDF2 password hashing |
| Email | SendPulse via `sendpulse-api` npm package |
| AI / LLM | OpenRouter API (Google Gemini Flash) |
| File Storage | AWS S3 + Cloudflare R2 |
| Error Monitoring | Sentry |
| Migrations | Drizzle Kit |

### Frontend (`/frontend`)

| Concern | Technology |
|---------|-----------|
| Framework | React 18 + TypeScript |
| Build | Vite |
| Styling | TailwindCSS 3 + shadcn/ui (Radix UI) |
| Routing | React Router 6 (SPA mode) |
| State / Data | React Query + Context API |
| Forms | React Hook Form + Zod |
| Analytics | Google Tag Manager (GTM-T6CSJ22D) |

### Legacy Reference API (`/myvideoresume-api`)

The legacy implementation is a **C# / ASP.NET Core** solution retained as a reference. It targets the same feature surface and is used as a specification for the TypeScript rewrite. See [Gap Analysis](#gap-analysis-vs-legacy-api) below.

---

## Project Structure

```
hired.video/
├── api/                          # Cloudflare Workers API (TypeScript / Hono)
│   ├── src/
│   │   ├── app.ts                # Hono app factory, route mounting, CORS
│   │   ├── worker.ts             # CF Worker fetch handler (production entry)
│   │   ├── index.ts              # Node.js entry (local development)
│   │   ├── routes/               # 40 route files — one per feature domain
│   │   ├── services/             # Business logic services (7 files)
│   │   ├── middleware/           # Auth, error handling, rate limiting, logging
│   │   ├── db/
│   │   │   ├── schema/           # Drizzle schema definitions (73 tables)
│   │   │   └── index.ts          # DB connection
│   │   └── types/                # Shared TypeScript types, response helpers
│   ├── wrangler.toml             # Cloudflare Worker config + R2/KV bindings
│   └── drizzle.config.ts         # Migration configuration
├── frontend/                     # React SPA
│   ├── pages/                    # Route-level page components
│   ├── components/               # Reusable UI components
│   ├── lib/services/             # API service layer (one file per domain)
│   ├── hooks/                    # Custom React hooks
│   └── types/                    # Frontend TypeScript types
├── myvideoresume-api/            # Legacy C# reference implementation (read-only)
│   ├── MyVideoResume.Server/     # ASP.NET Core Web API
│   ├── MyVideoResume.Application/# Business logic services
│   ├── MyVideoResume.Data/       # EF Core DbContext + entities
│   ├── MyVideoResume.Abstractions/ # DTOs, interfaces, models
│   ├── MyVideoResume.AI/         # LLM integration
│   ├── MyVideoResume.ML.SentimentAnalysis/ # ML.NET sentiment model
│   └── MyVideoResume.Tests/      # Unit/integration tests
└── docs/                         # Documentation
```

---

## Frontend Architecture

### Dashboard

The dashboard system uses a **role-based component loader pattern**. The main container reads the user's `rolePermissions` and renders the appropriate role-specific component.

```
/frontend/pages/Dashboard.tsx (main container — 323 lines)
/frontend/components/dashboard/
├── JobSeekerDashboard.tsx       # Profile stats, applications, job matches, interviews, messages, career progress
├── RecruiterDashboard.tsx       # Candidate pipeline, job posting stats, recruitment metrics, scheduled interviews
├── EmployerDashboard.tsx        # Team metrics, budget stats, company stats, candidate pipeline, performance summaries
├── AdminDashboard.tsx           # Platform stats, revenue stats, system health, support metrics, feature usage
├── shared/
│   ├── MetricCard.tsx           # MetricCard (single metric + trend indicator) and MetricGrid (responsive grid)
│   ├── ActivityFeed.tsx         # Activity timeline; customizable title and "View All" action
│   ├── OnboardingProgress.tsx   # Progress bar + task list; auto-hides at 100% completion
│   ├── QuickActions.tsx         # Role-based action buttons; includes Video Resume Wizard modal
│   └── index.ts                 # Re-exports all shared components
└── index.ts

/frontend/hooks/dashboard/
├── useDashboard.ts              # Fetches role-appropriate data, loading/error states, page-view analytics, Affiliate support
├── useOnboarding.ts             # Memoized progress — task list, completed count, percentage, incomplete tasks, completion flag
└── index.ts
```

**Role-based routing:**

```typescript
if (rolePermissions.isJobSeeker) {
  return <JobSeekerDashboard dashboardData={dashboardData} />;
}
```

**Importing shared components:**

```typescript
import { MetricGrid, ActivityFeed, OnboardingProgress } from "./shared";
```

**Data fetching:**

```typescript
const { dashboardData, loading, error, refreshDashboard } = useDashboard();
```

**Adding a new role dashboard:** create `NewRoleDashboard.tsx`, add the role check in `Dashboard.tsx`, import shared components as needed. Each role dashboard is self-contained.

---

## API Inventory & Implementation Status

### Middleware

| File | Status | Notes |
|------|--------|-------|
| `auth.ts` | ✅ Complete | JWT verification, sets `c.var.user` |
| `errorHandler.ts` | ✅ Complete | AppError hierarchy, Zod formatting, Sentry |
| `rateLimiter.ts` | ✅ Complete | In-memory, 100 req/60s per IP |
| `emailVerified.ts` | ✅ Complete | Applied globally in `app.ts` to all authenticated routes |
| `passwordChange.ts` | ✅ Complete | Applied globally in `app.ts` to all authenticated routes |
| `requestLogger.ts` | ✅ Complete | HTTP request/response logging |

### Routes

#### Authentication & Account Management

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `auth.ts` | POST /register, /login, /refresh, /logout, /forgot-password, /reset-password, /verify-email, /verify-2fa, /resend-2fa, /resend-email-verification; GET /verification-status, /me | ✅ Complete | Full auth flow implemented |
| `account.ts` | GET /users, /available, /invitations/pending, /invitation/:id, /settings, /analytics, /invitation-analytics; POST /invite, /accept-invitation/:id, /switch, /bulk-invite, /deleteaccount; PUT /roles; DELETE /users/:id | ✅ Complete | Multi-tenant org management |
| `users.ts` | GET /public, /:id, /check-slug/:slug, /me, /me/connections, /me/recommendations, /profile, /:id/resumes, /:id/stats, /:id/can-message; POST /connections; PUT /me, /profile, /connections/:id/accept; DELETE /account, /connections/:id; PATCH /slug | ✅ Complete | Profile + connections |
| `settings.ts` | GET /account, /job-preferences, /notifications, /security, /privacy, /export; PUT /account, /job-preferences, /notifications, /privacy, /security; POST /security/2fa/enable, /disable | ✅ Complete | User preferences |
| `password-management.ts` | GET /requirements; POST /validate-strength, /force-change | ✅ Complete | Password policy enforcement |

#### Resume Features

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `resumes.ts` | GET /, /:id, /export, /metadata, /embedded/:id, /mastergroups, /public, /validateslug, /withownership; POST /, /clone, /createvariation, /promote, /publish, /setactive, /setmaster, /setprivacy, /createfromfile, /parse, /save, /watch/:id, /unwatch/:id; PUT /:id, /:id/metadata; DELETE /:id | ✅ Complete | Core resume CRUD + lifecycle |
| `resume-scorer.ts` | POST /score, /category-breakdown, /recommendations | ✅ Complete | AI-powered scoring |
| `resume-optimizer.ts` | POST /optimize, /ats-analysis, /keyword-suggestions | ✅ Complete | ATS optimization |
| `resume-roast.ts` | POST /roast | ✅ Complete | AI feedback tool |
| `sentiment.ts` | POST /sentimentprediction, /resume/sentimentprediction | ✅ Complete | Sentiment analysis |

#### Video & Studio

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `video.ts` | GET /:id, /:id/status, /resume/:resumeId, /resume/:resumeId/active, /resume/:resumeId/can-generate, /user/all; POST /generate, /:id/cancel, /enhance-summary; DELETE /:id | ✅ Complete | Video generation lifecycle |
| `studio.ts` | POST /save-draft, /publish, /storyboard, /generate-image, /edit-script, /upload; GET /projects, /public/:videoId, /videos/public, /videos/resume/:resumeId, /videos/user/:userId, /status/:projectId; DELETE /projects/:projectId; PATCH /projects/:projectId/status | ✅ Complete | 929 lines — largest route file |

#### Jobs & Matching

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `jobs.ts` | GET /, /:id, /public, /slug/:slug, /GetSummaryItems, /saved, /alerts, /applications, /user-jobs; POST /, /:id/apply, /:id/save, /createfromfile, /extract, /alerts; PUT /:id, /alerts/:id; DELETE /:id, /:id/save; PATCH /alerts/:id/toggle | ✅ Complete | Full job lifecycle + alerts |
| `match.ts` | POST /, /analyze, /bycontent, /byid, /tailor | ✅ Complete | Resume-to-job matching |
| `search.ts` | GET /public | ⚠️ Partial | Single endpoint; legacy has richer search — see Gap Register #10 |

#### Companies

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `companies.ts` | GET /public, /:id, /:id/jobs, /:id/stats, /:id/following-status, /slug/:slug, /trending, /me/followed; POST /, /:id/follow; PUT /:id; DELETE /:id, /:id/follow | ✅ Complete | Company profiles + follow system |

#### Recruiter Tools

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `recruiter.ts` | GET /talent-pool, /submissions, /placements, /placements/summary/commission, /interactions/:talentPoolId; POST /talent-pool, /submissions, /placements, /interactions; PUT /talent-pool/:id, /submissions/:id/status, /placements/:id/commission, /placements/:id/guarantee; DELETE /talent-pool/:id; POST /submissions/:id/withdraw | ✅ Complete | 618 lines |

#### Communication

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `messages.ts` | POST /, /message | ⚠️ Partial | Minimal — direct messages only; no conversation threading, read receipts, or history — see Gap Register #45 |
| `communication.ts` | GET /conversations, /messages, /email-templates, /email-campaigns, /tracking, /stats, /job-boards, /external-contacts; POST /conversations, /messages, /messages/mark-read, /email-templates, /email-campaigns, /email-campaigns/:id/send, /tracking, /job-boards/post, /external-contacts, /follow-ups; PUT /email-templates/:id, /external-contacts/:id; DELETE /email-templates/:id, /external-contacts/:id, /job-boards/postings/:id | ✅ Complete | 318 lines |

#### AI Features

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `ai.ts` | POST /context, /chat, /chat/sessions, /chat/sessions/:id | ✅ Complete | Full AI chat with session persistence, history, usage tracking; `/chat` added after initial table |
| `value-proposition.ts` | POST /generate/content, /generate/job-content-resume-id, /generate/job-id-resume-content, /generate/job-id-resume-id | ✅ Complete | 4 generation modes |
| `salary.ts` | POST /analyze, /negotiation-tips | ✅ Complete | Salary calculator |
| `interview.ts` | GET /sessions, /sessions/:id; POST /sessions, /sessions/:id/answers, /questions, /answers/:answerId/analyze; DELETE /sessions/:id; PATCH /sessions/:id/complete | ✅ Complete | 489 lines |

#### Dashboard & Analytics

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `dashboard.ts` | GET /, /admin, /employer, /jobseeker, /recruiter; POST /activity, /engagement, /profile-view, /refresh | ✅ Complete | Role-specific dashboards |

#### Social Feed

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `feed.ts` | GET /posts, /posts/:id, /posts/:id/comments, /search; POST /posts, /posts/:id/like, /comments, /link-preview; PUT /posts/:id, /comments/:id; DELETE /posts/:id, /posts/:id/like, /comments/:id | ✅ Complete | 389 lines |

#### Billing & Payments

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `billing.ts` | GET /subscription, /payment-methods, /invoices, /ai-usage/month, /refund-policy, /refund-reasons, /refund-requests; POST /refund-request, /cancel-account | ✅ Complete | Real DB queries for subscriptions, invoices, payment methods, AI usage |
| `payment.ts` | GET /public-key; POST /setup-intent, /save-payment-method, /stripe/webhook, /create-setup-session; DELETE /payment-methods/:id | ✅ Complete | Stripe fully wired — webhook verified, customer IDs persisted |

#### Admin & Affiliates

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `admin.ts` | GET /, /affiliate-stats, /productdashboard/affiliate-stats, /export/:format, /refund-requests, /refund-stats, /cancellation-requests; POST /refund-requests/:id/approve, /reject, /cancellation-requests/:id/approve, /reject | ✅ Complete | Admin management panel |
| `affiliates.ts` | GET /profile, /dashboard, /admin/all, /admin/:userId/details, /admin/pending-payouts; POST /payout/request, /admin/:userId/activate, /deactivate, /admin/payout/:payoutId/approve, /reject, /process | ✅ Complete | Full affiliate program |

#### Integrations & Utilities

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `upload.ts` | POST /, /image, /single, /video; DELETE /:key | ✅ Complete | S3/R2 upload handling |
| `youtube.ts` | GET /account, /auth-url, /company/auth-url, /company/status; POST /callback, /disconnect, /publish/:videoId | ✅ Complete | YouTube OAuth + publishing |
| `linkedin-post.ts` | POST /linkedin-post | ⚠️ Partial | Basic post endpoint; no OAuth flow — see Gap Register #9 |
| `locations.ts` | GET /countries, /states, /cities, /search | ✅ Complete | Reference data |
| `og.ts` | GET /v/:videoId | ✅ Complete | Open Graph metadata |
| `task.ts` | GET /, /:id; POST /save, /:id; DELETE /:id | ✅ Complete | Task management |
| `featureflag.ts` | GET / | ✅ Complete | Orphaned duplicate `feature-flag.ts` deleted; static flag evaluation |
| `hubs.ts` | GET/POST /notifications, POST /notifications/negotiate | ✅ Complete | SSE stream live; `POST /negotiate` returns transport descriptor |
| `marketing.ts` | GET /campaigns, /leads; POST /campaigns, /leads | ⚠️ Stub | Basic structure only; no campaign execution or lead capture logic — see Gap Register #43 |

### Services

| Service | Lines | Status | Notes |
|---------|-------|--------|-------|
| `email.ts` | 518 | ✅ Complete | `EmailProvider` interface + SendPulse implementation; sends verification, reset, 2FA, resend emails |
| `ai.ts` | 84 | ✅ Complete | `callLLM()` / `callLLMJson()` with Zod schema validation; OpenRouter wrapper |
| `account.ts` | 363 | ✅ Complete | Organization/team management business logic |
| `job.ts` | 257 | ✅ Complete | Job management: create, update, archive, search |
| `company.ts` | 84 | ✅ Complete | Company CRUD, follow/unfollow, trending |
| `settings.ts` | 76 | ✅ Complete | User preference read/write |
| `billing.ts` | 106 | ✅ Complete | Real DB queries for subscriptions, invoices, payment methods, AI usage |

### Database Schema (73 tables in `/api/src/db/schema/`)

All tables are defined and schema migrations managed via Drizzle Kit.

| Domain | Tables |
|--------|--------|
| Users & Auth | `users`, `userProfiles`, `userRoles`, `roles`, `passwordHistory`, `twoFactorCodes`, `emailVerificationTokens`, `passwordResetTokens`, `refreshTokens`, `userConnections` |
| Companies & Orgs | `companyProfiles`, `userCompanyRoleAssociations`, `companyFollowers`, `accountInvitations`, `accountPreferences` |
| Resumes | `resumeInformation`, `resumeTemplates`, `watchedResumes`, `metaResumes` |
| Jobs | `jobItems`, `jobPreferences`, `jobApplications`, `savedJobs`, `jobAlerts`, `jobWebsites` |
| Video & Studio | `videos`, `videoResumes`, `studioProjects`, `youtubeAccounts` |
| Recruiter | `recruiterTalentPools`, `talentPoolCandidates`, `candidateInteractions`, `candidateSubmissions`, `placements`, `jobBoards`, `jobBoardPostings` |
| Messaging | `conversations`, `conversationParticipants`, `messages`, `messageReadReceipts`, `emailTemplates`, `emailCampaigns`, `emailCampaignRecipients`, `communicationTracking` |
| Social | `feedPosts`, `feedPostLikes`, `feedPostComments` |
| Interviews | `interviewSessions`, `interviewAnswers`, `interviews`, `applicationNotes` |
| Affiliate | `affiliateProfiles`, `affiliateReferrals`, `affiliateConversions`, `affiliatePayouts` |
| Billing | `subscriptionPlans`, `subscriptions`, `paymentMethods`, `invoices`, `invoiceLineItems`, `refundRequests`, `billingEvents`, `usageRecords` |
| Analytics | `profileViews`, `activityLogs`, `requestLogs`, `dashboardMetrics`, `userEngagementMetrics`, `aiUsageRecords`, `aiChatSessions`, `aiChatMessages` |
| Productivity | `tasks`, `boards`, `notifications`, `queueJobToResume`, `queueJobToProcess` |
| Locations | `countries`, `stateProvinces`, `cities`, `postalZipCodes` |
| System | `systemSettings` |

---

## Legacy API Coverage Map

This section documents every controller in `/myvideoresume-api` (31 C# controllers, ~200 endpoints), the business-logic service it calls, the DB tables it touches, and whether the TypeScript API has a matching implementation.

**Coverage key:**
✅ Fully covered — TypeScript API has equivalent endpoints with DB-backed logic
⚠️ Partial — Routes exist but logic is stubbed, missing, or incomplete
❌ Not covered — No equivalent in TypeScript API

### Authentication & User Management

| Legacy Controller | Route | Business Logic | DB Tables | TS Coverage |
|-------------------|-------|---------------|-----------|-------------|
| **AuthController** | `POST /api/auth/login` | UserManager.CheckPasswordSignInAsync, issues 2FA challenge token | AspNetUsers, PasswordHistory | ✅ `routes/auth.ts` |
| | `POST /api/auth/register` | Creates user + roles + affiliate profile; sends verification email | AspNetUsers, AspNetUserRoles, AffiliateProfiles | ✅ |
| | `POST /api/auth/verify-2fa` | Validates OTP; sends welcome email on first login; marketing email (30-day cooldown) | AspNetUsers, TwoFactorCodes | ✅ |
| | `POST /api/auth/resend-2fa` | Resends 2FA code via email | TwoFactorCodes | ✅ |
| | `POST /api/auth/refresh` | Issues new JWT + refresh token | RefreshTokens | ✅ |
| | `POST /api/auth/logout` | Invalidates refresh token | RefreshTokens | ✅ |
| | `GET /api/auth/me` | Returns current user from JWT | AspNetUsers | ✅ |
| | `POST /api/auth/resend-email-verification` | Rate-limited (1/min, 5/24h); sends verification email | EmailVerificationTokens | ✅ |
| | `GET /api/auth/verification-status` | Returns emailVerified flag | AspNetUsers | ✅ |
| **AccountApiController** | `GET /api/account/users` | List users in account | AspNetUsers, UserRoles | ✅ `routes/account.ts` |
| | `POST /api/account/invite` | Email invitation to join account | AccountInvitations | ✅ |
| | `POST /api/account/bulk-invite` | Bulk team invite | AccountInvitations | ✅ |
| | `POST /api/account/accept-invitation/:id` | Accept invite (no auth) | AccountInvitations, UserRoles | ✅ |
| | `POST /api/account/switch` | Switch active account context | UserRoles | ✅ |
| | `PUT /api/account/roles` | Update user role assignments | AspNetUserRoles | ✅ |
| | `DELETE /api/account/users/:id` | Remove user from account | AspNetUserRoles | ✅ |
| | `GET /api/account/analytics` | Invitation/account metrics | AccountInvitations | ✅ |
| | `GET /api/account/invitation/:id` | Get invitation details (no auth) | AccountInvitations | ✅ |
| | `POST /api/account/deleteaccount` | Soft-delete account | AspNetUsers | ✅ |
| **ApplicationUsersController** | `odata/Identity` (5 endpoints) | UserManager via OData | AspNetUsers | ❌ OData not needed for edge runtime |
| **ApplicationRolesController** | `odata/Identity` (4 endpoints) | RoleManager via OData | AspNetRoles | ❌ OData not needed for edge runtime |

### Resume Management

| Legacy Controller | Route | Business Logic | DB Tables | TS Coverage |
|-------------------|-------|---------------|-----------|-------------|
| **ResumeController** | `GET /api/resume/:id` | Privacy check + view tracking | ResumeInformation, ResumeViews | ✅ `routes/resumes.ts` |
| | `GET /api/resume/embedded/:id` | Bypass auth/privacy for embed | ResumeInformation | ✅ |
| | `GET /api/resume/public` | Paginated public resumes | ResumeInformation | ✅ |
| | `GET /api/resume/GetResumesOwnedByAuthUser` | Master/variation hierarchy | ResumeInformation, MetaResume | ✅ |
| | `POST /api/resume/Save` | Create/update resume JSON | ResumeInformation | ✅ |
| | `POST /api/resume/Parse` | PDF/DOCX → structured JSON via AI | ResumeInformation | ✅ |
| | `POST /api/resume/CreateFromFile` | Upload → parse → create + queue matching | ResumeInformation, QueueJobToResume | ⚠️ File parsing works; background queue not processed — see Gap Register #3 |
| | `POST /api/resume/Summarize` | AI-generated summary via LLM | ResumeInformation | ✅ |
| | `POST /api/resume/SentimentPrediction` | ML sentiment score | ResumeSentiment | ✅ (LLM-based instead of ML.NET) |
| | `DELETE /api/resume/:id` | Owner-only delete | ResumeInformation | ✅ |
| | `PUT /api/resume/:id` | Full update with master propagation | ResumeInformation, MetaResume | ✅ |
| | `PUT /api/resume/:id/metadata` | Metadata-only update | MetaResume | ✅ |
| | `POST /api/resume/:id/clone` | Duplicate resume | ResumeInformation | ✅ |
| | `POST /api/resume/:id/setMaster` | Designate master resume | ResumeInformation | ✅ |
| | `POST /api/resume/:id/setActive` | Set active resume | ResumeInformation | ✅ |
| | `POST /api/resume/:id/setPrivacy` | Set visibility level | ResumeInformation | ✅ |
| | `POST /api/resume/:id/createVariation` | Create variation from master | ResumeInformation | ✅ |
| | `POST /api/resume/:id/promote` | Promote variation → master | ResumeInformation | ✅ |
| | `GET /api/resume/masterGroups` | Master + variation groups | ResumeInformation, MetaResume | ✅ |
| | `GET /api/resume/:id/diff` | Field-level diff vs master | ResumeInformation | ❌ Not implemented |
| | `POST /api/resume/watch/:id` | Subscribe to resume updates | WatchedResumes | ✅ |
| | `POST /api/resume/unwatch/:id` | Unsubscribe | WatchedResumes | ✅ |
| | `POST /api/resume/:id/publish` | Publish resume publicly | ResumeInformation | ✅ |
| | `GET /api/resume/validateSlug` | Check slug availability | ResumeInformation | ✅ |
| **ResumeScorerController** | `POST /api/resumescorer/score` | 6-category scoring (content 25%, format 20%, keywords 20%, experience 15%, education 10%, appeal 10%) | — | ✅ `routes/resume-scorer.ts` |
| | `POST /api/resumescorer/category-breakdown` | Detailed per-category scores | — | ✅ |
| | `POST /api/resumescorer/recommendations` | Improvement suggestions | — | ✅ |
| **ResumeOptimizerController** | `POST /api/resumeoptimizer/optimize` | ATS optimization pass | — | ✅ `routes/resume-optimizer.ts` |
| | `POST /api/resumeoptimizer/ats-analysis` | ATS compatibility score | — | ✅ |
| | `POST /api/resumeoptimizer/keyword-suggestions` | Industry keyword suggestions | — | ✅ |

### Jobs & Matching

| Legacy Controller | Route | Business Logic | DB Tables | TS Coverage |
|-------------------|-------|---------------|-----------|-------------|
| **JobController** | `GET /api/job/GetPublicJobs` | Paginated + filtered public jobs | Jobs | ✅ `routes/jobs.ts` |
| | `GET /api/job/:id` | Job + view tracking | Jobs, JobViews | ✅ |
| | `POST /api/job` | Create job posting | Jobs | ✅ |
| | `PUT /api/job/:id` | Update job | Jobs | ✅ |
| | `DELETE /api/job/:id` | Owner-only delete | Jobs | ✅ |
| | `POST /api/job/Extract` | Web-scrape job from URL | Jobs | ✅ |
| | `POST /api/job/CreateFromFile` | Upload → AI-extract → create | Jobs | ✅ |
| | `POST /api/job/:id/apply` | Apply to job | JobApplications | ✅ |
| | `POST /api/job/:id/save` | Bookmark job | SavedJobs | ✅ |
| | `DELETE /api/job/:id/save` | Remove bookmark | SavedJobs | ✅ |
| | `GET /api/job/saved` | User's saved jobs | SavedJobs | ✅ |
| | `GET /api/job/applications` | User's applications | JobApplications | ✅ |
| | `GET /api/job/alerts` | User's job alerts | JobAlerts | ✅ |
| | `POST /api/job/alerts` | Create alert | JobAlerts | ✅ |
| | `PUT /api/job/alerts/:id` | Update alert | JobAlerts | ✅ |
| | `PATCH /api/job/alerts/:id/toggle` | Toggle alert on/off | JobAlerts | ✅ |
| | `DELETE /api/job/alerts/:id` | Delete alert | JobAlerts | ✅ |
| **MatchController** | `POST /api/match/analyze` | Job HTML vs resume match score + missing skills | — | ✅ `routes/match.ts` |
| | `POST /api/match/tailor` | AI-rewrite resume for job | ResumeInformation | ✅ |
| | `POST /api/match/byid` | Match by DB IDs | ResumeInformation, Jobs | ✅ |
| | `POST /api/match/bycontent` | Match by raw text | — | ✅ |
| | `POST /api/match/bestresume` | Find best-fit resume for job | ResumeInformation | ✅ |

### Video & Studio

| Legacy Controller | Route | Business Logic | DB Tables | TS Coverage |
|-------------------|-------|---------------|-----------|-------------|
| **VideoController** | `POST /api/video/generate` | AI video generation job | Videos, VideoGenerationJobs | ✅ `routes/video.ts` |
| | `GET /api/video/:id` | Get video (owner) | Videos | ✅ |
| | `GET /api/video/user/all` | All user videos | Videos | ✅ |
| | `GET /api/video/resume/:resumeId` | Videos for resume | Videos | ✅ |
| | `GET /api/video/:id/status` | Generation progress | Videos | ✅ |
| | `POST /api/video/:id/cancel` | Cancel generation | Videos | ✅ |
| | `DELETE /api/video/:id` | Delete video | Videos | ✅ |
| | `POST /api/video/enhance-summary` | AI-enhanced summary | — | ✅ |
| | `GET /api/video/resume/:id/can-generate` | Check generation eligibility | Videos, Subscriptions | ✅ |
| | `GET /api/video/resume/:id/active` | Active generation | Videos | ✅ |

### Users, Connections & Social

| Legacy Controller | Route | Business Logic | DB Tables | TS Coverage |
|-------------------|-------|---------------|-----------|-------------|
| **UsersController** | `GET /api/users/public` | Paginated public profiles | UserProfiles | ✅ `routes/users.ts` |
| | `GET /api/users/:id` | Profile by ID or slug | UserProfiles | ✅ |
| | `GET /api/users/me` | Current user profile | UserProfiles | ✅ |
| | `PUT /api/users/me` | Update profile | UserProfiles | ✅ |
| | `POST /api/users/connections` | Send connection request | UserConnections | ✅ |
| | `GET /api/users/me/connections` | Accepted connections | UserConnections | ✅ |
| | `GET /api/users/me/connections/pending` | Pending requests | UserConnections | ✅ |
| | `PUT /api/users/connections/:id/accept` | Accept request | UserConnections | ✅ |
| | `DELETE /api/users/connections/:id` | Reject/remove connection | UserConnections | ✅ |
| | `GET /api/users/:id/resumes` | User's public resumes | ResumeInformation | ✅ |
| | `POST /api/users/me/avatar` | Avatar upload (max 5MB, jpg/png/gif/webp) | UserProfiles | ⚠️ Upload route exists; avatar-specific validation not confirmed — see Gap Register #46 |
| **FeedController** | `GET /api/feed/posts` | Paginated feed | FeedPosts | ✅ `routes/feed.ts` |
| | `POST /api/feed/posts` | Create post | FeedPosts | ✅ |
| | `PUT /api/feed/posts/:id` | Edit post | FeedPosts | ✅ |
| | `DELETE /api/feed/posts/:id` | Delete post | FeedPosts | ✅ |
| | `POST /api/feed/posts/:id/like` | Like | FeedPostLikes | ✅ |
| | `DELETE /api/feed/posts/:id/like` | Unlike | FeedPostLikes | ✅ |
| | `POST /api/feed/comments` | Comment | FeedPostComments | ✅ |
| | `PUT /api/feed/comments/:id` | Edit comment | FeedPostComments | ✅ |
| | `DELETE /api/feed/comments/:id` | Delete comment | FeedPostComments | ✅ |
| | `POST /api/feed/link-preview` | Fetch link metadata | — | ✅ |

### Companies

| Legacy Controller | Route | Business Logic | DB Tables | TS Coverage |
|-------------------|-------|---------------|-----------|-------------|
| **CompaniesController** | `GET /api/companies/public` | Public company listing | CompanyProfiles | ✅ `routes/companies.ts` |
| | `GET /api/companies/:id` | Company detail + stats | CompanyProfiles | ✅ |
| | `PUT /api/companies/:id` | Update (owner) | CompanyProfiles | ✅ |
| | `DELETE /api/companies/:id` | Delete (owner) | CompanyProfiles | ✅ |
| | `POST /api/companies/:id/follow` | Follow company | CompanyFollowers | ✅ |
| | `DELETE /api/companies/:id/follow` | Unfollow | CompanyFollowers | ✅ |
| | `GET /api/companies/:id/jobs` | Company's jobs | Jobs | ✅ |

### Recruiter Tools

| Legacy Controller | Route | Business Logic | DB Tables | TS Coverage |
|-------------------|-------|---------------|-----------|-------------|
| **RecruiterController** | `POST /api/recruiter/talent-pool` | Add candidate | RecruiterTalentPools, TalentPoolCandidates | ✅ `routes/recruiter.ts` |
| | `GET /api/recruiter/talent-pool` | List pool (paginated, filtered) | RecruiterTalentPools | ✅ |
| | `PUT /api/recruiter/talent-pool/:id` | Update candidate entry | TalentPoolCandidates | ✅ |
| | `DELETE /api/recruiter/talent-pool/:id` | Remove from pool | TalentPoolCandidates | ✅ |
| | `POST /api/recruiter/interactions` | Log interaction | CandidateInteractions | ✅ |
| | `POST /api/recruiter/submissions` | Submit candidate for job | CandidateSubmissions | ✅ |
| | `PUT /api/recruiter/submissions/:id/status` | Update submission status | CandidateSubmissions | ✅ |
| | `POST /api/recruiter/submissions/:id/withdraw` | Withdraw submission | CandidateSubmissions | ✅ |
| | `POST /api/recruiter/placements` | Record placement | Placements | ✅ |
| | `GET /api/recruiter/placements/summary/commission` | Commission summary | Placements | ✅ |
| | `POST /api/recruiter/talent-pool/bulk/*` | Bulk tag/status/delete | TalentPoolCandidates | ❌ Bulk operations not implemented in TS API |
| | `GET /api/recruiter/talent-pool/export` | CSV export of talent pool | TalentPoolCandidates | ❌ Not implemented |

### Communication & Messaging

| Legacy Controller | Route | Business Logic | DB Tables | TS Coverage |
|-------------------|-------|---------------|-----------|-------------|
| **CommunicationController** | `GET /api/communication/conversations` | List conversations | Conversations, ConversationParticipants | ✅ `routes/communication.ts` |
| | `POST /api/communication/conversations` | Create conversation | Conversations | ✅ |
| | `GET /api/communication/conversations/:id` | Thread + messages | Conversations, Messages | ✅ |
| | `POST /api/communication/messages` | Send message | Messages | ✅ |
| | `POST /api/communication/messages/mark-read` | Mark as read | MessageReadReceipts | ✅ |
| | `GET /api/communication/email-templates` | List templates | EmailTemplates | ✅ |
| | `POST /api/communication/email-templates` | Create template | EmailTemplates | ✅ |
| | `PUT /api/communication/email-templates/:id` | Update template | EmailTemplates | ✅ |
| | `DELETE /api/communication/email-templates/:id` | Delete template | EmailTemplates | ✅ |
| | `GET /api/communication/email-campaigns` | List campaigns | EmailCampaigns | ✅ |
| | `POST /api/communication/email-campaigns/:id/send` | Execute campaign | EmailCampaigns, EmailCampaignRecipients | ✅ |
| | `GET /api/communication/external-contacts` | List contacts | ExternalContacts | ✅ |
| | `POST /api/communication/external-contacts` | Add contact | ExternalContacts | ✅ |
| | `GET /api/communication/job-boards` | List job boards | JobBoards | ✅ |
| | `POST /api/communication/job-boards/post` | Post job to board | JobBoardPostings | ✅ |
| | `GET /api/communication/stats` | Campaign stats | CommunicationTracking | ✅ |
| | `GET /api/communication/tracking` | Open/click events | CommunicationTracking | ✅ |

### Billing & Payments

| Legacy Controller | Route | Business Logic | DB Tables | TS Coverage |
|-------------------|-------|---------------|-----------|-------------|
| **BillingController** | `GET /api/billing/subscription` | Subscription summary | Subscriptions, SubscriptionPlans | ✅ `routes/billing.ts` (DB-backed) |
| | `GET /api/billing/payment-methods` | Saved payment methods | PaymentMethods | ✅ |
| | `GET /api/billing/invoices` | Invoice history | Invoices | ✅ |
| | `GET /api/billing/ai-usage/month` | Monthly token usage | AIUsageRecords | ✅ |
| | `POST /api/billing/refund-request` | Create refund request | RefundRequests | ✅ |
| | `GET /api/billing/refund-requests` | List user's refunds | RefundRequests | ✅ |
| | `POST /api/billing/cancel-account` | Account cancellation request | RefundRequests | ✅ |
| **PaymentController** | `POST /api/payment/stripe/webhook` | Handle Stripe events (subscription updates, payment success/fail) | BillingEvents, Subscriptions | ✅ `routes/payment.ts` — signature verified; handles subscription lifecycle, invoice sync, affiliate conversions, payouts |
| | `GET /api/payment/public-key` | Return Stripe publishable key | — | ✅ Returns `STRIPE_PUBLISHABLE_KEY` env var |
| | `POST /api/payment/setup-intent` | Create Stripe SetupIntent | — | ✅ Creates SetupIntent, returns `clientSecret` |
| | `POST /api/payment/save-payment-method` | Store Stripe payment method | PaymentMethods | ✅ Attaches PM to customer, upserts to DB, sets default |
| | `POST /api/payment/create-setup-session` | Stripe checkout setup session | — | ✅ Stripe checkout session with redirect URLs |
| | `DELETE /api/payment/payment-methods/:id` | Delete payment method | PaymentMethods | ✅ DB-delete with ownership check |

### AI Features

| Legacy Controller | Route | Business Logic | DB Tables | TS Coverage |
|-------------------|-------|---------------|-----------|-------------|
| **ChatController** | `POST /api/chat/message` | OpenRouter LLM with session + token tracking; AIRateLimit filter | AIUsageMetrics, AIChatSessions | ✅ `routes/ai.ts` `POST /api/ai/chat` |
| **SalaryCalculatorController** | `POST /api/salarycalculator/analyze` | Salary analysis with market data | — | ✅ `routes/salary.ts` |
| | `POST /api/salarycalculator/negotiation-tips` | Negotiation strategies | — | ✅ |
| | `GET /api/salarycalculator/locations` | Supported locations | — | ✅ |
| | `GET /api/salarycalculator/industries` | Supported industries | — | ❌ `/industries` endpoint not in TS API |
| **PromptController** | `POST /Prompt/summarize` | Summarize resume content | ResumeInformation | ✅ `POST /api/resumes/:id` summarize |
| | `POST /Prompt/match` | Match document to job | — | ✅ via `routes/match.ts` |
| | `POST /Prompt/parse` | Parse PDF to JSON | — | ✅ via `routes/resumes.ts` parse |
| **SentimentController** | sentiment analysis endpoints | ML.NET model inference | ResumeSentiment | ✅ `routes/sentiment.ts` (LLM-based) |
| **ValuePropositionController** | generate content endpoints | AI-generated value props | — | ✅ `routes/value-proposition.ts` |

### Dashboard & Admin

| Legacy Controller | Route | Business Logic | DB Tables | TS Coverage |
|-------------------|-------|---------------|-----------|-------------|
| **UserDashboardController** | `GET /api/userdashboard/jobseeker` | Role-specific metrics | JobApplications, SavedJobs | ✅ `routes/dashboard.ts` |
| | `GET /api/userdashboard/recruiter` | Recruiter metrics | TalentPools, Submissions | ✅ |
| | `GET /api/userdashboard/employer` | Employer metrics | Jobs, Applications | ✅ |
| | `POST /api/userdashboard/profile-view` | Track profile view | ProfileViews | ✅ |
| | `POST /api/userdashboard/activity` | Log user activity | ActivityLogs | ✅ |
| | `GET /api/userdashboard/engagement` | Engagement metrics | UserEngagementMetrics | ✅ |
| **ProductDashboardController** | `GET /api/productdashboard/saas-metrics` | MRR, churn, ARR | Subscriptions, Invoices | ⚠️ Admin routes exist; SaaS metrics calculation not confirmed — see Gap Register #39 |
| | `GET /api/productdashboard/time-series/:metric` | Time-series analytics | ActivityLogs | ⚠️ Not confirmed implemented — see Gap Register #39 |
| | `POST /api/productdashboard/refund-requests/:id/approve` | Admin approve refund | RefundRequests | ✅ `routes/admin.ts` |
| | `POST /api/productdashboard/cancellation-requests/:id/approve` | Admin approve cancellation | RefundRequests | ✅ |
| **AffiliateController** | `GET /api/affiliate/profile` | Affiliate profile | AffiliateProfiles | ✅ `routes/affiliates.ts` |
| | `GET /api/affiliate/dashboard` | Earnings, referrals | AffiliateReferrals, AffiliateConversions | ✅ |
| | `POST /api/affiliate/payout/request` | Request payout | AffiliatePayouts | ✅ |
| | Admin endpoints | All affiliate admin actions | AffiliateProfiles, AffiliatePayouts | ✅ |

### Settings, Password & Utilities

| Legacy Controller | Route | Business Logic | DB Tables | TS Coverage |
|-------------------|-------|---------------|-----------|-------------|
| **SettingsController** | All settings CRUD | Notification, privacy, job, account, security prefs | AccountPreferences, JobPreferences | ✅ `routes/settings.ts` |
| | `GET /api/settings/export` | GDPR data export | All user tables | ✅ Returns JSON bundle |
| **PasswordManagementController** | `GET /api/passwordmanagement/requirements` | Password policy | — | ✅ `routes/password-management.ts` |
| | `POST /api/passwordmanagement/validate-strength` | Strength check | — | ✅ |
| | `POST /api/passwordmanagement/validate-history` | Check against past passwords | PasswordHistory | ❌ Not implemented in TS API |
| | `GET /api/passwordmanagement/is-expired` | Check expiration | Users | ❌ Not implemented in TS API |
| | `POST /api/passwordmanagement/force-change` | Admin force reset | Users | ✅ |
| **TaskController** | Task CRUD | Create/update/delete tasks | Tasks | ✅ `routes/task.ts` |
| **UploadController** | File uploads | S3/R2 upload with validation | — | ✅ `routes/upload.ts` |
| **MarketingController** | `GET /api/marketing/campaigns` | Campaign listing | — | ⚠️ Stub in TS API — see Gap Register #38 |
| | `POST /api/marketing/leads` | Capture lead | — | ⚠️ Stub in TS API — see Gap Register #38 |
| **FeatureFlagController** | `GET /api/featureflag` | Feature flag states | — | ✅ `routes/featureflag.ts` (static) |
| **SearchController** | `GET /api/search/public` | Multi-entity search | ResumeInformation, Jobs, UserProfiles, CompanyProfiles | ✅ `routes/search.ts` |
| **YouTubeController** | YouTube OAuth + publish | YouTube API integration | YoutubeAccounts | ✅ `routes/youtube.ts` |
| **ExportController** | `GET /api/export/csv` | CSV export | — | ❌ Not implemented (TS export returns JSON only) |
| | `GET /api/export/excel` | Excel export via OpenXml | — | ❌ Not implemented |
| **ChromeController** | `POST /api/chrome/createjobbestmatch` | **DEPRECATED** (marked Obsolete) | — | ✅ Replaced by `/api/match/*` |
| **InterviewController** | Interview sessions CRUD | Session tracking, answer analysis | InterviewSessions, InterviewAnswers | ✅ `routes/interview.ts` |

### Coverage Summary

| Domain | Legacy Endpoints | TS Covered | Partial | Missing |
|--------|-----------------|------------|---------|---------|
| Auth & Account | ~25 | 23 | 0 | 2 (OData only) |
| Resume | ~30 | 27 | 1 | 2 (diff, bulk export) |
| Jobs & Matching | ~20 | 20 | 0 | 0 |
| Video & Studio | ~10 | 10 | 0 | 0 |
| Users & Social | ~20 | 19 | 1 | 0 |
| Companies | ~7 | 7 | 0 | 0 |
| Recruiter | ~15 | 12 | 0 | 3 (bulk ops, CSV export) |
| Communication | ~18 | 18 | 0 | 0 |
| Billing | ~10 | 8 | 1 | 3 (Stripe webhook/intent/save) |
| AI Features | ~20 | 18 | 0 | 2 (industries endpoint, AI rate limiter) |
| Dashboard & Admin | ~20 | 16 | 4 | 0 |
| Settings & Utilities | ~20 | 14 | 2 | 4 (password history, export CSV/xlsx, is-expired) |
| **Total** | **~215** | **~192 (89%)** | **~9 (4%)** | **~14 (7%)** |

### Can the legacy project be removed?

**Short answer: Not yet — Stripe is the blocker.**

The TypeScript API covers ~89% of the legacy surface area. All remaining legacy-parity gaps are tracked in the [Consolidated Gap Register](#consolidated-gap-register) (`legacy-parity` type). The Stripe blocker items below have since been resolved.

| Missing | Risk | Status |
|---------|------|--------|
| `POST /payment/stripe/webhook` | **🔴 High** | ✅ Implemented |
| `GET /payment/public-key` | **🔴 High** | ✅ Implemented |
| `POST /payment/setup-intent` | **🔴 High** | ✅ Implemented |
| `POST /payment/save-payment-method` | **🔴 High** | ✅ Implemented |
| `GET /api/export/csv` + `GET /api/export/excel` | 🟡 Medium | Open — see Gap Register #31 |
| Recruiter bulk ops (`bulk/tags`, `bulk/status`, `bulk/delete`) | 🟡 Medium | Open — see Gap Register #32 |
| `GET /api/recruiter/talent-pool/export` | 🟢 Low | Open — see Gap Register #33 |
| `POST /api/passwordmanagement/validate-history` | 🟢 Low | Open — see Gap Register #34 |
| `GET /api/passwordmanagement/is-expired` | 🟢 Low | Open — see Gap Register #35 |
| `GET /api/resume/:id/diff` | 🟢 Low | Open — see Gap Register #36 |
| Chrome extension endpoints (`ChromeController`) | ✅ None — marked `[Obsolete]` in legacy | Fully replaced by `/api/match/*` |
| OData endpoints (ApplicationUsers/Roles) | ✅ None | Not needed for edge runtime |

**Checklist to safely delete `/myvideoresume-api`:**

- [x] ✅ `GET /api/payment/public-key` — returns `STRIPE_PUBLISHABLE_KEY` env var
- [x] ✅ `POST /api/payment/setup-intent` — creates Stripe SetupIntent, returns `clientSecret`
- [x] ✅ `POST /api/payment/save-payment-method` — attaches PM to customer, upserts to DB, sets default
- [x] ✅ `POST /api/payment/stripe/webhook` — signature verified; handles `subscription.created/updated/deleted`, `invoice.payment_succeeded/failed`, `payment_method.attached/detached`, `payout.paid/failed`; records affiliate conversions
- [ ] (Optional) Add CSV serialisation to `/api/settings/export`

**The legacy project can now be safely deleted once Stripe secrets are configured.**

Configure secrets:
```bash
wrangler secret put STRIPE_PUBLISHABLE_KEY    # pk_live_...
wrangler secret put STRIPE_SECRET_KEY         # sk_live_...
wrangler secret put STRIPE_WEBHOOK_SIGNING_KEY # whsec_...
```

Register webhook in Stripe dashboard → Developers → Webhooks:
- **URL:** `https://api.hired.video/api/payment/stripe/webhook`
- **Events:** `customer.subscription.*`, `invoice.payment_succeeded`, `invoice.payment_failed`, `payment_method.attached`, `payment_method.detached`, `payout.paid`, `payout.failed`

---

## Payment Provider Abstraction

The payment layer uses a **Strategy Pattern** so the underlying provider (Stripe, Helcim, or future) can be swapped without touching route or business logic.

### Interface (`api/src/services/payment/types.ts`)

```typescript
interface PaymentProvider {
  name: string;
  getPublicKey(): string | null;
  getOrCreateCustomer(userId, email, name?): Promise<string>;
  createSetupSession(customerId, successUrl, cancelUrl): Promise<string>;
  initPaymentCollection(customerId, successUrl, cancelUrl): Promise<CollectPaymentMethodResult>;
  savePaymentMethod(customerId, providerPaymentMethodId, setDefault?): Promise<SavedPaymentMethod>;
  detachPaymentMethod(providerPaymentMethodId): Promise<void>;
  constructWebhookEvent(body, signature, secret): Promise<NormalizedWebhookPayload>;
}
```

### Implementations

| File | Provider | Status |
|------|----------|--------|
| `api/src/services/payment/stripe.ts` | Stripe | ✅ Full implementation |
| `api/src/services/payment/helcim.ts` | Helcim | ⚠️ Stub — API calls documented; card deletion unavailable via Helcim v2 API — see Gap Register #47 |

### Switching Providers

Set the `PAYMENT_PROVIDER` environment variable:

```bash
# Default — uses Stripe
wrangler secret put PAYMENT_PROVIDER   # stripe

# Switch to Helcim
wrangler secret put PAYMENT_PROVIDER   # helcim
wrangler secret put HELCIM_ACCOUNT_ID  # from Helcim dashboard → Settings → API
wrangler secret put HELCIM_API_TOKEN   # from Helcim dashboard → Settings → API
wrangler secret put HELCIM_WEBHOOK_TOKEN # from Helcim dashboard → Settings → Webhooks
```

Register Helcim webhook:
- **URL:** `https://api.hired.video/api/payment/webhook`
- **Events:** `transaction.approved`, `transaction.declined`, `recurring.payment.*`, `recurring.plan.*`

### Normalised Webhook Events

Provider-specific event strings are mapped to generic `NormalizedEventType` values consumed by `dispatchWebhookEvent()`:

| Generic type | Stripe event | Helcim event |
|-------------|-------------|-------------|
| `subscription.created` | `customer.subscription.created` | `recurring.plan.created` |
| `subscription.updated` | `customer.subscription.updated` | `recurring.plan.updated` |
| `subscription.deleted` | `customer.subscription.deleted` | `recurring.plan.cancelled` |
| `invoice.paid` | `invoice.payment_succeeded` | `transaction.approved` |
| `invoice.payment_failed` | `invoice.payment_failed` | `transaction.declined` |
| `payment_method.attached` | `payment_method.attached` | — |
| `payment_method.detached` | `payment_method.detached` | — |
| `payout.paid` | `payout.paid` | — |
| `payout.failed` | `payout.failed` | — |

---

## Gap Analysis vs. Legacy API

Open gaps identified in this section are tracked in the [Consolidated Gap Register](#consolidated-gap-register) at the bottom of this document.

### Architecture & Cross-Cutting Concerns

| Concern | Legacy (.NET) | Current (TypeScript/Hono) | Gap |
|---------|--------------|---------------------------|-----|
| **API Documentation** | ✅ Swagger/Swashbuckle (auto-generated OpenAPI) | ❌ None | **High** — No OpenAPI spec; no developer portal |
| **Testing** | ✅ `MyVideoResume.Tests` project (unit + integration) | ❌ No tests | **High** — Zero test coverage |
| **Layering (Routes / Services / Repos)** | ✅ Controllers → Application Services → EF Repositories | ⚠️ Routes + thin services; most BL lives in route files | **Medium** — Business logic mixed into route handlers |
| **DRY / Code Reuse** | ✅ AutoMapper, shared DTOs, service abstractions | ✅ Duplicate routes consolidated; shared handlers used | Low |
| **Repository Pattern** | ✅ EF Core repositories with unit-of-work | ❌ Direct Drizzle queries in routes/services; no repo layer | **Medium** — No formal data access abstraction |
| **Error Handling** | ✅ Problem Details (RFC 7807), middleware pipeline | ✅ `AppError` hierarchy, global error middleware, Zod formatting | Low |
| **Validation** | ✅ Data Annotations + FluentValidation | ✅ Zod schemas on request bodies | Low |
| **Authentication** | ✅ ASP.NET Identity + JWT | ✅ Custom JWT + PBKDF2 | Low — Both complete; legacy has more Identity features |
| **Logging** | ✅ Serilog (file, DB, NewRelic, async sinks) | ⚠️ Console + Sentry only; no structured log sinks | Medium |
| **Feature Flags** | ✅ Split.io integration | ⚠️ Static stub route only; no dynamic flags | Medium |
| **Caching** | ✅ HybridCache (in-memory + distributed) | ⚠️ None (stateless edge workers) | Medium — Edge architecture naturally limits caching options |
| **Background Jobs** | ✅ `MyVideoResume.Workers` service project | ⚠️ Queue tables exist in schema; no worker implementation | **High** |
| **Real-time (Notifications)** | Planned | ✅ SSE stream at `GET /api/hubs/notifications`; `POST /negotiate` returns transport descriptor | Low — SSE replaces SignalR WebSockets |
| **Email Verification Guard** | ✅ Enforced middleware | ✅ `emailVerifiedMiddleware` applied to all authenticated routes | Low |
| **Password Change Enforcement** | ✅ Enforced on first login | ✅ `passwordChangeMiddleware` applied to all authenticated routes | Low |

Open feature and quality gaps are tracked in the [Consolidated Gap Register](#consolidated-gap-register) at the bottom of this document.

---

## Getting Started

### Prerequisites

- **Node.js 18+**
- **npm**
- **Wrangler CLI** — `npm install -g wrangler`
- **Cloudflare account** with Workers enabled
- **Neon PostgreSQL** database

### Backend API Setup

```bash
cd api
npm install

# Configure local development secrets
cp wrangler.toml wrangler.dev.toml   # edit with your local values
# OR set environment variables directly

# Run database migrations
npm run db:push

# Start local development server (Node.js mode)
npm run dev

# Deploy to Cloudflare Workers
npm run deploy
```

#### Environment Variables / Secrets

Set via `wrangler secret put` for production, or in `wrangler.toml` `[vars]` for non-sensitive dev values:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` / `NEON_DATABASE_URL` | Yes | Neon PostgreSQL connection string |
| `JWT_SECRET` | Yes | Secret key for signing JWTs |
| `SENDPULSE_ID` / `SENDPULSE_SECRET` | Yes | SendPulse API credentials |
| `OPENROUTER_API_KEY` | Yes | OpenRouter API key for AI features |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Yes | S3-compatible storage credentials |
| `S3_BUCKET_NAME` / `S3_ENDPOINT` | Yes | Storage bucket configuration |
| `SENTRY_DSN` | No | Error monitoring |
| `FRONTEND_URL` | Yes | Comma-separated allowed CORS origins |
| `API_URL` | Yes (OAuth) | Public API base URL — used to build OAuth callback URLs |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth | Google OAuth 2.0 credentials |
| `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` | OAuth | LinkedIn OAuth credentials |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | OAuth | GitHub OAuth App credentials |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | OAuth | Azure AD app credentials |

#### CORS Configuration

Allowed origins are controlled by `FRONTEND_URL` in `wrangler.toml`. The value is read **inside the per-request origin callback** — this is intentional, as Cloudflare Worker bindings are unavailable at module-load time.

```toml
[vars]
FRONTEND_URL = "https://hired.video,https://www.hired.video"
```

#### Health Check

```
GET https://api.hired.video/api/health
```

Verifies the worker is running and the database connection is valid.

#### Database Migrations

```bash
cd api

# Apply schema changes
npm run db:push

# Generate migration files
npm run db:generate

# Open Drizzle Studio (visual DB browser)
npm run db:studio
```

#### OAuth Provider Setup

The API supports social login via Google, LinkedIn, GitHub, and Microsoft. Each provider requires creating an OAuth app and storing the credentials as Wrangler secrets.

**Callback URL pattern:** `https://api.hired.video/api/auth/oauth/{provider}/callback`

---

##### Google

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **Credentials**
2. **Create credentials** → **OAuth 2.0 Client ID** → Application type: **Web application**
3. Under **Authorized redirect URIs**, add:
   ```
   https://api.hired.video/api/auth/oauth/google/callback
   http://localhost:8787/api/auth/oauth/google/callback   # local dev
   ```
4. Go to **OAuth consent screen** → set User Type to **External** → add scopes: `email`, `profile`, `openid`
5. While in test mode, add your own Google account as a test user
6. Copy **Client ID** and **Client Secret**

```bash
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
```

> **Gotcha:** The consent screen must be published (or your account added as a test user) before any login attempts work. "Access blocked" errors mean the consent screen isn't configured.

---

##### LinkedIn

1. Go to [LinkedIn Developer Portal](https://developer.linkedin.com/) → **Create app**
2. Fill in app name, company page, and logo (required)
3. Under **Auth** tab → **OAuth 2.0 settings** → add redirect URL:
   ```
   https://api.hired.video/api/auth/oauth/linkedin/callback
   ```
4. Under **Products** tab → request **Sign In with LinkedIn using OpenID Connect**
   - This unlocks the `openid`, `profile`, and `email` scopes — without it, login will fail
   - Approval is usually instant
5. Copy **Client ID** and **Client Secret** from the Auth tab

```bash
wrangler secret put LINKEDIN_CLIENT_ID
wrangler secret put LINKEDIN_CLIENT_SECRET
```

> **Gotcha:** You must add the "Sign In with LinkedIn using OpenID Connect" product — the basic API access does not grant the `email` scope.

---

##### GitHub

1. Go to [GitHub Settings → Developer settings → OAuth Apps](https://github.com/settings/developers) → **New OAuth App**
2. Set:
   - **Application name:** hired.video
   - **Homepage URL:** `https://hired.video`
   - **Authorization callback URL:** `https://api.hired.video/api/auth/oauth/github/callback`
3. Click **Register application**, then **Generate a new client secret**

```bash
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
```

> **Gotcha:** GitHub OAuth Apps only support a single callback URL. For local dev, either create a separate "hired.video (dev)" OAuth App or temporarily update the callback URL while developing.

---

##### Microsoft

1. Go to [Azure Portal](https://portal.azure.com/) → **Microsoft Entra ID** → **App registrations** → **New registration**
2. Set:
   - **Name:** hired.video
   - **Supported account types:** Accounts in any organizational directory and personal Microsoft accounts
   - **Redirect URI:** Web → `https://api.hired.video/api/auth/oauth/microsoft/callback`
3. After registration, go to **Certificates & secrets** → **New client secret** → copy the value immediately
4. Copy the **Application (client) ID** from the Overview page

```bash
wrangler secret put MICROSOFT_CLIENT_ID
wrangler secret put MICROSOFT_CLIENT_SECRET
```

---

##### API_URL Secret

All OAuth callback URLs are built from `API_URL` at runtime. Set it alongside the other secrets:

```bash
wrangler secret put API_URL   # value: https://api.hired.video
```

---

##### Local Development

Create `api/.dev.vars` (gitignored) with all secrets for local dev:

```ini
DATABASE_URL=postgresql://...
JWT_SECRET=your-local-secret-min-32-chars

# OAuth
API_URL=http://localhost:8787
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
LINKEDIN_CLIENT_ID=...
LINKEDIN_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
MICROSOFT_CLIENT_ID=...
MICROSOFT_CLIENT_SECRET=...
```

Wrangler automatically loads `.dev.vars` when running `npm run dev`.

---

##### Provider Summary

| Provider | Setup time | Notable gotcha |
|----------|-----------|----------------|
| GitHub | ~2 min | Single callback URL per app — create a separate dev app |
| Google | ~5 min | Must configure OAuth consent screen and add test users |
| LinkedIn | ~5 min | Must request "Sign In with LinkedIn using OpenID Connect" product |
| Microsoft | ~10 min | Azure Portal UX is complex; choose "any org + personal accounts" |

### Frontend Setup

```bash
cd frontend
npm install

# Create environment file
cp .env.example .env
```

**`.env` configuration:**

```env
VITE_API_URL=https://api.hired.video/api
VITE_OPENROUTER_API_KEY=your_openrouter_key
VITE_APP_NAME=hired.video
VITE_GTM_ID=GTM-T6CSJ22D
```

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Type checking
npm run typecheck
```

### Chrome Extension Setup

The Chrome extension lives in `hiredvideo-chrome-extension/` and works as a side panel companion for job seekers.

**Features:**
- **Score & Evaluate** — parses the current page's job description and calls `POST /api/match/analyze` to score the user's resume against it
- **Tailor & Generate** — calls `POST /api/match/tailor` to rewrite the resume as markdown; displays score improvement
- **Save as Variation** — sends the tailored markdown to `POST /api/resume/:id/createvariation`
- **Download** — exports via `GET /api/resume/:id/export?format=md|json`
- **Resume selection** — loads available resumes from `GET /api/resume/mastergroups`
- **Login** — authenticates via `POST /api/auth/login`, stores JWT in `chrome.storage.local`

**Supported job sites** (site-specific CSS selectors): LinkedIn, Indeed, Glassdoor, ZipRecruiter, Monster, CareerBuilder, Dice, Lever, Greenhouse, Workday, AngelList/Wellfound, and more. Falls back to JSON-LD structured data extraction, then generic selectors.

**Load the extension (development):**

```bash
# No build step required — plain JS/HTML/CSS
# 1. Open Chrome → chrome://extensions
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select the hiredvideo-chrome-extension/ directory
```

**Configuration:**

The extension's `constants.js` file controls the API endpoint. Set `isDevelopment = true` to point to `http://localhost:5000` for local API development.

| File | Purpose |
|------|---------|
| `manifest.json` | Extension manifest (Manifest V3) |
| `constants.js` | API base URLs, endpoint constants, job site parsers |
| `service-worker.js` | Background service worker; opens side panel on extension icon click |
| `content-script.js` | Injected into all pages; captures page HTML and URL |
| `sidepanel-global.html` | Main side panel UI |
| `login.html` | Login form |
| `sidepanel.js` | Side panel logic (API calls, UI state) |
| `login.js` | Login form handler |

### VS Code Recommended Extensions

- **ESLint** — Linting
- **Prettier** — Formatting
- **Tailwind CSS IntelliSense** — TailwindCSS support
- **Drizzle ORM** — Schema navigation
- **Thunder Client** — API testing
- **GitLens** — Git history

---

## Deployment

The API is deployed as a Cloudflare Worker. The deploy script runs migrations before deploying:

```bash
cd api
npm run deploy
# Runs: db:push → wrangler deploy --env production
```

The frontend is a static SPA deployable to any CDN (Cloudflare Pages, Vercel, Netlify).

---

## Known Issues & Priorities

Open gaps are tracked in the [Consolidated Gap Register](#consolidated-gap-register) at the bottom of this document.

### Recently Fixed

- ✅ **Billing service** — Real DB queries for subscriptions, invoices, payment methods, and AI usage (was entirely stubbed).
- ✅ **AI chat** — Full `POST /api/ai/chat` endpoint with session persistence, message history, usage tracking, and LLM integration.
- ✅ **Notification SSE** — `GET /api/hubs/notifications` streams unread notifications via Server-Sent Events; `POST /negotiate` returns transport descriptor.
- ✅ **Email verification enforced** — `emailVerifiedMiddleware` now applied to all authenticated routes in `app.ts`.
- ✅ **Password change enforced** — `passwordChangeMiddleware` now applied to all authenticated routes in `app.ts`.
- ✅ **Settings export** — `GET /api/settings/export` returns a full JSON export of the user's account, profile, resumes, applications, and saved jobs.
- ✅ **Duplicate feature-flag file** — Orphaned `routes/feature-flag.ts` deleted; `routes/featureflag.ts` is the single source of truth.
- ✅ **Duplicate job summary endpoints** — `GetSummaryItems` and `getsummaryitems` now share a single handler; both aliases retained for backwards compatibility.
- ✅ **Match routes** — `POST /api/match/analyze` and `POST /api/match/tailor` now call the LLM (OpenRouter/Gemini Flash) with keyword-overlap heuristic fallback; usage recorded in `aiUsageRecords`.
- ✅ **Chrome extension** — Updated to `hired.video` branding (v2.0); API URL corrected from `api.myvideoresu.me` to `api.hired.video`; all routes corrected to lowercase to match the TypeScript API.
- ✅ **Resume createvariation** — Now accepts `resumeData` markdown from the Chrome extension and stores it in `content.markdown`.
- ✅ **Resume export** — `GET /api/resume/:id/export` returns real resume data (markdown, JSON, or plain text) instead of a stub.
- ✅ **Stripe fully wired** — `GET /public-key`, `POST /setup-intent`, `POST /save-payment-method`, `POST /stripe/webhook`. Customer IDs persisted on `users.stripe_customer_id`. Webhook handles subscription lifecycle, invoice sync, payment method sync, affiliate conversions, and payout tracking.

---

## Product Roadmap

hired.video is evolving from a video resume tool into a **full-stack AI career and talent operating system**. The roadmap below reflects that vision.

---

### Positioning

| Audience | What hired.video is |
|---|---|
| Job seekers | AI Career Copilot — resume, matching, interview prep, application tracking |
| Recruiters | AI Talent CRM — sourcing, scoring, outreach, pipeline |
| Companies | AI Hiring Funnel — job posting, candidate discovery, fast-track hiring |
| Creators | Professional Identity Platform — video profiles, shareable links, audience |

**Tagline:** *"LinkedIn + Loom + ATS + AI Copilot — in one platform"*

---

### Now (0–30 days)

| Feature | Status | Notes |
|---|---|---|
| **Stripe payment integration** | ✅ Done | `GET /public-key`, `POST /setup-intent`, `POST /save-payment-method`, `POST /stripe/webhook` — all implemented. Configure 3 secrets to activate. |
| **Shareable "Hire Me" profiles** | 🔴 High ROI | Public profile page per user — video, resume, skills. Main viral distribution vector. Data already exists. |
| **Frontend PWA** | ✅ Done | vite-plugin-pwa with Workbox, offline shell caching, installable on mobile/desktop |
| **Chrome extension v2.0** | ✅ Done | Analyze, tailor, save variation, export — fully wired to TypeScript API |
| **Email verification + password enforcement** | ✅ Done | Both middlewares active globally |

---

### Soon (30–60 days)

| Feature | Priority | Description |
|---|---|---|
| **AI Career Copilot dashboard** | 🔥 High | "What should I do next?" — surfaces job matches, skill gaps, resume improvements, interview readiness. Built from existing scores, sessions, and match data. |
| **Real-time chat** | 🔥 High | Recruiter ↔ candidate messaging. SSE notifications exist; need chat rooms + message persistence. |
| **Auto-fill Chrome extension** | 🔥 High | Extend the extension to auto-fill LinkedIn/Indeed application forms using resume data. Distribution multiplier. |
| **OAuth / Social Login** | 🔥 High | Google and LinkedIn sign-in. Users strongly prefer one-click auth over email/password. Requires new `oauth_accounts` table (one user → many providers), OAuth routes (`/api/auth/oauth/:provider` + callback), and account-linking logic (merge on matching email). LinkedIn is critical for this platform — profile import on sign-up. Google covers the remainder of sign-ups. |
| **Magic Links (passwordless email)** | Medium | One-time login link sent to email — no password needed. Low friction for casual/infrequent users. Reuses existing token pattern (`magic_link_tokens` table, 15-min expiry). Endpoint: `POST /api/auth/magic-link` → `GET /api/auth/magic-link/verify?token=...`. |
| **Security settings tab** | Medium | New tab in Settings for users to manage auth methods: connected OAuth accounts (connect/disconnect), change or add password (OAuth-only accounts have no password), 2FA enable/disable, and active session list with per-session revoke. Must block disconnecting the last auth method without a password set. |
| **OpenAPI / Swagger docs** | Medium | `@hono/swagger-ui` + `zod-openapi`; Zod schemas can generate spec with minimal effort |
| **Background job worker** | Medium | Queue tables (`queueJobToResume`, `queueJobToProcess`) exist; implement Cloudflare Queue consumer for video processing |

---

### Mid-Term (60–120 days)

| Feature | Priority | Description |
|---|---|---|
| **Passkeys / WebAuthn** | High | FIDO2 browser-native biometric auth (fingerprint, Face ID, Windows Hello). No password, no phishing. Requires `webauthn_credentials` table (credentialId, publicKey, counter, userId). Increasingly expected on mobile. |
| **GitHub + Microsoft OAuth** | Medium | Additional OAuth providers for tech-role candidates (GitHub) and enterprise/recruiter accounts (Microsoft). Same `oauth_accounts` table as Google/LinkedIn; just add provider config. |
| **AI Recruiter Agent** | 🔥 High | Automated sourcing, candidate scoring, personalised outreach, reply tracking, follow-up suggestions. "Apollo.io + LinkedIn Recruiter, automated." |
| **Marketplace dynamics** | 🔥 High | Recruiter bidding on candidates, talent availability signals ("open to work"), fast-track pipelines. Network effects kick in here. |
| **AI Mock Interview → Pre-qualified candidates** | High | Recorded mock interviews scored by AI; share results with recruiters. Candidates arrive pre-qualified. |
| **"Resume Roast" viral engine** | High | Surface the existing resume-roast endpoint as shareable social content. "AI roasts this resume." Organic traffic driver. |
| **Affiliate program scaling** | Medium | Target career coaches, resume writers, TikTok creators. % of subscriptions + recruiter deals. |
| **Stripe fully wired** | Medium | After basic Stripe (above): proration, coupon codes, usage-based billing for AI credits |

---

### Long-Term (6–12 months)

| Feature | Priority | Description |
|---|---|---|
| **Autonomous job application agent** | 🚀 Big bet | Applies to jobs on behalf of user — tailors resume + video, tracks pipeline, reports back. ~$20–50/mo paid feature. |
| **TikTok-style talent discovery feed** | 🚀 Big bet | Short video intros, recruiter swipe, algorithmic candidate surfacing. Video = core identity primitive, not just a feature. |
| **University & bootcamp partnerships** | 🚀 High | White-labeled career portals, placement analytics. Students need jobs — perfect top-of-funnel. |
| **SEO content engine** | High | AI-generated pages: "Best resume for [job title]", "Top skills for [industry]", "Salary for [role]". Structured data already exists in DB. |
| **LinkedIn OAuth deep integration** | High | LinkedIn OAuth covers sign-in (roadmapped for 30–60 days). Long-term: import full LinkedIn profile on sign-up, cross-post video resumes to LinkedIn, sync connections. |
| **B2B sales motion** | High | Target recruiting agencies, staffing firms, SMB hiring teams. Pitch: "Replace 50% of your sourcing effort with AI." |
| **Creator / influencer mode** | Medium | Let users build audiences, post career content, sell resume templates. "Top PM resumes", "How I got hired at Google." |
| **Smart job board layer** | Medium | Aggregate jobs from major boards, AI match + rank, apply automation. Compete on intelligence, not listings. |

---

### Strategic Moats

The platform sits on three compounding advantages:

| Moat | What it is |
|---|---|
| **Data** | Resumes, jobs, interactions, videos, match scores — proprietary training signal |
| **AI** | Scoring, matching, tailoring, mock interviews, sentiment — keeps improving with usage |
| **Network** | Candidates + recruiters + companies on one platform — liquidity begets liquidity |

Lean into distribution (Chrome extension + shareable links), automation (autonomous agent), and network effects (marketplace) to compound all three.

---

## Consolidated Gap Register

All known gaps across architecture, code quality, features, billing enforcement, and legacy parity in one place. De-duplicated from the sections above.

| # | Gap | Type | Severity | Notes |
|---|-----|------|----------|-------|
| 1 | **No automated tests** | `arch` | 🔴 High | Zero coverage across API and frontend. Legacy `.NET` project has a test suite that should inform a Vitest/hono-test setup. |
| 2 | **No OpenAPI / Swagger** | `arch` | 🔴 High | No developer portal, no spec. `@hono/swagger-ui` + `zod-openapi` can auto-generate from existing Zod schemas with minimal effort. |
| 3 | **No background job workers** | `arch` | 🔴 High | `queueJobToResume` and `queueJobToProcess` tables exist in schema; nothing processes them. Video generation and async tasks depend on this. |
| 4 | **Business logic in route handlers** | `quality` | 🟡 Medium | Most domain logic is inlined in route files instead of extracted to service functions, reducing testability and DRY compliance. |
| 5 | **No repository abstraction** | `arch` | 🟡 Medium | Drizzle queries are scattered directly across route and service files. A formal data-access layer would improve testability and consistency. |
| 6 | **Structured logging** | `arch` | 🟡 Medium | Only `console.*` + Sentry. Legacy used Serilog with file, DB, and NewRelic sinks. A structured log pipeline (e.g. Workers Logpush → Datadog/Logtail) is absent. |
| 7 | **Dynamic feature flags** | `arch` | 🟡 Medium | A static stub route exists. Legacy used Split.io for runtime flag evaluation. No dynamic flag evaluation is implemented. |
| 8 | **Caching layer** | `arch` | 🟡 Medium | Stateless edge workers have no shared cache. Legacy used HybridCache (in-memory + distributed). Cache-aside for expensive queries (search, matching) is missing. |
| 9 | **LinkedIn OAuth** | `feature` | 🔴 High | Only `POST /api/linkedin-post` exists. The full OAuth callback flow (token exchange, profile fetch, account link) required to match legacy is not implemented. |
| 10 | **Full-text / faceted search** | `feature` | 🔴 High | Legacy implied Elasticsearch-level multi-entity search. Current API has only a single `/api/search/public` endpoint with no full-text or faceted filtering. |
| 11 | **Calendar integration** | `feature` | 🔴 High | Google Calendar / Outlook / Calendly sync for interview scheduling — availability slots, booking links, calendar event creation. No schema or routes exist. |
| 12 | **API key management** | `feature` | 🔴 High | User-facing API key generation, revocation, and scoped permissions. Developer portal / documentation for external integrations not built. |
| 13 | **Hiring & onboarding offers** | `feature` | 🔴 High | Offer letter creation, e-signature flow, onboarding task checklist. Requires new schema tables and routes. |
| 14 | **Performance management** | `feature` | 🟡 Medium | Employee performance reviews, OKR goal-setting, 1:1 notes, review cycles. No schema or routes exist. |
| 15 | **Automated outreach follow-ups** | `feature` | 🟡 Medium | Drip/sequence logic for recruiter outreach — trigger follow-up emails based on elapsed time or recipient behaviour (open, click, no reply). |
| 16 | **Hiring success metrics** | `feature` | 🟡 Medium | Dashboard analytics for offer acceptance rate, pipeline-stage conversion, source-of-hire breakdown, and fill rate. |
| 17 | **Time-to-hire analytics** | `feature` | 🟡 Medium | Track and visualise elapsed time from job open → application → interview → offer → placement per role and team. |
| 18 | **Career progress tracking** | `feature` | 🟡 Medium | Goal-setting and milestone tracking for job seekers — target roles, skills to acquire, application targets, interview conversion rates over time. |
| 19 | **Employer internal community** | `feature` | 🟡 Medium | Employer-gated internal community with structured channels (announcements, engagement). The existing social feed is public/professional, not employer-scoped. |
| 20 | **Exclusive job boards + bidding** | `feature` | 🟡 Medium | Marketplace of exclusive job boards with bid/slot-based posting. `jobBoards` tables support basic posting only — no exclusivity or auction logic. |
| 21 | **Subscription tier enforcement** | `billing` | 🔴 High | `usageRecords` and `subscriptionPlans` exist and AI usage is tracked, but hard Free-tier limits (request caps, applicant caps, team size caps) are not applied consistently at route level. |
| 22 | **Salary calculator gated to Premium** | `billing` | 🟡 Medium | `salary.ts` routes are open to all users. Per pricing page, the Salary Calculator is Premium-only — Free users should see a paywall prompt. |
| 23 | **AI message personalisation tiers** | `billing` | 🟡 Medium | Personalisation endpoints exist but Basic vs Advanced split is not enforced. Rate limits and capability differences must be applied per subscription tier. |
| 24 | **Priority / AI-enhanced job matching** | `billing` | 🟡 Medium | All users receive identical matching logic. Premium tier should use a deeper analysis pass with re-ranking and explanations; Free gets a lighter version. |
| 25 | **Team size / admin user limits** | `billing` | 🟡 Medium | Invitation system works but no hard cap at route level. Free accounts should be blocked from inviting a 3rd+ team member without upgrading. |
| 26 | **Advanced video templates** | `billing` | 🟡 Medium | Storyboard generation is open to all users. A Premium-exclusive styled template library needs to be built and gated behind a subscription check. |
| 27 | **Advanced dashboard analytics + AI insights** | `billing` | 🟡 Medium | All users see the same dashboard data. Premium should surface AI-generated narrative insights; Free sees raw metrics only. |
| 28 | **Advanced interview scheduling + automation** | `billing` | 🟡 Medium | AI interview practice works. Missing: calendar-based scheduling of real interviews (slot selection, invitations, reminders, rescheduling) gated to Premium. |
| 29 | **Smart outreach campaigns** | `billing` | 🟡 Medium | Email campaigns are implemented. "Smart" means behaviour-triggered sequences (follow up if no open in 3 days, personalise from candidate data). This automation layer is absent. |
| 30 | **AI-powered smart notifications** | `billing` | 🟢 Low | SSE stream is live. Premium should AI-rank and prioritise notifications. Currently all notifications are treated equally. |
| 31 | **CSV / Excel export** | `legacy-parity` | 🟡 Medium | JSON export available at `/api/settings/export`. Needs CSV serialisation added to match legacy `GET /api/export/csv` and `GET /api/export/excel`. |
| 32 | **Recruiter bulk operations** | `legacy-parity` | 🟡 Medium | Per-record operations work. Bulk tag, status, and delete (`bulk/tags`, `bulk/status`, `bulk/delete`) are not implemented. |
| 33 | **Recruiter talent-pool export** | `legacy-parity` | 🟢 Low | `GET /api/recruiter/talent-pool/export` is missing. Straightforward to add. |
| 34 | **Password history validation** | `legacy-parity` | 🟢 Low | `passwordHistories` table exists in schema. `POST /api/passwordmanagement/validate-history` endpoint not implemented. |
| 35 | **Password expiry check** | `legacy-parity` | 🟢 Low | `GET /api/passwordmanagement/is-expired` endpoint not implemented. Straightforward add. |
| 36 | **Resume diff / variation compare** | `legacy-parity` | 🟢 Low | `GET /api/resume/:id/diff` not implemented. Nice-to-have for the resume variation workflow. |
| 37 | **Salary calculator `/industries` endpoint** | `legacy-parity` | 🟢 Low | `GET /api/salarycalculator/industries` exists in legacy but is missing from the TS API. The other salary endpoints are implemented. |
| 38 | **Marketing routes (campaigns + leads)** | `quality` | 🟢 Low | `marketing.ts` routes exist but are stubs — no campaign execution logic, no real lead capture. Needs business logic wired. |
| 39 | **ProductDashboard SaaS metrics** | `quality` | 🟡 Medium | `GET /api/productdashboard/saas-metrics` (MRR, churn, ARR) and time-series analytics routes exist under `admin.ts` but the underlying calculation logic has not been verified as implemented. |
| 40 | **Shareable "Hire Me" public profiles** | `feature` | 🔴 High | Public profile page per user surfacing video, resume, and skills. The data exists in DB; the public-facing route and page are not built. Primary viral distribution vector. |
| 41 | **Real-time chat (recruiter ↔ candidate)** | `feature` | 🔴 High | SSE notifications are live but recruiter/candidate direct messaging requires chat room creation, message persistence, and a chat UI. |
| 42 | **OAuth / Social Login (Google + LinkedIn)** | `feature` | 🔴 High | Users strongly prefer one-click auth. Requires new `oauth_accounts` table, `/api/auth/oauth/:provider` + callback routes, and account-linking logic (merge on matching email). LinkedIn is critical for this platform. |
| 43 | **Magic links (passwordless email login)** | `feature` | 🟡 Medium | One-time login link. `magic_link_tokens` table pattern exists. Needs `POST /api/auth/magic-link` and `GET /api/auth/magic-link/verify?token=` endpoints. |
| 44 | **Security settings tab** | `feature` | 🟡 Medium | UI and routes to manage connected OAuth accounts, change/add password (for OAuth-only users), 2FA enable/disable, and active session list with per-session revocation. |
| 45 | **Direct messaging (`messages.ts`) incomplete** | `quality` | 🟡 Medium | `messages.ts` only exposes `POST /` and `POST /message`. No conversation threading, read receipts, message history, or inbox endpoint. `communication.ts` has a fuller conversation model but the simpler messages route is still exposed and incomplete. |
| 46 | **Avatar upload validation unconfirmed** | `quality` | 🟢 Low | `POST /api/users/me/avatar` route exists but avatar-specific validation (5MB cap, jpg/png/gif/webp restriction) has not been verified as enforced at the route level. |
| 47 | **Helcim payment provider stub** | `quality` | 🟢 Low | `services/payment/helcim.ts` has documented API calls but is not fully implemented. Card deletion is unavailable via Helcim v2 API. Helcim cannot be used as a production payment provider until the stub is completed. |
| 48 | **Ad slot components — free tier** | `feature` | 🔴 High | Reusable `<AdSlot>` React component that renders programmatic ads (Google AdSense) for free-tier users and renders nothing for Premium. Free users become revenue-generating from day one without any subscription. |
| 49 | **Ad-free enforcement for Premium** | `billing` | 🔴 High | API/session must expose an `adsEnabled` flag derived from the user's active subscription. Frontend reads this flag to suppress all ad slots. "No ads" becomes the clearest, most visceral reason to upgrade on the pricing page. |
| 50 | **Sponsored job listings** | `feature` | 🟡 Medium | Add `sponsored: boolean`, `sponsored_until: timestamp`, and `sponsored_rank_boost` to the jobs schema. Sponsored jobs pin to the top of search and the job feed. Flat-rate or weekly fee paid by employers via existing Stripe flow — direct employer revenue independent of subscriber count. |
| 51 | **Featured candidate profiles** | `feature` | 🟡 Medium | Add `featured_until: timestamp` to `userProfiles`. Job seekers pay a one-off fee via the existing Stripe setup-intent flow to be highlighted in recruiter search results for 7/14/30 days. One-off purchase with no subscription required. |
| 52 | **Ad revenue reporting (internal dashboard)** | `quality` | 🟢 Low | Track ad impressions, clicks, and estimated revenue from AdSense in the internal admin dashboard alongside subscription MRR. Required to optimise ad placement and balance revenue against user experience. |

---

## Revenue Prioritisation — CEO View

### The Unit Economics Reality

The platform has three personas with very different revenue potential:

| Persona | Realistic ARPU | Paying users needed for $15k MRR |
|---------|---------------|----------------------------------|
| Job Seeker (individual) | $15–20 / mo | ~850 |
| Recruiter (individual) | $50–99 / mo | ~200 |
| Employer (team) | $200–500 / mo | ~40 |

**The implication is brutal:** one employer account is worth 10–25 job seekers. Every product decision should be evaluated against whether it moves employers and recruiters toward paying — not just job seeker signups.

The current product has all three personas but is structurally optimised for job seekers. The gaps, sorted by revenue impact, tell a different story.

---

### Phase 0 — Stop Giving Away the Product (Week 1–2)

Nothing else matters if paying users get the same product as free users. These are **revenue leaks**, not feature gaps.

| Priority | Gap # | What to Build | Revenue Impact |
|----------|--------|---------------|----------------|
| 🔴 P0.1 | #21 | **Enforce subscription tiers at the API level** | Every Premium feature is currently free. No enforcement = zero upgrade incentive. This is the single highest-leverage change in the entire codebase. |
| 🔴 P0.2 | #22 | **Gate Salary Calculator to Premium** | One of the most-used standalone tools. Paywalling with a visible upsell prompt is the fastest A/B-testable conversion lever. |
| 🔴 P0.3 | #25 | **Enforce team size limits (≤2 free)** | Every recruiter and employer team beyond 2 members is a free rider. Hard-capping and prompting upgrade converts team admins — your highest-ARPU users. |
| 🔴 P0.4 | **NEW** | **In-product upgrade prompts + usage meters** | Users need to see what they're missing. Add visible "X of 10 AI requests used", "Upgrade for unlimited matching", and feature-locked UI states. Without this, even enforced limits don't convert — users just stop using the feature. |
| 🔴 P0.5 | **NEW** | **Annual billing option (20% discount)** | Annual plans improve cash flow, reduce monthly churn, and are psychologically sticky. A user who paid $180 upfront will not cancel in month 3. |

---

### Phase 1 — Fill the Funnel (Week 2–6)

You cannot enforce tiers on users who never signed up. These gaps cap acquisition.

| Priority | Gap # | What to Build | Revenue Impact |
|----------|--------|---------------|----------------|
| 🟠 P1.1 | #42 | **Google + LinkedIn OAuth** | Password/email signup has 60–70% drop-off vs OAuth. Every friction point here is a lost conversion. LinkedIn is table-stakes for a hiring platform — recruiters will not create a new password account. |
| 🟠 P1.2 | #40 | **Shareable "Hire Me" public profiles** | Each profile is a free SEO page and a viral distribution loop. Job seekers share their URL; recruiters click it; recruiters convert. This is how you grow to 850+ paying job seekers without spending on ads. |
| 🟠 P1.3 | #9 | **LinkedIn OAuth full flow** | Covered partially by P1.1, but specifically: importing LinkedIn profile data on signup fills in the job seeker's profile instantly. A complete profile on day 1 dramatically improves activation and reduces churn. |
| 🟠 P1.4 | **NEW** | **Freemium activation sequence (onboarding email drip)** | New signups need to hit an "aha moment" within 72 hours. A 3-email sequence — (1) profile completion prompt, (2) first job match, (3) Premium feature showcase — can double 30-day retention and conversion rates. |
| 🟠 P1.5 | **NEW** | **Resume/profile AI score (free preview, full detail Premium)** | Give every job seeker a score out of 100 for free. Show what's dragging it down only on Premium. This is the single most effective freemium hook in the career space — LinkedIn Premium and Resume.io both use this pattern. |

---

### Phase 2 — Unlock B2B Revenue (Month 1–3)

Employers and recruiters pay 5–25× more than job seekers. The current product does not give them enough value to justify a team subscription.

| Priority | Gap # | What to Build | Revenue Impact |
|----------|--------|---------------|----------------|
| 🟡 P2.1 | #10 | **Full-text + faceted candidate search** | This is the core recruiter product. If a recruiter cannot search "React developer, London, 5 years, open to work" and get a ranked list, the entire recruiter plan has no value proposition. No search = no B2B. |
| 🟡 P2.2 | #16 | **Hiring success metrics dashboard** | Employers and finance teams need to justify the subscription to their CFO. "We filled 8 roles in 45 days at $1,200 per hire vs $8,000 market rate" is the ROI story that renews contracts. Without metrics, you are selling on faith. |
| 🟡 P2.3 | #17 | **Time-to-hire analytics** | Companion to P2.2. The KPI every recruiter is measured on. Surface it natively and you embed the product into their weekly reporting workflow — the definition of sticky. |
| 🟡 P2.4 | #11 | **Calendar integration (Google + Outlook)** | Recruiters schedule 5–20 interviews per week. If they have to copy/paste between hired.video and their calendar, they stop using hired.video. Calendar sync is a retention requirement, not a nice-to-have. |
| 🟡 P2.5 | #41 | **Recruiter ↔ candidate direct messaging** | Outreach that stays inside the platform creates data, enables automation, and makes switching costs real. A recruiter who has sent 200 messages on-platform will not migrate to a competitor. |
| 🟡 P2.6 | **NEW** | **Employer branding pages** | Companies pay separately for branding. A dedicated company page with custom video, culture content, and job listings — distinct from a plain company profile — is a paid add-on that justifies a higher-tier plan. |
| 🟡 P2.7 | **NEW** | **ATS integrations (Greenhouse, Lever, Workday)** | Enterprise employers will not abandon their existing ATS. A two-way sync that pushes candidates from hired.video into their ATS removes the biggest objection in an enterprise sales call. This is required to close deals above $500/mo. |
| 🟡 P2.8 | #13 | **Hiring & onboarding offers** | Closing a hire inside the platform (offer letter, e-signature, onboarding tasks) extends the revenue-generating lifecycle per seat and creates natural upsell moments. |

---

### Phase 3 — Defend and Expand (Month 3–6)

At this point you have revenue. The job is to protect it (reduce churn) and expand it (upsell, cross-sell).

| Priority | Gap # | What to Build | Revenue Impact |
|----------|--------|---------------|----------------|
| 🟢 P3.1 | #15 | **Automated recruiter outreach sequences** | Time-based and behaviour-triggered follow-ups are the difference between a $50/mo recruiter plan and a $150/mo "Recruiter Pro" plan. This is the primary upsell lever for the recruiter persona. |
| 🟢 P3.2 | #18 | **Career progress tracking (job seekers)** | Job seekers who track goals and see progress have dramatically lower churn. A paying job seeker who cancelled is gone — acquire them again costs money. |
| 🟢 P3.3 | #14 | **Performance management** | Unlocks a "retain employees" use case beyond hiring. Employers who use the platform throughout the employee lifecycle (hire → performance → offboard) are churning from an operating system, not a hiring tool — churn rate drops to near zero. |
| 🟢 P3.4 | **NEW** | **White-label / agency tier** | Staffing agencies and RPO firms want the product under their own brand to sell to clients. A white-label tier at $500–2,000/mo with 5–20 agency clients is $2,500–$40,000 MRR from a single product SKU change. |
| 🟢 P3.5 | **NEW** | **Candidate assessments / skills tests** | Premium job seekers and employers both want verified skills. A short skills test (timed, AI-graded) attached to a profile commands higher recruiter attention and justifies a higher plan tier. Codility and HackerRank charge separately for this — bundling it is a competitive advantage. |
| 🟢 P3.6 | **NEW** | **AI career copilot ("What should I do next?")** | A weekly AI-generated action plan based on the job seeker's activity, matches, and market signals. This single feature can be the primary value justification for the Premium individual plan — without it, Premium is "more of the same". |
| 🟢 P3.7 | #19 | **Exclusive job boards + bidding** | A marketplace where employers bid for placement creates platform-side revenue (take rate) independent of subscriptions. At scale this becomes the dominant revenue line. |
| 🟢 P3.8 | #3 | **Background job workers** | Video generation is likely broken. A platform called hired.**video** that cannot generate video reliably will not retain job seekers or convince recruiters the product is serious. |

---

### Features Missing Entirely — Required for Profitability

These do not appear in any existing gap or roadmap entry but are required to operate a profitable SaaS business in this category:

| # | Feature | Why Required |
|---|---------|-------------|
| A | **Paywall / upgrade UI components** | No upgrade flow = no conversions regardless of what you gate. Every locked feature needs a modal, a tooltip, and a CTA that routes to checkout. |
| B | **Trial period (7 or 14 days)** | Premium features need to be experienced before users pay. A time-limited trial with credit card capture converts 3–5× better than a cold paywall. |
| C | **Usage meters visible to users** | "8 of 10 AI requests used this month" shown in the UI is the most effective passive upsell prompt in SaaS. Users who can see the limit approaching convert at the moment of friction, not after hitting a hard block. |
| D | **Churn / cancellation flow** | When a user cancels, show them what they lose, offer a pause option, and offer a downgrade. Well-designed cancellation flows save 15–25% of would-be churns. |
| E | **Referral programme UI** | The affiliate backend exists. A simple "Give a friend 1 month free, get 1 month free" in-product referral loop is the lowest-CAC acquisition channel available. |
| F | **Employer seat-based billing** | Employers need to add/remove team members and pay per seat. A flat company plan does not scale with the employer and leaves revenue on the table as teams grow. |
| G | **In-app notifications for billing events** | "Your trial ends in 3 days", "Payment failed — update your card", "You've used 90% of your AI credits". Without these, users churn passively without ever being asked to stay. |
| H | **Admin revenue dashboard (internal)** | MRR, churn rate, trial-to-paid conversion, ARPU by persona. Without this you cannot make product decisions based on what is actually driving revenue. Gap #39 (ProductDashboard SaaS metrics) partially covers this but needs verification. |
| I | **"Apply with hired.video" embeddable button** | A one-click button that job boards and company career pages can embed. Every click is a new user acquisition. This is distribution infrastructure, not a feature. |
| J | **Recruiter talent sourcing / Boolean search** | Recruiters who pay $50–100/mo expect LinkedIn Recruiter-level search. Boolean operators, location radius, skill filters, and saved searches. Without this, the recruiter plan cannot be sold to serious agency recruiters. |

---

### Advertising as a Revenue Stream

Advertising transforms the free tier from a pure cost centre into a direct revenue line. On a hiring platform the audience is exceptionally high-intent — active job seekers, recruiters with open roles, employers with hiring budgets — which commands CPMs 3–5× higher than general consumer audiences. Used correctly, ads make the free tier profitable on its own while simultaneously strengthening the upgrade argument: **"Go Premium to remove ads"** is the oldest, clearest value proposition in consumer software.

#### Ad Revenue Models Available

| Model | Description | Who Pays | Effort |
|-------|-------------|----------|--------|
| **Display ads (programmatic)** | Google AdSense / Prebid on free-tier pages. Banner, sidebar, and in-feed placements. Toggle off for Premium users. | Ad networks (CPM) | Low — integrate AdSense or a header-bidding wrapper |
| **Sponsored job listings** | Employers pay to pin their job to the top of search results and the job feed. Distinct from a Premium subscription — a per-post or weekly/monthly fee. | Employers | Medium — add `sponsored` flag + bidding/flat-rate to job schema |
| **Featured candidate profiles** | Job seekers pay a one-off fee (or use Premium credits) to be highlighted in recruiter search results for 7/14/30 days. | Job seekers | Medium — add `featured_until` to profile schema |
| **Recruiter spotlight** | Recruiters pay to appear at the top of the "recruiters near you" or "recruiters hiring for X" surfaces. | Recruiters | Medium |
| **Email newsletter ads** | If an outbound email sequence is introduced (Phase 1 drip), a "Sponsored by [Company]" slot in free-tier emails is passive revenue with zero additional engineering. | Advertisers / employers | Low |
| **Video ad pre-rolls** | For free-tier users viewing other users' video resumes, a short 5-second employer-branded pre-roll. Premium users see none. | Employers | High — requires ad serving, video ad infrastructure |

#### Ad-Free as a Conversion Lever

"No ads" must be a visible, tangible benefit on the pricing page — not buried in a feature list. The conversion psychology:

1. Free user encounters an ad mid-workflow (e.g. reviewing a job match)
2. A dismissible banner appears: *"Upgrade to Premium — no ads, unlimited AI, priority matching"*
3. One click to a checkout with 14-day trial

The ad experience on free should be **noticeable but not hostile** — intrusive enough to motivate upgrade, non-intrusive enough that users do not immediately abandon the product. Mid-page banners and sponsored content work; interstitials and pop-ups destroy retention.

#### What Needs to Be Built

| # | Feature | Type | Effort | Notes |
|---|---------|------|--------|-------|
| K | **Ad slot components (frontend)** | `feature` | Low | Reusable `<AdSlot>` React component that renders when `user.plan === "free"` and renders nothing for Premium. Google AdSense publisher tag takes 10 minutes to integrate. |
| L | **Premium ad-free flag enforcement (API)** | `billing` | Low | Extend the subscription enforcement work (#21) — the same middleware that gates features also sets an `adsEnabled` flag in the JWT/session. |
| M | **Sponsored job listing schema + admin UI** | `feature` | Medium | Add `sponsored: boolean`, `sponsored_until: timestamp`, and `sponsored_rank_boost: int` to the jobs schema. Admin UI to approve/set sponsorship. Self-serve checkout for employers is Phase 2. |
| N | **Featured profile schema + checkout** | `feature` | Medium | Add `featured_until: timestamp` to `userProfiles`. Job seeker can pay a one-off fee via the existing Stripe setup-intent flow to feature their profile for N days. |
| O | **Ad revenue reporting (internal dashboard)** | `quality` | Low | Track impressions, clicks, and estimated revenue from AdSense in the internal admin dashboard alongside subscription MRR. Without this you cannot optimise placement or justify the trade-off with user experience. |

#### Revenue Projection — Advertising

Rough benchmarks for a hiring-focused audience:

| Signal | Estimate |
|--------|----------|
| Programmatic CPM (career/hiring audience) | $8–15 |
| Page views per free user per month | ~30 |
| Ad impressions per page view | ~2 |
| Monthly ad revenue per free user | ~$0.50–0.90 |
| 5,000 free users | **$2,500–$4,500 / mo** |
| 20,000 free users | **$10,000–$18,000 / mo** |

Sponsored job listings (employer-direct) at $50–200/week per slot add on top of programmatic at near-100% margin. A platform with 20 sponsored slots filled consistently at $100/week generates **$8,000/mo from job posting revenue alone**, independent of subscriptions.

---

### Revenue Priority Summary (Ordered)

| Rank | Item | Type | Effort | Revenue Lever |
|------|------|------|--------|---------------|
| 1 | Enforce subscription tiers (#21) | `billing` | Low | Immediately monetises existing user base |
| 2 | Ad slot components — free tier (K) | `feature` | Low | Free users become revenue-generating from day one |
| 3 | Ad-free flag in Premium (L) | `billing` | Low | "No ads" becomes the clearest upgrade reason on the pricing page |
| 4 | Upgrade prompts + usage meters (A, C) | `feature` | Low | Converts free → paid passively |
| 5 | Annual billing option | `feature` | Low | Improves cash flow, reduces churn |
| 6 | Gate salary calculator (#22) | `billing` | Low | High-visibility upsell moment |
| 7 | Enforce team size limits (#25) | `billing` | Low | Forces recruiter/employer upgrade |
| 8 | Sponsored job listings (M) | `feature` | Medium | Direct employer revenue; zero dependency on subscriber count |
| 9 | Google + LinkedIn OAuth (#42) | `feature` | Medium | Removes #1 acquisition blocker; more users = more ad impressions + subscribers |
| 10 | Shareable "Hire Me" profiles (#40) | `feature` | Medium | Viral loop; SEO; zero-CAC acquisition |
| 11 | Resume/profile AI score | `feature` | Medium | Highest-converting freemium hook in career space |
| 12 | Featured candidate profiles (N) | `feature` | Medium | One-off job seeker purchases; no subscription required |
| 13 | Full-text candidate search (#10) | `feature` | High | Core B2B value prop; without it recruiter plan is unsellable |
| 14 | Hiring success metrics (#16, #17) | `feature` | Medium | ROI story that justifies employer renewal |
| 15 | Calendar integration (#11) | `feature` | High | Retention requirement for recruiter persona |
| 16 | Recruiter ↔ candidate messaging (#41) | `feature` | Medium | Platform stickiness; switching costs |
| 17 | Trial period + cancellation flow (B, D) | `feature` | Low | 3–5× trial conversion; saves 15–25% churns |
| 18 | Referral programme UI | `feature` | Low | Lowest-CAC acquisition channel available |
| 19 | Background job workers (#3) | `arch` | High | Video generation reliability — core product promise |
| 20 | ATS integrations | `feature` | High | Required to close enterprise deals |
| 21 | Employer seat-based billing | `billing` | Medium | Scales revenue with team growth |
| 22 | White-label / agency tier | `feature` | Medium | $500–2,000/mo per agency client |
| 23 | AI career copilot | `feature` | Medium | Primary Premium value prop for job seekers |
| 24 | Automated outreach sequences (#15) | `feature` | Medium | Primary upsell lever for recruiter Pro tier |

---

## Pricing Page Gap Implementation Log

Analysis of the pricing page (Job Seeker / Recruiter / Employer personas, Free vs Premium) against the codebase, completed 2026-03-23. All 20 gaps have been addressed.

| # | Feature | Persona | Status | Implementation |
|---|---------|---------|--------|----------------|
| 1 | Calendar Integration | Recruiter / Employer | ✅ Done | `schema/calendar.ts` — `calendarConnections`, `scheduledEvents`, `availabilitySlots`; `GET/POST /api/calendar/events`, availability, and connections |
| 2 | API Key Management | All | ✅ Done | `schema/apikeys.ts` — prefix + SHA-256 hash; key shown once at creation; `GET/POST /api/apikeys`, `DELETE/PATCH /api/apikeys/:id` |
| 3 | Hiring & Onboarding | Employer | ✅ Done | `schema/onboarding.ts` — offer letters, checklists, tasks; completion % auto-computed; `GET/POST /api/hiring/offers`, `/checklists` |
| 4 | Performance Management | Employer | ✅ Done | `schema/performance.ts` — cycles, reviews, goals/OKRs; `GET/POST /api/performance/cycles`, `/reviews`, `/goals` |
| 5 | Automated Follow-ups | Recruiter | ✅ Done | `schema/followups.ts` — sequences, steps, enrollments, logs; `nextSendAt` from first step delay; `GET/POST /api/followups/sequences`, `/enroll` |
| 6 | Hiring Success Metrics | Employer | ✅ Done | Employer dashboard now queries real `jobItems`, `jobApplications`, `placements`; `GET /api/dashboard/employer` |
| 7 | Time-to-Hire Analytics | Employer | ✅ Done | Avg days to fill computed from placement `startDate`/`endDate`; included in employer dashboard |
| 8 | Career Progress Tracking | Job Seeker | ✅ Done | Monthly application trend (6 months) + interview practice scores; `GET /api/dashboard/career-progress` (Premium-gated) |
| 9 | Employee Community | Employer | ✅ Done | Posts in `feedPosts` with `privacy=Private` + `company:{id}:{channel}` tags; `GET/POST/DELETE /api/community/posts`, `/channels` |
| 10 | Exclusive Job Boards + Bidding | Employer | ✅ Done | `schema/jobboards.ts` — boards + bids; `GET /api/boards/exclusive`, `GET/POST/DELETE /api/boards/bids` |
| 11 | AI Usage Enforcement | All | ✅ Done | `checkAIUsage` applied to `match.ts`, `interview.ts`, `resume-scorer.ts`, `resume-optimizer.ts` |
| 12 | Video Templates | All | ✅ Done | 3 free templates + 5 Premium (1080p, cinematic, branded); subscription-gated; `GET /api/studio/templates` |
| 13 | Dashboard Real Data | All | ✅ Done | All three role dashboards rewritten with real DB queries using `Promise.all`; `GET /api/dashboard/jobseeker|recruiter|employer` |
| 14 | Interview Scheduling | Recruiter | ✅ Done | AI question generation gated via `checkAIUsage`; `POST /api/interview/questions` |
| 15 | Smart Outreach | Recruiter | ✅ Done | Full follow-up sequence backend (gap 5) covers this |
| 16 | Smart Notifications | All | ✅ Done | Priority score per notification (type weight + recency + unread bonus); `GET /api/notifications/smart` (Premium-gated) |
| 17 | Salary Gating | Job Seeker | ✅ Done | Already enforced via `requirePremium` in `salary.ts` — no change needed |
| 18 | Message Personalization | Recruiter | ✅ Done | Free: generic template; Premium: LLM-personalized outreach by recipient/role/tone; `POST /api/messages/personalize` |
| 19 | AI Job Matching Tiers | All | ✅ Done | New Premium-only deep analysis: skill gaps, seniority fit, career trajectory, interview tips, certifications; `POST /api/match/insights` |
| 20 | Team Size Limits | Employer | ✅ Done | Already enforced via `checkTeamSize` in `account.ts` — no change needed |

> **Note:** Gaps 1–10 required new schema files (`schema/calendar.ts`, `apikeys.ts`, `onboarding.ts`, `performance.ts`, `followups.ts`, `jobboards.ts`) — run `npm run db:push` to apply migrations before deploying.
