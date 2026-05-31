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
