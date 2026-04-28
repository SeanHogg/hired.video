# PRD — BurnRateOS Contacts & Sourcing

**Owner:** BurnRateOS Platform
**Status:** Spec — to be built in BurnRateOS. A reference implementation previously lived in hired.video and was **removed in migration `0054_drop_sourcing_tables.sql`** (code deleted in the same commit). When implementing in BurnRateOS, recover the reference code from git history at the commit immediately before 0054.
**Surfaces:**
- BurnRateOS UI: `/contacts` module (Providers · Lookup · Reconcile · DSR · Suppression · Consumers · Widgets)
- **Sourcing Widget**: drop-in `<script>` snippet for any host site. Wires up via `data-*` attributes; renders a "Sourcing Panel" with "Powered by BurnRateOS.com" attribution. Primary integration path for self-serve customers.
- External API: `api.burnrateos.com/v1/contacts/*` for power users (hired.video, deep integrations, bulk/cron, server-side reconciliation).

**Reference implementation (recover from git history — pre-`0054_drop_sourcing_tables.sql`):**
- Frontend: `frontend/pages/admin/IntegrationManagement.tsx`, `frontend/pages/admin/SourcingTool.tsx`
- API: `api/src/routes/integrations.ts`
- Domain: `api/src/services/sourcing/` (resolver, registry, providers/, hash, suppression, reconciliation, sourcingService, types)
- Schema (defining the dropped tables): [drizzle/0049_integrations_sourcing.sql](hired.video/api/drizzle/0049_integrations_sourcing.sql)
- Schema files (deleted): `api/src/db/schema/sourcedPeople.ts`, `api/src/db/schema/dataPrivacy.ts`

---

## 0. Strategic framing

Hired.video and BurnRateOS are sister products with deliberately separate moats:

- **Hired.video**: *"promote yourself, get hired."* Resume video, personal brand, promotion campaigns, basic ATS for small businesses. Primary buyer is the individual; secondary buyer is the recruiter.
- **BurnRateOS**: *"a 360 OS for running a business."* Every CxO function in one product. Primary buyer is the business operator (founder, ops lead, CxO).

Sourcing/contact-enrichment is a B2B ops purchase (sales, BD, recruiting, partnerships). It maps cleanly to BurnRateOS's "run your business" thesis and would dilute hired.video's individual-centric story. **BurnRateOS owns the sourcing product**; hired.video calls it via the server API. Most other consumers — small businesses adding a "find this contact" button to their CRM, ATS, or signup form — adopt via the **Sourcing Widget** (a `<script>` snippet + data attributes), with "Powered by BurnRateOS.com" attribution. The widget is the primary self-serve channel and the lever for distribution.

The moat for BurnRateOS becomes: the OS that includes the contact graph as a first-class module — a real wedge against the Notion/Linear/HubSpot stack. The moat for hired.video remains: the bridge between sourced contact ↔ resume-video user ↔ promotion campaign — uniquely defensible because each layer subsidizes the next, but the sourced-side data is fetched, not owned.

Building this in BurnRateOS also concentrates the GDPR/DSR ops burden in one place. Two of those is a compliance liability.

---

## 1. Background & problem

Sourcing teams (sales BD, recruiting, partnerships, founder-led outbound) need a single workspace for:

1. **Provider management** — one registry of every external data provider (paid APIs, free APIs, public dumps, marketplace integrations) with consistent enable/disable, credentials, telemetry, and cost accounting per tenant.
2. **A cache-first lookup layer** — stop re-paying for the same email/LinkedIn/GitHub lookup across users, sessions, and consumers.
3. **A creator marketplace** — third-party developers can ship integrations and earn from them, governed by a platform review queue.
4. **GDPR / CCPA compliance** — public DSR submission flow, admin processing tool, permanent suppression list, erasure-aware redaction model on the canonical contact table.
5. **Generalized reconciliation** — a service that, given an external identity (a hired.video user, a BurnRateOS CRM contact), returns candidate matches from the sourced-contact graph with confidence scores, so the consumer can merge on its own terms.
6. **External API distribution** — hired.video and other BurnRateOS tenants consume the same primitives via a stable, billed, rate-limited API.

The reference implementation in hired.video closes (1)–(5) for a single tenant with hired.video-specific reconciliation. This PRD extends that to multi-tenant + external API for production use in BurnRateOS.

---

## 2. Goals & non-goals

### Goals
- One BurnRateOS module — `/contacts` — for tenant admins to manage every provider, see per-tenant 7-day spend / error / cache-hit telemetry, rotate credentials.
- Cache-first sourcing: ≥ 70 % cache-hit rate steady-state. **Cache for system providers is global across tenants** (the data is the same; sharing the cache reduces marginal cost across the platform); cache for tenant-installed providers is tenant-scoped.
- A creator integration marketplace at the BurnRateOS level.
- Public DSR submission + admin processing — erasure must redact + suppress in one transaction, applied across every tenant that has touched the identifier.
- A generalized reconciliation API: given an external identity description (email + linkedin_url + github_login + name + company), return ranked sourced-contact candidates with confidence scores and matched identifiers. Consumers (hired.video, BurnRateOS-native CRM) decide how to act on the results.
- An external API surface with API-key auth, rate limits, usage-based billing, and webhook callbacks.

### Non-goals
- Building per-tenant UIs for hired.video, sales workflows, etc. Consumers integrate via API and render their own surfaces. Internal BurnRateOS modules (CRM, BD, Recruiting) are separate features built on top of this contacts service.
- Building a developer SDK runtime for creator integrations. Creators register metadata; concrete provider classes ship in BurnRateOS code and are loaded via the registry. A user-defined-runtime is out of scope for v1.
- Bulk-import job runners for data-dump providers (Stack Overflow, Wikidata, Common Crawl). Capability flag exists; the consumer is a separate workstream.
- Replacing hired.video's existing recruiter/job-seeker product surfaces. Hired.video remains the system of record for resume videos, user identities, and promotion campaigns.

---

## 3. Users & access

| Role | Can do |
|------|--------|
| **BurnRateOS platform admin** | Manage system integrations + their credentials, approve/reject creator submissions, process DSRs, edit global suppression list, manage external API consumers (issue keys, set rate limits, set billing tier). |
| **Tenant admin** (per-workspace) | Enable/disable providers for their tenant, install marketplace integrations, supply tenant-scoped credentials, view per-tenant telemetry, manage tenant credits / billing. |
| **Tenant user** | Run lookups (cache-first; charges tenant credit pool on paid-provider hits). Browse own tenant's sourced contacts. View per-user run history. |
| **External API consumer** (hired.video, third-party tenants) | Authenticate via API key. Issue lookups, reconciliation queries, register webhooks. Billed per call against the consumer's plan. |
| **Embedding host site** (Widget consumer) | Drops the BurnRateOS Sourcing Widget `<script>` into their page. Configures behaviour via `data-*` attributes. Authenticated via short-lived JWT minted by their backend (which holds the API key). End-user calls are billed against the host tenant. |
| **Public (no auth)** | Submit DSR via `POST /v1/dsr`. Always 202 + verification email. No data is touched until magic-link is clicked. |

