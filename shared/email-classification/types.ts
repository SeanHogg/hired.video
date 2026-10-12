/**
 * Provider-agnostic email shape — used by every layer of the sync
 * pipeline (Gmail/Outlook fetch wrappers, Stage-1 deterministic rules,
 * Stage-2 LLM classifier, server-side ingest persistence).
 *
 * Lives in `shared/` so the client-driven sync (PWA) and the
 * server-driven sync (cron / manual /sync/now) can agree on one
 * normalisation contract — no drift between "what the browser
 * normalises from gmail.googleapis.com" and "what the API ingests".
 */

/** Minimal text-shape the Stage-1 deterministic classifier needs.
 *  Concrete provider rows (server `NormalisedEmail` with `receivedAt:
 *  Date`, wire-shape `NormalisedEmailWire` with `receivedAt: string`)
 *  both satisfy this. Keeping it tight means the rules engine can be
 *  fed by any source without forcing every caller to materialise a
 *  full Date object. */
export interface ClassifierInput {
  fromEmail: string;
  fromName?: string | null;
  subject: string;
  snippet?: string;
  bodyHtml?: string | null;
  bodyText?: string | null;
}

/** Wire shape used by the client → server ingest endpoint. The browser
 *  produces this; the server persists it (converting `receivedAt` to a
 *  Date at the DB boundary). The server-side `NormalisedEmail` in
 *  `api/src/services/email-integration/providers/types.ts` is a
 *  superset (uses `Date` for `receivedAt`). */
export interface NormalisedEmailWire extends ClassifierInput {
  providerMessageId: string;
  providerThreadId: string | null;
  fromEmail: string;
  fromName: string | null;
  subject: string;
  snippet: string;
  bodyHtml: string | null;
  bodyText: string | null;
  /** ISO 8601 string — durable across the wire. */
  receivedAt: string;
  /** Headers + label/folder ids the classifier may consult. */
  rawMetadata: Record<string, unknown>;
}

export interface DeltaPullResultWire {
  messages: NormalisedEmailWire[];
  /** New cursor to persist on the account row — Gmail historyId or
   *  Outlook deltaLink. Null = nothing changed; keep the old cursor. */
  nextCursor: string | null;
}

export type EmailCategory =
  | "job_opportunity"
  | "application_status"
  | "recruiter_outreach"
  | "interview_invite"
  | "offer"
  | "rejection"
  | "newsletter"
  | "spam"
  | "personal"
  | "other";

export interface ClassificationResult {
  /** A category KEY from the active profile's taxonomy. Kept as `string`
   *  (not the legacy `EmailCategory` union) because the taxonomy is now
   *  profile-driven — recruiter presets add `new_requisition`,
   *  `candidate_reply`, etc. The legacy union still types the Job Hunter
   *  preset + `isJobCategory`. */
  category: string;
  score: number;
  source: "user_rule" | "default_rule" | "llm";
  ruleName?: string;
  /** Optional L1 structured extraction pulled by the Stage-2 prompt when
   *  the profile defines an `extractSchema`. Null/absent for Job Hunter. */
  extracted?: Record<string, unknown> | null;
}

/** Job-related categories — single source of truth for inbox visibility.
 *  Anything outside this set (newsletter / spam / personal / other) is
 *  kept in the table but hidden from the inbox feed. */
export const JOB_INBOX_CATEGORIES: readonly EmailCategory[] = [
  "job_opportunity",
  "application_status",
  "recruiter_outreach",
  "interview_invite",
  "offer",
  "rejection",
];

export function isJobCategory(c: EmailCategory): boolean {
  return JOB_INBOX_CATEGORIES.includes(c);
}
