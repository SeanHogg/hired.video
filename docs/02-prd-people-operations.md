# 02 — PRD: People Operations Pillar (CHRO)

**Persona:** CHRO / founder-as-people-lead. **Pillar goal:** run the team — roster, alignment,
performance, and cadence — so a founder never drops a 1:1, a review, or a goal, and so people-risk
surfaces before it becomes attrition. **Scope:** the entire Operational Cadence domain, all owned by
hired.video, all Segment-scoped, AI-assisted through the gateway with the **CHRO persona**.

> Conventions for every feature below: all endpoints are under `/v1` on the hired.video API,
> require a valid Segment-scoped JWT, and are rate-limited per Segment. "Acceptance" = the
> conditions the agentic builder must satisfy. AI calls name their `AI_USE_CASES` key. Every list/
> read is filtered by `(tenantId, segmentId)`; cross-Segment reads are impossible.

---

## PO-1 — Corporate Roster & Org Chart

**What it is.** The team directory and org tree — the CHRO's single source of truth. The spine for
every other people feature.

**Entities:** `Employee` (the spine).

**User stories**
- As a founder, I add/edit/remove employees (name, email, position, department, manager, start date,
  location, employment type, status, skills, salary, equity grant, performance rating, founder flag).
- As a founder, I view the org chart (tree from managerless roots down through `managerId`).
- As a founder, I filter by department/status/employment-type and search by name/skill.
- As a founder, I see team metrics: total/active headcount, avg performance rating, upcoming 1:1s,
  overdue reviews, goal-completion rate, department breakdown.

**Flow**
1. CRUD `Employee` scoped to Segment; `@@unique([tenantId, segmentId, email])` prevents dupes.
2. On every write, **emit a roster-changed webhook** to BurnRateOS so the Company record's
   `teamSize`/`coFounders` stay correct (replaces the in-process `syncCompanyFromRoster` — doc 05 §4.1).
3. Org chart computed from `managerId`; `directReports` is a denormalized cache.

**API**
```
GET    /v1/employees                       list (filter: department,status,employmentType,managerId,skills,q)
POST   /v1/employees                       create  → roster webhook
GET    /v1/employees/:id
PUT    /v1/employees/:id                    → roster webhook
DELETE /v1/employees/:id                    → roster webhook
GET    /v1/employees/hierarchy             org-tree roots + nested reports
GET    /v1/analytics/team-metrics          headcount + rating + cadence rollup
GET    /v1/analytics/employee/:id          per-employee engagement (1:1 freq, goal %, trend)
```

**Acceptance**
- Roster CRUD Segment-scoped; cannot read/write another Segment's employees.
- Deleting an employee with `managerId` children re-parents or blocks per a documented rule (source
  used `onDelete: Restrict` on the self-relation — preserve that: block delete while reports exist).
- Roster webhook is idempotent and never blocks the CRUD response (fire-and-forget + retry).
- `convertedFromCandidateId` is set when the employee was hired through the ATS (doc 04).

---

## PO-2 — 1-on-1 Scheduling

**What it is.** Recurring 1:1 cadence with shared agenda, notes, and action-item follow-up.

**Entities:** `OneOnOneSession`, `ActionItem`.

**User stories**
- As a manager, I schedule a 1:1 (supervisor, participant, date, duration, type, location/link).
- As a manager, I maintain a shared agenda (ordered items with status), capture notes, and add
  action items that appear in the participant's follow-up list.
- As a manager, I see per-report 1:1 history and upcoming sessions; I reschedule/cancel.

