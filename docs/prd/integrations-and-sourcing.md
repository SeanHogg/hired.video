# PRD — Contacts & Sourcing (hired.video native)

**Owner:** hired.video Platform (recruiter + employer surfaces).
**Status:** Core contact graph **built natively** in hired.video (migration
`api/drizzle/0493_contacts_graph.sql`). Provider registry / cache-first resolver, suppression + public
DSR, the Source UI, scheduled re-enrichment, and enrichment policy flags are native roadmap work
(§9). An earlier hired.video implementation of the provider registry, resolver, suppression and DSR
modules was removed in `0054_drop_sourcing_tables.sql`; recover it from git history at the commit
immediately before 0054 when building those phases.

**Surfaces:**
- hired.video UI: contacts list + detail, enrichment action, pipeline links, merge-review queue; the
  recruiter Source UI (`/recruiter/source`, gap #215) on the roadmap.
- hired.video API: `/api/contacts` (CRUD, `/:id/enrich`, `/:id/jobs`, `/merge-queue`).
- Inbox processors: `upsert_contact`, `create_sourcing_lead`, `link_to_pipeline` write native rows
  ([role-aware-inbox-processors.md](role-aware-inbox-processors.md)).

**Reference implementation (recover from git history — pre-`0054_drop_sourcing_tables.sql`) for the
roadmap phases:**
- Frontend: `frontend/pages/admin/IntegrationManagement.tsx`, `frontend/pages/admin/SourcingTool.tsx`
- API: `api/src/routes/integrations.ts`
- Domain: `api/src/services/sourcing/` (resolver, registry, providers/, hash, suppression, reconciliation, sourcingService, types)
- Schema (defining the dropped tables): [drizzle/0049_integrations_sourcing.sql](hired.video/api/drizzle/0049_integrations_sourcing.sql)
- Schema files (deleted): `api/src/db/schema/sourcedPeople.ts`, `api/src/db/schema/dataPrivacy.ts`

---

## 0. Strategic framing

hired.video's thesis is *"promote yourself, get hired."* The recruiter and employer side of that
thesis needs a contact graph: the people a recruiter is sourcing, the leads an inbox surfaces, the
candidates attached to a job pipeline. hired.video **owns and builds** that graph natively, because
its unique value is the bridge **sourced contact ↔ hired.video user (resume + video) ↔ job
pipeline** — and that bridge only works when all three layers live in one database:

- A sourced contact that signs up is auto-linked to their hired.video account (`linked_user_id`), so
  the recruiter immediately sees the resume and video.
- Pipeline links (`contact_job_links`) point at hired.video's own `job_items`.
- Duplicate people collapse through the same `person_merge_queue` the rest of the recruiter product
  already uses.

Owning the graph also keeps GDPR/DSR in one place: one suppression list, one erasure cascade, one
audit trail.

---

## 1. Background & problem

Recruiters, employers, and founders doing outbound need one workspace for:

1. **A contact graph** — every person they track, whether added manually, captured from email, enriched,
   or sourced, with an owner and a lifecycle (`contact` → `lead`).
2. **Pipeline linkage** — attach a contact to a job with a stage, without first forcing them to apply.
3. **Enrichment** — fill in title/company/phone/LinkedIn from a provider, paid from the workspace's
   enrichment-credit balance.
4. **Deduplication** — the same person arrives from inbox, sourcing, and manual entry; they must
   collapse into one record under the workspace's merge policy.
5. **Platform linkage** — when a contact is (or becomes) a hired.video user, link them.
6. **Compliance** — suppression list, DSR handling, erasure-aware redaction.
7. **Cost control** — cache-first lookups so the same identifier is not paid for twice.

---

## 2. Goals & non-goals

### Goals
- One native contact graph (`contacts` + `contact_job_links`) that every recruiter/employer surface and
  every inbox action writes to.
- Enrichment through hired.video's `EnrichmentProvider` seam (`api/src/services/enrichment/`), metered
  against `enrichment_credits` / `enrichment_transactions`.
- Duplicate-person detection that feeds `person_merge_queue` and honors `workspace_person_merge_policy`.
- Automatic linking of contacts to hired.video `users` by email.
- (Roadmap) A provider registry + cache-first resolver with ≥ 70 % steady-state cache-hit rate.
- (Roadmap) Public DSR submission + admin processing; erasure redacts + suppresses in one transaction.
- (Roadmap) The recruiter Source UI over the native graph.

### Non-goals
- An external contacts API or third-party widget for other products. hired.video's customers can use
  the contact graph inside hired.video; any customer-site embedding goes through hired.video's
  company embeds (`shared/embed.ts`) like every other surface.
- A developer SDK runtime for creator-built providers. Providers are hired.video code behind the
  `EnrichmentProvider` interface.
- Bulk-import runners for data-dump providers (Stack Overflow, Wikidata, Common Crawl). Capability
  flag only; separate workstream.

---

## 3. Users & access

| Role | Can do |
|------|--------|
| **SuperAdmin** | Manage providers + credentials (env-var pointers), process DSRs, edit the suppression list, view platform-wide enrichment telemetry. |
| **Recruiter / employer user** (contact owner) | CRUD own contacts, enrich (credit-gated), link contacts to jobs they manage with a stage, set own `workspace_person_merge_policy` (auto threshold vs review), approve/reject own merge-queue items, buy enrichment credits, set enrichment policy flags (#264, roadmap). |
| **Job seeker** | Not a contact-graph user; may *be* a contact (linked via `linked_user_id`). |
| **Public (no auth)** | (Roadmap) Submit a DSR; always 202 + verification email; nothing touched until the magic link is clicked. |

Contacts are owner-scoped (`owner_user_id`): every `/api/contacts` read/write is restricted to the
owner, and linking to a job additionally requires being able to manage that job. Nothing is shared
between owners except the platform-global suppression list, DSR queue, and (roadmap) the
system-provider enrichment cache. Sharing a contact book across a workspace's members is a
follow-up (`canActFor()` delegation, as for studio workspaces).

---

## 4. Data model (shipped — `api/drizzle/0493_contacts_graph.sql`)

| Table | Purpose |
|-------|---------|
| `contacts` | The person record. `owner_user_id`, `email`, `full_name`, `company`, `title`, `phone`, `linkedin_url`, `linked_user_id` → `users` (auto-set when a platform user has the same email), `lifecycle` (`contact` \| `lead`), `source` (`manual` \| `inbox` \| `enrichment` \| `sourcing`), `enriched_at`. |
| `contact_job_links` | Contact ↔ `job_items` pipeline link with a `stage` (`CONTACT_JOB_STAGES`). One row per (contact, job). |
| `person_merge_queue` | Existing table. Duplicate candidates land here with a score; approve merges, reject dismisses. |
| `workspace_person_merge_policy` | Existing table. `auto` (merge at ≥ threshold) vs `review`. |
| `enrichment_credits` / `enrichment_transactions` | Existing credit balance + ledger; enrichment debits one credit per paid, successful call. |
| `enrichment_provider_calls` | Existing per-attempt audit written by the `EnrichmentProvider` seam regardless of outcome. |

The shared registry `shared/contacts.ts` is the single source for lifecycle/source enums
(`CONTACT_LIFECYCLES`, `CONTACT_SOURCES`), pipeline stages (`CONTACT_JOB_STAGES`: sourced → contacted →
replied → interviewing → offer → hired / rejected), merge-queue statuses, merge-policy modes +
`DEFAULT_MERGE_POLICY` (auto, 95 % threshold), `MIN_DUPLICATE_CONFIDENCE_BPS`, email normalization,
and the duplicate scorer `duplicateConfidenceBps()` — used by API, inbox handlers, and UI.

---

## 5. Functional requirements

### 5.1 Contact CRUD
- `POST /api/contacts` is create-or-update by (owner, normalized email) — the same email is the same
  record, never a duplicate pair.
- On create/update, if a hired.video `users` row has the same email, set `linked_user_id`.
- Every write runs duplicate detection (§5.3).

### 5.2 Enrichment
- `POST /api/contacts/:id/enrich` calls the active `EnrichmentProvider` (`getActiveProvider()`;
  Hunter is wired via `ENRICHMENT_PROVIDER`). The route never knows which provider ran.
- Gate: balance ≥ 1 credit before a paid call. Success debits one credit and writes an
  `enrichment_transactions` row; every attempt writes `enrichment_provider_calls`.
- Returned fields fill empty contact fields (never overwrite user-entered values without
  confirmation); `enriched_at` is set; `source` stays as originally captured.
- 402 `INSUFFICIENT_CREDITS` when the balance is 0; UI prompts purchase.
- Suppressed identifiers (roadmap §5.6) are never sent to a provider and never debit.

### 5.3 Duplicate detection & merge
- Other contacts of the same owner are scored by `duplicateConfidenceBps()` on: LinkedIn URL match,
  phone match, name + company match, name + corporate email domain match (free-mail domains ignored).
- Pairs at or above `MIN_DUPLICATE_CONFIDENCE_BPS` are written to `person_merge_queue`.
- `workspace_person_merge_policy` mode `auto` merges immediately when the score ≥ the threshold
  (default 95 %); mode `review` (or a lower score) leaves the pair pending.
- `GET /api/contacts/merge-queue` lists pending pairs; `POST /api/contacts/merge-queue/:id/approve`
  merges source into target (non-empty fields unioned, `contact_job_links` re-pointed) and
  `.../reject` keeps both and never re-queues the pair. `GET/PUT /api/contacts/merge-policy` reads
  and sets the mode + threshold.

### 5.4 Pipeline links
- `GET /api/contacts/:id` returns the contact with its job links; `POST /api/contacts/:id/jobs`
  (`{ jobId, stage }`) creates or moves a `contact_job_links` row (caller must be able to manage the
  job); `DELETE /api/contacts/:id/jobs/:jobId` unlinks. Stage values come from `CONTACT_JOB_STAGES`.
- When the contact is linked to a hired.video user, the pipeline view surfaces their resume + video.

### 5.5 Inbox actions
- `upsert_contact` → create-or-update a `contacts` row (`source = 'inbox'`) for the sender.
- `create_sourcing_lead` → upsert the extracted candidate with `lifecycle = 'lead'`, `source = 'sourcing'`.
- `link_to_pipeline` → upsert the candidate and create/move a `contact_job_links` row for the job in
  the action config or extraction (default stage `replied`).
- Each run is recorded on `inbox_action_runs` with the affected row (`skipped` only when there is
  nothing to write, e.g. no email/name or no job id).

### 5.6 Suppression & DSR (roadmap)
- `data_suppression_list` unique on `(identifier_type, identifier_value)`, with a hash for emails.
  Consulted on every enrichment and every inbox/sourcing ingest; suppressed identifiers never spend,
  never persist, and return `status: "suppressed"`.
- Public `POST /api/dsr` (`access | erasure | rectification | portability | objection | opt_out`) →
  202 + magic-link verification → SuperAdmin processing.
- `erasure`: redact matching `contacts` in place (identifying fields nulled, `is_redacted = true`),
  delete cached provider payloads, add every identifier to suppression with
  `reason = 'erasure_request'`. Pipeline links and recruiter notes survive as non-personal records
  ("[Contact redacted]").
- `opt_out | objection`: add to suppression. `access | portability`: export.

### 5.7 Provider registry & cache-first resolver (roadmap)
- `integrations` registry (kind `system`, capabilities map, `pricing_model`, `cost_per_call_cents`,
  `enabled` default false) + `integration_credentials` (env-var name only, never the secret) +
  `integration_runs` telemetry.
- Resolve order: suppression check → `enrichment_cache` (keyed by SHA-256 of the canonical query +
  provider, TTL 90 d default; negative results cached 1 d) → cheapest capable enabled provider →
  fail over on error.
- Seed providers (from the pre-0054 reference): People Data Labs, Apollo.io, Proxycurl, Hunter.io,
  GitHub, OpenCorporates; data-dump providers flagged `bulkImport` only.
- The `EnrichmentProvider` seam stays the single call site; the registry chooses which provider
  implementation it dispatches to.

### 5.8 Source UI (roadmap, gap #215)
- `/recruiter/source`: filter rail + result grid + per-card actions over the native graph and the
  resolver. "Add to pipeline" creates `contacts` (`source = 'sourcing'`) + `contact_job_links`.
- Sourcing filters (Diversity / Clearance / Tenure / Company Size / Ranking / Timezone — #220/#221/#2143)
  are new indexed columns on `contacts`.
- "Done Sourcing" session log (#219).

### 5.9 Scheduled re-enrichment & policy flags (roadmap)
- Worker re-enriches contacts whose `enriched_at` is older than N days, writes deltas, re-scores
  duplicates, and logs the change-set on the person timeline (#208).
- Workspace flags: enrich catch-all emails (default OFF), enrich unknown-deliverability emails
  (default OFF). When OFF, such results are discarded and not charged (#264).

---

## 6. API surface

```
GET    /api/contacts                          list (?q=&lifecycle=&limit=&offset=)
POST   /api/contacts                          create-or-update by email (dup-detect, auto-link user)
GET    /api/contacts/merge-queue              pending duplicate pairs
POST   /api/contacts/merge-queue/:id/approve  merge source into target
POST   /api/contacts/merge-queue/:id/reject   keep both; never re-queue the pair
GET    /api/contacts/merge-policy             auto vs review + threshold
PUT    /api/contacts/merge-policy
GET    /api/contacts/:id                      one contact + its job links
PATCH  /api/contacts/:id                      owner edit (dup-detect)
DELETE /api/contacts/:id
POST   /api/contacts/:id/enrich               spend 1 enrichment credit, fill gaps
POST   /api/contacts/:id/jobs                 link to a job pipeline { jobId, stage }
DELETE /api/contacts/:id/jobs/:jobId          unlink

# roadmap
POST   /api/dsr                               public DSR submission (no auth)
GET    /api/dsr/verify?token=...              public magic-link verification
GET    /api/admin/dsr | POST /api/admin/dsr/:id/process | /reject
GET    /api/admin/suppression | POST | DELETE /:id
GET    /api/admin/integrations | PATCH /:id | PUT /:id/credentials | GET /runs
```

---

## 7. Billing

- Enrichment debits the existing `enrichment_credits` balance (one credit per successful paid call;
  cache hits and free-provider hits are free). Credits are purchased through hired.video billing; the
  same tables also back the advertising credit-purchase flow (`routes/advertising.ts`,
  `invoicesRepository.ts`), so they stay shared.
- AI-assisted features around contacts (inbox extraction, summaries) bill the token ledger, not
  enrichment credits.

---

## 8. Success metrics

- Contacts created per active recruiter/week; % with a pipeline link.
- Enrichment fill rate (fields filled / attempts) and $ per enriched contact.
- Cache hit rate ≥ 70 % steady state once the resolver ships.
- Duplicate precision: % of approved merges not later split; auto-merge share under `auto` policy.
- % of sourced contacts later auto-linked to a hired.video user (the core bridge metric).
- DSR median time-to-process ≤ statutory window (30 days EU/UK, 45 days CA).
- Provider error rate < 5 % (7-day rolling).

---

## 9. Phasing

| Phase | Scope | Status |
|-------|-------|--------|
| 1 — native graph | `contacts` + `contact_job_links` (0493), `shared/contacts.ts`, `/api/contacts` CRUD + enrich + jobs + merge-queue, duplicate scoring → `person_merge_queue`, email auto-link, inbox actions write native rows | Built |
| 2 — compliance | Suppression list + public DSR flow + erasure cascade | Roadmap |
| 3 — resolver | Provider registry + credentials + `integration_runs` + cache-first `enrichment_cache` behind the `EnrichmentProvider` seam | Roadmap |
| 4 — sourcing | Source UI (#215), triage (#216), session log (#219), sourcing filters (#220/#221/#2143) | Roadmap |
| 5 — automation | Scheduled re-enrichment (#208), enrichment policy flags (#264) | Roadmap |

---

## 10. Open items

- **Duplicate-scoring weights** — defaults live in `shared/contacts.ts`; decide whether workspaces can
  tune them beyond the auto-merge threshold.
- **Cache sharing** — a platform-global cache for system providers is the cost win; mitigate timing
  inference (fixed-latency cache hits) before enabling cross-workspace sharing.
- **`freemium` providers** — treated as paid for credit purposes until decided otherwise.
- **Per-provider rate limits** — today only the credit balance gates calls; free providers (e.g.
  GitHub) need their own limits.
