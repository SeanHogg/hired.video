# 00 — Domain Ownership Strategy & Native Architecture

## 1. Vision

**hired.video** is a video-first People & Talent platform that owns, end to end, everything a
company does under the CHRO persona and adds the video-hiring layer the name promises:

- **People Operations** — roster/org chart, 1:1s, performance reviews, goals/OKRs, strategic
  objectives & milestones, pulse checks & check-ins, scorecards, weekly syncs, meeting
  intelligence, workflow automation, calendar/Slack, interview scheduling.
- **Talent Acquisition & People-Cost** — applicant tracking (jobs, candidates, pipeline), the
  contacts/sourcing graph, headcount planning, employee total-cost-of-ownership (TCO), runway
  impact, compensation/equity-grant modeling, hiring forecasts, PTO.

…and a third pillar that is uniquely hired.video:

- **Video Interview Intelligence** — async + live video interviews, AI resume parsing, AI
  candidate screening/scoring, structured interview scorecards, and interview-transcript
  intelligence that flows back into the candidate record.

The strategic logic: "how we hire and run the team" is a *deep* vertical that deserves one product.
A fragmented design — operational cadence in one place, the HR-cost cluster filed under finance,
recruiting as a bare-bones ATS, contacts in yet another system — is exactly what hired.video
consolidates. **hired.video is the single system of record**; nothing in this domain is delegated to
an external product, and there is no host/tenant or embed-back relationship with any other app.

```
                       hired.video (one app, one system of record)
  ┌────────────────────────────────────────────────────────────────────────────────┐
  │  People Operations        Talent Acq + People-Cost       Video Interview Intel. │
  │  roster · 1:1s · goals    ATS · contacts graph ·         async/live interviews ·│
  │  reviews · syncs · pulse  headcount · TCO · runway        scoring · transcripts  │
  │                                                                                  │
  │  identity (users/companies) · Tenant→Segment→Entity · AI credit ledger           │
  │  company embeds for customers' own sites (shared/embed.ts)                       │
  └────────────────────────────────────────────────────────────────────────────────┘
                 │ LLM dispatch (transport only)
                 ▼
        Builderforce LLM gateway (@seanhogg/builderforce-sdk)
```

## 2. Scope of ownership

### 2.1 What hired.video owns (system of record)

The inventory below names the modules, tables, and pages of the source design (see the README
provenance note); each one is built as a hired.video module.

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

**HR-cost cluster** (the source design mis-filed this under the CFO — this data *is* CHRO):

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

> **`Employee` is the spine.** It is the single most important model: roster, 1:1s, performance,
> goals, comp, and (on hire) the converted candidate all hang off it. It **must be one table**, and
> the two duplicate person representations (`Employee` rows vs `payroll_records.employee_name`
> free-text; the two `performance_reviews` tables) **must be unified into it** (doc 01 §4).
> Splitting it would re-fracture the domain we are consolidating. (In the shipped code the roster
> row is `user_company_role_associations`.)

Also owned natively by hired.video:

- **Identity & tenancy** — hired.video `users`, companies, workspaces, RBAC, billing, and plan
  registry. hired.video is its own identity source; enterprise SSO against a customer's own IdP is
  native roadmap work (doc 05 §2).
- **The contacts/sourcing graph** — `contacts` + `contact_job_links`
  (`api/drizzle/0493_contacts_graph.sql`, `shared/contacts.ts`, `/api/contacts`), enrichment via the
  native `EnrichmentProvider` seam, duplicate detection into `person_merge_queue`. See
  [prd/integrations-and-sourcing.md](./prd/integrations-and-sourcing.md) and doc 05 §4.2.
- **Runway** — cash on hand + monthly burn inputs on `people_tco_settings`
  (`api/drizzle/0440_people_runway_inputs.sql`); headcount plans compute `runwayImpactDays` natively.
- **Customer embeds** — hired.video's company embeds (`shared/embed.ts`) let customers surface
  hired.video views on their own sites.

### 2.2 Out of scope (not people/talent)

- **Investor cap table** (founder/investor ownership, share classes). hired.video records employee
  equity *grants* (people-comp) natively; it does not model the investor cap table.
- **IP / patent asset registers.**
- **Non-HR compliance items.** HR-area compliance (employment law, worker classification, I-9) is in
  scope and lives in hired.video.
- **The LLM gateway itself** — hired.video dispatches through the Builderforce LLM gateway
  (`@seanhogg/builderforce-sdk`) as a transport; use cases, prompts, credit ledger, and fallback
  policy are hired.video's.

### 2.3 Internal seams (in-process, all native)

The source design coupled these across product boundaries. In hired.video they are **in-process
service calls** between hired.video modules (doc 05 §4). None block a render path.

| Seam | Direction | Source design | In hired.video |
|------|-----------|---------------|----------------|
| Roster → company `teamSize`/`coFounders` | within People Ops | `syncCompanyFromRoster()` on every employee CRUD | Same in-process derivation onto the hired.video company record |
| Headcount/TCO/comp → burn & runway | People-Cost | `headcount_impacts.monthlyBurnImpact` existed but was never read | `people_tco_settings.cash_on_hand_cents` + `monthly_burn_cents`; the headcount-plan summary computes monthly burn increase + `runwayImpactDays` natively (closes the marketing gap) |
| Offer acceptance → equity grant | Talent → People-Cost | `payroll_records.equity_*` unrelated to any ledger | Offer acceptance writes the native equity-grant fields on the `Employee`/comp record |
| Candidate sourcing/enrichment ← contact graph | ATS → contacts | not wired | Native `contacts` graph + `/api/contacts/:id/enrich` (credit-metered `EnrichmentProvider`); suppressed identifiers are never enriched |
| HR compliance | People Ops | one shared `compliance_items` table, `area`-tagged | Only HR-area items exist in hired.video |
| Goal/OKR linkage ← work items | People Ops | ids-only links | hired.video owns objectives/goals; any linked record stores the id and reads status via the hired.video API |
| Meeting intelligence ← transcripts | People Ops | table existed; transcription not wired | hired.video owns it, including the native AI meeting notetaker (roadmap) |

