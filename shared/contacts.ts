/**
 * Contacts graph — shared registry + pure rules (hired.video-native).
 *
 * A contact is a person an account owner knows about who may or may not be
 * a platform user (recruiter you emailed, a sourcing lead, a referral).
 * Storage: `contacts` + `contact_job_links` (migration 0493). These enums are
 * the SSoT for the CHECK constraints, the API validators and the UI.
 */

export const CONTACT_LIFECYCLES = ["contact", "lead"] as const;
export type ContactLifecycle = (typeof CONTACT_LIFECYCLES)[number];

export const CONTACT_SOURCES = ["manual", "inbox", "enrichment", "sourcing"] as const;
export type ContactSource = (typeof CONTACT_SOURCES)[number];

/** Pipeline stage of a contact against one of the owner's jobs. */
export const CONTACT_JOB_STAGES = ["sourced", "contacted", "replied", "interviewing", "offer", "hired", "rejected"] as const;
export type ContactJobStage = (typeof CONTACT_JOB_STAGES)[number];

export const MERGE_QUEUE_STATUSES = ["pending", "approved", "rejected", "merged", "expired"] as const;
export type MergeQueueStatus = (typeof MERGE_QUEUE_STATUSES)[number];

export const MERGE_POLICY_MODES = ["auto", "review"] as const;
export type MergePolicyMode = (typeof MERGE_POLICY_MODES)[number];

/** Used when the owner has no `workspace_person_merge_policy` row. */
export const DEFAULT_MERGE_POLICY: { mode: MergePolicyMode; autoThresholdBps: number } = {
  mode: "auto",
  autoThresholdBps: 9500,
};

/** Below this a pair is not considered a duplicate at all. */
export const MIN_DUPLICATE_CONFIDENCE_BPS = 8000;

/** Fields the duplicate scorer reads. */
export interface ContactIdentity {
  email?: string | null;
  fullName?: string | null;
  company?: string | null;
  phone?: string | null;
  linkedinUrl?: string | null;
}

const FREE_MAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "outlook.com", "hotmail.com", "live.com",
  "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "gmx.com",
]);

export function normalizeEmail(email: string | null | undefined): string | null {
  const v = email?.trim().toLowerCase();
  return v && v.includes("@") ? v : null;
}

function normText(v: string | null | undefined): string | null {
  const s = v?.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return s ? s : null;
}

function normPhone(v: string | null | undefined): string | null {
  const digits = v?.replace(/\D+/g, "") ?? "";
  return digits.length >= 7 ? digits.slice(-10) : null;
}

function normLinkedIn(v: string | null | undefined): string | null {
  const m = v?.toLowerCase().match(/linkedin\.com\/in\/([^/?#]+)/);
  return m ? m[1] : null;
}

function corporateDomain(email: string | null | undefined): string | null {
  const domain = normalizeEmail(email)?.split("@")[1] ?? null;
  return domain && !FREE_MAIL_DOMAINS.has(domain) ? domain : null;
}

/**
 * Confidence (basis points) that two records describe the same person.
 * Same email is the same record (handled by upsert), so it isn't scored.
 * Returns 0 when nothing identifying matches.
 */
export function duplicateConfidenceBps(a: ContactIdentity, b: ContactIdentity): number {
  const li = normLinkedIn(a.linkedinUrl);
  if (li && li === normLinkedIn(b.linkedinUrl)) return 10000;
  const phone = normPhone(a.phone);
  if (phone && phone === normPhone(b.phone)) return 9500;
  const name = normText(a.fullName);
  if (!name || name !== normText(b.fullName)) return 0;
  const company = normText(a.company);
  if (company && company === normText(b.company)) return 9000;
  const domain = corporateDomain(a.email);
  if (domain && domain === corporateDomain(b.email)) return 8500;
  return 0;
}

/** Should a scored duplicate merge immediately or wait for owner review? */
export function mergeDecision(
  confidenceBps: number,
  policy: { mode: MergePolicyMode; autoThresholdBps: number },
): "ignore" | "auto" | "review" {
  if (confidenceBps < MIN_DUPLICATE_CONFIDENCE_BPS) return "ignore";
  return policy.mode === "auto" && confidenceBps >= policy.autoThresholdBps ? "auto" : "review";
}
