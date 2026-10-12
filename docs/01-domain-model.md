# 01 — hired.video Domain Model & Tenancy

This is the canonical data model for hired.video. It is expressed in Prisma-style pseudo-schema
(the agentic builder may target Prisma/Postgres, Drizzle, or another ORM — the shapes are what
matter). Every model carried over from the source design preserves the **full field union** of its source
(per the "consolidate without losing functionality" rule). New video/recruiting models are marked
**[NEW]**.

---

## 1. Conventions

- IDs are `uuid` (preserve source UUIDs on migration so cross-references survive). Source `cuid()`
  ids (e.g. `Employee`, `Goal`) are also preserved verbatim on import.
- `Json` = jsonb. `Decimal(p,s)` preserved from source for money/percentages.
- Every business entity carries **`tenantId` + `segmentId`** (see §3). The composite index
  `@@index([tenantId, segmentId, …])` leads on both.
- `createdAt @default(now())`, `updatedAt @updatedAt` on every table unless noted.
- Foreign keys to identity (`userId`, `createdBy`, `teamId`, `ownerId`) reference hired.video's own
  identity tables (`users`, companies/workspaces) — hired.video owns identity (§2).
- The source design's `companyId`/`accountId` columns are **replaced** by `segmentId` (one Segment per
  hired.video company). Do not also carry `accountId`.

---

## 2. Identity (owned by hired.video)

hired.video **owns** users, companies, workspaces, and RBAC — the `users` table and the company /
workspace tables are the identity source of truth. People/talent rows reference them by id.

For a future **federated enterprise tenant** (a customer signing its employees in through its own
OIDC IdP — doc 05 §2.3), hired.video keeps a thin cache of the last-seen IdP claims so the UI can
render names/avatars and audit role changes. The cached identity is always linked to a hired.video
`users` row (JIT-provisioned on first sign-in); hired.video remains the system of record.

```prisma
model IdentityCache {
  id           String   @id            // = hired.video users.id (or company id for kind COMPANY)
  tenantId     String
  segmentId    String?                 // null for tenant-wide identities (e.g. tenant admin)
  kind         IdentityKind            // USER | TEAM | COMPANY
  externalSubject String?              // IdP `sub` for federated tenants; null for the self tenant
  displayName  String
  email        String?
  avatarUrl    String?
  role         String?                 // last-seen RBAC role
  raw          Json?                   // last IdP claim payload for debugging (federated only)
  lastSeenAt   DateTime
  @@index([tenantId, segmentId, kind])
}

enum IdentityKind { USER TEAM COMPANY }
```

Anywhere a source model had `createdBy`, `userId`, `ownerId`, `reviewerId`, `supervisorId`,
`teamId`, `installedBy` → the column references the hired.video identity id; display resolves from
`users` (or `IdentityCache` for federated tenants).

> **Candidates are NOT identity-cache rows.** A `Candidate` (§7) is a first-class hired.video
> entity (we own the recruiting graph). External candidate/guest *sessions* authenticate by magic
> link and pin to one Candidate/Interview — see doc 05 §2.4.

---

## 3. Tenancy & isolation (the core invariant)

```prisma
model Tenant {
  id          String   @id @default(uuid())
  slug        String   @unique          // "self" (hired.video's own auth)
  name        String
  kind        TenantKind @default(SELF)  // SELF (hired.video auth) | FEDERATED (customer IdP, future)
  idpIssuer   String?                   // OIDC issuer for enterprise SSO (FEDERATED only)
  status      TenantStatus @default(ACTIVE)
  settings    Json                      // feature flags, default plan, branding, careers-page config
  createdAt   DateTime @default(now())
  segments    Segment[]
}

model Segment {
  id                String   @id @default(uuid())
  tenantId          String
  companyId         String                // hired.video company/workspace id
  displayName       String                // cached company name
  plan              String   @default("FREE") // hired.video plan for the company
  status            SegmentStatus @default(ACTIVE)
  settings          Json                  // per-segment overrides (TCO defaults, careers subdomain, retention days)
  provisionedAt     DateTime @default(now())
  lastActiveAt      DateTime?
  tenant            Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, companyId])
  @@index([tenantId, status])
}

enum TenantKind   { SELF FEDERATED }
enum TenantStatus { ACTIVE SUSPENDED }
enum SegmentStatus{ ACTIVE SUSPENDED ARCHIVED }
```

**Rules the builder must enforce (non-negotiable):**

1. Every request resolves a **Segment** before touching data — `resolveSegment()` maps the
   authenticated hired.video user's active company → `Segment.id` (lazy-create on first request).
2. Every repository function takes `(tenantId, segmentId)` as its first scope and **adds them to
   every WHERE clause** — including AI-initiated writes.
3. Cross-segment reads are impossible by construction. There is no "global" query path for business
   entities. (Tenant-admin/observability queries are a separate, explicitly-audited path.)