Tenant isolation rules: provider configs, credentials, run history, credits, and tenant-installed integrations are tenant-scoped. The canonical `sourced_contacts` graph and `enrichment_cache` for system providers are platform-global (this is the cache-sharing benefit). The `data_suppression_list` and `data_subject_requests` are platform-global by definition.

---

## 4. Surfaces

### 4.1 BurnRateOS UI — `/contacts` module

Six tabs:

1. **Providers** — System integrations (platform-shipped, controlled by platform admin) and Marketplace integrations (creator-submitted, subject to review). Each renders as a card: display name, slug, category, capability chips, pricing badge, 7-day stats (total runs, cache hits, errors, spend $) **scoped to the current tenant**, credential status (resolved / not set), enable toggle, "Credentials" dialog (env-var name only — secrets live in the platform secrets manager). Toggle is disabled until `review_status === 'approved'`.
2. **Lookup** — Interactive cache-first resolver UI. Pick query kind (`email | linkedin_url | github_login | name_company | domain`), submit, see outcome + status badge (`cache_hit | cache_miss_resolved | not_found | suppressed | no_providers`), cost, duration, projected canonical fields. Suppressed and no-provider cases render explanatory copy with inline links to the relevant tab.
3. **Reconcile** — List view of `sourced_contacts` filtered by `merge_status`. "Run reconciliation pass" button triggers a bulk scan against the tenant's CRM contacts (BurnRateOS-internal use). Per-contact review pane shows canonical fields, identifiers, all source payloads, full audit log, candidate matches with confidence + Merge / Reject / Unmerge actions.
4. **Recent Runs** — Append-only log from `integration_runs`, scoped to the current tenant: timestamp, status, kind, cache hit, cost, duration, error message.
5. **Data Subject Requests** — DSR queue (platform-global; visible to platform admins, also visible to tenant admins for transparency on identifiers their tenant has touched). Process / Reject actions on each.
6. **Suppression List** — Global. Read + add + remove. Manual entries cover known opt-outs, hard bounces, spam complaints. Erasure DSRs add entries automatically.

Plus two platform-admin-only tabs:
7. **API Consumers** — Issue and rotate API keys, view per-consumer usage + spend, set rate limits, set billing tier, define webhook subscriptions.
8. **Widgets** — Per-tenant widget configuration: allowed origins (host site allowlist), default theme tokens, panel placement default, eligible providers for widget calls (subset of API-eligible), per-origin rate limits, widget-specific webhook subscriptions (`contact.found.via.widget`). Includes a snippet generator that emits the `<script>` tag preconfigured for the tenant.

### 4.2 Sourcing Widget (drop-in JS snippet)

The widget is a single hosted JS bundle that any host site embeds with one `<script>` tag and configures via HTML `data-*` attributes — no SDK install, no build-step integration. Modeled after Stripe Elements / Intercom Messenger / Algolia InstantSearch in shape.

**Embedding shape (host site HTML):**
```html
<script
  src="https://cdn.burnrateos.com/widget/v1/sourcing.js"
  data-burnrateos-tenant="acme_inc"
  data-burnrateos-token-endpoint="/api/burnrateos-token"
  async></script>

<form id="new-contact-form">
  <input id="emailInput" type="email" name="email">
  <input id="nameInput" type="text" name="name">
  <button
    type="submit"
    data-burnrateos-sourcing
    data-burnrateos-event="save"
    data-burnrateos-query-kind="email"
    data-burnrateos-query-source="#emailInput"
    data-burnrateos-on-found="window.handleSourcedContact"
    data-burnrateos-skin="primary"
    data-burnrateos-panel="drawer">
    Save
  </button>
</form>
```

**Flow:**
1. Page loads, widget script auto-discovers any element with `data-burnrateos-sourcing`, attaches handlers per its `data-*` config, fetches a short-lived JWT from `data-burnrateos-token-endpoint`.
2. End user fills the form, clicks Save. The widget intercepts the configured event (`click`, `submit`, `save`, `blur`, or a custom event name), reads the source field(s), opens the Sourcing Panel.
3. Panel renders inline / drawer / modal (per `data-burnrateos-panel`), shows the lookup state, displays canonical fields on hit, "no result / suppressed / out of credits" messaging on miss. "Powered by BurnRateOS.com" footer is non-removable.
4. On confirm, panel closes and fires a DOM event (`burnrateos:contact-found`) on the originating element AND calls the named global function (per `data-burnrateos-on-found`) with `{ contactId, canonical, status }`. Host site does whatever it wants with the contactId (typically: store as `burnrateos_contact_id` foreign reference on its own record).
5. The original event (form submit) is then released so the host site's normal save flow proceeds.

**Configurable via dashboard (per tenant)** — see §4.1 tab 7 (Widgets):
- Allowed origins (host site allowlist; widget refuses to load on unlisted origins)
- Theme tokens (primary colour, font, border radius) — overrideable per embed via `data-burnrateos-skin="..."` keyword OR `data-burnrateos-theme='{"primary":"#ff0"}'`
- Default panel placement (drawer / modal / inline)
- Which providers are eligible for widget calls (can be a strict subset of API-eligible providers — e.g. exclude expensive providers from no-cost-control widget contexts)
- Rate limits per origin
- Webhook fan-out for `contact.found.via.widget` events (server-to-server, separate from the DOM callback)

**JS API for programmatic use** (alongside / instead of `data-*`):
```js
window.BurnRateOS.sourcing.lookup({ kind: 'email', value: 'jane@acme.com' })
  .then(({ contactId, canonical, status }) => { ... });

window.BurnRateOS.sourcing.openPanel({
  defaultKind: 'email',
  prefill: { value: 'jane@acme.com' },
  onFound: (result) => { ... },
  onCancel: () => { ... },
});
```

### 4.3 External API surface (`api.burnrateos.com/v1/contacts/*`)

