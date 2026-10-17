/**
 * Shared lifecycle status vocabularies (W3-D2, architecture remediation
 * 2026-10-17). One lowercase set per lifecycle column; the matching SQL
 * CHECK constraints (migration 0620/0621) and the Drizzle `check()`
 * declarations list exactly these values — pinned by
 * api/src/db/__tests__/status-vocabulary-schema.test.ts.
 *
 * Rules:
 *   - Stored values are lowercase snake_case. Display labels come from i18n
 *     (`statusLabelKey`), never from the stored value.
 *   - Writers parse untrusted input through `parseStatus`, so a bad value
 *     falls back instead of tripping the CHECK.
 *   - Other domains keep their own registries (shared/recruiter-pipeline.ts
 *     for pipeline stages, shared/candidate-video-consent.ts, …); this file
 *     owns the columns that drifted in casing.
 */

/** user_connections.status — a connection request's lifecycle. */
export const CONNECTION_STATUSES = ["pending", "accepted", "rejected"] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

/**
 * job_applications.status — the ONE seeker-side application lifecycle
 * (W3-D2 item 2). `saved_jobs` is the bookmark only; the tracker's
 * "tracked" state is derived (saved, no application row) and is not stored.
 */
export const APPLICATION_STATUSES = [
  "applied",
  "interviewing",
  "offered",
  "accepted",
  "rejected",
  "withdrawn",
  "declined",
  "cancelled",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** The tracker (saved-jobs) lifecycle the seeker sees: `tracked` + the
 *  application lifecycle. `tracked` is derived, never stored. */
export const TRACKER_STATUSES = ["tracked", ...APPLICATION_STATUSES] as const;
export type TrackerStatus = (typeof TRACKER_STATUSES)[number];

/** candidate_submissions.status — recruiter → client submission lifecycle.
 *  Distinct from the application (an agency submits a candidate to a
 *  client's job; the candidate may never have applied). */
export const SUBMISSION_STATUSES = [
  "submitted",
  "reviewed",
  "screening",
  "interviewing",
  "offer",
  "placed",
  "rejected",
  "withdrawn",
] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

/** Legacy free-text submission statuses → canonical (migration 0620 applies
 *  the same map to stored rows; writers apply it to incoming bodies). */
export const LEGACY_SUBMISSION_STATUS_MAP: Readonly<Record<string, SubmissionStatus>> = {
  reviewing: "reviewed",
  "phone screen": "screening",
  interview: "interviewing",
  "technical interview": "interviewing",
  "final interview": "interviewing",
  "offer extended": "offer",
  offered: "offer",
  accepted: "placed",
  started: "placed",
  hired: "placed",
};

/** placements.commission_status — the commission payout lifecycle. */
export const COMMISSION_STATUSES = ["pending", "invoiced", "paid", "cancelled"] as const;
export type CommissionStatus = (typeof COMMISSION_STATUSES)[number];

/** videos.status — the rendered-video file lifecycle. */
export const VIDEO_STATUSES = ["queued", "processing", "completed", "failed"] as const;
export type VideoStatus = (typeof VIDEO_STATUSES)[number];

/** True when `value` is a member of `set`. */
export function isStatus<T extends string>(set: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (set as readonly string[]).includes(value);
}

/**
 * Normalise untrusted input to a member of `set`: trims, lowercases, applies
 * `legacy` aliases, and returns `fallback` for anything else.
 */
export function parseStatus<T extends string>(
  set: readonly T[],
  raw: unknown,
  fallback: T,
  legacy: Readonly<Record<string, T>> = {},
): T {
  if (typeof raw !== "string") return fallback;
  const v = raw.trim().toLowerCase();
  if (isStatus(set, v)) return v;
  return legacy[v] ?? fallback;
}

/** i18n key for a status badge: `status.<domain>.<value>`. */
export function statusLabelKey(domain: "connection" | "application" | "submission" | "commission" | "video", value: string): string {
  return `status.${domain}.${value}`;
}