4. Candidate/guest magic-link sessions resolve to a single pinned `(segmentId, candidateId)` or
   `(segmentId, interviewId)` and may only touch that subtree.

---

## 4. The Person spine (Employee ⇄ Candidate)

`Employee` is the single most important model — the people spine. **Full field union preserved from
`employees`, plus the fields the flat `payroll_records`/`hrLegal.performance_reviews` tables carried
(drift consolidation, §6).** A hired `Candidate` (§7) converts into an `Employee`.

### 4.1 `Employee`

```prisma
model Employee {
  id                String         @id @default(uuid())   // preserve source cuid on import
  tenantId          String
  segmentId         String

  // Core identity
  firstName         String
  lastName          String
  email             String
  phone             String?
  position          String
  department        String
  location          String?
  startDate         DateTime
  employmentType    EmploymentType @default(FULL_TIME)
  status            EmployeeStatus @default(ACTIVE)
  avatar            String?
  skills            Json?
  notes             String?

  // Org graph
  managerId         String?                                // self-join
  directReports     Json?                                  // denormalized cache; source of truth is managerId

  // Performance + comp (unioned from employees + payroll_records)
  performanceRating Float?
  salary            Decimal?       @db.Decimal(14,2)
  equityShares      Int?                                   // from payroll_records.equity_shares
  equityCliffMonths Int?           @default(12)            // payroll_records.equity_cliff_months
  equityVestMonths  Int?           @default(48)            // payroll_records.equity_vest_months
  roleId            String?                                // → RoleDefinition (comp band)

  // Founder flag — drives the in-process company teamSize/coFounders derivation (doc 05 §4.1)
  isFounder         Boolean        @default(false)

  // Provenance: set when this employee was hired through the ATS
  convertedFromCandidateId String?                         // → Candidate.id

  createdAt         DateTime       @default(now())
  updatedAt         DateTime       @updatedAt

  @@unique([tenantId, segmentId, email])
  @@index([tenantId, segmentId, status])
  @@index([tenantId, segmentId, managerId])
  @@map("employees")
}

enum EmploymentType { FULL_TIME PART_TIME CONTRACT CONTRACTOR CONSULTANT INTERN TEMPORARY }  // union of FE + BE enums
enum EmployeeStatus { ACTIVE INACTIVE ON_LEAVE TERMINATED }
```

> **Enum union note.** The frontend types declared `EmploymentType = FULL_TIME|PART_TIME|CONTRACT|
> INTERN` while the backend declared `FULL_TIME|PART_TIME|CONTRACTOR|CONSULTANT|TEMPORARY`. Per the
> consolidate-without-losing rule, the hired.video enum is the **union** of both. Same applies to
> `ReviewType` and the candidate-stage enums below.

### 4.2 `Goal` (OKR) + key results

```prisma
model Goal {
  id          String       @id @default(uuid())
  tenantId    String
  segmentId   String
  employeeId  String
  milestoneId String?                                      // → CompanyMilestone (ops cascade parent)
  title       String
  description String?
  status      GoalStatus   @default(NOT_STARTED)
  priority    GoalPriority @default(MEDIUM)
  dueDate     DateTime
  progress    Int          @default(0)                     // 0–100
  category    String?
  keyResults  Json?                                        // [{ id, description, progress, targetValue, currentValue, unit }]
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
  @@index([tenantId, segmentId, employeeId])
  @@index([tenantId, segmentId, milestoneId])
  @@map("goals")
}

enum GoalStatus   { NOT_STARTED IN_PROGRESS COMPLETED ON_HOLD BLOCKED CANCELLED AT_RISK }  // union
enum GoalPriority { LOW MEDIUM HIGH CRITICAL }
```

### 4.3 `PerformanceReview` — **unified from two source tables** (drift fix)

Source had a relational `performance_reviews` (FK to `employees`, in `operationalCadence`) **and** a
flat `performance_reviews` (free-text `employee_name`, in `hrLegal`). hired.video has **one**:

```prisma
model PerformanceReview {
  id                  String       @id @default(uuid())
  tenantId            String
  segmentId           String
  employeeId          String                               // FK-keyed (flat-table free-text resolved on import)
  reviewerId          String
  reviewType          ReviewType   @default(QUARTERLY)
  status              ReviewStatus @default(SCHEDULED)
  scheduledDate       DateTime?
  completedDate       DateTime?
  reviewPeriodStart   DateTime?                             // from FE type
  reviewPeriodEnd     DateTime?
  reviewPeriodLabel   String?                               // from hrLegal flat shape ("Q1 2026")
  rating              Float?                                // overall_rating
  strengths           Json?
  areasForImprovement Json?                                 // a.k.a. improvements
  goals               Json?
  comments            String?                               // a.k.a. notes
  createdAt           DateTime     @default(now())
  updatedAt           DateTime     @updatedAt
  @@index([tenantId, segmentId, employeeId])
  @@index([tenantId, segmentId, status])
  @@map("performance_reviews")
}

enum ReviewType   { QUARTERLY ANNUAL MID_YEAR MID_CYCLE PROBATION PROBATIONARY THREE_SIXTY }  // union
enum ReviewStatus { DRAFT SCHEDULED IN_PROGRESS COMPLETED OVERDUE CANCELLED }                 // union
```

