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
│   │   ├── routes/               # 119 route files (top-level) — one per feature domain (was ~100 at last audit; grew with courses, learning paths, gamification, sourcing, scorecards, paid media, externalEmail, comics/v2 studio, etc.)
│   │   ├── services/             # 47 service folders (organised by domain — auth/, billing/, company/, job/, media/, messaging/, recruiter-marketplace/, resume/, studio/, user/, etc.)
│   │   ├── repositories/         # 31 aggregate repositories — `buildRepos(db)` factory in [repositories/index.ts](api/src/repositories/index.ts) is the DI seam
│   │   ├── middleware/           # Auth, error handling, rate limiting, logging
│   │   ├── db/
│   │   │   ├── schema/           # Drizzle schema definitions — **303 `pgTable()` declarations across 68 schema files** (was 230/52 at last audit; growth driven by gamification, learning, sourcing, contentLocations, scorecards, paid media, externalEmail, comics)
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

**Current handler/deps pairs (verified 2026-05-25):**
- `auth-handlers.ts` / `auth-deps.ts` — register, login, forgot-password, reset-password, verify-email. **40 integration tests** (was 29 at extraction time).
- `resume-handlers.ts` / `resume-deps.ts` — get, update (slug-in-body, metaData preservation), create, delete, watch, unwatch, sentiment, list. **98 integration tests** (was 33 at extraction time).
- `companies-handlers.ts` (34), `billing-handlers.ts` (16), `autofill-handlers.ts` (19), `match-handlers.ts` (38), `plan-override-handlers.ts` (15), `settings-handlers.ts` (29) round out the migrated set.

