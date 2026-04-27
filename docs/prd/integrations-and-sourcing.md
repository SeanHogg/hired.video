# PRD — Integrations & Sourcing

**Owner:** Platform / Trust & Safety
**Status:** Implemented (live as of 2026-04, schema migration `0049_integrations_sourcing.sql`)
**Surface:** `https://hired.video/admin/integrations` and `https://hired.video/admin/integrations/sourcing`
**Code anchors:**
- Frontend: [IntegrationManagement.tsx](hired.video/frontend/pages/admin/IntegrationManagement.tsx), [SourcingTool.tsx](hired.video/frontend/pages/admin/SourcingTool.tsx)
- API: [integrations.ts](hired.video/api/src/routes/integrations.ts)
- Domain: [hired.video/api/src/services/sourcing/](hired.video/api/src/services/sourcing/)
- Schema: [integrations.ts](hired.video/api/src/db/schema/integrations.ts), [drizzle/0049_integrations_sourcing.sql](hired.video/api/drizzle/0049_integrations_sourcing.sql)

---

## 1. Background & problem

Hired.video already has two adjacent capabilities — a **bidding marketplace** where recruiters bid to source candidates against company-posted jobs, and the existing **enrichment / scraping pipeline** under [shared/scraping/](hired.video/shared/scraping/). Neither offered:

1. A **single registry** of every external data provider (paid APIs, free APIs, public dumps, creator-built integrations) with consistent enable/disable, credentials, telemetry, and cost accounting.
2. A **cache-first sourcing layer** so we stop re-paying for the same email/LinkedIn/GitHub lookup.
3. A path for **creators** to ship their own integrations and earn from them, governed by a SuperAdmin review queue.
4. **GDPR / CCPA compliance** for the contact data we accumulate as we source — a public DSR submission flow, an admin processing tool, a permanent suppression list, and an erasure-aware redaction model on the canonical contact table.
5. A **reconciliation/merge tool** for the inevitable case where a sourced contact later signs up as a real platform user — without it we'd have two records of the same person and recruiters would see ghosts of users they could already message.

This PRD documents what shipped to close gap #96 (enrichment provider integration) and the GDPR rails that came with it.

---

## 2. Goals & non-goals