### 4.4 `OneOnOneSession`

```prisma
model OneOnOneSession {
  id            String         @id @default(uuid())
  tenantId      String
  segmentId     String
  supervisorId  String
  participantId String
  scheduledDate DateTime
  duration      Int            @default(60)                 // minutes
  status        OneOnOneStatus @default(SCHEDULED)
  meetingType   MeetingType    @default(VIDEO)
  location      String?
  meetingLink   String?
  agenda        Json?                                       // [{ title, description, status, order }]
  notes         String?
  actionItems   Json?                                       // mirrored into ActionItem on save
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
  @@index([tenantId, segmentId, supervisorId])
  @@index([tenantId, segmentId, participantId])
  @@map("one_on_one_sessions")
}

enum OneOnOneStatus { SCHEDULED COMPLETED CANCELLED RESCHEDULED }
enum MeetingType    { VIDEO PHONE IN_PERSON HYBRID }        // union
```

---

## 5. People Operations entities (CHRO — PRD doc 02)

```prisma
// Strategic objectives + outcomes + milestones
model StrategicObjective {
  id String @id @default(uuid())
  tenantId String; segmentId String
  title String; description String?
  category ObjectiveCategory; timeframe ObjectiveTimeframe
  startDate DateTime; endDate DateTime
  status ObjectiveStatus @default(ACTIVE)
  priority Int @default(1); ownerId String?; progress Int @default(0)
  createdBy String
  @@index([tenantId, segmentId, status])
  @@map("strategic_objectives")
}
model ObjectiveOutcome   { id String @id @default(uuid()) tenantId String segmentId String objectiveId String title String description String? targetValue Float? currentValue Float? unit String? status OutcomeStatus @default(NOT_STARTED) dueDate DateTime? @@index([tenantId, segmentId, objectiveId]) @@map("objective_outcomes") }
model ObjectiveMilestone { id String @id @default(uuid()) tenantId String segmentId String objectiveId String title String description String? dueDate DateTime status MilestoneStatus @default(PENDING) completedAt DateTime? @@index([tenantId, segmentId, objectiveId]) @@map("objective_milestones") }

// Company milestones (note: source dual-keyed targetCompanyId/ownerAccountId → collapses to segmentId)
model CompanyMilestone {
  id String @id @default(uuid())
  tenantId String; segmentId String
  objectiveId String?
  title String; description String?
  category String                                            // PRODUCT|REVENUE|FUNDING|TEAM|CUSTOMER|OPERATIONAL|PARTNERSHIP|COMPLIANCE
  targetDate DateTime; completedDate DateTime?
  status String @default("NOT_STARTED")                      // NOT_STARTED|IN_PROGRESS|COMPLETED|MISSED|AT_RISK|CANCELLED
  priority String @default("MEDIUM")                         // LOW|MEDIUM|HIGH|CRITICAL
  progress Int @default(0)
  createdBy String
  @@index([tenantId, segmentId, status])
  @@index([tenantId, segmentId, targetDate])
  @@index([tenantId, segmentId, objectiveId])
  @@map("company_milestones")
}

// Pulse checks
model PulseCheck    { id String @id @default(uuid()) tenantId String segmentId String title String description String? frequency PulseFrequency isActive Boolean @default(true) participants Json createdBy String @@index([tenantId, segmentId, isActive]) @@map("pulse_checks") }
model PulseQuestion { id String @id @default(uuid()) tenantId String segmentId String pulseCheckId String question String questionType String @default("TEXT") options Json? order Int isRequired Boolean @default(true) @@index([tenantId, segmentId, pulseCheckId]) @@map("pulse_questions") }
model PulseResponse { id String @id @default(uuid()) tenantId String segmentId String pulseCheckId String userId String responses Json sentiment String? submittedAt DateTime @default(now()) @@index([tenantId, segmentId, pulseCheckId]) @@map("pulse_responses") }

// Scheduled check-ins (cron-driven async surveys)
model ScheduledCheckIn { id String @id @default(uuid()) tenantId String segmentId String name String description String? frequency CheckInFrequency dayOfWeek Int? dayOfMonth Int? time String timezone String @default("UTC") participants Json questions Json metricsToInclude Json isActive Boolean @default(true) lastSentAt DateTime? nextScheduledAt DateTime? createdBy String @@index([tenantId, segmentId, isActive, nextScheduledAt]) @@map("scheduled_check_ins") }
model CheckInResponse  { id String @id @default(uuid()) tenantId String segmentId String checkInId String userId String responses Json sentiment String? submittedAt DateTime @default(now()) @@index([tenantId, segmentId, checkInId]) @@map("check_in_responses") }

// Scorecards
model Scorecard         { id String @id @default(uuid()) tenantId String segmentId String name String description String? category ScorecardCategory isActive Boolean @default(true) createdBy String @@index([tenantId, segmentId, category]) @@map("scorecards") }
model ScorecardMetric   { id String @id @default(uuid()) tenantId String segmentId String scorecardId String name String description String? unit String? targetValue Float? order Int @@index([tenantId, segmentId, scorecardId]) @@map("scorecard_metrics") }
model ScorecardSnapshot { id String @id @default(uuid()) tenantId String segmentId String scorecardId String period DateTime values Json notes String? createdBy String @@index([tenantId, segmentId, scorecardId, period]) @@map("scorecard_snapshots") }

// Weekly syncs
model StartupSync    { id String @id @default(uuid()) tenantId String segmentId String title String scheduledDate DateTime duration Int @default(60) status SyncStatus @default(SCHEDULED) meetingLink String? participants Json createdBy String @@index([tenantId, segmentId, scheduledDate]) @@map("startup_syncs") }
model SyncAgendaItem { id String @id @default(uuid()) tenantId String segmentId String syncId String title String description String? duration Int? order Int status String @default("PENDING") @@index([tenantId, segmentId, syncId, order]) @@map("sync_agenda_items") }
model SyncMetric     { id String @id @default(uuid()) tenantId String segmentId String syncId String metricName String value Float unit String? trend String? notes String? @@index([tenantId, segmentId, syncId]) @@map("sync_metrics") }

// Meeting intelligence (transcripts → summary/action items)
model MeetingTranscript { id String @id @default(uuid()) tenantId String segmentId String meetingId String meetingType String transcript String summary String? keyPoints Json? actionItems Json? decisions Json? participants Json duration Int? recordedAt DateTime processedAt DateTime? @@index([tenantId, segmentId, meetingType, recordedAt]) @@map("meeting_transcripts") }

// Workflow automation (onboarding/offboarding/PTO/promotions)
model WorkflowTrigger   { id String @id @default(uuid()) tenantId String segmentId String name String description? String triggerType WorkflowTriggerType conditions Json isActive Boolean @default(true) lastTriggeredAt DateTime? createdBy String @@index([tenantId, segmentId, isActive]) @@map("workflow_triggers") }
model WorkflowAction    { id String @id @default(uuid()) tenantId String segmentId String triggerId String actionType WorkflowActionType config Json order Int isActive Boolean @default(true) @@index([tenantId, segmentId, triggerId, order]) @@map("workflow_actions") }
model WorkflowExecution { id String @id @default(uuid()) tenantId String segmentId String triggerId String status WorkflowExecutionStatus startedAt DateTime @default(now()) completedAt DateTime? results Json? errorMessage String? @@index([tenantId, segmentId, triggerId, startedAt]) @@map("workflow_executions") }

// Integrations
model CalendarIntegration { id String @id @default(uuid()) tenantId String segmentId String userId String provider CalendarProvider accessToken String refreshToken String? expiresAt DateTime? calendarId String? syncEnabled Boolean @default(true) lastSyncAt DateTime? settings Json? @@unique([tenantId, segmentId, userId, provider]) @@map("calendar_integrations") }
model CalendarEvent       { id String @id @default(uuid()) tenantId String segmentId String integrationId String? externalId String? title String description String? startTime DateTime endTime DateTime location String? meetingUrl String? attendees Json? entityType String? entityId String? reminderMinutes Int? isRecurring Boolean @default(false) recurrenceRule String? createdBy String @@index([tenantId, segmentId, startTime]) @@index([tenantId, segmentId, entityType, entityId]) @@map("calendar_events") }
model SlackIntegration    { id String @id @default(uuid()) tenantId String segmentId String teamId String accessToken String botUserId String? webhookUrl String? channelId String? isActive Boolean @default(true) settings Json? installedBy String lastUsedAt DateTime? @@unique([tenantId, segmentId]) @@map("slack_integrations") }

// Canonical cross-source action item
model ActionItem {
  id String @id @default(uuid())
  tenantId String; segmentId String; teamId String?
  title String; description String?
  status ActionItemStatus @default(TO_DO); priority ActionItemPriority @default(MEDIUM)
  assigneeId String?; assigneeName String?; dueDate DateTime?; completedAt DateTime?
  createdBy String
  sourceType String?                                          // ONE_ON_ONE|MEETING|SYNC|MILESTONE|REVIEW|INTERVIEW|MANUAL  ([NEW] INTERVIEW)
  transcriptId String?; oneOnOneId String?; syncId String?; milestoneId String?; reviewId String?; interviewId String?
  linkedEntityType String?; linkedEntityId String?
  @@index([tenantId, segmentId, status])
  @@index([tenantId, segmentId, sourceType])
  @@map("action_items")
}

// ── Interview / meeting scheduling (the Bookings cluster, rebadged) ────────────────
model BookingHost                  { id String @id @default(uuid()) tenantId String segmentId String userId String displayName String handle String @unique headline String? bio String? avatarUrl String? timezone String @default("UTC") stripeConnectAccountId String? payoutCurrency String @default("usd") platformFeeBps Int @default(500) confirmedKycAt DateTime? isActive Boolean @default(true) @@unique([tenantId, segmentId, userId]) @@map("booking_hosts") }
model BookingService              { id String @id @default(uuid()) tenantId String segmentId String hostId String name String slug String durationMinutes Int priceCents Int currency String @default("usd") descriptionMd String? videoConferenceLink String? bufferBeforeMinutes Int @default(0) bufferAfterMinutes Int @default(0) isActive Boolean @default(true) @@unique([hostId, slug]) @@index([tenantId, segmentId]) @@map("booking_services") }
model BookingAvailabilityRule     { id String @id @default(uuid()) tenantId String segmentId String hostId String weekday Int startTimeLocal String endTimeLocal String effectiveFromDate DateTime @default(now()) effectiveUntilDate DateTime? @@index([hostId, weekday]) @@map("booking_availability_rules") }
model BookingAvailabilityOverride { id String @id @default(uuid()) tenantId String segmentId String hostId String dateLocal DateTime startTimeLocal String endTimeLocal String kind String reason String? @@index([hostId, dateLocal]) @@map("booking_availability_overrides") }
model BookingExternalCalendarLink { id String @id @default(uuid()) tenantId String segmentId String hostId String provider String accessToken String refreshToken String? expiresAt DateTime? externalAccountEmail String? lastSyncedAt DateTime? syncCursor String? @@unique([hostId, provider, externalAccountEmail]) @@map("booking_external_calendar_links") }
model BookingReservation          { id String @id @default(uuid()) tenantId String segmentId String hostId String serviceId String slotStartUtc DateTime slotEndUtc DateTime bookerEmail String bookerName String bookerPhone String? bookerNotes String? status String @default("pending_payment") magicLinkToken String @unique stripePaymentIntentId String? stripeTransferId String? amountCents Int @default(0) platformFeeCents Int @default(0) currency String @default("usd") confirmedAt DateTime? cancelledAt DateTime? cancellationReason String? completedAt DateTime? externalCalendarEventId String? candidateId String? interviewId String? @@index([hostId, slotStartUtc]) @@index([tenantId, segmentId]) @@map("booking_reservations") }
model BookingComment             { id String @id @default(uuid()) tenantId String segmentId String reservationId String authorKind String authorUserId String? authorEmail String? bodyMd String @@index([reservationId, createdAt]) @@map("booking_comments") }
model BookingPayoutRecord        { id String @id @default(uuid()) tenantId String segmentId String reservationId String stripeTransferId String? netAmountCents Int feeAmountCents Int currency String @default("usd") payoutStatus String @default("pending") transferredAt DateTime? failureReason String? @@index([reservationId]) @@map("booking_payout_records") }
model BookingWebhookSubscription { id String @id @default(uuid()) tenantId String segmentId String hostId String? eventType String targetUrl String signingSecret String isActive Boolean @default(true) @@index([tenantId, segmentId]) @@map("booking_webhook_subscriptions") }

enum ObjectiveCategory { STRATEGIC OPERATIONAL FINANCIAL TALENT CUSTOMER PRODUCT MARKET REVENUE TEAM FUNDRAISING }  // union
enum ObjectiveTimeframe { QUARTERLY ANNUAL MULTI_YEAR }
enum ObjectiveStatus    { ACTIVE COMPLETED ARCHIVED CANCELLED ON_HOLD }
enum OutcomeStatus      { NOT_STARTED IN_PROGRESS AT_RISK COMPLETED }
enum MilestoneStatus    { PENDING IN_PROGRESS COMPLETED MISSED }
enum PulseFrequency     { DAILY WEEKLY BIWEEKLY MONTHLY }
enum CheckInFrequency   { DAILY WEEKLY BIWEEKLY MONTHLY }
enum ScorecardCategory  { OKR KPI HEALTH TEAM PRODUCT FINANCIAL OPERATIONS SALES PMF ENGINEERING CUSTOMER FINANCE TEAM_HEALTH GROWTH }  // union of BE + FE
enum SyncStatus         { SCHEDULED IN_PROGRESS COMPLETED CANCELLED }
enum WorkflowTriggerType{ SCHEDULE EVENT CONDITION MILESTONE METRIC METRIC_THRESHOLD TIME_BASED EVENT_BASED MANUAL }  // union
enum WorkflowActionType { NOTIFY CREATE_TASK ESCALATE SEND_EMAIL SEND_NOTIFICATION UPDATE_METRIC TRIGGER_APPROVAL SLACK_MESSAGE CREATE_MEETING INTEGRATE }  // union
enum WorkflowExecutionStatus { PENDING RUNNING SUCCEEDED COMPLETED FAILED TIMEOUT CANCELLED }
enum CalendarProvider   { GOOGLE MICROSOFT OUTLOOK CALDAV APPLE }  // union
enum ActionItemStatus   { TO_DO PENDING IN_PROGRESS ON_HOLD_BLOCKED COMPLETED OVERDUE }
enum ActionItemPriority { LOW MEDIUM HIGH CRITICAL }
```

