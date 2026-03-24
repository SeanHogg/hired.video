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
| `emailVerified.ts` | ⚠️ Partial | Defined but not actively mounted on routes |
| `passwordChange.ts` | ⚠️ Partial | Defined but not actively enforced |
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
| `search.ts` | GET /public | ⚠️ Partial | Single endpoint; legacy has richer search |

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
| `messages.ts` | POST /, /message | ⚠️ Partial | Minimal — direct messages only |
| `communication.ts` | GET /conversations, /messages, /email-templates, /email-campaigns, /tracking, /stats, /job-boards, /external-contacts; POST /conversations, /messages, /messages/mark-read, /email-templates, /email-campaigns, /email-campaigns/:id/send, /tracking, /job-boards/post, /external-contacts, /follow-ups; PUT /email-templates/:id, /external-contacts/:id; DELETE /email-templates/:id, /external-contacts/:id, /job-boards/postings/:id | ✅ Complete | 318 lines |

#### AI Features

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `ai.ts` | POST /context | ⚠️ Partial | Single context endpoint; chat/prompt engine not exposed |
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
| `billing.ts` | GET /subscription, /payment-methods, /invoices, /ai-usage/month, /refund-policy, /refund-reasons, /refund-requests; POST /refund-request, /cancel-account | ⚠️ Partial | Routes exist; `billing.ts` service is a stub placeholder |
| `payment.ts` | DELETE /payment-methods/:id; POST /create-setup-session | ⚠️ Partial | Minimal payment methods; Stripe integration incomplete |

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
| `linkedin-post.ts` | POST /linkedin-post | ⚠️ Partial | Basic post endpoint; no OAuth flow |
| `locations.ts` | GET /countries, /states, /cities, /search | ✅ Complete | Reference data |
| `og.ts` | GET /v/:videoId | ✅ Complete | Open Graph metadata |
| `task.ts` | GET /, /:id; POST /save, /:id; DELETE /:id | ✅ Complete | Task management |
| `feature-flag.ts` / `featureflag.ts` | GET / | ⚠️ Duplicate | Two route files for same feature — consolidation needed |
| `hubs.ts` | GET/POST /notifications, POST /notifications/negotiate | ⚠️ Stub | SignalR-style stubs; no WebSocket implementation |
| `marketing.ts` | GET /campaigns, /leads; POST /campaigns, /leads | ⚠️ Partial | Basic structure; no campaign execution |

### Services

| Service | Lines | Status | Notes |
|---------|-------|--------|-------|
| `email.ts` | 518 | ✅ Complete | `EmailProvider` interface + SendPulse implementation; sends verification, reset, 2FA, resend emails |
| `ai.ts` | 84 | ✅ Complete | `callLLM()` / `callLLMJson()` with Zod schema validation; OpenRouter wrapper |
| `account.ts` | 363 | ✅ Complete | Organization/team management business logic |
| `job.ts` | 257 | ✅ Complete | Job management: create, update, archive, search |
| `company.ts` | 84 | ✅ Complete | Company CRUD, follow/unfollow, trending |
| `settings.ts` | 76 | ✅ Complete | User preference read/write |
| `billing.ts` | 106 | ❌ Stub | Placeholder with no business logic implemented |

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
| | `POST /api/resume/CreateFromFile` | Upload → parse → create + queue matching | ResumeInformation, QueueJobToResume | ⚠️ File parsing works; background queue not processed |
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
| | `POST /api/users/me/avatar` | Avatar upload (max 5MB, jpg/png/gif/webp) | UserProfiles | ⚠️ Upload route exists; avatar-specific validation not confirmed |
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
| **PaymentController** | `POST /api/payment/stripe/webhook` | Handle Stripe events (subscription updates, payment success/fail) | BillingEvents, Subscriptions | ❌ **Not implemented — critical for Stripe** |
| | `GET /api/payment/public-key` | Return Stripe publishable key | — | ❌ Not implemented |
| | `POST /api/payment/setup-intent` | Create Stripe SetupIntent | — | ❌ Not implemented |
| | `POST /api/payment/save-payment-method` | Store Stripe payment method | PaymentMethods | ❌ Not implemented |
| | `POST /api/payment/create-setup-session` | Stripe checkout setup session | — | ⚠️ Returns redirect URL; no real Stripe SDK call |
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
| **ProductDashboardController** | `GET /api/productdashboard/saas-metrics` | MRR, churn, ARR | Subscriptions, Invoices | ⚠️ Admin routes exist; SaaS metrics calculation not confirmed |
| | `GET /api/productdashboard/time-series/:metric` | Time-series analytics | ActivityLogs | ⚠️ Not confirmed implemented |
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
| **MarketingController** | `GET /api/marketing/campaigns` | Campaign listing | — | ⚠️ Stub in TS API |
| | `POST /api/marketing/leads` | Capture lead | — | ⚠️ Stub in TS API |
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

