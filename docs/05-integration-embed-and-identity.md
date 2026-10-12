# 05 — PRD: Identity, Customer Embeds & Internal Seams

This specifies how people sign in to hired.video's People & Talent domain, how external candidates
authenticate, how Segments are provisioned, how customers embed hired.video views on their **own**
sites, and how the domain's modules talk to each other. hired.video is the only system of record:
there is no host product, no embed-back shell, and no cross-product API seam. The only external
runtime dependency is the Builderforce LLM gateway, used as a transport for LLM calls.

---

## 1. Topology

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                 hired.video                                    │
│                                                                                │
│  (1) identity: users / companies / RBAC  ──► resolveSegment() → Segment        │
│      + enterprise SSO (customer OIDC IdP, roadmap)                             │
│                                                                                │
│  /api/people/* · /api/contacts · /api/bookings · ATS · interviews              │
│      (3) internal seams = in-process service calls                             │
│                                                                                │
│  (2) company embeds (shared/embed.ts, embed keys, /api/embed/v1, /embed/*)     │
│      ──► customers' own sites / intranets                                       │
│                                                                                │
│  (5) candidate / guest magic-link identity                                      │
└───────────────────────────────┬────────────────────────────────────────────────┘
                                │ (4) LLM dispatch (transport only)
                                ▼
                 Builderforce LLM gateway (@seanhogg/builderforce-sdk)
```

Five channels: **(1) hired.video identity**, **(2) customer embeds**, **(3) internal seams**,
**(4) LLM gateway** (unchanged), **(5) candidate magic-link identity**.

---

## 2. Identity

### 2.1 hired.video is the identity source

- hired.video owns `users`, companies/workspaces, and RBAC. A signed-in user's session JWT is issued
  by hired.video.
- `resolveSegment()` maps the authenticated user's active company → `Segment` (lazy-create on first
  sight, `provisionedAt = now`) inside the `self` tenant (`people_tenants`).
- The user's role + plan gate features and seed the credit-ledger tier for that Segment.

### 2.2 Tenancy enforcement (the no-bleed guarantee)

- `resolveSegment()` is the **only** entry to company data. Every People/Talent handler runs inside a
  `(tenantId, segmentId)` context object; repositories require it.
- A session for company A can never resolve to company B's Segment (`Segment` unique key is
  `(tenantId, companyId)`), and every resolution is checked with `canActFor()`.
- Switching the active company → different Segment. No caching across Segments in request scope.

### 2.3 Enterprise SSO (native roadmap)

For enterprise customers who want their employees to sign in with their own IdP, hired.video adds
**external OIDC tenant federation** (tracked in gap #1819):

- A federated tenant (`Tenant.kind = FEDERATED`) stores the customer's `idpIssuer` + client config.
- hired.video verifies the IdP token (signature + issuer + audience + expiry), JIT-provisions or links
  a hired.video `users` row, caches last-seen claims in `IdentityCache` (doc 01 §2), and resolves the
  Segment for the customer's company.
- hired.video remains the system of record for users and roles; the IdP only authenticates.

### 2.4 Candidate / guest magic-link identity (channel 5)

External candidates and interview guests are **not** hired.video account holders. They authenticate
by **magic-link token** (the pattern already exists in `booking_reservations.magic_link_token`):

- A magic-link token has `aud: "candidate"` (vs `aud: "host"` for signed-in hired.video users) and is
  **pinned** to one `(segmentId, entityId)` where entity ∈ {Interview, Candidate, BookingReservation, Offer}.
- Candidate tokens are accepted **only** by `/v1/portal/*` and `/v1/public/careers/*` (apply) routes;
  signed-in routes reject `aud: "candidate"`, and `/v1/portal/*` rejects `aud: "host"`. This audience
  split is the core guardrail.
- Tokens expire (`Interview.expiresAt`); re-issue requires a signed-in user's action. A candidate
  session can never enumerate Segment data — every read is the single pinned entity.
- All portal actions are audited with the token's entity context.

---

## 3. Segment provisioning

1. The first People/Talent request for a company with no Segment lazily creates one
   (`status = ACTIVE`, `plan` from the company's hired.video plan).
2. On creation, seed defaults: default TCO assumptions and runway inputs, default 1:1 templates,
   default pipeline stages, default careers slug.
3. Plan changes in hired.video billing update feature gating + credit tier on the Segment directly.
4. Company deletion / GDPR erasure in hired.video cascades delete of all Segment-scoped rows
   **including video recordings, resumes, transcripts, and contacts**, through hired.video's own DSR
   flow.

---

## 4. Internal seams (channel 3)

In the source design these crossed a product boundary. In hired.video they are in-process service
calls between modules. None block a render path.

### 4.1 Roster → company record

- Every roster (`Employee` / `user_company_role_associations`) write recomputes the hired.video
  company's `teamSize` + `coFounders` in-process (`syncCompanyFromRoster` semantics).
- Idempotent; never blocks the CRUD response.

### 4.2 Candidate sourcing/enrichment ← native contacts graph

- hired.video's contact graph is `contacts` (owner_user_id, email, full_name, company, title, phone,
  linkedin_url, `linked_user_id` → `users`, lifecycle `contact`|`lead`, source
  `manual`|`inbox`|`enrichment`|`sourcing`, `enriched_at`) + `contact_job_links` (contact ↔
  `job_items` pipeline link with a stage) — `api/drizzle/0493_contacts_graph.sql`, registry
  `shared/contacts.ts`.
- Routes: `/api/contacts` (CRUD), `/api/contacts/:id/enrich` (spends enrichment credits through the
  native `EnrichmentProvider` seam in `api/src/services/enrichment/`), `/api/contacts/:id/jobs`
  (pipeline links), `/api/contacts/merge-queue` (approve/reject).
- Duplicate-person detection scores candidates (LinkedIn URL / phone / name+company / name+email
  domain) and feeds `person_merge_queue`, honoring `workspace_person_merge_policy` (auto-merge ≥
  threshold vs review). Platform users with the same email are auto-linked via `linked_user_id`.
- Suppression + DSR are enforced by hired.video — a suppressed identifier is never enriched and
  incurs no spend. `Candidate.contactId` links an ATS candidate to its contact.
- Inbox actions `upsert_contact`, `create_sourcing_lead`, and `link_to_pipeline` write these native
  rows directly.

### 4.3 Headcount/TCO/comp → burn & runway

- Runway inputs live on `people_tco_settings`: `cash_on_hand_cents` + `monthly_burn_cents`
  (`api/drizzle/0440_people_runway_inputs.sql`).
- The headcount-plan summary (TA-5 `calculate-impact`) adds the plan's monthly people-cost to the
  current burn and computes `monthlyBurnIncrease` + `runwayImpactDays` natively. **Closes the "runway
  impact" marketing gap the source design never wired.**

### 4.4 Employee equity grants

- On `Offer` acceptance (TA-3) and equity changes, hired.video records the grant (shares, cliff,
  vest) on the employee's comp record. An investor cap table is out of scope (doc 00 §2.2).

### 4.5 HR compliance

- Only HR-area compliance items (employment law, worker classification, I-9) exist in hired.video;
  their deadlines surface on hired.video's own calendar and notifications.

### 4.6 Goal/OKR linkage

- hired.video owns objectives/goals. Any hired.video record that stores
  `linkedObjectiveId`/`linkedKeyResultId` reads goal status via `GET /v1/goals/:id` /
  `GET /v1/strategic-objectives/:id`.

---

## 5. Customer embeds (channel 2)

### 5.1 One embed rail — `shared/embed.ts`

hired.video lets a company embed hired.video views on **its own** website or intranet. The surface
catalog is `EMBED_SURFACES` in `shared/embed.ts` — the single source of truth shared by the backend
snippet builder, embed-key scopes, and the settings UI:

1. Each surface (roster, 1:1s, goals, team health, calendar, bookings, strategy, reviews, check-ins,
   pulse checks, weekly syncs, scorecards, meeting intelligence, workflows, …) has a `key`, a
   `scope`, and a `status` (`available` | `reuse-existing` | `planned`).
2. A company issues an **embed key** carrying the scopes it wants to expose; the runtime data API is
   `/api/embed/v1` (authenticated by the embed key) and the framed views live under `/embed/*`.
3. Snippets are offered only for `available` surfaces; the rest are declared for the roadmap.
4. Embedding is **default OFF** per company and requires an explicit opt-in with consent recorded.

### 5.2 Rules

- One shared embed loader component handles mount, auth handoff, height/resize, deep-link sync, and
  loading/error state — parameterized by surface key, not N bespoke embeds.
- Embedded views enforce the same `canActFor()` + Segment isolation as the in-app views; the embed
  key only narrows scope, it never widens it.
- hired.video is never itself embedded into another product's shell.

---

## 6. LLM gateway (channel 4) — unchanged

- hired.video uses `@seanhogg/builderforce-sdk` → the Builderforce LLM gateway for all LLM dispatch:
  caller passes `useCase` + `viewer`; usage is projected to hide vendor/model from non-admins.
- The credit ledger, tier rates, use-case profiles (`USE_CASE_PROFILES`), and viewer projection live
  in hired.video, **scoped per Segment** (the `viewer` carries the Segment + role/plan).
- The **CHRO persona prompt** is the default voice on People-Ops surfaces. New `ats.*` and
  `interview.*` use cases (doc 01 §8) are added to hired.video's `AI_USE_CASES` registry.
- Circuit breaker + error-mapping behavior is reused as-is. The gateway is a transport; it owns no
  product data.

---

## 7. Security & compliance checklist

- [ ] Session/IdP token signature + issuer + expiry verified on every request; `aud` enforced (`host`
      vs `candidate`).
- [ ] `resolveSegment()` is the sole entry to company data; no handler runs without `(tenantId, segmentId)`.
- [ ] Candidate magic-link tokens pin to one `(segmentId, entityId)`; rejected by all signed-in
      routes; cannot enumerate.
- [ ] Cross-Segment read is impossible (integration test: Segment A session cannot fetch Segment B
      rows for every resource; candidate token cannot fetch any other entity).
- [ ] Embed keys are per-company, per-scope, rotatable, and audited.
- [ ] Embeds default OFF; opt-in records consent.
- [ ] Outbound webhooks (bookings etc.) HMAC-signed; replay-protected.
- [ ] **Video recordings, resumes, transcripts, and contacts** are Segment-scoped, encrypted at rest,
      retention-policed per Segment, and erased by the Segment DSR cascade.
- [ ] Careers-page application captures consent; sourcing/enrichment honors hired.video's
      suppression list + DSR queue (no spend on suppressed identifiers).
- [ ] AI hiring outputs are advisory; never auto-decide; bias guardrails documented (doc 04 VI-4).
- [ ] Per-Segment credit ledger; gateway daily breaker respected.

---

## 8. API surface summary

| Group | Endpoints (see PRDs for full list) |
|-------|-------------------------------------|
| Identity/admin | `resolveSegment` (internal); enterprise SSO callback (roadmap) |
| People Ops | `/api/people/*` (shipped) and the `/v1/employees*`, `/v1/one-on-ones*`, `/v1/performance-reviews*`, `/v1/goals*`, `/v1/strategic-objectives*`, `/v1/milestones*`, `/v1/pulse-checks*`, `/v1/scheduled-check-ins*`, `/v1/scorecards*`, `/v1/weekly-syncs*`, `/v1/meeting-intelligence*`, `/v1/workflow-triggers*`, `/v1/calendar*`, `/v1/slack*`, `/v1/analytics/*` shapes specified in doc 02 |
| Bookings | `/api/bookings/*` (shipped — see [prd/bookings-and-reservations.md](./prd/bookings-and-reservations.md)) |
| Talent + Cost | `/v1/requisitions*`, `/v1/candidates*`, `/v1/offers*`, `/v1/tco/*`, `/v1/headcount/*` (incl. runway impact), `/v1/roles*`, `/v1/hiring-forecasts*`, `/v1/pto*` |
| Contacts | `/api/contacts` (CRUD, `/:id/enrich`, `/:id/jobs`, `/merge-queue`) |
| Video / Interview | `/v1/interviews*`, `/v1/interviews/:id/scorecards*`, `/v1/requisitions/:id/interview-questions/generate` |
| Candidate portal (magic-link) | `/v1/portal/interviews/:token/*`, `/v1/portal/offers/:token`, `/v1/public/careers/*` |
| Customer embeds | `/api/embed/v1/*` (embed-key auth), `/embed/*` framed views |
| Realtime | live-interview rooms + async-recording processing stream (WebSocket/SSE, Segment- or token-authorized) |

All signed-in routes require a Segment-resolvable hired.video session; all `/v1/portal/*` require a
single-entity candidate magic-link token; embed routes require a scoped company embed key.
Everything is Segment-isolated and rate-limited per Segment.