Used by hired.video and any future power-user consumer that wants direct server access (bulk lookups, cron-driven reconciliation passes, custom UIs that don't fit the widget panel).

**Auth:** API key in `Authorization: Bearer <key>` header. Each key is bound to a consumer record with its own rate-limit policy and billing tier.

**Endpoints (key set):**
```
POST   /v1/contacts/lookup                    # Cache-first lookup; charges consumer per resolved call
POST   /v1/contacts/reconcile                 # Given an identity description, return candidate matches
GET    /v1/contacts/:id                       # Read a sourced contact + identifiers + sources
POST   /v1/contacts/:id/refresh               # Force a re-fetch (bypass cache); charges per call
POST   /v1/dsr                                # Public DSR submission (no auth)
GET    /v1/dsr/verify?token=...               # Public DSR magic-link verification
GET    /v1/suppression/check?type=...&value=  # Authenticated: check whether identifier is suppressed
POST   /v1/webhooks                           # Register webhook endpoint + event subscriptions
```

**Webhook events:**
- `contact.created` — A new contact has been added to the platform graph.
- `contact.updated` — Canonical fields changed (e.g. job change detected on refresh).
- `contact.merged` — A platform-global signal (rare) that two `sourced_contacts` rows were collapsed.
- `contact.redacted` — DSR erasure removed an identifier; consumer must purge any caches keyed on it.
- `suppression.added` — A new entry on the suppression list; consumer must stop processing this identifier.

The `contact.redacted` and `suppression.added` events are **mandatory consumer obligations** — by accepting an API key the consumer agrees to honour them within 24 hours. Documented in the API ToS.

---

## 5. Functional requirements

### 5.1 Provider registry
- Single `integrations` table is the source of truth. `kind ∈ {system, creator}` differentiates origin.
- `capabilities` is a flat boolean map (`enrichByEmail`, `enrichByLinkedIn`, `enrichByName`, `enrichByHandle`, `emailFinder`, `bulkImport`, `sourcingScrape`). The resolver routes by capability, not by hard-coded slug lists.
- `pricing_model ∈ {free, paid, freemium}`; `cost_per_call_cents` drives both the resolver's cheapest-capable-provider sort and per-tenant spend telemetry.
- `enabled` defaults `FALSE` so a freshly added paid provider cannot accidentally consume credits.
- `review_status ∈ {approved, pending, rejected}`. System integrations seed `approved`; creator submissions start `pending`. Resolver only consults `enabled = TRUE AND review_status = 'approved'` rows.
- **Tenant overlay**: `tenant_integration_settings(tenant_id, integration_id, enabled, credential_ref)` lets a tenant opt in/out of platform-enabled providers and supply tenant-scoped credentials. Lookup resolution: a provider is eligible for a tenant iff (platform-enabled AND tenant has not opted out) OR (tenant has explicitly opted in with own creds).
- **Seed providers** (lift from hired.video git history at pre-`0054_drop_sourcing_tables.sql`): People Data Labs, Apollo.io, Proxycurl, Hunter.io, GitHub, Stack Overflow Data Dump, Wikidata, Common Crawl, OpenCorporates. Concrete provider classes lived in `services/sourcing/providers/` and were registered in `registry.ts`.

### 5.2 Credentials
- Stored in `integration_credentials`, **never by value** — only the env-var name (e.g. `PDL_API_KEY`). Actual secrets live in the platform secrets manager and are looked up at call time. The registry row is safe to render in the admin UI.
- Tenant-supplied credentials live in `tenant_integration_credentials(tenant_id, integration_id, env_var_name)` — same env-var-pointer model, but the env-var lookup falls back to a tenant-namespaced secrets vault if defined.
- Credential dialog reports whether the env-var currently resolves to a non-empty value (`credentialsResolved` boolean), surfaced as ✓ / ✗ on the provider card.
- Optional `extra` JSONB map for secondary credentials (e.g. account ID), each pointing at its own env-var.

### 5.3 Cache-first resolver

Lookup order on every call (preserved verbatim from reference; algorithm does not change):

1. **Suppression check** — `isQuerySuppressed` against `data_suppression_list` (platform-global). Hit → return `suppressed`, never spend, never persist, audit-record only.
2. **Cache lookup** — `enrichment_cache` keyed by `(query_key = SHA-256(canonical), integration_id)`, TTL-aware (default 90 d, provider can override via `staleAt`). Hit → increment `hits`, set `last_hit_at`, return `cache_hit` with reconstructed canonical fields from `sourced_contacts`. **Cache for system providers is global; cache for tenant-installed providers is tenant-scoped via `tenant_id` column.**
3. **Provider chain** — `pickProviderRow` filters eligible providers by capability for the query kind, sorts by `cost_per_call_cents` ascending. Free providers (cost 0) sort first. For each candidate: load credentials (tenant override → platform fallback), call `provider.enrich`, on success → upsert `sourced_contacts` (matching by `email_hash | linkedin_url | github_login`), upsert `contact_identifiers`, write to `enrichment_cache` + `contact_sources` (provenance), record success run, return `cache_miss_resolved`. On `not_found` → cache the negative result for 1 day to avoid re-spending. On error → record error run, fail over to next provider.
4. If no provider produced a hit → `not_found`. If no providers were eligible at all → `no_providers`.

Every step logs to `integration_runs` (tenant_id, consumer_id, integration_id, kind, status, cost, cache_hit, duration_ms, error_message). Drives the Recent Runs tab, per-card 7-day stats, and per-consumer billing.

### 5.4 Contact (person) model
- `sourced_contacts` is the canonical merged identity, **platform-global**. (Renamed from `sourced_people` to avoid collision with hired.video's `users` semantics.) Distinct from any tenant CRM contact table.
- `contact_identifiers` is the unique-keyed lookup index across `email | email_hash | linkedin_url | github_login | twitter_handle | phone_e164`. Unique constraint `(identifier_type, identifier_value)` collapses cross-provider duplicates.
- `contact_sources` is per-provider provenance — every payload from every provider, never overwritten, with `stale_at` for TTL.
- `is_redacted` is a soft-delete flag set by erasure DSRs. Redacted rows survive (audit trail intact) but identifying fields are nulled, identifiers/sources/cache rows are deleted, and the identifier is added to suppression so it cannot be re-imported.
- **Per-tenant ownership**: `tenant_contact_links(tenant_id, contact_id, first_seen_at, last_used_at, custom_attrs JSONB)` records which tenants have interacted with which contacts, without partitioning the canonical graph. Enables per-tenant views, "my saved contacts" lists, and per-tenant custom fields without duplicating contact data.
- **External consumers never store contact data — only the contact UUID + their own state.** Hired.video, third-party tenants, and any other API consumer hold a foreign reference (`burnrateos_contact_id UUID`) plus consumer-side state (link to consumer's own user/CRM record, merge status, audit log of consumer decisions). Canonical fields (name, email, linkedin_url, title, company, identifiers, source payloads, redaction state) are fetched lazily from BurnRateOS at read time. This makes BurnRateOS the unambiguous system of record for contact data, keeps GDPR erasure simple (one-place delete + webhook fan-out), and prevents the multi-master drift you'd get if every consumer kept its own copy.

### 5.5 Generalized reconciliation

**Reference implementation context**: hired.video's tool merged `sourced_people` rows into platform `users` (resume-video account holders). That use case is now one consumer of a generalized API.

**Generalized model**: BurnRateOS exposes `POST /v1/contacts/reconcile` which accepts an *external identity description* and returns ranked candidates from the contact graph.

```
POST /v1/contacts/reconcile
{
  "external_identity": {
    "email": "jane@acme.com",          // optional
    "linkedin_url": "...",              // optional
    "github_login": "...",              // optional
    "name": "Jane Doe",                 // optional, only used as tiebreak
    "company": "Acme"                   // optional, only used as tiebreak
  },
  "min_confidence": 50                  // default 50
}
→
{
  "candidates": [
    {
      "contact_id": "uuid",
      "confidence": 100,                  // 0..100
      "matched_identifiers": [
        { "type": "email", "value": "jane@acme.com" },
        { "type": "linkedin_url", "value": "..." }
      ],
      "contact": { /* canonical fields */ }
    }
  ]
}
```

Match signals (priority): email +60, LinkedIn URL +50, GitHub handle +40. Sum capped at 100. Surfacing threshold: ≥ 50. **No auto-merge** — the consumer decides what to do with the candidates. (False-positive cost is asymmetric; consumer makes the call in its own product context.)

**Two consumer use cases:**
- **Hired.video**: receives a sourced contact via lookup, reconciles against its own `users` table to close the "this sourced contact is now a real user" loop. The merge action, `linked_user_id` tracking, and merge audit log live entirely on hired.video's side. Hired.video stores **only** the BurnRateOS contact UUID + its own merge state; it does not duplicate name/email/identifiers locally.
- **BurnRateOS-internal CRM**: tenant CRM module reconciles its own contacts against the sourced graph to enrich them. Merge action and tenant-CRM linking live in the CRM module. CRM rows store the BurnRateOS contact UUID as a foreign reference; canonical fields are fetched lazily.

**Two consumer-side patterns:**

1. **Minimal ref pattern** — `(burnrateos_contact_id, linked_target_id, merge_status)`. Suitable for backend-only consumers (cron reconcilers, audit pipelines, internal reporting). All canonical fields fetched at read time via `/v1/contacts/batch` or `/v1/contacts/:id`.
2. **Snapshot + ref pattern** — adds a frozen-at-claim-time copy of display-relevant fields. Suitable for end-user-facing surfaces that must render under partial outage and avoid N-API-calls-per-pageload. See **§5.10** for the canonical hired.video recruiter-pipeline implementation with full schema.

**Render-time enrichment for non-snapshot paths**: ad-hoc list views fetch canonical fields via `POST /v1/contacts/batch`; detail views fetch single. Optional ≤ 5 min request-coalescing cache; no long-term denormalization. Snapshot patterns are the deliberate exception — they persist a bounded subset for the lifetime of the consumer-side record under the GDPR rules in §5.10.

**BurnRateOS itself does not need to track consumer merge/link state** — that's consumer responsibility. But it provides convenience storage: `external_identity_links(consumer_id, external_id, contact_id, confidence, matched_identifiers, status, decided_at, decided_by)` — a queue/audit table the consumer can opt into via the API for cases where the consumer would rather BurnRateOS hold the audit trail. Hired.video uses its own local schema (§5.10) and does not opt into this.

The bulk reconciliation pass becomes a **per-consumer scheduled job**: each registered consumer can ask BurnRateOS to scan the contact graph against a list of external identities at a configured cadence. Results are delivered via `contact.matched` webhook events.

### 5.6 Billing

Two tiers:

**Tenant credits (BurnRateOS-native users):**
- `tenant_enrichment_credits(tenant_id, balance, total_consumed)`.
- Tenant lookup gate: balance ≥ 1 required before paid-provider work runs. Cache hits and free-provider hits do not debit. Successful paid call debits one credit, writes `enrichment_transactions` row referencing the cache row id.
- 402 `INSUFFICIENT_CREDITS` returned when balance is 0; UI prompts purchase. (Credit purchase flow lives in the BurnRateOS billing module.)

**External API consumer billing:**
- `api_consumers(id, name, owner_tenant_id, plan_id, rate_limit_per_minute, created_at)`.
- `api_consumer_usage(consumer_id, period_start, lookups_count, paid_lookups_count, reconcile_count, spend_cents)` — rolled up nightly from `integration_runs`.
- Plans: pay-as-you-go (per-call markup over provider cost), volume tiers, enterprise flat rates. Plan engine lives in BurnRateOS billing.
- Hard rate limits enforced at the edge per consumer.

The platform takes a margin on every paid-provider call routed through the cache layer (the cache is the value-add — consumer pays N for a lookup, platform paid 0 because cache hit). Margin model is plan-dependent.

### 5.7 GDPR / DSR

- **Public submission**: `POST /v1/dsr` accepts `request_type ∈ {access, erasure, rectification, portability, objection, opt_out}`, subject email, optional secondary identifiers, jurisdiction, free-text notes. Returns 202 with verification token; subject must click magic-link to advance from `verifying_identity` → `pending`.
- **Admin processing** branches on `request_type`:
  - `erasure` — find every `sourced_contacts` row with matching `primary_email_hash`, redact in place (`is_redacted = true`, fields nulled), delete `contact_sources` + `contact_identifiers` + `enrichment_cache` rows for that contact, add the email + every secondary identifier to `data_suppression_list` with `reason = 'erasure_request'`. **Fan out `contact.redacted` and `suppression.added` webhooks to every API consumer that has touched the identifier.** Consumer obligation on `contact.redacted` (within 24h SLA): mark their local `sourced_contact_refs.is_redacted_upstream = TRUE`, wipe any short-TTL request-coalescing cache, and null out any locally-snapshotted personal data in their merge audit log (`matched_identifiers`). The fact-of-merge (timestamp, admin, action) is non-personal and may be retained.
  - `access | portability` — count matches across the platform graph, surface for manual export + email-out. Include consumer-attribution data ("contact appeared via lookups initiated by Consumer X").
  - `opt_out | objection` — add email to suppression with `reason = 'user_opt_out'`. Fan out webhook.
  - `rectification` — manual; admin applies edits, then marks complete.
- **Suppression list** unique on `(identifier_type, identifier_value)`, with `identifier_hash` for emails so the index doesn't expose raw addresses. `isQuerySuppressed` is consulted on every resolve and ingestion. Suppressed lookups never spend, never persist, never return data — only an audit row + 200 with `status: "suppressed"`.

### 5.8 Creator marketplace
- `POST /v1/marketplace/integrations` — kebab-case slug 3-64 chars, display name, category, pricing, capabilities (booleans), description ≥ 20 chars, optional homepage / docs URLs.
- Inserted with `kind = 'creator'`, `enabled = false`, `review_status = 'pending'`, `owner_user_id = userId`.
- Creator can `PATCH` while `pending | rejected`; patch resets to `pending`. `approved` rows are immutable from the creator side; require resubmission as a new slug version.
- Platform admin reviews via Approve / Reject. Rejection requires a free-text reason stored on the row.
- **v2 (out of scope here):** revenue share — creator earns a configurable % of `cost_per_call_cents` for every successful call routed through their integration. Wire into the platform billing ledger.

### 5.9 Widget integration model

**Auth pattern (browser-safe):**
- The host site backend holds the long-lived API key (never exposed to the browser).
- Browser hits `data-burnrateos-token-endpoint` (a host-site endpoint the developer implements), which calls `POST /v1/widget/token` server-side with the API key. BurnRateOS returns a short-lived JWT (default 15 min) bound to: tenant_id, allowed origin (validated against the registered allowlist), end-user identifier (opaque host-side string for rate-limit + audit attribution), permitted query kinds.
- Widget script attaches the JWT to all `/v1/widget/*` calls. Server validates origin from the `Origin` header AND from the JWT claim — both must match.
- JWT is renewed silently in the background before expiry.

**Configurable behaviour (data-attribute schema):**

| Attribute | Purpose | Values / example |
|-----------|---------|------------------|
| `data-burnrateos-sourcing` | Marks element as a widget trigger (presence-only). | `<button data-burnrateos-sourcing>` |
| `data-burnrateos-event` | DOM event that fires the panel. | `click` (default), `submit`, `save`, `blur`, `change`, `custom:<name>` |
| `data-burnrateos-query-kind` | Lookup type. | `email`, `linkedin_url`, `github_login`, `name_company`, `domain` |
| `data-burnrateos-query-source` | CSS selector(s) for input field(s). For `name_company`, use comma-separated `#name,#company`. | `#emailInput` |
| `data-burnrateos-prefill` | Inline value; bypasses query-source. | `jane@acme.com` |
| `data-burnrateos-on-found` | Window-scoped function name to call with result. | `window.handleSourcedContact` |
| `data-burnrateos-on-cancel` | Window-scoped function name on panel dismissal. | `window.onSourcingCancel` |
| `data-burnrateos-skin` | Built-in style preset for the trigger element + panel. | `primary`, `outline`, `ghost`, `minimal` |
| `data-burnrateos-theme` | Inline JSON theme overrides. | `{"primary":"#ff0","radius":"4px"}` |
| `data-burnrateos-panel` | Panel placement. | `drawer` (default), `modal`, `inline` |
| `data-burnrateos-suppress-default-event` | If `"true"`, the original event (e.g. form submit) is NOT released after panel completes; host site handles it manually via the callback. | `true` / `false` |

**The "save" trigger pattern (most common use case):**
- Host site has a form (new contact, new lead, signup, candidate intake).
- Trigger button is `<button type="submit" data-burnrateos-sourcing data-burnrateos-event="save">`.
- Widget intercepts the submit, opens the Sourcing Panel with the form's email/name prefilled, runs the lookup, returns the canonical contact + UUID via callback.
- Host site's normal form-save flow then runs with enriched data attached (typically writing the BurnRateOS contact UUID into a foreign-reference column on the host-side record).
- This single pattern lets a small business "add Apollo to their signup form" with three lines of HTML.

**Provider eligibility for widgets:**
- Widget calls go through the same resolver, but a tenant may restrict the widget-eligible provider set in the dashboard (separate from the API-eligible set). Default: same as API. Use case: cap widget contexts to free + cheap providers to control end-user-driven spend.

**"Powered by BurnRateOS.com" attribution:**
- Non-removable footer on every panel rendering. Click takes the user to a marketing page. This is the distribution flywheel — every widget impression is brand exposure on the host's audience.
- Tenants on a paid plan can request "Powered by" removal as a plan add-on (decision deferred to billing); free / starter plans cannot.

**End-user privacy & audit:**
- The widget passes an opaque host-side end-user identifier (set in the JWT claim) so rate limits + audit logs attribute calls correctly without BurnRateOS learning identifying info about end users.
- Widget calls record `consumer_kind = 'widget'` and `widget_origin = '<host>'` on `integration_runs` for separable telemetry.

**Failure modes the widget must handle in-panel:**
- `suppressed` → "This contact has opted out and cannot be looked up."
- `no_providers` → "Sourcing temporarily unavailable. Try again later." (Don't expose tenant config errors to end users.)
- `not_found` → "No matching contact found." with option to save form anyway.
- `INSUFFICIENT_CREDITS` (tenant credit pool empty) → silent fail to host (still releases the original event so the form saves), plus a tenant admin alert via webhook.
- Network / 5xx → silent fail to host (release event), retry once with backoff.

### 5.10 Consumer integration pattern: hired.video recruiter pipeline (canonical example)

The hired.video recruiter use case is the canonical "snapshot + reference" consumer pattern. It illustrates how rich, end-user-facing surfaces should integrate with BurnRateOS — distinct from the minimal ref pattern in §5.5.

**Recruiter flow:**
1. Recruiter opens the Sourcing surface in hired.video → backend calls BurnRateOS `/v1/contacts/lookup` (charged against hired.video's tenant credit pool).
2. Results render with canonical fields. Recruiter selects N contacts, clicks **"Add to pipeline"**.
3. At pipeline-add time, hired.video copies a *display-relevant subset* of canonical fields into a local `candidate_pipeline_entries` row alongside the BurnRateOS UUID. This is the moment the recruiter "claimed" the contact; the snapshot is the recruiter's audit-quality record of what they decided based on. The "claim" event also establishes a legitimate-interest basis (GDPR Art. 6(1)(f)) for hired.video to retain the snapshot independent of BurnRateOS's contact lifecycle.
4. Pipeline operates on hired.video's own data — recruiter notes, stages, ratings, communication history. The pipeline renders even when BurnRateOS is unavailable.
5. **"Refresh from source"** on each entry re-calls BurnRateOS to update the snapshot. Explicit, not automatic; surfaces the refresh cost to the recruiter inline.
6. **Reconciliation upgrade**: when the contact later signs up to hired.video, BurnRateOS fires `contact.matched`; hired.video sets `linked_user_id` on every matching pipeline entry. UI then surfaces the user's resume + video automatically.

**Hired.video local schema (the snapshot + reference table):**
```sql
CREATE TABLE candidate_pipeline_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES recruiter_pipelines(id),
  stage VARCHAR(32) NOT NULL,

  -- Identity layer
  burnrateos_contact_id UUID NOT NULL,                -- BurnRateOS source of truth
  linked_user_id UUID REFERENCES users(id),           -- set on reconciliation upgrade

  -- Snapshot at add-time (display-relevant subset only)
  snapshot_full_name VARCHAR(255),
  snapshot_title VARCHAR(255),
  snapshot_company VARCHAR(255),
  snapshot_location VARCHAR(255),
  snapshot_email_masked VARCHAR(320),                 -- jane@****.com — full reveal triggers re-fetch + audit
  snapshot_linkedin_url VARCHAR(512),
  snapshot_taken_at TIMESTAMPTZ NOT NULL,
  snapshot_refreshed_at TIMESTAMPTZ,
  snapshot_is_redacted_upstream BOOLEAN NOT NULL DEFAULT FALSE,
  snapshot_redacted_at TIMESTAMPTZ,

  -- Resume status (resumes themselves live in hired.video's existing resumes table)
  resume_status VARCHAR(20) NOT NULL DEFAULT 'none',
  -- 'none' | 'requested' | 'recruiter_uploaded' | 'user_submitted'
  resume_id UUID REFERENCES resumes(id),
  resume_requested_at TIMESTAMPTZ,

  -- Pipeline metadata (recruiter's IP — survives upstream redaction)
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  added_by UUID NOT NULL REFERENCES users(id),
  notes TEXT,
  rating INTEGER,
  tags TEXT[],

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX cpe_burnrateos_contact_idx ON candidate_pipeline_entries(burnrateos_contact_id);
CREATE INDEX cpe_linked_user_idx ON candidate_pipeline_entries(linked_user_id);
CREATE INDEX cpe_pipeline_stage_idx ON candidate_pipeline_entries(pipeline_id, stage);
```

**Snapshot subset rationale:**
- IN: name, title, company, location, masked email, linkedin URL — exactly what the pipeline UI renders.
- OUT: provenance (`person_sources` raw payloads), identifiers list, hashes, full enrichment cache — that infrastructure stays at BurnRateOS.

**Pipeline UI columns:**

| Column | Source |
|--------|--------|
| Name | Snapshot (`snapshot_full_name`); falls back to "[Redacted by upstream]" if `snapshot_is_redacted_upstream` |
| Title @ Company | Snapshot, with "as of {snapshot_refreshed_at ?? snapshot_taken_at}" tooltip + Refresh action |
| Email / LinkedIn | Snapshot (masked); Reveal action triggers re-fetch + audit log |
| Resume | Status badge: 🚫 None / 📤 Requested / 📎 Recruiter PDF / ✅ User-submitted |
| Stage | Local |
| Notes / rating / tags | Local — recruiter IP, survives all upstream events |
| Video embed | Only if `linked_user_id IS NOT NULL` and the user has a resume video |

**Resume workflow** (resumes live in hired.video's existing `resumes` table — pipeline entries reference them):
1. **Recruiter requests** — outreach email with a hired.video signup link prefilled with the contact's email. If they sign up + complete a resume → reconciliation links them to the pipeline entry, `resume_status = 'user_submitted'`.
2. **Recruiter uploads** — drag in a PDF obtained elsewhere (LinkedIn export, candidate website). Stored as a `resumes` row tagged `recruiter_uploaded`. Pipeline shows it; replaceable when the user later submits their own.
3. **Reconciliation auto-link** — contact signs up independently with a resume + video; BurnRateOS fires `contact.matched`; hired.video links existing pipeline entries to the user automatically.

For v1, recruiter-uploaded PDFs are flat attachments with basic metadata. Parsing into hired.video's structured resume format is a separate workstream.

**Auto-linking policy (deviates from the §5.5 "no auto-merge" rule, justifiably):**
- When `contact.matched` arrives with confidence ≥ 60 (one strong identifier match — typically email), hired.video auto-sets `linked_user_id` on matching pipeline entries.
- Safe because hired.video is NOT writing data onto the user's profile (the §5.5 concern). It's only attaching a reference from the recruiter's pipeline to the user. Wrong link → recruiter sees a mismatched profile, manually unlinks.
- Confidence < 60 → flag for recruiter review (lightweight confirmation UI scoped down from the legacy merge tool).

**GDPR snapshot handling on `contact.redacted` webhook from BurnRateOS:**
- Set `snapshot_is_redacted_upstream = TRUE`, `snapshot_redacted_at = NOW()`.
- Null out `snapshot_full_name | _title | _company | _location | _email_masked | _linkedin_url`.
- Pipeline entry survives — `pipeline_id`, `stage`, `notes`, `rating`, `tags`, recruiter-uploaded resume are recruiter's IP and remain.
- UI renders the row as "[Contact redacted by upstream]" with recruiter's notes still visible.
- Recruiter is notified via in-app notification.

**Why a snapshot, not just the §5.5 minimal UUID-only ref:**
- Pipeline must render under partial BurnRateOS outage / network issues — recruiter workflow can't depend on every page load hitting the external API.
- The snapshot is a contract date — "this is what we knew when we decided to claim this contact."
- Cost: avoids N API calls per pipeline page render (potentially 100s of contacts in view).
- "Refresh from source" is an explicit recruiter action with implied cost confirmation, not implicit.

**Why a snapshot, not a full copy:**
- Display fields only — provenance, identifiers, full cache live at BurnRateOS.
- GDPR surface area is bounded and structured (one redaction handler, one webhook, one nullable column-set).
- Source of truth stays unambiguous.

**Hired.video schema retained from the legacy implementation:**
- `integrations` — kept as a generic external-systems registry. Seeded with one row: `(slug='burnrateos', kind='system', category='contacts')`. Future integrations (Slack, Stripe, calendar) slot in cleanly under the same registry.
- `integration_credentials` — env-var pointer pattern preserved; one credential row referencing the BurnRateOS API key env-var.
- `integration_runs` — captures every BurnRateOS lookup call for audit + cost attribution. Reusable for any future external API integration.

**Hired.video schema dropped (responsibility moves to BurnRateOS):**
- `sourced_people`, `person_identifiers`, `person_sources`, `enrichment_cache`, `sourced_person_merge_log`
- `data_subject_requests`, `data_suppression_list`

**Hired.video schema RETAINED despite original PRD intent — `enrichment_credits` + `enrichment_transactions`:**
- These tables were originally introduced for sourcing (gap #96) but are also referenced by [routes/advertising.ts](hired.video/api/src/routes/advertising.ts) and [repositories/invoicesRepository.ts](hired.video/api/src/repositories/invoicesRepository.ts) for the user-facing credit-purchase flow under advertising/billing.
- Dropping them would break advertising. They stay until that surface area is decoupled or also migrated.
- After sourcing removal, the credits become "purchasable but unspendable" until the BurnRateOS client lands and re-introduces a spend path. Acceptable holding state; document for the billing team.

---

## 6. Multi-tenancy

- Most tables gain a `tenant_id UUID` column. Where a row is platform-global (canonical contacts, system integrations, suppression list, DSR queue), `tenant_id IS NULL`.
- Composite indexes: every tenant-scoped table indexes `(tenant_id, ...)` first.
- RLS policies (PostgreSQL Row-Level Security) enforce tenant isolation at the DB level; application layer does not need to remember.
- Platform-admin role bypasses RLS for the platform-admin UI surfaces.
- API consumer requests carry an implicit `tenant_id = consumer.owner_tenant_id` for tenant-scoped writes (e.g. tenant_contact_links).

---

## 7. Data model

| Table | Scope | Purpose |
|-------|-------|---------|
| `integrations` | global | Registry of every system + creator provider. |
| `integration_credentials` | global | Env-var-name pointer per system integration. Never stores secrets. |
| `tenant_integration_settings` | tenant | Tenant opt-in/out + override flags per provider. |
| `tenant_integration_credentials` | tenant | Tenant-scoped credentials (env-var pointer). |
| `integration_runs` | global w/ `tenant_id` + `consumer_id` cols | Append-only run telemetry. |
| `sourced_contacts` | global | Canonical merged contact identity. Soft-deletable via `is_redacted`. |
| `contact_identifiers` | global | Unique-keyed lookup index (`type`, `value`) → contact. |
| `contact_sources` | global | Per-provider raw payload + TTL (provenance / audit). |
| `tenant_contact_links` | tenant | Per-tenant interaction log + custom attrs over canonical contacts. |
| `enrichment_cache` | mostly global; tenant-scoped for tenant providers | Cache-first storage, keyed `(query_key, integration_id)`, TTL-aware. |
| `external_identity_links` | per-consumer (opt-in storage in BurnRateOS) | Reconciliation queue/audit for consumers that prefer BurnRateOS to hold the trail rather than running their own. |
| **Consumer-side: minimal ref pattern** | lives in each consumer | At minimum: `(burnrateos_contact_id, linked_target_id, merge_status)`. No canonical data — fetched at read time via `/v1/contacts/batch`. For backend-only consumers. |
| **Consumer-side: snapshot + ref pattern** | lives in each consumer | Adds frozen-at-claim-time copy of display-relevant fields. Canonical hired.video example: `candidate_pipeline_entries` (§5.10) — pipeline_id, stage, snapshot_*, resume refs, recruiter notes. |
| **Hired.video keeps `integrations` + `integration_credentials` + `integration_runs`** | hired.video local | Repurposed as a generic external-systems registry. Seeded with one row for BurnRateOS; reusable for future integrations (Slack, Stripe, calendar). The contact-data tables (`sourced_people` etc.) are dropped. |
| `data_subject_requests` | global | DSR queue with magic-link verification + processing audit. |
| `data_suppression_list` | global | Identifiers that must never be re-sourced. |
| `tenant_enrichment_credits` / `enrichment_transactions` | tenant | Tenant credit balance + ledger. |
| `api_consumers` | global | External API consumer registry (keys, plans, rate limits). |
| `api_consumer_usage` | per-consumer | Rolled-up usage for billing. |
| `widget_configs` | tenant | Per-tenant widget settings: theme defaults, default panel placement, eligible-provider subset, attribution-removal flag. |
| `widget_origins` | tenant | Per-tenant allowlist of host-site origins permitted to mint widget JWTs. |
| `widget_token_grants` | tenant | Append-only audit of widget JWT issuance (origin, end-user opaque id, expiry). |

---

## 8. API surface

### Internal (BurnRateOS app, tenant-scoped via session)
```
POST /api/contacts/lookup                              # Tenant user, credit-gated
GET  /api/integrations/providers                       # Tenant view of enabled providers

POST /api/marketplace/integrations                     # Creator: submit
GET  /api/marketplace/integrations                     # Creator: list own
PATCH /api/marketplace/integrations/:id                # Creator: edit own (pending/rejected only)

GET  /api/admin/integrations                           # Tenant admin: list w/ stats + cred status
PATCH /api/admin/integrations/:id                      # Platform admin: partial update
POST /api/admin/integrations/:id/enable | /disable     # Tenant admin: toggle for tenant
PUT  /api/admin/integrations/:id/credentials           # Tenant admin: set env-var name
POST /api/admin/integrations/:id/review                # Platform admin: approve | reject creator
POST /api/admin/integrations/lookup                    # Tenant admin: lookup w/o credit gate
GET  /api/admin/integrations/runs                      # Tenant admin: recent runs (tenant-scoped)
GET  /api/admin/integrations/_health                   # Platform admin: registry vs code drift

GET  /api/admin/contacts                               # Tenant admin: tenant-linked contacts
GET  /api/admin/contacts/:id                           # Read full detail
POST /api/admin/contacts/:id/merge                     # Tenant admin (CRM): merge into tenant CRM contact
POST /api/admin/contacts/:id/reject-merge
POST /api/admin/contacts/:id/unmerge
POST /api/admin/contacts/reconcile/run                 # Bulk pass against tenant CRM
POST /api/admin/contacts/reconcile/scan-external/:id   # Scan one external id

POST /api/dsr                                          # Public: submit DSR
GET  /api/dsr/verify?token=...                         # Public: magic-link verify
GET  /api/admin/dsr                                    # Platform admin: list DSRs
POST /api/admin/dsr/:id/process                        # Platform admin: execute
POST /api/admin/dsr/:id/reject

GET  /api/admin/suppression                            # Platform admin: list
POST /api/admin/suppression                            # Platform admin: add
DELETE /api/admin/suppression/:id

GET  /api/admin/api-consumers                          # Platform admin: list keys
POST /api/admin/api-consumers                          # Platform admin: issue key
DELETE /api/admin/api-consumers/:id                    # Platform admin: revoke
```

### External (`api.burnrateos.com/v1/*`, API-key auth)
```
POST   /v1/contacts/lookup                             # Cache-first lookup; consumer-billed
POST   /v1/contacts/reconcile                          # Identity description → ranked candidates
GET    /v1/contacts/:id                                # Read sourced contact + identifiers + sources
POST   /v1/contacts/batch                              # Read N contacts by UUID (list-render path; capped at 100)
POST   /v1/contacts/:id/refresh                        # Force re-fetch (bypass cache)
GET    /v1/suppression/check                           # Pre-check whether identifier is suppressed
POST   /v1/dsr                                         # Public DSR submission (no auth)
GET    /v1/dsr/verify?token=...                        # Public DSR verify
POST   /v1/webhooks                                    # Register webhook URL + event subscriptions
DELETE /v1/webhooks/:id                                # Unregister
GET    /v1/usage                                       # Consumer billing usage for current period
```

### Widget runtime (browser-callable, JWT auth)
```
POST   /v1/widget/token                                # Server-to-server: API key in, short-lived JWT out
                                                        # Body: { origin, endUserId, allowedKinds[] }
                                                        # Returns: { token, expiresAt }
POST   /v1/widget/lookup                               # Browser: same shape as /v1/contacts/lookup, JWT-auth, origin-pinned
POST   /v1/widget/reconcile                            # Browser: identity → candidates, JWT-auth
GET    /v1/widget/contact/:id                          # Browser: read for panel detail render
GET    /cdn/widget/v1/sourcing.js                      # The hosted widget bundle (cached at edge)
```

**DOM events fired by the widget on the trigger element:**
- `burnrateos:panel-opened`
- `burnrateos:lookup-started`
- `burnrateos:contact-found` — `detail: { contactId, canonical, status }`
- `burnrateos:not-found` — `detail: { status }`
- `burnrateos:suppressed`
- `burnrateos:error` — `detail: { code, message }`
- `burnrateos:panel-closed`

---

## 9. Migration plan: lift from hired.video → BurnRateOS

**Phase 1: Stand up BurnRateOS Contacts module (greenfield).**
- Recover and port `api/src/services/sourcing/` from hired.video git history (pre-`0054_drop_sourcing_tables.sql`). The resolver, providers, hash, suppression, reconciliation modules are reusable as-is.
- Port the schema from [drizzle/0049_integrations_sourcing.sql](hired.video/api/drizzle/0049_integrations_sourcing.sql), adding `tenant_id` columns, RLS policies, and the new tables (`api_consumers`, `external_identity_links`, `tenant_contact_links`, etc.).
- Port the two admin pages with light reskinning for BurnRateOS's design system.
- Wire to BurnRateOS's tenant model + secrets manager + billing.

**Phase 2: Build the external API + Widget runtime.**
- `/v1/contacts/*` routes, API-key auth middleware, rate limiter, per-consumer usage tracking, billing rollup job.
- Webhook delivery service (with retries, signing, replay log).
- Consumer admin UI (tab 7).
- **Widget runtime** (ships with v1 — primary self-serve channel):
  - `/v1/widget/token` JWT issuance + origin allowlist enforcement.
  - `/v1/widget/*` browser-callable endpoints with JWT auth + Origin pinning + CORS.
  - Hosted JS bundle at `cdn.burnrateos.com/widget/v1/sourcing.js` — auto-discovers `data-burnrateos-sourcing` elements, attaches handlers, renders Sourcing Panel (drawer / modal / inline). Non-removable "Powered by BurnRateOS.com" footer.
  - Snippet generator + Widgets admin UI (tab 8).
  - Widget telemetry: `consumer_kind = 'widget'`, `widget_origin` columns on `integration_runs`.

**Phase 3: Migrate hired.video to consume BurnRateOS.**
- Issue hired.video an API key on its own plan.
- Build a thin client at hired.video wrapping `api.burnrateos.com/v1/contacts/{lookup,reconcile,batch,:id}` (the legacy `services/sourcing/sourcingService.ts` was removed in 0054 — see git history for the API shape it exposed if useful as a starting point).
- **Hired.video keeps `integrations` + `integration_credentials` + `integration_runs`** — repurposed as a generic external-systems registry. Reseed `integrations` with one row for BurnRateOS (`slug='burnrateos', kind='system', category='contacts'`); supply credential as env-var pointer to the BurnRateOS API key.
- **Build the recruiter pipeline schema**: create `candidate_pipeline_entries` per §5.10 (snapshot + reference + resume status + recruiter metadata) and the `recruiter_pipelines` parent table.
- **One-time data migration (only if 0054 has not yet been deployed AND production data exists worth saving)**: before applying `0054_drop_sourcing_tables.sql`, export hired.video's `sourced_people` rows + identifiers + sources to BurnRateOS so the canonical graph is seeded; on the hired.video side, transform any pre-existing reconciliation/merge state into `candidate_pipeline_entries` rows with snapshots taken at migration time. Migration script writes BurnRateOS UUIDs back so existing links are preserved. If 0054 has already shipped (or no real recruiter pipeline data exists), skip this step entirely — start fresh with `candidate_pipeline_entries` populated only by new lookups.
- Build the new in-app Sourcing surface: a tab/page that calls `/v1/contacts/lookup` and renders results inline; "Add to pipeline" creates `candidate_pipeline_entries` rows with the snapshot.
- Subscribe to `contact.redacted` and `suppression.added` webhooks; implement the 24h handler per §5.10 GDPR rules.
- Subscribe to `contact.matched` for auto-linking on confidence ≥ 60 (§5.10 auto-linking policy).

**Phase 4: Deprecate hired.video's standalone sourcing surfaces.**
- Remove `/admin/integrations` and `/admin/integrations/sourcing` from hired.video. The reconciliation/merge tool collapses into the recruiter pipeline UI (§5.10 — pipeline entries that need linking confirmation surface there).
- After Phase 3 migration, drop the contact-data tables: `sourced_people`, `person_identifiers`, `person_sources`, `sourced_person_merge_log`, `enrichment_cache`, `enrichment_credits`, `enrichment_transactions`, `data_subject_requests`, `data_suppression_list` (≥ 30 days observed zero traffic).
- **Keep** `integrations`, `integration_credentials`, `integration_runs` — now serving the generic external-systems registry role. The BurnRateOS row stays seeded; future integration rows (Slack, calendar, etc.) slot in cleanly.
- Hired.video's repo retains [shared/scraping/](hired.video/shared/scraping/) for the job-board scraping use case (different domain, not contact enrichment).

---

## 10. Success metrics

- **Cache hit rate** ≥ 70 % steady state (target 70-85 %). Surfaced per provider on the Providers tab and aggregate in Recent Runs. Cross-tenant cache sharing should drive this higher than the single-tenant reference.
- **$ / unique contact sourced** trends down month-over-month as the global cache fills.
- **DSR median time-to-process** ≤ statutory window (30 days EU/UK, 45 days CA).
- **DSR webhook fan-out completion** ≥ 99 % within 24h SLA per consumer.
- **Reconciliation precision** — % of consumer-approved merges (not later unmerged). Track via `external_identity_links.status`.
- **Creator integrations submitted vs approved** — marketplace pipeline health.
- **Provider error rate per integration** < 5 % (7-day rolling).
- **External API metrics**: consumer count, calls/day, p95 latency < 200ms for cache hits, < 2s for cache misses, billed-spend / consumer.
- **Widget metrics**: installs (distinct origins with active JWTs in last 7d), panel-open → contact-found conversion rate, widget-driven contact volume, "Powered by" CTA click-through (distribution flywheel proxy).

---

## 11. Open items

- **Reconciliation scoring algorithm** — current 60/50/40 weights are reasonable defaults but should become configurable per consumer plan tier.
- **Cross-tenant cache privacy concerns** — Globally shared cache for system providers is the cost win, but a tenant must not be able to *infer* that another tenant looked up a specific email by observing cache-hit timings. Mitigate via fixed-latency responses on cache hits, or accept this as a non-issue if all data is from public-record providers.
- **Consumer obligations enforcement** — `contact.redacted` and `suppression.added` webhooks are mandatory but enforcement is currently honour-based + ToS. Consider a periodic compliance audit endpoint where consumers attest to their cache state.
- **Tenant-installed creator integrations** — Should a tenant be able to install a marketplace integration for tenant-only use without it being globally enabled? Probably yes; design the install flow.
- **Plan engine integration** — Pricing for external API consumers needs to slot into BurnRateOS's existing billing module (not specified here).
- **Webhook delivery infra** — Outbound webhook service (signing, retry, replay log, dead-letter queue) is a non-trivial component; may reuse an existing platform primitive.
- **Bulk import jobs** — `bulkImport` capability exists on data-dump providers (Stack Overflow, Wikidata, Common Crawl); the actual ingestion runner is a separate workstream.
- **Pricing-model `freemium` semantics** — Currently treated as `paid` for billing. Decide whether free-tier calls on freemium providers should debit credits/consumer billing.
- **Per-provider per-tenant rate limits** — Currently only the credit balance gates calls. Free-tier abuse on free providers (e.g. GitHub) is not prevented.
- **Migration coordination** — Phase 3 requires a coordinated cutover window for hired.video. Define the rollback path if the BurnRateOS API has an early-life incident.
