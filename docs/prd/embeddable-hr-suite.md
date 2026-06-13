# PRD — Embeddable HR Suite (BurnRateOS-built, hired.video-embedded)

**Owner:** BurnRateOS Platform (build + system-of-record). hired.video is a **consumer/embedder**, not the builder.
**Status:** Spec — to be built in BurnRateOS, embedded in hired.video. New work; no reference implementation exists in hired.video (unlike [integrations-and-sourcing.md](integrations-and-sourcing.md), which recovered dropped code).
**Surfaces:**
- BurnRateOS UI: `/hr` module (Personnel · Lifecycle · Time & Leave · Performance · Compensation & Benefits · Documents · Analytics).
- **HR Widget**: drop-in `<script>` snippet for any host site (`cdn.burnrateos.com/widget/v1/hr.js`), configured via `data-*` attributes, "Powered by BurnRateOS.com" attribution. Same shape as the Sourcing Widget. Primary self-serve channel.
- External API: `api.burnrateos.com/v1/hr/*` — API-key auth, rate-limited, usage-billed. **This is hired.video's integration path** (deep, server-side, embedded panels rendered in hired.video's own People Ops chrome).

This is the document referenced by the "Embeddable HR suite" Consolidated Gap Register entry. It exists so the claim *"hired.video is an all-in-one HR platform"* becomes **true by embedding**, without hired.video building or owning the HR back-office (which would dilute its individual-centric moat — see §0).

---

## 0. Strategic framing

hired.video and BurnRateOS are sister products with deliberately separate moats (carried over verbatim from [integrations-and-sourcing.md §0](integrations-and-sourcing.md)):

- **hired.video**: *"promote yourself, get hired."* Resume video, personal brand, AI career tooling, social, ATS for small businesses, recruiter marketplace. Primary buyer is the individual; secondary is the recruiter/SMB employer.
- **BurnRateOS**: *"a 360 OS for running a business."* Every CxO function in one product. Primary buyer is the business operator.

**HR back-office (HRIS, payroll, benefits, performance, time/leave, compliance documents) is a B2B-ops purchase.** It maps to BurnRateOS's "run your business" thesis and would dilute hired.video's individual-centric story if hired.video owned it. So: **BurnRateOS builds and owns the HR product; hired.video embeds it** via the external API + an embeddable widget, surfaced inside hired.video's existing CHRO **People Operations** area (which is `native-only for now` — that is the seam this PRD fills; see [project_chro_people_ops]).

What hired.video already owns natively (do **not** rebuild in BurnRateOS):
- **Roster** — `user_company_role_associations` (auto-materialized; identity link user/invite/external/placeholder; billable derived).
- **Org chart**, **1:1s**, **action items** (the `tasks` table, `segment_id`-scoped).
- **ATS / recruiting** — jobs, applications, recruiter submissions, placements, screening.
- **Onboarding task seed** at signup (lightweight; the structured lifecycle workflows below are the BurnRateOS upgrade).

The embeddable suite **extends** the roster into a full personnel file + the HR lifecycle, rather than replacing any of the above. The hired.video roster row is the **bridge**: it carries a `burnrateos_employee_id` foreign reference; the rich HR record lives in BurnRateOS.

Concentrating PII/PHI (compensation, benefits, SSNs, leave/medical) in BurnRateOS — not hired.video — also concentrates the compliance burden in one place, consistent with the GDPR/DSR concentration rationale in the sourcing PRD and the data-residency architecture in [international-expansion-and-data-residency.md](international-expansion-and-data-residency.md). Two HR data stores would be a compliance liability.

---

## 1. Background & problem

A workspace owner on hired.video can post jobs, hire, and now sees the hire on the People Ops roster — but the roster stops at identity + org placement + 1:1s. There is no employment record (comp, employment terms, tax status), no PTO/leave, no performance cycle, no benefits, no signed-document trail. So the "all-in-one HR platform" claim is aspirational on the employer side.