The TypeScript API covers ~89% of the legacy surface area. A re-verification confirms the following gaps still exist:

| Missing | Risk | Workaround / Status |
|---------|------|---------------------|
| `POST /payment/stripe/webhook` | **🔴 High** — subscriptions won't update on payment events | Must implement before removing legacy |
| `GET /payment/public-key` | **🔴 High** — Stripe.js can't initialise without publishable key | Must implement before removing legacy |
| `POST /payment/setup-intent` | **🔴 High** — card enrollment UI is broken | Must implement before removing legacy |
| `POST /payment/save-payment-method` | **🔴 High** — can't attach cards to customers | Must implement before removing legacy |
| `GET /api/export/csv` + `GET /api/export/excel` | 🟡 Medium | JSON export available at `/api/settings/export`; add CSV serialisation |
| Recruiter bulk ops (`bulk/tags`, `bulk/status`, `bulk/delete`) | 🟡 Medium | Per-record operations work; bulk is a UX convenience |
| `GET /api/recruiter/talent-pool/export` | 🟢 Low | Easy to add |
| `POST /api/passwordmanagement/validate-history` | 🟢 Low | Schema has `passwordHistories` table; straightforward add |
| `GET /api/passwordmanagement/is-expired` | 🟢 Low | Straightforward add |
| `GET /api/resume/:id/diff` | 🟢 Low | Nice-to-have for variation workflow |
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
| `api/src/services/payment/helcim.ts` | Helcim | ⚠️ Stub — API calls documented; card deletion unavailable via Helcim v2 API |

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

### Feature-Level Gaps

| Feature | Legacy | Current | Gap |
|---------|--------|---------|-----|
| **Search** | Multi-entity search (Elasticsearch implied) | Single `/search/public` endpoint | **High** — Full-text/faceted search not implemented |
| **Billing / Stripe** | ✅ Stripe.NET full integration | ⚠️ DB-backed service (subscription, invoices, payment methods, refunds); Stripe SDK not wired | Medium — Data layer complete; payment processing needs Stripe keys |
| **LinkedIn OAuth** | ✅ Full OAuth flow | ⚠️ Single `POST /linkedin-post`; no OAuth | **High** |
| **Chrome Extension API** | ✅ `ChromeController` (deprecated) | ✅ `POST /api/match/analyze`, `POST /api/match/tailor`, `GET /api/resume/mastergroups`, `POST /api/resume/:id/createvariation`, `GET /api/resume/:id/export` | Low — all extension-facing routes implemented |
| **AI Chat / Prompt Engine** | ✅ `ChatController`, `PromptController` | ✅ `POST /api/ai/chat` with session tracking, history, usage recording; `GET /sessions`, `GET /sessions/:id`, `DELETE /sessions/:id` | Low |
| **ML Sentiment** | ✅ Dedicated ML.NET model (`Microsoft.ML`) | ✅ LLM-based via OpenRouter | Low — Different approach, same outcome |
| **Data Export** | ✅ Excel export via `DocumentFormat.OpenXml` | ✅ `GET /api/settings/export` returns JSON export of account, profile, resumes, applications, saved jobs | Low — JSON vs Excel; exportable data complete |
| **OData Queries** | ✅ Microsoft.AspNetCore.OData | ❌ Not applicable (Hono/REST only) | Low — Not needed for edge runtime |