**Adoption is partial.** Only ~24 route files have been migrated to `*-handlers.ts` + `*-deps.ts`. **101 route files still import `getDb()` directly inside Hono handlers** — see [Consolidated Gap Register](ROADMAP.md#consolidated-gap-register) #1327 for the migration backlog.

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

## Code Health Assessment — 2026-05-25

Full DRY / SOLID / architecture / performance / test-coverage audit run against the README's stated invariants. The architecture patterns above (especially #1, #7, #13) describe how the codebase **should** work; this section documents how it **actually** works today, and tags each finding with a Consolidated Gap Register entry.

### File-size reality

The codebase has grown faster than the architecture extraction work. **All inline file/table/route counts in the README have been corrected** against the current tree:

| Surface | Last documented | Actual (2026-05-25) | Delta |
|---|---|---|---|
| Route files (`api/src/routes/*.ts`, top-level) | ~100 | **119** | +19 |
| Routes mounted in `app.ts` | — | **141 `app.route()` calls** | — |
| Schema files (`api/src/db/schema/*.ts`) | 52 | **68** | +16 |
| `pgTable()` declarations | ~230 | **303** | +73 |
| Service folders (`api/src/services/*/`) | — | **47** | — |
| Repositories (`api/src/repositories/*.ts`) | — | **31** (`buildRepos(db)` factory) | — |
| `studio.ts` LOC | 1,716 | **4,015** | +2,299 |
| `studio-features.ts` LOC | 1,451 | **3,398** | +1,947 |
| `StudioLayout.tsx` LOC | 1,131 | **2,319** | +1,188 |
| `auth-handlers` tests | 29 | **40** | +11 |
| `resume-handlers` tests | 33 | **98** | +65 |

### DRY / SOLID violations against documented patterns

| Pattern (per Architecture Patterns above) | Violations found | Gap |
|---|---|---|
| **#1** — Handlers pure + Deps-injected | **101 route files still import `getDb()` directly** (out of 119). The handler/deps pattern has been extracted for ~24 surfaces (auth, resume, billing, companies, autofill, match, plan-override, settings) but the majority of routes still mix Hono adapter + business logic + Drizzle in one file. | #1327 |
| **#7** — One shared `ok`/`fail`/`HandlerResult` | **13 route files redeclare `ok`/`fail` locally** instead of importing from [`handlers/shared.ts`](api/src/handlers/shared.ts): `studio.ts`, `studio-features.ts`, `resumes.ts`, `video-pitch.ts`, `vendor-sync.ts`, `upload.ts`, `resume-roast.ts`, `phone.ts`, `nle.ts`, `interview.ts`, `interview-question-sets.ts`, `interview-assignments.ts`, `admin-r2.ts`. Each redeclaration carries the same drift risk that caused the 2026-04-20 blank-title production bug. | #1328 |
| **#13** — Routes → Services → Repos | Some services still `import { schema }` and run Drizzle directly instead of going via a repository. Spot-checked offenders: `services/auth/AuthService.ts` (loginEvents writes), `services/job/JobService.ts` (re-exports schema tables), `services/job/match-handlers.ts`, `services/billing/handlers.ts`, `services/user/autofill-handlers.ts`. The repos-per-aggregate seam is in place; the migration of these services to consume it is not. | #1329 |
| **Extract on duplication** | `getClientIp()` was successfully consolidated in `middleware/rateLimiter.ts` (good). But hand-rolled pagination Zod schemas, role-gate JSX, and `requireAuth` patterns are repeated across many route + page files with no shared helper. Frontend has 27 `React.lazy(` call sites but no shared "lazy role dashboard" or "lazy heavy panel" helper. | #1330 |

### File-size anti-patterns (top 11 over 1k LOC)

| File | LOC | Status |
|---|---|---|
| `api/src/routes/studio.ts` | 4,015 | 🚨 decompose by feature (gap #1331 — also #1316f for `firstName/lastName`/`ComicPalette`/`ComicSpecPage` type drift) |
| `api/src/routes/studio-features.ts` | 3,398 | 🚨 decompose by sub-feature (TTS / captions / LinkedIn / recording / coaching / ATS / interview / skills / voice clone / async interview / analytics) — gap #1332 |
| `api/src/routes/resumes.ts` | 2,021 | ⚠️ partly migrated to `resume-handlers.ts`; the dynamic `await import()` wrappers + lingering inline `getDb()` calls still bloat this file — gap #1327 |
| `frontend/pages/studio/StudioLayout.tsx` | 2,319 | 🚨 single-component owns voiceover + captions + version history + autosave + auth gate — gap #1333 |
| `api/src/services/job/JobService.ts` | 1,565 | ⚠️ schema re-exports + cross-aggregate orchestration — gap #1329 |
| `api/src/routes/recruiter.ts` | 1,436 | ⚠️ route + business logic mixed |
| `api/src/routes/courses.ts` | 1,308 | ⚠️ + two arity errors at :1126, :1247 (#1316b) |
| `api/src/services/job/match-handlers.ts` | 1,304 | ⚠️ |
| `api/src/routes/creators.ts` | 1,288 | ⚠️ + 36 `as any` casts |
| `api/src/routes/interview-assignments.ts` | 1,179 | ⚠️ + local `ok`/`fail` redefinition (gap #1328) |
| `api/src/routes/users.ts` | 1,101 | ⚠️ |

### `as any` density

The repo defaults to TypeScript strictness but `as any` has leaked into ~2,173 occurrences across 284 files (per the audit). Most are either intentional test mocks (`handlers/__testing__/fake-db.ts` — 27) or Hono context narrowing (`app.ts` — 11). The actionable density lives in `studio.ts` (~38) and `creators.ts` (~36). Tracked as #1334.

### Performance & runtime anti-patterns

| Issue | Where | Severity | Gap |
|---|---|---|---|
| Dynamic `await import()` inside per-request handlers — pays parse + tree-shake cost every request | 24 occurrences across 11 route files (worst: `analytics.ts:423`, `feed.ts:313`, `jobs.ts:214`, `search.ts:767`, `tool-runs.ts:184-185`, `studio.ts:1000,1068,1089`, `paid-media.ts:179,425,454`). Already flagged under "Deferred architectural work" above. | High | #1335 |
| N+1 over Neon: `Promise.all(items.map(async i => db.select…))` instead of `inArray()` | `services/analytics/creatorRollup.ts:67-99` (per-artifact metadata fetch); `services/creators/visibility.ts:45-62` (per-user `getSubscription` fan-out) | High | #1336 |
| Unbounded `SELECT` — no `.limit()` on event tables that grow without bound | `services/analytics/creatorRollup.ts:128-131` (`artifactViews.referrer` for an entire creator's history — OOM risk on Workers); `routes/calendar.ts:44-54` (no implicit cap on scheduled events) | High | #1337 |
| Over-fetching full rows when the UI only needs `{id, title, slug}` | `routes/calendar.ts:45` (returns attendees JSONB + reminderMinutes array); spot-checked `routes/users.ts` returns full row (password_hash is correctly stripped at serializer, but other columns leak) | Medium | #1338 |
| Rate-limiter Map has **no size cap, no TTL sweep, no LRU eviction** | [`api/src/middleware/rateLimiter.ts:10`](api/src/middleware/rateLimiter.ts) — global `store` Map and per-factory `bucket` Maps. Workers isolates do recycle, so the leak is bounded in practice — but a long-lived isolate under sustained traffic accumulates entries unboundedly. | Medium | #1339 |
| **All 141 routes eagerly mounted** in `app.ts` — every cold-start parses every route module, regardless of whether the request needs it | `api/src/app.ts` (716 LOC, 141 `app.route()` calls) — monolithic Worker bundle. Cold-start: top-level imports in `worker.ts` transitively pull in all 141 routes + every service + every repo, so a single `/api/jobs/:id` request still parses studio + courses + comics + nle + paid-media + email-integration before serving. | Medium | #1340 |
| Frontend bundle bloat — main bundle ~1.6 MB; heavy deps (`three` + `@react-three/fiber` + `@react-three/drei`, `pdfjs-dist`, `leaflet`+`react-leaflet-cluster`) loaded eagerly | 27 `React.lazy(` call sites exist, mostly inside the studio v2 surface — but the role-based dashboard split (`JobSeekerDashboard` / `RecruiterDashboard` / `EmployerDashboard` / `AdminDashboard`) is NOT lazy and ships to every user | Medium | #1341 |
| PBKDF2 100K iterations on login path is on the request thread (Web Crypto async is non-blocking but the round-trip latency adds to login response time). Documented for awareness — not a fix candidate. | `api/src/services/auth/auth.ts:47-92` | Low | — |
| No streaming for LLM responses — resume scorer / optimizer / skill extractor hold the connection open until the full LLM response lands | Various LLM-calling routes | Low | #1342 |

### Test coverage map

- **Total tests:** ~1,600 across 207 test files (api 88, frontend 113, shared 5, repos 1).
- **Handler/deps adoption:** every `*-handlers.ts` module has a matching `__tests__/*-handlers.test.ts`. Strong coverage on the extracted surfaces (resume 98, auth 40, match 38, companies 34, settings 29, autofill 19, billing 16, plan-override 15).
- **Repositories: 30 of 31 untested.** Only `buildRepos.test.ts` (gap #1315 smoke test) exists. `pointsRepository`, `scorecardsRepository`, `resumeRepository`, `mediaRepository`, `eventsRepository`, etc. have no direct coverage — they're exercised transitively via service tests, which means a CRUD-level regression in a repo will only fail at the service-test integration layer instead of at the unit it broke. Gap #1343.
- **Domains with zero service tests:** gamification (`services/gamification/`), learning/courses (`services/learning/`), recruiter (`services/recruiter/`), paid-media (`services/paid-media/`), career360 (`services/career360/`), comics, graph, pipeline, profile, tremendous, location, moderation, sync, youtube. Gap #1344.
- **Frontend component coverage:** 22 components with dedicated tests against ~1,254 frontend files (~1.8%). Top-tested: `WebcamRecorder` (25), `AIChatPanel` (17), `ToolCallCard` (11), `StoryboardEditor` (11), `ResumeEmptyDropzone` (8). Gap #1345.
- **Fake-DB adoption:** 14 of 52 service test files import [`api/src/handlers/__testing__/fake-db.ts`](api/src/handlers/__testing__/fake-db.ts) (26%). The harness exists; the discipline of using it for every handler test isn't enforced. Gap #1346.
- **File-coverage estimates:** api services 32%, api routes 13%, frontend 9%, shared 1%, repositories 3%.

### Net assessment

The architecture vision (Pattern 13: Routes → Services → Repositories) is correctly designed and partially landed. The repos exist, the factory exists, the handler/deps pattern works beautifully on the surfaces where it's been adopted. The drift is **adoption velocity**, not design: new surfaces (studio v2, comics, courses, paid media, sourcing, etc.) have been added faster than older surfaces have been migrated to the canonical pattern.

The highest-value next moves, in order:
1. **#1327** — sweep the 101 routes still calling `getDb()` directly. Each migration unblocks real unit testing for that surface.
2. **#1331 / #1332 / #1333** — decompose the three megafile offenders (`studio.ts`, `studio-features.ts`, `StudioLayout.tsx`). They cumulatively account for 9,732 LOC.
3. **#1343 / #1344** — add repository-level tests + close the gamification/learning/recruiter test gap (currently silent on regressions in three of the most actively-developed domains).
4. **#1335 / #1336 / #1337 / #1338** — perf fixes; the dynamic-import-in-hot-path + N+1 + unbounded-SELECT combination is the most likely cause of any p99 latency spike on the analytics/creator/calendar surfaces.

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
  StudioLayout.tsx        ← top-level state, layout, auth gate (2,319 lines — needs decomposition, see gap #1333)
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
  studio.ts               ← core studio routes (4,015 lines — needs decomposition, see gap #1331)
  studio-features.ts      ← TTS, captions, LinkedIn, recording, coaching, ATS, interview, skills, voice clone, async interview, analytics (3,398 lines — needs decomposition, see gap #1332)

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

The full studio capability matrix (every shipped feature assessed against the Canva-Video / CapCut spec — 31 ✅ / 4 ⚠️ / 3 ❌) now lives in **[DONE.md](DONE.md)**. Open studio gaps remain in the [Consolidated Gap Register](ROADMAP.md#consolidated-gap-register) (#124–#145).

## Training Materials & SCORM — Build Strategy

Per the platform's HR-vertical-marketing positioning, corporate L&D and indie course creators are first-class users. The build strategy for the Courses / SCORM vertical (gap-register entries #160–#168) is **"don't build a new authoring tool — re-purpose AI Studio."** Roughly 80% of what Articulate / Synthesia / iSpring sell is already shipped under a different label.

### Studio capabilities that map directly to training-material authoring

The shipped-capability mapping table (existing studio features that already serve SCORM / training authoring) now lives in **[DONE.md](DONE.md)**. The net-new gaps, competitive positioning, and phasing below remain the forward-looking build strategy.

### What's actually net-new for SCORM / training (the real gap)

| Need | Status | Estimate |
|---|---|---|
| Course → Module → Lesson hierarchy schema (`courses` / `course_modules` / `course_lessons` / `course_enrollments` / `course_certificates`) | ✅ LANDED — migrations 0041 / 0042 | M |
| SCORM 1.2 player runtime (scorm-again wrapper + CMI persistence via `scorm_cmi_states`) | ✅ LANDED — migration 0126 + `ScormPlayer.tsx` + `POST /api/courses/scorm/:enrollmentId/commit` | L |
| SCORM 1.2 / 2004 package upload + player end-to-end (#161) | ✅ LANDED — scorm-again ^3.0.4, JSZip client-side extract, same-origin asset proxy, ScormPlayer + CourseLearner mounted | L |
| SCORM 1.2 zip *export* (text_md lesson → portable SCORM zip the LMS-buyer can re-host) | ✅ LANDED — [frontend/lib/courses/scorm-export.ts](hired.video/frontend/lib/courses/scorm-export.ts), per-row Download CTA in CourseContentEditor, `cmi.core.score.raw` + `cmi.core.lesson_status` driven by the embedded knowledge-check grader | S |
| SCORM 2004 4th-edition ADL conformance (sequencing + rollup) | 🟡 Partial #1461 — runner + checklist shipped; manual suite run still pending (needs Java + Maven + browser driver) | M |
| xAPI / Tin Can internal LRS (`xapi_statements` + `POST /api/courses/xapi/statements`) | ✅ LANDED — migration 0126 | M |
| External LRS forwarding (mirror `xapi_statements` writes to customer-configured endpoint) | ✅ LANDED — migration 0183 `external_lrs_targets` + [services/learning/lrs-forwarder.ts](hired.video/api/src/services/learning/lrs-forwarder.ts) + per-user `GET / POST / PATCH / DELETE /api/courses/xapi/lrs-targets`; fire-and-forget mirror invoked from the xAPI POST handler | S |
| Learning path / prerequisite chaining (DAG; `course_prerequisites` + `learning_paths` aggregate; cycle detection in `LearningPathService`) | ✅ LANDED — migration 0126 + `/api/learning-paths/*` routes | S |
| Verifiable certificate issuance (`/verify/:certNumber` public page, HMAC-signed payload, ready for Accredible/Credly bridge via `external_provider` columns) | ✅ LANDED — `CertificateService` + `POST /api/courses/enrollments/:id/certificate` + `GET /api/verify/:certNumber` | M |
| Cert revocation admin endpoint | ✅ LANDED — `CertificateService.revokeByCertNumber` + `POST /api/admin/courses/certificates/:certNumber/revoke` (SuperAdmin-gated). Public verify path returns `{valid:false, reason:"revoked"}` post-revoke. | S |
| Gamification tie-in: lesson / course / cert / path / publish actions in `ACTIONS`; new badges (`first_lesson_passed`, `first_course_passed`, `courses_completed_5`, `first_certificate_earned`, `first_path_completed`, `instructor_first_course`); learning actions added to streak signals | ✅ LANDED — migration 0126 + `domains/gamification/rules.ts` + `badge-engine.ts` + `GamificationService` helpers | S |
| Studio "Save as Course Lesson" export destination + `course_lesson` studio purpose | ✅ LANDED — `STUDIO_PURPOSES` + `PUBLISH_DESTINATIONS` updated | S |
| Authoring eligibility extended to employers (creator program OR `employer` role; `courses.is_employer_authored` flag) | ✅ LANDED — `resolveAuthorEligibility` in `courses.ts` + `learning-paths.ts` | S |
| LMS integrations (Cornerstone / Workday Learning / SuccessFactors / Docebo / TalentLMS connectors) | ✅ LANDED — #200 (adapter chain) + #1504 (OAuth callbacks: Docebo reference impl + `POST /api/lms-oauth/:provider/configure` API-key path for TalentLMS / Cornerstone / Workday / SuccessFactors) | L — per provider |
| Course authoring teams + reviewer roles | ✅ LANDED — #167 (status enum + `assignedReviewerId`) + #1502 (review queue UI) | M |
| PowerPoint → eLearning conversion (#163) | ✅ LANDED — client-side JSZip pptx walker + thumbnail R2 upload + skeleton commit | M |
| Course accessibility (keyboard-trap, focus-visible, screen-reader sweeps on `ScormPlayer`) | ✅ LANDED — #1503 — skip-link, polite status announcer, `role="application"` on the iframe, focus-visible ring with offset, `aria-busy` on loading, SR-only keyboard-help hint. WCAG AA contrast holds via existing tokens. | S |
| SCORM SCO iframe theming postMessage handshake | ✅ LANDED — #1572 — parent `ScormPlayer` posts `{type:"hv:theme", tokens}` to the iframe's window after load; the SCORM-export launcher ships a whitelist-receiver shim that folds the four CHROME_TOKEN_MAP keys into `:root` CSS variables. | S |
| `scorm-again` npm dependency install + ESM bundling validation in Vite | ✅ LANDED — #1467 (pinned to ^3.0.4) | S |
| Studio storyboard generator: `course_lesson` system-prompt branch + lesson scene types (`learning_objective`, `concept`, `worked_example`, `knowledge_check`, `summary`) | ✅ LANDED — #162 | S |
| Course UI: learner course player, prerequisite-graph visualizer, path-progress page, instructor course editor with prereq picker, "Save as Course Lesson" handler in `StudioSaveMenuV2` | ✅ LANDED — #166 + #1501 (theme picker + ScormPlayer chrome token-merge) | M |
| Knowledge-check `studioVideoForms` repurpose (`formType: "knowledge_check"` w/ answer keys + scoring + remediation jumps) | ✅ LANDED — #201 + #1505 (author-side picker UI). SCORM-export launcher reads the answer key and drives `cmi.score.raw` for both internal player + third-party LMS playback. | S |
| Marketplace cover-image generator (seed library cards fall back to GraduationCap icon without one) | ✅ LANDED — [frontend/lib/courses/cover-generator.ts](hired.video/frontend/lib/courses/cover-generator.ts) deterministic SVG cover (1200×630 OG card) + "Auto-generate" CTA in CoursesManagerPanel | S |
| Course payment / cart wiring for paid enrolment | ✅ LANDED — migration 0183 `course_checkouts` + [api/src/routes/course-checkout.ts](hired.video/api/src/routes/course-checkout.ts) (`POST /start` + `POST /:id/confirm-payment`) + [frontend/pages/CourseCheckout.tsx](hired.video/frontend/pages/CourseCheckout.tsx) at `/checkout/course/:courseId`; the free `/enroll` path's 402 routes the consumer to the checkout page automatically. | M |

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

The per-route / per-service / schema implementation-status inventory now lives in **[DONE.md](DONE.md)**. Open items are tracked in the [Consolidated Gap Register](ROADMAP.md#consolidated-gap-register).

## Legacy API Coverage Map

The full legacy-parity coverage map (every `/myvideoresume-api` controller → TS route/service/table, ~89% covered, plus the "can the legacy project be removed?" analysis) now lives in **[DONE.md](DONE.md)**. Remaining legacy-parity gaps are tracked in the [Consolidated Gap Register](ROADMAP.md#consolidated-gap-register) (`legacy` type).

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

Open gaps, the full product roadmap, and implementation status are tracked in the [Consolidated Gap Register](ROADMAP.md#consolidated-gap-register) below.

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
| `POST /api/creators/payout` | Routes through `payout_profiles.payout_provider` (Helcim ACH / Tremendous wired via #771; `creator_profiles` payout columns were dropped in migration 0092 — schema-drift fix) |

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
  - Reads the descriptor from the print URL (`?d=<serialised descriptor>`) so the caller's selected template survives the new-window hop. (URL, not `sessionStorage`: the print window is opened with `noopener`, which gives it a fresh sessionStorage rather than a copy of the opener's — the old stash never reached it, so print always fell back to the default template.)
- The same `<DeclarativeResumeRenderer>` will later back `ResumeDetail`, `EmbeddedResume` (compact variant), and marketplace previews — one renderer, three hosts.

### Export formats

| Format | Mechanism | Bundle impact |
|---|---|---|
| **PDF** | Opens `?print=1` in a new window → auto-triggers browser print-to-PDF | zero |
| **Word (.doc)** | Emits Word-compatible HTML with MS Office XML namespaces, served as `application/msword` — Word opens it as a fully-styled document. True `.docx` would need a library (docx/html-docx-js); skipping for first pass. | zero |
| **Plain Text (.txt)** | JS serializer walking `ResumeData` — bulleted sections, headings, date ranges | zero |
| **Raw JSON (.json)** | `JSON.stringify(resume.data, null, 2)` | zero |

All four are implemented in `frontend/lib/resume-exporters.ts`. PDF export serialises the current descriptor into the print URL (`?print=1&d=…`) before opening the print window so the template selection survives the new-tab hop — the window is opened with `noopener`, so a `sessionStorage` stash would not reach it.

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

## Roadmap, Open Gaps & Isolation Tracks → [ROADMAP.md](ROADMAP.md)

All **open + partial** work — the Consolidated Gap Register, the TK1–TK11
parallel-agent isolation tracks, and the CxO go-live gap analysis — lives in
**[ROADMAP.md](ROADMAP.md)**. Shipped / resolved items live in
**[DONE.md](DONE.md)**. This README is product + architecture reference only.

## Shipped & Resolved → [DONE.md](DONE.md)

The shipped-capability summary (579 ✅ Done items grouped into capability clusters) and the full Resolved archive (Done + Removed / Won't-fix / Superseded gap rows) live in **[DONE.md](DONE.md)**. The Consolidated Gap Register (open + partial work only) lives in **[ROADMAP.md](ROADMAP.md)**.

## Localization (i18n) Coverage Catalog

Moved to a dedicated file: **[LOCALIZATION.md](hired.video/LOCALIZATION.md)** — it holds the methodology, the regenerate command ([scripts/i18n-coverage.cjs](hired.video/frontend/scripts/i18n-coverage.cjs)), the progress log, and the full per-page coverage table.

---