---

## 6. HR-Cost cluster (talent-cost — PRD doc 03)

These are the models that were **mis-filed under the CFO/BI** routes today. Per memory, the data
*is* CHRO. They move here and gain `(tenantId, segmentId)` scoping. The CFO consumes them over the
burn/runway seam (doc 05 §4.3) — it never owns them.

```prisma
model EmployeeTCOSettings   { id String @id @default(uuid()) tenantId String segmentId String @unique payrollTaxesPct Float @default(0.08) benefitsPct Float @default(0.25) perksPct Float @default(0.07) overheadPct Float @default(0.07) @@map("employee_tco_settings") }
model HeadcountPlan         { id String @id @default(uuid()) tenantId String segmentId String name String description String? startDate DateTime endDate DateTime fiscalYear String? totalHeadcount Int totalCost Float departmentBreakdown Json roleBreakdown Json status String @default("DRAFT") createdBy String @@index([tenantId, segmentId, status]) @@map("headcount_plans") }
model RoleDefinition        { id String @id @default(uuid()) tenantId String segmentId String title String department String level String baseSalary Float salaryRange Json benefits Float equity Float? description String? requirements Json isActive Boolean @default(true) @@index([tenantId, segmentId, isActive]) @@map("role_definitions") }
model CompensationStructure { id String @id @default(uuid()) tenantId String segmentId String roleId String location String baseSalary Float bonus Float? equity Float? benefits Float totalCompensation Float effectiveDate DateTime @@index([tenantId, segmentId, roleId]) @@map("compensation_structures") }
model HiringForecast        { id String @id @default(uuid()) tenantId String segmentId String roleId String department String plannedHireDate DateTime actualHireDate DateTime? recruitingCost Float onboardingCost Float rampTime Int status String @@index([tenantId, segmentId, plannedHireDate]) @@map("hiring_forecasts") }
model OnboardingCost        { id String @id @default(uuid()) tenantId String segmentId String roleId String equipmentCost Float trainingCost Float adminCost Float totalCost Float @@map("onboarding_costs") }
model RampTime              { id String @id @default(uuid()) tenantId String segmentId String roleId String department String averageRampMonths Int productivityCurve Json @@map("ramp_times") }
model TeamCapacityPlan      { id String @id @default(uuid()) tenantId String segmentId String teamId String period String periodStart DateTime periodEnd DateTime currentHeadcount Int plannedHeadcount Int currentCapacity Float plannedCapacity Float utilizationTarget Float @@index([tenantId, segmentId, teamId, periodStart]) @@map("team_capacity_plans") }
model HeadcountImpact       { id String @id @default(uuid()) tenantId String segmentId String hiringForecastId String monthlyBurnImpact Float runwayImpact Int revenueImpact Float? effectiveDate DateTime @@index([tenantId, segmentId, effectiveDate]) @@map("headcount_impacts") }

// PTO / leave (was the SQL-only pto_requests, employee_name free-text → FK-keyed here)
model PtoRequest { id String @id @default(uuid()) tenantId String segmentId String employeeId String type PtoType @default(VACATION) startDate DateTime endDate DateTime days Decimal @db.Decimal(4,1) @default(1) status PtoStatus @default(PENDING) notes String? @@index([tenantId, segmentId, employeeId]) @@index([tenantId, segmentId, status]) @@map("pto_requests") }

enum PtoType   { VACATION SICK PARENTAL BEREAVEMENT UNPAID }
enum PtoStatus { PENDING APPROVED REJECTED }
```

