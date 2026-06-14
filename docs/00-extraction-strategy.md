# 00 — Extraction Strategy & Two-App Architecture

## 1. Vision

**hired.video** is a video-first People & Talent platform that absorbs everything BurnRateOS does
under the CHRO persona today and adds the video-hiring layer the name promises:

- **People Operations** — roster/org chart, 1:1s, performance reviews, goals/OKRs, strategic
  objectives & milestones, pulse checks & check-ins, scorecards, weekly syncs, meeting
  intelligence, workflow automation, calendar/Slack, interview scheduling.
- **Talent Acquisition & People-Cost** — applicant tracking (jobs, candidates, pipeline),
  headcount planning, employee total-cost-of-ownership (TCO), compensation/equity-grant modeling,
  hiring forecasts, PTO.

…and adds a third thing BurnRateOS never had:

- **Video Interview Intelligence** — async + live video interviews, AI resume parsing, AI
  candidate screening/scoring, structured interview scorecards, and interview-transcript
  intelligence that flows back into the candidate record.

The strategic logic: BurnRateOS is a **founder operating system** spanning nine CxO domains.
"How we hire and run the team" (CHRO work) is a *deep* vertical that deserves its own product, and
the BurnRateOS CHRO surface is already fragmented — Operational Cadence lives in one place, the
HR-cost cluster is mis-filed under the CFO, recruiting is a bare-bones ATS in `hrLegal.ts`, and
hired.video *already* embeds resume pages through the BurnRateOS embed rail. Extracting the whole
domain consolidates it into one product and turns that embed relationship into a full product
relationship: **BurnRateOS becomes a hired.video tenant and embeds it back.**

```
            BEFORE                                   AFTER
  ┌─────────────────────────┐         ┌──────────────────────┐   SSO + embed   ┌────────────────────────┐
  │      BurnRateOS          │         │     BurnRateOS        │ ───────────────►│       hired.video       │
  │  9 domains incl.         │         │  8 domains +          │                 │  • People Operations    │
  │   • Operational Cadence  │  ──────►│  thin embed shells:   │◄─────────────── │  • Talent Acq + Cost    │
  │   • HR-cost (under CFO)  │         │   /ops/*              │   roster / cost  │  • Video Interview      │
  │   • bare ATS (hrLegal)   │         │  AI → api.builderforce│   API seams      │    Intelligence (SoR)   │
  │  AI → api.builderforce   │         │                       │                 │                         │
  └─────────────────────────┘         └──────────────────────┘                 └────────────────────────┘
```

## 2. Scope of the extraction

### 2.1 Moves to hired.video (becomes hired.video's system of record)

**Operational Cadence** (frontend `domains/operationalCadence/`, backend
`routes/operationalCadence.ts`, mounted at `/api/operations/*` and `/api/operational-cadence/*`):

- Roster / org chart (`employees`) — incl. `syncCompanyFromRoster` derivation of company
  `teamSize`/`coFounders`
- 1-on-1s (`one_on_one_sessions` + agenda JSON)
- Performance reviews (`performance_reviews`)
- Goals / OKRs (`goals` + key-results JSON)
- Strategic objectives + outcomes + milestones (`strategic_objectives`, `objective_outcomes`,
  `objective_milestones`, `company_milestones`)
- Pulse checks + check-ins (`pulse_checks`, `pulse_questions`, `pulse_responses`,
  `scheduled_check_ins`, `check_in_responses`)
- Scorecards (`scorecards`, `scorecard_metrics`, `scorecard_snapshots`)
- Weekly syncs (`startup_syncs`, `sync_agenda_items`, `sync_metrics`)
- Meeting intelligence (`meeting_transcripts`, the `meeting-intelligence` CRUD over `one_on_ones`)
- Workflow automation (`workflow_triggers`, `workflow_actions`, `workflow_executions`)
- Calendar + Slack integrations (`calendar_integrations`, `calendar_events`, `slack_integrations`)
- Interview / meeting scheduling — the Bookings cluster (`booking_hosts`, `booking_services`,
  `booking_availability_rules`, `booking_availability_overrides`, `booking_external_calendar_links`,
  `booking_reservations`, `booking_comments`, `booking_payout_records`,
  `booking_webhook_subscriptions`)
- Action items (`action_items`) — the canonical cross-source action item

**Recruiting / HR-legal** (backend `routes/hrLegal.ts`):