### Goals
- One place — `/admin/integrations` — for SuperAdmin to manage every provider (system + creator-submitted), see 7-day spend / error / cache-hit telemetry per provider, and rotate API-key references without touching code.
- Cache-first sourcing: target ≥ 70 % cache-hit rate steady-state so the marginal $/source approaches zero.
- A creator marketplace surface: any authenticated creator can submit a new integration; SuperAdmin approves / rejects; approved integrations participate in the same resolver chain.
- Public DSR submission + SuperAdmin DSR processing — erasure must redact + suppress in one transaction so the same identifier cannot be re-sourced.
- A merge tool for sourced-person ↔ user reconciliation that **never auto-merges** (false positive risk is asymmetric — a wrong merge writes someone else's profile data onto a real user).

### Non-goals
- Replacing the **bidding marketplace** ([sourcing.ts schema](hired.video/api/src/db/schema/sourcing.ts), `job_sourcing_listings`). That is a separate aggregate — the word "sourcing" overlaps but the domains do not.
- Building bespoke UIs per provider. Every provider renders the same card driven by the registry row's `capabilities` and `pricing_model`.
- Surfacing sourced contacts directly to recruiters as a browse-able pool. Sourcing data is enrichment fuel; visibility lives behind reconciliation + product features built on top.
- Providing a developer SDK for creator integrations. Creators register metadata; the actual provider class still ships in `services/sourcing/providers/` and is loaded via [registry.ts](hired.video/api/src/services/sourcing/registry.ts). A user-defined-runtime is out of scope.

---

## 3. Users & access

| Role | Can do |
|------|--------|
| **SuperAdmin** (`canAccess("integrations")`) | Everything: enable/disable providers, set credentials, approve creator submissions, run lookups without credit gate, run reconciliation pass, merge / reject / unmerge people, process DSRs, edit suppression list. |
| **Creator** (authenticated user) | Submit integration via `POST /api/creators/integrations`, list/edit own submissions while `pending` or `rejected`. Cannot see global telemetry or credentials. |
| **Authenticated user** (any) | `POST /api/sourcing/lookup` cache-first lookup. Cache hits + free-provider hits are free; paid-provider success debits one `enrichment_credits` token. |
| **Public (no auth)** | `POST /api/data-subject-requests` submission. Always gets a 202 + verification email; no data is touched until the magic-link is clicked. |

---

## 4. Surfaces

### 4.1 `/admin/integrations` — Integration Management
Tabbed layout:
1. **Providers** — two sub-sections: *System integrations* (ship with platform) and *Creator integrations* (submitted via creator API, gated on `review_status`). Each provider renders as a card with: display name, slug, category, capability chips, pricing badge, 7-day stats (total runs, cache hits, errors, spend $), credential env-var status (resolved / not set), enable toggle, "Credentials" dialog (env-var name only — secrets live in Cloudflare), and for creator submissions: Approve / Reject buttons. Toggle is disabled until `review_status === 'approved'`.
2. **Recent Runs** — flat append-only log from `integration_runs`: timestamp, status, kind, cache hit, cost, duration, error message. Surfaces failure patterns and cache effectiveness at a glance.
3. **Data Subject Requests** — DSR queue with Process / Reject actions. Each Process call invokes the request-type-specific path (erasure redacts + suppresses; access/portability summarises matches; opt-out adds suppression entry).
4. **Suppression List** — read + add + remove. Manual entries cover known opt-outs, hard bounces, and spam complaints; erasure DSRs add entries automatically.

A prominent "Open Sourcing Tool" CTA links to `/admin/integrations/sourcing`.

### 4.2 `/admin/integrations/sourcing` — Sourcing Tool
Tabbed layout:
1. **Lookup** — interactive cache-first resolver UI. Pick query kind (`email | linkedin_url | github_login | name_company | domain`), submit, see the outcome + status badge (`cache_hit | cache_miss_resolved | not_found | suppressed | no_providers`), cost, duration, and the projected canonical fields. Suppressed and no-provider cases render explanatory copy with an inline link back to enable a provider.
2. **Reconciliation / Merge** — list view filtered by `merge_status` (`pending_review | unclaimed | merged | rejected_match | all`), plus a "Run reconciliation pass" button that triggers a bulk scan (cron-equivalent on demand). Selecting a row opens a per-person review pane showing canonical fields, identifiers, all source payloads (provenance), full audit log, and the candidate users with confidence scores + per-candidate Merge button + a "Reject all candidates" action. Merged rows can be Unmerged.

---

## 5. Functional requirements

### 5.1 Provider registry
- Single `integrations` table is the source of truth. `kind ∈ {system, creator}` differentiates origin; everything else is shared.
- `capabilities` is a flat boolean map (`enrichByEmail`, `enrichByLinkedIn`, `enrichByName`, `enrichByHandle`, `emailFinder`, `bulkImport`, `sourcingScrape`) — the resolver routes by these, not by hard-coded slug lists.
- `pricing_model ∈ {free, paid, freemium}`; `cost_per_call_cents` drives both the resolver's "cheapest capable provider" sort order and the SuperAdmin spend telemetry.
- `enabled` defaults `FALSE` on insert so a freshly added paid provider cannot accidentally consume credits.
- `review_status ∈ {approved, pending, rejected}`. System integrations seed as `approved`; creator submissions as `pending`. Resolver only consults `enabled = TRUE AND review_status = 'approved'` rows.
- 9 system providers seeded by migration: People Data Labs, Apollo.io, Proxycurl, Hunter.io, GitHub, Stack Overflow Data Dump, Wikidata, Common Crawl, OpenCorporates. Concrete provider classes live in [providers/](hired.video/api/src/services/sourcing/providers/) and are registered in [registry.ts](hired.video/api/src/services/sourcing/registry.ts).

### 5.2 Credentials
- Stored in `integration_credentials`, **not** by value — only the env-var name (e.g. `PDL_API_KEY`). The actual secret lives in Cloudflare secrets / process env and is looked up at call time. This keeps the registry row safe to render in the admin UI.
- Credential dialog reports whether the env-var currently resolves to a non-empty value (`credentialsResolved` boolean), surfaced as a green ✓ or amber ✗ badge on the provider card.
- Optional `extra` JSONB map for secondary credentials (e.g. account ID), each pointing at its own env-var.

### 5.3 Cache-first resolver ([resolver.ts](hired.video/api/src/services/sourcing/resolver.ts))
Lookup order on every call:
1. **Suppression check** — `isQuerySuppressed` against `data_suppression_list`. Hit → return `suppressed`, never spend, never persist, audit-record only.
2. **Cache lookup** — `enrichment_cache` keyed by `(query_key = SHA-256(canonical), integration_id)`, TTL-aware (default 90 d, provider can override via `staleAt`). Hit → increment `hits`, set `last_hit_at`, return `cache_hit` with reconstructed canonical fields from `sourced_people`.
3. **Provider chain** — `pickProviderRow` filters enabled+approved providers by capability for the query kind, sorts by `cost_per_call_cents` ascending. Free providers (cost 0) sort first. For each candidate: load credentials, call `provider.enrich`, on success → upsert `sourced_people` (matching by `email_hash | linkedin_url | github_login`), upsert `person_identifiers`, write to `enrichment_cache` + `person_sources` (provenance), record success run, return `cache_miss_resolved`. On `not_found` → cache the negative result for 1 day to avoid re-spending. On error → record error run, fail over to next provider.
4. If no provider produced a hit → `not_found`. If no providers were eligible at all → `no_providers`.

Every step logs to `integration_runs` (kind, status, cost, cache_hit, duration_ms, error_message). This is the data behind the Recent Runs tab and the per-card 7-day stats.

### 5.4 Person model
- `sourced_people` is the canonical merged identity. Distinct from `users` — these are *contacts*, not registered platform members.
- `person_identifiers` is the unique-keyed lookup index across `email | email_hash | linkedin_url | github_login | twitter_handle | phone_e164`. The unique constraint is `(identifier_type, identifier_value)` so the resolver can collapse cross-provider duplicates.
- `person_sources` is per-provider provenance — every payload from every provider, never overwritten, with `stale_at` for TTL.
- `is_redacted` is a soft-delete flag set by erasure DSRs. Redacted rows survive (audit trail intact) but all identifying fields are nulled, identifiers/sources/cache rows are deleted, and the identifier is added to suppression so it cannot be re-imported.

### 5.5 Billing (user-facing lookups)
- `enrichment_credits` row per user (`balance`, `totalConsumed`).
- User lookup gate: balance ≥ 1 required before any work runs. Cache hits and free-provider hits do **not** debit. A successful paid-provider call debits one credit and writes an `enrichment_transactions` row referencing the cache row id for audit.
- 402 `INSUFFICIENT_CREDITS` returned when balance is 0; UI prompts purchase. (Credit purchase flow is owned by the billing surface, not this PRD.)

### 5.6 Creator submissions
- `POST /api/creators/integrations` — kebab-case slug 3-64 chars, display name, category, pricing, capabilities (booleans), description ≥ 20 chars, optional homepage / docs URLs.
- Inserted with `kind = 'creator'`, `enabled = false`, `review_status = 'pending'`, `owner_user_id = userId`.
- Creator can `PATCH` while `pending | rejected` — patch resets to `pending`. `approved` rows are immutable from the creator side; require resubmission as a new slug version.
- SuperAdmin reviews via Approve / Reject in the Providers tab. Rejection requires a free-text reason (modal prompt) stored on the row.

### 5.7 Reconciliation & merge ([reconciliation.ts](hired.video/api/src/services/sourcing/reconciliation.ts))
- Match signals (priority): email +60, LinkedIn URL +50, GitHub handle +40. Sum capped at 100. Threshold for surfacing a candidate: ≥ 50.
- `runReconciliationPass(limit = 500)` — bulk scan of `unclaimed` rows; for each, find top user candidate; if confidence ≥ 50, call `flagMergeCandidate` which sets `merge_status = 'pending_review'` and writes a `sourced_person_merge_log` row. Designed for a nightly cron; SuperAdmin can also trigger from the UI button.
- `findPersonCandidatesForUser(userId)` — inverse direction; intended to be called from the user-signup hook so a new account is matched against existing sourced records on day zero.
- `mergeSourcedPersonIntoUser` — sets `linked_user_id`, `merge_status = 'merged'`, writes audit log entry with matched identifiers + admin id + optional notes. Identifiers stay on the sourced row for audit; the `linked_user_id` filter hides merged rows from any unclaimed-pool view.
- `rejectMergeCandidate` — `merge_status = 'rejected_match'`, audit row.
- `unmergeSourcedPerson` — restores `unclaimed`, clears link, audit row. Used when a merge is realised to be wrong.
- **Auto-merge is intentionally absent.** A false positive merges someone else's data onto a user's profile, which is far worse than a one-click admin confirmation.

### 5.8 GDPR / CCPA
- **Public submission**: `POST /api/data-subject-requests` accepts `request_type ∈ {access, erasure, rectification, portability, objection, opt_out}`, subject email, optional secondary identifiers, jurisdiction, free-text notes. Returns 202 with a verification token; subject must click magic-link to advance from `verifying_identity` → `pending`. No data is touched until verified.
- **Admin processing** branches on `request_type`:
  - `erasure` — find every `sourced_people` row with matching `primary_email_hash`, redact in place (`is_redacted = true`, fields nulled), delete `person_sources` + `person_identifiers` + `enrichment_cache` rows for that person, then add the email + every secondary identifier to `data_suppression_list` with `reason = 'erasure_request'`.
  - `access | portability` — count matches, surface for manual export + email-out.
  - `opt_out | objection` — add email to suppression list with `reason = 'user_opt_out'`.
  - `rectification` — manual; admin applies edits, then marks complete.
- **Suppression list**: unique on `(identifier_type, identifier_value)`, with `identifier_hash` for emails so the index doesn't expose raw addresses. `isQuerySuppressed` is consulted on every resolve and ingestion. A suppressed lookup never spends, never persists, never returns data — only an audit row.

---

## 6. Data model summary

| Table | Purpose |
|-------|---------|
| `integrations` | Registry of every system + creator provider. |
| `integration_credentials` | Env-var-name pointer per integration. Never stores secrets. |
| `integration_runs` | Append-only run telemetry (cost, cache_hit, status, duration, error). |
| `sourced_people` | Canonical merged identity for sourced contacts. Soft-deleteable via `is_redacted`. |
| `person_identifiers` | Unique-keyed lookup index (`type`, `value`) → person. |
| `person_sources` | Per-provider raw payload + TTL (provenance / audit). |
| `enrichment_cache` | Cache-first resolver storage, keyed `(query_key, integration_id)`, TTL-aware. |
| `sourced_person_merge_log` | Append-only reconciliation audit (`detected | merged | rejected | unmerged | auto_merged`). |
| `data_subject_requests` | DSR queue with magic-link verification + processing audit. |
| `data_suppression_list` | Identifiers that must never be re-sourced. |
| `enrichment_credits` / `enrichment_transactions` | User-facing credit balance + ledger. |

---

## 7. API surface

```
POST /api/sourcing/lookup                               # User-facing, credit-gated
GET  /api/integrations/providers                        # Public list of enabled providers (capabilities, pricing)

POST /api/creators/integrations                         # Creator: submit
GET  /api/creators/integrations                         # Creator: list own
PATCH /api/creators/integrations/:id                    # Creator: edit own (pending/rejected only)

GET  /api/admin/integrations                            # SuperAdmin: list w/ stats + credential status
PATCH /api/admin/integrations/:id                       # SuperAdmin: partial update
POST /api/admin/integrations/:id/enable | /disable      # SuperAdmin: toggle
PUT  /api/admin/integrations/:id/credentials            # SuperAdmin: set env-var name
POST /api/admin/integrations/:id/review                 # SuperAdmin: approve | reject creator submission
POST /api/admin/integrations/lookup                     # SuperAdmin: lookup w/o credit gate
GET  /api/admin/integrations/runs                       # SuperAdmin: recent runs
GET  /api/admin/integrations/_health                    # SuperAdmin: registry vs code drift report

GET  /api/admin/integrations/people                     # SuperAdmin: list sourced people (filter by status)
GET  /api/admin/integrations/people/:id                 # SuperAdmin: one row + identifiers + sources + log + candidates
POST /api/admin/integrations/people/:id/merge           # SuperAdmin: merge into user
POST /api/admin/integrations/people/:id/reject-merge    # SuperAdmin: reject all candidates
POST /api/admin/integrations/people/:id/unmerge         # SuperAdmin: undo merge
POST /api/admin/integrations/reconcile/run              # SuperAdmin: bulk scan
POST /api/admin/integrations/reconcile/scan-user/:id    # SuperAdmin: scan one user

POST /api/data-subject-requests                         # Public: submit DSR
GET  /api/data-subject-requests/verify?token=...        # Public: magic-link verify
GET  /api/admin/data-subject-requests                   # SuperAdmin: list DSRs
POST /api/admin/data-subject-requests/:id/process       # SuperAdmin: execute
POST /api/admin/data-subject-requests/:id/reject        # SuperAdmin: reject

GET  /api/admin/suppression-list                        # SuperAdmin: list
POST /api/admin/suppression-list                        # SuperAdmin: add
DELETE /api/admin/suppression-list/:id                  # SuperAdmin: remove
```

---

## 8. Success metrics

- **Cache hit rate** ≥ 70 % steady state (target 70-85 %). Surfaced per provider on the Providers tab and aggregate in Recent Runs.
- **$ / unique person sourced** trends down month-over-month as cache fills.
- **DSR median time-to-process** ≤ statutory window (30 days EU/UK, 45 days CA). Surfaced in DSR tab.
- **Reconciliation precision** — % of admin-approved merges (not later unmerged). Track via `sourced_person_merge_log` (`merged` count vs `unmerged` count).
- **Creator integrations submitted vs approved** — pipeline health for the marketplace surface.
- **Provider error rate per integration** < 5 % (7-day rolling). Surfaced on each provider card.

---

## 9. Open items & follow-ups

- **DSR verification email worker** — the `verifying_identity` status is set, but the actual email send is delegated to "the existing follow-up email worker" (per route comment). Confirm that worker dispatches on this status, or build a dedicated sender.
- **Creator earnings model** — creator integrations can be enabled and called, but there is no revenue-share flow on `cost_per_call_cents` for creator-owned providers. Wire into the existing token/credit ledger before opening to creators publicly.
- **DSR access/portability export format** — current implementation reports a count + summary; a structured JSON / CSV export bundle still needs a producer.
- **Auto-flag on signup** — `findPersonCandidatesForUser` exists but the signup-hook caller is not yet wired; today reconciliation only happens via the bulk pass. Hook into the user-create flow so day-zero matches don't require a cron tick.
- **Per-provider per-user rate limits** — currently only the credit balance gates user calls. Free-tier abuse on free providers (e.g. GitHub) is not prevented.
- **Bulk import jobs** — `bulkImport` capability exists on data-dump providers (Stack Overflow, Wikidata, Common Crawl) but the actual ingestion job runner that consumes their dumps is not part of this slice.
- **Pricing-model `freemium` semantics** — currently treated as `paid` for billing purposes. Decide whether free-tier calls on freemium providers should debit credits.
- **Naming collision** — `sourcing` is overloaded across two unrelated aggregates (this PRD's enrichment/sourcing layer vs the bidding marketplace `job_sourcing_listings`). Consider renaming one in docs / route prefixes to reduce confusion.