Building that back-office natively in hired.video is the wrong call (§0). The need is a **single HR system-of-record in BurnRateOS** that hired.video — and any other host site — embeds, so:

1. **Personnel records** — one digital personnel file per employee: employment terms, comp, tax/work-eligibility status, emergency contacts, documents. Tenant-scoped, PII-segregated.
2. **Employee lifecycle** — structured onboarding/offboarding workflows (checklists, approvals, asset/access provisioning hooks) beyond hired.video's signup task seed.
3. **Time & leave** — PTO/leave balances, requests, approvals, accrual policies, holiday calendars, attendance.
4. **Performance** — review cycles, goals/OKRs, feedback, calibration. Reuses hired.video's native 1:1s as the cadence layer rather than duplicating them.
5. **Compensation & benefits** — comp bands, pay changes, benefits enrollment, total-rewards statements. Payroll runs are a BurnRateOS-internal module on top of this data (a separate workstream), not embedded in hired.video.
6. **HR documents & e-sign** — policy library, acknowledgements, contracts, signature requests, audit trail.
7. **HR analytics** — headcount, attrition, time-to-fill (fed by hired.video ATS), comp distribution, leave liability.

hired.video consumes (1)–(7) via the external API and renders embedded panels inside People Ops; small businesses on other CRMs/ATSs adopt via the HR Widget.

---

## 2. Goals & non-goals

### Goals
- One BurnRateOS module — `/hr` — as the multi-tenant HR system-of-record. Tenant admins manage personnel, policies, cycles; per-tenant telemetry + billing.
- A stable, billed, rate-limited external API (`/v1/hr/*`) with API-key auth + webhook callbacks, consumed by hired.video and other tenants.
- An HR Widget (`<script>` + `data-*`) mirroring the Sourcing Widget so non-hired.video hosts embed HR actions (request leave, view personnel card, sign a document) on their own pages with "Powered by BurnRateOS.com" attribution.
- hired.video embeds the suite **inside its existing People Ops chrome** — no new top-level product area, no second roster. The roster row links to the BurnRateOS employee record via `burnrateos_employee_id`.
- PII/PHI lives in BurnRateOS, region-aware per the data-residency architecture; hired.video stores only the foreign reference + non-sensitive display projections it is entitled to.
- The hired.video embed respects hired.video's authorization model: every read/write still routes through `canActFor()` ([project_studio_workspaces]) on the hired.video side before the API call, and through the BurnRateOS tenant-isolation model on the server side. Authorization is enforced on **both** sides — never trust the embed alone.

### Non-goals
- hired.video building any HR data tables, payroll logic, or benefits providers. hired.video remains the system of record only for resume videos, user identities, social, ATS, and roster/org/1:1s.
- A native payroll *runner* embedded in hired.video. Payroll calc/disbursement is a BurnRateOS-internal module; hired.video may surface read-only pay history if entitled, nothing more.
- Replacing hired.video's roster, org chart, 1:1s, or ATS. The suite extends them.
- A user-defined widget runtime. Same constraint as the sourcing widget: configuration via `data-*` + a small JS API, not arbitrary host code.
- Building per-tenant HR UIs on hired.video's behalf. hired.video renders its own panels from the API; the Widget is the only BurnRateOS-rendered surface.

---

## 3. Users & access

| Role | Can do |
|------|--------|
| **BurnRateOS platform admin** | Manage benefit-provider integrations, region/data-residency config, approve marketplace HR add-ons, process HR-data DSRs, manage external API consumers (keys, rate limits, billing tier). |
| **Tenant HR admin** (per-workspace) | Full CRUD on personnel, lifecycle workflows, leave policies, review cycles, comp bands, document library; view per-tenant telemetry + billing; configure which fields the embed/widget may expose. |
| **Tenant manager** | Approve leave for reports, run/complete review cycles, view personnel cards for their org subtree (scoped by the org chart hired.video already owns; manager edges synced from hired.video). |
| **Tenant employee** | View own personnel card, request leave, view balances, complete review tasks, sign assigned documents, view own total-rewards statement. |
| **External API consumer** (hired.video, third-party tenants) | API-key auth. Read/write HR records the tenant is entitled to, register webhooks. Billed per call. |
| **Embedding host site** (Widget consumer) | Drops the HR Widget `<script>`. Authenticated via short-lived JWT minted by the host backend (which holds the API key). Actions billed against the host tenant. |
| **Public (no auth)** | HR-data DSR submission only (`POST /v1/hr/dsr`); 202 + verification, no data touched until magic-link clicked. Reuses the sourcing DSR machinery. |