- ATS (`job_openings`, `candidates`)
- HR-side performance reviews (`performance_reviews` *flat* table — **drift, see §6**)
- Payroll & employee equity grants (`payroll_records`)
- PTO / leave (`pto_requests`)

**HR-cost cluster** (today mis-filed under the CFO — per memory, this data *is* CHRO):

- Headcount planning (`headcount_plans`) — `routes/businessIntelligence.ts`
- Role definitions / compensation structures (`role_definitions`, `compensation_structures`)
- Hiring forecasts + onboarding cost + ramp time + capacity (`hiring_forecasts`,
  `onboarding_costs`, `ramp_times`, `team_capacity_plans`, `headcount_impacts`)
- Employee TCO settings (`employee_tco_settings` / `tco_assumptions`) — `routes/financial.ts`

**Frontend pages** (all under `/ops/*`): Corporate Roster, Team Management, 1:1s, Performance
Reviews, Strategy (Objectives/Milestones/Goals tabs), Weekly Syncs, Check-Ins, Pulse Checks,
Scorecards, Team Health, Meeting Intelligence (+ AI), Workflow Automation, Calendar/Slack
Integration, Calendar Hub, Bookings (+ Public Booking + Magic-Link Reservation), Manage Users &
Teams, Headcount Planning, and the SuperAdmin ATS page.

> **`Employee` is the spine.** It is the single most important model and the analog of BurnRateOS's
> `work_items`: roster, 1:1s, performance, goals, comp, and (on hire) the converted candidate all
> hang off it. It **must move as one table**, and the two duplicate person representations
> (`Employee` rows vs `payroll_records.employee_name` free-text; the two `performance_reviews`
> tables) **must be unified into it** (doc 01 §4). Splitting it would re-fracture the domain we are
> trying to consolidate.

### 2.2 Stays in BurnRateOS (hired.video federates these, never owns them)

- **Identity & tenancy core:** `Account`, `Company`, `Team`, `User`, `AuthUser`, RBAC/persona,
  subscription/billing, plan registry. BurnRateOS is the IdP. (`Team`/`TeamMember`/`UserInvitation`
  are identity — they **stay**; hired.video references team/user IDs via federated identity.)
- **The other eight domains:** Product Management (CPO), Business Intelligence (CFO), Agile Survival
  (CTO), Sales & Revenue + Customer Engagement (CRO), Investor Intelligence (CEO), Governance &
  Compliance (CISO), Marketing & Growth (CMO).
- **The embed rail itself** (`routes/embed.ts`, `SystemFeature`, `AccountFeature`, `EmbedConsentLog`,
  embed keys) — hired.video re-embeds *through* this rail.
- **The AI gateway** (`api.builderforce.ai` + `@seanhogg/builderforce-sdk`) — unchanged; both apps
  dispatch LLM calls through it.
- **The Companies & Contacts shared business graph** — the foundational Company/Contact graph + the
  sourcing widget + DSR/suppression stays in BurnRateOS. hired.video *reads* it for candidate
  sourcing/enrichment (the catalog already names recruiting as a graph consumer and Tier-4
  enrichment as "hired.video's sweet spot"). See doc 05 §4.
- **Three adjacent-but-not-CHRO clusters that `hrLegal.ts` bundled** — these are *not* people/talent
  data and belong to other CxO domains, so they **stay**:
  - **Investor cap table** (`cap_table_entries`) — founder/investor ownership, share classes →
    CEO/CFO/Investor Intelligence. (Employee *equity grants* in `payroll_records` are people-comp and
    **do** move; the seam reconciles the two — doc 05 §4.4.)
  - **IP / patent assets** (`ip_assets`) → CISO Governance.
  - **Non-HR compliance items** (`compliance_items` where `area != 'HR'`) → CISO Compliance Calendar.
    HR-area compliance (employment law, worker classification, I-9) moves with hired.video.

### 2.3 Cross-domain seams that must survive the cut

These are integrations the catalog promises or the code implies. After extraction they become
**API calls across the app boundary** (see doc 05 for the contract). All are async/eventual and
never block a render path.

