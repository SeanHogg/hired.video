/**
 * People Operations (CHRO) domain SSoT — enums shared by the API CHECK
 * constraints, the Zod request schemas, and the frontend. One vocabulary,
 * so the DB / backend / frontend can't drift.
 *
 * This is the foundation of the embeddable, multi-tenant CHRO product:
 * every business row carries (tenant_id, segment_id) and is resolved
 * through `resolveSegment()` before any data is touched. See
 * specs/hired-video/01-domain-model.md (the Tenant→Segment→Entity model)
 * and 02-prd-people-operations.md.
 *
 * Employment type is NOT redeclared here — it reuses the existing
 * canonical vocabulary in `shared/employment-types.ts` so the CHRO roster
 * and the public job board speak the same language.
 */

// ── Tenancy ──────────────────────────────────────────────────────────────
/** A consumer of the CHRO product. The native hired.video product is the
 *  `self` tenant; external embedders (e.g. BurnRateOS) get `embedded`. */
export const TENANT_KINDS = ["self", "embedded", "direct"] as const;
export type TenantKind = (typeof TENANT_KINDS)[number];

export const TENANT_STATUSES = ["active", "suspended"] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

/** The isolation unit inside a tenant. For a native employer there is one
 *  segment per hired.video company. */
export const SEGMENT_STATUSES = ["active", "suspended", "archived"] as const;
export type SegmentStatus = (typeof SEGMENT_STATUSES)[number];

// ── Employee spine ─────────────────────────────────────────────────────────
export const EMPLOYEE_STATUSES = [
  "active",
  "inactive",
  "on_leave",
  "terminated",
] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export const EMPLOYEE_STATUS_LABELS: Record<EmployeeStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  on_leave: "On Leave",
  terminated: "Terminated",
};

// ── 1-on-1 sessions ─────────────────────────────────────────────────────────
export const ONE_ON_ONE_STATUSES = [
  "scheduled",
  "completed",
  "cancelled",
  "rescheduled",
] as const;
export type OneOnOneStatus = (typeof ONE_ON_ONE_STATUSES)[number];

export const MEETING_TYPES = ["video", "phone", "in_person", "hybrid"] as const;
export type MeetingType = (typeof MEETING_TYPES)[number];

/** A single agenda line on a 1:1. Stored as an ordered JSON array on the
 *  session row (index-addressed CRUD — see PO-2). */
export interface OneOnOneAgendaItem {
  title: string;
  description?: string;
  status: "pending" | "discussed" | "deferred";
  order: number;
}

// ── Canonical cross-source action item ───────────────────────────────────────
export const ACTION_ITEM_STATUSES = [
  "to_do",
  "in_progress",
  "on_hold",
  "completed",
  "cancelled",
] as const;
export type ActionItemStatus = (typeof ACTION_ITEM_STATUSES)[number];

export const ACTION_ITEM_PRIORITIES = ["low", "medium", "high", "critical"] as const;
export type ActionItemPriority = (typeof ACTION_ITEM_PRIORITIES)[number];

/** What surfaced an action item. INTERVIEW / SYNC / MILESTONE / REVIEW
 *  land in later phases; ONE_ON_ONE + MANUAL ship in phase 1. */
export const ACTION_ITEM_SOURCES = [
  "one_on_one",
  "meeting",
  "sync",
  "milestone",
  "review",
  "interview",
  "manual",
] as const;
export type ActionItemSource = (typeof ACTION_ITEM_SOURCES)[number];

// ── Goals / OKRs (PO-4) ──────────────────────────────────────────────────────
export const GOAL_STATUSES = [
  "not_started",
  "in_progress",
  "completed",
  "on_hold",
  "blocked",
  "cancelled",
  "at_risk",
] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
  on_hold: "On hold",
  blocked: "Blocked",
  cancelled: "Cancelled",
  at_risk: "At risk",
};

export const GOAL_PRIORITIES = ["low", "medium", "high", "critical"] as const;
export type GoalPriority = (typeof GOAL_PRIORITIES)[number];

/** A single key result on a goal (stored as an ordered JSON array). */
export interface KeyResult {
  id: string;
  description: string;
  progress: number; // 0–100
  targetValue?: number;
  currentValue?: number;
  unit?: string;
}