### Code Quality Issues (Current API)

| Issue | Location | Status |
|-------|----------|--------|
| ~~Duplicate feature flag routes~~ | ~~`routes/feature-flag.ts` + `routes/featureflag.ts`~~ | ✅ Resolved — orphaned `feature-flag.ts` deleted |
| ~~Case-inconsistent endpoint naming~~ | ~~`GetSummaryItems` vs `getsummaryitems` in `jobs.ts`~~ | ✅ Resolved — shared handler, both aliases preserved for compat |
| ~~`billing.ts` service is entirely stubbed~~ | ~~`services/billing.ts`~~ | ✅ Resolved — real DB queries for subscriptions, invoices, payment methods, AI usage |
| ~~Email verification not enforced~~ | ~~`middleware/emailVerified.ts` unused~~ | ✅ Resolved — applied globally in `app.ts` |
| ~~Password change not enforced~~ | ~~`middleware/passwordChange.ts` unused~~ | ✅ Resolved — applied globally in `app.ts` |
| Business logic in route handlers | Most route files — should be in service layer | Open — Medium |
| No repository abstraction | Drizzle queries scattered across routes and services | Open — Medium |
| No OpenAPI/Swagger documentation | Entire API | Open — **High** |
| Zero automated tests | Entire API | Open — **High** |

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

### Open (not yet addressed)

1. **No tests** — Zero automated test coverage. The legacy `.NET` project has a dedicated test suite that should inform a Vitest/hono-test setup.
2. **No OpenAPI/Swagger** — Consider `@hono/swagger-ui` + `zod-openapi`; the existing Zod schemas can generate specs with minimal effort.
3. **Stripe payment processing** — `services/billing.ts` now queries the DB for subscriptions and invoices, but `createSetupSession` and payment method sync still need the Stripe SDK wired up.
4. **Business logic in route handlers** — Most domain logic is inlined in route files. Extracting to service functions would improve testability and DRY compliance.
5. **No background workers** — Queue tables (`queueJobToResume`, `queueJobToProcess`) exist in schema but nothing processes them. Video generation may depend on this.
6. **LinkedIn OAuth** — Only `POST /linkedin-post` exists. Full OAuth callback flow needed to match legacy.

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

## Roadmap: Pricing Page Feature Gaps

The following items are listed on the pricing page but are not yet (or only partially) implemented. They are grouped by severity: **Not Implemented** (❌) are blockers to honest pricing representation; **Partial** (⚠️) are implemented at surface level but lack tier enforcement, AI uplift, or advanced functionality.

### ❌ Not Implemented — Hard Gaps