| Seam | Direction | Today | After extraction |
|------|-----------|-------|------------------|
| Roster → company `teamSize`/`coFounders` | within Ops | `syncCompanyFromRoster()` writes `companies` on every employee CRUD | **hired.video → BurnRateOS API**: roster change webhook updates the BurnRateOS Company record |
| Headcount/TCO/comp → CFO burn & runway | Ops/HR-cost → BI | mis-filed *inside* the CFO routes; `headcount_impacts.monthlyBurnImpact` exists but isn't read by burn-rate | **hired.video → BurnRateOS**: push headcount monthly-cost + hire events into BI; **BurnRateOS → hired.video**: pull current burn so headcount plans show real runway impact (closes the marketing gap) |
| Employee equity grants → investor cap table | HR-cost → Investor/CFO | `payroll_records.equity_*` and `cap_table_entries` are unrelated tables | **hired.video → BurnRateOS API**: equity-grant events reconcile into the cap table |
| Candidate sourcing/enrichment ← Company/Contact graph | Ops/ATS → Foundation | not wired (ATS is standalone) | **hired.video → BurnRateOS**: sourcing/enrichment via the existing `/api/embed/sourcing/*` + Contacts API; respects DSR/suppression |
| HR compliance ↔ CISO Compliance Calendar | Ops → CISO | one shared `compliance_items` table, `area`-tagged | Split by `area`; HR-area events optionally surface on the CISO calendar via webhook |
| Goal/OKR linkage ← product/agile work items | Ops ↔ CPO/CTO | `work_items.linkedObjectiveId/linkedKeyResultId` store ids only | hired.video owns objectives/goals; BuilderForce/BurnRateOS store the id and read goal status over API |
| Meeting intelligence ← calendar/voice transcripts | Ops | `meeting_transcripts` table exists; transcription not wired | hired.video owns it; transcript source (calendar/VoIP) federated where needed |

## 3. Tenancy model (the isolation contract)

hired.video is multi-tenant. The hierarchy is **three levels**, identical to the BuilderForce
extraction's invariant:

```
Tenant            e.g. "burnrateos"  — one integrating platform / direct customer
  └─ Segment      one per BurnRateOS (accountId, companyId) pair — the end-customer workspace
       └─ Entity  employees, candidates, interviews, 1:1s… every row carries (tenantId, segmentId)
```

- **Tenant** = a consumer of hired.video. BurnRateOS is the first. (A future direct-sale customer
  would be its own tenant.)
- **Segment** = the unit of customer isolation *inside* a tenant. Every BurnRateOS
  `(accountId, companyId)` maps to exactly one Segment. **No query in hired.video ever runs without
  a `(tenantId, segmentId)` filter.** This is what guarantees "no customer's data bleeds."
- Every ported table that today has `companyId` (and sometimes `accountId`) gets **`tenantId` +
  `segmentId`** instead, with a composite index leading on both. See doc 01 §3.

**The second identity class (net-new vs BuilderForce):** hired.video has external actors BurnRateOS
never modeled — **candidates** and **interview guests/reviewers** who are not host users. They
authenticate by **magic link** (the pattern already exists in `booking_reservations.magicLinkToken`
and the `MagicLinkReservationPage`). A candidate session is scoped to a single `Segment` + a single
`Candidate`/`Interview` and can never enumerate Segment data. See doc 05 §2.4.

This is the single most important invariant for the agentic builder: **Segment is the new
company-scope.** Every repository function, every API handler, every AI action resolves and enforces
`(tenantId, segmentId)` first; candidate sessions resolve to a single pinned entity within a Segment.

## 4. Migration plan (data)

Pre-launch posture applies: per BurnRateOS convention there are **no production users yet**, so
migrations may **drop-and-recreate** rather than backfill (no `*_v2`/`*_legacy`). But the field-union
rule still holds — the hired.video schema must preserve **every field** of every moved model, and
must **union** the drifted duplicates (doc 01 §4, §6).

**Phase A — Stand up hired.video schema.** Create the full domain model (doc 01) with Tenant/Segment
scoping. Add the legacy SQL-only tables (`job_openings`, `candidates`, `payroll_records`,
`pto_requests`) as first-class models with proper scoping (they have **no Prisma model today** — see
doc 01 §6). Seed the `burnrateos` tenant.

**Phase B — One-shot export/import (optional).** If any BurnRateOS rows are worth keeping, run a
one-time ETL: for each moved table, read by `companyId`, resolve/create the Segment from
`(accountId, companyId)`, write into hired.video with `(tenantId=burnrateos, segmentId)`. Preserve
UUIDs so cross-references survive (`goals.employeeId`, `one_on_one_sessions.supervisorId/participantId`,
`objective_outcomes.objectiveId`, `scorecard_metrics.scorecardId`, etc.). During import, **reconcile
the two person representations**: match `payroll_records.employee_name`/`email` to an `Employee`,
creating the Employee if missing; collapse both `performance_reviews` shapes into the unified model.
If there's nothing worth keeping, skip — greenfield the tenant.