> **Legacy SQL-only tables — no Prisma model exists today.** `job_openings`, `candidates`,
> `payroll_records`, and `pto_requests` were created by migration `20260327000001_add_hr_legal_ops_comms`
> as raw SQL with **no Prisma model**. hired.video makes them **first-class models** with proper
> `(tenantId, segmentId)` scoping. `payroll_records`' free-text `employee_name` is replaced by
> `Employee.id` (its comp fields fold into `Employee` §4.1); `candidates`/`job_openings` are
> redesigned as the recruiting graph (§7). Logged in the hired.video gap register.

---

## 7. [NEW] Recruiting & Video Interview entities (PRD doc 04)

These power decision 2 (video-first talent acquisition). Full PRD in doc 04.

```prisma
// A role being hired for. Supersedes the bare job_openings table.
model JobRequisition {
  id String @id @default(uuid())
  tenantId String; segmentId String
  title String
  department String?
  location String?
  employmentType EmploymentType @default(FULL_TIME)
  status JobStatus @default(DRAFT)               // DRAFT|OPEN|PAUSED|CLOSED|FILLED
  description String?
  requirements Json?                              // structured must-have / nice-to-have
  salaryMin Int?; salaryMax Int?; currency String @default("usd")
  hiringManagerId String?                         // hired.video userId
  roleDefinitionId String?                        // → RoleDefinition (comp band)
  headcountForecastId String?                     // → HiringForecast (close the plan→hire loop)
  pipelineStages Json                             // ordered custom stage list (defaults below)
  careersPagePublished Boolean @default(false)
  publicSlug String?                              // for the public careers page
  createdBy String
  @@index([tenantId, segmentId, status])
  @@map("job_requisitions")
}
enum JobStatus { DRAFT OPEN PAUSED CLOSED FILLED }

// A person in a hiring pipeline. First-class recruiting entity (NOT identity-cache).
model Candidate {
  id String @id @default(uuid())
  tenantId String; segmentId String
  jobRequisitionId String?
  name String
  email String?
  phone String?
  stage CandidateStage @default(APPLIED)
  source String?                                  // INBOUND|SOURCED|REFERRAL|AGENCY|CAREERS_PAGE
  resumeUrl String?                               // stored object (Segment-scoped, encrypted)
  parsedResume Json?                              // [NEW] AI resume-parse output (skills, history, education)
  linkedinUrl String?
  // Link to hired.video's native contacts graph (sourcing/enrichment — doc 05 §4.2)
  contactId String?                               // → contacts.id (api/drizzle/0493_contacts_graph.sql)
  fitScore Float?                                 // [NEW] AI ICP/role-fit score 0–100
  fitRationale Json?                              // [NEW] AI explanation + signals
  notes String?
  rejectionReason String?
  // On hire, links to the created Employee (§4.1 convertedFromCandidateId points back)
  convertedToEmployeeId String?
  createdAt DateTime @default(now()); updatedAt DateTime @updatedAt
  @@index([tenantId, segmentId, jobRequisitionId, stage])
  @@index([tenantId, segmentId, stage])
  @@map("candidates")
}
enum CandidateStage { APPLIED SCREENING PHONE_INTERVIEW TECHNICAL FINAL_INTERVIEW OFFER OFFERED HIRED REJECTED WITHDRAWN }  // union of FE + BE

// A video interview — async (recorded) or live.
model Interview {
  id String @id @default(uuid())
  tenantId String; segmentId String
  candidateId String
  jobRequisitionId String?
  kind InterviewKind                              // ASYNC_VIDEO | LIVE_VIDEO | PHONE | IN_PERSON
  status InterviewStatus @default(INVITED)        // INVITED|IN_PROGRESS|SUBMITTED|COMPLETED|EXPIRED|CANCELLED
  // Async-video config
  questions Json?                                 // [{ id, prompt, maxSeconds, thinkSeconds }]
  // Scheduling (for live) — links to a BookingReservation
  reservationId String?
  scheduledStartUtc DateTime?
  // Candidate access
  magicLinkToken String @unique                   // candidate portal entry (doc 05 §2.4)
  invitedAt DateTime?; submittedAt DateTime?; expiresAt DateTime?
  // Panel
  interviewerIds Json?                            // hired.video userIds
  createdBy String
  createdAt DateTime @default(now()); updatedAt DateTime @updatedAt
  @@index([tenantId, segmentId, candidateId])
  @@index([tenantId, segmentId, status])
  @@map("interviews")
}
enum InterviewKind   { ASYNC_VIDEO LIVE_VIDEO PHONE IN_PERSON }
enum InterviewStatus { INVITED IN_PROGRESS SUBMITTED COMPLETED EXPIRED CANCELLED }

// A single recorded answer/clip within an async interview.
model InterviewRecording {
  id String @id @default(uuid())
  tenantId String; segmentId String
  interviewId String
  questionId String?
  videoUrl String                                 // Segment-scoped object store, encrypted at rest
  durationSeconds Int?
  transcript String?                              // [NEW] AI transcription
  transcriptStatus String @default("pending")     // pending|processing|done|failed
  aiAnalysis Json?                                // [NEW] sentiment, keyword, competency signals
  recordedAt DateTime @default(now())
  @@index([tenantId, segmentId, interviewId])
  @@map("interview_recordings")
}

// Structured interview scorecard (one per interviewer per interview).
model InterviewScorecard {
  id String @id @default(uuid())
  tenantId String; segmentId String
  interviewId String
  candidateId String
  interviewerId String                            // hired.video userId
  competencies Json                               // [{ key, label, rating, notes }]
  overallRating Float?
  recommendation ScorecardRecommendation?         // STRONG_NO|NO|MIXED|YES|STRONG_YES
  comments String?
  aiAssist Json?                                  // [NEW] AI-suggested ratings from the transcript
  submittedAt DateTime?
  @@unique([interviewId, interviewerId])
  @@index([tenantId, segmentId, candidateId])
  @@map("interview_scorecards")
}
enum ScorecardRecommendation { STRONG_NO NO MIXED YES STRONG_YES }

// Offer extended to a candidate (bridges recruiting → comp).
model Offer {
  id String @id @default(uuid())
  tenantId String; segmentId String
  candidateId String
  jobRequisitionId String?
  baseSalary Decimal @db.Decimal(14,2); currency String @default("usd")
  bonus Decimal? @db.Decimal(14,2)
  equityShares Int?; equityCliffMonths Int? @default(12); equityVestMonths Int? @default(48)
  startDate DateTime?
  status OfferStatus @default(DRAFT)              // DRAFT|SENT|ACCEPTED|DECLINED|RESCINDED|EXPIRED
  sentAt DateTime?; respondedAt DateTime?
  createdBy String
  @@index([tenantId, segmentId, candidateId])
  @@map("offers")
}
enum OfferStatus { DRAFT SENT ACCEPTED DECLINED RESCINDED EXPIRED }
```

