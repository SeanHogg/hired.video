# 03 — PRD: Talent Acquisition & People-Cost Pillar

**Persona:** CHRO / founder-as-recruiter / founder-as-budget-owner. **Pillar goal:** open a role,
plan its cost against runway, run a pipeline, make an offer, and turn the hire into an `Employee` —
with the cost side (headcount, TCO, comp, equity) owned here, not stranded under the CFO. **Scope:**
the bare ATS from `hrLegal.ts` (rebuilt), plus the HR-cost cluster mis-filed under the CFO, all owned
by hired.video, all Segment-scoped.

> Same conventions as doc 02: `/v1`, Segment-scoped JWT, per-Segment rate limits, AI calls name their
> `AI_USE_CASES` key. The **video interview** mechanics of the pipeline live in doc 04 — this doc owns
> the requisition, pipeline, offer, and cost models; doc 04 owns the interview/recording/scorecard
> models. They share the `Candidate` entity.

---

## TA-1 — Job Requisitions

**What it is.** The role being hired for. Supersedes the bare `job_openings` SQL table with a
first-class, Segment-scoped requisition that knows its comp band and the headcount plan it came from.

**Entities:** `JobRequisition`, links to `RoleDefinition`, `HiringForecast`.

**User stories**
- As a hiring manager, I open a requisition (title, department, location, employment type,
  description, structured requirements, salary range, hiring manager).
- As a founder, I link a requisition to a headcount-plan line (`headcountForecastId`) so the plan→hire
  loop is closed and the cost forecast reconciles against actual hires.
- As a recruiter, I define the pipeline stages and optionally publish the role to a public careers
  page (`publicSlug`).

**Flow**
1. CRUD `JobRequisition` (status `DRAFT→OPEN→PAUSED→CLOSED→FILLED`). Default `pipelineStages` =
   APPLIED→SCREENING→PHONE_INTERVIEW→TECHNICAL→FINAL_INTERVIEW→OFFER→HIRED (customizable).
2. `roleDefinitionId` pulls the comp band; `headcountForecastId` ties to the plan (TA-5).
3. Publishing flips `careersPagePublished` and exposes the public application surface (doc 04 §VI-6).

**API**
```
GET/POST            /v1/requisitions                    list (filter: status,department) / create
GET/PUT/DELETE       /v1/requisitions/:id
POST                 /v1/requisitions/:id/publish        → public careers page
GET                  /v1/requisitions/:id/pipeline       candidates grouped by stage
```

**Acceptance**
- Requisition CRUD Segment-scoped.
- Linking to a `HiringForecast` is validated (same Segment) and surfaces plan-vs-actual on TA-5.
- Public publish exposes only the public-safe fields; never leaks internal notes/salary unless the
  Segment opts in.

---

## TA-2 — Candidate Pipeline

**What it is.** The kanban-style pipeline: candidates flow through stages toward an offer. The
recruiting spine.

**Entities:** `Candidate` (+ `Interview`/`InterviewScorecard` from doc 04).

**User stories**
- As a recruiter, I add candidates (manually, via careers-page application, via referral, or sourced
  from the Company/Contact graph) and move them across stages.
- As a recruiter, I attach a resume; AI parses it into structured `parsedResume` (`ats.resume.parse`).
- As a recruiter, I see an AI fit score vs the requisition (`ats.candidate.score`) with rationale.
- As a recruiter, I reject (with reason) or advance to offer.

**Flow**
1. CRUD `Candidate` (stage default `APPLIED`); stage transitions are audited.
2. Resume upload → object store (Segment-scoped, encrypted) → `ats.resume.parse` → `parsedResume`.
3. `ats.candidate.score` reads requisition requirements + parsed resume (+ optional graph enrichment)
   → `fitScore`/`fitRationale`.
4. Sourcing/enrichment from the BurnRateOS Company/Contact graph sets `externalContactRef`
   (doc 05 §4.2); respects DSR/suppression — a suppressed contact is never enriched.