**Phase C — Drop moved tables from BurnRateOS.** Remove the moved models and their routes
(`operationalCadence.ts`, the ATS/performance/payroll/PTO halves of `hrLegal.ts`, the
headcount-planning routes in `businessIntelligence.ts`, the TCO routes in `financial.ts`) and the
`domains/operationalCadence` + `HeadcountPlanningPage` + `ATSPage` frontend. Replace pages with embed
shells (doc 05 §5). **Keep** `Account/Company/Team/User`, the embed rail, `cap_table_entries`,
`ip_assets`, and the non-HR `compliance_items`. Re-point `syncCompanyFromRoster` to the inbound
roster webhook (doc 05 §4.1).

**Phase D — Wire the cross-domain API seams** (§2.3) as live calls.

## 5. Rollout & cutover

1. Ship hired.video standalone (its own UI works end-to-end for the `burnrateos` tenant), including
   the candidate magic-link portal.
2. Add the embed-back surface + SSO handshake (doc 05). Validate one Segment end-to-end (a founder
   sees their roster + opens a req + runs a video interview, all embedded).
3. Flip BurnRateOS `/ops/*` pages to embed shells behind a feature flag (`embed_hiredvideo`),
   defaulting OFF, ramping per the embed rail's consent model.
4. Once embedded surfaces match parity, remove the legacy BurnRateOS CHRO code.
5. Wire the cross-domain seams; remove the temporary manual-link fallbacks (esp. the headcount→burn
   coupling that was never actually wired).

## 6. Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| `Employee` is the spine shared by every people feature — easy to fracture | Move as one table; unify the drifted person representations into it (doc 01 §4). |
| **Two `performance_reviews` tables** — relational (`operationalCadence`, FK to `employees`) vs flat (`hrLegal`, free-text `employee_name`) | Unify into one `PerformanceReview` keyed on `employeeId` (doc 01 §4.3); the flat shape's fields become a field-union; logged in the BurnRateOS gap register. |
| **Two person identities** — `Employee` rows vs `payroll_records.employee_name` strings | Reconcile on import by name/email → `Employee.id`; `payroll`/PTO become FK-keyed (doc 01 §5). |
| HR-cost cluster lives under CFO routes; cutting it could break BI | The cut is *data ownership*, not the BI read — BI consumes via the burn/runway seam (doc 05 §4.3); nothing in BI computes from these tables today, so the cut is low-risk. |
| Cap-table / IP / non-HR-compliance bundled in `hrLegal.ts` could be moved by mistake | Explicit boundary (§2.2): these **stay**; only ATS/performance/payroll/PTO leave `hrLegal.ts`. |
| Candidate magic-link identity is net-new; mis-scoping = data bleed | Candidate sessions pin to one `(segmentId, candidateId|interviewId)`; never enumerate; separate token audience from host JWTs (doc 05 §2.4). |
| Segment mis-resolution → data bleed | Single `resolveSegment(jwt)` chokepoint; every repo asserts `(tenantId, segmentId)`; integration test that a Segment cannot read another Segment's rows. |
| Video storage/PII (interview recordings, resumes) raises GDPR exposure | Recordings/resumes are Segment-scoped, encrypted at rest, retention-policed per Segment, and honor the BurnRateOS DSR/erasure posture via `DELETE /v1/admin/segments/:id` cascade (doc 05 §3, §7). |
| Marketing claims never coded (workflow automation firing, meeting transcription, headcount→runway auto) | Treated as **build requirements** in the PRDs, not regressions; called out explicitly. |
| Identity drift if hired.video caches user/company copies | hired.video stores only IDs + a denormalized display cache refreshed from SSO claims; BurnRateOS remains source of truth for identity. |

## 7. Out of scope for v1

- Direct (non-BurnRateOS) hired.video customers — the tenant model supports it, but no self-serve
  signup/billing in v1. (Decision 4 was "BurnRateOS is IdP"; standalone auth is a later tenant type.)
- Migrating the other eight BurnRateOS domains.
- Replacing the `api.builderforce.ai` LLM gateway — it stays as-is (new CHRO/recruiting/interview
  use cases are added to its registry).
- Payroll *processing / payments* (running actual payroll). hired.video models compensation and
  equity grants for planning + cost; it does not become a payroll provider in v1.