// ── Strategic Objectives & Milestones (PO-5) ─────────────────────────────────
export const OBJECTIVE_CATEGORIES = [
  "strategic", "operational", "financial", "talent", "customer", "product", "market", "revenue", "team", "fundraising",
] as const;
export type ObjectiveCategory = (typeof OBJECTIVE_CATEGORIES)[number];
export const OBJECTIVE_TIMEFRAMES = ["quarterly", "annual", "multi_year"] as const;
export type ObjectiveTimeframe = (typeof OBJECTIVE_TIMEFRAMES)[number];
export const OBJECTIVE_STATUSES = ["active", "completed", "archived", "cancelled", "on_hold"] as const;
export type ObjectiveStatus = (typeof OBJECTIVE_STATUSES)[number];
export const OUTCOME_STATUSES = ["not_started", "in_progress", "at_risk", "completed"] as const;
export type OutcomeStatus = (typeof OUTCOME_STATUSES)[number];
export const MILESTONE_STATUSES = ["pending", "in_progress", "completed", "missed"] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];
export const COMPANY_MILESTONE_CATEGORIES = [
  "product", "revenue", "funding", "team", "customer", "operational", "partnership", "compliance",
] as const;
export type CompanyMilestoneCategory = (typeof COMPANY_MILESTONE_CATEGORIES)[number];
export const COMPANY_MILESTONE_STATUSES = [
  "not_started", "in_progress", "completed", "missed", "at_risk", "cancelled",
] as const;
export type CompanyMilestoneStatus = (typeof COMPANY_MILESTONE_STATUSES)[number];

// ── Pulse Checks & Scheduled Check-ins (PO-6) ────────────────────────────────
export const PULSE_FREQUENCIES = ["daily", "weekly", "biweekly", "monthly"] as const;
export type PulseFrequency = (typeof PULSE_FREQUENCIES)[number];
export const PULSE_QUESTION_TYPES = ["text", "rating", "multiple_choice", "yes_no"] as const;
export type PulseQuestionType = (typeof PULSE_QUESTION_TYPES)[number];
export interface PulseQuestionDef {
  id: string;
  question: string;
  type: PulseQuestionType;
  options?: string[];
  required?: boolean;
}

// ── Weekly Syncs & Scorecards (PO-7) ─────────────────────────────────────────
export const SYNC_STATUSES = ["scheduled", "in_progress", "completed", "cancelled"] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];
export const SCORECARD_CATEGORIES = [
  "okr", "kpi", "health", "team", "product", "financial", "operations", "sales", "pmf", "engineering", "customer", "growth",
] as const;
export type ScorecardCategory = (typeof SCORECARD_CATEGORIES)[number];

// ── Workflow Automation (PO-10) ──────────────────────────────────────────────
export const WORKFLOW_TRIGGER_TYPES = ["schedule", "event", "condition", "milestone", "metric", "manual"] as const;
export type WorkflowTriggerType = (typeof WORKFLOW_TRIGGER_TYPES)[number];
export const WORKFLOW_ACTION_TYPES = [
  "notify", "create_task", "escalate", "send_email", "send_notification", "slack_message", "create_meeting",
] as const;
export type WorkflowActionType = (typeof WORKFLOW_ACTION_TYPES)[number];
export const WORKFLOW_EXECUTION_STATUSES = ["pending", "running", "succeeded", "failed", "cancelled"] as const;
export type WorkflowExecutionStatus = (typeof WORKFLOW_EXECUTION_STATUSES)[number];

// ── Talent-cost: TCO / Headcount / PTO (TA-4/5/6) ────────────────────────────
export const PTO_TYPES = ["vacation", "sick", "parental", "bereavement", "unpaid"] as const;
export type PtoType = (typeof PTO_TYPES)[number];
export const PTO_STATUSES = ["pending", "approved", "rejected"] as const;
export type PtoStatus = (typeof PTO_STATUSES)[number];

/** Default per-segment TCO assumptions (TA-4) — match the source's 8/25/7/7%. */
export const DEFAULT_TCO_ASSUMPTIONS = {
  payrollTaxesPct: 0.08,
  benefitsPct: 0.25,
  perksPct: 0.07,
  overheadPct: 0.07,
} as const;
