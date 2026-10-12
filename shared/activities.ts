/**
 * Paid activities — shared enums + DTOs for the "assign a compensated task to
 * a hired person" loop (hire → assign activity → track/submit → approve → pay).
 *
 * A paid activity is a `tasks` row owned by the worker (`userId`) with a pay
 * model attached. The employer who assigned it is `assignedByUserId`; the
 * company context is `companyId`. Two pay models:
 *   - hourly: worker logs time against the activity; approval accrues
 *     round(hours × rateCents).
 *   - fixed:  approval accrues amountCents once, paid-on-completion.
 *
 * The approval state machine mirrors timesheets (assigned → submitted →
 * approved | rejected). On approve the worker is credited via
 * PayoutLedgerService (source_kind='task'), so payout rides the same rails as
 * gigs + workforce timesheets. Single source of truth for both API + UI so the
 * two never drift (DRY).
 */

export const ACTIVITY_PAY_TYPES = ["hourly", "fixed"] as const;
export type ActivityPayType = (typeof ACTIVITY_PAY_TYPES)[number];

export const ACTIVITY_STATUSES = ["assigned", "submitted", "approved", "rejected"] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

/** Statuses an employer can still act on (approve / reject) vs. terminal. */
export const ACTIVITY_ACTIONABLE_STATUSES: ActivityStatus[] = ["submitted"];
export const ACTIVITY_TERMINAL_STATUSES: ActivityStatus[] = ["approved"];

export function isActivityPayType(v: unknown): v is ActivityPayType {
  return typeof v === "string" && (ACTIVITY_PAY_TYPES as readonly string[]).includes(v);
}

export function isActivityStatus(v: unknown): v is ActivityStatus {
  return typeof v === "string" && (ACTIVITY_STATUSES as readonly string[]).includes(v);
}

/** Employer's input when assigning an activity. `title` doubles as the
 *  message to the worker ("do this"); `description` carries the detail. */
export interface AssignActivityInput {
  workerUserId: string;
  companyId?: string;
  title: string;
  description?: string;
  payType: ActivityPayType;
  /** Hourly rate in minor units — required when payType='hourly'. */
  rateCents?: number;
  /** Fixed price in minor units — required when payType='fixed'. */
  amountCents?: number;
  currency?: string;
  /** ISO date — optional soft deadline surfaced to the worker. */
  dueDate?: string | null;
}

/** One paid activity as seen by worker + employer surfaces. */
export interface ActivityDTO {
  id: string;
  title: string;
  description?: string;
  workerUserId: string;
  workerName?: string;
  assignedByUserId?: string;
  companyId?: string;
  payType: ActivityPayType;
  rateCents?: number;
  amountCents?: number;
  currency: string;
  status: ActivityStatus;
  /** Total tracked seconds against this activity (hourly only). */
  trackedSec: number;
  /** What the worker will earn on approval, in minor units. For hourly this
   *  is derived from trackedSec × rateCents; for fixed it's amountCents.
   *  After approval this is the amount actually accrued. */
  earnedCents: number;
  dueDate?: string | null;
  submittedAt?: string | null;
  approvedAt?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A person an employer may assign activities to (hired candidate or
 *  existing employee), for the assign dialog's worker picker. */
export interface AssignableWorkerDTO {
  userId: string;
  name: string;
  email?: string;
  companyId: string;
  companyName?: string;
  /** Where the relationship came from — 'hired' pipeline entry or existing
   *  workforce 'employee' association. */
  source: "hired" | "employee";
}

/**
 * Compute what a paid activity is worth right now (minor units). Pure so the
 * API accrual math and the UI's "you'll earn" preview share ONE implementation
 * and can't drift. Hourly = round(trackedSec / 3600 × rateCents); fixed =
 * amountCents. Never negative.
 */
export function computeActivityEarnedCents(input: {
  payType: ActivityPayType;
  rateCents?: number | null;
  amountCents?: number | null;
  trackedSec?: number | null;
}): number {
  if (input.payType === "fixed") {
    return Math.max(0, Math.round(input.amountCents ?? 0));
  }
  const hours = Math.max(0, input.trackedSec ?? 0) / 3600;
  const rate = Math.max(0, input.rateCents ?? 0);
  return Math.max(0, Math.round(hours * rate));
}