**API**
```
GET/POST            /v1/candidates                      list (filter: requisitionId,stage,source,q) / create
GET/PUT/DELETE       /v1/candidates/:id
POST                 /v1/candidates/:id/stage            move stage (audited)
POST                 /v1/candidates/:id/resume           upload → ats.resume.parse
POST                 /v1/candidates/:id/score            → ats.candidate.score
POST                 /v1/candidates/:id/reject           reason
```

**Acceptance**
- Candidate CRUD + stage moves Segment-scoped and audited.
- Resume storage encrypted, retention-policed, DSR-erasable.
- AI parse/score are credit-metered, idempotent per resume version, and never auto-advance a
  candidate — a human owns stage transitions.
- Graph enrichment honors suppression list (no spend, no enrich on a suppressed identifier).

---

## TA-3 — Offers

**What it is.** Extend, track, and resolve an offer; on acceptance, convert the candidate into an
`Employee` and seed comp/equity.

**Entities:** `Offer`, `Candidate`, `Employee`.

**User stories**
- As a hiring manager, I draft an offer (base, bonus, equity grant + cliff/vest, start date) from the
  requisition's comp band.
- As a hiring manager, I send it, track status (SENT→ACCEPTED/DECLINED/RESCINDED/EXPIRED), and on
  acceptance auto-create the `Employee` with comp/equity populated and `convertedFromCandidateId` set.

**Flow**
1. Create `Offer` (status `DRAFT`); comp defaults from `RoleDefinition`/`CompensationStructure`.
2. Send → candidate notified (magic-link offer view optional). Accept → create `Employee`
   (PO-1), set `Candidate.convertedToEmployeeId` + `Candidate.stage=HIRED`, fire roster webhook, and
   **emit an equity-grant event** to reconcile into the BurnRateOS cap table (doc 05 §4.4).
3. Decline/expire updates status; requisition `FILLED` when headcount met.

**API**
```
GET/POST            /v1/offers                          list (filter: candidateId,status) / create
GET/PUT             /v1/offers/:id
POST                 /v1/offers/:id/send
POST                 /v1/offers/:id/accept               → create Employee + roster webhook + equity-grant event
POST                 /v1/offers/:id/decline | /rescind
```

**Acceptance**
- Offer → Employee conversion is atomic (no orphaned candidate/employee) and idempotent.
- Equity-grant event is emitted exactly once per accepted offer; cap-table reconciliation is the
  CFO/Investor domain's job (hired.video only emits).
- Comp values default from the band but are overridable per offer.

---

## TA-4 — Employee TCO (Total Cost of Ownership)

**What it is.** Per-Segment cost assumptions + a calculator that turns a salary into fully-loaded
cost. Moves out of `routes/financial.ts` (where it was filed under the CFO) — the data is CHRO.

**Entities:** `EmployeeTCOSettings`.

**User stories**
- As a founder, I set cost assumptions (payroll-tax %, benefits %, perks %, overhead %).
- As a founder, I calculate the loaded cost of a salary, and model a multi-employee scenario.

**Flow**
1. GET/PUT `EmployeeTCOSettings` (one row per Segment, `@@unique([tenantId, segmentId])`).
2. Calculate: `salary + salary*(payrollTaxes+benefits+perks+overhead)` (+ the source's recruiting
   1/12 and training 0.5/12 factors — preserve the exact formula).
3. Scenario: apply across a set of salaries/roles → total loaded cost + monthly burn contribution.

**API**
```
GET/PUT  /v1/tco/assumptions
POST     /v1/tco/calculate     { annualSalary } → loaded cost breakdown
POST     /v1/tco/scenario      { employees[] }  → aggregate loaded cost + monthly burn
```

**Acceptance**
- One settings row per Segment; defaults match source (8/25/7/7%).
- Calculation matches the source formula exactly (incl. recruiting/training factors).
- TCO output is the input to the CFO burn seam (doc 05 §4.3) — the CFO reads it, never owns it.

---

## TA-5 — Headcount Planning

**What it is.** Strategic hiring plans with compensation modeling and **runway impact** — the feature
the catalog sold as "runway impact analysis" but never actually wired to burn.

