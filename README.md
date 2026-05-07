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
│   │   ├── routes/               # ~100 route files — one per feature domain
│   │   ├── services/             # Business logic services (organised by domain — auth/, billing/, company/, job/, media/, messaging/, recruiter-marketplace/, resume/, studio/, user/, etc.)
│   │   ├── middleware/           # Auth, error handling, rate limiting, logging
│   │   ├── db/
│   │   │   ├── schema/           # Drizzle schema definitions (~230 tables across 52 schema files)
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
└── docs/                         # (consolidated into this README)
```

---

## Architecture Patterns

Conventions every new feature MUST follow. These aren't suggestions — they're how we keep the codebase testable and the contracts stable as it grows.

### 1. Handlers are pure functions with injected deps (SOLID / DI)

Route handlers on the Hono surface used to call `getDb()`, `sendEmail()`, `seedOnboardingTasks()` directly. That pattern hard-codes infrastructure into business logic and makes real unit tests impossible — the handler can only be exercised against a live DB + live SendPulse account.

The pattern now:

```
api/src/routes/
├── auth.ts              ← Hono wiring. Thin. Parses body, builds deps,
│                          delegates to handle*, returns c.json().
├── auth-handlers.ts     ← Pure handle* functions. Take AuthDeps + body,
│                          return { status, body }. No getDb(), no
│                          sendEmail() — everything goes through ports.
├── auth-deps.ts         ← buildAuthDeps() — concrete adapters for prod.
│                          Tests NEVER import from here; they build fakes.
└── __tests__/
    ├── auth-schemas.test.ts   ← Zod schema + pure-helper coverage.
    └── auth-handlers.test.ts  ← Integration tests with mocked ports.
```

Each handler takes a typed `Deps` bag (one interface per port). Ports are minimal — Interface Segregation means a test only has to mock what the handler actually uses:

```ts
// auth-handlers.ts
export interface EmailerPort {
  sendVerification(to: string, name: string, token: string): Promise<void>;
  sendPasswordReset(to: string, name: string, token: string): Promise<void>;
  // ... 3 more
}

export interface AuthDeps {
  db: DbPort;
  email: EmailerPort;
  onboarding: OnboardingPort;
  jwtSecret: string;
  now: () => Date;              // injected so tests can freeze time
  randomHex: (n: number) => string;  // injected for deterministic tokens
  isDev: boolean;
}

export async function handleRegister(deps: AuthDeps, body: unknown): Promise<HandlerResult> {
  // ...pure logic, no imports from services/db/email...
}
```

Prod wiring (Hono route):

```ts
// auth.ts
authRoutes.post("/register", async (c) => {
  const { handleRegister } = await import("./auth-handlers.js");
  const { buildAuthDeps } = await import("./auth-deps.js");
  const body = await c.req.json().catch(() => null);
  const result = await handleRegister(buildAuthDeps(c), body);
  return c.json(result.body, result.status);
});
```

Test wiring (no infra):

```ts
// auth-handlers.test.ts
const deps = makeDeps(); // fake db + fake emailer + fake onboarding
await handleRegister(deps, { email: "a@b.com", password: "password123", name: "A" });
assert.equal(deps._email.calls.filter((c) => c.name === "sendVerification").length, 1);
assert.equal(deps._state.users[0].passwordHash.match(/^[0-9a-f]{32}:[0-9a-f]{64}$/), /* hashed */);
```

**Current handler/deps pairs:**
- `auth-handlers.ts` / `auth-deps.ts` — register, login, forgot-password, reset-password, verify-email. 29 integration tests.
- `resume-handlers.ts` / `resume-deps.ts` — get, update (slug-in-body, metaData preservation), create, delete, watch, unwatch, sentiment, list. 33 integration tests.

**Rule of thumb:** any handler that would need a DB or a network service to test gets extracted to a `*-handlers.ts` file with a `Deps` port. Handlers that are already pure (e.g. `rowToResume` serializer) stay where they are.

### 2. Shared contracts live in `/shared`, not duplicated per side

The backend and frontend MUST NOT have divergent Zod schemas or TS types for the same wire shape. Any type that crosses the network lives in [shared/resume.ts](shared/resume.ts), [shared/pricing.ts](shared/pricing.ts), [shared/user-roles.ts](shared/user-roles.ts), etc.

Frontend imports via `@shared/resume`; backend imports via the relative path `../../../shared/resume.js`. Tests on both sides reuse the same Zod schemas — a contract test that lives once is a contract test that can't drift.

The living progress/design doc for the resume contract is at the top of [shared/resume.ts](shared/resume.ts).

### 3. Canonical form only — no silent normalization layers

A normalization layer that converts between two "styles" (PascalCase vs snake_case, wrapped vs unwrapped, etc.) is a red flag. It hides a real bug — one of the two sides is sending the wrong thing.

Examples we've retired:
- **User roles** — `USER_ROLES` was PascalCase (`"JobSeeker"`, `"Recruiter"`) on the frontend; the backend stored `"job_seeker"`, `"recruiter"` and the register endpoint had a normalization transform bridging them. We deleted the transform and made the shared constants snake_case. Every PascalCase role literal was swept out of 28 frontend files.
- **Resume content keys** — the `content` jsonb column historically had PascalCase keys (`Basics`, `Work`, `Education`). Backend shim `rowToLegacyResume` fabricated a secondary wire shape (`metaResume`, `resumeSerialized`) to translate. Both shim + PascalCase storage retired in favour of camelCase throughout (JSON Resume spec).
- **Resume API envelope** — `rowToLegacyResume` and frontend `transformApiResumeToResume` were mirror shims (400 lines + 400 lines). Backend now returns the clean DB row shape; frontend service is a passthrough.

**If you see a transform that just renames fields or reshapes casing, fix it at the source — don't paper over it.**

### 4. Roles vs Services

Roles and opt-in services are distinct. The `users.role` column holds exactly one of:
- `job_seeker` (default)
- `recruiter`
- `employer`
- `admin`
- `super_admin`

Services users can opt into — e.g. the affiliate program (`enableAffiliate: true` at signup, `affiliate_profiles` table) — are NOT roles. A user can be a `job_seeker` AND an affiliate. Admin surfaces render affiliate status as a badge/filter, not a role.

Conversely, anything that's a structural user tier goes in `users.role`. Roles that appear in JWTs or access-policy checks always use the snake_case canonical form.

### 5. No fake placeholder fields in DTOs

DTOs serialize real data or they don't expose the field. Counter-examples we've retired:
- `sentimentScore: 0` hardcoded on every resume response — now a real column written by the sentiment tool (null when unscored).
- `views: 0` hardcoded — now aggregated from a `resume_views` event table.
- `isWatched: false` hardcoded — now a real per-viewer join against `watched_resumes`.
- Company profile `benefits`/`culture`/`values`/`mission`/`technologies`/`locations`/`teamMembers` were fabricated as empty arrays / all-false booleans — now real columns + tables, with CRUD endpoints for the relational parts.

**Rule:** if the column doesn't exist yet, the DTO doesn't ship the field. A `TODO: implement` ticket beats a lie.

### 6. Event tables over denormalized counters

Analytics counts come from event logs, not counter columns:
- `resume_views (resume_id, viewer_id, ip_hash, referrer, user_agent, viewed_at)` → aggregated for `viewCount` on the resume DTO.
- `company_views (company_id, viewer_id, ip_hash, referrer, user_agent, viewed_at)` → aggregated for `views` on the company DTO.
- `watched_resumes (viewer_id, resume_id)` with a unique index for idempotent "watch" POSTs.

Benefits: dedupe by ip_hash, per-viewer attribution, referrer breakdowns, time-series charts — all come for free without migrations when the UI asks for them. A single counter column would have required a schema change plus a data backfill every time.

### 7. One shared handler module, no per-file re-definitions

`HandlerResult`, `ok()`, `fail()`, and the `requireAuth()` guard all live in [`api/src/handlers/shared.ts`](api/src/handlers/shared.ts). Before this consolidation the same envelope was redefined in every `*-handlers.ts` file — seven copies, seven chances for field names and error codes to drift. That drift surface produced the 2026-04-20 blank-title production bug.

Rule: never redeclare `HandlerResult` or the envelope helpers in a handler file. Import them.

```ts
import { ok, fail, requireAuth, type HandlerResult } from "../handlers/shared.js";

export async function handleX(deps: Deps, viewerId: string | null, body: unknown): Promise<HandlerResult> {
  const auth = requireAuth(viewerId);
  if ("status" in auth) return auth;        // 401 already shaped
  // auth.userId is now string, not string | null
}
```

`requireAuth` returns a discriminated result and narrows with `"status" in auth` — we use `in` narrowing (not `!auth.ok`) because the API package runs with `strictNullChecks: false` and `in` narrows correctly there.

### 8. One resume serializer module, one privacy map

Resume-specific serializers (`rowToResume`, `rowToResumeSummary`), the viewer-extras queries (`computeViewerExtras`, `computeViewerExtrasBatch`, `recordResumeView`), and the `PRIVACY_TO_LEVEL` / `LEVEL_TO_PRIVACY` maps live in [`api/src/handlers/resume-serializer.ts`](api/src/handlers/resume-serializer.ts). Both `routes/resumes.ts` and `routes/resume-handlers.ts` import from there. The first cut of the handler extraction re-implemented these against its `DbPort = any` signature — silent drift risk. Never fork these; extend in place.

### 9. Shared Zod schemas live in `/shared`, handlers import them

Request schemas are part of the wire contract, so they live alongside the types in `/shared`:

- `shared/resume.ts` — `CreateResumeSchema`, `UpdateResumeSchema`, `SlugSchema`, `ResumePrivacySchema`, `ResumeWithOwnershipSchema`
- `shared/settings.ts` — `JobPreferencesSchema`
- `shared/companies.ts` — `CreateCompanySchema`, `UpdateCompanySchema`, `CompanyLocationSchema`, `CompanyTeamMemberSchema`
- `shared/billing.ts` — `RefundRequestSchema`, `CancelAccountSchema`
- `shared/autofill.ts` — `SaveSubmissionSchema`, `UpdateCacheEntrySchema`

Handlers re-export for tests that already imported from the handler module, but new code imports from `shared/` directly. The frontend imports the same schemas for form-level validation — one source of truth, no client/server drift.

### 10. Branded value types — parse once, pass everywhere

`shared/value-types.ts` defines branded nominal types so we can't accidentally swap a `UserId` for a `ResumeId` or treat an unvalidated string as a `Slug`:

```ts
type Slug = string & { readonly [brand]: "Slug" };
export function parseSlug(raw: string): Slug;   // throws on invalid input
```

Key invariants:
- `Slug` accepts UUID-shaped strings — new resumes are seeded with `slug = id` so the row always has a stable URL segment, and the public/embed routes already fall back to the id column when the path is UUID-shaped.
- `Privacy` cannot be an unknown string — `parsePrivacy("garbage")` throws rather than silently falling through to `"private"` (which was the bug the 2026-04-20 audit flagged in `handleSetPrivacy`).
- `UserId` / `ResumeId` / `CompanyId` / `JobId` / `SubscriptionId` are distinct even though they're all UUIDs underneath.

The boundary is the Zod schema: `SlugSchema.transform(s => s as Slug)` runs at validation time. Request types use `z.input<>` (plain strings, for request builders); handlers see `z.infer<>` (branded, post-validation). Never cast a raw string to a branded type without going through the parse function.

### 11. Test harness: real WHERE-predicate evaluation

The fake DB at [`api/src/handlers/__testing__/fake-db.ts`](api/src/handlers/__testing__/fake-db.ts) walks Drizzle's SQL AST and evaluates the operators our handlers use (`eq`, `ne`, `and`, `or`, `inArray`, `lte`, `gte`, `isNull`, `isNotNull`) against in-memory rows.

The previous per-file fakes ignored WHERE entirely — `.where(_: unknown) { return state.slice(0, n); }` — which meant a handler that accidentally fetched another user's row would pass tests. That was the test-brittleness issue the 2026-04-20 audit flagged.

Usage:

```ts
import { buildFakeDb } from "../../handlers/__testing__/fake-db.js";

const { db, state, calls } = buildFakeDb({
  resume_information: [seed],        // keyed by DB table name
  watched_resumes: [],
  resume_views: [],
});
// Pass `db` as deps.db. Assert on `state[table]` or `calls` audit log.
```

If a handler uses a Drizzle operator the evaluator doesn't recognise, it logs `[fake-db] unrecognised predicate — defaulting to match-all` so test authors extend the evaluator rather than silently receiving wrong answers.

### 12. Strangler-Fig rollouts with env-flagged parallel paths

When a handler's shape changes (e.g. migrating `/api/match/tailor` from flat-text prompts to JSON-preserving prompts with a `tailoredResume` output), the two paths live side-by-side under a single facade:

- The facade reads a Cloudflare Worker env flag (`RESUME_TAILOR` in this case) and decides which path's result is returned to the client.
- Both paths run in parallel via `Promise.allSettled` so the old path cannot be broken by the new one and a single correlation-id log entry captures metrics (tokens, duration, validation outcome, changes[] size, work-entry preservation, etc.) for each side.
- If the primary path returns a non-200 or throws, the facade falls back to the secondary path so the client still gets a usable response.
- Both legacy and JSON paths are exercised by the existing `match-handlers` test suite; tests assert on *what the path does*, not on how many LLM calls fire in total.

The resume-tailor JSON pipeline ([spec](.kiro/specs/resume-tailor-json-pipeline/)) is the canonical example:

- `handleTailorLegacy` flattens job/resume to text using `jobRowToLLMText` + `resumeContentToText` (deprecated in this path — still used by `/analyze` and `/bycontent`).
- `handleTailorJson` keeps `ParsedJob` and `ResumeContent` as JSON all the way through (`resolveJobV2` / `resolveResumeV2`), prompts the LLM for a full JSON Resume back, validates preservation of every `work[].name` and `education[].institution`, and retries once with a strengthened prompt if validation fails.
- The handler's response has a `processingPath: "legacy" | "json"` marker so the frontend can branch on whether `tailoredResume` is available. When `tailoredResume` is present, `ResumeTailor.tsx` uses `renderMarkdownFromJsonResume` (a [shared utility](shared/resume-markdown.ts)) to render the preview and enables "Save as Variation" — a direct JSON pass-through to `resumeService.createResume` with no extra LLM call.

To flip the rollout, set `RESUME_TAILOR=true` in the Worker env. Both paths continue to run so you can revert instantly by clearing the flag, and the comparison log tells you whether the JSON path has caught up to the legacy one on quality metrics.

### 13. N-layer architecture: Routes → Services → Repositories

The codebase follows a strict three-tier layering with DDD-aligned repository granularity. Violating any of these rules is a review-blocking issue.

**Layer responsibilities:**

```
api/src/routes/           ← Hono adapters. Thin. Parse request, call service, return response.
                            NO business logic. NO direct Drizzle. NO validation beyond request shape.
api/src/services/<domain>/ ← Aggregate modules (see "Aggregate = module" below).
                            Services own business logic, invariants, orchestration, and audit writes.
                            Can compose multiple repos for cross-aggregate work.
api/src/repositories/      ← ONE repo per aggregate root. Typed Drizzle wrappers.
                            NO business logic. NO validation. NO cross-aggregate logic.
```

**The three rules:**

1. **Repository-per-aggregate (not per bounded context).** A repository persists ONE aggregate — the transactional unit. A bounded context may contain multiple aggregates (User + Preferences + Autofill are all in the `user` bounded context but are separate aggregates with independent write lifecycles). Each gets its own repo.

2. **Aggregate-module-per-bounded-context.** The `services/<domain>/` folder is the module boundary. Only the aggregate root service (`ResumeService`, `BillingService`, …) is re-exported from `services/<domain>/index.ts`; sub-services inside the folder are internal. Route handlers depend on the aggregate root, never on sub-services directly.

3. **Services own the bounded-context logic.** "Fewer repos" does not mean "thinner services." Business rules (heal-before-write, "first upload auto-promotes to master", "cancel refund triggers plan downgrade", …) live in services. Repos stay CRUD-shaped. When a service needs data from two aggregates, it injects two repos — it does not reach across aggregate boundaries through a god-repo.

**Canonical structure:**

```
api/src/services/billing/         ← bounded context: everything money-related
├── index.ts                      ← public surface (re-exports BillingService)
├── BillingService.ts             ← aggregate root; owns invariants, orchestrates sub-services
├── subscriptions.ts              ← Subscription aggregate behavior (uses SubscriptionsRepository)
├── tokens.ts                     ← Tokens aggregate behavior (uses TokensRepository)
├── invoices.ts                   ← Invoices aggregate behavior (uses InvoicesRepository)
└── checkout.ts                   ← orchestration: subscriptions + invoices + Stripe adapter

api/src/repositories/
├── subscriptionsRepository.ts    ← Subscription aggregate persistence
├── tokensRepository.ts           ← Tokens aggregate persistence
└── invoicesRepository.ts         ← Invoices aggregate persistence
```

**Cross-aggregate orchestration services** live at `services/` root, not inside a single aggregate module, because they compose across bounded contexts:

- `AccountService` — Users + Billing + Auth + Preferences (`loadAccountContext` on every request)
- `CheckoutService` — Billing + Stripe adapter + Email adapter
- `OnboardingService` — Users + Billing + Messaging + Resume (first-run flow)
- `ImpersonationService` — Auth + Users (SuperAdmin start/end/switch-persona)

**Infra adapters** (third-party integrations) live at `services/adapters/`:

- `EmailAdapter`, `StripeAdapter`, `LLMAdapter`, `TranscriptionAdapter`, `SignalWireAdapter`

Adapters are injected as ports so tests never hit a real API.

**Repository factory (DIP + DRY):**

One `buildRepos(db)` factory in `api/src/repositories/index.ts` is the canonical seam. Every caller imports `buildRepos` — no one does `new FooRepository(getDb())` inline. Services depend on the `I*Repository` interface, not the concrete class, so tests can substitute hand-rolled fakes.

```ts
// services/billing/subscriptions.ts
export async function cancelSubscription(
  repos: { subscriptions: ISubscriptionsRepository; auth: IAuthRepository },
  userId: string,
): Promise<void> {
  const sub = await repos.subscriptions.findActiveByUserId(userId);
  if (!sub) return;
  await repos.subscriptions.updateSubscriptionById(sub.id, { status: "canceled" });
  await repos.auth.insertAdminAudit({ action: "SUBSCRIPTION_CANCELED", targetId: userId, /* ... */ });
}
```

**Complete repo list (19 — one per aggregate):**

| Aggregate module (bounded context) | Repositories inside |
|---|---|
| `services/resume/` | Resume |
| `services/user/` | Users, Preferences, Autofill |
| `services/job/` | Jobs (inc. jobBoards, resume-matches, exclusive boards) |
| `services/company/` | Companies (inc. candidate pipeline, recruiter-matches, talent pool), HiringPipeline (interviews, offers, calendar, assessments, performance, onboarding) |
| `services/billing/` | Subscriptions, Tokens (AI usage + tool runs), Invoices |
| `services/auth/` | AuthTokens (password reset + 2FA + refresh + webauthn + oauth), Authz (modules + permissions + API keys), Audit (admin log + impersonation + activity) |
| `services/messaging/` | Notifications, Conversations (DM + AI chat + phone), FollowUps |
| `services/media/` | Media (videos + voice + studio + pitch decks + feed posts) |
| `services/marketing/` | Marketing (ads + affiliates + email campaigns + leads) |
| `services/platform/` | Platform (whitelabel tenants + org + feature flags + account invitations + insights) |

**What breaks this rule:**

- A route calling `getDb().insert(schema.foo)` directly → must go through a service that goes through a repo.
- A service importing from `schema.*` (other than for column-name type hints) → only repos import from schema.
- A service in `services/billing/` reading from `schema.users` → should call `deps.repos.users.findById()`.
- A repo method that does more than CRUD (e.g. sends an email on delete) → move the side effect to the service.
- Two repos both owning writes to the same table → the table belongs to one aggregate; pick one.
- A "god repo" with methods spanning multiple aggregates → split; bounded-context folders are for grouping in the service layer, not the repo layer.

---

## Deferred architectural work

These came out of the 2026-04-20 anti-pattern audit but are scoped as follow-ups rather than blocking work. Track them here so we don't lose them.

### Remove dynamic `await import()` from Hono routes

Every route in `api/src/routes/resumes.ts` (and some in `billing.ts` / `settings.ts`) calls `await import("./resume-handlers.js")` inside the handler body. This was put in place during the extraction to avoid circular import ordering, but it runs on every request. Static imports at the top of the file work now that the handler modules are stable.

**When**: can ship anytime, needs a careful sweep to confirm no cycles.
**Blast radius**: small — runtime perf improvement, no semantic change.

### Domain layer (real DDD, not just pure handlers) — **done**

✅ Shipped as Pattern 13 above. The three-tier layering (Routes → Services → Repositories) is now canonical, with aggregate modules (`services/<domain>/`) grouping each bounded context and one repository per aggregate root. `ResumeContent` is a branded value type produced only by `healAndValidateContent`; business rules live in the aggregate service, not in the Hono route.

What still isn't pure DDD: the aggregate services are module-level function collections, not instance classes with stateful aggregate roots. A "real" `Resume` aggregate with `promoteToMaster()` as an instance method is still a possible next step when we introduce a second channel (background jobs / CLI) that would benefit from the same domain ops. Until then, module-level aggregate services pay the bulk of the DDD dividend without the ceremony.

---

## Frontend Architecture

### Dashboard

The dashboard system uses a **role-based component loader pattern**. The main container reads the user's `rolePermissions` and renders the appropriate role-specific component.

```
/frontend/pages/Dashboard.tsx (main container — 329 lines)
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

## Video AI Studio Architecture

### Pipeline

```
User Prompt + Resume
        ↓
  LLM (OpenRouter)       → generates Video Script DSL
        ↓
  Video Compiler         → builds Scene Graph + Animation Graph
        ↓
  Frame Renderer         → Canvas 2D
        ↓
  WebCodecs Encoder      → VideoFrame pipeline
        ↓
  MP4 Muxer              → Blob
        ↓
  Upload → YouTube / LinkedIn / ATS Package
```

### Studio Layout (3-panel workspace)

```
┌──────────┬──────────────────────────┬──────────────────┐
│ Sidebar  │       Editor             │  Settings        │
│  260px   │       flex-1             │  320px           │
│          │  [Prompt|Storyboard]     ├──────────────────┤
│          │  [Timeline]              │  Preview         │
│          │  [Advanced Features]     │  (canvas 16:9)   │
└──────────┴──────────────────────────┴──────────────────┘
```

### Studio Files

```
frontend/pages/studio/
  Studio.tsx              ← re-export of StudioLayout
  StudioLayout.tsx        ← top-level state, layout, auth gate (1,131 lines)
  StudioSidebar.tsx       ← project nav, templates, backgrounds, music
  StudioEditor.tsx        ← Prompt / Storyboard tab switcher
  StudioPreview.tsx       ← right panel: canvas + Export + Publish + LinkedIn + visibility
  StudioSettings.tsx      ← AI settings + Video settings
  StudioFeaturesHub.tsx   ← Advanced features: 9 tabs (Record, Voiceover, Captions, Interview, Skills, Analytics, ATS, Async Interview, LinkedIn)
  ATSLandingPage.tsx      ← public shareable page at /v/ats/:slug
  AsyncInterviewPage.tsx  ← candidate interview view at /interview/:token

frontend/components/studio/     (12 components, ~7,000 lines total)
  VoiceoverPanel.tsx      ← TTS voice selection, generation, playback, word highlight
  WebcamRecorder.tsx      ← camera/screen/PiP recording, audio level meter
  Teleprompter.tsx        ← auto-scrolling text overlay, WPM control
  DeliveryCoach.tsx       ← score cards, filler words, pacing, suggestions
  CaptionEditor.tsx       ← cue editing, style selector, SRT/VTT export
  InterviewPractice.tsx   ← question library, STAR framework, AI coaching
  SkillsDemoCreator.tsx   ← template selection, AI script, recording flow
  VideoAnalyticsDashboard.tsx ← engagement heatmap, viewer list, drop-off
  ATSPackageGenerator.tsx ← shareable link, text summary, email template
  VoiceCloneManager.tsx   ← record/upload sample, manage cloned voices
  AsyncInterviewManager.tsx ← recruiter + candidate views
  LinkedInPublisher.tsx   ← OAuth connect, compose post, publish

frontend/lib/
  compiler/
    video-compiler.ts     ← compile(VideoScript) → CompiledVideo
    scene-graph.ts        ← SceneNode tree per scene type
    animation-graph.ts    ← AnimationSpec → CompiledAnimation interpolators
    storyboard-adapter.ts ← storyboardToVideoScript() backward-compat
    types.ts              ← all compiler internal interfaces
  renderer/
    canvas-nodes.ts       ← drawNode() for each SceneNode type
    frame-renderer.ts     ← render(ctx, compiledVideo, time)
    video-exporter.ts     ← exportVideo() WebCodecs + mp4-muxer + fallback
    caption-renderer.ts   ← 4 caption styles (standard, bold-pop, word-by-word, lower-thirds)
  audio/
    ambient-player.ts     ← background music playback + export mixing
  analytics/
    video-tracker.ts      ← per-second engagement tracking, beacon on unload
  services/
    studio-service.ts     ← core studio API client
    studio-features-service.ts ← TTS, captions, LinkedIn, recording, coaching, ATS, interviews, skills, voice clone, analytics

frontend/types/
  video-script.ts         ← VideoScript DSL + VoiceoverConfig + CaptionConfig + WordTimestamp
  studio.ts               ← StudioProjectState (voiceover, captions fields)

api/src/routes/
  studio.ts               ← core studio routes (1,716 lines)
  studio-features.ts      ← TTS, captions, LinkedIn, recording, coaching, ATS, interview, skills, voice clone, async interview, analytics (1,451 lines)

api/src/services/
  transcription.ts        ← OpenAI Whisper transcription, delivery analysis (pacing, fillers, energy)
```

> **TTS / voice cloning:** all speech synthesis runs 100% client-side via WebGPU
> TTS engines (Web Speech / Kokoro / Piper / VibeVoice). See
> `frontend/lib/services/tts-engines.ts`. The backend stores reference audio
> samples and the marketplace license ledger in `studio_voice_clones` and
> `studio_voice_clone_licenses`, but never invokes a model itself.

### Video Script DSL

The AI generates a `VideoScript` — a declarative program the compiler evaluates at any frame:

```typescript
interface VideoScript {
  video: { duration, fps, resolution, aspect, theme: { colorPalette, fontFamily, motion, transition, background }, audio? }
  scenes: SceneScript[]    // intro | achievement | skills | closing | job-details | company-culture | cta | testimonial | product-feature | brand-story | requirements | benefits
}
```

Scene types cover both job-seeker (resume) and advertising use cases. Purposes: `resume`, `job_ad`, `company_promo`, `recruiter_brand`, `product_launch`, `personal_brand`.

### Database Tables (Studio)

From `schema/videos.ts`, `schema/studioadvertising.ts`, `schema/studiofeatures.ts`:

| Table | Purpose |
|-------|---------|
| `videos` | Video records (status, R2 key, YouTube ID, privacy) |
| `video_resumes` | Video-resume associations |
| `youtube_accounts` | YouTube OAuth tokens |
| `studio_brand_kits` | Brand identity (logo, colors, font) |
| `video_analytics` | Lightweight view + CTA-click tracking |
| `video_campaigns` | Campaign grouping with UTM tracking |
| `studio_voiceovers` | TTS audio per scene with word timestamps |
| `studio_voice_clones` | User voice cloning profiles |
| `studio_captions` | Auto-generated subtitle tracks (4 styles) |
| `linkedin_accounts` | LinkedIn OAuth tokens |
| `studio_recordings` | Webcam/screen recordings with transcription |
| `studio_delivery_coaching` | AI coaching scores (pacing, fillers, energy, clarity) |
| `studio_ats_packages` | ATS-compatible shareable landing pages |
| `studio_interview_questions` | Interview question library (15 defaults) |
| `studio_interview_sessions` | Practice sessions with AI scoring |
| `studio_skills_demos` | Skills demonstration videos (4 templates) |
| `studio_async_interviews` | Employer async interview requests |
| `studio_async_responses` | Candidate video responses |
| `studio_video_heatmap` | Per-second engagement analytics |
| `stock_media_assets` | Content-addressed stock library cache (one row per `sha256(bytes)`) |
| `user_stock_media_usage` | Per-user join table — same R2 object backs many users without dup |
| `studio_project_versions` | Autosaved + manual storyboard snapshots (50/project, 30-day retention) |
| `studio_chapters` | Per-project chapter markers for YouTube-style TOC |
| `studio_video_forms` | In-video lead capture forms pinned to playback timestamps (Wistia Turnstile equivalent) |
| `studio_video_form_submissions` | Form submissions, also mirrored into `marketing_leads` |
| `studio_review_comments` | Frame.io-style time-coded review comments + threading |
| `studio_review_links` | Public shareToken-based review URLs (anonymous external reviewers) |
| `studio_thumbnails` | AI-ranked thumbnail candidates with isSelected pointer |
| `company_boosts` | Self-serve featured company profile boost (mirrors `job_boosts`) |

### Environment Variables (Studio)

| Variable | Service | Required |
|----------|---------|----------|
| `OPENROUTER_API_KEY` | LLM script generation | Yes (falls back to mock) |
| `OPENAI_API_KEY` | Whisper transcription + delivery coaching | For recording features |
| `LINKEDIN_CLIENT_ID` | LinkedIn OAuth | For LinkedIn publishing |
| `LINKEDIN_CLIENT_SECRET` | LinkedIn OAuth | For LinkedIn publishing |
| `UNSPLASH_ACCESS_KEY` | Stock images (Unsplash) | For stock media library |
| `PEXELS_API_KEY` | Stock images + video (Pexels) | For stock media library |
| `PIXABAY_API_KEY` | Stock images + video (Pixabay) | For stock media library |

---

## Video Studio Capability Assessment

Evaluated against a feature specification for a fully browser-based general-purpose video editor comparable to Canva Video / CapCut. hired.video's studio is purpose-built for AI-driven video resume and employer content creation, not a traditional non-linear editor (NLE). The table below documents parity, partial coverage, and open gaps against that specification.

**Summary: 31 ✅ fully implemented · 4 ⚠️ partial · 3 ❌ not implemented (38 capabilities total)**

Open gaps against the Canva-Video / CapCut spec are tracked in the [Consolidated Gap Register](#consolidated-gap-register) as entries #124–#133. Net-new studio gaps beyond that spec (AI avatars, dubbing, audio enhancement, multi-platform publishing, in-video lead capture, chapters, thumbnails, hook optimizer, etc.) are tracked as #134–#145.

### Core Requirements

| Capability | Status | Implementation | Gap Register |
|---|---|---|---|
| Timeline-based editor | ✅ Done | `NLETimeline.tsx` — frame ruler with click-to-seek, draggable scene blocks, playhead, zoom (20–240 px/s). Mounted below the preview canvas in `StudioLayout.tsx`. | — |
| Video, audio, image, and text tracks | ✅ Done | Scene blocks decompose into the existing canvas node graph (text/image/video). Multi-track audio mixer (#129) covers music + voiceover lanes. | — |
| Clip trimming, splitting, merging, reordering | ✅ Done | `scene-ops.ts` — `trimScene`, `splitSceneAtTime`, `mergeWithNext` (seamless re-merge of contiguous trim points), `reorderScene`. Surfaced as drag handles + S/M/D/Del shortcuts in `NLETimeline.tsx`. | — |
| Multi-layer editing with precision timing | ⚠️ Partial | `animation-graph.ts` supports per-node keyframe interpolation under the hood; visual keyframe editor not yet exposed. | — |

### Visual Editing Features

| Capability | Status | Implementation | Gap Register |
|---|---|---|---|
| Transitions and effects (fade, slide, zoom) | ✅ Done | Per-scene `transitionIn` field overrides the theme default. Transition picker dropdown badge on each scene block in `NLETimeline.tsx`. `frame-renderer.ts` resolves per-boundary: exit toward N+1 uses N+1's transition; entry from prev uses this scene's. | — |
| Filters and color adjustments (brightness, contrast, saturation) | ✅ Done | `VideoFilters` in `types/video-script.ts` + `videoFiltersToCss()` applied to `StudioPreview` wrapper. 5-slider UI in `StudioSidebar` Theme section. | — |
| Text overlays, subtitles, and animations | ✅ Done | `caption-renderer.ts` — 4 styles (standard, bold-pop, word-by-word, lower-thirds). Text scene nodes with animated entry/exit. `CaptionEditor.tsx` (571 lines). | — |
| Canvas resizing (16:9, 9:16, 1:1, 4:3) | ✅ Done | `VideoAspect` extended in `types/video-script.ts`; compiler `ASPECT_MAP` covers all four. Switcher in `StudioSettings.tsx` re-renders preview canvas live. | — |

### Audio Capabilities

| Capability | Status | Implementation | Gap Register |
|---|---|---|---|
| Multi-track audio editing | ✅ Done | `AudioMixConfig` per-lane gain in `video-exporter.ts`; `AudioMixerDialog` exposes music + voiceover lanes plus master gain. | — |
| Volume control and fade in/out | ✅ Done | Per-lane gain (0..200%) + fadeIn/fadeOut envelopes via `setValueAtTime` + `linearRampToValueAtTime` in `video-exporter.ts`. | — |
| Voice-over recording | ✅ Done | `WebcamRecorder.tsx` (767 lines) — browser-native MediaRecorder. `VoiceoverPanel.tsx` — engine picker (Web Speech / Kokoro / Piper / VibeVoice), per-scene editable scripts, word-level timestamps, speed control, playback preview. `Teleprompter.tsx` — auto-scroll + WPM control. | — |
| Background music and sound effects | ✅ Done | `ambient-player.ts` — background track playback + export mixing. `StudioSidebar.tsx` — music library selection. | — |

### AI-Powered Features

| Capability | Status | Implementation | Gap Register |
|---|---|---|---|
| Auto-generate subtitles/captions | ✅ Done | OpenAI Whisper transcription (`services/transcription.ts`). `POST /captions/generate`. 4 caption styles rendered by `caption-renderer.ts`. SRT/VTT export. | — |
| Text-based editing via transcript | ❌ Not implemented | Whisper produces transcripts for coaching; no transcript-driven cut/edit workflow (Descript-style). | #126 |
| Background removal (no green screen) | ❌ Not implemented | Not implemented. Would require MediaPipe Selfie Segmentation or similar WASM model. | #127 |
| AI voiceovers | ✅ Done | 100% client-side WebGPU TTS via `lib/services/tts-engines.ts`. Four engines: Web Speech (built-in), Kokoro-82M, Piper, and VibeVoice (cloning). Per-scene generation. Voice cloning is a creator-owned asset with an in-product **Voice Marketplace** — see below. | — |
| Voice Marketplace | ✅ Done | Creators upload a reference sample (`POST /api/studio/voice-clones`, private by default), set their own price, and toggle `Monetize` to publish (`PATCH /:id` with consent). Listings appear in the homepage `Voices` category and `VoiceMarketplaceCard` adds them to the shopping cart. Buyers receive a perpetual personal license (`studio_voice_clone_licenses`) with 95/5 creator/platform split + CC processing fee charged to the buyer (per #156). All synthesis runs in the buyer's browser via VibeVoice — the server never runs a model. Schema: `studio_voice_clones` (extended with `visibility`, `price_cents`, `platform_fee_bps`, `consent_*`), `studio_voice_clone_licenses`. Routes: `GET /voice-clones/library`, `GET /voice-clones/marketplace`, `PATCH /voice-clones/:id`, `POST /voice-clones/:id/claim`, `POST /voice-clones/cart-checkout`. Terms of Service §9a covers consent, ownership, and the revenue split. | — |

### Media & Assets

| Capability | Status | Implementation | Gap Register |
|---|---|---|---|
| User uploads (video, audio, images) | ✅ Done | R2-backed upload routes (`routes/upload.ts`). `WebcamRecorder.tsx` supports file upload in addition to live recording. | — |
| Stock media library integration | ✅ Done | Unsplash + Pexels + Pixabay aggregator (`services/stockmedia.ts`) with content-addressed dedup: one R2 object per `sha256(bytes)`, per-user picks tracked in `userStockMediaUsage`. `StockMediaPanel.tsx` in `StudioSidebar`. | — |
| Template system for common formats | ✅ Done | 3 free (720p) + 5 Premium (1080p) templates. 12 scene types. 6 purposes (`resume`, `job_ad`, `company_promo`, `recruiter_brand`, `product_launch`, `personal_brand`). `studioBrandKits` for brand consistency. | — |

### Technical Stack

| Capability | Status | Implementation | Gap Register |
|---|---|---|---|
| Frontend: React / Next.js or similar | ✅ Done | React 18 + Vite. TypeScript throughout. Tailwind + shadcn/ui. | — |
| Rendering: Canvas / WebGL / WebCodecs | ✅ Done | Canvas 2D (`frame-renderer.ts`), WebCodecs encoder (`video-exporter.ts`), Three.js / React Three Fiber for 3D elements. | — |
| Media processing: FFmpeg WASM or server fallback | ✅ Done | WebCodecs API + `mp4-muxer` / `webm-muxer` — browser-native hardware-accelerated encoding without FFmpeg dependency. Superior performance profile. | — |
| State management for timeline sync | ✅ Done | TanStack Query v5 for server state. `StudioLayout.tsx` (1,131 lines) owns local project state. | — |
| Optional backend for rendering/export | ✅ Done | Hono on Cloudflare Workers. Studio routes 3,167 lines across `studio.ts` + `studio-features.ts`. | — |

### Performance Requirements

| Capability | Status | Implementation | Gap Register |
|---|---|---|---|
| Smooth playback and scrubbing | ✅ Done | Canvas 2D `render(ctx, compiledVideo, time)` at target FPS. WebCodecs `VideoFrame` pipeline for encoding. | — |
| Efficient memory handling for large files | ⚠️ Partial | WebCodecs streams frames without full decode into memory. No explicit documented chunking/pooling strategy for large uploads. | — |
| Lazy loading and caching of media assets | ⚠️ Partial | Cloudflare R2 + CDN for assets. No explicit lazy-load or client-side LRU cache documented for timeline preview thumbnails. | — |

### Export & Sharing

| Capability | Status | Implementation | Gap Register |
|---|---|---|---|
| Export to MP4 (H.264) | ✅ Done | `video-exporter.ts` — WebCodecs `VideoEncoder` (H.264) + `mp4-muxer`. WebM fallback via `webm-muxer`. | — |
| Multiple resolutions (720p, 1080p, 4K) | ✅ Done | All three resolutions in `RESOLUTION_MAP`. 4K (3840×2160) Premium-gated server-side via `POST /api/studio/upload` (rejects with 402 PREMIUM_REQUIRED for non-Premium). | — |
| Direct sharing or download | ✅ Done | LinkedIn publish (`LinkedInPublisher.tsx`), ATS package shareable link (`ATSLandingPage.tsx`), visibility toggle (public/unlisted), embed code generation. | — |
| Cloud save and project persistence | ✅ Done | `studioProjects` persists projects. `studioProjectVersions` snapshots autosave every 30 s; `VersionHistoryDialog` exposes restore + manual snapshot. 50-version cap, 30-day retention. | — |

### Collaboration (Optional)

| Capability | Status | Implementation | Gap Register |
|---|---|---|---|
| Real-time collaborative editing | ❌ Not implemented | Not implemented. SignalR hub infrastructure exists for notifications; studio state is single-user. | #130 |
| Version history and autosave | ✅ Done | `studioProjectVersions` table + 4 routes; debounced 30 s autosave in `StudioLayout.tsx`; restore via `VersionHistoryDialog.tsx`. | — |

### Extensibility

| Capability | Status | Implementation | Gap Register |
|---|---|---|---|
| Plugin system for effects or tools | ❌ Not implemented | No hook or registry system for third-party studio plugins. | #132 |
| API for integrations | ✅ Done | OpenAPI 3.1 spec at `GET /api/openapi.json`. YouTube, LinkedIn, ATS (Greenhouse/Lever/Workday), and calendar integrations live. | — |

### UX Goals

| Capability | Status | Implementation | Gap Register |
|---|---|---|---|
| Intuitive, beginner-friendly interface | ✅ Done | AI-driven storyboard generation from a single text prompt. 3-panel workspace. shadcn/ui component system. | — |
| Fast load time, no installation required | ✅ Done | Vite bundle + Cloudflare Workers edge delivery. No desktop app required. | — |
| Responsive design (desktop-first, tablet support) | ⚠️ Partial | Tailwind responsive utilities. Studio workspace is desktop-first; no documented tablet breakpoint layout for the editor panels. | — |

---

## Training Materials & SCORM — Build Strategy

Per the platform's HR-vertical-marketing positioning, corporate L&D and indie course creators are first-class users. The build strategy for the Courses / SCORM vertical (gap-register entries #160–#168) is **"don't build a new authoring tool — re-purpose AI Studio."** Roughly 80% of what Articulate / Synthesia / iSpring sell is already shipped under a different label.

### Studio capabilities that map directly to training-material authoring

| Training need | Studio primitive (already shipped) | Reuse path |
|---|---|---|
| Lesson script generation | Storyboard generator with `purpose` enum (`resume` / `job_ad` / `company_promo` / `recruiter_brand` / `product_launch` / `personal_brand`) — see `studio.ts` | Add new `purpose: "course_lesson"` to the enum + a lesson-shaped scene template set. One-line schema delta. |
| Lesson section structure (intro / explain / example / summary) | 12+ existing scene types (`intro`, `talking-head`, `content-reveal`, `demo`, `testimonial`, `cta`, etc.) | Add scene types: `learning_objective`, `concept`, `worked_example`, `knowledge_check`, `summary`. |
| Narrated voiceover | `tts-engines.ts` (Web Speech / Kokoro / Piper / VibeVoice) + `VoiceoverPanel.tsx` per-scene script | Already complete. Voice clones can be re-used as "instructor voice" assets. |
| Captions + accessibility | `caption-renderer.ts` (4 styles incl. word-by-word), Whisper transcription, SRT/VTT export, `studioCaptions` table | Already complete. WCAG AA compliance gap (#168) is keyboard-trap + colour-contrast audit on the player chrome. |
| Branded chrome | `studioBrandKits` table + brand-kit CRUD + AI script injection of brand voice | Already complete. Becomes "Course brand kit" for L&D buyers without changing schema. |
| Lesson navigation / TOC | `studioChapters` table + `ChapterEditor.tsx` (auto-seeds from scene boundaries, `mm:ss` parser, YouTube-format export) | Already complete. Lesson-internal sections become chapters; module-level navigation needs a thin parent layer. |
| Lesson covers | `studioThumbnails` table + AI-scoring + `ThumbnailsDialog.tsx` (extracts 6 frames + LLM ranks) | Already complete. |
| Engagement hooks | `HookOptimizerDialog.tsx` (#143) — analyses retention + suggests first-3-second variants | Already complete. The hardest part of training video is the first 3 seconds; we already optimise it. |
| Knowledge checks embedded in video | `studioVideoForms` (#140) — gate playback, capture answers, mirror to `marketingLeads` for the unified inbox | Repurpose: `formType: "knowledge_check"` with answer keys + scoring instead of lead-capture. ~50 lines of schema additions. |
| SME review workflow | `studioReviewComments` + `studioReviewLinks` (#145) — Frame.io-style threaded time-pinned comments, anonymous review via tokenized share link | Already complete. Becomes "instructional-designer review" workflow for L&D teams. |
| Engagement analytics | `studio_video_heatmap` (#122) — per-second viewing data, drop-off detection, viewer reverse-lookup | Already complete. Course completion + drop-off-by-second is exactly the Sana / Synthesia analytics dashboard. |
| Async assessments | `studioAsyncInterviews` + `studioAsyncResponses` (#98) — recorder + reviewer, transcription | Repurpose: webcam-based oral-exam assessments with rubric scoring. |
| Skills demo videos | `studioSkillsDemos` (#120) — screen + webcam recording with AI-generated teleprompter | Already complete. Becomes "skill-practice" lesson type. |
| Final assessment | `skillAssessments` + `assessmentAttempts` (#76) — timed attempts, AI grading for short-answer/code, badge issuance, public verify | Already complete. Becomes the "final exam" leading to certification. |

### What's actually net-new for SCORM / training (the real gap)

| Need | Status | Estimate |
|---|---|---|
| Course → Module → Lesson hierarchy schema (`courses` / `course_modules` / `course_lessons` / `course_enrollments` / `course_certificates`) | 🔲 Open #160 | M |
| SCORM 1.2 + 2004 package generator + player (zip with `imsmanifest.xml`, content tracking via `cmi.*` set/get API) | 🔲 Open #161 | L — full spec implementation |
| xAPI / Tin Can statement emitter (course + lesson + assessment events → LRS endpoint) | 🔲 Open (sub of #161) | M |
| Learning path / prerequisite chaining | 🔲 Open (sub of #160) | S |
| Verifiable certificate issuance (`/verify/:certId` public page, signed payload, optional Accredible/Credly) | 🔲 Open #165 | M |
| LMS integrations (Cornerstone / Workday Learning / SuccessFactors / Docebo / TalentLMS connectors) | 🔲 Open (new) | L — per provider |
| Course authoring teams + reviewer roles | 🔲 Open #167 | M — extends #145 review pattern |
| PowerPoint → eLearning conversion | 🔲 Open #163 | M — server-side LibreOffice headless or client-side slide-to-image + OCR |

### Comparable AI / training-authoring tools — competitive positioning

| Tool | Positioning | Pricing | Strengths | Where we win |
|---|---|---|---|---|
| **Articulate 360** (Storyline + Rise) | Gold-standard authoring tool for L&D pros | $1,099/seat/yr | 20-yr maturity, gigantic asset library, every L&D buyer knows it | AI scripting (we have it), creator rev-share (we have it), web-native (they're partly desktop). |
| **Adobe Captivate** | Desktop authoring | $33.99/mo | Adobe ecosystem integration, VR + 360° | Web-native, AI-first, no Adobe subscription |
| **iSpring Suite** | PowerPoint-based authoring | $770/yr | Familiar to PowerPoint users | True authoring vs. slide-deck wrapper, AI generation from text prompts |
| **Synthesia** | AI avatar training videos | $30–$96/mo | Best-in-class avatars, 140+ languages | Real voice cloning (#121), custom brand chrome, web-native player, creator rev-share, ATS / Recruiter context |
| **HeyGen** | AI avatar video, similar to Synthesia | $24+/mo | Strong consumer-friendly UI | Same as Synthesia |
| **Vyond** | Animated explainer videos | $49+/mo | Cartoon-style explainers | We're live-action + avatar, more flexible |
| **Sana** | AI-native LMS (host + author + analytics) | Enterprise | Modern UX, AI-throughout | Native creator monetisation; Sana doesn't pay creators |
| **Coassemble** | Scenario-based authoring | $70+/mo | Quick-build microlearning | We're broader (course + cert + LMS-export) |
| **Cornerstone / Docebo / TalentLMS** | Hosting LMSs | $50–$300+/seat | Distribution to enterprise L&D buyers | Integrate, don't compete — be the authoring tool that exports SCORM/xAPI to all of them. |

### Strategic positioning: "Articulate + Synthesia + LMS-export in one — and you keep 95% of every sale"

The wedge against every competitor in the table above is the same as it is against LinkedIn: **none of them pay the creator**. Articulate buyers pay seat licenses to Articulate; Synthesia buyers pay seat licenses to Synthesia; the actual instructional designer doesn't get a cut when their course is sold. We do.

**Pricing model under the existing token + 95/5 framework:**
- Authoring sits inside Pro at $9.95/mo. Token-metered AI is the cost driver — generating a 10-minute course consumes proportionally.
- SCORM / xAPI export is a Pro-only feature (no extra fee) — this is the export gate.
- Per-certificate issuance fee (~$1–$2 each) for cert programs — covers the verify-URL infrastructure + signed payload.
- Public course sales: 95/5 like everything else. Buyer pays course price + CC processing; creator keeps 95%.

### Suggested phasing

- **Phase 0 — schema + Studio purpose extension** (S, ~1 week): add `course_lesson` purpose to storyboard generator + lesson-shaped scene types + course/module/lesson tables. Authoring works; nothing exports yet.
- **Phase 1 — knowledge checks + final assessment wiring** (S, ~1 week): repurpose `studioVideoForms` for in-video knowledge checks + chain `skillAssessments` as the course final.
- **Phase 2 — SCORM 1.2 export** (M, ~2 weeks): static `imsmanifest.xml` generator + zip packaging. Most LMSs accept 1.2; 2004 + xAPI come after.
- **Phase 3 — certification + verify URL** (S, ~1 week): cert issuance signed payload + public `/verify/:certId` page.
- **Phase 4 — LMS integrations** (L, ongoing): Cornerstone + Docebo + TalentLMS connectors. One per release cycle.
- **Phase 5 — xAPI + 2004 + LRS** (M, ~2 weeks): only if/when an enterprise customer needs them.

---

## AI CHRO (AI Assistant)

The AI CHRO (Chief Human Resources Officer) is the platform's embedded AI assistant. Role-aware, context-sensitive career/hiring/workforce guidance.

### Architecture

```
User (browser)
  └─ AIChatPanel.tsx          ← Chat UI: sliding panel, history, copy, session tracking
       └─ ai-service.ts       ← Frontend service: sends to /api/ai/chat
            └─ /api/ai/chat   ← Hono route: session management, DB persistence
                 └─ ai.ts     ← callLLMWithMessages() → OpenRouter (Gemini Flash 1.5)
```

**Tables** (`schema/ai.ts`): `ai_chat_sessions`, `ai_chat_messages`, `ai_usage_records`

### System Prompt (3 layers)

1. **Base CHRO persona** — talent acquisition, career development, workforce strategy, HR analytics, employer branding, compliance
2. **User profile context** — name, role, plan (injected from `useAuth()`)
3. **Page context** — auto-detected from URL via `detectContextFromRoute()` (e.g. `/resumes/edit/:id` → resume editing context)

### Usage Limits

- Free: 50,000 tokens/month (`FREE_AI_MONTHLY_TOKENS`), enforced client-side + server-side
- Pro: 5,000,000 tokens/month fair-use cap (`PRO_AI_MONTHLY_TOKENS`)
- Top-up packs available via `TOKEN_PACKS` SKUs in `shared/pricing.ts`
- Client check in `ai-service.ts`; server check via `checkTokenBudget` middleware
- Note: legacy `FREE_AI_MONTHLY_LIMIT` (request-count) is being phased out — see Phase 1 of pricing rework

---

## Email System (SendPulse)

### Architecture

```
Route handler (auth.ts, account.ts)
  └─ getEmailProvider()       ← factory returns SendPulseEmailProvider
       └─ sendEmail()         ← OAuth2 token → SMTP API call (fire-and-forget via waitUntil)
```

### Templates

| Template | Trigger |
|----------|---------|
| Verification | Registration |
| Password reset | Forgot password |
| 2FA code | Login with 2FA enabled |
| Team invitation | `POST /api/account/invite` |
| Magic link | `POST /api/auth/magic-link` |
| Onboarding drip (3 emails) | Day 0/3/7 via cron |

### Env Variables

`EMAIL_CLIENTID`, `EMAIL_SECRET` (SendPulse OAuth), `EMAIL_FROM`, `FRONTEND_URL`

---

## Authentication

### Supported Methods

| Method | Implementation |
|--------|---------------|
| Email/password | PBKDF2-SHA256 (100K iterations, 16-byte salt) |
| OAuth (Google, LinkedIn, GitHub, Microsoft) | `oauth.ts` OIDC flows via `PROVIDERS` map |
| Magic links | 32-byte token, 15-min expiry |
| Passkeys/WebAuthn | FIDO2/ES256 via Web Crypto API (no external deps) |
| 2FA | HMAC-SHA1 TOTP (RFC 6238) |

### JWT Structure

```typescript
interface JwtPayload {
  sub: string;           // userId
  email: string;
  roles: string[];
  emailVerified: boolean;
  mustChangePassword: boolean;
  companyId?: string;
  isSuperAdmin?: boolean;
  emu?: boolean;         // impersonation token
  emuBy?: string;        // superadmin userId
}
```

### OAuth Env Variables

`GOOGLE_CLIENT_ID/SECRET`, `LINKEDIN_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET`, `MICROSOFT_CLIENT_ID/SECRET`

---

## SuperAdmin Impersonation

Allows superadmins to impersonate any user for debugging. Implementation in `services/impersonation.ts` + `routes/superadmin/`.

### Flow

1. SuperAdmin selects user → `POST /api/admin/impersonate/sessions` (mandatory reason)
2. Server issues impersonation JWT with `emu: true`, `emuBy: superadminId`, `emuSid: sessionId`
3. All actions during session logged to `impersonation_audit_log`
4. Read-only mode available (`emuReadonly: true`)
5. End session → `DELETE /api/admin/impersonate/sessions/:id`

### Permission Debugger

`GET /api/admin/impersonate/debug-permissions/:userId` — returns full permission tree: roles, features, billing tier, module access, with `allowed/denied/reason` per check.

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
| `studio.ts` | POST /save-draft, /publish, /storyboard, /generate-image, /edit-script, /upload, /brand-kits, /campaigns, /videos/:id/view, /videos/:id/cta-click; GET /projects, /public/:videoId, /videos/public, /videos/resume/:resumeId, /videos/user/:userId, /status/:projectId, /brand-kits, /ad-templates, /campaigns, /videos/:id/embed, /videos/:id/analytics; DELETE /projects/:projectId; PATCH /projects/:projectId/status, /projects/:projectId/visibility; POST /projects/:id/clone | ✅ Complete | 1,716 lines — largest route file |
| `studio-features.ts` | GET /tts/voices, /captions/:projectId, /linkedin/auth-url, /linkedin/accounts, /coaching/:recordingId, /interview/questions, /interview/sessions, /skills-demos, /skills-demos/user/:userId, /voice-clones, /async-interviews, /async-interview/invite/:token, /async-interview/:id/responses, /analytics/:videoId; POST /tts/generate, /tts/generate-all, /captions/generate, /linkedin/callback, /linkedin/publish, /linkedin/post, /recording/upload, /recording/:id/transcribe, /coaching/analyze, /ats/generate, /interview/questions/seed, /interview/session, /skills-demo, /skills-demo/generate-script, /voice-clones, /async-interview, /async-interview/:id/respond, /async-interview/:id/submit, /analytics/track; PATCH /interview/session/:id, /skills-demo/:id; DELETE /voice-clones/:id; GET /ats/:slug | ✅ Complete | 1,451 lines — TTS, captions, LinkedIn, webcam, coaching, ATS, interview practice, skills demos, voice cloning, async interviews, heatmap analytics |

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
| `linkedin-post.ts` | POST /linkedin-post | ✅ Complete | LinkedIn post generation; full OAuth flow now in `studio-features.ts` |
| `locations.ts` | GET /countries, /states, /cities, /search | ✅ Complete | Reference data |
| `og.ts` | GET /v/:videoId | ✅ Complete | Open Graph metadata |
| `task.ts` | GET /, /:id; POST /save, /:id; DELETE /:id | ✅ Complete | Task management |
| `featureflag.ts` | GET / | ✅ Complete | Orphaned duplicate `feature-flag.ts` deleted; static flag evaluation |
| `hubs.ts` | GET/POST /notifications, POST /notifications/negotiate | ✅ Complete | SSE stream live; `POST /negotiate` returns transport descriptor |
| `marketing.ts` | GET /campaigns, /leads; POST /campaigns, /leads | ✅ Complete | Real DB tables wired — see Gap Register #38 |

#### Auth Extensions

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `oauth.ts` | GET /:provider, /:provider/callback; POST /magic-link; GET /magic-link/verify, /linked-accounts, /sessions; DELETE /unlink/:provider, /sessions/:id, /sessions; POST /add-password | ✅ Complete | Google, LinkedIn, GitHub, Microsoft OIDC flows; magic links; session management |
| `passkeys.ts` | POST /register/begin, /register/complete, /login/begin, /login/complete; GET /credentials; DELETE /credentials/:id | ✅ Complete | Full FIDO2/WebAuthn — CBOR parsing, DER→raw sig conversion, clone detection |

#### Notifications & Real-time

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `notifications.ts` | GET /, /unread-count, /smart; POST /mark-all-read, /:id/mark-read; DELETE /:id | ✅ Complete | Smart priority ranking (Premium) via `GET /smart` |

#### Calendar & Scheduling

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `calendar.ts` | GET /events, /events/:id, /availability, /connections, /connect/:provider, /connect/:provider/callback; POST /events, /availability, /sync, /interview-slots, /book-interview; PATCH /events/:id; DELETE /events/:id, /availability/:id, /connections/:id | ✅ Complete | Google + Outlook OAuth; two-way calendar sync; interview slot generation |

#### Outreach & Follow-ups

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `followups.ts` | GET /sequences, /sequences/:id, /enrollments; POST /sequences, /enroll, /trigger; PATCH /enrollments/:id/:action; DELETE /sequences/:id | ✅ Complete | Multi-step outreach sequences; behaviour-triggered enrollment |

#### Assessments

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `assessments.ts` | GET /, /:slug, /me/results, /users/:userId/badges; POST /:slug/start, /attempts/:attemptId/submit | ✅ Complete | Timed skill tests with AI grading; public badge display |

#### ATS & Integrations

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `ats.ts` | GET /connections; POST /connections, /sync/:connectionId, /webhook/:provider; DELETE /connections/:id | ⚠️ Partial | HMAC-verified webhook; provider API calls are stubs pending dev credentials |

#### Performance Management

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `performance.ts` | GET /cycles, /cycles/:id, /reviews, /goals; POST /cycles, /reviews, /goals; PATCH /cycles/:id/complete, /reviews/:id/submit, /reviews/:id/acknowledge, /goals/:id, /goals/:id/progress; DELETE /goals/:id | ✅ Complete | OKRs, review cycles, employee sign-off |

#### Onboarding & Hiring

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `onboarding-hiring.ts` | GET /offers, /offers/:id, /checklists, /checklists/:id; POST /offers, /offers/:id/send-for-signature, /offers/webhook/dropbox-sign; PATCH /offers/:id/send, /offers/:id/accept, /offers/:id/decline, /checklists/:id/tasks/:taskId/complete; DELETE /offers/:id | ✅ Complete | Offer letters + Dropbox Sign e-signature; HMAC-verified webhook |

#### Discovery & Smart Job Board

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `discovery.ts` | GET /talent-feed, /talent-feed/:userId, /jobs, /jobs/:id/similar, /seo/resume-guide/:jobSlug, /seo/salary/:jobSlug, /creators/leaderboard, /creators/products; POST /creators/products | ✅ Complete | Algorithmic talent feed; NL job search; SEO content engine with 24h cache |

#### White-label & B2B

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `whitelabel.ts` | GET /tenants, /tenants/:id, /portal/:subdomain, /tenants/:id/analytics, /roi-calculator; POST /tenants, /demo-request; PATCH /tenants/:id | ✅ Complete | Multi-tenant portals; ROI calculator; university/bootcamp tenant types |

#### Ads & Analytics

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `ads.ts` | GET /config; POST /ads/impression | ✅ Complete | Ad-free flag for Premium; impression tracking |
| `analytics.ts` | POST /beacon, /ads/impression; GET /usage, /time-to-hire, /hiring-metrics | ✅ Complete | DAU/WAU/MAU, feature adoption, ad CTR, time-to-hire (Premium) |

#### API Keys & Exclusive Boards

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `apikeys.ts` | GET /; POST /; DELETE /:id; PATCH /:id | ✅ Complete | SHA-256 hashed keys shown once at creation; Premium tier |
| `exclusive-boards.ts` | GET /exclusive, /exclusive/:id, /bids; POST /bids; DELETE /bids/:id; PATCH /bids/:id/accept, /bids/:id/reject | ✅ Complete | Premium exclusive job boards with bidding/auction |

#### Auto-Apply & Job Scraper

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `auto-apply.ts` | POST /start; GET /matches | ✅ Complete | LLM tailors cover letter + resume per job; Premium-gated |
| `jobscraper.ts` | Admin: GET /, POST /, PATCH /:id, DELETE /:id, POST /:id/sync, GET /:id/logs; User: GET /, POST /, PATCH /:id, DELETE /:id | ✅ Complete | RSS + JSON API sources; SHA-256 dedup; cron-driven sync |

#### Apply Button & Community

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `apply-button.ts` | GET /snippet, /:jobId/meta; POST /track | ✅ Complete | Embeddable `<script>` tag; lead capture; public routes |
| `community.ts` | GET /posts, /channels; POST /posts; DELETE /posts/:id | ✅ Complete | Company community feed with channel-based discussions |

#### OpenAPI & Sitemap

| Route File | Endpoints | Status | Notes |
|-----------|-----------|--------|-------|
| `openapi.ts` | GET /openapi.json, /docs | ✅ Complete | OpenAPI 3.1 spec; `/docs` redirects to Swagger UI |
| `sitemap.ts` | GET /sitemap.xml | ✅ Complete | Dynamic XML sitemap for SEO |

### Services

| Service | Lines | Status | Notes |
|---------|-------|--------|-------|
| `email.ts` | 576 | ✅ Complete | `EmailProvider` interface + SendPulse implementation; sends verification, reset, 2FA, resend emails |
| `ai.ts` | 83 | ✅ Complete | `callLLM()` / `callLLMJson()` with Zod schema validation; OpenRouter wrapper |
| `account.ts` | 300 | ✅ Complete | Organization/team management business logic |
| `job.ts` | 278 | ✅ Complete | Job management: create, update, archive, search |
| `company.ts` | 84 | ✅ Complete | Company CRUD, follow/unfollow, trending |
| `settings.ts` | 76 | ✅ Complete | User preference read/write |
| `billing.ts` | 378 | ✅ Complete | Real DB queries for subscriptions, invoices, payment methods, AI usage |
| `jobscraper.ts` | 231 | ✅ Complete | RSS + JSON API scraper, SHA-256 dedup, sync scheduling |
| `stripe.ts` | 106 | ✅ Complete | Top-level Stripe helper used by payment routes |
| `payment/` | — | ✅ Complete | Strategy pattern: `types.ts` interface + `stripe.ts` (full) + `helcim.ts` (⚠️ stub) + `index.ts` factory |

### Database Schema (~230 tables across 52 schema files in `/api/src/db/schema/`)

All tables are defined and schema migrations managed via Drizzle Kit.

| Domain | Tables |
|--------|--------|
| Users & Auth | `users`, `userProfiles`, `userRoles`, `roles`, `passwordHistory`, `twoFactorCodes`, `emailVerificationTokens`, `passwordResetTokens`, `refreshTokens`, `userConnections`, `magicLinkTokens`, `oauthAccounts`, `apiKeys` |
| WebAuthn / Passkeys | `webauthnCredentials`, `webauthnChallenges` |
| Companies & Orgs | `companyProfiles`, `userCompanyRoleAssociations`, `companyFollowers`, `accountInvitations`, `accountPreferences`, `companySubscriptions`, `employerBrandingPages` |
| Resumes | `resumeInformation`, `resumeTemplates`, `watchedResumes`, `metaResumes` |
| Jobs | `jobItems`, `jobPreferences`, `jobApplications`, `savedJobs`, `jobAlerts`, `jobWebsites`, `jobBoardSources`, `jobBoardSyncLog` |
| Video & Studio | `videos`, `videoResumes`, `studioProjects`, `youtubeAccounts`, `studioBrandKits`, `videoAnalytics`, `videoCampaigns` |
| Recruiter | `recruiterTalentPools`, `talentPoolCandidates`, `candidateInteractions`, `candidateSubmissions`, `placements`, `jobBoards`, `jobBoardPostings`, `recruiterAgentRuns`, `savedSearches`, `exclusiveBoards`, `boardBids` |
| Messaging | `conversations`, `conversationParticipants`, `messages`, `messageReadReceipts`, `emailTemplates`, `emailCampaigns`, `emailCampaignRecipients`, `communicationTracking` |
| Outreach & Follow-ups | `followUpSequences`, `followUpSteps`, `followUpEnrollments`, `followUpLogs` |
| Social | `feedPosts`, `feedPostLikes`, `feedPostComments` |
| Interviews | `interviewSessions`, `interviewAnswers`, `interviews`, `applicationNotes` |
| Assessments | `skillAssessments`, `assessmentAttempts` |
| Calendar & Scheduling | `calendarConnections`, `scheduledEvents`, `availabilitySlots` |
| Onboarding & Hiring | `offerLetters`, `onboardingChecklists`, `onboardingTasks` |
| Performance | `performanceCycles`, `performanceReviews`, `performanceGoals` |
| ATS Integration | `atsConnections` |
| Affiliate | `affiliateProfiles`, `affiliateReferrals`, `affiliateConversions`, `affiliatePayouts`, `affiliateTiers`, `affiliateLinkClicks` |
| Billing | `subscriptionPlans`, `subscriptions`, `paymentMethods`, `invoices`, `invoiceLineItems`, `refundRequests`, `billingEvents`, `usageRecords` |
| Analytics | `profileViews`, `activityLogs`, `requestLogs`, `dashboardMetrics`, `userEngagementMetrics`, `aiUsageRecords`, `aiChatSessions`, `aiChatMessages` |
| Productivity | `tasks`, `boards`, `notifications`, `queueJobToResume`, `queueJobToProcess` |
| Locations | `countries`, `stateProvinces`, `cities`, `postalZipCodes` |
| White-label | `whitelabelTenants` |
| System | `systemSettings`, `marketingLeads`, `featureFlags` |

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
| | `POST /api/match/tailor` | AI-rewrite resume for job (returns `tailoredResume` JSON + `changes[]` + `markdownResume`) | ResumeInformation | ✅ |
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
| **SalaryCalculatorController** | `POST /api/salarycalculator/analyze` | AI salary analysis (qwen3-coder; deterministic fallback on LLM outage) | — | ✅ `routes/salary.ts` → `services/salary/handlers.ts` |
| | `POST /api/salarycalculator/negotiation-tips` | AI negotiation strategies (gemma-4-31b; canned fallback on LLM outage) | — | ✅ |
| | `GET /api/salarycalculator/locations` | Supported locations | — | ✅ |
| | `GET /api/salarycalculator/industries` | Supported industries | — | ✅ static catalog in `routes/salary.ts` |
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
- **Tailor & Generate** — calls `POST /api/match/tailor` to rewrite the resume; the response carries both a `tailoredResume` (JSON Resume) and a `markdownResume` preview, with a `changes[]` list of before/after justifications. Score improvement (`oldScore` → `newScore`) is shown inline.
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

Open gaps, the full product roadmap, and implementation status are tracked in the [Consolidated Gap Register](#consolidated-gap-register) below.

---

## Strategic Moats

| Moat | What it is |
|---|---|
| **Data** | Resumes, jobs, interactions, videos, match scores — proprietary training signal |
| **AI** | Scoring, matching, tailoring, mock interviews, sentiment — keeps improving with usage |
| **Network** | Candidates + recruiters + companies on one platform — liquidity begets liquidity |

Lean into distribution (Chrome extension + shareable links), automation (autonomous agent), and network effects (marketplace) to compound all three.

---

## Creator Monetization Roadmap — "Generate & Get Paid"

**Goal:** turn hired.video into a full creator economy where users generate content (resumes, video configs, voices, courses, articles) and earn either per-sale or from engagement pools. Reuses the Voice Clone Marketplace pattern (implemented 2026-04-07) for visibility / listing / licensing.

### Content types and monetization model (updated 2026-04-20)

| Type | Surface | Monetization model | Status |
|---|---|---|---|
| Voice Clones | `/studio?tab=voice` | Per-sale, **95% creator / 5% platform + CC fee to buyer** | ✅ Shipped (rev share flipped 20→5% on 2026-04-20) |
| Resume Templates | `/resumes` + `/marketplace/templates` | Per-sale, 95/5 + CC | 🔲 Opt-in/consent flow pending |
| AI Video Resume Templates | `/studio` | Per-sale, 95/5 + CC | 🔲 Opt-in/consent flow pending |
| Custom Resume Videos / Creator Services | `/services` | Per-sale (escrow), 95/5 + CC (was 15% on promo) | ✅ Backend shipped 2026-04-07; 5% flip 2026-04-20 |
| Courses / SCORM / Certifications | `/courses` (planned) | Per-sale, 95/5 + CC; better than Udemy/Pluralsight | 🔲 New vertical — roadmap opened 2026-04-20 |
| Articles & Writing (Partner Program) | `/blog` (currently editorial; user-authored pending) | **Engagement-based pool**, paid as gift cards, $50 min / 60-day hold | 🔲 New vertical — roadmap opened 2026-04-20 |
| Affiliate Network | TBD | Referral revshare + in-content affiliate links (scope TBD) | 🔲 Scope pending |

### Unified rev-share rules (decided 2026-04-20)

- **Default creator share:** 95%. Platform takes 5%. CC processing fee is passed to the buyer at checkout — it does not reduce the creator's 95%.
- **Configurable per user:** the split is not a global constant. A per-user `creatorPlatformFeeBpsOverride` (null → use default) can be set by superadmin. The rate in effect at opt-in is **snapshotted onto each listing** and governs that listing until the creator re-accepts updated terms. Rate changes are prospective only; historical sales retain the snapshot split on the license-grant row.
- **ToS pinning:** the version of Creator Terms in effect at opt-in is captured in `legal_document_acceptances` with IP + UA + timestamp (existing infra, 2026-04-07).
- **Universal publishing, earn-gated:** any user (free or paid) can author and publish. **Only users with the active $9.95/mo Pro/Creator subscription** can receive payouts — the same tier that grants 1M AI tokens is the earn-gate across every content type.
- **Payout thresholds (Partner Program + Affiliate Network):** $50.00 minimum balance, 60-day hold window after the earning period closes. Per-sale creator payouts (voice/template/course/service) follow the standard payment-provider cadence separately.

### Articles — Partner Program model (decided 2026-04-20)

Medium-style engagement-based payouts. Not per-sale.

- **Pool funding:** **0.5% of paid-subscriber revenue** is allocated to the writer pool each period. Per-engagement-unit payout resolves to fractions of a penny, scaling up as the platform grows.
- **Engagement signals counted:** authenticated-account read-time, claps, and shares. Anonymous/bot/unauth reads are excluded.
- **Moderation:** no human gate. AI classifier (reuses the Claude API integration) screens for profanity and low-quality content at publish time; failed content does not accrue payable engagement.
- **Payout form:** gift cards (e.g. Tremendous / Tango Card rails), $50 min, 60-day hold.

### Creator-facing analytics + quality signals (decided 2026-04-20)

Apply universally to every content type in the creator economy — articles, resume templates, AI video templates, voice clones, services, courses, certifications.

- **User ratings** — 1–5 stars + optional review text on every published item. Aggregate star average + count surfaced on the listing card and in the creator's dashboard.
- **Views / traffic** — impression counts (marketplace card shown) and detail-view counts (listing opened).
- **Time on page** — dwell time per detail view.
- **Scroll depth** — how far down the reader/buyer scrolled.
- **Heatmap** — click / tap / cursor aggregation on the content surface.

All five signals are **surfaced back to the creator** in the `/creators/dashboard` analytics tab. Ratings + traffic also feed the featured-creator ranking (#180) and the Article Partner Program engagement pool (#171).

### Official vs. community content distinction (decided 2026-04-20)

hired.video-authored content (published by Sean Hogg / any superadmin user) must be **visually and programmatically distinguishable** from community-authored content.

- Official content carries an **"Official" badge** (wordmark + checkmark) on listing cards, detail pages, and search results.
- Community content carries an **"Author: @handle"** attribution with link to the creator profile.
- Marketplace filter / toggle: "All · Official · Community" across every content type.
- Data model: `authorType` enum (`platform` | `community`) on every listing row, derived at publish time from the publishing user's superadmin role (or an explicit admin-set override for platform-owned content seeded by scripts).

### Gamification — points economy (decided 2026-04-20)

- Points earned from course/content completions, streaks, and engagement actions.
- **Redeemable into "Campaign $"** (advertising/boost credits spent on the Promotion subsystem). Not redeemable for cash.
- Points → Campaign $ conversion rate is **snapshotted on the user's account at signup / Partner-Program opt-in** (same prospective-only pattern as rev share). Global default rate TBD.

### Content Promotion / Boosts (new subsystem)

- Creators can **promote their own content** (articles, courses, templates, voice clones, services) via paid placements.
- Pay with **USD or redeemed Campaign $** (from gamification points).
- Requires extending the existing jobs-only ads schema (`adCampaigns`, `adSets`, `ads`) with a **polymorphic `contentType`+`contentId` target** — currently `jobId`/`companyId` FKs.

### Product surfaces (original template-focused set, still valid)

| # | Surface | Route | Who sees it |
|---|---------|-------|-------------|
| 1 | Marketing page — "Earn as a Creator" | `/creators/earn` | Anonymous + logged-in |
| 2 | Template Marketplace (artifact browser) | `/marketplace/templates` + Home section | Everyone |
| 3 | Resume template engine (render + publish) | `/resumes/:id?template=:slug` + `/studio/templates` | Authenticated |
| 4 | Video-config template publisher | `/studio/projects/:id/publish-as-template` | Authenticated + `creatorProfiles.isActive` |
| 5 | Creator dashboard (earnings + stats) | `/creators/dashboard` | Creators |
| 6 | Articles publisher + Partner Program opt-in | `/articles/new` + `/creators/partner-program` (planned) | Authenticated + AI-classifier pass |
| 7 | Course authoring hub (SCORM, AI-generated, PPT import, screen recorder) | `/courses/new` (planned) | Authenticated |
| 8 | Campaign $ wallet + boost checkout | `/creators/campaign-dollars` (planned) | Creators |

### Template format decision

Surveyed how other platforms do this:

| Platform | Approach | Trade-off |
|---|---|---|
| Resume.io / Kickresume | Fixed React components per `templateId` | Fast, but only staff can ship templates |
| JSON Resume (`jsonresume.org`) | Standard JSON schema + Handlebars/Pug theme packages | Open ecosystem, but theme = npm pkg (code exec) |
| Notion / Framer | JSON tree of blocks (layout + styles) | Declarative, user-authorable, safe to render |
| Webflow / Canva | Proprietary visual JSON schema | Designer-friendly, no free text in templates |
| Substack / Beehiiv | MDX/HTML with `{{variable}}` markers | Simple, but risky (XSS, arbitrary HTML) |

**Decision: adopt the JSON Resume schema as the canonical resume data shape, plus a declarative JSON "layout descriptor" for templates** (sections, order, style tokens, variable bindings like `{{basics.name}}`). A React renderer walks the descriptor — no code execution, safe to publish user-generated templates. Existing `resumeInformation.content` already stores flexible JSONB, so no destructive schema change.

```
ResumeData (JSON Resume) ──► TemplateDescriptor (JSON) ──► <ResumeRenderer/> ──► PDF / HTML / share link
                                         ▲
                             published by creator, licensed by buyer
```

### Database additions (two migrations)

Mirrors `studioVoiceClones` + `studioVoiceCloneLicenses`:

```
resumeTemplateListings      -- adds visibility/listingSlug/priceCents/platformFeeBps/tags to resumeTemplates
videoTemplates              -- NEW: name, description, storyboardSnapshot (JSONB), promptTemplate, purpose, userId
videoTemplateListings       -- visibility, listingSlug, priceCents, platformFeeBps, playCount, purchaseCount
templateLicenses            -- unified: userId, templateType ('resume'|'video'), templateId, source, pricePaidCents, creatorCutCents, platformCutCents, paymentRef
```

Fee split: **5% platform / 95% creator** + CC processing fee passed to the buyer at checkout (matches voice marketplace `platformFeeBps=500` as of 2026-04-20). Rate is configurable per user via `users.creatorPlatformFeeBpsOverride` (superadmin-settable) and snapshotted onto each listing at opt-in time — see "Unified rev-share rules" above.

### API routes (backend)

| Route | Purpose |
|---|---|
| `GET /api/marketplace/templates` | Public feed: filter by type/purpose/role/price, full-text search, sort by trending/new/top |
| `POST /api/marketplace/templates/:id/license` | Purchase or claim-free; writes `templateLicenses`, triggers creator payout accrual |
| `POST /api/resumes/:id/render` | Takes `templateId` + resume JSON → renders to HTML/PDF |
| `POST /api/studio/projects/:id/save-as-template` | Snapshots storyboard + prompt → `videoTemplates` |
| `POST /api/studio/templates/:id/apply` | Clones template into new `studioProjects` row for buyer |
| `GET /api/creators/earnings` | Aggregates from `templateLicenses` + `studioVoiceCloneLicenses` + existing promo escrow |
| `POST /api/creators/payout` | Reuses `creatorProfiles.payoutProvider` (Stripe/Helcim already wired) |

### Frontend work

| Component | Lives in | Notes |
|---|---|---|
| `EarnAsCreatorPage` | `frontend/pages/EarnAsCreator.tsx` | Follows `Pricing.tsx` layout. Earnings calculator, 3 case studies, tier matrix (Free publisher / Pro creator / Verified creator) |
| `TemplateMarketplacePage` | `frontend/pages/TemplateMarketplace.tsx` | Grid + facet filters (type, role, purpose, price). Reuses `Jobs.tsx` search pattern |
| `HomeTemplateSection` | `frontend/components/home/TemplateSection.tsx` | Carousel of 8 trending templates on `Home.tsx` (logged-in + logged-out) |
| `ResumeRenderer` | `frontend/components/resume/ResumeRenderer.tsx` | Walks `TemplateDescriptor`, substitutes `{{…}}` tokens, Tailwind-only styles |
| `PublishAsTemplateDialog` | `frontend/components/studio/PublishAsTemplateDialog.tsx` | Title, description, tags, price, visibility, ToS consent |
| `CreatorDashboard` | `frontend/pages/CreatorDashboard.tsx` | Earnings chart, top templates, payout history. Extends existing dashboard loader |

### Phased rollout

| Phase | Timeline | Scope |
|---|---|---|
| **Phase 1 — Foundation** | Week 1 | Migrations, `ResumeRenderer`, port 3 built-in resume templates to descriptor format |
| **Phase 2 — Publish flow** | Week 2 | `PublishAsTemplateDialog` for resumes + videos, marketplace feed API, homepage section |
| **Phase 3 — Marketing + discovery** | Week 3 | `EarnAsCreatorPage`, full marketplace page with search/filters, SEO structured data |
| **Phase 4 — Monetization** | Week 4 | License purchase flow, creator payout accrual, earnings dashboard, first-run onboarding for creators |
| **Phase 5 — Quality** | Week 5 | Template review/moderation queue, abuse reports, featured/trending algorithm, analytics |

### Reuse matrix (what already exists)

- ✅ Creator payouts: `creatorProfiles` + Stripe/Helcim (built for promo videos)
- ✅ License ledger pattern: `studioVoiceCloneLicenses` (copy to `templateLicenses`)
- ✅ Marketplace routes precedent: `routes/creators.ts`
- ✅ Resume JSONB storage: `resumeInformation.content`
- ✅ Storyboard snapshot: `studioProjects.storyboard` (JSONB ready to clone)
- ✅ Token/billing gating: `checkAIUsage`, `requirePremium`
- 🔲 `videoTemplates` table, renderer, marketing page, homepage section, marketplace UI

### Phase 1 first-pass: static vs declarative decomposition

Before building any marketplace, we need the renderer. Reference resume: `91b07dfb-24f2-47da-ac76-326292184c66` (viewable at `/resumes/:id` full-page, and `/embedded/resumes/:identifier` as an embed inside job/people profiles).

**Static (fixed platform chrome — never templated):**

| Piece | Why it stays static |
|---|---|
| `Sidebar`, `Navigation`, `Footer` in `ResumeDetail` | Platform IA — consistent across the app |
| `AuthOverlay` blur + sign-up prompt for anonymous users | Platform paywall, not a template concern |
| Privacy badge (`public` / `recruiter_only` / `connections` / `private`) | Derived from user record, not template data |
| `ResumeActionsMenu` (edit / add media / share / download / change privacy / promote / delete) | Owner-only platform actions |
| `ResumeTimelines` cross-section tabs (Work+Education+Volunteer merged) | Platform-level analytical view, not user-authored content |
| Video carousel (merges `resume.metaData` videos + `studioVideos` from Studio API) | Logic-heavy — studio service integration, YouTube URL conversion, index state |
| `MetadataModal` + "Add Media" flow | Platform CRUD, only visible to owner |
| Toast notifications + loading/404 states | Platform UX |
| Embedded-mode removal of chrome (`EmbeddedResume` page) | Platform decision based on route, not template |

**Declarative (controlled by template descriptor — marketplace can publish these):**

| Piece | Template-controlled |
|---|---|
| Hero layout | `split` (2-col with video) / `stacked` / `compact` |
| Hero gradient colors + accent color | theme tokens |
| Whether to show avatar / contact buttons / summary / video in hero | booleans |
| Section order | explicit array in descriptor |
| Section enablement (work, education, skills, languages, projects, volunteer, awards, certificates, publications, interests, references) | booleans |
| Section title override (e.g. "Career" instead of "Work Experience") | string |
| Section icon (whitelist of lucide icons) | string key |
| Section layout variant | `timeline` / `cards` / `grid` / `list` / `compact` |
| Grid column count for grid layouts (skills, languages, interests) | 1 / 2 / 3 / 4 |
| Whether to expand highlights by default | boolean |
| Sort order for each section | `date_desc` / `date_asc` / `manual` |
| Card style | `elevated` / `flat` / `bordered` / `ghost` |
| Section title size | `sm` / `md` / `lg` / `xl` |

### Descriptor schema (v1.2)

v1.2 adds **component blocks** — any reusable React component (e.g. `ResumeTimelines`) can be dropped into the descriptor's `sections` array alongside data-backed section blocks. Adding a new component to the registry is a one-line change in `frontend/lib/resume-template-components.ts`.

```ts
type ResumeBlock = SectionBlock | ComponentBlock;

interface ComponentBlock {
  kind: "component";
  component: "career-timeline";    // whitelist key
  enabled: boolean;
  id?: string;                     // for sidebar referencing; defaults to component key
  title?: string;                  // optional heading; omit for headless widget
  icon?: TemplateIconKey;
  props?: Record<string, unknown>; // component-specific options
}
```

Sidebar referencing (`layout.sidebar`) is now `string[]` of block ids — accepts either a section key (`"skills"`) or a component id (`"career-timeline"`), so components can live in the sidebar just like sections.

Currently registered components:

| Key | Backed by | Purpose |
|---|---|---|
| `career-timeline` | `ResumeTimelines` | Cross-section Overview / Work / Volunteer / Education / Certificates tabs with totals |



After reviewing competitor template galleries (Resume-Now, Kickresume, Canva), v1's pure layout toggles weren't enough — industry templates differ by **named style bundles**: font family, heading style, color palette, document vs. hero mode, single vs. two-column. v1.1 adds these dimensions:

```ts
type SectionKey = "work" | "education" | "volunteer" | "skills" | "languages"
  | "projects" | "awards" | "certificates" | "publications" | "interests" | "references";

type ThemeKey = "hired-purple" | "iron-gray" | "balanced-blue" | "trusted-taupe"
  | "assertive-asphalt" | "warm-amber" | "executive-navy" | "minimal-slate";

interface ResumeTemplateDescriptor {
  id: string;
  name: string;
  industry?: string;                                     // display label
  version: "1.1";
  documentMode: "hero" | "print";                        // gradient header vs. paper document
  theme: {
    themeKey: ThemeKey;                                  // named palette (pre-baked Tailwind classes)
    fontFamily: "sans" | "serif" | "mono";
    headingStyle: "underlined" | "divider" | "caps" | "plain";
    density: "compact" | "comfortable" | "spacious";
    cardStyle?: "elevated" | "flat" | "bordered" | "ghost";
    sectionTitleSize?: "sm" | "md" | "lg" | "xl";
  };
  layout: {
    columns: 1 | 2;                                      // 2 = sidebar + main
    sidebar?: SectionKey[];                              // which sections go in the sidebar
  };
  hero: {
    enabled: boolean;
    layout: "split" | "stacked" | "compact";
    showAvatar: boolean;
    showContactButtons: boolean;
    showSummary: boolean;
    showVideo: boolean;
  };
  sections: Array<{
    key: SectionKey;
    enabled: boolean;
    title?: string;
    icon?: string;                                       // whitelist key
    layout: "timeline" | "cards" | "grid" | "list" | "compact";
    columns?: 1 | 2 | 3 | 4;
    showHighlights?: boolean;
    sortBy?: "date_desc" | "date_asc" | "manual";
  }>;
}
```

**Themes are pre-baked** Tailwind class bundles — not dynamic interpolation — since Tailwind JIT can't see template strings. Registry: `frontend/lib/resume-template-themes.ts`.

### Industry presets shipped

| ID | Industry | Document mode | Theme | Font | Headings | Columns |
|---|---|---|---|---|---|---|
| `hired-default` | All | hero | hired-purple | sans | plain | 1 |
| `payroll-iron-gray` | Finance / Payroll | print | iron-gray | serif | divider | 2 (sidebar: skills/edu/certs/lang) |
| `risk-asphalt` | Risk / Consulting | print | assertive-asphalt | sans | caps | 2 (sidebar: skills/lang/certs) |
| `executive-taupe` | Executive / C-Suite | print | trusted-taupe | serif | divider | 1 |
| `intern-education-first` | Intern / New Grad | print | balanced-blue | sans | underlined | 1 (education first) |
| `hospitality-amber` | Hospitality / Retail | print | warm-amber | sans | caps | 1 |
| `creative-minimal` | Creative / Product | print | minimal-slate | mono | plain | 1 |

The `hired-default` reproduces the current `ResumeDetail` pixel-close (gradient hero, timeline sections, split video). Print-mode presets render a paper-style document (centered name + contact line, no gradient, section headings per theme style).

### Sample resume + Template Gallery

A canonical showcase resume lives at [frontend/lib/sample-resume.ts](hired.video/frontend/lib/sample-resume.ts) — real content derived from a user-submitted JsonResume file, enriched across every section (Skills / Languages / Certificates / Projects / Awards / Interests) so every template block renders meaningfully regardless of which preset is applied. This file is the single source-of-truth for all template previews.

**Template Gallery** on Home ([components/resume-renderer/TemplateGallery.tsx](hired.video/frontend/components/resume-renderer/TemplateGallery.tsx)) — grid of `TemplateCard`s, each rendering a miniature live preview of the sample resume in that template (via a scaled `DeclarativeResumeRenderer`, not a static image, so previews stay in sync with descriptor changes). Mounted on both authenticated and marketing variants of Home.

Each card offers:
- **Preview** → `/resumes/VIEWER/sample?template=:id` — opens the viewer with the sample resume and pre-selected preset
- **Use Free** (when `priceCents === 0`) → unlocks immediately via `unlockTemplate()` in [lib/template-unlocks.ts](hired.video/frontend/lib/template-unlocks.ts)
- **Add to Cart** (when `priceCents > 0`) → pushes a `type: "template"` item into the existing cart context; standard checkout flow applies

Unlocks are tracked client-side in `localStorage` as a first pass; server-backed ownership (`templateLicenses` table) lands with the marketplace phase.

### Preview route

- `GET /resumes/VIEWER/:id` — first-pass preview page:
  - Loads the same resume via the three fallback endpoints (`getResumeById` → `getResumeForEmbed` → `getPublicResume`)
  - Renders `<DeclarativeResumeRenderer resume descriptor />` against a default descriptor that matches `ResumeDetail`
  - "Template" dropdown lists all industry presets
  - "Export" dropdown offers PDF, Word (.doc), Plain Text, Raw JSON
  - Right-side drawer with a live descriptor JSON editor — tweak and re-render instantly
  - Retains platform chrome (Sidebar, Navigation, Footer, AuthOverlay for logged-out)
- `GET /resumes/VIEWER/:id?print=1` — bare print variant:
  - No chrome, no toolbar — just the rendered resume
  - Auto-calls `window.print()` 400ms after load
  - Reads descriptor from `sessionStorage` under `resume-descriptor:{id}` so the caller's selected template survives the new-window hop
- The same `<DeclarativeResumeRenderer>` will later back `ResumeDetail`, `EmbeddedResume` (compact variant), and marketplace previews — one renderer, three hosts.

### Export formats

| Format | Mechanism | Bundle impact |
|---|---|---|
| **PDF** | Opens `?print=1` in a new window → auto-triggers browser print-to-PDF | zero |
| **Word (.doc)** | Emits Word-compatible HTML with MS Office XML namespaces, served as `application/msword` — Word opens it as a fully-styled document. True `.docx` would need a library (docx/html-docx-js); skipping for first pass. | zero |
| **Plain Text (.txt)** | JS serializer walking `ResumeData` — bulleted sections, headings, date ranges | zero |
| **Raw JSON (.json)** | `JSON.stringify(resume.data, null, 2)` | zero |

All four are implemented in `frontend/lib/resume-exporters.ts`. PDF export stashes the current descriptor in `sessionStorage` before opening the print window so the template selection survives the new-tab hop.

### Open questions (decide before Phase 1)

1. Do user-published resume templates require review before public listing, or auto-publish with report/takedown? (Voice marketplace auto-publishes — precedent says yes.)
2. Should template price be creator-set or platform-tiered ($0 / $4.99 / $9.99 / $19.99)? Tiered is simpler for tax and reduces race-to-zero.
3. Do we gate *selling* behind Pro ($9.95/mo), or allow free users to list with higher platform fee (e.g. 30% free / 20% Pro)?
4. PDF rendering path — server-side Puppeteer on CF Workers is not viable; need a separate Node service or third-party (react-pdf, DocRaptor).

### Success metrics

- GMV from template licenses (monthly)
- Creator activation rate (users who publish ≥1 template / total Pro users)
- Template application rate (licenses acquired / marketplace views)
- Top-of-funnel: anonymous visits to `/creators/earn` → signups

---

## Go-Live Readiness — CxO Gap Analysis

Executive view of what blocks production launch, organized by functional owner. Each finding cross-references the detail entries in the Consolidated Gap Register below. Last updated **2026-04-25**.

**Overall verdict:** The platform is **feature-rich and architecturally sound**, but launch readiness is gated by a tight cluster of legal, payout, and observability gaps that are individually small but collectively non-negotiable. The fastest path to live is a **scoped Day-1 launch** focused on the Pro / job-seeker / employer path, deferring the creator-monetization rails (articles, courses, partner program) until the payout pipeline is real.

### CEO — Strategic Readiness

**Strong**
- Positioning is coherent post-AI-CHRO redesign (#93). One product anchor ("your AI CHRO") that the rest of the surface area hangs off.
- Pricing is decisive: Free + Pro at $9.95/mo with itemized token packs ($3.99–$199.99). No Enterprise upsell to manage at launch.
- 95/5 rev-share standardised across every monetisation surface (#156). Creators see the same number everywhere.

**Risks**
- **Surface-area sprawl.** The roadmap covers jobs, recruiter CRM, ATS, video studio, voice marketplace, creator services, courses, articles, ad campaigns, partner program, outplacement, white-label, and B2B sales persona. No public commitment yet to a Day-1 wedge — "we ship everything" creates a positioning that doesn't fit a single buyer.
- **Bus factor.** Most P0/P1 surfaces are single-author. Recommend a written ownership map per surface before launch.
- **No public roadmap or changelog** for users; everything lives in this README.

### CFO — Revenue, Billing, and Payouts

**Strong**
- Payment provider abstraction with both **Stripe and Helcim** implementations (#47). Switchable via env var.
- Annual billing with 20% discount, 14-day trial, churn/cancellation/pause flow, AI usage metering, ad revenue tracking, seat-based company billing — all wired (#21–#67).
- Token-based AI metering replaces per-request rate limiting. Itemised token pack purchases live.

**Risks (go-live blockers)**
- **No payout pipeline.** `creator_profiles.payout_provider` + `payout_account_id` fields exist, but the route just stores a string — Stripe Connect onboarding flow is **not wired**. Aggregate `totalEarnedCents` accrues forever; nothing releases funds to creators. **Block:** ship Connect onboarding + a min-payout-threshold scheduled worker before letting creators monetise.
- **No 1099 / W-9 / VAT compliance** in scope. US creators with >$600 lifetime payouts will trigger 1099-NEC requirements; international creators trigger W-8BEN; EU buyers trigger VAT MOSS. None handled.
- **Sales tax** on token packs and subscription is not visibly computed. Stripe Tax integration not detected.
- **#96 Enrichment credits** marketed as a Pro add-on but external provider is stubbed. Either ship behind a feature flag or hide the marketing.

### CTO — Engineering & Operations

**Strong**
- Drizzle schema is event-log first, polymorphic where it matters (reviews 0032, boosts 0034, feed subjects 0033). ~230 tables, 75+ migrations.
- BillingFacade + AccessPolicy split (#150) gives clean tier vs. audience semantics.
- OpenAPI 3.1 spec at `/api/openapi.json`, structured JSON logging, KV + in-process caching with explicit invalidation.
- TS strict across `api/`, `frontend/`, and `shared/`. Clean compile at the time of writing.
- Hono on Cloudflare Workers — predictable cold-start, predictable cost.

**Risks**
- **Test coverage gap (#1, still Open).** Only the BillingFacade/AccessPolicy module and a handful of tool handlers have unit tests (~264 passing). Most route handlers have **no automated coverage at all** — TS strict + manual smoke is the only safety net. **Block:** before launch, add at least smoke-level integration tests against `createApp()` for auth, billing, resume CRUD, job CRUD, and the creator opt-in flow.
- **No real-time transport.** `#41` (WebSocket chat) still Open. Recruiter↔candidate messaging works over REST but has no presence/typing/instant delivery. Acceptable for v1 if you set the expectation.
- **No background payout / reconciliation worker.** Cron exists for follow-ups, drip emails, and job-board scraping. Nothing yet for creator payouts (see CFO).
- **No documented runbook** for DB backup/restore, incident response, or secret rotation. Repo has the code; ops procedures are tribal.
- **Single-region.** Cloudflare Workers + Hyperdrive provides edge cache, but Postgres is single-region. Latency tail for APAC users is unmeasured.

### CPO — Product Completeness

**Strong**
- **Creator Program (post-2026-04-25 refactor #190)** is now coherent: per-program enrollment for Video / Voice / Services with proper event-log lifecycle, per-program legal terms, and a single management surface at `/services`.
- **Studio** has near-complete Wistia/Riverside parity per the capability matrix earlier in this README.
- **AI CHRO copilot** is the strongest single product surface and a clear anchor for the homepage CTA.
- **Marketplace + UnifiedSearch** integration (#191–#194) consolidated three previously-separate surfaces (Sell Hub, Creators browse, Search) into one navigation node.

**Risks**
- **Voice/Resume/Video template creator opt-in flows (#158, #159)** still Open. Voice clones already have a consent flow; templates do not. Creators can't yet monetise resume or video templates.
- **Courses (#160–#168)**, **Articles + Partner Program (#170–#175)**, and **Affiliate Network (#178)** are entirely greenfield. They should not be marketed at launch.
- **Pitch-deck reviewer feedback loop (#184–#186)** is the missing half of the agency v1 product. Don't market agency-tier without it.
- **Universal content rating widget (#181)** — backend done, no React widget. Listing cards have no social proof.
- **Outplacement (#100)** and **B2B Sales Persona (#104)** are P1/P2 but irrelevant to Day 1.

### CMO — Marketing Readiness

**Strong**
- Landing pages, Pricing, and Marketplace categories are **internally consistent** and accurate to current implementation (audited 2026-04-25 — see verdict in this PR's marketing audit).
- AI CHRO branding is coherent across `Index.tsx`, the chat panel header, and the system prompt.
- Marketplace category list matches `UnifiedSearch` filter pills exactly.

**Risks**
- **SEO content engine (#81)** is technically Done but light on editorial voice. Auto-generated resume/salary guides are SEO furniture, not authoritative content. No editorial cadence is defined.
- **Affiliate program (#74)** ships with tier math but creator-facing analytics are limited.
- **`isPlatformService=true` not yet flipped** on any seeded service. The "Enroll in Creator Program" funnel CTA on `/search?category=services` will not appear until SuperAdmin sets the flag on the curated offerings.
- **No public press / launch plan** in repo. Founder/marketing-lead handover gap.

### General Counsel — Legal & Compliance

**Strong**
- Centralised legal-document system (`legal_documents` + `legal_document_acceptances`) with versioning + IP/UA/context capture is **the right primitive** and already covers Voice Marketplace ToS §9a.
- Per-program creator terms scaffolded (`program_video_terms`, `program_voice_terms`, `program_services_terms`).

**Risks (go-live blockers)**
- **Placeholder terms text.** `0036_creator_programs.sql` seeds three program-terms documents whose body is literally `"Placeholder ... program terms. Update via the legal admin UI before going live."` **Block:** real lawyer-reviewed text must replace the placeholders before the wizard goes to creators.
- **§9b–§9f ToS additions still Open (#179).** Course Creator, Cert Issuance, SCORM Licensing, Writer Partner, Affiliate Network — all need text + acceptance flows. Not Day-1 if those products are deferred (see CPO).
- **Candidate share consent + GDPR audit (#186) Open.** Required for EU/UK/California operation if the agency redacted-share feature ships.
- **Content reporting / abuse path (#152) Open.** No user-facing way to report spam, impersonation, or inappropriate content. Required for any UGC platform under §230 / DSA.
- **Cookie consent + privacy preferences** exist (`privacyPreferences` table, cookie-preferences migration 0025) but the granular consent UX has not been audited against EU/UK requirements.

### CISO — Security & Trust

**Strong**
- Passkeys / WebAuthn (#65) implemented natively without external libs.
- OAuth providers wired for Google, LinkedIn, GitHub, Microsoft — secrets in Cloudflare env, no leaked credentials in repo.
- API keys hashed with SHA-256, key shown once.
- Password expiry (90d) + history (PBKDF2 last-5) + magic links.
- `ApiClient` Zod-validates every response (caught the `isCreator` strip bug in this session).

**Risks**
- **No external pen test** in repo. SOC 2 / SSO / data residency are listed as roadmap, not on Pricing.tsx — fine for SMB launch but blocks any enterprise deal.
- **Secret rotation procedure** not documented.
- **Webhook signature verification** is implemented per-provider (Stripe, Helcim, Dropbox Sign) but lacks a consolidated audit / replay-attack test.
- **Rate limiting** beyond AI metering: not visible. Auth endpoints, signup, magic-link request — none have visible per-IP rate limits.
- **Single-region DB** (see CTO) is also a security/availability concern for compliance frameworks that require geographic redundancy.

### Top 10 Hard Go-Live Blockers (cross-functional)

In priority order — these are the items that, if shipped open, expose the company to revenue loss, legal liability, or material UX failure on Day 1.

| # | Blocker | Owner | Gap ref |
|---|---------|-------|---------|
| 1 | Replace placeholder creator-program terms with lawyer-reviewed text | GC | #190, #179 |
| 2 | Wire Stripe Connect onboarding + min-payout-threshold worker | CFO/CTO | (new gap) |
| 3 | Add 1099-NEC / W-8BEN / VAT collection for paying creators | CFO | (new gap) |
| 4 | Decide & flip `isPlatformService=true` on curated marketplace funnel offerings | CMO/CPO | #194 |
| 5 | Smoke-level integration test pack for auth/billing/resume/job/creator opt-in | CTO | #1 |
| 6 | Content abuse reporting path (`POST /api/reports`) | GC | #152 |
| 7 | Sales tax + VAT MOSS on token packs and subscription | CFO | (new gap) |
| 8 | Replace `#96` enrichment-credits stub OR feature-flag the marketing | CFO | #96 |
| 9 | Per-IP rate limiting on auth + magic-link + signup | CISO | (new gap) |
| 10 | DB backup/restore runbook + on-call escalation doc | CTO | (new gap) |

### Recommended Phased Launch

- **Phase 0 (now → 2 weeks)** — clear blockers 1, 4, 5, 6, 9, 10. Soft-launch to a beta cohort of paying Pro users only; creator monetisation initially limited to Articles (which need no payout rail until #172).
- **Phase 1 (2 → 8 weeks)** — Stripe Connect onboarding + min-payout-threshold worker (CFO blocker), Voice / Services creator monetisation flows, courses foundation (#160) on top of Studio reuse.
- **Phase 2 (8 → 16 weeks)** — SCORM 1.2 export (#161), Partner Program payouts (#172–#175), real-time chat (#41), enterprise/SSO if a customer pulls.

### LinkedIn-Comparable Scorecard

The CxO scorecard above measures absolute operational readiness. This second scorecard re-frames against the actual market comparable — **LinkedIn** — under the platform's positioning as "an HR-vertical marketing platform with native creator monetisation." Score = our capability ÷ LinkedIn's capability.

| Role | Score | Verdict |
|---|---|---|
| **CHRO** | **70%** | Recruiter parity surprisingly close — Boolean search (#70), saved searches, AI sourcing agent (#66), talent pool, ATS connectors (Greenhouse/Lever/Workday + merge.dev planned), sponsored job listings, seat-based company billing all in. Gaps vs LinkedIn Recruiter: depth of network graph (1B profiles) and "talent insights" market-report tier. |
| **CPO** | **55%** | Profiles, feed, messaging, jobs, articles, videos, ads-manager hierarchy (#108–#111), AI CHRO copilot, polymorphic reviews/boosts/feed-subjects all present. Missing vs LinkedIn: Learning (#160 in motion), Events, Newsletters, Sales Navigator. **Where we exceed:** every content type carries native rev-share at 95/5; LinkedIn pays creators $0 by default. |
| **CRO** | **45%** | Self-serve Pro subscription + token packs + 20% annual + 14-day trial + churn flow + paid placements (#106–#108) + ATS integrations + white-label demo lead form + ROI calculator. Missing: Sales-Navigator-style intent-data tier, multi-tier Recruiter Lite/Pro/Corporate matrix, large-account contract motion. |
| **CISO** | **35%** | Passkeys/WebAuthn native, OAuth ×4 providers, API keys SHA-256, password expiry/history, JWT + magic links, Zod-validated responses, Cloudflare WAF/DDoS by default. Missing vs LinkedIn-grade: SOC 2 / ISO 27001 attestations, formal pen-test cycle, public bug bounty, security-incident runbook. |
| **CFO** | **35%** | Modern subscription billing (Stripe + Helcim), token-pack metering, ad revenue tracking, seat-based company billing, AccessPolicy/BillingFacade split. Missing vs LinkedIn (which inherits Microsoft's SAP-grade backbone): Stripe Connect for creator payouts, 1099-NEC / W-8BEN, sales tax + VAT MOSS, multi-currency pricing, revenue-recognition automation. |
| **CTO** | **25%** | Edge-native architecture (Cloudflare Workers + Hyperdrive Postgres + R2) is more modern than LinkedIn's monolith. TS strict, OpenAPI 3.1 public, structured logging, polymorphic schema patterns. Cannot match: 20 years of ML pipelines, real-time feed ranking, multi-region datastores, content-moderation ML stack, search infra at 1B-profile scale. |
| **CMO** | **25%** | Marketing pages internally consistent, AI CHRO branding coherent, SEO content engine + auto-guides shipped. Cannot match: brand recognition (zero vs LinkedIn's "Microsoft trust halo"), 1B-user social proof, B2B ad-network footprint. |
| **CEO** | **20% raw / 95% on wedge** | **Raw market position 20%** — LinkedIn has 20 years of network-effect moat + Microsoft distribution. **Strategic wedge 95%** — creator rev-share + AI CHRO + course/training-material authoring is genuinely defensible because LinkedIn cannot pay creators or pivot to AI-native authoring without cannibalising its own ad-funded model. The structural conflict is the moat. |
| | | |
| **Avg (capability)** | **~40%** | We're at ~40% of LinkedIn's surface area with **one axis** where we structurally exceed them. |
| **Wedge defensibility** | **95%** | LinkedIn cannot easily flip to paying creators without breaking its ad business, nor pivot to AI-native course authoring without cannibalising LinkedIn Learning's instructor-fee model. Two reinforcing structural conflicts. |

**Three things hired.video does that LinkedIn structurally won't copy:**
1. **95/5 creator rev-share** on every monetisable content type (articles, voice clones, video templates, services, courses). LinkedIn pays creators $0 by default.
2. **AI CHRO as the headline product surface** — UX built around the AI, not bolted on.
3. **Studio-as-authoring-tool** — the same engine that produces a 30-second job pitch produces a 10-minute training course (see Training Materials & SCORM section above). LinkedIn Learning still relies on instructor-uploaded video without AI-native authoring.

**Three things LinkedIn has that no amount of code closes the gap on:**
1. **Network effect** — 1B profiles of professional-graph data.
2. **Microsoft distribution** — Teams / Outlook / Office integration.
3. **Enterprise security posture** — SOC 2 / ISO 27001 / dedicated security org / public bug bounty. Achievable for us, but a 12–18-month investment.

**Practical implication for marketing:** every surface should lead with **"keep 95% of what you make"** as the headline — not feature parity claims. The wedge collapses if creators don't actually receive money, so the CFO blocker (Stripe Connect + payout pipeline) becomes the single most important capability to ship.

---

## Consolidated Gap Register

Single source of truth for all implementation status, product roadmap phases, and priorities — including feature gaps, quality gaps, and architecture/cross-cutting concerns. Sorted by P0 → P4 (revenue impact).

**Current totals: 171 Done · 3 Partial · 165 Open · 339 Total** (last updated 2026-05-05 — closed #373 (Tool Run History "Copy Report" empty across 7 tools — every recordRun call site now produces a typed `NormalizedToolRunResult`; `extras` field rendered in panel + Copy Report; per-tool helpers extracted for the 3-handler pages); earlier 2026-05-05 — closed #341 (proxy-editor wiring), #344 (nested sequences), #345 (multicam group + angle switcher), #346 (relink-offline-media), #347 (media-bin search/filter/tags), #352 (advanced color: curves/HSL/secondary/power-window), #353 (audio FX rack: EQ/compressor/limiter/gate), and added background-render-off-main-thread (Web Worker encode pipeline). Opened follow-up gaps #355 (auto-proxy on upload), #356 (nested-clip audio recursion), #357 (multicam UX overlay + audio-waveform auto-sync), #358 (bin folder hierarchy). Earlier 2026-05-05 — #341–#353 opened from studio NLE audit vs Lightworks/EditShare-class capability framework: proxy-editor wiring gap, social export presets, batch render, nested sequences, multicam, relink-offline-media, media bin search, keyboard remap, workspace presets, automated QC, plugin SDK, advanced color tools, advanced audio FX. Distinct from #282–#293 NLE M2-M5 phasing — these are the specific feature deltas surfaced by the framework comparison. Prior 2026-05-04 update — #307 / #308 / #328 closed: Effects Pro-gate at picker, codec Pro-gate at render time, and `apiClient.get("/api/users/me")` callsites routed through the verification gate. — #276–#281 shipped, #282–#293 opened: Power-user NLE (Lightworks-class video editor) + sister-product roadmap landed. M1 closed end-to-end (#276 Timeline JSON foundation + migration 0067 + workspace-aware ownership; #277 single `/studio` host with kind-dispatched canvas + drag/drop / trim / split / transitions / keyboard shortcuts; #278 client-side WebCodecs render with audio AAC mux + cross-dissolve / fade-to-black; #279 R2 source persistence with sha256 dedup; #280 voice playback visibility; #281 VoiceCloneManager "coming soon" banner). M2–M5 phasing recorded in `memory/project_nle_decision.md` and tracked here as #282 (visual depth / colour / keyframes / VFX), #283 (Pro export + ProRes / 4K + stock music), #284 (real-time collab via OT), #285 (Lightworks-Pro parity — Total FX / Motion Graphics / Advanced Titles+Transitions / R3D / Custom Formats / 8K / advanced proxies / DAW export / advanced audio FX). #286 ffmpeg.wasm strategy implementation (effects-aware path), #287 Voice fix B (OpenVoice v2 transformers.js port), #288 Voice fix C (BYOK ElevenLabs — deferred per BYOK posture), #289 sizzle-reel magic template (built ON the NLE engine), #290 AI headshot generator, #291 channel page + profileMode + YouTube ingest (creator persona surface — see `memory/project_creator_persona_model.md`), #292 video-track audio mixing, #293 `profile_mode` column schema delta. Prior session [2026-05-01]: #272 shipped: InteractiveCanvas foundational layer (host-agnostic `RenderableElement` + `InteractiveCanvas` types, new `WebcamElement` kind, shared `<RenderableElementView>` / `<InteractiveCanvasView>` / `<InteractiveCanvasEditor>` components, resume sub-record schema fields + ATS export skip). #273-#275 opened as concrete per-host follow-up wiring (Resume editor/viewer mounts, Company, Profile + Job pages). #269–#271 shipped: Studio "Video XXX in every entity" rollout complete. #269 polymorphic `(subjectKind, subjectId)` linking on `studio_projects` + Studio `?subject=` deep-link bootstrap + shared `studio-subject.ts` helper. #270 `<EntityVideos>` reusable scroller + `Create Video` chip + `Video Resume` action menu item, dropped into the Resume card. #271 same component into Profile / Job / Company cards (Skills Demo kind reserved in the enum for a future card surface). Prior session [2026-04-27]: entries #206–#268 added from Loxo Professional gap analysis. 60 net-new Loxo-parity gaps spanning configurable workflow engine, sourcing UI shell, placements with splits/fees/back-office, taxonomies (Tags / Job Type / Rejection / Diversity / etc.), granular hiring-manager portal permissions, compliance workspace, and B2B integrations (Okta / SAML / Workday / Xero / RingCentral). #266 AI Notetaker and #268 Contact Resolver tracked but delegated to BurnRateOS sister product per [docs/prd/integrations-and-sourcing.md](hired.video/docs/prd/integrations-and-sourcing.md); #267 per-action credit ledger marked Done — superseded by token-bucket pricing (#94, $9.95 + 1M tokens decided 2026-04-11). Full mapping + roadmap in [docs/prd/loxo-parity-recruiter-platform.md](hired.video/docs/prd/loxo-parity-recruiter-platform.md). Prior session [2026-04-26]: entries #202–#205 added from Pricing-page validation — YouTube publishing (#202), AI LinkedIn post generation (#203), tier-based priority job matching ranking (#204), Video & profile analytics Pro gating (#205).)

**Phases:** `Now` = 0–30 days · `Soon` = 30–60 days · `Mid` = 60–120 days · `Later` = 6–12 months

**Types:** `billing` = revenue enforcement · `feature` = product capability · `arch` = architecture · `quality` = code quality · `legacy` = legacy parity

**Positioning:** *"LinkedIn + Loom + ATS + AI Copilot — in one platform"*

| # | Status | Phase | Priority | Type | Gap | Notes |
|---|--------|-------|----------|------|-----|-------|
| 21 | ✅ Done | Now | P0 | `billing` | **Subscription tier enforcement** | `checkAIUsage` added to `value-proposition.ts` (4 endpoints) and `POST /api/ai/context`. `resume-scorer`, `resume-optimizer`, `salary.ts`, `match.ts` already gated. `checkTeamSize` on invite creation. |
| 22 | ✅ Done | Now | P0 | `billing` | **Salary calculator gated to Premium** | `POST /analyze` and `POST /negotiation-tips` guarded by `requirePremium`. `GET /industries` intentionally public. |
| 23 | ✅ Done | Now | P0 | `billing` | **AI message personalisation tiers** | `POST /api/messages/personalize` — template for free, LLM for Premium, AI usage recorded. |
| 24 | ✅ Done | Now | P0 | `billing` | **Priority / AI-enhanced job matching** | `POST /api/match/insights` (Premium) — skill gaps, career trajectory, interview tips, ramp time. |
| 25 | ✅ Done | Now | P0 | `billing` | **Team size / admin user limits** | `checkTeamSize()` called on `POST /api/account/invite`. Free accounts blocked at `FREE_TEAM_MEMBER_LIMIT`. |
| 26 | ✅ Done | Now | P0 | `billing` | **Advanced video templates** | `GET /api/studio/templates` — 3 free (720p) + 5 Premium (1080p). |
| 49 | ✅ Done | Now | P0 | `billing` | **Ad-free enforcement for Premium** | `GET /api/ads/config` returns `{ adsEnabled: false }` for Premium users. Frontend suppresses all ad slots on this flag. |
| 47 | ✅ Done | Soon | P0 | `quality` | **Helcim payment provider** | `services/payment/helcim.ts` — full Helcim API v2 integration, OAuth token caching, HMAC-SHA256 webhook verification, HelcimPay.js card tokenization. Needs `HELCIM_ACCOUNT_ID` + `HELCIM_API_TOKEN` secrets. |
| 55 | ✅ Done | Now | P0 | `billing` | **In-product upgrade prompts + usage meters** | `GET /api/billing/usage-summary` returns AI usage, team seat count, feature availability flags. Frontend consumes to show paywalls and progress meters. |
| 56 | ✅ Done | Now | P0 | `billing` | **Annual billing option (20% discount)** | `POST /api/billing/subscribe` with `interval: yearly` applies `priceYearly` from plan (20% off). Creates subscription with 365-day period + invoice. |
| 57 | ✅ Done | Now | P0 | `billing` | **Trial period (14 days)** | `POST /api/billing/trial/start` creates `status=trialing` subscription + trial notification. `getSubscription` treats `trialing` as Premium. One trial per user enforced. |
| 58 | ✅ Done | Now | P0 | `billing` | **Churn / cancellation flow** | `POST /api/billing/pause` (30-day pause), `POST /api/billing/downgrade` (drop to free). Enhanced cancel route shows retention options. |
| 40 | ✅ Done | Now | P1 | `feature` | **Shareable "Hire Me" public profiles** | `GET /api/users/:id` returns profile + `publicVideos[]` + `publicResumeCount`. Visibility-conditional. Each profile = free SEO page + viral loop. |
| 43 | ✅ Done | Now | P1 | `feature` | **Magic links (passwordless login)** | `POST /api/auth/magic-link` + `GET /verify?token=` — 32-byte token, 15-min expiry, issues JWT. |
| 45 | ✅ Done | Now | P1 | `quality` | **Direct messaging complete** | `GET /inbox`, `POST /conversations`, `GET /conversations/:id`, send + read receipts. |
| 54 | ✅ Done | Now | P1 | `feature` | **AI visitor/prospect chat widget** | `POST /api/chat/visitor` (public) — LLM FAQ bot with email lead capture into `marketingLeads`. Static fallback if no API key. Zero external scripts. |
| 42 | ✅ Done | Now | P1 | `feature` | **OAuth / Social Login (Google + LinkedIn)** | Backend fully implemented in `oauthRoutes` (`PROVIDERS` map). Needs `GOOGLE_CLIENT_ID/SECRET` + `LINKEDIN_CLIENT_ID/SECRET` as Cloudflare secrets. Zero code changes required. |
| 9  | ✅ Done | Now | P1 | `feature` | **LinkedIn OAuth full flow** | `linkedin` provider in `PROVIDERS` map — OIDC flow, profile import on sign-up. Needs `LINKEDIN_CLIENT_ID/SECRET` env vars. Zero code changes required. |
| 61 | ✅ Done | Now | P1 | `billing` | **Referral programme UI** | `ReferralBanner` component added to `DashboardWrapper` — shown to all authenticated users. Fetches referral code from `affiliateService.getProfile()`, shows copy-link button, dismissable via localStorage. Links to `/affiliate-program` for full details. |
| 62 | ✅ Done | Now | P1 | `billing` | **In-app billing event notifications** | `GET /api/billing/notifications` returns alerts: trial ending (≤3 days), cancellation scheduled, AI usage ≥90%. Frontend polls this to show banners. |
| 48 | ✅ Done | Now | P1 | `feature` | **Ad slot components — free tier** | `AdSlot` component placed in `Dashboard` (dashboard-banner) and `Jobs` (jobs-banner). Component renders nothing for Premium users; dev placeholder when slot IDs missing. |
| 59 | ✅ Done | Soon | P1 | `billing` | **Freemium activation / onboarding email drip** | `lib/onboardingDrip.ts` auto-creates 3-step sequence and enrolls user on register (`waitUntil`). Cron in `scheduled.ts` delivers emails at day 0/3/7. |
| 60 | ✅ Done | Soon | P1 | `feature` | **Resume/profile AI score free preview** | `/api/resume-scorer/score` now returns `overallScore + grade` free; full breakdown (ATS, keyword, categories, recommendations) Premium-only. |
| 41 | 🔲 Open | Mid | P1 | `feature` | **Real-time chat (recruiter ↔ candidate)** | REST message layer done (#45). Remaining: WebSocket transport via Cloudflare Durable Objects or Pusher — infrastructure + frontend. |
| 68 | ✅ Done | Mid | P1 | `feature` | **GitHub + Microsoft OAuth** | `github` + `microsoft` providers in `PROVIDERS` map (`oauth.ts`). GitHub fetches primary verified email from `/user/emails`. Microsoft uses Graph API. Needs `GITHUB_CLIENT_ID/SECRET` + `MICROSOFT_CLIENT_ID/SECRET` env vars. Zero code changes required. |
| 69 | ✅ Done | Mid | P1 | `feature` | **"Apply with hired.video" embeddable button** | `GET /api/apply-button/snippet` — returns self-contained JS that replaces `[data-hired-apply]` elements with branded purple buttons. `POST /api/apply-button/track` — lead capture (email + jobId) + redirect to signup. `GET /api/apply-button/:jobId/meta` — job metadata for button label. All routes public. Employers paste one `<script>` tag. |
| 70 | ✅ Done | Mid | P1 | `feature` | **Boolean / advanced recruiter search** | `POST /api/search/recruiter` — Boolean query parser (`AND`/`OR`/`NOT`/quoted phrases → PostgreSQL `tsquery`), skill filters, location, experience level. `GET/POST/DELETE /api/search/saved` — saved searches CRUD. `savedSearches` table added to `recruiter.ts` schema. |
| 17 | ✅ Done | Mid | P2 | `feature` | **Time-to-hire analytics** | `GET /api/analytics/time-to-hire` (Premium) — avg days to placement, per-job breakdown, monthly trend from `placements`. |
| 27 | ✅ Done | Mid | P2 | `billing` | **Advanced dashboard analytics + AI insights** | `POST /api/dashboard/ai-insights` (Premium + AI usage gated) — 30-day funnel metrics → LLM narrative insights, recommendations, risk flags. |
| 30 | ✅ Done | Mid | P2 | `billing` | **AI-powered smart notifications** | `GET /api/notifications/smart` (Premium) — scored by type weight + recency + unread bonus. |
| 38 | ✅ Done | Now | P2 | `quality` | **Marketing routes (campaigns + leads)** | `GET/POST /api/marketing/campaigns` + `/leads`, wired to real DB tables. |
| 39 | ✅ Done | Now | P2 | `quality` | **ProductDashboard SaaS metrics** | `GET /api/admin/` — real MRR/ARR/ARPU from DB. Time-series + standalone SaaS metrics endpoints. |
| 44 | ✅ Done | Soon | P2 | `feature` | **Security settings — active sessions** | `GET /api/settings/security/sessions` + `DELETE /:id` — refresh token session management. |
| 46 | ✅ Done | Now | P2 | `quality` | **Avatar upload validation** | `POST /api/users/me/avatar` — 5MB cap, jpg/png/gif/webp only, saves to `userProfiles.avatarUrl`. |
| 50 | ✅ Done | Mid | P2 | `feature` | **Sponsored job listings** | `sponsored`, `sponsoredUntil`, `sponsoredRankBoost` added to `jobItems` schema. Employers pay for top placement. |
| 51 | ✅ Done | Mid | P2 | `feature` | **Featured candidate profiles** | `featuredUntil` added to `userProfiles` schema. Job seekers pay one-off fee via Stripe. |
| 84 | ✅ Done | Now | P2 | `feature` | **API key management** | `schema/apikeys.ts` — prefix + SHA-256 hash; key shown once at creation. `GET/POST /api/apikeys`, `DELETE/PATCH /api/apikeys/:id`. |
| 85 | ✅ Done | Mid | P2 | `feature` | **Career progress tracking (job seekers)** | `GET /api/dashboard/career-progress` (Premium) — monthly application trend + interview practice scores. |
| 10 | ✅ Done | Mid | P2 | `feature` | **Full-text / faceted search** | `plainto_tsquery` full-text search added to `getPublicJobs` (title + description + company). All facet filters live. Add GIN index on `to_tsvector(...)` for scale. |
| 11 | ✅ Done | Mid | P2 | `feature` | **Calendar integration (Google / Outlook)** | `GET /api/calendar/connect/:provider` (Google/Outlook OAuth with `calendar.events` scope). `GET /api/calendar/connect/:provider/callback` (public, stores tokens). `POST /api/calendar/sync` — two-way sync: pushes unsynced platform events to Google Calendar API, marks `syncedToCalendar=true`. Refresh token stored in `calendarConnections`. |
| 13 | ✅ Done | Mid | P2 | `feature` | **Hiring & onboarding — offer letters, e-signature** | `POST /api/hiring/offers/:id/send-for-signature` (Premium) — creates Dropbox Sign embedded signature request, returns `signatureRequestId` + `signingUrl`. `POST /api/hiring/offers/webhook/dropbox-sign` (public) — HMAC-verified, marks offer `signed` on `signature_request_signed` event. Stubs gracefully if `DROPBOX_SIGN_API_KEY` absent. |
| 14 | ✅ Done | Mid | P2 | `feature` | **Performance management — OKR, reviews** | `PATCH /api/performance/goals/:id/progress` added (key results as JSONB, auto-complete at 100%). `PATCH /api/performance/reviews/:id/acknowledge` for employee sign-off. |
| 15 | ✅ Done | Mid | P2 | `feature` | **Automated outreach follow-ups** | `scheduled.ts` + `worker.ts` `scheduled()` export added. Cron processes due `followUpEnrollments`, sends email via provider, advances steps, marks complete. |
| 16 | ✅ Done | Mid | P2 | `feature` | **Hiring success metrics** | `GET /api/analytics/hiring-metrics` added with per-role pipeline conversion. Fully tracked from `jobApplications` + `placements`. |
| 19 | ✅ Done | Mid | P2 | `feature` | **Employer internal community — notifications** | `notifications` bulk-insert added on community post creation; notifies all company members except poster. Fire-and-forget. |
| 20 | ✅ Done | Mid | P2 | `feature` | **Exclusive job boards + bidding** | `PATCH /bids/:id/accept` (admin) activates job posting, notifies bidder. `PATCH /bids/:id/reject` with reason. Auction loop complete. |
| 28 | ✅ Done | Mid | P2 | `billing` | **Advanced interview scheduling + automation** | `POST /api/calendar/interview-slots` — reads recruiter availability windows + proposes open slots for next N days (default business hours fallback). `POST /api/calendar/book-interview` — creates `scheduledEvents` record, fires calendar sync, notifies candidate via `notifications`. |
| 29 | ✅ Done | Mid | P2 | `billing` | **Smart outreach campaigns** | `POST /api/followups/trigger` added — resolves sequence by ID/name/trigger-name, deduplicates active enrollments, computes `nextSendAt` from first step delay. |
| 63 | ✅ Done | Mid | P2 | `feature` | **Employer branding pages** | `employerBrandingPages` schema: hero video URL, headline/subtitle, culture statement, values, perks, media gallery, team highlights, awards, brand colour, `isPublished`. `GET /api/companies/:id/branding` (public). `PATCH /api/companies/:id/branding` (owner only, upsert). |
| 64 | ✅ Done | Mid | P2 | `feature` | **ATS integrations (Greenhouse, Lever, Workday)** | `atsConnections` schema (provider, apiKey, webhookSecret, config, lastSyncAt). `GET/POST/DELETE /api/ats/connections` (company owner only). `POST /api/ats/sync/:connectionId` — pulls candidates from provider (stub + real path). `POST /api/ats/webhook/:provider` (public) — HMAC-verified inbound events from Greenhouse/Lever/Workday. |
| 65 | ✅ Done | Mid | P2 | `feature` | **Passkeys / WebAuthn** | `webauthnCredentials` + `webauthnChallenges` schema. Full FIDO2/ES256 flow via Web Crypto API (no external deps). `POST /api/auth/passkey/register/begin|complete`, `POST /api/auth/passkey/login/begin|complete`, `GET/DELETE /api/auth/passkey/credentials`. CBOR authData parsing, DER→raw sig conversion, rpIdHash verification, signCount clone detection, JWT issuance on success. |
| 66 | ✅ Done | Mid | P2 | `feature` | **AI Recruiter Agent** | `recruiterAgentRuns` schema. `POST /api/recruiter/agent/source` — keyword-matches candidates from resumes DB, LLM scores each (0-100) + generates personalised outreach draft, returns ranked results. `GET /api/recruiter/agent/runs` + `/:id` — run history. Heuristic fallback if no API key. |
| 67 | ✅ Done | Mid | P2 | `billing` | **Employer seat-based billing** | `companySubscriptions` schema (planTier, seatCount, pricePerSeatCents, Stripe fields). `GET /api/billing/company/:id` — plan + seat usage vs. capacity. `PATCH /api/billing/company/:id/seats` — add/remove seats (starter $49/seat, team $39/seat, enterprise $29/seat). Upsert with monthly period tracking. |
| 79 | ✅ Done | Later | P2 | `feature` | **University / bootcamp partnerships** | `tenantType: "university"|"bootcamp"` in `whitelabelTenants`. `GET /api/whitelabel/tenants/:id/analytics` — placement rate, avg salary, active job listings (filtered by tenant). |
| 80 | ✅ Done | Later | P2 | `feature` | **B2B sales motion (agencies, staffing firms)** | `POST /api/whitelabel/demo-request` (public) — lead capture into `marketingLeads`. `GET /api/whitelabel/roi-calculator` — ROI estimate based on team size + placements/month (35% placement lift, 40% faster time-to-fill). |
| 6  | ✅ Done | Now | P3 | `arch` | **Structured logging** | `src/lib/logger.ts` — newline-delimited JSON to stdout for Cloudflare Logpush / tail workers. Wired into `app.onError`. |
| 7  | ✅ Done | Now | P3 | `arch` | **Dynamic feature flags** | DB-backed flags with per-user rollout %. `GET/PATCH /api/featureflag/:key`. 6 default flags seeded. |
| 31 | ✅ Done | Now | P3 | `legacy` | **CSV / Excel export** | `GET /api/settings/export?format=csv`. Legacy `/api/export/csv` + `/excel` redirect. |
| 32 | ✅ Done | Now | P3 | `legacy` | **Recruiter bulk operations** | `POST /api/recruiter/bulk/tags`, `/bulk/status`, `DELETE /bulk/delete`. |
| 33 | ✅ Done | Now | P3 | `legacy` | **Recruiter talent-pool export** | `GET /api/recruiter/talent-pool/export` — RFC 4180 CSV download. |
| 34 | ✅ Done | Now | P3 | `legacy` | **Password history validation** | `POST /api/passwordmanagement/validate-history` — PBKDF2 re-verify last 5 hashes. |
| 35 | ✅ Done | Now | P3 | `legacy` | **Password expiry check** | `GET /api/passwordmanagement/is-expired` — 90-day expiry, returns `{ isExpired, daysUntilExpiry }`. |
| 36 | ✅ Done | Now | P3 | `legacy` | **Resume diff / variation compare** | `GET /api/resumes/:id/diff?compareId=` — field-level diff + summary counts. |
| 37 | ✅ Done | Now | P3 | `legacy` | **Salary calculator `/industries` endpoint** | `GET /api/salarycalculator/industries` — 16 industries with subcategories. |
| 52 | ✅ Done | Now | P3 | `quality` | **Ad revenue reporting** | Impressions and clicks tracked via `POST /api/analytics/ads/impression`. Aggregated under `adMetrics` in `GET /api/analytics/usage`. |
| 53 | ✅ Done | Now | P3 | `quality` | **Feature adoption, usage analytics, click beacon** | `POST /api/analytics/beacon` (public) → `activityLogs`. `GET /api/analytics/usage` — DAU/WAU/MAU, top endpoints, error rate, ad CTR. |
| 3  | ✅ Done | Mid | P3 | `arch` | **Background job workers** | `scheduled.ts` processes `queueJobToProcess` pending items (retry with backoff, `send_email` dispatcher). `worker.ts` exports `scheduled()` for Cloudflare Cron Triggers. |
| 8  | ✅ Done | Mid | P3 | `arch` | **Caching layer** | `getSubscription()` now has 60s in-process Map cache + Cloudflare KV (`KV_CACHE` binding) for cross-instance caching. `invalidateSubscriptionCache()` called on all mutations. |
| 71 | ✅ Done | Mid | P3 | `feature` | **AI career copilot ("What should I do next?")** | `POST /api/dashboard/career-copilot` implemented — Premium + AI usage gated. Pulls last-30-day application + interview data, calls LLM to generate: `summary`, `actionItems` (4-5 tasks), `skillGaps`, `marketSignals`, `wins`, `nextReviewDate`. Static fallback if no API key. |
| 72 | ✅ Done | Mid | P3 | `feature` | **"Resume Roast" viral engine** | `ResumeRoast.tsx` now has three share actions after roast completes: (1) "Share on LinkedIn" — opens LinkedIn share intent with auto-generated post copy (score, strength, fix, hashtags); (2) "Post to Feed" (authenticated users) — creates a public Feed post with roast summary; (3) existing "Download Card" PNG. |
| 73 | ✅ Done | Mid | P3 | `feature` | **AI Mock Interview → pre-qualified candidates** | `POST /api/interview/sessions/:id/share` — generates a unique `shareToken`, marks session `isShared=true`, returns a public URL `/interview/shared/:token`. `GET /api/interview/public/:shareToken` — public endpoint (no auth) returning sanitised session summary: score, question count, per-question score + feedback. Schema: `shareToken` + `isShared` added to `interviewSessions`. |
| 74 | ✅ Done | Mid | P3 | `feature` | **Affiliate program scaling** | `affiliateTiers` schema (Bronze 10%→Silver 15%→Gold 20%→Platinum 25% + recruiter bonuses). `affiliateLinkClicks` per-click tracking table. Rebuilt `affiliates.ts` with real DB: profile auto-create, tier calculation, click tracking `POST /click` (public), leaderboard, payout request ($50 min). |
| 75 | ✅ Done | Later | P3 | `feature` | **White-label / agency tier** | `whitelabelTenants` schema (subdomain, branding, planTier, customDomain). `GET/POST /api/whitelabel/tenants`, `PATCH /api/whitelabel/tenants/:id`. `GET /api/whitelabel/portal/:subdomain` (public branding). ROI calculator `GET /api/whitelabel/roi-calculator`. |
| 76 | ✅ Done | Later | P3 | `feature` | **Candidate assessments / skills tests** | `skillAssessments` + `assessmentAttempts` schema. `GET /api/assessments` (public browse), `POST /:slug/start` (timed attempt), `POST /attempts/:id/submit` (AI grading for short-answer/code, auto-grade MC). Badge display `GET /users/:id/badges` (public). AI feedback via LLM. |
| 77 | ✅ Done | Later | P3 | `feature` | **Autonomous job application agent** | `POST /api/auto-apply/start` (Premium) — LLM tailors cover letter + resume summary per job, optionally auto-submits to `jobApplications`. `GET /api/auto-apply/matches` — AI-ranked job matches from active listings (LLM scoring when API key available, heuristic fallback). |
| 78 | ✅ Done | Later | P3 | `feature` | **TikTok-style talent discovery feed** | `GET /api/discovery/talent-feed` — algorithmic candidate surfacing with video boost scoring, skill + location filters, cursor pagination. `GET /api/discovery/talent-feed/:userId` — single candidate card. |
| 81 | ✅ Done | Later | P3 | `feature` | **SEO content engine** | `GET /api/discovery/seo/resume-guide/:jobSlug` — AI-generated resume guide (skills, tips, mistakes, salary range) with 24h CDN cache. `GET /api/discovery/seo/salary/:jobSlug` — real salary data from job listings + LLM insights. Public routes. |
| 82 | ✅ Done | Later | P3 | `feature` | **Creator / influencer mode** | `GET /api/discovery/creators/leaderboard` — top creators by post count. `POST/GET /api/discovery/creators/products` — list and browse career products/resume templates for sale (stub `creatorProducts` table with `marketingLeads` fallback). |
| 83 | ✅ Done | Later | P3 | `feature` | **Smart job board layer** | `GET /api/discovery/jobs` — NL query + location + remote filter, TF-IDF relevance scoring + sponsored boost, returns ranked results. `GET /api/discovery/jobs/:id/similar` — "More like this" via title keyword matching. |
| 1  | 🔲 Open | Later | P4 | `arch` | **No automated tests** | Vitest + `@cloudflare/vitest-pool-workers`. `createApp()` is a pure function — testable without mocking the Worker runtime. |
| 2  | ✅ Done | Soon | P4 | `arch` | **No OpenAPI / Swagger** | `GET /api/openapi.json` — OpenAPI 3.1 spec covering all major endpoints (auth, jobs, recruiter, ATS, billing, assessments, auto-apply, discovery, passkeys, whitelabel). `GET /api/docs` — redirects to Swagger UI. Served as public static JSON with 1h CDN cache. |
| 4  | 🔲 Open | Later | P4 | `quality` | **Business logic in route handlers** | Refactor inline DB queries into `services/`. Pattern established in `services/billing.ts`, `services/account.ts`. |
| 5  | 🔲 Open | Later | P4 | `arch` | **No repository abstraction** | Low ROI given Drizzle's design. Revisit if test mocking becomes the driver. |
| 86 | ✅ Done | Mid | P2 | `feature` | **Job board scraper / extraction engine** | `jobBoardSources` + `jobBoardSyncLog` schema. Admin CRUD at `/api/admin/job-sources` + manual sync trigger. User CRUD at `/api/job-sources`. RSS + JSON API parser, SHA-256 dedup on `sourceUrl`. `scrapeAllActiveSources()` wired into cron. |
| 87 | ✅ Done | Now | P1 | `feature` | **Studio as advertising tool — 12 improvements** | (1) `purpose` field on storyboard generation (`resume`/`job_ad`/`company_promo`/`recruiter_brand`/`product_launch`). (2) Expanded scene types: `job-details`, `company-culture`, `cta`, `testimonial`, `product-feature`, `brand-story`, `requirements`, `benefits`. (3) Purpose-specific AI prompts + mock scripts. (4) CTA scene fields (`ctaUrl`, `ctaText`, `ctaQrCode`). (5) Logo overlay on video/scenes. (6) Brand kit CRUD (`studioBrandKits` table, `/api/studio/brand-kits`). (7) Clone project (`POST /api/studio/projects/:id/clone`). (8) Video analytics — view + CTA-click tracking (`videoAnalytics` table, `/api/studio/videos/:id/view`, `/cta-click`, `/analytics`). (9) Embed code generation (`GET /api/studio/videos/:id/embed`). (10) Campaign management (`videoCampaigns` table, `/api/studio/campaigns` CRUD + `/stats`). (11) Ad-specific template library (`GET /api/studio/ad-templates`). (12) Brand kit injection into AI-generated scripts. |
| 88 | ✅ Done | Now | P1 | `feature` | **Marketing pages for all sidebar nav routes** | Review revealed: `/feed` had no marketing page (just a "sign in" prompt); `/tasks` had a minimal hero-only section. Both pages now have full marketing landings matching the pattern of `/dashboard`, `/studio`, `/interview`, `/outreach`, `/resumes`. Feed landing covers post types (career updates, job shares, resume shares, insights, questions), hashtag discovery, privacy controls, and engagement. Tasks landing covers calendar/timeline view, role-specific task types (job seeker vs recruiter workflows), and progress tracking with feature cards. |
| 89 | ✅ Done | Now | P1 | `feature` | **Video & resume analytics frontend** | `GET /api/studio/projects` now returns `viewCount` + `ctaClickCount` per project by joining `videoAnalytics`. `StudioProject` schema extended. `StudioSidebar` project list shows eye icon + view count when > 0. Remaining: heatmap visualization, recruiter-facing "who viewed your resume" page. |
| 90 | ✅ Done | Now | P1 | `feature` | **Social Feed backend** | Feed backend complete with 13 endpoints. Added: auto-extract hashtags + mentions from post content on create/update (stored in `tags` JSONB). `GET /api/feed/posts?tag=:hashtag` filter. `GET /api/feed/trending-tags` returns top hashtags by frequency (last 30 days). `@mention` notifications fire-and-forget via `notifications` table on post creation. Remaining: algorithmic ranking, real-time push. |
| 91 | ✅ Done | Now | P2 | `feature` | **AI Coach / Career Copilot discoverability** | Added "AI Coach" entry (Brain icon, `/chat`) to `Sidebar.tsx` navigation between Interview Practice and Jobs. Page already had full marketing landing + auto-open chat panel. |
| 92 | ✅ Done | Now | P2 | `feature` | **LinkedIn post generator discoverability** | Studio marketing landing updated: "Share Everywhere" feature card expanded with explicit mention of AI LinkedIn post generator (hook, caption, hashtags, one-click intent). New "LinkedIn Post AI" card added to "Built for Advertising" section (4-card grid). |
| 93 | ✅ Done | Now | P1 | `feature` | **AI CHRO homepage redesign** | Replaced `HeroCarousel` with an AI CHRO hero section on `Index.tsx`: branded "AI Chief Human Resources Officer" pill badge, large headline, prominent `Textarea` prompt, "Ask CHRO" button (navigates to `/ai-coach?q=...`), and 5 quick-action chips (resume optimization, job description, candidate sourcing, salary benchmarking, interview prep). `AICoach.tsx` reads `?q=` param via `useSearchParams` and calls `openAIWithContext` to pre-populate the chat panel. `AIChatPanel.tsx` system prompt rewritten to full CHRO persona (talent acquisition, workforce strategy, HR analytics, employer branding, compliance). Welcome messages updated for all user roles. Panel header renamed "AI CHRO". |
| 94 | ✅ Done | Soon | P0 | `billing` | **AI credit add-on packs + model tier unlocks** | `enrichmentCredits` + `enrichmentTransactions` tables in `advertising.ts` schema. Credit ledger with `totalPurchased`, `totalConsumed`, `balance` tracking. Transaction types: `purchase`, `deduction`, `refund`, `monthly_grant`. Pack purchasing with balance checks in `advertising.ts` routes. |
| 95 | ✅ Done | Soon | P1 | `feature` | **Email delivery (SendPulse)** | `services/email.ts` — `EmailProvider` interface with `SendPulseEmailProvider` implementation. OAuth2 token caching. Templates: verification, password reset, 2FA, team invitations, magic links. Used by `auth.ts`, `account.ts`, `onboardingDrip.ts`. Outreach sequences delivered via `followUpSequences` engine in `scheduled.ts` cron. Remaining: custom sending domains (SPF/DKIM provisioning), bounce webhooks. |
| 96 | ⚠️ Partial | Mid | P1 | `billing` | **Contact enrichment credits (Apollo/ZoomInfo replacement)** | **Backend complete, external provider call stubbed.** `enrichmentCredits` + `enrichmentTransactions` tables in `advertising.ts` schema with `totalPurchased`/`totalConsumed`/`balance`. Pack purchasing routes + transaction ledger + credit-deduction logic on `POST /enrich` all live (`advertising.ts` lines ~499–564). Pack pricing: 100/$9.95, 500/$39.95, 1,000/$69.95. **Remaining**: wire actual third-party enrichment provider (PeopleDataLabs / Hunter.io / Apollo API) — currently the deduction fires but the returned record is a stub. Ship behind a feature flag once a provider is selected. |
| 97 | ✅ Done | Mid | P1 | `feature` | **Business Phone Phase 2 — user dashboard** | `PhoneDashboardPage.tsx` for authenticated Pro users: usage meters (voice minutes, SMS, MMS progress bars with 80%/100% colour shifts), inbound call log + SMS inbox (read-only v1), number management UI (update forwarding number, toggle voicemail, edit DND schedule, view/edit greeting), balance top-up flow + auto top-up settings, overage alerts and upsell prompts when approaching limits. Phase 1 backend (`phone.ts`, `signalwire.ts`, 4 DB tables) is complete per PRD; this closes the authenticated user-facing gap before public launch. |
| 98 | ✅ Done | Mid | P2 | `feature` | **Async one-way video interviews (Spark Hire replacement)** | `studioAsyncInterviews` + `studioAsyncResponses` tables. Recruiter creates interview with 1–10 questions + time limits + deadline. Shareable invite link (`/interview/:token`). Candidate recording UI: question-by-question webcam recording, progress indicator, auto-stop at max duration, submit all. Recruiter review: response list with video playback + transcription. API: `POST /async-interview`, `GET /invite/:token`, `POST /:id/respond`, `POST /:id/submit`, `GET /async-interviews`, `GET /:id/responses`. Frontend: `AsyncInterviewManager.tsx` (1,170 lines) + `AsyncInterviewPage.tsx` (229 lines). |
| 99 | 🔲 Open | Mid | P2 | `feature` | **Agency recruiter BD pipeline (Bullhorn/Vincere replacement)** | Client company pipeline distinct from candidate pipeline: employer relationship stages (prospect → qualified → contract → active → churned), open requisition tracking linked to job postings, estimated placement fee + probability + expected close date. Client contact book: employer-side contacts (hiring managers, HR directors) separate from candidate contacts. `recruiterClients` + `recruiterDeals` schema. Dashboard view: total pipeline value, win rate, at-risk accounts (no activity in 30+ days). Completes the full agency recruiter operating system alongside existing talent pool, commission tracking, and interaction log. Replaces Bullhorn/Vincere ($75–$100/user/mo). |
| 100 | 🔲 Open | Mid | P1 | `billing` | **Outplacement services — employer-paid B2B product** | Counter-cyclical to hiring slowdowns: employers purchase outplacement seats for displaced employees. Employer portal: bulk seat purchase at $149–$299/employee (Stripe one-time), seat assignment by employee email, progress dashboard (resume completion %, video resume created, applications sent, interview sessions completed). Employee experience: dedicated onboarding flow, all Pro features unlocked for seat duration (90/180/365 days), downloadable completion certificate for HR records. `outplacementSeats` + `outplacementEnrollments` tables. Targets HR buyers at companies doing layoffs — demand increases as hiring contracts. Platform already has 95% of required features (resume builder, video resume, interview prep, job matching, AI coaching). Competitors: RiseSmart, Lee Hecht Harrison ($500–$2,000/employee). |
| 101 | 🔲 Open | Mid | P2 | `feature` | **Freelance / gig marketplace** | Project posts (distinct from full-time jobs): fixed-price or hourly engagements, required skills, budget range, estimated duration. Bid/proposal flow with cover letter and proposed rate. Milestone-based escrow: Stripe Payment Intent held until client approves milestone delivery. Platform commission: 10% on completed transactions (on top of Stripe costs). Candidate skills assessment badges as trust signal. Dispute resolution workflow. Extends existing `serviceListing` stub and `placements` commission infrastructure. Targets freelancers, consultants, and contractors already on platform — same users available for full-time and contract work, no new acquisition needed. Self-sustaining flywheel as professional network grows. |
| 102 | ✅ Done | Soon | P2 | `feature` | **Personal brand / creator video type** | New studio video purpose: `personal_brand`. AI-generated scenes: elevator pitch, expertise showcase, client testimonial reel, speaking highlights, "what I do" explainer. Script generated from user bio, services, and achievements. CTA overlay (book a call, visit website, LinkedIn profile). Target: consultants, coaches, fractional executives, LinkedIn creators who need professional video content without agency cost. Credit-based pricing: one personal brand video = N credits. High organic distribution — professionals share publicly on LinkedIn, YouTube, social. Minimal build: one new `purpose` variant + 5 scene types in the existing storyboard generator (`studio.ts`). |
| 103 | ✅ Done | Mid | P2 | `feature` | **AI Career Resilience Score** | `POST /api/career/resilience-score` (Pro, AI-usage gated): input current job title → AI displacement risk score (0–100), skill gap map vs. AI-safe adjacent roles, retraining roadmap with target timeline, salary trajectory for recommended pivot roles. Data signals: job posting frequency trends in `jobItems`, skills demand analysis, LLM role-level automation risk assessment. `careerResilienceReports` table for saved reports. `GET /api/career/resilience-report/:id` public shareable link. Viral mechanic: shareable score card image (mirrors Resume Roast viral pattern from #72). Massive TAM expansion — relevant to every employed professional regardless of whether they are actively job seeking. |
| 104 | 🔲 Open | Soon | P2 | `feature` | **B2B outbound sales persona** | Extend platform to serve SDR/BDR sales teams beyond recruiting. New onboarding persona: "Sales & Business Development". Same enrichment credits (#96), outreach sequences (#95), and Business Phone (#97) repurposed for sales prospecting. UI relabelling behind feature flag: "Prospect Pipeline" (vs Talent Pool), "Deal Stages" (vs Submission Status), "Target Accounts" (vs Job Postings). Separate Pricing page section and marketing landing for "Sales Teams". No new backend required — feature flag controls persona label set and UI copy. Positions platform against Apollo ($49–$99/user/mo) + Instantly ($37–$83/mo) for SMB sales teams who cannot justify enterprise outbound tool costs. |
| 105 | 🔲 Open | Later | P3 | `feature` | **Corporate upskilling / L&D (seat-based)** | Learning paths: ordered sequences of assessments with markdown lesson content and optional video embeds (from studio) between them. Team skill dashboard for managers: coverage heatmap by skill category, assessment completion rates, badge counts per employee, skill gap identification. `learningPaths` + `learningPathSteps` + `learningEnrollments` tables. Sold as separate B2B seat license ($15–$30/seat/mo) via `companySubscriptions` new planTier `learning`. Leverages existing `skillAssessments`, `assessmentAttempts`, and skills badge infrastructure from #76. Targets HR/L&D buyers at companies reskilling workers for AI-transformed roles. Competes with LinkedIn Learning ($379/seat/yr) and Coursera for Business at a fraction of the cost. |
| 106 | ✅ Done | Soon | P1 | `billing` | **Self-serve sponsored job listing checkout** | Employer self-serve UI to boost a job to the top of search results and discovery feed. Schema already in place (`sponsored`, `sponsoredUntil`, `sponsoredRankBoost` on `jobItems` from #50) — this closes the purchasing gap. Checkout flow: select job → choose placement type (search top, discovery feed, both) → set budget + duration → Stripe one-time charge or recurring. CPM pricing with daily impression reporting. Rank boost applied in `getPublicJobs` and `GET /api/discovery/jobs` queries. Auto-expires at `sponsoredUntil` date. |
| 107 | ✅ Done | Soon | P1 | `billing` | **Self-serve featured company profile boost** | `companyProfiles` extended with `featured`, `featuredUntil`, `featuredRankBoost` columns (migration `0005_company_boosts.sql`). New `companyBoosts` table mirroring `jobBoosts` (placementType: `directory_featured` / `dashboard_spotlight` / `discovery_feed` / `all`, pricingModel: `flat` / `cpm`, status, impressions/clicks/follows tracking). Routes: `GET/POST /api/advertising/company-boosts`, `PATCH /:id/pause`, `PATCH /:id/resume`, `DELETE /:id` (cancels and unfeatures the company in one transaction). Verifies company ownership before activation. Same purchasing pattern as #106, distinct table so analytics can split job vs company spend. |
| 108 | ✅ Done | Mid | P2 | `feature` | **Unified ad campaign hierarchy (Campaign → Ad Set → Ad)** | Introduce the industry-standard 4-level hierarchy for employer advertising: (1) `adCampaigns` — strategic objective grouping with campaign-level budget cap and objective (`AWARENESS`, `TRAFFIC`, `APPLICATIONS`, `EMPLOYER_BRAND`); (2) `adSets` — targeting, budget, schedule, bid strategy, frequency cap; (3) `ads` — creative unit with custom headline, description, CTA text, image/video, destination URL. Refactor existing sponsored job listings and company boosts to sit under this hierarchy as Ad Sets. Renames the current email `Campaign` model to `MessagingCampaign` to avoid collision. Mirrors the LinkedIn Campaign Manager / Meta Ads Manager pattern advertisers already know. |
| 109 | 🔲 Open | Mid | P2 | `feature` | **Audience targeting on paid placements** | Add targeting capabilities to Ad Sets (#108): geographic (radius, city, country), job seeker attributes (current role, skills, years of experience, education level, open-to-work status), behavioral (recently active, viewed similar companies, used resume optimizer), time-of-day / day-of-week dayparting, device platform. Exclude existing applicants or employees. Real-time audience size estimation on targeting config UI. Data sourced from existing `userProfiles`, `jobPreferences`, and `activityLogs` — no external DMP required. Transforms paid placements from untargeted broadcast into precision employer marketing. |
| 110 | ✅ Done | Mid | P2 | `feature` | **Ad creative management** | Decouple ad creative from the underlying job listing. `ads` table (from #108): custom headline, description, CTA text (e.g. "Apply Now", "Learn More", "Watch Our Story"), primary image/video upload (distinct from job image), destination URL with dynamic tracking parameter substitution (`{CAMPAIGN_ID}`, `{AD_SET_ID}`, `{AD_ID}`, `{AD_NAME}`). A/B creative variants per Ad: two creative variants, configurable split %, automatic winner selection by CTR after statistical significance. Studio-generated video (#87) can be attached as ad creative directly. CTR tracked per creative variant for performance comparison. |
| 111 | ✅ Done | Mid | P2 | `feature` | **Advertising analytics dashboard (ROAS + funnel)** | `GET /api/advertising/analytics/dashboard?days=30` — unified ROAS + funnel reporting across `jobBoosts` (#106), `companyBoosts` (#107), `adCampaigns` (#108), and `placements` (#50/#51). Returns `sources` (per-channel impressions/clicks/spend/budget), `aggregates` (total impressions, clicks, applications, hires, fee revenue, commission, CTR %, CPC, CPA, CPH, ROAS = totalFeeCents / totalSpentCents), and a 4-stage `funnel` (impressions → clicks → applications → hires). Date range filterable via `?days=` (1..365). Reuses the existing `ctr()` / `costPerClick()` helpers in `advertising.ts`. |
| 112 | 🔲 Open | Later | P3 | `feature` | **Cross-channel campaign unification (paid + email in one campaign)** | Allow a single `adCampaign` (#108) to contain both paid placement Ad Sets and `MessagingCampaign` (email/push) Ad Sets. Enables coordinated omnichannel hiring campaigns: a candidate sees a sponsored job in the discovery feed, then receives a follow-up email sequence 48h later if they clicked but did not apply. Campaign-level budget shared or split across channels. Unified reach/frequency reporting across paid and email. Sequence enrollment triggered by paid ad engagement event (click → enroll in outreach sequence). Requires #108 hierarchy + #95 email delivery to be live first. |
| 113 | ✅ Done | Now | P1 | `feature` | **Client-side WebGPU TTS voiceover** | `frontend/lib/services/tts-engines.ts` — unified facade for four engines (Web Speech, Kokoro-82M, Piper, VibeVoice) loaded lazily from CDN ESM. Per-engine voice listing, PCM playback through Web Audio, exportable buffers. `VoiceoverPanel.tsx` — engine picker, voice picker, editable per-scene scripts. Replaces the prior ElevenLabs server integration; no API keys, no per-call cost. |
| 114 | ✅ Done | Now | P1 | `feature` | **Auto-captions (4 styles)** | `studioCaptions` table. API: `POST /captions/generate`, `GET /captions/:projectId`. `caption-renderer.ts` — canvas overlay supporting standard, bold-pop (TikTok/Reels karaoke), word-by-word, and lower-thirds styles. Frontend: `CaptionEditor.tsx` (571 lines) — cue editing, style selector, SRT/VTT export download. |
| 115 | ✅ Done | Now | P1 | `feature` | **LinkedIn video publishing (OAuth)** | `linkedinAccounts` table. Full OAuth2 flow: `GET /linkedin/auth-url`, `POST /linkedin/callback`, `GET /linkedin/accounts`, `POST /linkedin/publish` (video upload registration), `POST /linkedin/post` (create post). Frontend: `LinkedInPublisher.tsx` (589 lines) — account connection, compose with character count, visibility toggle, multi-stage publish. Env: `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`. |
| 116 | ✅ Done | Now | P1 | `feature` | **Webcam recording + teleprompter** | `studioRecordings` table. Browser-native webcam/screen/PiP recording via MediaRecorder API. API: `POST /recording/upload`, `POST /recording/:id/transcribe` (Whisper). Frontend: `WebcamRecorder.tsx` (767 lines) — camera/screen capture, audio level meter, resolution toggle, auto-stop, PiP compositing. `Teleprompter.tsx` (365 lines) — auto-scroll with WPM control, sentence highlighting, time remaining. |
| 117 | ✅ Done | Now | P1 | `feature` | **AI delivery coaching** | `studioDeliveryCoaching` table. `services/transcription.ts` — Whisper transcription + delivery analysis (pacing WPM, filler word detection, vocal variety/energy scoring). API: `POST /coaching/analyze`, `GET /coaching/:recordingId`. AI clarity scoring via LLM. Frontend: `DeliveryCoach.tsx` (493 lines) — circular score, metric bars, filler word breakdown with timestamps, suggestion cards. Env: `OPENAI_API_KEY`. |
| 118 | ✅ Done | Now | P1 | `feature` | **ATS-compatible output package** | `studioAtsPackages` table. API: `POST /ats/generate` (AI text summary + email template + unique slug), `GET /ats/:slug` (public landing page with view counter). Frontend: `ATSPackageGenerator.tsx` (353 lines) — candidate info form, generated summary + email with copy buttons, shareable link. `ATSLandingPage.tsx` (157 lines) — public page at `/v/ats/:slug` with video player, text summary, LinkedIn link, engagement tracking. |
| 119 | ✅ Done | Now | P2 | `feature` | **Interview question practice (AI coaching)** | `studioInterviewQuestions` + `studioInterviewSessions` tables. 15 default questions across behavioral/technical/situational/company-specific categories with STAR framework guidance. API: `GET /interview/questions`, `POST /interview/questions/seed`, `POST /interview/session`, `PATCH /interview/session/:id`, `GET /interview/sessions`. AI-generated talking points from resume, AI scoring + feedback on recorded answers. Frontend: `InterviewPractice.tsx` (837 lines) — filterable question library, session view with talking points + STAR guide, AI feedback panel, session history. |
| 120 | ✅ Done | Now | P2 | `feature` | **Skills demonstration videos (screen + webcam)** | `studioSkillsDemos` table. 4 templates: general, code-walkthrough, design-portfolio, data-analysis. AI script generation with per-section teleprompter text + screen instructions. API: `POST /skills-demo`, `PATCH /skills-demo/:id`, `GET /skills-demos`, `GET /skills-demos/user/:userId`, `POST /skills-demo/generate-script`. Frontend: `SkillsDemoCreator.tsx` (740 lines) — template selector, input form, AI script preview, recording flow, published demos grid. |
| 121 | ✅ Done | Now | P2 | `feature` | **Voice cloning + Voice Marketplace** | `studio_voice_clones` (extended with `visibility`, `price_cents`, `platform_fee_bps`, `consent_*`, `listing_slug`, `language/gender/accent`) and `studio_voice_clone_licenses` (owner + free + purchase grants, per-row creator/platform split for audit). API: `GET /voice-clones`, `GET /voice-clones/library`, `GET /voice-clones/marketplace`, `GET /voice-clones/:id`, `POST /voice-clones` (upload sample, private by default — no ElevenLabs call), `PATCH /voice-clones/:id` (publish/unpublish, set price, capture consent), `POST /voice-clones/:id/claim`, `POST /voice-clones/:id/checkout`, `POST /voice-clones/cart-checkout`, `DELETE /voice-clones/:id`. Synthesis runs in the buyer's browser via VibeVoice (`tts-engines.ts`); the server never invokes a model. Frontend: `VoiceCloneManager.tsx` (clone CRUD + monetize toggle + consent + price input + 95/5 split preview, flipped 2026-04-20 per #156), `VoiceMarketplaceCard.tsx` (homepage catalog card with inline preview + add-to-cart), `cart-context.tsx` accepts `type: "voice_clone"` items. Terms of Service §9a covers consent, ownership, the revenue split, and zero-tolerance enforcement. |
| 122 | ✅ Done | Now | P2 | `feature` | **Per-second video analytics (Wistia-quality heatmap)** | `studioVideoHeatmap` table. API: `POST /analytics/track` (per-second viewing data + email domain → company reverse-lookup), `GET /analytics/:videoId` (aggregated heatmap + viewer list + drop-off analysis). `video-tracker.ts` — attaches to `<video>` element, captures per-second viewing, sends beacon on unload. Frontend: `VideoAnalyticsDashboard.tsx` (447 lines) — metric cards, engagement heatmap bar chart, drop-off indicator, viewer table with company. |
| 123 | ✅ Done | Now | P1 | `feature` | **Video visibility toggle (public/unlisted)** | `PATCH /projects/:projectId/visibility` — updates linked video `privacyStatus` between `public` and `unlisted`. `toProjectDto` now includes `isPublic` from video. Frontend: `handleMakePublic` calls API, initializes from project state on load, shows toast. |
| 124 | ✅ Done | Later | P2 | `feature` | **Frame-level NLE timeline (trim / split / merge / reorder)** | `SceneScript` extended with `inPoint` / `outPoint` / `sourceDuration` / `transitionIn` (gap #124). `video-compiler.ts` recomputes `start` from cumulative `duration` on every compile so split/merge/trim are transparent — the timeline only mutates the array. Pure helpers in `lib/compiler/scene-ops.ts`: `reorderScene`, `trimScene`, `splitSceneAtTime`, `mergeWithNext` (seamless re-merge of previously-split scenes when trim points are contiguous), `deleteScene`, `duplicateScene`, `setSceneTransition`. Frame-renderer (`frame-renderer.ts`) honours per-scene `transitionIn` overriding the theme default — exit toward N+1 uses N+1's transition; entry from prev uses this scene's. UI: `NLETimeline.tsx` (~370 lines) — frame ruler with click-to-seek, draggable scene blocks proportional to duration, left/right trim handles with `cursor: ew-resize`, drag-to-reorder with hover indicator, transition dropdown badge per scene, zoom controls (20–240 px/s), playhead with marker, trim indicator (`✂ 3.2/8.0s`), keyboard shortcuts (S = split at playhead, M = merge with next, D = duplicate, Del = delete). Mounted in `StudioLayout.tsx` replacing the read-only `TimelineEditor`. All edits flow through `handleScriptChange` so they integrate with undo/redo, autosave (#131), and version history. |
| 125 | ✅ Done | Mid | P2 | `feature` | **Visual filters and color adjustments** | `VideoFilters` interface added to `types/video-script.ts` (brightness, contrast, saturation, hueRotate, blur, warmth) plus `videoFiltersToCss()` helper that composes a CSS `filter:` string. Applied unconditionally to the preview wrapper in `StudioPreview.tsx`. UI: 5 sliders in `StudioSidebar.tsx` Theme section with Reset link, persisted on `script.video.theme.filters`. Warmth maps to a sepia + hue-rotate combo so positive values warm and negative values cool. |
| 126 | 🔲 Open | Later | P3 | `feature` | **Text-based editing via transcript (Descript-style)** | After Whisper transcription, render the full transcript as editable text. Deleting or editing a word automatically trims the corresponding video segment and removes the audio range. Requires aligning word-level timestamps (already generated by `services/tts.ts` and `services/transcription.ts`) to clip time ranges and applying cuts on export. `POST /studio/projects/:id/edit-by-transcript`. High-value for long-form recordings where finding specific segments is slow. |
| 127 | 🔲 Open | Later | P2 | `feature` | **AI background removal (no green screen)** | Browser-side person segmentation using MediaPipe Selfie Segmentation WASM or TensorFlow.js BodyPix. Applied as a real-time mask during `WebcamRecorder.tsx` preview and baked into the exported `VideoFrame` stream. Replace background with solid colour, blur, or a custom image. Zero server round-trip — WASM model loaded once and cached. Closes the greenscreen gap for remote recording use cases (job seekers recording from home offices). |
| 128 | ✅ Done | Later | P3 | `feature` | **Stock media library integration (content-addressed, deduplicated)** | `stockMediaAssets` (hash PK) + `userStockMediaUsage` schema in `studiofeatures.ts`. Migration `0002_stock_media.sql`. Aggregator service `services/stockmedia.ts` searches Unsplash + Pexels + Pixabay live (round-robin interleave; no R2 hit on search). Pick flow `POST /api/studio/stock/pick` is triple-deduped: (1) lookup by `(provider, providerAssetId)` skips download entirely; (2) otherwise download once and lookup by `sha256(bytes)` catches cross-provider duplicates; (3) only if both miss does the route PUT to R2 at `stock/<sha256>.<ext>`. Per-user picks recorded in `userStockMediaUsage` (userId, assetHash, projectId, sceneId) — same R2 object backs thousands of projects. Routes: `GET /stock/search`, `POST /stock/pick`, `GET /stock/recent`, `GET /stock/stats` (returns `bytesSaved` from dedup). Frontend: `StockMediaPanel.tsx` (debounced search, image/video toggle, recently-used grid, green "deduped · saved N KB" badge on reused picks). Wired into `StudioSidebar.tsx` as a new collapsible section — picking an image sets it as the project background. Env: `UNSPLASH_ACCESS_KEY`, `PEXELS_API_KEY`, `PIXABAY_API_KEY`. Same pipeline applies to Storyblocks/Shutterstock when added behind Premium tier. |
| 129 | ✅ Done | Mid | P2 | `feature` | **Multi-track audio mixer with per-track volume and fade** | `AudioMixConfig` + `AudioLaneConfig` added to `types/video-script.ts` (masterGain + per-lane gain/fadeIn/fadeOut/muted). `video-exporter.ts` builds `GainNode` per lane with `setValueAtTime` + `linearRampToValueAtTime` envelopes that wire each track (music, voiceover) into a master gain before the destination. UI: `AudioMixerDialog.tsx` mounted in `StudioToolbar.tsx` — master + per-lane sliders (0..200%), mute toggles, fade-in / fade-out inputs, Reset link. Edits patch `script.video.audio.mix` so the export pipeline picks them up automatically. |
| 130 | 🔲 Open | Later | P3 | `feature` | **Real-time collaborative studio editing** | Multiple users editing the same `studioProject` simultaneously. Operational-transform or CRDT-based scene-list sync via Cloudflare Durable Objects (already in stack for potential real-time chat #41). Presence cursors and named-colour user indicators on the storyboard. Conflict-free reordering using fractional indexing on `scene.order`. Targets agency workflows and employer brand teams co-creating job-ad videos. |
| 131 | ✅ Done | Soon | P3 | `feature` | **Project version history and autosave** | `studioProjectVersions` table (versionNumber, label, storyboard JSONB, isAutosave). Migration `0003_versions_chapters.sql`. Routes in `studio-features.ts`: `POST /projects/:id/versions` (create snapshot), `GET /projects/:id/versions` (list), `GET /projects/:id/versions/:vid` (full snapshot), `POST /projects/:id/versions/:vid/restore` (creates a "restored from vN" row + returns storyboard). Server-side enforcement: 50-version cap + 30-day retention via `inArray` delete on autosave rows; manual snapshots preserved beyond cap. Autosave wired in `StudioLayout.tsx` — debounced 30 s `useEffect` watches `state.script` and creates a snapshot via dynamic import. UI: `VersionHistoryDialog.tsx` with version list, restore button, and "Snapshot now" manual save. Mounted in new `StudioToolbar.tsx` above the preview canvas. |
| 132 | 🔲 Open | Later | P4 | `feature` | **Studio plugin / extension system** | Hook registry in the compiler pipeline: `registerScenePlugin(type, { compile, render, settingsUI })`. Plugins can add new SceneNode types, visual effects, or panel tabs. Plugin manifest loaded from `studioPlugins` table (URL, version, permissions). Sandboxed via iframe + postMessage for safety. Developer-facing API documented alongside OpenAPI spec. Enables community-built templates, brand kits, and integrations without core changes. |
| 133 | ✅ Done | Mid | P2 | `feature` | **Multiple aspect ratios and 4K export** | `VideoResolution` extended to `"720p" \| "1080p" \| "4k"` and `VideoAspect` to `"16:9" \| "9:16" \| "1:1" \| "4:3"`. Compiler `RESOLUTION_MAP` adds `4k: 3840×2160`, `ASPECT_MAP` adds `4:3`. UI dropdowns updated in `StudioSettings.tsx` (with `4K — Premium` label and platform hints on aspect options). 4K Premium gate enforced server-side in `POST /api/studio/upload`: reads `resolution` form field and rejects with `402 PREMIUM_REQUIRED` for non-Premium users. `studioService.uploadVideo()` and both call sites in `StudioLayout` now pass `state.resolution`. |
| 134 | 🔲 Open | Soon | P1 | `feature` | **AI avatar / talking-head generation (HeyGen / Synthesia replacement)** | Generate a fully synthetic presenter video from a text script for users who do not want to appear on camera. Library of 10–20 pre-built avatars (ethnicities, genders, business styles) plus optional custom avatar from a 2-minute selfie sample. Reuses existing TTS + voice cloning (#113, #121) for audio. Lip-sync via D-ID / HeyGen / Synthesia API behind a swappable `services/avatar.ts` provider stub. New `studio_avatars` + `studio_avatar_renders` tables. UI: "Use AI Avatar" tab in `VoiceoverPanel.tsx` as an alternative to `WebcamRecorder.tsx`. Critical for displaced workers, ESL candidates, and employer brand teams that lack on-camera talent. Replaces HeyGen / Synthesia ($30–$200/mo). |
| 135 | 🔲 Open | Mid | P2 | `feature` | **Multi-language video translation + dubbing (voice-preserved)** | One-click translate a finished video to 20+ languages: Whisper transcribes original → LLM translates each caption cue → ElevenLabs dubs in the user's cloned voice (#121) so the speaker sounds like themselves in the target language. Optional lip-sync re-render via avatar pipeline (#134). Translated caption tracks stored alongside originals in `studioCaptions`. API: `POST /studio/projects/:id/translate` with `targetLanguages[]`. Enables global hiring campaigns and unlocks ESL candidates without re-recording. Replaces Rask AI / HeyGen Translate ($24–$89/mo). |
| 136 | 🔲 Open | Soon | P1 | `feature` | **AI noise reduction & audio enhancement** | One-click cleanup of background noise, room echo, and uneven levels. Browser-side RNNoise WASM for real-time preview in `WebcamRecorder.tsx`; high-quality offline pass via Adobe Podcast Enhance API or `audo.ai` on the uploaded blob. Enhanced track stored separately on `studioRecordings`; original preserved. UI: "Enhance Audio" toggle in the post-recording panel and on async interview submissions (#98). Critical for job seekers recording from home offices — current MVP-quality audio is the single biggest perceptual blocker for video resumes. |
| 137 | 🔲 Open | Mid | P2 | `feature` | **AI eye-contact correction** | Real-time gaze redirection so users reading the teleprompter (#116) appear to look directly into camera. NVIDIA Maxine WebRTC SDK on compatible GPUs; fallback to server-side pass via `sieve.ai` or open-source LookOnce on non-GPU clients. Toggle in `WebcamRecorder.tsx` settings. Closes the "obvious teleprompter user" tell — users no longer have to choose between scripted delivery and natural eye contact. |
| 138 | 🔲 Open | Mid | P2 | `feature` | **Auto-reframe for vertical / square formats** | When the user switches aspect ratio (#133), MediaPipe Face Detection WASM re-detects the speaker per frame and generates per-time-range crop offsets stored on `storyboardScenes.reframeKeyframes`. `frame-renderer.ts` and `caption-renderer.ts` apply offsets at render time so faces are never cropped out of 9:16 or 1:1 outputs. Adobe Premiere Pro auto-reframe parity. Critical for repurposing landscape video resumes into TikTok / Reels / Shorts without re-shooting. |
| 139 | 🔲 Open | Soon | P1 | `feature` | **Direct publishing to TikTok, Instagram Reels, YouTube Shorts** | Extend the LinkedIn publishing pattern (#115) to additional short-form destinations. New OAuth providers + upload endpoints: `POST /studio/tiktok/publish`, `POST /studio/instagram/publish`, `POST /studio/shorts/publish`. New `tiktokAccounts` + `instagramAccounts` tables (YouTube already wired). Schedule-for-later via existing `scheduled.ts` cron. Frontend: provider tabs in `LinkedInPublisher.tsx` (rename to `SocialPublisher.tsx`). Combined with auto-reframe (#138), one storyboard becomes four platform-optimised exports. Critical for personal-brand creators (#102) and employer brand teams. |
| 140 | ✅ Done | Soon | P1 | `feature` | **In-video lead capture forms (Wistia Turnstile replacement)** | `studioVideoForms` + `studioVideoFormSubmissions` schema. Migration `0004_forms_reviews_thumbnails.sql`. Routes: `GET/POST /projects/:id/forms`, `PATCH/DELETE /forms/:id`, `GET /videos/:videoId/forms/public` (anonymous embedded-player fetch), `POST /forms/:id/submit` (public — validates required fields, mirrors `email`/`name`/`company` answers into the global `marketingLeads` table for the unified inbox), `GET /forms/:id/submissions` (owner). Frontend: `VideoFormsDialog.tsx` — list, create with name+email toggles + gate-playback switch + redirect URL, inline submissions viewer. Mounted in `StudioToolbar.tsx`. |
| 141 | ✅ Done | Mid | P2 | `feature` | **Video chapter markers + interactive table of contents** | `studioChapters` table (projectId, title, startSeconds, thumbnailUrl, orderIndex). Migration `0003_versions_chapters.sql`. Routes: `GET/POST /projects/:id/chapters`, `PATCH/DELETE /chapters/:id`, `GET /projects/:id/chapters/youtube` (returns `0:00 Intro`-style text for YouTube/LinkedIn descriptions). UI: `ChapterEditor.tsx` dialog auto-seeds chapters from compiled scene boundaries on first open, supports timestamp-format input (`mm:ss` or `hh:mm:ss`) with parser, and one-click copy of the YouTube text. Mounted in `StudioToolbar.tsx`. |
| 142 | ✅ Done | Mid | P2 | `feature` | **AI thumbnail generator** | `studioThumbnails` schema (imageUrl, sourceTimeSec, score, isSelected). Routes: `POST /projects/:id/thumbnails/score` (heuristic + LLM ranking via `callLLMJson` with Zod, falls back to heuristic when no API key), `GET /projects/:id/thumbnails`, `PATCH /projects/:id/thumbnail` (clears prior selection then activates). Frontend: `ThumbnailsDialog.tsx` — extracts 6 evenly-spaced frames from the published video URL via a hidden `<video>` + `<canvas>` `drawImage` pipeline (data-URL JPEG at 0.72 quality), uploads to `/score`, displays ranked candidates with selectable click-to-pick UX. |
| 143 | ✅ Done | Mid | P2 | `feature` | **AI hook optimizer (first 3 seconds)** | `POST /api/studio/projects/:id/hook/optimize` — pulls scene 0 from the storyboard, optionally enriches with retention signals from `studio_video_heatmap` (#122) when a `videoId` is supplied (computes early-drop %, top drop-off second, sample size). Calls `callLLMJson` with a Zod schema requiring `diagnosis` + `variants[]` (label, title, subtitle, text, rationale). Returns the diagnosis + 3 variants + retention object. Frontend: `HookOptimizerDialog.tsx` mounted in `StudioToolbar.tsx` — diagnosis card with retention badge, 3 variant cards each with one-click "Use" that patches scene 0 of `state.script` with the chosen title/subtitle/text. |
| 144 | ✅ Done | Mid | P3 | `feature` | **AI script rewriter (tone, length, persona)** | `POST /api/studio/projects/:id/script/rewrite` — 4 modes (`shorten`, `lengthen`, `tone`, `persona`) with `targetSeconds`, `tone` (professional/conversational/enthusiastic/executive), `persona` (job-seeker/recruiter/company-promo/personal-brand), and free-form `instructions`. Calls `callLLMJson` with a Zod schema that requires a `scenes[]` array. System prompt instructs the model to preserve scene `type`, `visual`, and `camera` fields exactly. UI: `ScriptRewriterDialog.tsx` mounted in `StudioToolbar.tsx` — mode selector, dynamic config UI per mode, scene-list preview before accept, splices new scenes back into `state.script` on apply. |
| 145 | ✅ Done | Later | P3 | `feature` | **Frame.io-style review comments on video** | `studioReviewComments` (parentId for threading, timestampSec for pin, resolved flag) + `studioReviewLinks` (24-byte hex shareToken via `crypto.getRandomValues`, optional expiry). Routes: `POST/GET /projects/:id/review-links`, `DELETE /review-links/:id`, `GET /projects/:id/comments`, `POST /projects/:id/comments` (authed), `GET /review/:shareToken` (public — resolves token, returns project + comment thread, honours expiry with HTTP 410), `POST /review/:shareToken/comments` (anonymous post by external reviewers), `PATCH /comments/:id` (resolve toggle, owner-only), `DELETE /comments/:id`. Frontend: `ReviewCommentsDialog.tsx` — public link manager with copy-to-clipboard, threaded comment list with resolve/delete, time-pinned reply input wired to `currentTimeSec` from playback. |
| 146 | 🔲 Open | Soon | P2 | `feature` | **Email integration for auto-status updates (Gmail / Outlook)** | Connect Gmail or Outlook via OAuth and run a background parser that scans incoming emails for job application responses (interview invites, rejections, offers). Auto-updates `savedJobs.status` from "applied" → "interviewing" / "rejected" / "offered" based on email content analysis via LLM. OAuth consent screens, token refresh, email polling via Cloudflare Cron, and privacy controls (user selects which labels/folders to scan, data never stored beyond status classification). Replaces manual status updates in the Chrome extension's job pipeline tracker. Prerequisite: `savedJobs.status` column (implemented in extension analytics PR). |
| 147 | ✅ Done | Soon | P1 | `arch` | **Unify tool API response envelope + shared Zod schemas** | Canonical `success()` in `api/src/types/index.ts` now emits `{ success, data, timestamp }` with overloads for `message` / pagination `meta`. Six local `ok<T>()` copies deleted from `resume-scorer.ts`, `resume-optimizer.ts`, `salary.ts`, `value-proposition.ts`, `sentiment.ts` (kept in `resumes.ts` for non-tool handlers, out of scope). Stringly-typed `{ result: JSON.stringify(full) }` removed from scorer + optimizer — both return structured objects now; frontend pages and sentiment service updated to read `response.data` directly. Shared Zod response schemas live in `shared/tool-schemas.ts` (`FullResumeScoreSchema`, `ResumeScorePreviewSchema`, `OptimizerResponseSchema`, `SalaryAnalysisResponseSchema`, `NegotiationTipsResponseSchema`, `ValuePropositionResponseSchema`, `SentimentResponseSchema`, `SummarizeResponseSchema`, shared `ScoreSchema` + `LetterGradeSchema` value objects). Shared module now has `package.json` with `"type": "module"` so named ESM imports work from tsx/node. Sentiment endpoint now returns `{ score }` (object-wrapped, LSP fix); frontend `sentiment-service.ts` and `value-proposition-service.ts` re-export the shared schemas. 9 new tests in `tools-api.test.ts` validate every handler's output against the shared schema (192/192 passing). |
| 148 | ✅ Done | Soon | P2 | `arch` | **Convert `checkAIUsage` inline guards to middleware** | `requireTokenBudget()` middleware factory added to `tierEnforcement.ts` next to `requirePremium()`. `resume-optimizer.ts` (3 sites) and `value-proposition.ts` (4 sites, deduped to one shared handler + 4 registrations) migrated to `.post("/optimize", requireTokenBudget(), handler)` form. `resume-scorer.ts` keeps the inline `checkTokenBudget(c)` call because its gate is conditional on subscription tier (free-tier users get a preview regardless of token balance). Deprecated `checkAIUsage` alias kept for call sites in dashboard/messages/analytics that are out of scope. |
| 149 | ✅ Done | Mid | P2 | `arch` | **Consolidate `/CreateFromFile` and `/createfromfile` job handlers** | Extracted `extractCreateFromFilePayload(c)` in `jobs.ts` — a pure Content-Type dispatcher that returns `{ title, description, location }` whether the request was multipart or JSON. Both routes register a single `createFromFileHandler`. 14 new tests in `jobs-create-from-file.test.ts` cover the JSON path, multipart path (file extraction, location field, missing file, null form), and Content-Type dispatch (case-insensitive, unknown → JSON default). |
| 150 | ✅ Done | Mid | P1 | `arch` | **Access policy + Billing facade (break Resume→Billing context leak)** | New `api/src/domains/billing/` module with a deliberate split between two concepts: **`Tier = "free" \| "pro"`** (the billing domain — what Pricing.tsx sells, what Stripe meters) and **`Audience = "anonymous" \| "free" \| "pro" \| "admin"`** (what the policy dispatches on — anonymous visitors and admins need distinct handling beyond the binary billing tier). Files: `audience.ts` (both types + `deriveAudience()` + `deriveTier()` + `isAdminRole()`), `access-policy.ts` (`AccessPolicy` interface, `standardAccessPolicy` with a `(audience × feature)` payload-shape matrix and feature-specific `UpsellPayload` table), `facade.ts` (`BillingFacade` with both `getAudience()` and `getTier()` methods + production impl wrapping `getSubscription` + `makeBillingFacadeForTests` test double). Resume-scorer refactored: no longer imports `getSubscription` directly, no longer inspects `sub.isPremium`; instead calls `billingFacade.getAudience(c.var.user)` → `standardAccessPolicy.getPayloadShape(audience, "resume_scorer")` → pure `shapeScorePayload(full, shape, upsell)`. Hardcoded `lockedDetails` / `upgradeUrl` moved into the policy's `UPSELL_BY_FEATURE` table. 33 new tests in `access-policy.test.ts` (14 for createFromFile + 33 here + existing suite = 264 passing) cover `deriveAudience`, `deriveTier` (including a guard asserting tiers are only Free/Pro), `isAdminRole` across role shapes, the full payload-shape matrix, the fake facade (both getAudience and getTier), and `shapeScorePayload` for full/teaser/locked branches. |
| 151 | 🔲 Open | Later | P3 | `quality` | **Ubiquitous-language cleanup: "Premium" → "Pro" + clarify guard semantics** | Three names for one concept: `PREMIUM_*` aliases in `shared/pricing.ts:18-20`, `requirePremium` middleware, `sub.isPremium` boolean — while newer code calls the tier "Pro". Three guard names (`requirePremium`, `checkAIUsage`, `checkTokenBudget`) with fuzzy scope boundaries. Rename decisively to `requireProSubscription()` and `requireTokenBudget()`; delete PREMIUM_* aliases; document in one place which gate applies to what (tier lock vs AI budget). Should land after #148 so `checkAIUsage` is already gone. |
| 152 | 🔲 Open | Soon | P2 | `feature` | **Content reporting (abuse / spam flag)** | Non-owner "Report" action in `ResumeActionsMenu` and `JobCard` menus. `contentReports` table (reporterId, entityType, entityId, reason enum: spam/impersonation/inappropriate/other, notes, status). `POST /api/reports` (authed), `GET /api/admin/reports` + `PATCH /:id/resolve` (admin-only triage queue). Auto-hide threshold at N reports pending review. Currently only owner can Delete — public abuse has no user-facing path. |
| 153 | 🔲 Open | Mid | P2 | `feature` | **Save to Collection (richer than binary Track)** | Non-owner action to bookmark resumes/jobs into named collections. `userCollections` + `collectionItems` schema. `POST/GET /api/collections`, `POST /api/collections/:id/items`, drag-to-reorder. Recruiter workflow: "Engineering candidates Q2", "Design leads". Supersedes the current binary `ownership="tracked"` toggle on resumes but stays backwards-compatible — a "Saved" default collection is auto-created on first track. |
| 154 | 🔲 Open | Mid | P3 | `feature` | **Archive / Unarchive (resume + job status flow)** | The status enum already supports `archived` but no UI surface sets it. Add Archive / Unarchive to owner's `ResumeActionsMenu` and job editor; hide archived items from default `/resumes` and `/jobs` lists behind an "Include archived" filter. Soft-delete alternative to hard Delete — preserves slug + analytics history. |
| 155 | 🔲 Open | Mid | P3 | `feature` | **Version History for resumes** | Studio projects already have `studioProjectVersions` + `VersionHistoryDialog` (#131). Mirror that pattern for resumes: `resumeVersions` table (versionNumber, label, resumeData JSONB, isAutosave), `POST /api/resumes/:id/versions`, `GET /api/resumes/:id/versions`, `POST /api/resumes/:id/versions/:vid/restore`. Expose via "Version History" item in the owner's `ResumeActionsMenu`. Autosave on descriptor edit; 50-version cap + 30-day retention on autosave rows. |
| 156 | ✅ Done | Now | P1 | `feature` | **Rev-share standardisation — 95/5 + CC fee to buyer** | Flipped `PLATFORM_FEE_BPS_DEFAULT` 2000→500 in `studio-features.ts` and `DEFAULT_PLATFORM_FEE_BPS` 1500→500 in `creators.ts`. Schema defaults flipped on `studio_voice_clones.platform_fee_bps` and `creator_profiles.platform_fee_bps`. ToS §9a rewritten for 95/5 + configurability clause. Test pin in `studio-captions.test.ts` updated. `Marketplace.tsx` — all 5 category cards (Resume Templates, Video Templates, Voice, Services, Articles) now carry "Creator earnings" / "Engagement earnings" pills. Buyer pays `price + CC fee`; creator's 95% is not reduced by CC processing. |
| 157 | 🔲 Open | Now | P1 | `feature` | **Per-user configurable rev-share — `users.creatorPlatformFeeBpsOverride`** | Nullable int4 column on the users table; null → fall back to `PLATFORM_FEE_BPS_DEFAULT`. Read at every opt-in action (voice publish, template publish, course publish, creator profile activation, Partner Program opt-in) and snapshot onto the item's `platformFeeBps`. Superadmin UI to set per-user override (reuse SuperAdmin surface). Prospective-only — existing listings keep their snapshot unless creator re-accepts updated terms. |
| 158 | 🔲 Open | Now | P1 | `feature` | **Opt-in + consent flow for Resume Templates** | Mirror `VoiceCloneManager.tsx` pattern: visibility toggle (private → public), consent checkbox on first publish, snapshot `platformFeeBps` + `consentAgreedAt` + `consentIp` + `consentUa` onto the listing row. Requires schema additions to resume-template listings and a new legal-doc kind `resume_template_creator_terms` seeded via admin UI. |
| 159 | 🔲 Open | Now | P1 | `feature` | **Opt-in + consent flow for AI Video Resume Templates** | Same pattern as #158 for `videoTemplates` / `videoTemplateListings`. New legal-doc kind `video_template_creator_terms`. |
| 160 | ✅ Done | Now | P1 | `feature` | **Courses / SCORM / Certifications vertical — foundation** (2026-04-25) | Schema landed via migration `0041_courses_foundation.sql` + drizzle schema `api/src/db/schema/courses.ts`: `courses` (title/slug/summary/cover/category/difficulty/estimated_minutes + status/published_at + price/platform_fee_bps + issues_certificate/passing_score_pct + denormalised aggregates), `course_modules`, `course_lessons` (polymorphic `source_type`: studio_video / scorm_package / external_url / text_md), `course_enrollments` (lesson progress as JSONB until reporting demands a real table; payment snapshot for paid courses), `course_certificates` (signed_payload for verify URL). Migration `0042_courses_creator_program.sql` adds `creator_profiles.courses_active` + seeds `program_courses_terms`. **Routes (`api/src/routes/courses.ts`):** owner CRUD on courses + modules + lessons (gated on Courses program enrollment), publish/unpublish, public browse + detail, free enrolment + lesson-progress patch endpoint (paid enrolment goes through cart with 402 PAYMENT_REQUIRED until #161 SCORM player wraps the launch flow). Frontend: `creator-service.ts` + Wizard + Workspace extended; `UnifiedSearch` adds **Courses** category with `CourseMarketplaceCard`. **Out of scope (next phases):** #161 SCORM 1.2/2004 player runtime via [scorm-again](https://github.com/jcputney/scorm-again), #162 AI course generator (Studio storyboard with `purpose: "course_lesson"`), #165 cert issuance + verify URL, #200 LMS connectors, #201 in-video knowledge checks. |
| 161 | 🔲 Open | Soon | P1 | `feature` | **SCORM 1.2 / 2004 package upload + player** | Phase-2 of the courses build. **Build on [scorm-again](https://github.com/jcputney/scorm-again)** (MIT, TypeScript, 100% spec coverage for SCORM 1.2 + 2004 1st–4th + AICC) for the browser-side API runtime — collapses the spec-compliance work from 6–10 weeks to ~1–2 weeks of integration. Companion libs: **JSZip** (extract package at upload, push assets to R2), **fast-xml-parser** (parse `imsmanifest.xml`), **TinCanJS** (Apache 2.0, xAPI emission). Validate against the official **adlnet/SCORM-2004-4th-Edition-Test-Suite** before claiming conformance. xAPI statement capture feeds the `pointsLedger` (#169). Skip: pipwerks (superseded), Moodle/edX SCORM modules (not extractable), Rustici SCORM Cloud (commercial — keep as enterprise-SLA fallback only). Wiring: SCORM content runs in a sandboxed iframe; scorm-again exposes `window.API` / `window.API_1484_11`; persistence callbacks `fetch` to `/api/courses/scorm/:enrollmentId/commit`; on lesson_status=passed + final assessment passed, emit xAPI statement + issue cert (#165). |
| 162 | 🔲 Open | Soon | P1 | `feature` | **AI course + quiz generator** | Reuse the existing Studio storyboard generator with a new `purpose: "course_lesson"` enum value + lesson-shaped scene types (`learning_objective`, `concept`, `worked_example`, `knowledge_check`, `summary`). One-shot turn a topic/outline into a full module tree with assessments via `callLLMJson`. ~1 week of work given the engine reuse. |
| 163 | 🔲 Open | Soon | P2 | `feature` | **PowerPoint → eLearning conversion** | Server-side (LibreOffice headless on a Cloudflare Container or external worker) vs. client-side (slide-to-image + OCR) — decision pending. Creators drag in a `.pptx`, get an editable course skeleton with one scene per slide. |
| 164 | 🔲 Open | Soon | P2 | `feature` | **Screen recorder for course authoring** | Reuse `frontend/components/studio/WebcamRecorder.tsx` MediaRecorder plumbing. Add desktop audio + optional webcam PiP + per-clip trimming. Already most of the way there from the existing skills-demo recorder (#120). |
| 165 | 🔲 Open | Mid | P1 | `feature` | **Certification issuance + public verify URL** | Verifiable cert ID, issue date, signed payload (Ed25519 or JWT), public `/verify/:certId` page. Native signed URLs vs. third-party (Accredible / Credly) — native preferred for cost; per-cert fee (~$1–$2) covers infra. |
| 166 | 🔲 Open | Mid | P2 | `feature` | **Course authoring — themes & templates** | Reuse the Template Marketplace infrastructure (descriptors + renderer + theme tokens) for course chrome. The same brand-kit infrastructure (#87) drives course branding for L&D buyers. |
| 167 | 🔲 Open | Mid | P2 | `feature` | **Course authoring — teams & workflows (roles/reviews)** | Repurpose `studioReviewComments` + `studioReviewLinks` (#145) — the Frame.io-style threaded comment + tokenized-share-link pattern is exactly the SME / instructional-designer review workflow L&D teams need. Add named-reviewer assignment + draft → review → publish state gates. |
| 168 | 🔲 Open | Mid | P2 | `feature` | **Course accessibility (captions, keyboard nav, WCAG AA)** | Reuse the existing `caption-renderer.ts` (already 4 styles inc. word-by-word). Player chrome audit: keyboard-trap risk on the timeline + chapter nav, alt text on media, colour-contrast tokens, ARIA on knowledge-check forms. |
| 200 | 🔲 Open | Mid | P2 | `feature` | **LMS connectors (Cornerstone / Workday Learning / Docebo / TalentLMS / SuccessFactors)** | Per-provider OAuth + course-publish webhook. The integration story for enterprise L&D buyers — they already have an LMS; we're the authoring + AI engine that exports to it. Mirrors the per-ATS connector pattern from #64 (Greenhouse/Lever/Workday) but for the L&D side. SCORM export from #161 unblocks every LMS in this list at v1; per-provider connectors are the deeper integration tier. |
| 201 | 🔲 Open | Mid | P2 | `feature` | **In-video knowledge checks (`studioVideoForms` repurpose)** | Extend `studioVideoForms` (#140) with `formType: "knowledge_check"`, answer keys, scoring, pass/fail thresholds, and remediation jumps to a prior scene on incorrect. ~50 lines of schema additions over the existing forms infrastructure; the lead-capture form pattern stays untouched. Required for #160 lesson completion and #161 SCORM `cmi.score.raw` reporting. |
| 169 | 🔲 Open | Soon | P1 | `feature` | **Gamification — points ledger + Campaign $ redemption store** | `pointsLedger` (userId, delta, source: completion/streak/clap/share/referral, occurredAt). Redeemable into **Campaign $** (ad/boost credits), **not cash**. Conversion rate snapshotted on the user's account at signup / Partner-Program opt-in; global default rate TBD. Redemption store UI at `/creators/campaign-dollars`. |
| 170 | 🔲 Open | Soon | P1 | `feature` | **Article schema + rich-text editor (Tiptap)** | User-authored articles. `articles` (authorId, title, slug, bodyJson, status, platformFeeBpsAtOptIn, consent snapshot), `articleVersions` (version history). Tiptap editor (ProseMirror-based, fits existing React stack). Draft / published / unlisted states. Does not replace the existing static editorial blog — that stays at `frontend/data/blog-posts.ts`. |
| 171 | 🔲 Open | Soon | P1 | `feature` | **Article read-time + engagement tracking (claps + shares + read-seconds)** | `articleEngagement` rollup table: per-article-per-day `readSeconds`, `clapCount`, `shareCount`, `uniqueReaders`. **Only engagement from authenticated real-account users counts** toward the pool — anonymous/bot/unauth reads excluded. `articleClaps` (userId × articleId × count) with per-user cap (Medium-style). |
| 172 | 🔲 Open | Soon | P1 | `feature` | **Partner Program payout pool + monthly distribution job** | **Pool funded at 0.5% of paid-subscriber revenue per period** (scales with MRR). Distributed by weighted engagement formula across read-seconds, claps, and shares — weighting curve TBD; per-engagement payout resolves to fractions of a penny at current volume. Paid as gift cards (see #174). $50 min, 60-day hold. `partnerPayouts` monthly rows: userId, periodStart, poolTotalCents, userShareCents, paidAt. |
| 173 | 🔲 Open | Soon | P1 | `feature` | **Writer opt-in to Partner Program** | Mirror VoiceCloneManager pattern — consent checkbox, `platformFeeBpsAtOptIn` (not actually used for article payouts but captured for consistency), ToS §9e acceptance, `consentAgreedAt/Ip/Ua`. Earn-gate: active $9.95/mo Pro sub. Free users can publish but do not accrue payable balance. |
| 174 | 🔲 Open | Soon | P1 | `feature` | **Gift-card payout integration (Tremendous / Tango Card)** | Outbound rail for Partner Program + Affiliate Network payouts. API + webhook wiring + recipient email capture. Separate from the per-sale creator payout path (Helcim/Stripe to bank). |
| 175 | 🔲 Open | Soon | P1 | `feature` | **AI content quality + profanity classifier for articles** | Reuses Claude API. Gates Partner-Program earning eligibility per-article at publish time (and on-edit). No human moderation queue — fully automated. Failed articles can still be published (unlisted, TBD) but do not accrue payable engagement. |
| 176 | 🔲 Open | Soon | P2 | `feature` | **Content promotion / boost — polymorphic ads schema retarget** | Current `adCampaigns`/`adSets`/`ads` (`advertising.ts`) schema uses `jobId`/`companyId` FKs — jobs-only. Migrate to polymorphic target: add `contentType` enum (`job` | `company` | `article` | `course` | `template` | `voice_clone` | `service`) + `contentId` uuid. Drop hard FKs or keep alongside nullable. Enables boosts on any creator content. |
| 177 | 🔲 Open | Soon | P2 | `feature` | **Paid boost checkout — USD or Campaign $** | Reuse the existing cart + advertising-campaign structure. Buyers pay with USD (Helcim/Stripe) OR redeem Campaign $ from gamification points (#169). Boost pricing model (fixed CPM vs. bid auction vs. flat slot fee) — decision pending. |
| 178 | 🔲 Open | Mid | P1 | `feature` | **Affiliate Network — scope TBD** | Options: (A) referral affiliates — creators earn when a user they refer signs up / subscribes / purchases; (B) in-article affiliate-link marketplace; (C) both. Shares payout infra with Partner Program: gift cards, $50 min, 60-day hold, $9.95 earn-gate. Revshare % on referred subs/sales TBD. |
| 179 | 🔲 Open | Mid | P1 | `feature` | **ToS additions — §9b Course Creator, §9c Cert Issuance, §9d SCORM licensing, §9e Writer Partner Program, §9f Affiliate Network** | Version and manage via existing centralised legal-docs system (`legalDocuments` / `legalDocumentAcceptances`, shipped 2026-04-07). Each kind seeded via superadmin UI and gated at opt-in. |
| 180 | 🔲 Open | Mid | P2 | `feature` | **Featured-creator ranking surface** | Consumes the universal ratings (#181) + creator analytics (#182) signals to rank and surface top authors across every content type. Powers a "Featured Creators" home-section carousel and a tab on the marketplace. Ranking formula weights rating average × review volume × traffic × engagement depth; tunable constants. |
| 181 | ⚠️ Partial | Soon | P1 | `feature` | **Universal content rating system (all content types)** | **Backend foundation shipped via migration `0032_polymorphic_reviews.sql` + `0035_review_aggregate_cache.sql`** — polymorphic `reviews` table keyed by `subject_type` + `subject_id` covers all content types. **Remaining**: shared `<RatingWidget/>` React component for listing/detail surfaces, owner-facing review moderation UX, and per-content-type aggregate-cache wiring on listing cards. Feeds #180 ranking and #182 creator dashboard. |
| 182 | 🔲 Open | Soon | P1 | `feature` | **Creator analytics dashboard — cross-content views, time on page, scroll depth, heatmap** | Per-content analytics rolled up in `/creators/dashboard` for every content type. Signals captured: (a) views (card impressions + detail-view counts), (b) time on page (dwell per detail view), (c) scroll depth (max scroll % reached, with quartile buckets), (d) heatmap (click/tap/cursor aggregation via pointer events sampled + binned). Reuses the per-second video-analytics plumbing from #122 / `lib/analytics/video-tracker.ts` where applicable; adds a cross-content `contentEngagementEvents` schema (contentType + contentId polymorphic). Creator-facing UI: per-listing drill-down with sparklines + heatmap overlay + rating distribution. Ratings (#181) surfaced on the same dashboard. |
| 183 | 🔲 Open | Soon | P1 | `feature` | **Official (hired.video) vs. community content distinction** | Visually and programmatically distinguish content authored by Sean Hogg / superadmin ("Official") from community-authored content. Data model: `authorType` enum (`platform` \| `community`) on every content-listing row (articles, templates, voice clones, services, courses) — derived at publish time from the publishing user's role, with an admin override for platform-seeded content. UI: "Official" wordmark+checkmark badge on cards and detail pages; "Author: @handle" attribution on community content linking to the creator profile. Marketplace filter toggle "All · Official · Community" across every content surface. Search/ranking boost for Official content configurable per surface. |
| 184 | 🔲 Open | Soon | P1 | `feature` | **Pitch deck reviewer feedback loop** | Extends week-1 pitch deck MVP (tokenized share link of redacted candidates) with reviewer capture: per-candidate thumbs-up/down, free-text notes, shortlist/reject flags, threaded comments. `pitch_deck_reviews` polymorphic table. Email digest back to the recruiter summarising reviewer actions. Reviewer identity via share-token (anonymous) or authenticated account (tracked). Required for closing the full agency ↔ hiring-company feedback loop. |
| 185 | 🔲 Open | Mid | P2 | `feature` | **Authenticated hiring-company collection view** | Companion to #184. When a hiring company creates an account and claims their reviewer identity, consolidate every pitch deck shared with them into a "People · Shared with you" collection. Persistent candidate list, status flags (reviewed/shortlisted/rejected), comments threaded by deck. Uses existing `company_profiles` + `user_company_role_associations` — no new tenancy needed. |
| 186 | 🔲 Open | Soon | P1 | `feature` | **Candidate share consent + GDPR audit trail** | Legal gate for the agency redacted-share feature. `candidate_share_authorizations` table records which candidate authorized which agency to share which resume to which jobs, with expiry. Every tokenized share checks authorization at render time and fails closed. GDPR subject-access-request endpoint exports every share event for a candidate. Required for EU/UK/California operation. |
| 187 | 🔲 Open | Mid | P2 | `feature` | **Resume template extractor tool (upload → descriptor)** | Free tool at `/tools/template-extractor`: upload a resume PDF → multimodal LLM emits a new `ResumeTemplateDescriptor` that reproduces the visual style. Hybrid registry — prefers existing static theme/font/heading keys, creates new `dynamic_themes` / `dynamic_fonts` / `dynamic_heading_styles` rows only when no close match exists. Pro-gated save to private template library. Publish to marketplace requires SuperAdmin review queue (see #188). |
| 188 | 🔲 Open | Mid | P2 | `feature` | **Job + resume template submission queue (SuperAdmin review)** | `/admin/templates/review` surface. User-submitted resume templates (#187) and job templates (week-2 build) enter `listingStatus: "pending_review"`. SuperAdmin can approve/reject with notes. Approve flips to `isPublic: true` + injects into marketplace gallery. Email author on decision. Reuses `superAdminMiddleware` + `email.ts` SendPulse templates. IP attestation required at submission. |
| 189 | 🔲 Open | Later | P3 | `feature` | **merge.dev unified ATS integration** | Complements existing per-provider `ats_connections` (#64) with merge.dev's unified API covering 60+ ATS systems (Bullhorn, Lever, Greenhouse, Workday, Workable, etc.). One OAuth flow on the agency side → bulk candidate import into `talent_pool_candidates` + `candidate_resumes`. Reduces custom provider integration work and enables faster agency onboarding. |
| 195 | ✅ Done | Now | P3 | `arch` | **Hono routes — strip dynamic `await import()`** (2026-04-25) | Punch list from the README "Deferred architectural work" section, originally introduced as a circular-import workaround during the route extraction. Cycle has been resolved; static imports now load eagerly. Cleaned up: 26 ResumeService import pairs in `resumes.ts`, 5 AuthService pairs in `auth.ts`, the lone scraper import in `jobscraper.ts`, the `jose` import in `oauth.ts`, and 2 plan-override pairs in `superadmin/users.ts`. `passkeys.ts` `importCOSEPublicKey()` is a function call — left alone. Net: 65+ dynamic imports → static. TS clean. |
| 196 | ✅ Done | Now | P1 | `feature` | **Articles — creator-authored long-form publishing (foundation)** (2026-04-25) | First slab of #170. Migration `0038_articles.sql` + drizzle schema (`api/src/db/schema/articles.ts`) with title/body_md/summary/cover/category/tags/status/publishedAt/qualityScore/qualityRationale/viewCount/readMinutes. Routes (`api/src/routes/articles.ts`): owner CRUD (`POST/GET/PATCH/DELETE /api/articles/:id`, `POST /api/articles/:id/publish` with AI quality classifier via `callLLMJson`, `POST /:id/unpublish`); public surfaces (`GET /api/articles/public` + `GET /api/articles/public/:userId/:slug` with view-count bump). Frontend: `article-service.ts` typed client, `ArticlesManager.tsx` (list + create + edit + publish + AI rationale display + enroll-first state when not in the Articles Creator Program), `ArticleView.tsx` (public read with `react-markdown` + `remark-gfm`). `card-feed.ts fetchArticles()` now merges static editorial blog with dynamic creator articles, both as `type: "article"` cards in `/search?category=articles`. **Discovery surfaces:** "Write article" CTA on `/dashboard` for authenticated users; `MarketplaceHero` Articles tile points to `/search?category=articles`. **No sidebar entry** — articles are an opt-in creator activity, not a top-level feature. **Auto-feed-post on publish:** publishing emits a `feed_posts` row with `subjectType="article"` + embed payload so articles surface in the social feed too. **Out of scope (deferred):** engagement tracking #171, Partner Program payouts #172–#175 (tied to creator-payout rail; skip until CC/payouts come back). |
| 197 | ✅ Done | Now | P1 | `feature` | **Content abuse reporting (#152)** (2026-04-25) | Closes the user-facing gap for spam/impersonation/inappropriate-content reporting on UGC surfaces — required for §230 / DSA compliance once UGC volume scales. Migration `0039_content_reports.sql` + schema `api/src/db/schema/reports.ts` with polymorphic `entity_type` + `entity_id` matching the `reviews.subject_type` convention; reasons enum (spam/impersonation/inappropriate/harassment/copyright/other); status enum (pending/reviewing/resolved_action_taken/resolved_no_action/dismissed); partial unique index prevents the same reporter from filing duplicate active reports against the same target. Routes: `POST /api/reports` (idempotent; signed-in users), `GET /api/reports/me` (own history), `GET /api/admin/reports` + `PATCH /api/admin/reports/:id/resolve` (SuperAdmin queue). **Frontend "Report" action menu items NOT yet added** to ResumeActionsMenu / JobCard / ArticleCard — backend is shippable; UI can land in a follow-up. |
| 198 | ⚠️ Partial | Now | P2 | `feature` | **Polymorphic reviews / ratings — backend foundation visible** (re-classified 2026-04-25) | Migrations `0032_polymorphic_reviews.sql` + `0035_review_aggregate_cache.sql` cover #181 universal content rating substrate (every content type can be rated). Same pattern as the new `content_reports` polymorphic table from #197 (subject_type/subject_id discriminator). Remaining work documented under #181 (shared `<RatingWidget/>` component, per-listing aggregate-cache wiring, owner-side review moderation UX). |
| 190 | ✅ Done | Now | P1 | `feature` | **Creator Program — multi-program enrollment + event-log lifecycle** (2026-04-25) | Refactored `creator_profiles` into an event-log model so users can independently enroll in **Video Promo / Voice Clone / Services** programs. Migration `0036_creator_programs.sql`: drops `UNIQUE(user_id)`, adds `ended_at TIMESTAMPTZ`, adds per-program flags (`video_active` / `voice_active` / `services_active`), partial unique on `(user_id) WHERE ended_at IS NULL`, and seeds three placeholder legal-doc kinds (`program_video_terms` / `program_voice_terms` / `program_services_terms`). API rewrite in `creators.ts`: `POST /opt-in` now takes `programs[]` + per-program terms acceptance + 409 if active row exists; new `POST/DELETE /me/programs/:program` (toggle a program with terms re-check on enable); new `POST /me/cancel` (sets `ended_at`, clears flags). `is_active` retained as a derived column maintained by the routes. `og.ts` + `users.ts` updated to filter to active row. Frontend: `creator-service.ts` typed service layer, `CreatorEnrollmentWizard.tsx` (3-step modal: programs → per-program terms → profile), `CreatorWorkspace.tsx` (per-program enable/disable, profile/portfolio editors, "Leave program" cancel). Standalone `/creators/dashboard` deleted; users manage everything from `/services`. |
| 191 | ✅ Done | Now | P1 | `feature` | **Marketplace rename + standalone Creators page removal** (2026-04-25) | Sidebar/Navigation "Sell Hub" → **"Marketplace"**. Standalone `/creators` browse and `/creators/dashboard` deleted; routes redirect to `/search?category=creators` and `/services` respectively. `/creators/:userId` redirects to `/people/:userId?tab=services`. The orphaned `SellHub.tsx`, `CreatorsBrowse.tsx`, and `CreatorPublicProfile.tsx` files removed. EarnHubBanner + CreatorPitchAside CTAs now route to `/services?wizard=open` (auto-opens the enrollment wizard). |
| 192 | ✅ Done | Now | P1 | `feature` | **People profile Profile/Services tabs + Creator badge** (2026-04-25) | `/people/:id` main column wrapped in **Profile / Services** tabs. Services tab surfaces the creator's `displayName` + `tagline` + `bio` headline (when enrolled) above the existing `ServicesSection`. `PeopleCard` renders a purple "Creator" badge alongside the existing "Open to Work" / status badges. `/api/users/public` and `/api/users/:id` now expose `isCreator` (derived from active enrollment row) + `creatorPrograms: { video, voice, services }` + nested `creatorProfile` (displayName/tagline/bio/categories) on the detail endpoint. `PublicUserSchema` Zod schema extended so the fields aren't stripped on the way to the frontend. |
| 193 | ✅ Done | Now | P1 | `feature` | **UnifiedSearch — Creators + Services categories** (2026-04-25) | Added two categories to `/search` filter pills (alongside existing Voices). **Creators** filters People to `isCreator=true` (defensive `type === "people"` check stops non-people leaking through). **Services** fetches from new `GET /api/services/browse` and renders `ServiceMarketplaceCard`. `<SellHub />` block removed from the page; `MarketplaceHero` retained below results. |
| 194 | ✅ Done | Now | P1 | `feature` | **Platform-service flag + differentiated CTA** (2026-04-25) | `service_offerings.is_platform_service BOOLEAN` (migration `0037_platform_service_flag.sql`, partial index on truthy rows). Admin-managed via `PUT /api/services/:id` (SuperAdmin gate); `GET /api/services/browse` exposes the flag and orders platform offerings first. `ServiceMarketplaceCard` renders platform listings with a "hired.video" badge, gradient styling, and an **"Enroll in Creator Program"** CTA → `/services?wizard=open` (auto-opens the wizard); user-listed services keep the standard **"Request quote"** CTA. SuperAdmin still needs to flip `isPlatformService=true` on the curated funnel offerings before launch. |
| 199 | ✅ Done | Now | P1 | `feature` | **Articles becomes the 4th Creator Program** (2026-04-25) | Articles publishing (#196) is now gated behind opt-in to the Creator Program — same model as Video Promo / Voice Clone / Services. Migration `0040_articles_creator_program.sql`: `creator_profiles.articles_active BOOLEAN`, `program_articles_terms` legal-doc kind seeded with placeholder. `creators.ts` route + `creators.ts` schema extended: `CREATOR_PROGRAMS` includes `"articles"`, `flagFor("articles")` → `articlesActive`, `deriveIsActive` includes the flag, `/me/cancel` clears it. `creator-service.ts` extends `CreatorProgram` union, label, description, and icon. Wizard + Workspace render Articles as a 4th program tile (icon: FileText). `/api/users/public` and `/api/users/:id` now expose `creatorPrograms.articles` alongside the other three. **Gating wired:** `POST /api/articles` and `POST /api/articles/:id/publish` both 403 with `PROGRAM_NOT_ENROLLED` unless the caller has an active Articles enrollment. `ArticlesManager.tsx` shows an **enroll-first state** (lock icon + CTA → `/services?wizard=open`) when the user is signed in but not enrolled. |
| 202 | ✅ Done | Now | P1 | `feature` | **One-click YouTube publishing (Pro)** (2026-04-26) | Pricing-page Pro claim closed end-to-end. Migration `0043_youtube_connections.sql` + schema `studiofeatures.ts.youtubeAccounts` (mirrors `linkedinAccounts`: googleId/channelId/channelTitle/email/access+refresh tokens + expiry + scopes + `is_active` soft-delete). `routes/youtube.ts` rewritten — replaced the previous stub (which returned synthetic `yt_…` IDs) with real Google OAuth + Data API v3 multipart upload. `GET /auth-url` issues web-flow consent URL with `youtube.upload`+`youtube.readonly`+`userinfo.email` scopes (no more deprecated OOB). `POST /callback` exchanges the code at `oauth2.googleapis.com/token`, fetches user info + `/channels?mine=true` to capture channelId/channelTitle, upserts by `(userId, googleId)`. `POST /publish/:videoId` is `requirePremium`-gated: pulls the compiled MP4 from R2 via `cdnUrl(video.r2Key)`, lazily refreshes the access token via `getFreshAccessToken`, then `multipart/related` POSTs to `https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status` with title/description/tags/privacy from the request body, and persists `youtubeVideoId` + `youtubeUrl` on the row. Frontend service `youtube-service.ts` already aligned with this signature. Needs `YOUTUBE_CLIENT_ID` + `YOUTUBE_CLIENT_SECRET` Cloudflare secrets — code reports 503 `YOUTUBE_UNAVAILABLE` until set. Streaming-body optimization (avoid materializing the MP4 in Worker memory) noted as a follow-up; current path supports the typical resume-video size range. |
| 203 | ✅ Done | Now | P1 | `feature` | **AI LinkedIn post generation (Pro)** (2026-04-26) | `POST /api/studio/linkedin/generate-post` added in `studio-features.ts` — `requirePremium("LinkedIn AI Post")`-gated, validates the project belongs to the caller, flattens `studio_projects.storyboard.scenes[]` titles/subtitles/text into a one-line-per-scene transcript, runs through `aiCall`/`callLLMJsonWithUsage` with a hook+caption+hashtags JSON-schema and a tone selector (professional / casual / bold / story). Heuristic fallback returns a workable post when no LLM key is configured. Token spend recorded against the user's monthly budget. Frontend: `generateLinkedInPost()` typed client added to `studio-features-service.ts`; `LinkedInPublisher.tsx` `ComposePanel` now shows a "Generate with AI" button (Sparkles icon) that fills the Textarea with `${hook}\n\n${caption}\n\n${hashtags.map(h => "#"+h).join(" ")}` and re-labels to "Regenerate" once content is present. |
| 204 | ✅ Done | Now | P1 | `billing` | **Tier-based priority job matching ranking** (2026-04-26) | `discovery.ts` `GET /api/discovery/jobs` now reads `getSubscription(userId).isPremium` and applies a Pro-only rank boost on top of the existing per-term relevance + sponsored bump: title-overlap multiplier (title hits ~3× description hits), recency bonuses (≤7d +15, ≤30d +5), and a small +5 sponsored amplifier. Pro users also get a wider candidate pool (limit 200 vs 100 pre-rank) so the boost actually re-orders. Response now exposes `priorityRanked: boolean` so the frontend can label "Priority result" cards. Reuses the cached `getSubscription()` (#8) for ~0 added latency. `match.ts` was intentionally left untouched — every handler there returns single-pair scoring (analyze/tailor/byid/byContent/insights), not a list, so there is no list-ordering surface to tier-boost; the pre-existing `requirePremium` on `/match/insights` (#24) already covers Pro-only insights enrichment. |
| 205 | ✅ Done | Now | P0 | `billing` | **Video & profile analytics — Pro gate** (2026-04-26) | `requirePremium("Video Analytics")` added to `studio-features.ts` `GET /analytics/:videoId` (heatmap/drop-off/viewer-company aggregation) and `studio.ts` `GET /videos/:videoId/analytics` (CTA clicks / share counts / CTR). `POST /analytics/track` stays public so anonymous viewers can record events. Free users still see basic `viewCount` via `/api/studio/projects` (#89) — matching the Pricing comparison split "Basic (views only)" vs "Advanced (heatmaps, CTA clicks, campaigns)". `VideoAnalyticsDashboard.tsx` already displays the upgrade prompt for non-Pro users; the route now returns the 402 PREMIUM_REQUIRED envelope it expects. |
| 206 | 🔲 Open | Mid | P2 | `feature` | **Calendar Link Templates (Intro / Interview / Follow-up)** | Booking-page presets layered on top of #11 OAuth. New `calendarLinkTemplates` table + public booking URLs per template. |
| 207 | 🔲 Open | Mid | P1 | `feature` | **Candidate Submittal Agent (auto-generated executive submittal)** | Background job consumes `candidateSubmissions` row + résumé + scorecards, emits a branded submittal doc via the existing storyboard generator (`purpose: "submittal"`) and returns a tokenized share link. Reuses ATS package pattern (#118). |
| 208 | 🔲 Open | Mid | P2 | `feature` | **Self-updating CRM Agent (background person re-enrichment)** | Cron walks `talentPoolCandidates` older than N days, calls BurnRateOS reconcile API, snapshots deltas onto local refs, logs change-set on the person timeline. No external provider call from hired.video. |
| 209 | 🔲 Open | Now | P1 | `feature` | **Configurable workflow stages (per-tenant kanban columns)** | New `workflowStages` table (id, tenantId, name, color, orderIndex, isBuiltIn). Replaces hard-coded `candidateSubmissions.status` enum with FK. Default seed: Applied / Longlist / Shortlist / Outbound / Screening / Submitted / Interviewing / Rejected / Hired. |
| 210 | 🔲 Open | Now | P1 | `feature` | **Progression-activity engine (activity → stage transition map)** | `activityStageTransitions` table maps activity types (Note / Phone Call / Sent Email / Interview Scheduled / etc.) to target `workflowStages`. Logging an activity advances stage via the engine; "activity-only" rows do not. Auditable via `candidateInteractions` log. |
| 211 | 🔲 Open | Now | P2 | `feature` | **"Customise Activities" workspace-global semantics** | Activity registry is tenant-scoped, not per-user. Edits guarded by an irreversible-action confirm (mirror Loxo's "cannot be undone" copy). Audit trail + admin-only edit gate. |
| 212 | 🔲 Open | Soon | P2 | `feature` | **Outreach Campaign Templates library** | Seed 4 starter sequences (Candidate Outreach for Job, Email-only Outreach, Biz Dev Outreach, Biz Dev: New HM at Company). New `outreachCampaignTemplates` table; clone-into-sequence on selection. |
| 213 | 🔲 Open | Soon | P2 | `feature` | **Per-stage email variants in outreach sequences** | Multi-variant per step on `followUpSequenceSteps`; per-variant open/click/reply counters; UI warning that personalisation tokens are disabled when variants are on (mirror Loxo wording). |
| 214 | 🔲 Open | Soon | P2 | `feature` | **Workspace-level Outreach Hours of Operation** | Tenant-scoped send-window config distinct from per-user `users.workingHours`. Cron honours both before dispatching outreach. |
| 215 | 🔲 Open | Soon | P1 | `feature` | **Source UI (`/recruiter/source` shell)** | Filter rail + result grid + per-card actions. Calls BurnRateOS reconcile API for the contact graph. Replaces Loxo Source. Frontend only — no candidate data stored beyond tenant-side `sourcedPersonRefs`. |
| 216 | 🔲 Open | Soon | P1 | `feature` | **Tri-state sourcing triage (Yes / Maybe / Hide + Undo)** | `talentPoolCandidates.triageDecision` enum. Yes → auto-add to longlist (stage transition). Maybe → keep in session pool. Hide → suppress for this recruiter for N days. Undo restores prior state. |
| 217 | 🔲 Open | Soon | P2 | `feature` | **Natural Language Search on Source** | LLM front-end translates free-text ("senior react engineers in Berlin who speak German") to the existing #70 Boolean parser AST. Reuses `callLLMJson` + Zod schema; metered against the user's token budget. |
| 218 | 🔲 Open | Mid | P2 | `feature` | **Talent Insights aggregate panel** | Top-10 industries / countries / states bar charts of the current result set, with Charts↔Tables toggle and Share button (tokenized read-only link). Backed by pre-aggregated facets returned alongside `/api/search/recruiter` results. |
| 219 | 🔲 Open | Mid | P3 | `feature` | **"Done Sourcing" session log + history** | New `sourcingSessions` table (recruiterId, startedAt, endedAt, queryAst, candidatesReviewed, yes/maybe/hide counts). Powers per-recruiter activity reports + Talent Insights time-series. |
| 220 | 🔲 Open | Mid | P2 | `feature` | **Sourcing filters: Diversity / Security Clearance / Tenure / Company Ranking / Company Size** | Schema additions to consumer-side `sourcedPersonRefs` (snapshot fields, indexed). Diversity filter consent-gated and fed by Diversity taxonomy (#236). |
| 221 | 🔲 Open | Mid | P3 | `feature` | **Sourcing filter: Timezone (Beta)** | Derived at index time from `sourcedPersonRefs.location` via tz lookup table; UI filter on the Source rail. |
| 222 | 🔲 Open | Mid | P2 | `feature` | **Configurable sales-pipeline stages with $-value + win-prob %** | Extends #99 BD pipeline with per-stage config: dollar value, win-probability %, ARR rollup. New `pipelineStages` table; replaces hard-coded `recruiterDeals.stage`. |
| 223 | 🔲 Open | Mid | P2 | `feature` | **Deals object with owner switcher + custom pipeline assignment** | Builds on #99 `recruiterDeals` — add `pipelineId`, `ownerId`, `ownerType` columns; multi-pipeline support per tenant. |
| 224 | 🔲 Open | Mid | P3 | `feature` | **Pitches object (pre-deal opportunity record)** | Polymorphic `recruiterPitches` keyed off company / job / role triplet. Distinct from Deal — no committed fee yet. Feeds Deal creation when accepted. |
| 225 | 🔲 Open | Soon | P1 | `feature` | **Multiple placements per job + bulk save** | Schema already 1:N capable. Add UI: "Save N placements" bulk action on the job detail; each row gets independent splits/fees. |
| 226 | 🔲 Open | Soon | P1 | `feature` | **Placement Type field driven by Job Type taxonomy** | `placements.placementTypeId` FK → `workspaceJobTypes` (#232). Enables FT / Contract / C2H differentiation in commission engine + back-office fields. |
| 227 | 🔲 Open | Soon | P1 | `feature` | **Placement fee — Flat \| Percent toggle** | Add `feeMode` enum + `feeFlatCents` / `feePercentBps` columns on `placements`. Commission engine reads either branch. |
| 228 | 🔲 Open | Soon | P1 | `feature` | **Placement splits across recruiters** | New `placementSplits` (placementId, ownerUserId, ownerType, percentBps). Sums-to-10000-bps validation. Commission engine fans out per-row. |
| 229 | 🔲 Open | Mid | P2 | `feature` | **Placement back-office fields (invoice / payable / payroll)** | Collapsible section on placement editor; columns added to `placements` (PO number, invoice schedule FK, payroll vendor, billing contact, etc.). Pairs with #259 Xero + #262 invoice schedules. |
| 230 | 🔲 Open | Mid | P3 | `feature` | **Per-placement email-notification subscriptions** | `placementNotificationSubscriptions` row per (placementId × event × userId). Fires on stage events (signed / started / first-day / guarantee-expires). |
| 231 | 🔲 Open | Soon | P1 | `feature` | **Three-axis Tags taxonomy (Company / Job / Person)** | `workspaceTags` (id, axis enum, name, colorHex, orderIndex, isBuiltIn). Polymorphic `tagAssignments` (axis, entityId, tagId). Seed 25 default industry tags on the Job axis. Drag-handle ordering UI. |
| 232 | 🔲 Open | Soon | P1 | `feature` | **Job Type taxonomy with bill / pay / overtime / fee defaults** | `workspaceJobTypes` (FT-Yearly / Contract-Hourly / C2H-Hourly + custom). Per-row financial defaults (billRate, payRate, overtimeMultiplier, defaultFeeBps). Feeds #226 + #262 invoice templates. |
| 233 | 🔲 Open | Soon | P3 | `feature` | **Company Type taxonomy (Client / Other / + custom)** | `workspaceCompanyTypes`; FK on `companyProfiles.companyTypeId`. Drives BD-pipeline filtering. |
| 234 | 🔲 Open | Soon | P2 | `feature` | **Rejection Reason taxonomy** | `workspaceRejectionReasons` with 12-row built-in seed (Underqualified / Overqualified / Skills / Personality Match / Not interested / Comp / Remote / Commute / Accepted other / etc.). Feeds rejection modal + funnel-loss analytics. |
| 235 | 🔲 Open | Mid | P3 | `feature` | **Email / Phone / Address Type taxonomies (Personal / Work / Main / Alternate / Billing)** | Three small bounded enums on `personEmails` / `personPhones` / `personAddresses`. Replaces ad-hoc strings. |
| 236 | 🔲 Open | Mid | P2 | `feature` | **Diversity self-ID taxonomy (consent-gated)** | `workspaceDiversityValues` + `personDiversitySelfId` (with `consentedAt`, `consentedIp`). Schema-isolated from EEOC reporting. Feeds #220 Diversity filter (which only reads consented rows). |
| 237 | 🔲 Open | Soon | P3 | `arch` | **`isBuiltIn` semantics + delete-guard middleware across taxonomies** | Cross-cutting: every taxonomy table has `isBuiltIn BOOLEAN`. Delete handler 409s on built-in rows. Hides Delete button in UI. Applies to #231–#236, #238, #239. |
| 238 | 🔲 Open | Mid | P3 | `feature` | **Sources taxonomy (origin attribution on people / jobs)** | `workspaceSources` (Inbound / Referral / Sourced / Job Board / Event / Other + custom). FK on `talentPoolCandidates.sourceId` + `jobItems.sourceId`. Replaces ad-hoc string fields. |
| 239 | 🔲 Open | Mid | P3 | `feature` | **Statuses taxonomy (workspace-level)** | Generic person/company status (e.g. "Do not contact", "Out of country", "Placed elsewhere"). Orthogonal to workflow stage. `workspaceStatuses` + polymorphic assignment. |
| 240 | 🔲 Open | Soon | P1 | `feature` | **Granular Job Share Permissions matrix (16+ field-level toggles)** | `jobSharePermissions` JSONB on `jobItems` — one boolean per candidate field (Name, Compensation, Photo, Title, Location, Social URLs, Experience, Education, Notes, Summary, Latest Activity, Resumes, Kanban Card Fields, Intake) + Job Attachments. HM-portal renderer gates each field against the matrix. |
| 241 | 🔲 Open | Soon | P1 | `feature` | **Scorecard visibility tri-state for hiring managers** | `jobScorecardVisibility` enum: hide-HM-until-submit / always-hide-HM / always-show-HM. Tenant default + per-job override. Renderer in HM portal applies the rule. |
| 242 | 🔲 Open | Soon | P1 | `feature` | **Hiring-manager scorecards (HM-authored, structured)** | Distinct from candidate self-assessment. `hiringManagerScorecards` (jobId, candidateId, hmUserId, ratings JSONB, comments, submittedAt). Configurable via Org → Scorecards. Feeds #241 visibility rules. |
| 243 | 🔲 Open | Soon | P1 | `feature` | **Candidate Packet generator + Anonymize toggle** | Multi-candidate PDF/HTML export keyed off `candidateSubmissions`. Anonymize replaces name + email + photo with initials. Reuses ATS package generator (#118) renderer + storyboard layout. Powers the recruiter→hiring-manager submission artefact. |
| 244 | 🔲 Open | Soon | P1 | `feature` | **Compliance workspace (GDPR + EEOC + Outreach unsub + SMS consent)** | One Settings → Compliance tab consolidating: GDPR scope (All / EU only / etc), lawful basis (legitimate interest vs consent) for archived candidates, retention period, privacy-policy link, EEOC scope, SMS-consent ledger, bulk-≥10 unsubscribe-injection toggle. Wires existing `privacyPreferences` + adds tenant-scoped policy rows. Closes the surface gap left by #186. |
| 245 | 🔲 Open | Soon | P2 | `feature` | **Email safety tolerance slider + auto-throttle on spam-behavior detection** | Tenant pref (Safe / Moderate / High / Risky) → daily-cap + min-interval-between-sends. Cron honours both; auto-downgrades the tier on bounce-rate / complaint-rate spikes. Feeds outreach + transactional sends. |
| 246 | 🔲 Open | Mid | P3 | `feature` | **Email tracking toggles (Opens / Clicks / Downloads)** | Workspace defaults + per-message override. Tracking pixel + click-redirect omitted when disabled. Outreach campaigns track regardless (mirror Loxo behaviour). |
| 247 | 🔲 Open | Mid | P4 | `feature` | **Email default style preset (font / size / line-height / colour)** | Saved on `accountPreferences.emailStyle`. Composer + outreach-send pipeline inject the inline CSS. Includes the Loxo deliverability tip ("plain styles deliver better"). |
| 248 | 🔲 Open | Mid | P2 | `feature` | **Forms (custom application / intake forms)** | Tenant-scoped form builder distinct from in-video lead capture (#140). Schema: `workspaceForms` (fields JSONB), `workspaceFormSubmissions`. Public URL per form; submissions create / update candidate records. Replaces ad-hoc Google Form / Typeform usage. |
| 249 | 🔲 Open | Mid | P3 | `feature` | **Custom Validations (per-tenant required-field rules)** | Rules engine on `candidateSubmissions` save: e.g. "phone required before Submitted stage", "salary required before Hired". `workspaceValidationRules` (entityType, condition, requiredFields). Returns 422 with structured errors. |
| 250 | 🔲 Open | Mid | P2 | `feature` | **Custom Roles (per-tenant RBAC beyond superadmin/owner)** | Extends `users.role` (system-wide) with `workspaceRoles` + `workspaceRolePermissions` matrix. Admin UI to define a role + flip per-feature toggles. Read by `requireWorkspacePermission()` middleware. |
| 251 | 🔲 Open | Soon | P1 | `feature` | **Resume Forwarding Address (`{slug}.resume-forward.hired.video`)** | Per-recruiter inbound email address. MX + Mailgun-style inbound webhook handler parses From + attachment via existing résumé parser (#149), creates a `talentPoolCandidates` row, attaches the parsed résumé. Spam filter + size cap. |
| 252 | 🔲 Open | Mid | P2 | `feature` | **Boost Approvals queue (job-amplification governance)** | Tenant pref `requireBoostApproval`. Sponsored-job purchases (#106) and company-boost purchases (#107) enter `pending_approval` until an owner-role user approves. Adds `boostApprovals` queue. |
| 253 | 🔲 Open | Mid | P4 | `feature` | **"Show Rejected By Types on Rejection Modal" toggle** | Tenant pref. Reuses Rejection Reason taxonomy (#234). When on, the rejection modal additionally captures Rejected By: Candidate / Client / Consultant. |
| 254 | 🔲 Open | Mid | P3 | `feature` | **Per-user notification prefs: ownership-change + SMS-response routing** | `notificationPreferences` rows: emailOnOwnershipChange, emailOnPlacementUpdate, smsResponseNotifyOwner. Read by the existing notifications dispatcher. |
| 255 | 🔲 Open | Mid | P3 | `feature` | **Inbound SMS routing rule → Person Owner** | Inbound SMS webhook (extends #97) maps `from` to person record, looks up the assigned owner, emits an in-app + email notification. |
| 256 | 🔲 Open | Mid | P2 | `feature` | **Workday integration (in-house tenants — WS URL + OAuth2)** | Beyond #64 ATS connector. Per-tenant Workday Web Services URL + OAuth2 client/secret/refresh-token store. Job + candidate sync via SOAP. Targets the Workday-running enterprise that wants hired.video as the front-end. |
| 257 | 🔲 Open | Soon | P1 | `feature` | **Okta SSO (per-tenant OIDC)** | `tenantSsoConnections` row (provider="okta", clientId, clientSecret, oktaDomain). OIDC flow; auto-provisions users on first login. Required for any enterprise deal. |
| 258 | 🔲 Open | Soon | P1 | `feature` | **SAML 2.0 SSO (metadata XML upload)** | Generic SAML IdP-init + SP-init. Stores IdP metadata XML, certificate, SSO URL on `tenantSsoConnections`. Pairs with #257 Okta as alternative auth method. |
| 259 | 🔲 Open | Mid | P2 | `feature` | **Xero integration (invoice / payable sync)** | Per-tenant Xero OAuth2 client/secret + redirect URI. Syncs `placements` back-office (#229) into Xero invoices and bills. |
| 260 | 🔲 Open | Mid | P3 | `feature` | **RingCentral integration (click-to-call + call-log sync)** | Complements existing SignalWire phone (#97) for tenants standardised on RingCentral. Per-user OAuth; inbound call events land on the person timeline. |
| 261 | 🔲 Open | Mid | P3 | `feature` | **Generic API-key vendor integrations registry** | Self-serve `tenantIntegrations` (provider, slug, credentials JSONB encrypted) for the long tail. Lets workspace admins paste credentials for any vendor without a custom connector. Surfaces in Settings → Integrations. |
| 262 | 🔲 Open | Mid | P2 | `feature` | **Invoice schedules (recurring invoice config)** | `invoiceSchedules` (tenantId, cadence, nextRunAt, lineItemTemplate). Cron generates invoices into Xero (#259) on schedule. Pairs with #229 placement back-office. |
| 263 | 🔲 Open | Mid | P4 | `feature` | **Default currency / country / timezone (workspace-level)** | `accountPreferences` extension. Threads into formatting helpers (Intl.NumberFormat / DateTimeFormat) across the app. |
| 264 | 🔲 Open | Mid | P3 | `feature` | **Enrichment policy: catch-all + unknown email toggles** | Tenant policy flags passed through to BurnRateOS reconcile call as suppression hints. Default: catch-all OFF, unknown OFF. |
| 265 | 🔲 Open | Mid | P3 | `feature` | **Auto-merge vs review queue for duplicate persons** | Tenant policy. When manual-review selected, candidate merges land in `personMergeQueue` for owner approval. Auto-merge applies BurnRateOS confidence threshold. |
| 266 | 🔲 Open | Later | P4 | `feature` | **AI Notetaker (Zoom / Meet / Teams join + meeting transcript sync)** | Loxo's AI Notetaker + Notetaking Agent consolidated. **Delegated to BurnRateOS sister product**, not on hired.video roadmap. Hired.video may consume the resulting transcript via webhook to attach to a `talentPoolCandidates` activity row, but the meeting bot, video-provider OAuth, and transcript service all live in BurnRateOS. Tracked here for product-completeness awareness. |
| 267 | ✅ Done | Now | P0 | `billing` | **Per-action credit ledger (Loxo Credits parity) — superseded by token model** | Loxo bills 1cr per personal email, 0.2cr per work email, 0.1cr per submittal, 0.02cr per CRM update, etc. Decision recorded **2026-04-11**: hired.video uses token-bucket pricing instead — Pro $9.95/mo + 1M tokens, packs $3.99–$199.99 (cost basis $3/M after infra). Per-action credit model rejected as a poor fit for an AI-native product where consumption tracks model tokens, not human actions. See #94 (AI credit add-on packs) for the implemented mechanism. |
| 268 | 🔲 Open | Later | P4 | `feature` | **Contact resolver / canonical contact graph (Loxo Source's underlying data layer)** | **Delegated to BurnRateOS** per [docs/prd/integrations-and-sourcing.md](hired.video/docs/prd/integrations-and-sourcing.md). Hired.video consumes the BurnRateOS `/v1/contacts/{lookup,reconcile,batch}` API and holds only `sourcedPersonRefs` snapshot+UUID rows locally. The provider registry, enrichment cache, suppression list, DSR queue, and creator-marketplace integration spec all live in BurnRateOS. Tracked here so the source-graph dependency is visible alongside the Loxo Source UI shell (#215) and triage (#216). |
| 269 | ✅ Done | Now | P1 | `feature` | **Studio video ↔ entity association (polymorphic subject linking)** | `studio_projects.subject_kind` + `subject_id` columns added (migration `0056_studio_subject_link.sql`) with backfill from the legacy `resume_id`. Drizzle schema updated with the `idx_studio_projects_subject` index. `POST /api/studio/save-draft` accepts the pair; `GET /api/studio/projects?subjectKind=&subjectId=` filters by it. Shared helper `shared/studio-subject.ts` (`STUDIO_SUBJECT_KINDS`, `parseStudioSubject`, `formatStudioSubject`, `STUDIO_SUBJECT_LABEL`) so api + frontend agree on enum, parse, and labels. Studio bootstrap reads `?subject=kind:id[&new=1]` and `?projectId=…` — selects the most-recent matching project, opens it for editing, or pops the wizard with the subject pre-bound. `pendingSubject` round-trips through `saveDraft` so the link sticks across sessions. Done 2026-05-01. |
| 270 | ✅ Done | Now | P1 | `feature` | **`<EntityVideos>` reusable scroller + Resume card integration** | `frontend/components/studio/EntityVideos.tsx` — self-contained scroller (own data fetch, own loading state, own visibility gate). First chip is `+ Create Video` deep-linking to `/studio?subject=resume:abc&new=1`; subsequent tiles show thumbnail + hover-play overlay + small edit icon. Dropped into `ResumeCard` above the variations strip; inline `Create Video` button placed next to `+ Variation`. `frontend/components/studio/CreateVideoMenuItem.tsx` is a drop-in `<DropdownMenuItem>` used by `ResumeActionsMenu` — owner-only `Video Resume` entry that uses the same shared formatter. Done 2026-05-01. |
| 271 | ✅ Done | Soon | P2 | `feature` | **Apply `<EntityVideos>` to Profile / Job / Company / Skills Demo cards** | Same `<EntityVideos>` and `<CreateVideoMenuItem>` dropped into `JobCard` (`subject={{ kind: "job", id }}`), `CompanyCard` (`{ kind: "company" }`), `PeopleCard` (`{ kind: "profile" }`). Each surfaces the scroller above the fold and adds a `Video XXX` item to the card's overflow menu, owner-gated. Skills Demo subject reserved (`kind: "skills_demo"`) — no standalone card surface today, but the kind is wired through schema, API, and shared enum so a future drop-in is one component away. Done 2026-05-01. |
| 272 | ✅ Done | Now | P1 | `feature` | **InteractiveCanvas foundational layer (cross-host element model)** | Generalised the studio's `SceneElement` union (text/image/video/audio/chips/chart) into a host-agnostic `RenderableElement` + `InteractiveCanvas` model in `frontend/types/renderable-element.ts` (`SceneElement` stays as a back-compat alias). Added `WebcamElement` kind (separate from `VideoElement` — owns its own getUserMedia permission lifecycle so public surfaces don't surprise viewers with a prompt). New shared components: `<RenderableElementView>` (DOM-mode dispatch reusing `<ChartRenderer>` + `<VideoPlayer>`), `<InteractiveCanvasView>` (positioned host with self-gating empty-state), `<InteractiveCanvasEditor>` (lean host-agnostic editor — text/image/video/audio/chips/chart/webcam, no studio-specific stock-media). Resume schemas (`Work` / `Volunteer` / `Education` / `Certificate` / `Project`) gain `interactive?: InteractiveCanvas` (stored as `z.unknown()` since the canonical type lives in frontend; renderer self-gates via `isInteractiveCanvas`). ATS / PDF / Word / plain-text exports strip `interactive` via shared `stripInteractive()` helper so downstream JSON-Resume consumers stay compatible. Done 2026-05-01. |
| 273 | 🔲 Open | Soon | P1 | `feature` | **Resume sub-record editor + viewer mounts for InteractiveCanvas** | Drop `<InteractiveCanvasEditor>` into each per-record edit form in `ResumeBuilder` (`WorkExperienceSection`, `VolunteerSection`, `EducationSection`, `ProjectsSection`, `CertificationsSection`) and `<InteractiveCanvasView>` into the read-only resume detail (`DeclarativeResumeRenderer`). Foundational layer (#272) shipped — this is the per-record wiring. ~30 lines per section. |
| 274 | 🔲 Open | Soon | P2 | `feature` | **Company page InteractiveCanvas integration** | Add `interactive?: InteractiveCanvas` to `companyProfiles.description` adjacent metadata + drop `<InteractiveCanvasEditor>` into `CompanyEditForm` and `<InteractiveCanvasView>` into `CompanyDetail`. Lets employers embed an interactive demographics chart, welcome webcam, etc. on the public company page. Permission: company-owner-only edit. |
| 275 | 🔲 Open | Soon | P2 | `feature` | **Profile + Job page InteractiveCanvas integration** | Same drop-in pattern for `userProfiles` (per-section: About / Skills / Headline) editable via existing `EditAboutDialog` etc., and for `jobItems.description` editable via `JobEditForm`. Owner-gated. Closes the cross-host rollout opened by #272. |
| 276 | ✅ Done | Now | P1 | `feature` | **NLE M1 — Timeline data foundation (Lightworks-class video editor, Phase 1 of 5)** | Shared `Timeline` JSON spec at `shared/timeline.ts` (Track / Clip / Transition / MediaSource / RenderJob types + `isRenderable`, `pickRenderEngine`, `clipsOverlap`, `timelineDurationFrames`, `emptyTimeline`, `defaultTrack` predicates — single source of truth, every editor and render path reads from these). Migration `0067_nle_timeline.sql` extends `studio_projects` with `kind ('scene' \| 'nle')` discriminator + `timeline_spec jsonb`, plus new `nle_media_sources` table (sha256 dedup per workspace owner). Drizzle schema in `api/src/db/schema/nle.ts`. Reuses existing `canActFor()` workspace ownership — no new permission primitives. Foundation for M2–M5. Done 2026-05-03. See `memory/project_nle_decision.md` for the full milestone phasing. |
| 277 | ✅ Done | Now | P1 | `feature` | **NLE M1 — Editor surface (single `/studio` host, kind-dispatched canvas)** | `<CanvasForProject>` is the single dispatcher (DRY: one branch on `project.kind`, no caller branches inline). `<NleCanvas>` mounts inside the existing `StudioLayout` so the studio shell (sidebar / save / publish / brand kits / voiceover panel) is shared with the scene editor. New "Film" entry in `StudioSidebar` calls `handleCreateFilm` → `nleApi.create`. `<TimelineCanvas>` (frame ruler + multi-track strip + sticky-left header / mute / solo + zoom 1–16px/frame + click-to-seek), `<SourcePanel>` (drag-and-drop file probe via `lib/timeline/source-probe.ts`, draggable rows, dedup-aware add-to-track), full clip ops (`insertClip` / `deleteClip` / `trimLeftEdge` / `trimRightEdge` / `splitClipAt` / `setOutTransition` in `lib/timeline/operations.ts`), trim handles on selected clips, transition picker (cut / cross-dissolve / fade-to-black), keyboard shortcuts (`Del` / `S` / `Space`). `kind`-aware `handleSave` routes NLE saves through `nleApi.save` while leaving the legacy scene saveDraft path untouched. Done 2026-05-03. |
| 278 | ✅ Done | Now | P1 | `feature` | **NLE M1 — Client-side render engine (Timeline → MP4 with audio)** | Render facade `lib/timeline/render.ts` is the only entry point — picks engine per Timeline shape (`pickRenderEngine`) and dispatches to lazy-loaded strategies. WebCodecs strategy (`webcodecs-render.ts`) consumes the Timeline directly: VideoEncoder with adaptive AVC profile (Baseline 3.0 / Main 3.1 / High 4.0) + `mp4-muxer`; per-frame composition via shared `frame-renderer.ts` (background fill → per-track active-clip lookup → cover-fit drawImage → cross-dissolve / fade-to-black blend). Audio mix via `audio-mixer.ts` (OfflineAudioContext decodes each source once, schedules per-clip BufferSource with track + clip gain, honours mute + solo via shared `isTrackAudible` predicate) → AudioEncoder (AAC-LC mp4a.40.2 @ 128kbps) → muxed alongside video. Per-frame `<video>.currentTime + seeked` is correct but slow (M3 will swap in `VideoDecoder` + mp4box for O(1) frame access). Done 2026-05-03. |
| 279 | ✅ Done | Now | P1 | `feature` | **NLE M1 — Server-side source persistence (R2 + dedup)** | `POST /api/nle/sources` multipart upload — sha256 dedup per workspace owner, R2 binding write, `cdnUrl()` for canonical URL. `GET /api/nle/sources` lists every source the caller's workspaces can see (uses shared `buildOwnershipFilter`). `DELETE /api/nle/sources/:id` workspace-gated. Frontend `nleApi.uploadSource()` does the multipart POST after client-side probe; SourcePanel falls back to local blob URL with a warning toast when upload fails (dev-friendly). Done 2026-05-03. |
| 280 | ✅ Done | Now | P1 | `quality` | **Voice playback visibility (engine errors no longer silent)** | Shared `speakWithToast()` helper in `VoiceoverPanel` is the single entry point for every preview / per-scene-play / publish; errors surface as toasts. New `getEngineUnavailableReason()` in `tts-engines.ts` is the single predicate the engine picker reads — VibeVoice badged "Coming soon", Kokoro/Piper "Needs WebGPU" on unsupported browsers (was generic "unavailable" before). Done 2026-05-03. |
| 281 | ✅ Done | Now | P1 | `feature` | **VoiceCloneManager "Coming soon" banner** | Self-gating amber banner above the clone list — listings still onboard (consent / publish / payouts work), synthesis activates when the OpenVoice v2 transformers.js port (#287) ships. Done 2026-05-03. |
| 282 | 🔲 Open | Soon | P1 | `feature` | **NLE M2 — Visual depth (color / keyframes / VFX)** | 3-4 wks. Effect-renderer registry (`{kind, params}` → WebGPU shader OR ffmpeg filter) consumed by `frame-renderer.ts`. Color grading (lift/gamma/gain wheels + LUT loader for `.cube`), keyframe animation curves on per-clip transform/opacity, green-screen / chroma-key, masks, blend modes, basic Native Audio FX (EQ / compressor / reverb / limiter via Web Audio AudioWorklet). Foundational layer (#276–#279) shipped. Pro-gated via existing `useSubscription().isPro`. |
| 283 | 🔲 Open | Soon | P1 | `feature` | **NLE M3 — Pro export + asset library** | 2-3 wks. ProRes / DNxHR encode via ffmpeg.wasm (closes dependency on #286). 4K export gating reuses the existing `requirePro("4K export")` middleware pattern from `studio.ts`. YouTube / Social-Media (9:16 vertical / 1:1 square) export presets reuse the existing YouTube OAuth publish path (#202). Stock-music library wires Pixabay Music + Mixkit free tiers into `StockMediaPanel` alongside the existing Unsplash / Pexels / Pixabay stock visuals. |
| 284 | 🔲 Open | Mid | P2 | `feature` | **NLE M4 — Real-time collaborative editing** | 4-6 wks. Operational transform on the Timeline JSON via Cloudflare Durable Objects (or Yjs over WebSocket). Presence cursors, server-side version history (snapshots indexed by editorId + ts), conflict-free clip-level merges. Pairs with `workspace_grants` (delegated editor) so a contributor sees the timeline owner's cursor live. |
| 285 | 🔲 Open | Later | P2 | `feature` | **NLE M5 — Lightworks-Pro parity (Total FX, Motion Graphics, Advanced Titles/Transitions, R3D, Custom Formats, 8K, advanced proxies, DAW export, advanced audio FX)** | 6-8 wks. Full feature set committed 2026-05-03 in `memory/project_nle_decision.md`: in-house Total FX equivalent (~50+ effects, NOT licensing NewBlue), Motion Graphics (Lottie import + animatable text / shape primitives), Advanced Titles (~50 animated lower-thirds catalog with custom-text fields), Advanced Transitions (glitch / whip / lumetri-key / push / dip-to-color), R3D RAW decode via ffmpeg.wasm (last-priority — real RED workflow needs cloud GPU; in-browser is best-effort), Custom export profiles (codec / container / bitrate / resolution saved per-account), 8K export (likely server-fallback territory), advanced proxies (1080p ProRes Proxy + ProRes LT 4K proxies), DAW Workstation export ("Send to DAW" → multi-channel WAV with timecode + Reaper / Audition project file), advanced Native Audio FX (de-esser, multiband compressor, gate). Pro-gated; pricing surface untouched until each subset ships. |
| 286 | 🔲 Open | Soon | P1 | `feature` | **ffmpeg.wasm render strategy (effects-aware path)** | 2-3 wks. Skeleton at `lib/timeline/ffmpeg-render.ts` is in place + the dispatcher routes to it for any timeline that picks `ffmpeg-wasm`. Implementation: feed canvas-rendered frames as raw RGBA into ffmpeg's MEMFS, mux per-track audio sources via `filter_complex amix`, produce final MP4. Required to ship NLE M2 effects + M3 ProRes / DNxHR export. SharedArrayBuffer / COOP+COEP headers required for ffmpeg.wasm core. |
| 287 | 🔲 Open | Mid | P2 | `feature` | **Voice fix B — OpenVoice v2 transformers.js port (zero-shot voice cloning)** | 4-6 wks engineering. Research recorded 2026-05-03 in `memory/project_nle_decision.md`: no production-ready browser zero-shot cloning ships in 2026; OpenVoice v2 (MIT) has the cleanest porting path (PyTorch → ONNX export tooling at `nnWhisperer/OpenVoice_ONNX` exists). Port targets `@huggingface/transformers` v3 with WebGPU at q8 quantization. Unblocks the Voice Clone Marketplace (currently dormant per #281 banner). |
| 288 | 🔲 Open | Later | P3 | `feature` | **Voice fix C — BYOK voice cloning (ElevenLabs / Replicate-Higgs)** | Deferred 2026-05-03. User-stated posture: "I don't want to offer users BYOK at this time. Possibly in the future." When BYOK opens up product-wide, this becomes a ~100-line server-orchestrator path: user pastes API key → preflight → call ElevenLabs `POST /v1/text-to-speech/{voice_id}` or Replicate Higgs Audio v2 → stream audio back. Pairs with #287 as the alternate cloning path for users who'd rather pay a vendor than wait through the local model download. |
| 289 | 🔲 Open | Soon | P1 | `feature` | **Sizzle-reel magic template (built ON the NLE engine)** | 1-2 wks. Magic UI emits Timeline JSON consumed by the M1 render facade — no parallel render path, per the DRY rule. Inputs (ranked): upload from disk, YouTube import, existing media library, webcam record, generated b-roll (uses Pexels / Pixabay video stock for v1 since AI b-roll requires server-side video gen out of scope at this tier). Beat detection on the music bed via Web Audio API + onset detection (meyda or aubio.js — client-side, free). AI highlight selection: Whisper-WebGPU transcription + LLM scoring of source clips for highlight-worthiness. Slate intro narration via existing TTS once #287 lands. Targets actors / extras / directors / podcasters as the magnet creation surface. |
| 290 | 🔲 Open | Soon | P1 | `feature` | **AI Headshot generator (creator-tier studio surface)** | 1-2 wks. Two-mode UX per user direction 2026-05-03: (a) AI gen — selfie-conditioned portrait generation via WebGPU Stable-Diffusion-Turbo for the free path ($0 to us, slower), (b) webcam capture — guided framing / lighting overlay + 5–10s slate clip recorder. Output goes into the user's asset library; usable in the NLE Source panel, on profile / channel pages, and as the slate frame of the sizzle-reel template (#289). When BYOK opens up (#288 posture), a Replicate Flux LoRA path adds high-quality cloud generation. |
| 291 | 🔲 Open | Soon | P1 | `feature` | **Channel page + profileMode + YouTube ingest (creator persona surface)** | 1-2 wks. Per `memory/project_creator_persona_model.md` (2026-05-03): "creator" is NOT a 4th role — it's a `profileMode` field on `users` so a `job_seeker` can opt into channel-mode without forking the role enum. ONE root profile route — same component branches on `profileMode`, channel layout matches the YouTube tab strip (Home / Videos / Shorts / Live / Podcasts / Playlists / Posts) where each tab self-gates (returns null if empty). Auto-flip resolver (multi-signal: public video count + view total + follower count) lives in one helper. New 4th onboarding card "Build an audience" sets `roles: ['job_seeker']` + `profileMode: 'channel'`. YouTube ingest: `youtube_imported_videos` table populated by an OAuth-connected channel, surfaced as embeds on the Videos tab. Recruiter search hits ONE index (creator-mode users still findable as candidates). Monetization (tipping / paid premieres / channel memberships) reuses the existing voice-marketplace Stripe Connect plumbing — NOT a new ledger. |
| 292 | 🔲 Open | Mid | P2 | `feature` | **Video-track audio mixing in NLE render** | M1 audio mixer handles `kind === 'audio'` tracks only. Most projects pair voiceover / music as dedicated audio tracks so v1 covers the common case; full A/V mixing (extracting audio from video clips' source files and including them in the mix) lands in M2. Implementation: re-decode video files for their audio stream during the offline mix pass, schedule alongside dedicated audio tracks. |
| 293 | 🔲 Open | Soon | P1 | `feature` | **profileMode column on `users` (schema delta for #291)** | Migration adds `profile_mode varchar(16) DEFAULT 'auto' NOT NULL CHECK (profile_mode IN ('resume', 'channel', 'auto'))` to `users`. Add Drizzle field. The auto-flip predicate ("does this profile render channel mode right now?") lives in ONE helper consumed by every surface that asks — never re-implemented inline, never prop-drilled as `isCreator`. Pre-req for #291. |

| 294 | ✅ Done | Now | P2 | `arch` | **`headquarters` schema mismatch — varchar storing structured object** | Migration `0074_company_headquarters_jsonb_and_contact.sql` promotes `company_profiles.headquarters` from `varchar(255)` to `jsonb` and rewrites legacy free-text rows to `{ address: <legacy string> }`. Drizzle field retyped to `jsonb<CompanyHeadquarters \| null>`; shared `HeadquartersSchema` in `shared/companies.ts` so client + server validate the same structure. `rowToCompanyMeta` derives the directory display string via `headquartersDisplay()` (same `[city, state, country]` join the front-end already used). All write callers updated (`/api/Companies` POST/PUT, `/extract` LLM intake, `routes/search.ts`). Done 2026-05-04. |
| 295 | ✅ Done | Now | P2 | `arch` | **Company `contact` fields have no DB columns** | Migration `0074` adds `contact jsonb NOT NULL DEFAULT '{}'`. New `CompanyContact` interface on the Drizzle schema; shared `CompanyContactInputSchema` enforces email/url/phone format on the wire. `contact` joined `WRITABLE_BASIC` in `routes/companies.ts` so POST/PUT now persist it, and it surfaces under `data.contact` in `rowToCompanyProfile`. CompanyBuilder's `buildCreateRequest` already submitted the field — it now finally lands. Done 2026-05-04. |
| 296 | ✅ Done | Now | P2 | `arch` | **`CompanyProfile` envelope shape contradicts API output** | `rowToCompanyProfile` rewritten to return the nested `{ id, slug, data: { name, logo, …, contact, headquarters, benefits }, status, visibility, … }` shape that `CompanyProfileSchema` expects — closes the silent-default Zod parse and means `company.data.X` reads now reflect real DB rows instead of defaulted blanks. Test fixtures in `routes/__tests__/company-features.test.ts` updated to assert against the nested shape. Same pass also fixed the inverse bug in `companyService.updateCompany` (was sending `{ data: ... }` to a handler that reads body.name flat) by switching the request to flat fields. Done 2026-05-04. |
| 297 | ✅ Done | Now | P3 | `quality` | **Adopt `useEffectiveRole` hook in remaining inline callsites** | All eight duplicate-precedence callsites migrated to `useEffectiveRole()`: `pages/Home.tsx`, `pages/Dashboard.tsx`, `pages/ServicesManagement.tsx`, `components/EmulationBar.tsx`, `components/MobileBottomNav.tsx`, `components/PermissionDebuggerPanel.tsx`, `hooks/use-permissions.ts`, `lib/admin-permissions.ts`. The `impersonationSession?.role ?? personaPreview ?? user?.role ?? null` pattern now exists in exactly one place — `frontend/hooks/use-effective-role.ts`. Done 2026-05-04. |
| 298 | 🔲 Open | Soon | P3 | `quality` | **Migrate remaining ~85 pages to `<AppShell>`** | `<AppShell>` (`frontend/components/AppShell.tsx`) owns the Sidebar+Navigation+Footer chrome and renders bare-by-default until `useShouldRenderAppChrome()` confirms auth has settled and the user is not in verification limbo (no flicker). Variants: `app` (default, full chrome), `public` (Footer-only, for token-based shares — closed #300), `bare` (no chrome). Auth/transitional allowlist + share-link pages migrated: Login, Signup, SignupSuccess, ForgotPassword, ResetPassword, VerifyEmail, ConfirmEmail, PrivacyPolicy, TermsOfService, CookiePolicy, SharedCandidateResume, SharedPitchDeck. ~85 other pages still inline the same `<div min-h-screen><Sidebar/><div ml-80><Navigation/><pt-16>{content}</><Footer/></></>` boilerplate (Home, Dashboard, Tasks, Help, Pricing, Settings, all `pages/tools/*`, all `pages/services/*`, etc.). Migrating them is mechanical (drop chrome imports + `useSidebar`, wrap body in `<AppShell>`, optional `bgClassName` for non-gradient pages). No bug today — these pages are unreachable for verification-blocked users (`GlobalVerificationGate` redirects them), and the data hooks they consume already inherit the api-ready gate via `useGatedResource` — but the layout duplication is the same DRY violation that produced the original /verify-email API-flood bug. Identified 2026-05-04 during AppShell extraction. |
| 299 | 🔲 Open | Soon | P3 | `arch` | **`StudioLayout` and `AdminLayout` should compose `<AppShell>` (or vice versa)** | Studio (`pages/studio/StudioLayout.tsx`) and Admin (`components/admin/AdminLayout.tsx`) each maintain their own outer chrome composition with sidebar collapse state, mobile menu plumbing, and Navigation/Footer mounts — parallel to but separate from `<AppShell>`. Today they don't fire the API-flood bug because access is gated upstream (admin permission, studio auth). But three parallel chrome owners is one too many — pick one of: (a) make Studio/Admin render *inside* `<AppShell>` and only own their inner panel split, (b) hoist the `useVerificationBlocked()` short-circuit to a shared `<ChromeRoot>` that all three layouts compose. Whichever direction, the predicate currently consumed by `<AppShell>`/`<GlobalChrome>`/`GlobalVerificationGate`/`RequireVerified` should be the only place it lives. Identified 2026-05-04 during AppShell extraction. |
| 300 | ✅ Done | Now | P3 | `quality` | **Public token-based pages chrome posture (`<AppShell variant="public">`)** | `<AppShell>` gained a `variant` discriminator with three values: `app` (full chrome, default), `public` (Footer-only — viral-loop CTA on shared resume / pitch deck links), `bare` (no chrome — embedded / iframe / portal). `SharedCandidateResume` and `SharedPitchDeck` migrated to `variant="public"`. The other token-based viewers (`EmbeddedResume`, `studio/ATSLandingPage`, `studio/AsyncInterviewPage`, `HiringManagerPortal`, `PublicProfile`, `PublicVideoResume`, `MarketplaceTemplatePreview`) were already chrome-free — equivalent to `variant="bare"`. Done 2026-05-04. |
| 301 | 🔲 Open | Soon | P2 | `feature` | **Voiceover lane in `NLETimeline` is empty (per-scene voiceover lives off-script)** | Slice B added music / voiceover / recording rows under the scene track. The recording lane reads `scene.sceneAudio`; the music lane reads `script.video.audio`. The voiceover lane is structurally there but silent because per-scene voiceover audio lives on `StudioProjectState.voiceover.scenes` (UI-side) — not on `VideoScript`. Lifting the voiceover-per-scene map onto `script.video.voiceover` (or onto each scene as `scene.voiceoverAudioUrl`) closes this. Unblocks: timeline visibility of voiceover slots, "click to (re)generate voiceover" affordance from the lane, voiceover persistence for collaborators. Identified 2026-05-04 during Slice B. |
| 302 | 🔲 Open | Mid | P2 | `feature` | **`ffmpeg.wasm` SharedArrayBuffer requirement vs. Pages COOP/COEP** | The Slice D ffmpeg.wasm exporter (`frontend/lib/renderer/ffmpeg-wasm-exporter.ts` + `frontend/workers/ffmpeg-encode.worker.ts`) needs cross-origin isolation (SharedArrayBuffer + WebAssembly threads). The hired.video Pages host doesn't currently send `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp` headers, so the worker's ffmpeg load will fail in production today. Two options: (a) set the headers via `_headers` on Pages and verify nothing the studio embeds (CDN videos, R2 assets) breaks; (b) route ffmpeg-wasm exports through a server-side render path. Until one lands, the Slice C codec picker can persist the choice but a non-h264 export will throw at runtime. Identified 2026-05-04 during Slice D. |
| 303 | ✅ Done | Now | P0 | `arch` | **`useGatedResource` base hook + inverted chrome render** | API-flood bug on `/verify-email` had two layers: (a) data-fetching hooks (useSubscription / useTokenBudget / useCommHub / useAIUsage / cookie / timezone / company-scope) firing on `isAuthenticated` alone — kept hammering 403s for verification-blocked users; (b) `<AppShell>` rendering chrome optimistically then hiding it on auth-resolve, producing visible chrome flicker. Fix: extract `useGatedResource<T>({ fetcher, defaults, pollMs })` as the base hook (`frontend/hooks/use-gated-resource.ts`) — owns the api-ready gate, default-state reset, fetch+loading lifecycle, and optional polling in ONE place. All resource hooks now compose this (one-line "subclasses"). Predicate `useApiReady()` is pessimistic during `isLoading` so no fetch fires until auth is settled. `<AppShell>` inverted: bare-by-default, chrome only renders once `useShouldRenderAppChrome()` confirms auth-settled + not-blocked — never the reverse, so no flash-of-chrome. `<GlobalChrome>` consumes the same predicate. Done 2026-05-04. |
| 303 | 🔲 Open | Mid | P3 | `feature` | **Audio mix not piped through ffmpeg.wasm exporter** | `exportFfmpegWasm` is video-only — it composites and encodes RGBA frames but doesn't pipe ambient music / voiceover / per-scene `sceneAudio` into the ffmpeg pass. The h264 path keeps using MediaRecorder for audio-bearing exports; switching to ffmpeg means feeding mixed-down WAV into ffmpeg as `-i audio.wav` with `-c:a` matching `compiledVideo.audioCodec`. The shared `AmbientPlayer` already produces a mixed PCM buffer — wire it through. Closes feature parity for ProRes / DNxHD / VP9 with sound. Identified 2026-05-04 during Slice D. |
| 304 | 🔲 Open | Mid | P3 | `feature` | **Proxy generator has no upload-side wiring** | `frontend/lib/timeline/proxy-generator.ts` (Slice F) implements client-side WebCodecs downscale to a 720p H.264 proxy and is callable end-to-end, but no upload surface invokes it yet. Wiring path: extend `uploadVideo()` in `lib/services/upload-service.ts` to ALSO upload the proxy bytes (server stores both, returns `{ url, proxyUrl }`), plus a corresponding backend endpoint that persists proxies under a `_proxy` suffix and a schema/migration to add `media_assets.proxy_url` (or graft onto the existing studio media model). Editor scrubbing then reads `proxyUrl ?? url`. Identified 2026-05-04 during Slice F. |
| 305 | 🔲 Open | Mid | P3 | `arch` | **Encode-loop Worker only covers ffmpeg pass — composite still on main thread** | `workers/ffmpeg-encode.worker.ts` runs the ffmpeg encode off the main thread, but the per-frame compositor (`renderFrame()` → `drawNode()`) still executes on the main thread because it depends on DOM `Image` / `<video>` elements. For >30 second renders this is the visible UI freeze. Path: re-target `canvas-nodes.ts` and `frame-renderer.ts` at OffscreenCanvas + ImageBitmap inputs (preloaded on the main thread, transferred to the worker), then move the composite loop into a worker. Substantial refactor — every node draw helper that currently calls into the DOM has to be audited. Identified 2026-05-04 during Slice F. |
| 306 | 🔲 Open | Soon | P3 | `quality` | **Pre-existing hook typecheck errors (`use-cookie-preferences`, `use-ai-usage`, `use-token-budget`, `use-user-timezone`)** | `frontend/hooks/use-cookie-preferences.ts` and `frontend/hooks/use-user-timezone.ts` reference `useApiReady` / `isAuthenticated` that aren't imported; `frontend/hooks/use-ai-usage.ts` builds a partial `AIUsageMonth` missing `year`/`month`; `frontend/hooks/use-token-budget.ts` builds an object missing `remaining`. None block runtime today (the values are computed at call time and the hooks bail early), but `tsc --noEmit` flags them. Pre-existed Slices A–F; surfaced when the new code changed which files TS visits. Closes after the relevant hooks declare their deps + return shapes explicitly. Identified 2026-05-04 during Slice E/F typecheck. |
| 307 | ✅ Done | Now | P3 | `feature` | **Effects Pro-gating enforced at the picker** (2026-05-04) | `EffectDefinition.proOnly?: boolean` added to the registry. Marked the 9 advanced effects per the gap spec: `color-wheels`, `lut`, `chroma-key`, `mask-rect`, `film-grain`, `chromatic-aberration`, `glitch`, `sharpen`, `title-card`. `EffectStackEditor` reads `useSubscription().isPro`, shows a "Pro" suffix + lock icon on Pro-only entries in the Add menu, and intercepts `add()` for non-Pro users with an upsell toast linking to `/pricing`. Render path trusts the chosen effect since the gate happens at edit time. |
| 308 | ✅ Done | Now | P3 | `feature` | **Codec picker enforces Pro gate at render time** (2026-05-04) | `ExportOptions.isPro?: boolean` added to `lib/renderer/video-exporter.ts`. `exportVideo()` throws `PRO_REQUIRED: <CODEC> export is a Pro feature.` when `compiledVideo.codec !== "h264"` and `!opts.isPro`, before the heavy ffmpeg.wasm path runs. `StudioLayout.handleExport` now passes `isPro: isPro || isSuperAdmin` and the existing `PRO_REQUIRED` toast handler parses the trigger out of the error message so codec / 4K gates each render their own context-specific upsell description (no more hardcoded "4K export" string). |
| 309 | 🔲 Open | Now | P0 | `feature` | **Tax ID encryption-at-rest for `payout_profiles.tax_id_encrypted`** | The Settings → Payouts scaffold (migration `0072_payout_profiles.sql`, GET/PATCH `/api/creators/me/payout-profile`) writes the full SSN/EIN/ITIN/foreign-TIN into `tax_id_encrypted` as plain text — column name notwithstanding. MUST be wrapped before any production payout integration: either KMS-managed AES-GCM (server-side encrypt on PATCH, decrypt only on the payout-onboarding handoff) or full Stripe Connect TIN handoff so we never persist it at all. Until this lands, do NOT enable the Payouts tab for non-staff users. Identified 2026-05-04 during Settings → Payouts scaffold. |
| 310 | 🔲 Open | Now | P0 | `feature` | **Hosted W-9 / W-8 e-signature flow** | `PATCH /api/creators/me/payout-profile` accepts `taxFormType` (derived from entityType × residency) and stamps `tax_form_submitted_at` whenever the form is "saved" — but no actual W-9 / W-8 PDF is generated, signed, or stored. Need to wire either (a) Dropbox Sign envelope generation seeded with payout-profile data → callback writes the envelope id into `tax_form_document_ref`, or (b) Stripe Connect's hosted onboarding which captures the form on their side and returns a tax-doc id. The form preview in `PayoutProfileForm.tsx` is currently advisory copy only. Identified 2026-05-04 during Settings → Payouts scaffold. |
| 311 | 🔲 Open | Now | P0 | `feature` | **Stripe Connect / Helcim hosted onboarding for `payout_account_id`** | Settings → Payouts asks the user to paste a `payoutAccountId` (e.g. `acct_…`) — there's no flow to *create* the account on the rail. Need a `POST /api/creators/me/payout-onboarding-link` that calls `stripe.accountLinks.create` (or Helcim equivalent), redirects to the hosted form, and on return persists the new account id + flips `payout_onboarded_at`. Until then, `PayoutProfileForm` is a manual-entry stopgap. Identified 2026-05-04 during Settings → Payouts scaffold. |
| 312 | 🔲 Open | Mid | P1 | `feature` | **1099-NEC year-end generation from `payout_profiles`** | New `payout_profiles` table holds the legal name + address + tax form needed to issue a 1099. Need a year-end batch job that reads the table + sums ledger amounts (creator marketplace earnings, voice license royalties, course revenue) per user per calendar year, generates 1099-NEC PDFs (or hands off to Stripe Connect / Track1099), and emails them out. Threshold + form-routing rules per IRS spec. Identified 2026-05-04 during Settings → Payouts scaffold. |
| 313 | 🔲 Open | Mid | P2 | `quality` | **Drop deprecated `creator_profiles.payout_*` columns** | `creator_profiles` still carries `payout_provider`, `payout_account_id`, `payout_onboarded_at`, `payout_country`, `payout_currency` from migration `0009`. The `POST /api/creators/me/payout` route that wrote them was deleted in the Settings → Payouts scaffold; the frontend `CreatorProfile` interface no longer exposes them. Columns are now write-only-ever-and-never-read but still on the table. Add a migration to drop them once the new `payout_profiles` table has been live long enough that no consumer is reading creator_profiles for payout fields. Identified 2026-05-04 during Settings → Payouts scaffold. |
| 314 | 🔲 Open | Now | P1 | `feature` | **Per-content paywall — hide unpaid creators' listings on services / articles / voice clones / courses** | `creators/browse` and `creators/public/:userId` were gated by `isCreatorVisible(userId)` in 2026-05-04, but each content-type marketplace surface still surfaces a free creator's listings: `services/browse`, `articles/public`, `voice-clones/marketplace`, `courses` (public). Each route needs the same `getSubscription(ownerId).isPro` filter. Hoist `isCreatorVisible` into a shared service-layer helper so the four routes don't reimplement it. Identified 2026-05-04 during Creator Program enrollment fix. |
| 315 | ✅ Done | Now | P0 | `arch` | **`<BrandHeader>` + inverted `<AppShell>` chrome render** | Original `<AppShell>` rendered chrome optimistically and hid it after auth resolved → visible chrome flicker. Inverted: bare-by-default, full chrome only renders once `useShouldRenderAppChrome()` confirms auth has bootstrapped AND user is not in verification limbo. New `<BrandHeader>` (logo + optional Sign Out, no data hooks) replaces the previous "blank background" fallback so visitors always see the hired.video brand even during the loading / limbo / public-share branches. Pairs with `useGatedResource` so the data hooks (#303) never fire even if a non-chrome surface mounts them. Done 2026-05-04. |
| 316 | ✅ Done | Now | P0 | `arch` | **Mass page migration to `<AppShell>` (~70 pages)** | Mechanical migration script (`tmp/migrate-appshell.mjs`) handles the canonical `<div min-h-screen ${BG}><Sidebar/><div ml-{16\|80}><Navigation/>{content}<Footer/></div></div>` shape — drops chrome imports, drops `useSidebar` destructure, wraps content in `<AppShell bgClassName="${BG}">`. CRLF-tolerant; handles two structural variants (Footer outside vs inside the inner pt-16 wrapper) by counting trailing `</div>` count and padding content. Migrated ~70 of ~95 pages including About, Pricing, Help, Settings (single-return ones), Login, Signup, VerifyEmail, ConfirmEmail, ForgotPassword, ResetPassword, all `pages/tools/*`, all `pages/blog/*`, all `pages/guides/*`, etc. Done 2026-05-04. |
| 317 | 🔲 Open | Soon | P3 | `quality` | **Hand-migrate the last 12 pages to `<AppShell>`** | 82 of 94 pages now on `<AppShell>` (incl. all auth/transitional pages, all `pages/tools/*`, all `pages/blog/*`, all `pages/guides/*`, marketing, `Feed`, `Home`, `Outreach`, `Resumes`, `Tools`, `Settings`, `SourcingBrowse`, `PostAJob`, both `seo/*` SEO pages). Remaining 12 mount `<Sidebar>+<Navigation>+<Footer>` directly with non-canonical wrappers the migration script couldn't transform: `ServicesManagement` (multi-return), `InterviewPractice`, `PhoneDashboard` (non-canonical wrap), `ResumeDetail`, `ResumeEditPage`, `ServiceInquiries` (variant indentation), `services/CandidateDetail`, `services/HiringOnboarding`, `services/PitchDeckBuilder`, `services/PitchDecksList`, `services/ServicesSettings` (sibling-Dialog wrappers), `tools/ValueProposition` (non-canonical). ~30 mins each via hand edit. No bug today — data hooks already gate via `useApiReady`/`useGatedResource`, so even without `<AppShell>` these pages don't flood the rate limiter for verification-blocked users — pure layout DRY follow-up. Identified 2026-05-04. |
| 318 | ✅ Done | Now | P0 | `feature` | **`<EntityVideos>` was firing `/api/studio/projects` for anonymous viewers** | The component (mounted via `JobCard` / `CompanyCard` / `PeopleCard` / `ResumeCard` on public listing pages including `/`) hit the auth-required `getProjects` endpoint on every render with no auth gate — every anonymous home-page visitor logged a 401. Fixed by gating on `useApiReady()`: anonymous (and verification-blocked) viewers short-circuit to an empty videos array, the existing visibility rule then returns null when `!viewerCanCreate`. Same primitive that gates the chrome data hooks (#303). Done 2026-05-04. |
| 319 | ✅ Done | Now | P0 | `arch` | **`/api/security/geo/eligible` 401 on /signup** | Handler at `securityRoutes.get("/geo/eligible")` is documented as public ("Geo eligibility — public. The FE register page calls this and self-hides / shows-waitlist accordingly") but `/api/security/*` wasn't in `PUBLIC_PREFIXES`, so the global auth middleware caught it and returned 401 before the handler ran — `<RegisterGate>` couldn't precheck signup eligibility. Fixed by adding `/api/security/geo` and `/api/security/region-waitlist` to `PUBLIC_PREFIXES` in `api/src/app.ts`. The TOTP routes in the same router stay behind the global gate (they self-validate via `requireUserId` internally). Done 2026-05-04. |
| 320 | 🔲 Open | Now | P1 | `feature` | **Apply geo-eligibility gate to `/login` (sanctioned-region hard-block)** | `<RegisterGate>` only wraps Signup. /login lets sanctioned-country users attempt authentication, which is an OFAC compliance gap. Refactor: extract the shared semantics into a `<GeoGate mode="signup" \| "login">` (or two thin wrappers `<RegisterGate>` and `<LoginGate>` that both call `useGeoEligibility()` directly — the predicate is already shared, only the action differs). Action matrix: `allowed` → render form on both; `waitlist` → register-form goes to waitlist capture, login-form proceeds (existing customers shouldn't be locked out by a region not-yet-launched); `sanctioned` → hard-block on both, no email capture. Same approach for `/forgot-password`, `/reset-password`, `/auth/magic-link`, `/auth/callback` if we want full coverage. Identified 2026-05-04 — server already classifies on every login attempt via `signupGuard.ts`'s siblings, but the FE doesn't show a friendly notice for blocked users. |
| 321 | ✅ Done | Now | P0 | `arch` | **Migration 0074 idempotency — `headquarters` ALTER COLUMN deploy loop** | Initial migration tried `headquarters::jsonb` cast which threw "invalid input syntax for type json" on legacy free-text values (e.g. "Troy, MI"). Second attempt simplified to `jsonb_build_object('address', headquarters)` but the migration runner had ALREADY converted the column to `jsonb` on a partial prior run, so on retry the `WHEN headquarters = ''` branch errored comparing `jsonb` to `varchar`. Fixed by wrapping the ALTER in a `DO $$ BEGIN ... END $$;` block that inspects `information_schema.columns` for the current type and skips the conversion when it's already `jsonb`. Migration is now safely re-runnable. Done 2026-05-04. |
| 322 | ✅ Done | Now | P0 | `arch` | **Hooks + components migrated to `useApiReady` predicate** | Audit closed: every user-data hook in `frontend/hooks/` and the components that fetch directly now consume `useApiReady()` (via `useGatedResource` for the resource shape, or directly for one-shot fetches). Touched: `useDashboard`, `useStartConversation`, `useGeoEligibility` (already public-OK), `EntityVideos`, `ReferralBanner`, plus the 8 already-gated chrome hooks. Anonymous viewers and verification-blocked users no longer fire any user-scoped API call regardless of which surface mounts the consumer. Done 2026-05-04. |
| 323 | 🔲 Open | Soon | P2 | `feature` | **Public videos linked to an entity aren't visible to non-owners** | `EntityVideos` consumes `studioService.getProjects({ kind, id })`, but the backend `/api/studio/projects` route uses `buildOwnershipFilter` — it returns ONLY the auth'd viewer's own projects, scoped to the workspaces they can act in. So a non-owner viewing someone else's resume / job / company / profile card never sees that entity's videos even when they're privacy=public. To honour the user's "if a video is associated with the entity, show it if its visibility allows" requirement: add a public read path (e.g. `?audience=public` query, or a separate `/api/studio/projects/public` route) that filters `studioProjects` by `subject` × `isPublic=true` × `status in ('Published','Completed')` and ignores ownership. Then split `EntityVideos`' fetch: owners hit the existing endpoint, non-owners (incl. anonymous when `apiReady` is false) hit the public path so they can still play published clips. Identified 2026-05-04 while fixing #324 — the create-chip side was the visible bug, the read-side gap surfaces once that's plugged. |
| 324 | ✅ Done | Now | P0 | `feature` | **`Create Video` chip leaked to non-owners and anonymous viewers on cards** | `ResumeCard`, `JobCard`, `CompanyCard`, `PeopleCard` each prop-drilled a `viewerCanCreate` boolean into `<EntityVideos>`. ResumeCard's default for the underlying `ownership` prop was `"owned"`, so `card-factory` (which never passed `ownership`) handed every viewer — including signed-out search-page visitors — `isOwner=true` → the chip rendered with "Create Video Resume". `normalizeResumeData` had a parallel bug: a `legacyOwnership === "owned" && !viewerUserId` fallback returned "owned" for anonymous viewers because the legacy `determineOwnership` infers ownership from `item.userId` alone. Fix: extracted `lib/use-entity-ownership.ts` (`useEntityOwnership({ ownerUserId, ownership, extraOwnerPredicates })`) as the single source of truth for "is the auth viewer the owner of this entity?"; `<EntityVideos>` self-gates via that hook (no more prop-drilled `viewerCanCreate`); JobCard/CompanyCard/PeopleCard/ResumeCard all consume the same hook so the predicate can't drift. `card-factory` forwards `userId` + `ownership` to `ResumeCard`; ResumeCard's `ownership = "owned"` default removed; `normalizeResumeData` only trusts an explicit `item.ownership === "owned"` as the legacy fallback. Done 2026-05-04. |
| 325 | 🔲 Open | Soon | P1 | `feature` | **Articles don't have `<EntityVideos>` and aren't part of the studio subject enum** | Product direction is "use the studio to promote Jobs, Companies, Articles, Profiles, Resumes". Articles are missing two ways: (a) `STUDIO_SUBJECT_KINDS` in `shared/studio-subject.ts` doesn't include `"article"` — adding it requires labels (`STUDIO_SUBJECT_LABEL["article"] = "Video Article Promo"`), noun, `studioSubjectHref` routing to `/blog/:slug`, and the backend `studio.ts` validation will accept the new kind for free; (b) `components/search/ContentCard` (used for article/guide/FAQ tiles in `/?category=articles`) is a static read-only card with no ownership, no `<EntityVideos>`, and the search payload currently strips the article author's `userId`. Wire-up: extend `ContentItem` with `userId?: string`, ensure `articles` rows entering the search index carry `userId`, mount `<EntityVideos subject={{ kind: "article", id }} ownerUserId={userId} />` in ContentCard for `type === "article"`. Owners then get a "Create Video Article Promo" chip on their own articles in search results, and existing public videos linked to the article surface for everyone via #323. Identified 2026-05-04 during the create-chip ownership refactor (#324). |
| 326 | 🔲 Open | Soon | P2 | `quality` | **`/blog` (`BlogIndex`) and `/?category=articles` (`ContentCard`) render different cards for the same data** | The two surfaces show the SAME underlying article data with two different visual treatments — `pages/blog/BlogIndex.tsx` uses bespoke gradient hero cards with category badges + "Read guide" CTA, while `components/search/ContentCard.tsx` uses a generic icon + "Read article" CTA. Per the "shared cards across surfaces" direction, BlogIndex should consume the same component (post-#325) so the article tile is identical wherever it appears (`/blog`, `/?category=articles`, `/?category=all`, future feed). Mechanical migration: replace BlogIndex's inline card markup with `<ContentCard item={...} />`, ensure the `item.type = "article"` mapping and `item.userId` are populated from the article-service response. No backend work needed. Identified 2026-05-04 during the create-chip ownership refactor — out of scope for that pass because it touches a parallel non-search rendering path. |
| 327 | ✅ Done | Now | P1 | `arch` | **`/api/users/me` 403 round-trip on every login when email is unverified** | `authService.login()` and `authService.verifyTwoFactor()` unconditionally fired `getCurrentUser()` after storing auth data — but `/me` requires a verified email, so any login while in verification limbo round-tripped a 403 (4× in the screenshot the user reported, because subsequent components — `loginWithToken`, `refreshUser`, profile dialogs — also called `getCurrentUser()` independently). Fixed by extracting `lib/verification-gate.ts` as the module-level mirror of `isEmailVerified` (single source of truth across imperative call paths): `getVerificationStatus()` syncs the gate on every check, `auth-email-unverified` events flip it, `auth-logout` clears it. `authService.getCurrentUser()` and `userService.getCurrentUser()` both short-circuit via `isVerificationKnownBlocked()` — they throw `UnverifiedAccountError` immediately instead of firing `/me`. `login()` and `verifyTwoFactor()` now call `getVerificationStatus()` first so the very first post-login `/me` is also avoided. Done 2026-05-04. |
| 328 | ✅ Done | Now | P2 | `quality` | **Direct `apiClient.get("/api/users/me")` calls now route through the verification gate** (2026-05-04) | `pages/Settings.tsx` Lead Generation tab + `pages/ServicesManagement.tsx` `loadServices()` rewritten to call `userService.getCurrentUser()` instead of `apiClient.get("/api/users/me")` directly — both paths now short-circuit via `isVerificationKnownBlocked()` so an unverified session that lands on these surfaces (e.g. via a future change that exposes the tab earlier) throws `UnverifiedAccountError` immediately instead of round-tripping to a 403. To keep the typed return useful, `providesServices` was added to `UserProfileSchema` and threaded through `normalizePublicUserToProfile`. Closes the future-proofing concern raised by #327. |
| 329 | 🔲 Open | Soon | P3 | `quality` | **`authService.getCurrentUser` and `userService.getCurrentUser` are duplicate `/me` fetchers** | Both methods exist in parallel — auth-service normalizes via `normalizeAndPersist` (writes `current_user` localStorage), user-service normalizes via `normalizePublicUserToProfile` (no persistence). Two distinct `UserProfile` types, two normalizers, two callers (StudioWizard + ProfileIntake on the user-service side). Should consolidate to one fetch + one canonical type so future schema drift can't open a divergence. Both already share the same verification gate after #327, so the consolidation is now purely a typing / normalization unification. Identified 2026-05-04 during the verification-gate extraction (#327). |
| 330 | ✅ Done | Now | P2 | `feature` | **`openToWork` Settings UI surface** | Added an Open-to-Work Switch to `Settings.tsx` Job Preferences tab (above Remote Only / Willing to Relocate). Mutation is shared with the Profile Audit inline button via `lib/hooks/use-open-to-work.ts` (`useOpenToWorkToggle()` — single source of truth for `updateProfile({ openToWork }) + refreshUser + toast`); `OpenToWorkButton` refactored to consume that hook. New i18n keys `settings.jobPreferences.openToWorkLabel` / `openToWorkDesc` added in en + es. Done 2026-05-04. |
| 331 | 🔲 Open | Soon | P3 | `quality` | **`openToWorkCheck` audit detail references "recruiters only" visibility that doesn't exist** | `api/src/services/profile/ProfileAuditService.ts:273-278` (warn detail) tells users to "Turn it on (even with 'recruiters only' visibility) if you're passively open" — but `userProfiles` only has the boolean `openToWork`; there is no separate visibility / audience field, and `OpportunityPreferencesSection` simply hides itself when `openToWork === false`. The advice is misleading. Fix: either drop the visibility clause from the detail string OR add an `openToWorkVisibility` enum (`public` / `recruiters_only`) on the profile and expose it as a follow-up control. Unblocks: honest audit copy + a future "passively open" affordance. Identified 2026-05-04. |
| 332 | 🔲 Open | Soon | P3 | `quality` | **`ServicesNav` and `PageHeader` duplicate the same tab-strip primitive** | `components/services/ServicesNav.tsx` ships its own `<nav>` rendering with `border-b-2` underline tabs, while the new `components/PageHeader.tsx` renders the identical visual primitive (added 2026-05-04 to standardize Resumes/Jobs/People/Companies/PeopleDetail). Both should compose a shared `<TabStrip>` component so the styling, hover state, and overflow handling don't drift. Touching ServicesNav today means updating 9 callers (`ServicesManagement` + 8 `pages/services/*`), so deferred. Fix: extract `TabStrip` from `PageHeader`, refactor `ServicesNav` to compose it. Unblocks: visual consistency across all top-level pages. Identified 2026-05-04 during page-header roll-out. |
| 333 | 🔲 Open | Soon | P3 | `quality` | **People `Browse` tab still renders the Following section that now lives under Connections** | `pages/People.tsx` Browse body shows tracked-people Following section *and* the discover grid; with the new Connections tab (added 2026-05-04) those rows duplicate. The Browse body should drop the Following section entirely so each tab owns one slice. Same applies to the non-recruiter branch. Fix: cut the `tracked` block from each Browse body. Unblocks: clean tab semantics. Identified 2026-05-04 during page-header roll-out. |
| 334 | 🔲 Open | Soon | P4 | `quality` | **People `Browse` non-recruiter body and recruiter Browse `TabsContent` are ~95% duplicate** | The pre-existing role branch (`rolePermissions.isRecruiter ? <Tabs>…</Tabs> : <div>…</div>`) re-renders the same SearchBar + tracked-people grid + discover grid + pagination JSX in both arms. ~200 lines of duplication. Should extract a `<PeopleBrowseBody />` and call it from a single render path so the two arms only differ in which tabs are visible. Identified 2026-05-04 during page-header roll-out — out of scope for the layout pass. |
| 335 | 🔲 Open | Soon | P3 | `quality` | **`PageHeader` tab Links drop existing query params** | The Link `to="/jobs?tab=saved"` (and equivalents in Companies/People/Outreach) navigates to a fresh URL, dropping `q=`, list/sort/filter params, etc. Fix: teach `PageHeader` tabs to merge into existing `useSearchParams` (or pass `to` as a function so the Link computes the merged URL). Affects every page that uses `PageHeader` with `?tab=` Link navigation. Identified 2026-05-04. |
| 336 | 🔲 Open | Soon | P3 | `quality` | **Jobs `handleTabChange` and PageHeader tab Links are two different ways to switch tabs** | After the Browse-tab flatten (2026-05-04), top tabs navigate via `<Link to="/jobs?tab=…">` (PageHeader) but inner empty-state CTAs still call `handleTabChange("jobs")` which writes via `setSearchParams`. Both paths now reach the same URL but go through different code paths — should consolidate so URL preservation behaviour is identical. Identified 2026-05-04. |
| 337 | 🔲 Open | Soon | P3 | `quality` | **Outreach `setActiveTab` sub-callbacks use `setSearchParams` while top tabs use `<Link>`** | Same drift as #336 in `pages/Outreach.tsx`: `onGoToInbox`, `onNavigateTo`, `onGoToAdvertise` invoke `setActiveTab` which calls `setSearchParams` (preserves other params), while the new top tab strip Links replace the URL outright. Fix: route both through a single helper. Identified 2026-05-04. |
| 338 | 🔲 Open | Soon | P4 | `quality` | **Tasks page Quick Stats only render in table view** | `pages/Tasks.tsx:1114` gates the 4 metric Cards (Total / Planning / ToDo / InProgress / Completed counts) behind `currentView === "table"`. Calendar and Kanban surfaces hide them, but they're useful at-a-glance regardless of view. Fix: lift the stats above the view body so all three views see them. Identified 2026-05-04 during the Tasks header migration. |
| 339 | 🔲 Open | Soon | P4 | `quality` | **Each `/tools/*` page open-codes the AppShell + AuthOverlay + max-w-6xl/7xl wrapper** | All 13 files under `pages/tools/` repeat the same `<AppShell><div className={showAuthOverlay ? "relative" : undefined}>{showAuthOverlay && <AuthOverlay …/>}<div className="max-w-6xl mx-auto p-6">…body…</div></div></AppShell>` scaffolding. The duplicate `pt-16` was stripped 2026-05-04 but the wrapper itself is still copy-pasted. Fix: extract a `<ToolPageShell toolId icon iconBg title description authOverlay={…}>` component that owns the chrome + ToolPageHeader so each tool page becomes `return <ToolPageShell …>{body}</ToolPageShell>`. Unblocks: future global tool-page changes (Crisp targeting, ad slots, layout tweaks) ship in one file instead of 13. Identified 2026-05-04. |
| 340 | 🔲 Open | Soon | P4 | `quality` | **`ToolPageHeader` breadcrumb falls back to literal "Current" when title isn't a string** | `components/tools/ToolPageHeader.tsx` derives the leaf-tab label via `typeof title === "string" ? title : "Current"`. All 13 callers today pass a string, but if a tool ever passes JSX (e.g. inline `<span>{t("…")}</span>`) the breadcrumb shows the placeholder. Fix: add an explicit `tabLabel` prop or look up the registry name via `getTool(toolId)?.label`. Identified 2026-05-04. |
| 341 | ✅ Done | Now | P2 | `feature` | **NLE: proxy-editor wiring** (2026-05-05) | `RendererState.useProxies` flag added; `createMediaElement()` reads `MediaSource.proxyUrl` for video sources when the flag is on, falling back to `url`. Render path leaves the flag false (master pixels always); editor preview consumers opt in. Nested-timeline children inherit the flag. Backend `POST /api/nle/sources/:id/proxy` + `nleApi.uploadProxy()` land proxies into R2 and patch `proxyUrl`. Auto-generation on upload tracked separately as #355. |
| 342 | 🔲 Open | Soon | P2 | `feature` | **NLE: no platform/social export presets (YouTube / Vimeo / TikTok / Reels / Shorts)** | `frontend/lib/timeline/export-profiles.ts` ships codec/container profiles (8K H.264, ProRes 422, DNxHD) but no platform-keyed bundles (e.g. "YouTube 1080p60", "TikTok 9:16 vertical", "Instagram Reels"). Users must manually configure resolution + aspect + bitrate. Distinct from #285's "Custom Formats" (user-defined save) — these are first-party canonical presets. Fix: add a `PLATFORM_PRESETS` catalog keyed to delivery surfaces and surface in `ExportProfilePicker`. Unblocks: one-click "publish to TikTok" UX. Identified 2026-05-05 during studio NLE audit. |
| 343 | 🔲 Open | Mid | P3 | `feature` | **NLE: no batch export (one timeline → many output formats)** | `renderTimeline()` (frontend/lib/timeline/render.ts) renders a single Timeline → single Blob. There's no UI or API for "render this timeline to MP4 1080p AND ProRes 4K AND 9:16 social-cut in one go". Fix: extend the render facade with a `renderBatch(timeline, profiles[])` entry point that fans out to N strategy invocations and returns N Blobs (or zips them). Unblocks: creator workflow that ships horizontal + vertical + thumbnail in one click. Identified 2026-05-05 during studio NLE audit. |
| 344 | ✅ Done | Now | P3 | `feature` | **NLE: nested sequences (Timeline-in-Clip composition)** (2026-05-05) | `Clip.nestedTimelineId` added to the Timeline JSON spec; `frame-renderer.ts` recursively composites the nested timeline at the parent's `startFrame`/`sourceInFrame` onto a pooled `OffscreenCanvas`, with cycle guard via `RendererState.inFlight`. `RenderOptions.resolveNestedTimeline` carries a caller-supplied resolver through `render.ts` → `webcodecs-render.ts`. `operations.ts.insertClip()` accepts the new field. Audio mixer skips nested clips (their child mix isn't recursively flattened yet) — see #356. |
| 345 | ✅ Done | Now | P3 | `feature` | **NLE: multicam group + angle switcher** (2026-05-05) | `Timeline.multicamGroups` + `Clip.multicamGroupId` / `multicamAngleIndex` added to the spec. `resolveClipSource()` is the single dispatch point — frame compositor and audio mixer both consume it so an angle switch shifts video AND audio together with `syncOffsetFrames`. `operations.ts.createMulticamGroup()` + `switchMulticamAngle()` ship the programmatic API. Auto-sync (audio-waveform alignment) and the visual angle-switcher overlay tracked as #357. |
| 346 | ✅ Done | Now | P3 | `feature` | **NLE: relink-offline-media flow** (2026-05-05) | `RelinkSourceDialog` (`components/studio/nle/RelinkSourceDialog.tsx`) probes the source URL via `HEAD`, then offers either "upload replacement" (probes new file via `source-probe.ts` and patches `url`) or "paste URL" (manual rewrite). Backend `PATCH /api/nle/sources/:id` accepts `url` / `filename` rewrites; the frontend consumes it via `nleApi.patchSource()`. Clips reference sources by id, so a single row patch propagates to every referencing clip on next preload. |
| 347 | ✅ Done | Now | P3 | `feature` | **NLE: media-bin search, filter, custom tags** (2026-05-05) | Migration 0075 adds `nle_media_sources.bin_folder` + `nle_media_tags(source_id, tag)`. Backend extends `GET /api/nle/sources` with per-row tag arrays, adds `GET /sources/tags` (distinct facet list) and `PATCH /sources/:id` (folder + atomic tag replace). Frontend `BinPanel` (`components/studio/nle/BinPanel.tsx`) ships search box, folder facet, multi-tag filter, drag-to-track, and an inline `BinMetaDialog` for editing folder + tags. Hierarchical folders / shared workspace tags tracked as follow-ups. |
| 348 | 🔲 Open | Soon | P3 | `feature` | **NLE: keyboard shortcuts hardcoded — no remap UI** | NLETimeline ships fixed keys (S=split, M=merge, D=duplicate, Delete=cut). There's no settings surface to remap, no chord support, no preset profiles ("Premiere keys", "FCP keys", "Resolve keys"). Fix: extract a `useShortcutMap()` hook backed by `localStorage` (per-user) + a `ShortcutSettings` panel; preload 3 industry-standard profiles. Unblocks: power users migrating from another NLE. Identified 2026-05-05 during studio NLE audit. |
| 349 | 🔲 Open | Mid | P4 | `feature` | **NLE: no workspace layout presets (panel-position memory)** | `StudioLayout.tsx` has a fixed sidebar/editor/preview split. Users can't save panel sizes or named layouts ("Editing", "Color", "Audio") and switch between them. Fix: persist panel sizes + visibility per-user, expose a layout-preset dropdown in the studio toolbar. Unblocks: pro-tier workflow ergonomics. Identified 2026-05-05 during studio NLE audit. |
| 350 | 🔲 Open | Later | P3 | `feature` | **NLE: no automated quality control (QScan-equivalent)** | No black-frame detection, freeze-frame detection, audio silence / clipping / loudness-normalization checks, or compliance validation against delivery specs (broadcast loudness, aspect, codec). Fix: ship a pre-export `QcReport` panel that runs a frame sampler + audio meter against the rendered Timeline preview and lists violations against the chosen delivery profile. Unblocks: serious creator / broadcast workflows; differentiator vs CapCut / Canva. Identified 2026-05-05 during studio NLE audit. |
| 351 | 🔲 Open | Later | P4 | `feature` | **NLE: no third-party plugin / effect SDK** | All effects ship via `frontend/lib/timeline/effects/registry.ts`'s in-tree `registerEffect()` calls — there's no public effect API, no manifest format, no sandboxed runtime for community-supplied VFX. The browser delivery model makes a VST/AU-style plugin ecosystem hard but a JSON-effect-spec + WebGPU-shader contribution path is feasible. Fix: define an effect manifest schema (params, shader, license) + a creator submission flow that lands effects in a marketplace listing (mirrors the voice marketplace pattern). Unblocks: creator economy expansion; deliberately Later because the in-tree registry covers v1 needs. Identified 2026-05-05 during studio NLE audit. |
| 352 | ✅ Done | Now | P3 | `feature` | **NLE: advanced color tools — curves / HSL / secondary / power-window** (2026-05-05) | Four new pro-only effects registered through the existing visual registry: `curves` (4-control tone curve compiled to a 256-LUT, channel ∈ luma/rgb/r/g/b), `hsl` (global hue/sat/lightness shift), `secondary` (qualified hue range with hue/sat/light push, shared `hsl-math.ts` primitives + `hueQualifierWeight()`), `power-window` (rect/ellipse mask with feather + invert + exposure/saturation/contrast push). `EffectStackEditor` extended to honor `paramHints {min,max,step}` so each effect's panel renders with the right slider ranges automatically. |
| 353 | ✅ Done | Now | P3 | `feature` | **NLE: audio FX rack — EQ / compressor / limiter / gate** (2026-05-05) | New `frontend/lib/timeline/effects/audio-registry.ts` (parallel to the visual registry, graph + buffer dispatch contracts). `audio-effects.ts` registers a 3-band parametric EQ (BiquadFilterNode chain), compressor + brick-wall limiter (DynamicsCompressorNode), and a buffer-stage noise gate (envelope-follower with attack/release/hold). `Track.effects` added to the Timeline spec; `audio-mixer.ts` runs `processAudioBuffer()` then `connectAudioEffectChain()` per track. `EffectStackEditor` accepts an alternate `catalog` so the same panel drives both visual and audio stacks (per DRY). `TrackEffectsButton` exposes the rack on every audio TrackHeader. De-esser / multiband / dynamic EQ stay deferred under #285. |
| 355 | 🔲 Open | Soon | P3 | `feature` | **NLE: auto-generate proxy on source upload** | The plumbing is in (#341 closed: `RendererState.useProxies`, `proxyUrl` upload route, `nleApi.uploadProxy()`), but the upload flow doesn't AUTO-trigger `generateProxy()` after `POST /api/nle/sources` so most uploads still scrub against the master. Fix: in the upload handler (frontend), after the source row returns, kick off `generateProxy()` for video uploads above a threshold height (e.g. >1080), then `nleApi.uploadProxy(sourceId, proxyBlob)`. Unblocks: one-click proxy editing without a manual "generate" action. Identified 2026-05-05 closing #341. |
| 356 | 🔲 Open | Mid | P3 | `feature` | **NLE: nested-timeline audio doesn't recursively mix into parent** | `audio-mixer.ts` skips clips with `nestedTimelineId` because the mixer doesn't yet recurse into child timelines to flatten their audio mix. Visual side composes correctly. Fix: extend `renderTimelineAudio()` to detect nested clips, call itself recursively for each, and overlay the child mix onto the parent OfflineAudioContext at the correct startTime. Unblocks: full A/V parity for compound clips. Identified 2026-05-05 closing #344. |
| 357 | 🔲 Open | Mid | P3 | `feature` | **NLE: multicam UX — angle-switcher overlay + audio-waveform auto-sync** | `switchMulticamAngle()` ships as a programmatic op but there's no canvas overlay that renders the angles 1..N in a grid + accepts clicks to cut. Auto-sync today is `syncOffsetFrames: 0` for every angle — pro NLEs auto-align via audio-waveform cross-correlation or timecode metadata. Fix: build `MulticamSwitcher` overlay component + a one-shot waveform-cross-correlation aligner. Unblocks: actual interview / podcast / live-event editing UX. Identified 2026-05-05 closing #345. |
| 358 | 🔲 Open | Mid | P4 | `feature` | **NLE: bin folders are flat strings — no hierarchy, no rename/move op** | `nle_media_sources.bin_folder` is free text per migration 0075. Sources can carry a folder string but there's no folder-tree view, no nested folders ("brolll/interviews/"), and no batch "move all in folder X to Y" mutation. Fix: optionally adopt a path convention (`/`-delimited) + add a folder rename endpoint that bulk-updates referencing rows + a tree component for the BinPanel. Unblocks: bins with hundreds of sources. Identified 2026-05-05 closing #347. |
| 359 | 🔲 Open | Soon | P3 | `quality` | **Vite worker.format = "iife" forces a static-import constraint workers must follow but main-thread code violates** | Workers in this repo bundle as IIFE (no code-split), so `await import("mp4-muxer")` inside a worker fails the build with `Invalid value "iife" for option "worker.format"`. `frontend/workers/render-encode.worker.ts` uses a static `import { Muxer, ArrayBufferTarget } from "mp4-muxer"` to comply, but `lib/renderer/video-exporter.ts:38` and `lib/timeline/proxy-generator.ts:97` still use the dynamic form on the main thread — both work today (main bundle splits fine), but if either is ever moved into a worker the build will break the same way. Fix: either flip vite to `worker.format: "es"` (one config knob, lets workers code-split) OR codify a lint rule that worker files must use static imports for chunked deps. Unblocks: future worker-shifted code paths (e.g. moving proxy generation into a worker for #355). Identified 2026-05-05 while making the build pass after #341/353 work. |
| 354 | 🔲 Open | Now | P2 | `quality` | **API typecheck broken: `tasks.position` write doesn't match drizzle schema** | `api/src/lib/onboarding.ts:192` calls `db.update(tasks).set({ position: def.position })` but the `tasks` schema's update type only accepts `userId` / `title` / `boardId` — `position` is missing from the column set. `npm run typecheck` in `api/` fails with TS2353 on this line. Either the column was renamed/removed and `onboarding.ts` wasn't updated, or the column is missing from the drizzle schema. Fix: align the schema and the writer; either add `position: integer()` to the `tasks` table or remove the realignment loop. Unblocks: green CI typecheck for the API package. Identified 2026-05-05 while wiring AI consolidate-highlights endpoint (pre-existing, unrelated to that work). |
| 360 | 🔲 Open | Soon | P3 | `quality` | **`isRecruiterOrEmployer = isRecruiter \|\| isEmployer` inlined in 5 pages — should consolidate behind `RolePermissions`** | Pattern duplicated across `frontend/pages/Resumes.tsx`, `People.tsx`, `JobDetail.tsx`, `hooks/use-resume-permissions.ts`, `components/profile/sections/VisitorActionsSection.tsx`. Each callsite excludes admin / SA from "hiring-side" UI even though the existing `canManageJobs` / new `canManageCompanies` permission helpers cover the right superset. `Companies.tsx` + `Jobs.tsx` switched 2026-05-05; the rest still inline the role-only check, so SA/admins are silently locked out of those surfaces (Candidates panel on People, recruiter-side resume actions, etc.). Fix: route every consumer through `permissions.canManageJobs` (or a `canManageHiringSurfaces` helper if a sharper semantic emerges). Unblocks: SA/admins seeing the same hiring affordances they get on /companies and /jobs. Identified 2026-05-05 fixing SA edit/create on Companies + Jobs. |
| 361 | 🔲 Open | Soon | P3 | `feature` | **`Your Companies` section on /companies is hardcoded empty** | `frontend/pages/Companies.tsx:235-242` `getCompaniesForUser()` returns `{owned: [], tracked: []}` with a TODO comment ("backend API supports user company associations"). Owners and SA admin-override never get the "Your Companies" header section because the source array is always empty — the section was visually built but never wired to a query. Fix: add `companyService.getMyCompanies()` (filter by `ownerId === viewer` server-side, or expose `/api/companies/me/owned`) and feed that into the page state. Unblocks: actual visibility of owned companies on the directory page; right now owners only see them in the "Explore Companies" mixed list. Identified 2026-05-05 fixing SA edit/create on Companies. |
| 362 | 🔲 Open | Now | P3 | `quality` | **`canEdit` on company DTO is a redundant prop-drilled boolean** | `rowToCompanyProfile` in `api/src/routes/companies.ts:128-131` ships `canEdit` and `isOwner` derived from a single `viewerId === ownerId` comparison. The frontend now derives the same predicate via `useEntityOwnership` (which folds in SA admin-override + team membership predicates the API can't see without an extra query). Either: (a) extend the DTO to be the SSoT (server computes admin-override and team-member flags too) and have all UIs read `company.canEdit`, OR (b) drop both fields from the DTO since no consumer needs them post-refactor. Mixing both produces drift like "API says canEdit=false, hook says isOwner=true". Fix: pick one direction; (b) is simpler and aligns with the no-prop-drilled-`canX` rule. Unblocks: removing inline ownership compares everywhere. Identified 2026-05-05 fixing SA edit/create on Companies. |
| 363 | 🔲 Open | Mid | P4 | `quality` | **`PeopleCard.test.tsx` 8 failures — `vi.mock("@/lib/auth")` doesn't intercept transitive `useApiReady` calls** | The test mocks `useAuth` via `vi.mock("@/lib/auth", { useAuth: useAuthMock })` but transitive consumers (e.g. `EntityVideos` → `useApiReady` → `useAuth`) still resolve the real `useAuth` and throw "must be used within an AuthProvider". Pre-existing — fails on HEAD~1 too. Fix: either wrap the test render in a real `<AuthProvider>` with controllable state, OR replace `useApiReady` with a mockable hook surface, OR mock `useApiReady` in addition to `useAuth`. Unblocks: trustworthy ownership-gating regression tests on PeopleCard. Identified 2026-05-05 verifying SA admin-override didn't regress card tests. |
| 364 | ✅ Done | Now | P4 | `quality` | **`<EntityEditShell>` extracted so edit pages share one scaffold** (2026-05-05) | New `frontend/components/EntityEditShell.tsx` owns the `<AppShell>` + max-width wrapper + `PageHeader` breadcrumb (`Parent / Entity / Edit`) + back action + the four mutually-exclusive states (loading skeleton, access-denied, not-found, ready). `CompanyEditPage`, `JobEditPage`, and `ResumeEditPage` now declare entity context + states and pass the editor body — no more hand-rolled state cards or per-page chrome. Closes the duplication called out by #367. |
| 365 | ✅ Done | Now | P4 | `quality` | **`entityBreadcrumb()` helper extracted; CompanyDetail uses it** (2026-05-05) | New `frontend/components/entity-breadcrumb.ts` returns the canonical 2-segment `[parent, currentName]` `PageHeaderTab[]`. `CompanyDetail` switched. PeopleDetail (peer section tabs Profile/Services/Company) and JobDetail (parent + sibling section tabs Overview/Candidates/Reports) intentionally don't fit the 2-segment shape and keep their inline arrays. Named without the `use` prefix so `react-hooks/rules-of-hooks` doesn't fire when callers invoke it after early returns. |
| 366 | ✅ Done | Now | P4 | `quality` | **Pipeline panels self-gate via `useCanManageJobPipeline`; JobDetail no longer prop-drills** (2026-05-05) | New `useCanManageJobPipeline(jobOwnerId)` hook in `hooks/use-job-permissions.ts` (owner OR recruiter / employer / admin / SA). `JobPipelineKanban` and `JobPipelineReports` consume it internally and return `null` when the caller isn't entitled. JobDetail still uses the same hook for tab visibility + pre-fetch (one source of truth, not a prop-drill). Kanban split into outer gate + inner `PipelineKanbanInner` so React's hook order stays stable across the null return. Dead `useCanCreateJobs` / `useJobPermissionsWithAPI` exports deleted (zero callers). |
| 367 | ✅ Done | Now | P3 | `quality` | **ResumeEditPage migrated to AppShell + EntityEditShell** (2026-05-05) | `pages/ResumeEditPage.tsx` rewritten: dropped the manual `<Sidebar/>` + `<Navigation/>` + `<Footer/>` wiring + `pt-16 p-6` wrapper, replaced with `<EntityEditShell parent={Resumes} entity={resume} extraActions={<AddMedia/>}>`. Loading / error / not-found cards now flow through the shared shell. Add Media slot survives via `extraActions`. Slug subtitle preserved via `description` (string-or-ReactNode after the PageHeader title widening). |
| 368 | 🔲 Open | Now | P2 | `quality` | **API typecheck broken: `nle_media_sources.proxyUrl` write doesn't match drizzle schema** | `api/src/routes/nle.ts:664` calls `db.insert(nleMediaSources).values({ ..., proxyUrl: ... })` but the drizzle schema for `nle_media_sources` (added in migration 0067) doesn't expose a `proxyUrl` column. `npm run typecheck` in `api/` fails with TS2353 on this line. Likely fallout from M1→M2 NLE roadmap (#282) where proxy-editor wiring (#341) was scoped but the column never landed. Fix: add `proxy_url text` (nullable) to `nleMediaSources` + migration, or strip the field from the insert until #341 ships. Unblocks: green CI typecheck for the API package; partial closure of #341 proxy-editor wiring. Identified 2026-05-05 while wiring AI consolidate-highlights preview UI (pre-existing, unrelated to that work). |
| 369 | ✅ Done | Now | P1 | `feature` | **AI-Powered Salary Calculator now actually calls AI** (2026-05-05) | New `services/salary/handlers.ts` mirrors the `match-handlers.ts` DI pattern (`SalaryDeps { llm, recordUsage }`). `POST /analyze` routes through `salary_estimate` use case (qwen3-coder:free, temp 0.2, 2K maxTokens) with a system prompt that pins location-aware multipliers (SF/NYC 1.3-1.6×, Detroit 0.9-1.0×) and industry deltas; `POST /negotiation-tips` routes through `salary_negotiation` use case (gemma-4-31b:free, temp 0.6) for strategies + talking points + a target counter-offer band. Output projected into the `SalaryAnalysisResponseSchema` contract plus pass-through extras (skillsPremium, careerGrowth, marketTrends, negotiationRange) the frontend already opportunistically renders. `routes/salary.ts` shrunk to a thin Hono adapter (deps wiring + body parse + delegate). The deterministic `60K + yrs*3500` formula is preserved as `buildSalaryFallback()` and now ONLY runs when no provider key is configured or every fallback model fails — the `fallback: true` flag flows back to consumers. README controller table (line 1415) corrected to reflect the AI path + qwen/gemma model picks. Identified after a user reported every analysis returning $95k for an AI Engineer in Detroit (10 yrs exp = exactly the old stub's output). |
| 369 | ✅ Done | Now | P3 | `quality` | **Frontend typecheck broken: `PersonaPreviewContextValue` test stub missing two required fields** | `frontend/lib/__tests__/use-entity-ownership.test.ts:49` `withPreview()` now passes `{ personaPreview, tierPreview: null, setPersonaPreview: () => {} }` to `PersonaPreviewContext.Provider`, satisfying the full context type. `npm run typecheck` in `frontend/` is green. Closed 2026-05-05. |
| 370 | 🔲 Open | Soon | P3 | `quality` | **6 profile edit dialogs duplicate the same `updateProfile → refreshUser → onSaved → onOpenChange` save flow** | `frontend/components/profile/dialogs/{EditHeader,EditAbout,EditContact,EditSocialProfiles,EditSkills,EditCustomUrl}Dialog.tsx` each open-code an identical `useState(saving) + try/await updateProfile + refreshUser + onSaved?.() + onOpenChange(false) + catch console.error + finally setSaving(false)` block. Per the DRY rule. Fix: extract `useProfileSectionSaver({ onClose, onSaved, errorMessage })` returning `{ saving, save(updates) }` so each dialog drops the boilerplate to one hook + one form-payload `save()` call. Identified 2026-05-05 while wiring `onSaved` into all six dialogs to fix the post-edit refresh bug on `/people/:uuid`. |
| 371 | 🔲 Open | Soon | P3 | `quality` | **`EditHeaderDialog` reads `user?.avatar` but the auth `UserProfile` type uses `profilePicture`** | `frontend/components/profile/dialogs/EditHeaderDialog.tsx:98` `<AvatarImage src={user?.avatar} />` — but `auth-service.ts` `UserProfile` declares `profilePicture?: string` (and `updateProfile` writer at line 529 maps `payload.avatar = updates.profilePicture`). The avatar field on the in-memory user object is whatever the server's `data.avatar` shape is (sometimes mirrored to top-level `avatar` by `normalizePublicUserToProfile`, sometimes only at `data.avatar`), so the dialog renders empty for users whose avatar only lives on `profilePicture`. Fix: change to `<AvatarImage src={user?.profilePicture ?? (user as any)?.avatar} />` — or normalize the user object so a single field name wins everywhere. Unblocks: avatar always rendering in the edit modal. Identified 2026-05-05. |
| 372 | ✅ Done | Now | P3 | `quality` | **Skill Extractor: saved-resume + saved-job paths now use server-side id lookup with JSON-to-LLM pipeline** (2026-05-05) | Refactored `extractSkills` in `api/src/services/resume/skills.ts` to take a discriminated `SkillExtractInput` (`text` / `resume-json` / `job-json`); structured paths ship `JSON.stringify(content, null, 2)` to the LLM (12k cap) instead of a flattened text projection, matching the JSON-preserving tailor pipeline. Route `api/src/routes/skill-extractor.ts` now accepts `content`, `resumeId`, OR `jobId`; resume path is owner-gated, job path requires auth and projects the row via the new shared `parsedJobFromRow()` helper extracted from `services/job/match-handlers.ts` (DRY). Frontend `SkillExtractor.tsx` ships only the id for both saved paths — no more `JSON.stringify(resume.content)` or description-string assembly. Closes the 50k VALIDATION_ERROR for any resume size and gives the LLM structured input on both source types. |
| 373 | ✅ Done | Now | P2 | `quality` | **Tool Run History "Copy Report" now renders for every tool — every recordRun call site normalised to `NormalizedToolRunResult`** (2026-05-05) | Three coordinated changes closed the class of bug: (1) `CreateToolRunInput.result` tightened from `Record<string, unknown>` to `NormalizedToolRunResult` so future drift surfaces at compile time; (2) `ToolRunResultPanel` + `defaultCopyReport()` now render the previously-unused `extras` field as a label/value grid (and include it in the copied report); (3) every recordRun call site now produces a typed result. Per-tool fixes: **SummarizeResume** maps API response → `{ summary }` (the 2026-05-05 user-flagged bug); **SentimentAnalysis** wraps `interpretSentiment(score)` into `{ overallScore, grade, summary, recommendations }` via a single `recordSentimentRun` helper that all 3 handlers share; **SkillExtractor** groups skills via newly-exported `groupSkillsByCategory` + `SKILL_CATEGORY_LABEL` and fills `extras` via a single `recordSkillRun` helper for all 3 handlers; **ProfileAudit** maps checks → `{ strengths, weaknesses }` and audit rationales → `recommendations`; **JobResumeMatch** maps `score` → `overallScore` and `summaryRecommendations` → `summary`; **ResumeTailor** adds before/after `categoryScores` + maps `changes[]` → `recommendations`; **ResumeAnalysisToolPage** (Scorer + Optimizer) drops the `as unknown as Record` cast and explicitly maps `recommendation.severity` → `category` so badge styling matches the panel's expected severity axis. **ValueProposition** maps `executiveSummary` → `summary`, `keyStrengths` → `strengths`, alignment + valueProposition + callToAction → `recommendations`; existing test updated to pin the new shape. **ToolDialog** drops its own `as unknown as Record` cast since `normalized` is already typed. Pre-existing tool-run rows in non-normalised shapes are not back-filled — "Run again" from the history sheet is the user-facing workaround. |
| 374 | 🔲 Open | Soon | P2 | `quality` | **Resume analyzer LLM emits free-form `category` strings — frontend has to keyword-match to pick a wand** (2026-05-05) | The merged `services/resume/analyze.ts` system prompt asks the LLM for `{ severity, category, title, description, impact }` per recommendation. Categories are free text ("ats" / "keywords" / "format" / "content" / "impact" / "structure"); no structured `{ actionId, args }` is emitted alongside. Consequence: `frontend/lib/tools/find-wand-for-recommendation.ts` has to keyword-match `title + description` to dispatch the right wand (`consolidate_section_highlights`, `standardize_resume_dates`, `shorten_bullet`), so action coverage is fragile and depends on the LLM phrasing the imperative consistently. Fix: extend `ResumeRecommendationSchema` (`shared/tool-schemas.ts`) with optional `actionId: z.enum([...registered tool ids])` + `actionArgs: z.record(z.unknown())`; update the analyzer prompt to emit them when the recommendation maps to a known wand; resolver becomes `rec.actionId ?? findWandForRecommendation(...)`. Unblocks: Action button works for *every* category covered by a registered wand without prompt-tuning the keyword matcher. Identified 2026-05-05 during the Scorer/Optimizer collapse. |
| 375 | 🔲 Open | Mid | P3 | `feature` | **Wand coverage gap on Optimizer recommendations: no tool yet for "consolidate similar work entries", "add metric to bullet", "rewrite weak verbs", or "fill missing section"** (2026-05-05) | After the 2026-05-05 collapse the registry exposes 3 new mutation tools — `consolidate_section_highlights`, `standardize_resume_dates`, `shorten_bullet` — plus the pre-existing `apply_resume_rewrite` / `update_resume_summary` / `add_resume_skill`. Common analyzer recommendations *not* yet covered: (a) "Consolidate similar roles" (would need a `merge_work_entries` tool that combines two work[] entries), (b) "Add a metric to this bullet" (needs an LLM-generated metric proposal + accept/reject), (c) "Replace weak verbs" (could be `apply_resume_rewrite` + a verb-strengthening prompt), (d) "Add a Skills section" or "Add a Summary" (would need `init_resume_section` tools). For these recommendations the Action button is hidden by design (`<RecommendationActionButton>` self-gates to null). Fix: add the four wand tools to `frontend/lib/tools/registry.ts` with backend endpoints for the LLM-driven ones. Unblocks: every analyzer recommendation having an Action button instead of just "actionable when keyword-matched". Identified 2026-05-05 during the Scorer/Optimizer collapse. |
| 376 | 🔲 Open | Soon | P3 | `arch` | **Resume Scorer + Optimizer have one shared engine but two backend routes — collapse to a single canonical `/api/resume-analysis` after monitoring** (2026-05-05) | `api/src/routes/resume-scorer.ts::/score` and `api/src/routes/resume-optimizer.ts::/optimize` are now both thin proxies over `services/resume/analyze.ts` (one prompt, one Zod schema, one fallback). Two routes still exist for SEO continuity (different funnel pages) and for tool-run history (`tool_id = "ai-resume-scorer"` vs `"resume-optimizer"`). Long-term, one canonical `/api/resume-analysis` route with a `?surface=score\|optimize` query param (or just one route that returns the union shape and lets the page project) would simplify deploys, telemetry, and the `ai-api-registry.ts` mapping. Fix sequence: monitor for 2-4 weeks → add `/api/resume-analysis` as alias → migrate Chrome extension + frontend callers → 410 the legacy routes. Unblocks: one route to maintain, one rate-limit policy, one access-policy entry. Identified 2026-05-05 during the Scorer/Optimizer collapse. |
| 377 | ✅ Done | Now | P3 | `quality` | **Score-color thresholds disagreed between Resume Scorer (85/70) and Resume Optimizer (80/60)** (2026-05-05) | Closed during the Scorer/Optimizer collapse. Both pages now route through `frontend/components/tools/ResumeAnalysisToolPage.tsx` which uses one `getScoreColor` (≥85 green / ≥70 yellow / red) and one `getGradeColor`. Previously the two pages used different cutoffs so the same 78% would render yellow on the Optimizer and red on the Scorer. |
| 378 | ✅ Done | Now | P3 | `quality` | **Backend Resume Optimizer / Scorer routes had silent type drift: prompt emitted `category: "structure"\|"impact"` but Zod schema only allowed 4 values via `z.string()`** (2026-05-05) | Closed during the merge. The new `ResumeRecommendationSchema` (`shared/tool-schemas.ts`) uses an explicit `severity: z.enum(["critical","important","minor"])` plus a free-form `category: z.string()` that accepts every diagnostic bucket the analyzer prompt emits (ats / keywords / format / content / impact / structure). Both routes proxy through one schema so the backend can't accept-then-drop a value the frontend's narrower union rejected. |
| 379 | ✅ Done | Now | P2 | `quality` | **Resume Optimizer + AI Resume Scorer were 90% copy-paste duplicates (~800 lines each)** (2026-05-05) | Closed. Extracted `frontend/components/tools/ResumeAnalysisToolPage.tsx` — owns tabs (Paste / Upload / My Resumes), file/text/picker state, auth-overlay snapshot/restore, score header (with optional grade chip), category bars, strengths/weaknesses (self-gated on presence), recommendations with **Take-Action buttons**, Reset / Copy Report. Both `ResumeOptimizer.tsx` and `AIResumeScorer.tsx` collapsed to ~50-line config wrappers. Per the DRY rule. Action buttons dispatch directly through the tool registry (3 new wands: `consolidate_section_highlights`, `standardize_resume_dates`, `shorten_bullet`) — same registry entries are exposed to the AI Brain via `getCoachToolSpecs()` so the chat can call them on the user's behalf (MCP-style). |
| 380 | 🔲 Open | Soon | P3 | `quality` | **Dead routes removed: `/api/resumescorer/category-breakdown`, `/api/resumescorer/recommendations`, `/api/resumeoptimizer/ats-analysis`, `/api/resumeoptimizer/keyword-suggestions`. Verify Chrome extension + any external callers** (2026-05-05) | These four placeholder routes returned hardcoded sample data and had zero callers in `frontend/`. They were referenced only by `ai-api-registry.ts` (ai-orchestration intents) and the README. Removed during the Scorer/Optimizer collapse along with their `RESUME_ATS_ANALYSIS` / `RESUME_KEYWORD_SUGGESTIONS` / `RESUME_CATEGORY_BREAKDOWN` / `RESUME_RECOMMENDATIONS` AI-API registry entries; the `needsATSScore` orchestrator intent now routes to `RESUME_SCORE` (the merged endpoint covers ATS scoring). External callers (Chrome extension, partner integrations) need a sweep — if any remain, they'll get the 501 fallback. Unblocks: smaller route table to reason about, no orphaned hardcoded fixtures. Identified 2026-05-05. |
| 381 | 🔲 Open | Soon | P3 | `feature` | **Resume card score chips deep-link only to `ai-resume-scorer` history; ATS score is also writable by `resume-optimizer` so optimizer-only runs are invisible from the chip click** (2026-05-05) | `frontend/components/tools/ResumeScoreBadges.tsx` maps every sub-score (ATS / KW / Fmt / Cnt / Imp / Overall) to `ai-resume-scorer` and the heart chip to `sentiment-analysis`. That's right for users who run the full Scorer, but the Optimizer (`/Tools/ResumeOptimizer`) also writes `scores.ats` via `persistResumeScoresIfReferenced`. A user who only ran the Optimizer will see an ATS chip on the card, click it, and land on an empty Scorer accordion (their Optimizer runs sit in a different group below). Fix options: (a) per-score map → tool id list with the panel pre-expanding all matching groups, or (b) collapse Scorer + Optimizer history under a single "resume-analysis" view (related to #376). Unblocks: chip click reliably lands on the run history that produced the score. Identified 2026-05-05 while wiring score chips on the Resumes page. |
| 382 | 🔲 Open | Mid | P4 | `quality` | **`ToolHistoryPanel` initialToolId only pre-expands the accordion — when the resume has many tool groups, the auto-expanded one can be off-screen and the user has to scroll** (2026-05-05) | `frontend/components/ToolHistoryPanel.tsx` accepts `initialToolId` and seeds `<Accordion defaultValue=[id]>`, keyed off the id so re-opens remount cleanly. But there's no scroll-into-view, so on a resume with 6+ tool groups (Scorer + Optimizer + Tailor + Skill Extractor + Sentiment + Roast …) the expanded group can sit below the fold of the side sheet. Fix: ref the matching `<AccordionItem>` and `scrollIntoView({ block: "start" })` after mount when `initialToolId` is present. Unblocks: chip click → the right tool's history is *visible*, not just expanded. Identified 2026-05-05. |
| 383 | 🔲 Open | Mid | P4 | `quality` | **`toUserProfileDto` returns `slug: ""` instead of `null` when no custom URL set, breaking every `?? id` fallback in the frontend** (2026-05-05) | `api/src/routes/users.ts:229` does `slug: profile?.customUrlSlug ?? ""`. Because `??` only catches null/undefined, downstream `profile.slug ?? profile.id` chains keep the empty string and produce broken URLs like `/people/?tab=services`. Worked around in this pass at the frontend boundary (`normalizePublicUserToProfile` and `auth-service.normalizeAndPersist` now coerce `""` → `undefined`). Proper fix: change the DTO to return `null` and tighten the Zod schema to match, so consumers can rely on a single nullish-vs-string contract. Unblocks: removing the per-callsite `||`/`??` defensiveness in PeopleDetail, ProfileIntake, sitemap, articles. Identified 2026-05-05 while fixing People profile tab links. |
| 384 | ✅ Done | Now | P3 | `quality` | **JobCreatePage migrated to EntityEditShell + UUID redirect** (2026-05-05) | `frontend/pages/JobCreatePage.tsx` now wraps in `<EntityEditShell parent={Jobs} entity={{}} leafLabel="Create">`, dropping the legacy `pt-16 p-6` wrapper + Back button + standalone `<h1>`. New `useEffect` redirects bare `/jobs/create` → `/jobs/create/{crypto.randomUUID()}` so refresh / back / share-link mid-wizard preserve the draft id (mirroring `/resumes/create/:id` and `/companies/create/:id`). Access-denied state now flows through `EntityEditShell.accessDenied` so non-recruiter visitors keep the navbar instead of seeing a chrome-less centred card. Dead `<Link>` import dropped. |
| 385 | ✅ Done | Now | P4 | `quality` | **EntityEditShell now smart-singularizes parent labels** (2026-05-05) | `components/EntityEditShell.tsx` `singularize()` handles `-ies` → `-y` (Companies → Company), `-ches`/`-shes`/`-xes`/`-zes`/`-sses` → strip "es", and plain `-s` → strip. Falls through unchanged for irregular plurals (People, Media). The redundant `singular: "Company"` overrides on CompanyCreatePage / CompanyEditPage have been removed. `parent.singular` remains as an escape hatch for irregulars that don't fit the rules. |
| 386 | 🔲 Open | Soon | P2 | `feature` | **Helcim card expiry not captured on save** (2026-05-05) | HelcimPay's success postMessage doesn't reliably include `expiryMonth` / `expiryYear`, and Helcim has no public `/v2/cards/{cardToken}` lookup. Frontend forwards only `brand` + `last4`, so saved rows in `paymentMethods` show "Expires —/—". Fix options: (a) parse expiry from the masked `cardNumber` if HelcimPay starts including it, (b) use Helcim's `/v2/customers/{code}/cards` listing — confirm endpoint exists and returns expiry — and pull the most recently added card after a successful tokenisation, (c) ask Helcim support whether `displayContactFields` flips on extra fields in the success event. Unblocks: Settings → Payment Methods showing real expiry dates so users can spot soon-to-expire cards. Identified 2026-05-05 while wiring `savePaymentMethod` after the HelcimPay flow. |
| 387 | 🔲 Open | Soon | P3 | `feature` | **Helcim customer record drifts when address is changed in Settings → Billing without re-running checkout** (2026-05-05) | `helcim.ts:getOrCreateCustomer` PUTs the latest address whenever it's called from a payment route, but the standalone `PUT /api/profile/billing-address` endpoint only updates our `user_profiles` columns — it doesn't push the change to Helcim. So a user who edits their address in Settings and waits a month before paying will see the old address in HelcimPay until the next checkout fires the customer-update path. Fix: have `profile.ts:put` call `provider.updateCustomerBillingAddress(...)` (new method on `PaymentProvider`) when a Helcim customerCode already exists, or piggy-back on `profileService.saveBillingAddress` to enqueue a sync job. Unblocks: invoices and modal pre-fill always reflect what the user just typed. Identified 2026-05-05. |
| 388 | 🔲 Open | Mid | P4 | `quality` | **`paymentMethods.stripePaymentMethodId` column name leaks Stripe into the schema** (2026-05-05) | The column was named when Stripe was the only provider, but it now stores Helcim cardTokens too (`api/src/routes/payment.ts:savePaymentMethod` writes `stripePaymentMethodId: pm.providerPaymentMethodId`). Same goes for `users.stripeCustomerId` storing Helcim `CST…` codes. The provider-agnostic comment is honest but the names are misleading. Fix: rename to `providerPaymentMethodId` / `providerCustomerId` and add backfill migrations; update Drizzle schema, all references, webhook lookups in `routes/payment.ts:dispatchWebhookEvent`, and the legacy `getUserIdByStripeCustomer` helper in `services/billing/payment/stripe.ts`. Unblocks: a junior dev reading the schema can tell what the column actually holds. Identified 2026-05-05 while wiring Helcim customer codes. |
| 389 | 🔲 Open | Soon | P3 | `quality` | **Other OAuth tables likely share the `youtube_accounts` schema drift** (2026-05-05) | Migration `0076_youtube_accounts_drift_fix.sql` was needed because `youtube_accounts` was created in prod by an early `drizzle-kit push` and the canonical `0043` migration's `CREATE TABLE IF NOT EXISTS` then silently skipped applying the full canonical column set (most visibly `google_id`). `linkedin_accounts` (created in `0003_studio_features.sql`) and `calendar_connections` use the same `oauthConnectionColumns` helper that was added later — they may have the same drift waiting (e.g. missing `scopes` / `token_expires_at` / `is_active`). The next time one of those tables is read with a `select()` Drizzle will hit the same `column "X" does not exist` 500. Fix: write a one-shot `pg_attribute` audit comparing each Drizzle table to its prod schema and emit ALTER TABLE statements for any missing columns; or, defensively, ship `0077`-style fixup migrations for `linkedin_accounts` and `calendar_connections` mirroring 0076. Identified 2026-05-05 from the youtube_accounts drift incident. |
| 390 | 🔲 Open | Soon | P4 | `feature` | **Microsoft OAuth doesn't request `offline_access`, so Microsoft refresh tokens are never issued** (2026-05-05) | `PROVIDERS.microsoft.scopes` in `api/src/routes/oauth.ts` is `["openid", "profile", "email", "User.Read"]`. Without `offline_access`, Microsoft v2.0 returns no `refresh_token`, so `oauthAccounts.refreshToken` is always null for Microsoft rows. Login itself works (today's fix added `scope` to the token-exchange + a `User-Agent` for GitHub), so this is non-blocking — but if we ever want to call Microsoft Graph on the user's behalf after the access token expires (e.g. to sync calendar / fetch updated profile data) we'll have to re-prompt them. Fix: add `"offline_access"` to the Microsoft scopes array. Unblocks: long-lived Graph integration without re-prompting. Identified 2026-05-05 while debugging the GitHub + Microsoft OAuth callback errors. |
| 391 | ✅ Done | Now | P1 | `quality` | **GitHub OAuth callback was throwing `auth_failed` because Cloudflare Workers' `fetch` doesn't set a `User-Agent`, and `api.github.com/user` rejects requests without one** (2026-05-05) | GitHub returns `403 Request forbidden by administrative rules` if the User-Agent header is missing. `oauth.ts::fetchUserInfo` and `getGitHubEmail` were calling Graph endpoints without UA, so every GitHub login redirected to `/login?error=auth_failed`. Closed by adding a single `OAUTH_USER_AGENT = "hired.video"` constant and sending it on `exchangeCode` + `fetchUserInfo` + `getGitHubEmail` (harmless for Google/LinkedIn/Microsoft). Same pass added `scope` to the token exchange (Microsoft v2.0 documents it as Required) and beefed up error logging on token-exchange / userinfo failures so the provider's error_description lands in Cloudflare logs instead of just a status code. Dead `storeRefreshToken` helper and unused `refreshTokens` / `emailVerificationTokens` / `asc` / `isNull` / `sql` imports also removed. |
| 392 | ✅ Done | Now | P1 | `billing` | **Microsoft OAuth was failing AADSTS7000215 because `MICROSOFT_CLIENT_SECRET` held the secret ID, not the secret Value** (2026-05-05) | Confirmed via `wrangler tail` — every Microsoft callback returned `Token exchange failed: 401 {"error":"invalid_client","error_description":"AADSTS7000215: Invalid client secret provided. Ensure the secret being sent in the request is the client secret value, not the client secret ID..."}`. Azure Portal shows two columns under Certificates & secrets — Secret ID (a UUID) and Value (the actual opaque string, only shown once). The wrong column was copied. Fix: generated a new secret in Azure, copied the Value column, ran `wrangler secret put MICROSOFT_CLIENT_SECRET --env production`. No code change needed. |
| 393 | 🔲 Open | Mid | P3 | `quality` | **No proactive monitoring for OAuth client-secret expiry** (2026-05-05) | Microsoft secrets expire (24-month max since the 2021 Azure default change), GitHub PATs/secrets can be rotated, LinkedIn/Google secrets don't expire by default but can be revoked. Today there's nothing watching `oauthAccounts.tokenExpiresAt` or the *provider-side* secret expiry — the first signal is users hitting AADSTS7000215 / `invalid_client` and bouncing through `/login?error=auth_failed`. Fix: nightly cron that exchanges a known-bad code per provider and pages on any `invalid_client` response, OR (cheaper) a calendar reminder seeded from each secret's known expiry. Unblocks: catching expired secrets before users do. Identified 2026-05-05 from the AADSTS7000215 incident. |
| 390 | 🔲 Open | Mid | P4 | `quality` | **`JobCreatePage.uploadedFile` state is set but never read** (2026-05-05) | `pages/JobCreatePage.tsx:149` declares `const [uploadedFile, setUploadedFile] = useState<File | null>(null);`. `setUploadedFile` is called twice (during `handleFileUpload` and inside the success-state reset block), but the value is never rendered or passed to anything — the actual file processing dispatches off the `File` parameter directly. Pre-existing dead code, not introduced by the EntityEditShell migration. Fix: drop the state + the two setter calls; or, if there's a future plan to surface the uploaded filename in the UI, wire it in. Unblocks: removing a no-op render trigger that fires on every file upload and reset. Identified 2026-05-05 during the JobCreatePage migration. |
| 394 | ✅ Done | Now | P1 | `feature` | **"Open AI Side Panel" on `/jobs/create/[id]` actually populates the form now** (2026-05-05) | All three pieces of the original break landed in one pass: (a) `BaseAIContext.formSnapshot` added in `lib/types/ai-context.ts` — JobCreatePage publishes the live RHF values via `openAIWithPageContextAndMessage`, AIChatPanel renders them under "CURRENT FORM VALUES" in the system prompt with explicit `(empty)` markers so the LLM sees what's missing. (b) `apply_job_draft` tool registered in `lib/tools/registry.ts` with a typed schema for every writable field (title/description/company/location/responsibilities/requirements/employmentType/seniority/workSetting/salary{Min,Max}/currency); writes route through a new `lib/tools/active-form-bridge.ts` module that pages register via `useActiveFormBridge`, with a `writableFields` whitelist that throws if the model picks an unknown field. Run stages a `mutation: pending` preview; commit calls `setValue` per field — same Apply/Discard UX as the resume mutation tools. (c) Priming-message flow added: `openAIWithPageContextAndMessage(context, message)` sets `pageContext` + `pendingMessage` atomically so the model is briefed on the very first turn. JobCreatePage's four "Use AI" buttons (tab, side-panel, description, requirements) now all route through one `openAIForTask` helper with task-specific priming. Same pass: deleted the legacy `AIContextPayload` / `AIContextTarget` / `currentContext` / `openAIWithContext` plumbing in `lib/ai-context.tsx` (only JobCreatePage used it; the `homepage.chro` branch in AIChatPanel was already dead) and the now-redundant fallback at `AIChatPanel.tsx:813`. Tests: `lib/tools/__tests__/registry.test.ts` gains 5 new cases covering staging, commit, missing-form, and form-unmounted-between-Run-and-Apply; full suite 24/24 green. |
| 395 | 🔲 Open | Now | P2 | `feature` | **`JobCard` bookmark on `/jobs` listings doesn't reflect already-saved state — every Save click feels like the first** (2026-05-05) | `pages/Jobs.tsx::fetchJobs` calls `jobService.getPublicJobs()` and never enriches the returned `JobSummary[]` with the viewer's saved status, so `JobCard` only knows `isTracked: true` for jobs that come back from `getSavedJobs()` (i.e. on the dedicated "Saved" tab and the `loadUserJobsOnDemand` path that's currently commented out). On the All-Jobs grid the bookmark icon stays unfilled even after a successful save, the toast keeps saying "Job saved successfully" on every click, and the user thinks nothing happened. This is the UX symptom that masked the duplicate-rows bug fixed by migration `0077_saved_jobs_unique.sql` — the DB now rejects the duplicate (via `.onConflictDoNothing()` against the new `uq_saved_jobs_user_job` index) but the icon still won't light up until this is fixed. Fix options: (a) `getPublicJobs` joins `saved_jobs` for the authenticated viewer and returns `ownership: "tracked"` per row, the same shape `getSavedJobs` already produces; (b) `Jobs.tsx` fetches the saved-id Set once on mount and passes `initialSaved` into `JobCard`; (c) `SaveJobButton` / `JobCard` self-fetches saved status. (a) is best since `useEntityOwnership` already understands the `ownership` field and other surfaces (Profile, Company, Resume cards) follow the same pattern. Unblocks: bookmark icon honestly reflects state, "Job saved successfully" toast doesn't fire on duplicates, and the optimistic toggle in `JobCard.handleToggleTrack` becomes meaningful. Identified 2026-05-05 from user report on /jobs duplicate saves. |
| 396 | 🔲 Open | Soon | P3 | `quality` | **`/jobs` page carries dead "Your Job Postings" + "Tracked Jobs" branches that never render** (2026-05-05) | `pages/Jobs.tsx` renders two top-of-page sections — `jobsData.owned.length > 0` (lines 738-758) and `jobsData.tracked.length > 0` (lines 761-783) — but `jobsData` is only ever populated by `loadUserJobsOnDemand` (lines 590-642), and the `useEffect` that would have called it is commented out (lines 646-650). The `getJobsForUser` stub at lines 581-587 is declared but unreferenced. Result: a recruiter / employer never sees a separate "Your Job Postings" section — their owned jobs only appear inline in the "All Jobs" grid (now showing the Edit affordance after the JobService `userId` mirroring fix). This pre-dates the user report. Fix is paired with #395: once `getPublicJobs` returns per-row `ownership`, the entire `jobsData` split becomes unnecessary and the dead branches + `loadUserJobsOnDemand` + `getJobsForUser` can be deleted in one pass. Unblocks: simpler Jobs page (one render path instead of three), and either restoring the dedicated "Your Job Postings" group from a real source or removing the UI promise. Identified 2026-05-05 while fixing the missing-owner-controls bug. |
| 397 | ✅ Done | Now | P2 | `feature` | **Owner controls (Edit, Create Video) missing on `/jobs` cards for the user who created the job** (2026-05-05) | `JobCard` derives ownership via `useEntityOwnership({ ownerUserId: job.userId, ... })`, but the backend's `rowToJob` (in `api/src/services/job/JobService.ts`) only emitted `createdBy` (mapped from `postedByUserId`) — it never set `userId`. `pages/Jobs.tsx::fetchJobs` builds `jobMetadata` from the `JobSummary` payload with `userId: (job as any).userId \|\| ""`, which collapsed to `""`, so the hook fell through to `isOwner: false` and the Edit / Create-Video dropdown items were gated off for the actual creator. `pages/JobDetail.tsx` had a per-callsite workaround (`userId: j.createdBy \|\| j.userId`) but the Jobs grid did not. Fixed at the source: `rowToJob` now emits both `createdBy` and `userId` from `postedByUserId`, and `JobEntity` documents `userId` as a mirror so every consumer (Jobs grid, JobDetail, EntityVideos owner gate, JobCard menus) sees the same value without per-callsite coalescing. Mirrors `JobDetail`'s coalesce so the per-callsite hack can be removed in a follow-up. |
| 398 | ✅ Done | Now | P1 | `feature` | **Edit Job + Candidates/Reports tabs leaked to non-creator employers/recruiters on `/jobs/:id`** (2026-05-05) | `frontend/hooks/use-job-permissions.ts::useJobPermissions` previously fell back to `rolePermissions.canEditJobs` for non-creators, which returns `true` for *any* recruiter/employer/admin/SA. Result: an Employer at Company A viewing Company B's job posting saw "Edit Job" + Candidates + Reports tabs, and could open the edit form (PATCH would still fail at the API layer, but the UI promised access). `useCanManageJobPipeline` had the same shape — `role.isRecruiter \|\| role.isEmployer \|\| role.isAdmin \|\| role.isSuperAdmin`. Tightened both: non-creators only get edit / pipeline-manage rights when they're `isAdmin \|\| isSuperAdmin`. Same pass removed the duplicate "Edit Job" button in the hero (`heroActionSlot` was rendering a second copy on top of the toolbar one) — owners now see no hero CTA (Apply Now hidden too, since you can't apply to your own job), non-owners still get Apply Now. |
| 399 | 🔲 Open | Soon | P2 | `feature` | **Same-company team-mates can no longer edit each other's jobs** (2026-05-05) | After tightening #398, only the job creator + Admin/SA can edit a job. The accessDenied copy on `JobEditPage.tsx:66` still promises "Only the job creator, account owners, and recruiters within the same company can edit jobs" — that third clause is aspirational; there's no company-affiliation check anywhere in `useJobPermissions`. Today: a recruiter posts a job, leaves the company, and now no other team-mate can edit it without admin intervention. Fix needs (a) job → company linkage already present via `companyId` on `jobItems`; (b) viewer → company membership lookup (likely `companyMembers` table or `userProfiles.companyId`); (c) `useJobPermissions` extended to fetch viewer's company memberships and grant `canEdit` when `viewer.companyId === job.companyId` AND viewer's role within that company permits it. Mirrors the `canActFor()` pattern in `services/studio/workspace.ts`. Unblocks: real team collaboration on job postings without losing the cross-tenant guard. Identified 2026-05-05 while fixing #398. |
| 400 | 🔲 Open | Now | P1 | `arch` | **Persona-axis architecture inconsistency across `/resumes`, `/jobs`, `/people`, `/companies` + dead `ownership === "tracked"` tab on `/resumes`** (2026-05-05) | Each entity page improvises its own role-aware tab structure with three different role-detection patterns (`usePermissions().isEmployer`, `createRolePermissions(user.role).canManageJobs`, inline `rolePermissions.isRecruiter`). `/resumes` is the only entity surface that hasn't been split into job-seeker (`resume_information`) vs hiring-side (`candidate_resumes`, migration 0027) data sources — `Resumes.tsx:1342` builds tabs against owned resumes for both personas, so an employer sees the empty job-seeker UI. The `/resumes` "Candidates" tab in `Resumes.tsx:1352` filters `ownership === "tracked"`, but no backend route ever emits that value (`/api/resumes/withownership` always returns `ownership: "owned"` per `handleListOwnedResumes` in `ResumeService.ts:388`) — permanently empty dead UI. Meanwhile `/services/candidates` (`pages/services/CandidatesList.tsx` → `components/recruit/CandidatesPanel.tsx`) already has the correct hiring-side surface fully built (CSV import, JSON import, redaction profiles, `candidate_resume_shares`, talent-pool linkage, bulk scoring) — should be the target for `/resumes?tab=sourced`. Each of Jobs/Resumes/People/Companies independently re-implements role detection, tab construction, title/description selection, action gating, and data-source switching — ~600 lines of duplicated machinery in violation of the standing DRY rule. Fix: extract a shared `EntityHubShell` that consumes a tab descriptor `{ key, label, icon, roleGate, dataSource, cardRenderer, emptyState }` per the studio-workspaces `canActFor()` precedent in `services/studio/workspace.ts`; collapse `/services/candidates` into `/resumes?tab=sourced`; delete the dead `ownership === "tracked"` filter and Candidates tab on `/resumes`; add `canSourceCandidates` to `RolePermissions` so every persona-axis check funnels through one predicate. Schema changes: zero (every needed table already exists). New backend routes: zero. Unblocks: `/resumes` actually serves recruiter/employer; master-resume / Upload / Create Resume concepts stop leaking outside job_seeker; the four entity pages share one persona shell so a future fifth page inherits the contract instead of re-improvising. Identified 2026-05-05 from user report — employer logs into `/resumes`, sees "No matching resumes" empty card despite there being a fully-built sourcing surface a redirect away. |
| 401 | ✅ Done | Now | P2 | `feature` | **`/jobs` has no separate "My Postings" tab; owner-jobs only render inline in the All-Jobs grid** (2026-05-05) closed 2026-05-06 — added `posted` tab to `Jobs.tsx::topTabs`, gated by `canPostJobs` from persona.ts. Body filters `displayedJobs` to `userId === user.id`. Backend company-scoped query is still pending the #399 follow-up (same-company team-mates seeing each other's jobs). | Surfaced while drafting the persona-axis taxonomy for #400. `pages/Jobs.tsx::topTabs` lists Jobs / Saved / Applications / Alerts / Candidates — no dedicated "Posted" tab for jobs the viewer's company posted. Owner controls (Edit / Create Video / view candidates) ride along on the same grid via `JobCard`'s ownership badge, which is fine for discovery but offers no quick filter for "show only what my company posted." Today an employer who posts 50 jobs has to scroll the All-Jobs grid to find their own (or pivot to the Candidates tab). Fix lands as part of the EntityHubShell migration: the `posted` tab in the Jobs descriptor (#400) reads `job_items WHERE companyId IN myCompanies` via `resolveCompanyScope`. Unblocks: hiring-side workflow parity with `/resumes?tab=sourced` and `/companies?tab=mine`. Identified 2026-05-05 alongside #400. |
| 402 | ✅ Done | Now | P2 | `feature` | **`/companies` has no "My Companies" tab despite `userCompanyRoleAssociations` being the canonical membership table** (2026-05-05) closed 2026-05-06 — `/companies` now mounts via `EntityHubShell` with three tabs (Companies / Following / My Companies). The `mine` descriptor gates on `[recruiter, employer, admin]` (SA bypass via `visibleTo`). The body still uses the placeholder `getCompaniesForUser()` until the backend company-scoped read (`userCompanyRoleAssociations`) ships — that's a separate follow-up. | Surfaced during taxonomy work for #400. `pages/Companies.tsx::companiesTabs` exposes only "Companies" + "Connections" (followed). A recruiter/employer who's a member of a company has to navigate to `/companies/:id` directly or use AppShell sidebar — the listing surface doesn't filter by `userCompanyRoleAssociations`. Fix is the `mine` tab in the Companies descriptor (#400) — same `resolveCompanyScope` source already used by candidates / studio. Unblocks: parity with `/resumes?tab=sourced` and `/jobs?tab=posted`. Identified 2026-05-05 alongside #400. |
| 403 | 🔲 Open | Mid | P3 | `feature` | **No `/resumes?tab=watched` surface despite `watched_resumes` table existing — followed-resume concept is back-end only** (2026-05-05) | The `watched_resumes` table (referenced from `fake-db.test.ts` and the resume schema in `db/schema/resumes.ts:76`) supports a viewer→resume "I'm watching this candidate" relationship, but no `/api/resumes/watched` endpoint is exposed and no UI tab consumes it. The dead `ownership === "tracked"` filter on `Resumes.tsx:1352` (called out in #400) was meant to surface this but was never wired end-to-end. Deferred from the persona-axis pass (#400 PR-1) because it requires a new backend route. Fix: build `GET /api/resumes/watched` returning `ResumeWithOwnership[]` with `ownership: "watched"`, then add a `watched` tab to the Resumes descriptor for hiring-side personas. Unblocks: the `/resumes?tab=sourced` (own-company) + `/resumes?tab=watched` (cross-company candidate-following) split, mirroring the People connections-vs-talent-pool split. Identified 2026-05-05 alongside #400. |
| 404 | ✅ Done | Now | P3 | `feature` | **Talent Pool + Submissions tabs on `/people` are recruiter-only despite employer having `candidate_resumes` access** (2026-05-05) closed 2026-05-06 — `pages/People.tsx` swapped the inline `rolePermissions.isRecruiter` gates for `visibleTo([recruiter, employer, admin], user.role)`. SA passes via the bypass; employer now sees Talent Pool + Submissions tabs in the People hub. | `pages/People.tsx:824` gates `talent-pool` and `submissions` tabs on `rolePermissions.isRecruiter`, but the underlying `talent_pool_candidates` table is company-scoped (no role check) and employers already have `resolveCompanyScope` access for `candidate_resumes`. So an employer who imported candidates via `/services/candidates` cannot see the same set under `/people?tab=talent-pool` even though the data is right there. Fix as part of the EntityHubShell migration (#400): the `talent-pool` and `submissions` tab descriptors should gate on `personas: ["hiring_side"]` (recruiter|employer|admin|SA) instead of recruiter-only, OR the predicate should narrow by `canActFor(viewer, talentPool.companyId)` rather than role. Unblocks: employer-led talent pools are visible in the People hub. Identified 2026-05-05 alongside #400. Open question for the user: do we want employer to have full talent-pool / submissions parity, or is there a recruiter-only intent here that's worth preserving? |
| 405 | 🔲 Open | Now | P2 | `feature` | **No cross-job pipeline kanban — staged candidate view only reachable per-job via `/jobs/:id?tab=candidates`** (2026-05-05) | Surfaced during persona-axis design (#400). The full kanban infra exists — `jobPipelineEntries` + `pipelineTouchpoints` + `pipelineShareLinks` schema (`db/schema/jobpipeline.ts`), 9-stage enum (`shared/recruiter-pipeline.ts:5`: Applied / Long List / Screening / Interviewing / Short List / Submitted / Offer / Hired / Rejected), and full UI components (`JobPipelineKanban`, `KanbanColumn`, `JobPipelineCard`, `KanbanToolbar`, `JobPipelineReports`, `useJobPipeline`, `pipeline-mutations`). Backend `pipelineService.listEntriesByStage(jobId)` is per-job only. To see all candidates across all my company's jobs grouped by stage, a recruiter has to click into each job individually — Loxo / Bullhorn / Greenhouse all expose a cross-job pipeline. Fix: (a) new backend route `GET /api/pipeline/all?stage=&jobId=` filtering `jobPipelineEntries WHERE jobId IN (resolveCompanyScope(viewer).jobIds)` reusing the per-job grouping logic; (b) new `CrossJobKanban.tsx` that composes existing `KanbanColumn` + `JobPipelineCard` with a "for [Job Name]" label per card; (c) new `pipeline` tab on `/jobs` descriptor (hiring-side) once the EntityHubShell migration brings /jobs through the shell. Out of scope for PR-1 of #400 (which only does the /resumes migration). Unblocks: cross-job recruiter ops without per-job click-through; full Loxo-style candidate dashboard. Identified 2026-05-05 from user reference to Loxo kanban screenshot. |
| 406 | 🔲 Open | Now | P2 | `feature` | **No "Add to Job" affordance from the candidate pool — pool ↔ pipeline bridge is missing in the UI** (2026-05-05) | Today `CandidatesPanel` (the candidate_resumes pool list) shows row actions for view / share / etc. but no way to promote a pool candidate into a specific job's pipeline. Backend supports it: POST to the per-job pipeline endpoint with the candidate's name/email/resumeUrl creates a `jobPipelineEntries` row at `stage=longlist` (or whichever default the recruiter picks). The mental model is the standard ATS pool→pipeline split (Loxo / Bullhorn / Greenhouse all expose this) — pool is pre-pipeline, pipeline is per-job staged journey. Fix: row-menu item "Add to Job" on each `CandidatesPanel` row → opens a job picker (jobs in viewer's company scope) → optional starting-stage selector (default `longlist`) → POSTs an entry. Lands as part of the /resumes?tab=sourced migration in PR-1 of #400 since the pool surface is moving anyway. Unblocks: candidate moves from "in our pool" to "in our pipeline for Job X" without leaving the page. Identified 2026-05-05 alongside #400 + #405. |
| 407 | 🔲 Open | Soon | P3 | `quality` | **31 pre-existing test failures stem from test-scaffolding rot — components evolved to require AuthProvider / Router contexts that the test mounts no longer provide** (2026-05-06) | Inventory: `components/__tests__/PeopleCard.test.tsx` (8 fails — `useAuth must be used within an AuthProvider` because `PeopleCard` now embeds `EntityVideos` which calls `useApiReady`); `components/__tests__/StoryboardEditor.test.tsx` (9 fails — `useNavigate() may be used only in the context of a <Router>`); `__tests__/pages/Tasks.test.tsx` (7 fails — DOM query for "Kanban", "Add Task", "Task Details" buttons that have been renamed/restructured); `__tests__/pages/JobResumeMatch.test.tsx` (1 fail — error-banner DOM query drifted); `lib/config/__tests__/ai-api-registry.test.ts` (2 fails — `getAPIsForContext('resume-edit').length === 0`, registry config drifted to no-longer-include resume-edit context); `lib/services/__tests__/ai-orchestration-service.test.ts` (1 fail — same root cause as ai-api-registry); `lib/__tests__/card-feed.test.ts` (1 fail — fanout assertion). Fix is mechanical per-file: wrap renders in `<MemoryRouter>` / `<AuthProvider>` mocks; update DOM queries to match current button labels; sync the AI registry test fixture to whatever actions live in the registry today. Each file is a 5–20 line edit but there are ~7 files, so it's a separate scoped pass — bundling with the persona-axis PR would balloon the diff. Unblocks: green CI signal so the rest of the persona-axis migration (#400 + #401 + #402) can rely on the test suite as a regression gate. Identified 2026-05-06 while picking up PR-2 of #400. Confirmed pre-existing by stash-bisect against `main` before the persona-axis branch. |
| 408 | 🔲 Open | Soon | P3 | `arch` | **`useEntityOwnership` admin-override is wrong for entity types with no admin-edit route — patched locally in PeopleCard, hook contract still ships the global override** (2026-05-06) | The hook gives SuperAdmin acting as themselves a global `isOwner: true` so admin affordances appear on every entity card. That's correct for jobs / companies / resumes (they have admin manage routes that mirror `requireJobOwner` / `requireCompanyOwner` on the backend), but wrong for **profiles** — there is no admin-edit-someone-else's-profile route, and the "Edit profile" button just navigates to `/profile` (the viewer's own). On 2026-05-06 the SA reported seeing "Edit profile" on every PeopleCard; fix landed in `components/PeopleCard.tsx` by deriving `isOwnProfile` from the literal `viewerUserId === person.id` check (plus API `ownership === "owned"`) instead of the hook's `isOwner`. Hook itself was left alone — but the same bug recurs for any future entity type without an admin-edit affordance (articles, channels, creator profiles). Fix: extend `EntityOwnershipInput` with a `bypassAdminOverride?: boolean` (or a typed `entityKind` that the hook maps to override-eligible vs not), default `false`, and have `PeopleCard` and any future profile-shaped surface pass `true`. Tests in `lib/__tests__/use-entity-ownership.test.ts` would gain a "bypass override" pinning case. Unblocks: hook stays the SSoT and PeopleCard's inline fork goes away. Identified 2026-05-06 while fixing the SA Edit-profile leak. |
| 409 | 🔲 Open | Soon | P3 | `quality` | **`pages/People.tsx` "Discover People" block is duplicated 1:1 across two tabs — heading + loading skeleton + error/empty branches + grid mapping `personMetadata` + Pagination** (2026-05-06) | The People page has two render branches (~430 lines apart in the file) that both build a personMetadata object from `displayedPeople`, run the same loading/error/empty/grid switch, and render `<Pagination>` underneath — first instance lives in the recruiter "browse" view, second in the SA / admin view. The `personMetadata` shape is identical (35-line object literal duplicated in full, including the `(person as any).firstName ||` fallbacks and `ownership: "tracked" as const`), and both call the same handlers (`handleConnect`, `handleAcceptConnection`, etc). DRY violation per the project rule: any change to the discover grid (e.g. swap card layout, add a column, fix an `as any`) has to be made in two places. Fix: extract `<DiscoverPeopleGrid>` taking `{ people, isLoading, error, viewMode, onConnect, onMessage, onAcceptConnection, onRejectConnection, onAddToTalentPool, isRecruiterOrEmployer, onClearFilters, onRetry, currentPage, totalPeople, itemsPerPage, onPageChange, onItemsPerPageChange }` and replace both call sites. The `personMetadata` mapper should move with it. Out of scope of the 2026-05-06 SA Edit-profile + heading-removal pass (user-scoped to "delete the heading and CTA"). Unblocks: future People-page edits land in one file. Identified 2026-05-06. |
| 410 | ✅ Done | Now | P3 | `quality` | **Pre-existing typecheck errors in JobCard / card-factory surfaced while typechecking PeopleCard** (2026-05-06) closed 2026-05-06 — restored the `Edit` icon import in `JobCard.tsx` (the existing `if (canEdit && job.status === "draft")` branch references it for the draft badge). Re-added `onActions` to `JobCardProps` as a documented passthrough so `card-factory`'s legacy `interactions.onActions` wiring still type-checks. Both fixes shipped alongside the JobActionsMenu retrofit. |
| 411 | 🔲 Open | Soon | P3 | `feature` | **No `JobAnalyticsDialog` — `JobActionsMenu`'s Analytics entry has nowhere to land** (2026-05-06) | The new `JobActionsMenu` mirrors `ResumeActionsMenu`'s shape (View / Edit / Run Tool / Tool History / Analytics / Share / Delete), but no `JobAnalyticsDialog` component exists. Today the menu item is hidden because Jobs.tsx doesn't pass `onViewAnalytics` (better hidden than no-op). Fix: clone `ResumeAnalyticsDialog` shape and read from a new `/api/jobs/:id/analytics` endpoint — views per day, applications per source, pipeline funnel by stage, sponsored vs organic split. Backend route is also missing — both pieces bundled. Unblocks: hiring-side analytics parity with `/resumes`. Identified 2026-05-06 while building JobActionsMenu. |
| 412 | 🔲 Open | Soon | P3 | `feature` | **`JobActionsMenu` exposes Run Tool + Tool Run History + Embed for jobs but the backing tools / embed renderer for jobs are partial** (2026-05-06) | `ToolsSubmenu` already filters `tools-catalog.ts` by entity type (it accepts `entityType: "job"`) so Run Tool deep-links land — but only a subset of tools are catalog-tagged for jobs (mostly the JD-side analyzers). The Embed item on `EntityShareGroup` is wired to `onEmbed` but Jobs.tsx never passes it because there's no public job-embed renderer (resumes have one at `/resumes/embed/:id`). Fix: (a) audit `tools-catalog.ts` for tools that should accept `entityType` includes `"job"`; (b) build `/jobs/embed/:id` mirroring the resume embed pattern (`getJobForEmbed` exists or is a 1-line addition); (c) wire `onEmbed` on Jobs.tsx JobCard mounts. Unblocks: full feature parity between resume and job action menus. Identified 2026-05-06. |
| 416 | ✅ Done | Now | P3 | `quality` | **Profile Metrics zeros — `/api/users/:id/stats` was a stub, recent-viewers join was missing names + `viewsChangePercentage` was hardcoded** (2026-05-06) closed 2026-05-06 — Implemented the stats endpoint via a shared `getProfileStats(db, userId)` service ([api/src/services/profile/profileStats.ts](hired.video/api/src/services/profile/profileStats.ts)) used by `/api/users/:id/stats` and the seeker dashboard's `profileStats` payload (DRY: one source). Recent viewers now leftJoin `users.name` + `userProfiles.currentCompany`. `viewsChangePercentage` compares trailing-30 vs prior-30, with a +100 fallback when the prior window is empty. Frontend's `ProfileInsights` self-fetches all 8 fields via `userService.getUserStats` (drops the `profileStats` prop) so SuperAdmin / recruiter / employer profiles also populate — previously only the seeker dashboard ever returned `profileStats`. |
| 417 | ✅ Done | Now | P3 | `quality` | **DRY: dashboard `ProfileStatistics` and profile sidebar `ProfileInsights` rendered the same Profile Views grid + Recent Viewers list; recent viewers could repeat the same person 5×** (2026-05-06) closed 2026-05-06 — Extracted `<ProfileViewsPanel>` ([frontend/components/profile/ProfileViewsPanel.tsx](hired.video/frontend/components/profile/ProfileViewsPanel.tsx)) — single source for the 4-cell grid + Recent Viewers strip. Both `ProfileStatistics` (dashboard) and `ProfileInsights` (profile) render it; density via the `compact` prop. `getProfileStats` now pulls 50 recent rows and dedupes by `viewerUserId` in app code, keeping the latest hit per signed-in viewer; null-`viewerUserId` (anonymous) rows stay distinct. |
| 418 | ✅ Done | Now | P1 | `quality` | **Signup TURNSTILE_FAIL recovery soft-locked the user — wrong error message + no widget reset** (2026-05-06) closed 2026-05-06 — Production error report (iPhone Safari 26.4) showed `400 TURNSTILE_FAIL` from `/api/auth/register`, surfaced to the user as "Account with this email already exists" because `auth.tsx::signup()` was swallowing every error and returning `false`. Fix shipped in three pieces: (1) New [frontend/lib/services/signup-errors.ts](hired.video/frontend/lib/services/signup-errors.ts) `mapSignupError()` centralises server-code → i18n-key mapping (`TURNSTILE_FAIL`/`HONEYPOT_HIT` → `errors.captchaExpired`; `DISPOSABLE_EMAIL` → `errors.disposableEmail`; `OFAC_BLOCKED` → `errors.regionBlocked`; `GEO_BLOCKED` → `errors.regionWaitlist`; `MX_FAIL` → `errors.emailUndeliverable`; `BREACHED_PASSWORD` → `errors.passwordBreached`; `RATE_LIMIT` → `errors.tooManyAttempts`; `CONFLICT` → `errors.emailExists`). Both `Signup.tsx` and `AffiliateProgram.tsx` consume the same mapper (DRY). (2) `auth.tsx::signup()` rethrows typed errors instead of swallowing — return type tightened from `Promise<boolean>` to `Promise<void>`. (3) `TurnstileWidget` converted to `forwardRef<TurnstileWidgetHandle>` exposing `reset()` (no-op when no site key); Signup.tsx calls it on every catch so the one-shot Turnstile token is replaced with a fresh challenge regardless of which gate failed (captcha or post-captcha — MX/breach/conflict still consume the token via the order in `signupGuard.ts`). Locale keys added to `en.json` + `es.json`. |
| 419 | 🔲 Open | Soon | P2 | `feature` | **AffiliateProgram registration form has no Turnstile widget — every submit fails when captcha is enforced** (2026-05-06) | `frontend/pages/AffiliateProgram.tsx::handleRegister` calls `signup(...)` without a `cfTurnstileToken`, but the backend signup guard ([api/src/services/auth/signupGuard.ts](hired.video/api/src/services/auth/signupGuard.ts)) enforces Turnstile when `TURNSTILE_SECRET_KEY` is set — so every affiliate registration from a captcha-enforced environment returns `400 TURNSTILE_FAIL`. With #418 shipped the user now sees the right error message ("Captcha challenge expired or could not be verified") but has no way to actually solve a captcha because the form never renders one. Fix: drop a `<TurnstileWidget ref={turnstileRef} onToken={handleTurnstileToken} />` into the affiliate form (gated on `VITE_TURNSTILE_SITE_KEY` like Signup.tsx), wire the token through to `signup(...)`, gate the submit button on `captchaReady`, and call `turnstileRef.current?.reset()` in the catch — same shape as the Signup.tsx fix in #418. Better long-term: extract a `<SignupForm>` component so the affiliate page composes the same widget+state machinery instead of re-implementing it. Unblocks: affiliate-program signup actually working in production. Identified 2026-05-06 alongside #418. |
| 420 | ✅ Done | Now | P1 | `feature` | **Career 360 v2 — target picker + LLM gap engine + roadmap + score-history sparkline** (2026-05-06) closed 2026-05-06 | Replaces v1 placeholder wheel with the actual user ask ("I want to become X — what's my gap and the plan?"). Schema: `user_profiles.career_target` JSONB column (migration `0078_career_target.sql`) holds picker batch + selected target + LLM-derived rubric / gaps / roadmap. Backend: `services/career360/Career360Service.ts` (LLM `suggest` + `select` calls bound to new `career_360` use case in `providers.ts`, score-history pulled from `tool_runs`), `routes/career360.ts` exposes `GET /api/career360`, `POST /suggest`, `POST /select`, `DELETE /target`. Shared types in `shared/career360-types.ts`. Frontend: `pages/tools/Career360.tsx` rewritten — no target → AI proposes 3 candidates + custom entry; target chosen → wheel colored from gaps + `<TargetRoadmap>` (rubric + prioritized gap list + 30/60/90/180-day roadmap, gaps deep-link to catalog tool or AI Coach). `<ScoreHistorySparkline>` plots `tool_runs.score` per measured tool ("stamps of improvement"). Catalog entry + App.tsx route added. Cheap path (LLM rubric + cache, single active target) per the user's "go cheap, propose a couple of targets and help them choose 1" steer. |
| 421 | 🔲 Open | Soon | P2 | `feature` | **Career 360 inner-ring outcomes (Callbacks / Interviews / Offers / Goal Fit) are unmeasured — wheel inner ring stays grey by design** (2026-05-06) | `pages/tools/Career360.tsx::INNER_BLUEPRINT` ships the four outcome segments but `health` is hard-coded to `"unknown"` because we don't yet emit (a) callback rate from `jobApplications.responseAt` vs. application count, (b) interview-conversion rate from `interviewSessions` first-round → onsite progression, (c) offer rate from `placements` ÷ `interviewSessions`, (d) goal-fit derived from gap-analysis mean severity. Outer ring already pulls from the LLM gap analysis — inner ring needs the funnel-derivation pass. Fix: extend `Career360Service.getCareer360State` with a per-user funnel rollup over `jobApplications` + `interviewSessions` + `placements`, project that onto the four inner-ring ids, and surface alongside `history`. Unblocks: inner ring stops being decorative; "stamps of improvement" extends to outcomes. Identified 2026-05-06 alongside Career 360 v2 ship. |
| 422 | 🔲 Open | Soon | P3 | `feature` | **Career 360 outer ring health is rolled up from gap severity only — doesn't blend in actual tool scores yet** (2026-05-06) | `pages/tools/Career360.tsx::computeWheelHealth` colors each outer-ring segment from the highest-severity gap whose `category` matches the segment id. That works for "did the LLM call this out as a gap?", but it ignores the seeker's actual score history: someone with a 90 ATS score and zero gaps should still ring "good" on the Resume segment, while someone with a 35 ATS score and no gaps mapped (because they haven't run any scoring tools yet) should ring "moderate" not "good". Fix: blend the latest score from `Career360State.history[toolId].points[last]` with the gap severity per segment — use the worse of (severity-derived, score-banded). Lookup: resume → ai-resume-scorer + resume-optimizer; profile → profile-audit; salary → salary-calculator (when wired). Unblocks: wheel honestly reflects measured score floor + LLM-flagged gaps together. Identified 2026-05-06 alongside Career 360 v2 ship. |
| 423 | 🔲 Open | Mid | P3 | `feature` | **Career 360 supports a single active target — multi-target compare ("Staff PM vs. Founding Engineer") is the natural next step** (2026-05-06) | `user_profiles.career_target` is a single JSON document with at most one `selected` entry, per the user's "help them choose 1" steer for v1. The cheap follow-up: promote `career_target` to an array (or a sibling `career_targets` table keyed by `(userId, slug)`) so a seeker can keep two or three live plans and toggle between them. The Career360 page already routes through one `selected` shape — bumping to many means a dropdown / tab strip on the page header and a per-target wheel + roadmap. Unblocks: comparison shopping across targets without losing each plan's gap analysis. Deferred per the v1 ship. Identified 2026-05-06. |
| 424 | 🔲 Open | Soon | P3 | `quality` | **Drizzle insert-type inference collapses `user_profiles` to `{ userId }` — workaround duplicated in `Career360Service.persistDoc` and `usersRepository.upsertProfile`** (2026-05-06) | `typeof userProfiles.$inferInsert` resolves down to `{ userId: string }` despite the table having ~30 columns. Best guess is drizzle hits a TS expansion-depth ceiling for wide tables. Two call sites already work around it: `repositories/usersRepository.ts::upsertProfile` casts through `as any`, and `services/career360/Career360Service.ts::asInsertPatch` funnels the patch through `Record<string, unknown>`. Fix path: (a) upgrade drizzle-orm to a version that fixed the inference; (b) split `userProfiles` into a 1:1 join to shrink the parent table; (c) define an explicit `UserProfilePatch` type in `db/schema/users.ts` and use that everywhere. Unblocks: dropping the inline casts in `Career360Service` and `usersRepository`. Identified 2026-05-06 while persisting the Career 360 doc. |
