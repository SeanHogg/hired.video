# PRD — HR Suite (hired.video native)

**Owner:** hired.video Platform (People Ops). hired.video **builds and owns** the HR back-office as
an extension of its native People Operations domain.
**Status:** Spec — new native work. No reference implementation yet; extends the shipped People Ops
foundation (`/api/people/*`, roster on `user_company_role_associations`, 1:1s, goals, action items on
`tasks`).
**Surfaces:**
- hired.video People Ops area: new **Personnel · Lifecycle · Time & Leave · Performance ·
  Compensation & Benefits · Documents · Analytics** tabs/drawers inside the existing People Ops
  chrome — no new top-level product area, no second roster.
- hired.video API: `/api/people/hr/*` (personnel, leave, performance, compensation, benefits,
  documents, analytics), Segment-scoped like the rest of `/api/people/*`.
- **Customer embeds:** self-service HR actions (request leave, view personnel card, sign a document)
  exposed as company embed surfaces in `shared/embed.ts` so a customer can place them on its own
  intranet.

This is the document referenced by the "Native HR suite" Consolidated Gap Register entry (#2008). It
makes the claim *"hired.video is an all-in-one HR platform"* **true by building it**.

---

## 0. Strategic framing

A workspace owner on hired.video can post jobs, hire, and see the hire on the People Ops roster. To
be the all-in-one HR platform the employer side promises, hired.video must also hold the employment
record, leave, performance cycles, comp/benefits, and signed documents. hired.video builds all of
it natively because:

- **The roster is already here.** The `user_company_role_associations` row is the employee; the HR
  record hangs off it instead of living in a second system that has to be kept in sync.
- **Hire → employee is one flow.** ATS offer acceptance creates the roster row, the personnel file,
  the onboarding checklist, and the comp record in one transaction.
- **One compliance surface.** PII/PHI (comp, benefits, tax IDs, leave/medical notes) sits under
  hired.video's existing encryption, data-residency, and DSR machinery
  ([international-expansion-and-data-residency.md](international-expansion-and-data-residency.md)).

What hired.video already owns natively (the suite extends, never replaces):
- **Roster** — `user_company_role_associations` (auto-materialized; identity link
  user/invite/external/placeholder; billable derived).
- **Org chart**, **1:1s**, **goals**, **action items** (the `tasks` table, `segment_id`-scoped).
- **ATS / recruiting** — jobs, applications, recruiter submissions, placements, screening.
- **Onboarding task seed** at signup (the structured lifecycle workflows below upgrade it).
- **Runway** — `people_tco_settings` cash on hand + monthly burn; headcount plans compute
  `runwayImpactDays`.

---

## 1. Background & problem

The roster stops at identity + org placement + 1:1s. There is no employment record (comp,
employment terms, tax status), no PTO/leave, no performance cycle, no benefits, no signed-document
trail. hired.video needs, natively:

1. **Personnel records** — one digital personnel file per employee: employment terms, comp,
   tax/work-eligibility status, emergency contacts, documents. Segment-scoped, PII-segregated.
2. **Employee lifecycle** — structured onboarding/offboarding workflows (checklists, approvals,
   asset/access provisioning hooks) beyond the signup task seed, materialized as `tasks`.
3. **Time & leave** — PTO/leave balances, requests, approvals, accrual policies, holiday calendars,
   attendance.
4. **Performance** — review cycles, goals/OKRs, feedback, calibration — reusing native 1:1s and goals
   as the cadence layer.
5. **Compensation & benefits** — comp bands, pay changes, benefits enrollment, total-rewards
   statements; comp feeds TCO and runway.
6. **HR documents & e-sign** — policy library, acknowledgements, contracts, signature requests,
   audit trail.
7. **HR analytics** — headcount, attrition, time-to-fill (from the ATS), comp distribution, leave
   liability.

---

## 2. Goals & non-goals

### Goals
- A native HR system of record inside People Ops, Tenant → Segment → Entity scoped like every other
  people table.
- Every HR table keys on the roster row (`user_company_role_associations.id`) — one employee identity.
- Every read/write passes `canActFor()` for the workspace/subject plus field-level entitlement for
  PII/PHI fields.
- HR is a paid add-on SKU on top of the employer plan (every seat is $9.95 — see
  [project_pricing_seats]; HR is an add-on, not a per-seat bump).
- Customers can expose selected self-service HR actions on their own intranet through hired.video's
  company embeds (`shared/embed.ts`), default OFF, field-exposure allowlist enforced server-side.

### Non-goals
- Running payroll (calculation, tax filing, disbursement). hired.video models comp and pay history
  for planning, TCO, and runway; a payroll-provider connector is a separate workstream.
- Replacing the roster, org chart, 1:1s, or ATS. The suite extends them.
- A second roster or a separate HR identity.

---

## 3. Users & access

| Role | Can do |
|------|--------|
| **SuperAdmin** | Benefit-provider catalog, region/data-residency config, HR-data DSR processing. |
| **Workspace HR admin** (owner/admin) | Full CRUD on personnel, lifecycle workflows, leave policies, review cycles, comp bands, document library; configure which fields the company embeds may expose. |
| **Manager** | Approve leave for reports, run/complete review cycles, view personnel cards for their org subtree (from the native org chart). |
| **Employee** | View own personnel card, request leave, view balances, complete review tasks, sign assigned documents, view own total-rewards statement. |
| **Embed viewer** (customer intranet) | Only the actions + fields the workspace enabled for its company embed key; still authenticated as a hired.video employee. |

**Isolation:** personnel records, comp, benefits, leave, documents, policies, and cycles are strictly
Segment-scoped. The only platform-global data is the DSR queue, suppression list, and benefit-provider
catalog.

---

## 4. Surfaces

### 4.1 People Ops tabs
**Personnel** (directory + digital file) · **Lifecycle** (onboarding/offboarding boards backed by
`tasks`) · **Time & Leave** (balances, requests, calendars, policies) · **Performance** (cycles,
goals, calibration) · **Compensation & Benefits** (bands, pay changes, enrollment, total rewards) ·
**Documents** (library, signature requests, acknowledgement tracking) · **Analytics** (headcount,
attrition, leave liability, comp distribution). Panels reuse the `EntityDetailsSheet`-style shells.

### 4.2 API — `/api/people/hr/*`
- `GET/POST/PATCH /api/people/hr/employees[/:rosterId]` — personnel file (field-level entitlement).
- `/api/people/hr/leave/*` — balances, requests, approvals, policies.
- `/api/people/hr/performance/*` — cycles, reviews, calibration (goals stay on `/api/people` goals).
- `/api/people/hr/compensation/*`, `/api/people/hr/benefits/*` — writes HR-admin-gated.
- `/api/people/hr/documents/*` — library, signature requests, acknowledgements.
- `/api/people/hr/analytics/*` — pre-aggregated rollups served through the canonical read-through
  cache (`getOrSetCached`, L1 Map + L2 KV) and invalidated on write.
- Events (`hr.leave.requested`, `hr.leave.approved`, `hr.document.signed`, `hr.cycle.completed`)
  go through the one notification dispatcher (`notificationService.emitNotification`).

### 4.3 Company embeds
New `EMBED_SURFACES` entries in `shared/embed.ts` (`hr-leave`, `hr-personnel-card`, `hr-documents`),
each with its own embed-key scope, `status: "planned"` until the phase ships. Rendered by the shared
embed loader; the embed key only narrows scope, never widens it.

### 4.4 Visibility
A single shared `useHrEntitlement()` hook decides whether HR panels render (null when the workspace
lacks the add-on or `canActFor` fails) — no prop-drilled `canX` booleans.

---

## 5. Data model (native)

All tables carry `(tenant_id, segment_id)` and reference the roster row.

| Table | Purpose |
|-------|---------|
| `hr_personnel_records` | Employment terms, work-eligibility/tax status (encrypted), emergency contacts, employment dates; 1:1 with the roster row. |
| `hr_lifecycle_workflows` / `hr_lifecycle_steps` | Onboarding/offboarding templates; instances materialize as `tasks`. |
| `hr_leave_policies` / `hr_leave_balances` / `hr_leave_requests` | Accrual rules, balances, requests + approvals; holiday calendars per policy. |
| `hr_review_cycles` / `hr_reviews` | Cycles, per-employee reviews, calibration; unify with the `PerformanceReview` model (doc 01 §4.3). |
| `hr_comp_bands` / `hr_comp_changes` | Bands + effective-dated pay changes; feed TCO and runway. |
| `hr_benefit_enrollments` | Plan elections per employee (provider catalog is platform-global). |
| `hr_documents` / `hr_signature_requests` | Library, acknowledgements, signature requests + audit trail. |

---

## 6. Data ownership & compliance

- **System of record:** hired.video for all HR data.
- **Residency:** HR records are region-pinned per
  [international-expansion-and-data-residency.md](international-expansion-and-data-residency.md).
- **PII/PHI:** comp, benefits, tax IDs, leave/medical notes are encrypted at rest and field-level
  entitlement-gated; the embed field-exposure allowlist is enforced server-side, not just hidden in
  the UI.
- **DSR / erasure:** hired.video's DSR flow redacts HR records alongside the rest of the person's
  data; signed-document audit facts (who, when) are retained where law requires.

---

## 7. Phasing (maps to Consolidated Gap Register)

- **Phase 1 — Personnel file (Now/Soon):** `hr_personnel_records` + `/api/people/hr/employees` +
  the People Ops personnel card + `useHrEntitlement()` + add-on gating. Upgrades the roster to a real
  personnel file.
- **Phase 2 — Time & leave (Soon):** policies/balances/requests/approvals + leave panel + the
  `hr-leave` company embed surface.
- **Phase 3 — Performance (Mid):** cycles/calibration on top of native 1:1s and goals.
- **Phase 4 — Compensation & benefits + documents/e-sign (Mid):** comp bands + pay changes (feeding
  TCO/runway), benefits enrollment, total-rewards statement, document library + signature flow.
- **Phase 5 — HR analytics + pay history (Later):** headcount/attrition/leave-liability rollups
  (ATS-fed), read-only pay history.

Open items + per-phase gaps are tracked in the [Consolidated Gap Register](../../ROADMAP.md#consolidated-gap-register).