**Tenant isolation:** personnel records, comp, benefits, leave, documents, policies, and cycles are strictly tenant-scoped. There is **no** cross-tenant global cache here (unlike the sourcing contact graph) — HR data is never shared across tenants. The only platform-global tables are the DSR queue + suppression list (shared with sourcing) and benefit-provider catalogs.

---

## 4. Surfaces

### 4.1 BurnRateOS UI — `/hr` module
Tabs: **Personnel** (directory + digital file) · **Lifecycle** (onboarding/offboarding workflow boards) · **Time & Leave** (balances, requests, calendars, policies) · **Performance** (cycles, goals, calibration) · **Compensation & Benefits** (bands, pay changes, enrollment, total rewards) · **Documents** (library, signature requests, acknowledgement tracking) · **Analytics** (headcount, attrition, leave liability, comp distribution) · plus platform-admin-only **API Consumers** + **Widgets** tabs (identical machinery to the sourcing module §4.1 tabs 7–8 — issue keys, allowed origins, theme tokens, field-exposure allowlist, snippet generator).

### 4.2 HR Widget (drop-in JS snippet)
Single hosted bundle, embedded with one `<script>` and configured via `data-*` — modeled exactly on the Sourcing Widget ([integrations-and-sourcing.md §4.2](integrations-and-sourcing.md)). Example:

```html
<script
  src="https://cdn.burnrateos.com/widget/v1/hr.js"
  data-burnrateos-tenant="acme_inc"
  data-burnrateos-token-endpoint="/api/burnrateos-token"
  async></script>

<button
  data-burnrateos-hr
  data-burnrateos-action="request-leave"
  data-burnrateos-employee-ref="#empId"
  data-burnrateos-panel="drawer"
  data-burnrateos-skin="primary"
  data-burnrateos-on-done="window.handleLeaveRequested">
  Request time off
</button>
```

Actions: `request-leave`, `view-personnel-card`, `sign-document`, `enroll-benefits`, `view-rewards`. Flow mirrors the sourcing widget: auto-discover `data-burnrateos-hr` elements → fetch short-lived JWT from `data-burnrateos-token-endpoint` → open panel (inline/drawer/modal) → on completion fire `burnrateos:hr-done` DOM event + the named global callback with `{ action, recordId, status }`. "Powered by BurnRateOS.com" footer is non-removable. Per-tenant config (allowed origins, theme tokens, exposable fields, rate limits, webhooks) lives in the dashboard Widgets tab.

### 4.3 External API — `/v1/hr/*` (hired.video's path)
- `GET/POST/PATCH /v1/hr/employees[/:id]` — personnel records (field-level entitlement enforced server-side).
- `/v1/hr/leave/*` — balances, requests, approvals, policies.
- `/v1/hr/performance/*` — cycles, goals, reviews.
- `/v1/hr/compensation/*`, `/v1/hr/benefits/*` — read for embed; writes are HR-admin-gated.
- `/v1/hr/documents/*` — library, signature requests, acknowledgements.
- `/v1/hr/analytics/*` — pre-aggregated, cacheable rollups.
- Webhooks: `hr.employee.updated`, `hr.leave.requested`, `hr.leave.approved`, `hr.document.signed`, `hr.cycle.completed` — so hired.video can invalidate caches + fire notifications without polling.

---

## 5. hired.video embed (consumer side)