**Flow**
1. Create `OneOnOneSession` (status `SCHEDULED`). Agenda is an ordered JSON array with item CRUD
   (`/agenda-items` add/update/delete by index — preserve the source's index-addressed agenda API).
2. On save with action items, mirror each into `ActionItem` (`sourceType=ONE_ON_ONE`, `oneOnOneId`).
3. Templates: ship the source's static templates (Weekly Check-in, Career Development) as starter
   agendas.

**API**
```
GET/POST           /v1/one-on-ones                      list / create
GET/PATCH/DELETE    /v1/one-on-ones/:id
GET                 /v1/one-on-ones/templates
GET/POST            /v1/one-on-ones/:id/agenda-items
PATCH/DELETE        /v1/one-on-ones/:id/agenda-items/:index
```

**Acceptance**
- Sessions scoped to Segment; both `supervisorId` and `participantId` resolve via `IdentityCache`.
- Agenda item index operations are concurrency-safe (optimistic version or server re-read).
- Action items created from a 1:1 are traceable back to the session and deletable independently.

---

## PO-3 — Performance Reviews

**What it is.** Quarterly/annual review cycles with 360 feedback, self-assessment, ratings, and
calibration. **Unifies the two source `performance_reviews` tables** (doc 01 §4.3).

**Entities:** `PerformanceReview`.

**User stories**
- As a manager, I create a review (employee, reviewer, type, period, scheduled date).
- As a manager, I record strengths, areas for improvement, goals, rating, and comments; status moves
  `SCHEDULED → IN_PROGRESS → COMPLETED`.
- As a CHRO, I see review completion status and rating distribution across the org.
- As a CHRO, I ask the AI Coach to **draft** review language from notes (`ops.review.draft`).

**Flow**
1. Create `PerformanceReview` (status `SCHEDULED`). Period captured as start/end + optional label.
2. Optional AI assist: `ops.review.draft` produces balanced, bias-checked draft language.
3. Completion writes `completedDate` + `rating`; feeds team-metrics + `ops.performance_review.summary`.

**API**
```
GET/POST           /v1/performance-reviews              list (filter: employeeId,reviewerId,type,status) / create
GET/PATCH/DELETE    /v1/performance-reviews/:id
GET                 /v1/performance-reviews/templates
POST                /v1/performance-reviews/:id/draft    → ops.review.draft
```

**Acceptance**
- Exactly one review model; import reconciles the flat `employee_name` shape to `employeeId`.
- Rating distribution + completion query is Segment-scoped and powers PO-1 team metrics.
- AI draft is credit-metered and never auto-submits — the human owns the final text.

---

## PO-4 — Goals & OKRs

**What it is.** OKR tracking across company → team → individual, with auto-rollup and misalignment
flagging.

**Entities:** `Goal` (+ `keyResults` JSON), linkage to `CompanyMilestone`/`StrategicObjective`.

**User stories**
- As a founder, I create goals (employee, title, priority, due date, category, key results) and track
  progress 0–100.
- As a founder, I link goals to a milestone/objective; progress rolls up.
- As a founder, I see at-risk/overdue goals flagged.

**Flow**
1. CRUD `Goal`; key results are a JSON array each with its own progress/target/current/unit.
2. `milestoneId` links to a `CompanyMilestone`; rollup aggregates child goal progress.
3. **[Build requirement]** Misalignment detection (goal with no objective link, or due-date past) is
   surfaced — the catalog promised it; verify it's actually computed, not just claimed.

**API**
```
GET/POST           /v1/goals                            list (filter: employeeId,status,priority,category,dueDate,q) / create
GET/PUT/DELETE      /v1/goals/:id
```

**Acceptance**
- Goal CRUD Segment-scoped and FK-valid against `employeeId`.
- Rollup is deterministic and recomputed on child change.
- Cross-domain: `linkedObjectiveId`/`linkedKeyResultId` referenced by BurnRateOS/BuilderForce work
  items are read over the API (doc 05 §4) — hired.video owns the objective/goal, others store the id.

---

## PO-5 — Strategic Objectives & Milestones

**What it is.** Company-level strategy: objectives with measurable outcomes and milestones, plus a
company milestone tracker (product/revenue/funding/team milestones).

**Entities:** `StrategicObjective`, `ObjectiveOutcome`, `ObjectiveMilestone`, `CompanyMilestone`.

**User stories**
- As a founder, I create an objective (category, timeframe, dates, owner, priority) with outcomes
  (target/current/unit) and milestones (due date, status).
- As a founder, I track company milestones with status derivation (NOT_STARTED→…→COMPLETED/MISSED/
  AT_RISK) and progress, optionally linked to an objective.
- As a founder, I see objective stats and the top-N objectives.

**Flow**
1. CRUD objective + nested outcomes/milestones (cascade delete on objective).
2. `CompanyMilestone` status derived from `targetDate`/`completedDate`/`progress`; analytics summarize
   counts by status.
3. The source dual-key (`targetCompanyId`/`ownerAccountId`) collapses to `segmentId`.

**API**
```
GET/POST           /v1/strategic-objectives             list (filter: status) / create
GET/PATCH/DELETE    /v1/strategic-objectives/:id
GET                 /v1/strategic-objectives/stats
GET/POST            /v1/objectives/:id/outcomes
GET/POST            /v1/objectives/:id/milestones
GET/POST           /v1/milestones                       company milestones (filter: status,category)
GET/PATCH/DELETE    /v1/milestones/:id
```

**Acceptance**
- Objective + children Segment-scoped; cascade delete verified.
- Milestone status derivation + analytics match the source (`company_milestones` LEFT JOIN child
  goal count + action-item completion).

---

## PO-6 — Pulse Checks & Scheduled Check-Ins

**What it is.** Async team-health monitoring — recurring pulse surveys and automated check-ins that
capture mood, highlights, blockers, and "needs help."

**Entities:** `PulseCheck`/`PulseQuestion`/`PulseResponse`, `ScheduledCheckIn`/`CheckInResponse`.

**User stories**
- As a CHRO, I create a pulse check (title, frequency, participants, questions of type
  TEXT/RATING/MULTIPLE_CHOICE/YES_NO) and toggle active.
- As a CHRO, I schedule recurring check-ins (frequency, day, time, timezone, questions, metrics) and
  see response rate + recent responses (mood/highlights/blockers).
- As a CHRO, I get sentiment scoring per response.

**Flow**
1. CRUD pulse checks + questions; responses collected from participants with optional sentiment tag.
2. `ScheduledCheckIn` is **cron-driven** (`nextScheduledAt`) — **[Build requirement]** the dispatch
   cron is part of this PRD; source had the schema but no runner. Responses land in `CheckInResponse`.

**API**
```
GET/POST           /v1/pulse-checks                     list / create
GET/PATCH/DELETE    /v1/pulse-checks/:id
GET/POST            /v1/pulse-checks/:id/questions
POST                /v1/pulse-checks/:id/responses
GET/POST           /v1/scheduled-check-ins              list (+ /stats) / create
GET/PUT/DELETE      /v1/scheduled-check-ins/:id
GET                 /v1/check-ins/:id/responses
POST                /v1/check-ins/responses
```

**Acceptance**
- All survey data Segment-scoped; respondent identity via `IdentityCache`.
- The check-in dispatch cron resolves `nextScheduledAt` per Segment timezone and is idempotent (no
  double-send within a window).
- Response-rate + sentiment rollups feed Team Health (PO-8).

---

## PO-7 — Scorecards & Weekly Syncs

**What it is.** Operating-cadence rituals — startup scorecards (category metrics + period snapshots)
and weekly sync meetings (IDS-style agenda + metrics).

**Entities:** `Scorecard`/`ScorecardMetric`/`ScorecardSnapshot`, `StartupSync`/`SyncAgendaItem`/
`SyncMetric`, `ActionItem`.

**User stories**
- As a founder, I define scorecards (category) with metrics (unit, target, order) and record period
  snapshots (metric→value map).
- As a founder, I schedule weekly syncs with an ordered agenda and per-meeting metrics; action items
  from the sync flow into the canonical `ActionItem` list.

**Flow**
1. Scorecard CRUD + metric CRUD + snapshot capture per period.
2. Sync CRUD + agenda-item CRUD + metric capture; action items mirror to `ActionItem`
   (`sourceType=SYNC`, `syncId`) — the source retired the separate `SyncActionItem` table, so reuse
   the canonical one.

**API**
```
GET/POST/PATCH/DELETE  /v1/scorecards[/:id]
GET/POST                /v1/scorecards/:id/metrics
POST                    /v1/scorecards/:id/snapshots
GET/POST/PATCH/DELETE   /v1/weekly-syncs[/:id]
GET/POST                /v1/weekly-syncs/:id/agenda-items
POST                    /v1/weekly-syncs/:id/metrics
```

**Acceptance**
- All Segment-scoped. Snapshots are append-only per period.
- Sync action items are traceable to the sync and appear in the unified action-item inbox.

---

## PO-8 — Team Health Dashboard

**What it is.** A read-only rollup of engagement, performance, goal alignment, review health, and
communication into an overall health score.

**Entities:** reads `Employee`, `PerformanceReview`, `Goal`, `OneOnOneSession`, `PulseResponse`,
`CheckInResponse`.

**User stories**
- As a founder, I see an overall team-health score with per-dimension drill-down (engagement,
  performance rating, goal alignment, review health, communication) and a member-status table.

**Flow**
1. Compose from the metrics already produced by PO-1/3/4/6. **[Build requirement]** the source page
   was partly mock — the scoring formula must be real and defined here (document the weights).

**API**
```
GET /v1/analytics/team-health     composite score + per-dimension + member table
```

**Acceptance**
- Score is deterministic, documented, and recomputed from live data (no mock values).
- Segment-scoped; matches the PO-1 team-metrics numbers where they overlap.

---

## PO-9 — Meeting Intelligence

**What it is.** AI meeting notes, action-item extraction, and summaries from connected calendar /
voice transcripts.

**Entities:** `MeetingTranscript`, `ActionItem`, links to `OneOnOneSession`.

**User stories**
- As a manager, I create a meeting record (title, participants, transcript) and get an AI summary +
  extracted action items + decisions.
- As a manager, I search transcripts and see meeting metrics (count, avg duration, action completion,
  sentiment).

**Flow**
1. Create `MeetingTranscript`; **[Build requirement]** transcription source (calendar/VoIP) is a seam
   — the source had the table but the AI summary was the only real call (`/api/ai/coaching/ask`).
2. `interview.transcribe`-style summary (`ops`-domain variant) produces `summary`/`keyPoints`/
   `actionItems`/`decisions`; action items mirror to `ActionItem` (`sourceType=MEETING`).

**API**
```
GET/POST/PUT/DELETE  /v1/meeting-intelligence[/:id]
POST                  /v1/meeting-intelligence/:id/summarize   → AI summary + action items
```

**Acceptance**
- Transcripts Segment-scoped; recordings/transcripts honor retention + DSR erasure.
- Summary call is credit-metered; extracted action items are traceable to the transcript.

---

## PO-10 — Workflow Automation

**What it is.** Trigger-action workflows for HR ops toil: onboarding, offboarding, PTO, promotions.

**Entities:** `WorkflowTrigger`, `WorkflowAction`, `WorkflowExecution`.

**User stories**
- As a CHRO, I create a workflow (trigger type: schedule/event/condition/milestone/metric/manual;
  conditions JSON) with ordered actions (notify, create task, escalate, email, Slack message, create
  meeting).
- As a CHRO, I enable/disable workflows and view execution history.
- As a CHRO, I manually fire a workflow.

**Flow**
1. CRUD triggers + ordered actions. **[Build requirement]** the source stored triggers/actions but
   there was **no execution engine** — this PRD owns building the evaluator that creates
   `WorkflowExecution` rows and runs actions (idempotent, retried, logged).
2. Manual fire and event/schedule firing both produce a `WorkflowExecution` with status + results.

**API**
```
GET/POST            /v1/workflow-triggers               list / create
PUT/DELETE          /v1/workflow-triggers/:id
POST                /v1/workflows/:id/trigger            manual fire
GET                 /v1/workflows/:id/executions
```

**Acceptance**
- Triggers/actions/executions Segment-scoped.
- The engine actually fires (not just stores) — an onboarding workflow run produces the configured
  side effects (e.g. a Slack message via PO-11, an action item).
- Failures are captured on `WorkflowExecution.errorMessage`; no silent drops.

---

## PO-11 — Calendar & Slack Integrations + Interview Scheduling

**What it is.** Connect Google/Microsoft/CalDAV calendars and Slack for notifications, and the
booking/scheduling cluster that powers interview + meeting scheduling.

**Entities:** `CalendarIntegration`/`CalendarEvent`, `SlackIntegration`, the `Booking*` cluster.

**User stories**
- As a user, I connect a calendar (OAuth) and Slack (OAuth) per Segment.
- As a host, I define bookable services, availability rules/overrides, and external calendar links;
  external bookers reserve slots via a magic link.
- As a recruiter, I schedule a live interview that creates a `BookingReservation` linked to the
  `Interview` (doc 04).

**Flow**
1. Calendar/Slack OAuth tokens stored encrypted, Segment + user scoped (`@@unique`).
2. Booking host/service/availability CRUD; public booking page resolves availability and creates a
   `BookingReservation` (magic-link token). Optional Stripe Connect payout path for paid
   consultations/interviews (preserve, but it's optional per Segment).
3. Booking webhooks (`booking.confirmed`/`cancelled`) fire to subscribers.

**API**
```
GET/POST/PUT/DELETE  /v1/calendar/integrations[/:id]
GET/POST/DELETE       /v1/slack/integration[/:id]
GET/POST/PATCH/DELETE /v1/booking/hosts | services | availability-rules | overrides
GET                   /v1/booking/public/:handle/availability
POST                  /v1/booking/public/:handle/reserve            → magic-link reservation
GET/POST              /v1/booking/reservations[/:id]/comments
```

**Acceptance**
- Tokens vault/encrypted; revoked on disconnect.
- Public booking + magic-link reservation never enumerate Segment data (single-reservation scope —
  doc 05 §2.4).
- A live interview's `reservationId` round-trips to the `Interview` record.

---

## Pillar-level acceptance

- Every `/v1` endpoint above resolves `(tenantId, segmentId)` first and is Segment-isolated.
- The CHRO persona (verbatim prompt, doc 01 §8) is the default AI voice on every People-Ops surface.
- Team-metrics numbers are consistent across PO-1, PO-3, PO-8 (one query source, not three).
- The roster webhook (PO-1), check-in cron (PO-6), and workflow engine (PO-10) — the three pieces the
  source only *claimed* — are genuinely built and tested.