## 3. Tenancy model (the isolation contract)

hired.video is multi-tenant. The hierarchy is **three levels**:

```
Tenant            "self" today — hired.video itself; future federated enterprise tenants
  └─ Segment      one per hired.video company/workspace — the customer workspace
       └─ Entity  employees, candidates, interviews, 1:1s… every row carries (tenantId, segmentId)
```

- **Tenant** = an isolation domain. Today there is a single `self` tenant (`people_tenants`); an
  enterprise customer federating its own IdP (doc 05 §2) would get its own tenant.
- **Segment** = the unit of customer isolation *inside* a tenant — one per hired.video company.
  **No query in hired.video ever runs without a `(tenantId, segmentId)` filter.** This is what
  guarantees "no customer's data bleeds."
- Every people/talent table gets **`tenantId` + `segmentId`**, with a composite index leading on
  both. See doc 01 §3.

**The second identity class:** hired.video has external actors who are not account holders —
**candidates** and **interview guests/reviewers**. They authenticate by **magic link** (the pattern
already exists in `booking_reservations.magic_link_token` and the magic-link reservation page). A
candidate session is scoped to a single `Segment` + a single `Candidate`/`Interview` and can never
enumerate Segment data. See doc 05 §2.4.

This is the single most important invariant for the agentic builder: **Segment is the
company-scope.** Every repository function, every API handler, every AI action resolves and enforces
`(tenantId, segmentId)` first; candidate sessions resolve to a single pinned entity within a Segment.

## 4. Build plan (data)

Pre-launch posture applies: migrations may **drop-and-recreate** rather than backfill (no
`*_v2`/`*_legacy`). The field-union rule still holds — the hired.video schema must preserve **every
field** of every model in the source design, and must **union** the drifted duplicates (doc 01 §4, §6).

**Phase A — Stand up the schema.** Create the full domain model (doc 01) with Tenant/Segment
scoping, including the formerly SQL-only tables (`job_openings`, `candidates`, `payroll_records`,
`pto_requests`) as first-class models. Seed the `self` tenant.

**Phase B — Unify person identity.** `payroll_records` rows key on `Employee.id` (not free-text
names); both `performance_reviews` shapes collapse into the unified model.

**Phase C — Wire the internal seams** (§2.3) as in-process service calls, including runway (0440)
and the contacts graph (0493).

## 5. Rollout

1. Ship People Ops natively in hired.video (roster, 1:1s, action items — done), then the remaining
   cadence surfaces, the HR-cost cluster, and the ATS/video layers.
2. Ship the candidate magic-link portal.
3. Ship the native HR back-office in phases ([prd/embeddable-hr-suite.md](./prd/embeddable-hr-suite.md)).
4. Offer People Ops / careers / booking views as company embeds for customers' own sites
   (`shared/embed.ts`), default OFF per company.
5. Enterprise SSO (external OIDC tenant federation) when an enterprise customer needs it.

## 6. Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| `Employee` is the spine shared by every people feature — easy to fracture | One table; unify the drifted person representations into it (doc 01 §4). |
| **Two `performance_reviews` shapes** — relational (FK to employees) vs flat (free-text `employee_name`) | Unify into one `PerformanceReview` keyed on `employeeId` (doc 01 §4.3); the flat shape's fields become a field-union; tracked in the hired.video gap register. |
| **Two person identities** — `Employee` rows vs `payroll_records.employee_name` strings | `payroll`/PTO become FK-keyed to `Employee.id` (doc 01 §5). |
| HR-cost cluster and runway are finance-flavored | Runway is computed natively from `people_tco_settings` inputs; no cross-product read. |
| Investor cap table / IP / non-HR compliance creep into scope | Explicit boundary (§2.2): out of scope; only employee equity grants and HR compliance are modeled. |
| Candidate magic-link identity mis-scoping = data bleed | Candidate sessions pin to one `(segmentId, candidateId|interviewId)`; never enumerate; separate token audience from host JWTs (doc 05 §2.4). |
| Segment mis-resolution → data bleed | Single `resolveSegment()` chokepoint; every repo asserts `(tenantId, segmentId)`; integration test that a Segment cannot read another Segment's rows. |
| Video storage/PII (interview recordings, resumes, contacts) raises GDPR exposure | Recordings/resumes/contacts are Segment-scoped, encrypted at rest, retention-policed per Segment, and erased by hired.video's DSR cascade (doc 05 §3, §7). |
| Marketing claims never coded in the source (workflow automation firing, meeting transcription, headcount→runway) | Treated as **build requirements** in the PRDs, not regressions; called out explicitly. |

## 7. Out of scope for v1

- Self-serve enterprise SSO onboarding — the tenant model supports a federated tenant, but v1 runs
  on hired.video's own auth (the `self` tenant).
- Investor cap table, IP assets, non-HR compliance (§2.2).
- Building an LLM gateway — hired.video keeps dispatching through the Builderforce LLM gateway
  (new CHRO/recruiting/interview use cases are added to hired.video's own `AI_USE_CASES` registry).
- Payroll *processing / payments* (running actual payroll). hired.video models compensation and
  equity grants for planning + cost; it does not become a payroll provider in v1.