---

## 8. AI use cases (extend the gateway registry)

hired.video reuses the existing `AI_USE_CASES` registry pattern (one map edit per use case) and the
**CHRO persona prompt** (verbatim from `routes/ai.ts`). Port the ops tools and add recruiting/
interview ones. All dispatch through `callAiAndCharge({ useCase, viewer, … })`, credit-metered,
vendor-hidden — hired.video's own AI facade over the Builderforce LLM gateway. The `viewer`/credit ledger is **per Segment**.

| Use case key | Purpose | tools | source / status |
|--------------|---------|-------|-----------------|
| `ops.employees.summary` | roster headcount/dept/rating summary | yes | port of `ops.employees.summary` |
| `ops.hiring_forecast.list` | planned hires (role, cost, ramp) | yes | port |
| `ops.headcount_plan.list` | active headcount plans + breakdowns | yes | port |
| `ops.performance_review.summary` | review completion + rating distribution | yes | port |
| `ops.one_on_one.cadence` | 1:1 frequency/attendance/sentiment | yes | port |
| `ops.review.draft` | draft a performance review / offer letter / termination script | no | CHRO persona deliverable |
| **`ats.resume.parse`** **[NEW]** | parse a resume → structured `parsedResume` | no | |
| **`ats.candidate.score`** **[NEW]** | score candidate fit vs requisition → `fitScore`/`fitRationale` | yes | reads requisition + graph |
| **`interview.transcribe`** **[NEW]** | transcribe an `InterviewRecording` | no | speech-to-text |
| **`interview.analyze`** **[NEW]** | competency signals + summary from transcript | no | |
| **`interview.scorecard.assist`** **[NEW]** | suggest scorecard ratings from transcript | no | feeds `InterviewScorecard.aiAssist` |
| **`interview.questions.generate`** **[NEW]** | generate role-specific interview questions | no | |