**Entities:** `HeadcountPlan`, `RoleDefinition`, `CompensationStructure`, `HiringForecast`,
`OnboardingCost`, `RampTime`, `TeamCapacityPlan`, `HeadcountImpact`.

**User stories**
- As a founder, I create a headcount plan (period, fiscal year, target headcount, budget) with
  department/role breakdowns and per-role comp + onboarding cost + ramp time.
- As a founder, I see the plan's monthly cost, planned vs actual hires, budget utilization, and
  **monthly burn increase + runway-impact days** computed against real burn (doc 05 §4.3).
- As a founder, I link plan lines to `JobRequisition`s (TA-1) to track plan→hire conversion.

**Flow**
1. CRUD `HeadcountPlan` + role/forecast/onboarding/ramp/capacity children.
2. Summary aggregates total comp, onboarding, budget remaining/utilization, by department/level/
   priority (preserve the source's `HeadcountPlanSummary` shape).
3. Impact: **[Build requirement / gap-closure]** pull current monthly burn + runway from BurnRateOS
   BI (`GET /api/bi/burn-rate`), compute `monthlyBurnIncrease` + `runwayImpactDays`, persist on
   `HeadcountImpact`. The source `calculate-impact` endpoint existed but did not read burn — this PRD
   closes that gap.

**API**
```
GET/POST            /v1/headcount/plans                 list / create
GET/PUT/DELETE       /v1/headcount/plans/:id
GET                  /v1/headcount/plans/:id/summary     by department/level/priority + budget util
POST                 /v1/headcount/plans/:id/calculate-impact   → burn increase + runway days (reads BI)
GET                  /v1/headcount/projections          current + projected headcount + monthly cost
GET/POST/PUT/DELETE  /v1/roles                           RoleDefinition CRUD
GET/POST             /v1/hiring-forecasts                + per-forecast onboarding/ramp/capacity
```

**Acceptance**
- All cost models Segment-scoped (note: source `headcount_plans` was account-scoped — re-scope to
  Segment).
- `calculate-impact` actually reads burn and produces real runway numbers (gap closed, not claimed).
- Plan→requisition→hire linkage lets a founder see "planned 4 engineers, hired 2, 1 in pipeline."

---

## TA-6 — PTO & Leave

**What it is.** PTO request tracking (vacation/sick/parental/bereavement/unpaid) with approval flow.
Moves out of `hrLegal.ts`; `employee_name` free-text becomes a real `Employee` FK.

**Entities:** `PtoRequest`, `Employee`.

**User stories**
- As an employee/manager, I file a PTO request (type, dates, days) against an employee.
- As a manager, I approve/reject with notes; approved leave shows on the roster status + calendar.

**Flow**
1. CRUD `PtoRequest` keyed on `employeeId` (resolved from `employee_name`/email on import).
2. Approval transitions PENDING→APPROVED/REJECTED; approved leave can flip `Employee.status=ON_LEAVE`
   for the window (optional per Segment) and create a `CalendarEvent`.

**API**
```
GET/POST   /v1/pto                       list (filter: employeeId,status) / create
PATCH      /v1/pto/:id                    approve/reject + notes
```

**Acceptance**
- PTO Segment-scoped and FK-keyed to `Employee`.
- Approval is idempotent; status drives roster + calendar consistently.

---

## Pillar-level acceptance

- The plan→hire→employee loop is continuous: `HeadcountPlan` line → `JobRequisition` → `Candidate` →
  `Offer` → `Employee`, with the same `RoleDefinition` comp band flowing through.
- Cost ownership lives here; the CFO consumes TCO + headcount monthly-cost + hire events over the
  burn/runway seam (doc 05 §4.3) and never reads these tables directly.
- The two real gaps the source left — **headcount→runway never wired** (TA-5) and **person identity
  split across `Employee` vs `payroll_records.employee_name`** (TA-3/TA-6 import reconciliation) — are
  closed here, not deferred.
- Cap table, IP assets, and non-HR compliance are **not** in this pillar — they stay in BurnRateOS
  (CFO/CISO). Only employee equity *grants* (people-comp) live here, and they're emitted to the cap
  table over a seam.