| # | Feature | Persona(s) | Tier | What Needs to Be Built |
|---|---------|-----------|------|------------------------|
| 1 | **Calendar Integration** | Job Seeker, Recruiter, Employer | Premium | Google Calendar / Outlook / Calendly sync for interview scheduling. Availability slots, booking links, and calendar event creation. |
| 2 | **API Access / API Key Management** | Job Seeker, Recruiter, Employer | Premium | User-facing API key generation, revocation, and scoped permissions. Developer portal or documentation for external integrations. |
| 3 | **Hiring & Onboarding (Offers)** | Recruiter, Employer | Premium | Offer letter creation, e-signature flow, onboarding task checklist. New schema tables and routes required. |
| 4 | **Performance Management** | Recruiter, Employer | Premium | Employee performance reviews, goal setting (OKRs), 1:1 notes, review cycles. No schema or routes exist. |
| 5 | **Automated Follow-ups** | Recruiter | Premium | Drip/sequence logic for outreach — trigger follow-up emails based on time elapsed or recipient behaviour (open, click, no reply). |
| 6 | **Hiring Success Metrics** | Recruiter, Employer | Premium | Dashboard analytics for offer acceptance rate, pipeline-stage conversion rates, source-of-hire breakdown, and fill rate. |
| 7 | **Time-to-hire Analytics** | Recruiter, Employer | Premium | Track and visualise elapsed time from job open → application → interview → offer → placement per role and team. |
| 8 | **Career Progress Tracking** | Job Seeker | Premium | Goal-setting and milestone tracking for job seekers: target roles, skills to acquire, application targets, interview conversion rates over time. |
| 9 | **Employee Community (Engage / Inform / Inspire)** | Employer | Premium | Structured internal community with employer-controlled channels (announcements, engagement, inspiration). The existing social feed is public/professional — not an employer-gated internal community. |
| 10 | **Exclusive Job Boards + Bidding** | Recruiter | Premium | Marketplace of exclusive job boards with a bid/slot-based posting mechanism. Current `jobBoards` tables support basic posting only — no exclusivity or auction logic. |

### ⚠️ Partial — Implemented but Incomplete or Ungated

| # | Feature | Persona(s) | Tier | What Needs to Be Fixed |
|---|---------|-----------|------|------------------------|
| 11 | **Subscription Tier Enforcement** | All | Free + Premium | `usageRecords` and `subscriptionPlans` exist in schema and AI usage is tracked, but hard enforcement of Free-tier limits (10 AI requests/mo, applicant/contact caps, team size caps) is not applied consistently across feature routes. Each route needs to check the user's active subscription before serving Premium-only or over-quota requests. |
| 12 | **Advanced Video Templates** | All | Premium | Storyboard generation works for all users. A Premium-exclusive template library with styled layouts and branded themes needs to be built and gated behind subscription check. |
| 13 | **Advanced Dashboard Analytics + AI Insights** | All | Premium | Role dashboards exist but all users see the same data regardless of tier. Premium should surface AI-generated narrative insights (trend explanations, recommendations) while Free sees raw metrics only. |
| 14 | **Advanced Interview Scheduling + Automation** | All | Premium | AI interview practice sessions work. Missing: calendar-based scheduling of real interviews (slot selection, invitations, reminders, rescheduling), with automation gated to Premium. |
| 15 | **Smart Outreach Campaigns** | Recruiter | Free + Premium | Email campaigns and templates are implemented. "Smart" means behaviour-triggered sequences (follow up if no open in 3 days, personalise based on candidate data). This automation layer does not exist. |
| 16 | **AI-Powered Smart Notifications** | All | Premium | SSE notification stream is live. Premium should deliver AI-ranked, prioritised notifications (e.g. surface the most actionable alert first). Currently all notifications are treated equally. |
| 17 | **Salary Calculator gated to Premium** | All | Free restriction | `salary.ts` routes are accessible to all users. Per the pricing page, the Salary Calculator is a Premium-only feature — Free users should see a paywall/upsell prompt. |
| 18 | **AI Message Personalization (tier differentiation)** | All | Free + Premium | Personalization endpoints exist but Basic (limited) vs Advanced (unlimited) tier split is not enforced. Rate limiting and capability differences need to be applied based on subscription. |
| 19 | **Priority / AI-Enhanced Job Matching** | All | Premium | All users currently receive identical matching logic. Premium "AI-Enhanced" matching should use a deeper analysis pass (more context, re-ranking, explanations) while Free gets a lighter-weight version. |
| 20 | **Team Size / Admin User Limits** | Recruiter, Employer | Free (≤2 members) | Invitation system works but there is no hard cap enforced at the route level. Free accounts should be blocked from inviting a 3rd+ team member without upgrading to Premium. |