---

## 9. Entity-relationship summary

```
Tenant 1──* Segment 1──* { every business entity }

Employee ──managerId──► Employee (org tree)
Employee 1──* Goal | PerformanceReview | OneOnOneSession (supervisor/participant) | PtoRequest
Employee ──convertedFromCandidateId──► Candidate          (hire path)

StrategicObjective 1──* ObjectiveOutcome | ObjectiveMilestone ;  Objective ──◄ CompanyMilestone.objectiveId
Goal ──milestoneId──► CompanyMilestone
PulseCheck 1──* PulseQuestion | PulseResponse ;  ScheduledCheckIn 1──* CheckInResponse
Scorecard 1──* ScorecardMetric | ScorecardSnapshot
StartupSync 1──* SyncAgendaItem | SyncMetric
WorkflowTrigger 1──* WorkflowAction | WorkflowExecution
ActionItem ──{oneOnOneId|syncId|milestoneId|reviewId|interviewId}──► source

HeadcountPlan ── roleBreakdown ;  HiringForecast 1──1 HeadcountImpact ;  RoleDefinition 1──* CompensationStructure
HiringForecast ──◄ JobRequisition.headcountForecastId          (plan→hire loop)

JobRequisition 1──* Candidate ;  Candidate 1──* Interview 1──* InterviewRecording
Interview 1──* InterviewScorecard ;  Candidate 1──* Offer ;  Offer──►Employee (on accept)
Interview ──reservationId──► BookingReservation (live scheduling)
BookingHost 1──* BookingService | BookingAvailabilityRule | BookingReservation
```