This is the only part hired.video builds. It is intentionally thin.

1. **Identity bridge.** Add `burnrateos_employee_id` (nullable foreign reference) to `user_company_role_associations`. When a roster row is materialized for an employment-bearing role, hired.video calls `POST /v1/hr/employees` (or links an existing record) and stores the returned id. The existing roster identity link (user/invite/external/placeholder) maps 1:1 to the BurnRateOS employee. **No HR fields are copied into hired.video** — only the id.
2. **Embedded panels in People Ops.** New tabs/drawers inside the existing People Ops area (`/api/people/*` chrome) render from `/v1/hr/*`. They reuse hired.video's `EntityDetailsSheet`-style shells; the BurnRateOS data is fetched, never persisted.
3. **Single client + caching.** All HR API calls go through one hired.video-side client module (the DI seam, like `match-handlers.ts`/`LLMClient`). **Reads are served through the canonical read-through cache** (`getOrSetCached` — L1 Map + L2 KV) keyed by `tenant + resource + version`, invalidated by the `hr.*` webhooks above — never poll, never N+1 over roster rows (batch via `GET /v1/hr/employees?ids=...`). A new hired.video read endpoint that proxies HR data must be cached or state why it cannot.
4. **Authorization on both sides.** Every hired.video HR action first passes `canActFor()` for the workspace/subject, then the BurnRateOS tenant-isolation + field-entitlement model. The embed token is short-lived and minted server-side by hired.video (holding the API key) — never shipped to the browser.
5. **Billing.** HR usage is billed by BurnRateOS to the hired.video tenant; hired.video resells/bundles it into the employer plan. Surfaced as a People Ops upsell, gated like any other paid surface (every seat is $9.95 — see [project_pricing_seats]; HR is an add-on SKU on top, not a per-seat bump).
6. **DRY visibility.** A single shared `useHrEntitlement()` hook decides whether the HR panels render (returns null when the tenant lacks the add-on or `canActFor` fails) — no prop-drilled `canX` booleans, per the project DRY rule.

---

## 6. Data ownership & compliance

- **System of record:** BurnRateOS for all HR data. hired.video holds only `burnrateos_employee_id` + transient display projections it is entitled to render.
- **Residency:** HR records are region-pinned per [international-expansion-and-data-residency.md](international-expansion-and-data-residency.md); the API resolves the tenant's region and refuses cross-region reads where required.
- **PII/PHI:** comp, benefits, tax IDs, leave/medical notes are field-level entitlement-gated; the widget/embed field-exposure allowlist (set per tenant) is enforced server-side, not just hidden in the UI.
- **DSR / erasure:** reuses the platform-global DSR + suppression machinery from the sourcing PRD; erasure redacts the BurnRateOS record and instructs consuming tenants (via webhook) to drop their `burnrateos_employee_id` references.

---

## 7. Phasing (maps to Consolidated Gap Register)

- **Phase 1 — Personnel + identity bridge (Now/Soon):** BurnRateOS `employees` model + `/v1/hr/employees` + webhooks; hired.video `burnrateos_employee_id` migration + the People Ops embedded personnel card + `useHrEntitlement()` + cached client. This alone upgrades the roster to a real personnel file and makes the "HR platform" claim defensible.
- **Phase 2 — Time & leave (Soon):** balances/requests/approvals + the `request-leave` widget action + embedded leave panel in People Ops.
- **Phase 3 — Performance (Mid):** cycles/goals/calibration, reusing hired.video native 1:1s as the cadence layer.
- **Phase 4 — Compensation & benefits + documents/e-sign (Mid):** comp bands, benefits enrollment, total-rewards statement, document library + signature flow.
- **Phase 5 — HR analytics + payroll read (Later):** headcount/attrition/leave-liability rollups (ATS-fed), read-only pay history.

Open items + the per-phase hired.video embed gaps are tracked in the [Consolidated Gap Register](../../README.md#consolidated-gap-register).
