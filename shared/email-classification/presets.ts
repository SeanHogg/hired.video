/**
 * System inbox-profile presets — the single source of truth for the
 * seeded `inbox_profiles` rows (owner_id NULL, is_preset = true).
 *
 * The migration seed (`drizzle/0206_inbox_profiles.sql`,
 * `0207_inbox_recruiter_presets.sql`) mirrors these values; the parity
 * test (#1985) asserts the DB rows still match this module so the two
 * can't drift. Edit a preset HERE and update the seed migration in the
 * same pass.
 *
 * Preset UUIDs are FIXED constants — they're the stable target of
 * `external_email_accounts.active_profile_id` and the clone source, so
 * they must be deterministic across every environment.
 *
 * The **Job Hunter** preset preserves today's behaviour byte-for-byte:
 * its taxonomy is the legacy `JOB_INBOX_CATEGORIES`, its `classifyPrompt`
 * / `summaryPrompt` are the exact strings the classifier used as
 * `CLASSIFY_PROMPT` / `SUMMARY_PROMPT` before profiles existed, and it
 * carries no extraction (`extractSchema: null`). That is the regression
 * lock for #1979.
 */

import type { InboxProfileShape, InboxCategory } from "./profiles.js";
import { UNIVERSAL_CATEGORIES } from "./profiles.js";

/** A preset definition minus the per-row bookkeeping (version always 1
 *  at seed time; `taxonomy` here is the VISIBLE categories only — the
 *  universal noise buckets are appended by `presetTaxonomy()`). */
export interface InboxPresetDef
  extends Omit<InboxProfileShape, "version" | "taxonomy"> {
  /** Visible categories only; universal buckets appended at build time. */
  visibleCategories: InboxCategory[];
}

/** Fixed preset UUIDs. */
export const PRESET_IDS = {
  job_hunter: "10b0c0de-0000-4000-a000-000000000001",
  recruiter_sourcing: "10b0c0de-0000-4000-a000-000000000002",
  recruiter_bizdev: "10b0c0de-0000-4000-a000-000000000003",
  recruiter_intake: "10b0c0de-0000-4000-a000-000000000004",
} as const;

// ── Job Hunter — the zero-regression default ─────────────────────────────────

/** EXACT pre-profiles `CLASSIFY_PROMPT`. Do not reword — the dry-run
 *  regression test pins the Job Hunter classification to today's output. */
const JOB_HUNTER_CLASSIFY_PROMPT = `You classify an email for a job-seeker's inbox.
Return ONLY a JSON object: { "category": "...", "score": 0.NN, "reason": "..." }.
Allowed categories:
- job_opportunity   = inbound recruiter pitch about a specific role or list of roles
- application_status= ATS notification / hiring team update on an application the candidate submitted
- recruiter_outreach= recruiter introduction without a specific role yet
- interview_invite  = scheduling or invitation to an interview / phone screen
- offer             = job offer extended
- rejection         = decision-not-to-move-forward email
- newsletter        = job board digest, marketing newsletter
- spam              = unsolicited bulk, scam, fraudulent
- personal          = friend/family/personal correspondence
- other             = does not fit the above

score = your confidence in [0, 1].`;

/** EXACT pre-profiles `SUMMARY_PROMPT`. */
const JOB_HUNTER_SUMMARY_PROMPT = `You produce a one-sentence summary of an email for a job-seeker's inbox.
Constraints:
- One sentence, max 25 words.
- Lead with the most actionable detail (date, role, company, action requested).
- Plain text, no markdown, no quoting.
`;

const JOB_HUNTER: InboxPresetDef = {
  id: PRESET_IDS.job_hunter,
  ownerId: null,
  roles: ["job_seeker"],
  name: "Job Hunter",
  description:
    "The default candidate inbox — surfaces opportunities, application status, interviews, offers and rejections.",
  isPreset: true,
  presetKey: "job_hunter",
  visibleCategories: [
    { key: "job_opportunity", label: "Opportunity", description: "inbound recruiter pitch about a specific role or list of roles", visible: true },
    { key: "application_status", label: "Application status", description: "ATS notification / hiring team update on an application you submitted", visible: true },
    { key: "recruiter_outreach", label: "Recruiter outreach", description: "recruiter introduction without a specific role yet", visible: true },
    { key: "interview_invite", label: "Interview invite", description: "scheduling or invitation to an interview / phone screen", visible: true },
    { key: "offer", label: "Offer", description: "job offer extended", visible: true },
    { key: "rejection", label: "Rejection", description: "decision-not-to-move-forward email", visible: true },
  ],
  classifyPrompt: JOB_HUNTER_CLASSIFY_PROMPT,
  summaryPrompt: JOB_HUNTER_SUMMARY_PROMPT,
  extractSchema: null,
  defaultRuleSet: "job_seeker",
  minRelevanceScore: 0.5,
};

// ── Recruiter — Sourcing ─────────────────────────────────────────────────────

const RECRUITER_SOURCING: InboxPresetDef = {
  id: PRESET_IDS.recruiter_sourcing,
  ownerId: null,
  roles: ["recruiter"],
  name: "Recruiter — Sourcing",
  description:
    "For active sourcing: surfaces new requisitions, candidate replies, and submission updates, and pulls the role / company / candidate / job references out of each.",
  isPreset: true,
  presetKey: "recruiter_sourcing",
  visibleCategories: [
    { key: "new_requisition", label: "New requisition", description: "a hiring manager or client opens a new role / req to fill", visible: true },
    { key: "candidate_reply", label: "Candidate reply", description: "a candidate responds to outreach (interested, not interested, scheduling)", visible: true },
    { key: "submission_update", label: "Submission update", description: "client/hiring-team feedback on a candidate you submitted (advance, reject, interview)", visible: true },
  ],
  classifyPrompt: `You classify an email for a RECRUITER's sourcing inbox.
Return ONLY a JSON object: { "category": "...", "score": 0.NN, "reason": "...", "extracted": { ... } }.
Allowed categories:
- new_requisition    = a hiring manager or client opens a new role / requisition to fill
- candidate_reply    = a candidate responds to your outreach (interested, not interested, scheduling)
- submission_update  = client / hiring-team feedback on a candidate you submitted (advance, reject, interview)
- newsletter         = job board digest, marketing newsletter
- spam               = unsolicited bulk, scam, fraudulent
- personal           = friend/family/personal correspondence
- other              = does not fit the above

score = your confidence in [0, 1].`,
  summaryPrompt: `You produce a one-sentence summary of an email for a recruiter's sourcing inbox.
Constraints:
- One sentence, max 25 words.
- Lead with the most actionable detail (candidate name, role, company, next step).
- Plain text, no markdown, no quoting.
`,
  extractSchema: {
    type: "object",
    properties: {
      role: { type: "string", description: "the role / job title referenced" },
      company: { type: "string", description: "the hiring company or client" },
      candidateRef: { type: "string", description: "candidate name or identifier when the mail is about a specific person" },
      jobRef: { type: "string", description: "requisition id / job reference when present" },
    },
  },
  defaultRuleSet: "recruiter_sourcing",
  minRelevanceScore: 0.5,
};

// ── Recruiter — Biz Dev ──────────────────────────────────────────────────────

const RECRUITER_BIZDEV: InboxPresetDef = {
  id: PRESET_IDS.recruiter_bizdev,
  ownerId: null,
  roles: ["recruiter"],
  name: "Recruiter — Biz Dev",
  description:
    "For business development: surfaces companies that are hiring and inbound leads, and pulls the company / domain / signal source out of each.",
  isPreset: true,
  presetKey: "recruiter_bizdev",
  visibleCategories: [
    { key: "company_hiring", label: "Company hiring", description: "signal that a company is hiring / scaling a team (press, job posts, funding)", visible: true },
    { key: "inbound_lead", label: "Inbound lead", description: "a company reaches out about recruiting / staffing services", visible: true },
  ],
  classifyPrompt: `You classify an email for a RECRUITER's business-development inbox.
Return ONLY a JSON object: { "category": "...", "score": 0.NN, "reason": "...", "extracted": { ... } }.
Allowed categories:
- company_hiring  = signal that a company is hiring or scaling a team (press, job posts, funding, expansion)
- inbound_lead    = a company / prospect reaches out about recruiting or staffing services
- newsletter      = job board digest, marketing newsletter
- spam            = unsolicited bulk, scam, fraudulent
- personal        = friend/family/personal correspondence
- other           = does not fit the above

score = your confidence in [0, 1].`,
  summaryPrompt: `You produce a one-sentence summary of an email for a recruiter's business-development inbox.
Constraints:
- One sentence, max 25 words.
- Lead with the most actionable detail (company, hiring signal, who to contact).
- Plain text, no markdown, no quoting.
`,
  extractSchema: {
    type: "object",
    properties: {
      company: { type: "string", description: "the company name" },
      domain: { type: "string", description: "the company's web domain when derivable" },
      signalSource: { type: "string", description: "what surfaced the signal (funding announcement, job post, referral, inbound form)" },
    },
  },
  defaultRuleSet: "recruiter_bizdev",
  minRelevanceScore: 0.5,
};

// ── Recruiter — Intake ───────────────────────────────────────────────────────

const RECRUITER_INTAKE: InboxPresetDef = {
  id: PRESET_IDS.recruiter_intake,
  ownerId: null,
  roles: ["recruiter"],
  name: "Recruiter — Intake",
  description:
    "For req intake: surfaces intake notes from hiring managers and pulls the role / must-haves / comp / JD reference so a tailored JD can be drafted.",
  isPreset: true,
  presetKey: "recruiter_intake",
  visibleCategories: [
    { key: "intake_notes", label: "Intake notes", description: "a hiring manager describes a role they need filled — requirements, comp, must-haves", visible: true },
  ],
  classifyPrompt: `You classify an email for a RECRUITER's requisition-intake inbox.
Return ONLY a JSON object: { "category": "...", "score": 0.NN, "reason": "...", "extracted": { ... } }.
Allowed categories:
- intake_notes  = a hiring manager describes a role they need filled — requirements, comp, must-haves, JD references
- newsletter    = job board digest, marketing newsletter
- spam          = unsolicited bulk, scam, fraudulent
- personal      = friend/family/personal correspondence
- other         = does not fit the above

score = your confidence in [0, 1].`,
  summaryPrompt: `You produce a one-sentence summary of a requisition-intake email for a recruiter.
Constraints:
- One sentence, max 25 words.
- Lead with the role and the single most important requirement.
- Plain text, no markdown, no quoting.
`,
  extractSchema: {
    type: "object",
    properties: {
      role: { type: "string", description: "the role / job title to fill" },
      mustHaves: { type: "array", items: { type: "string" }, description: "non-negotiable requirements" },
      comp: { type: "string", description: "compensation range or budget when stated" },
      jdRef: { type: "string", description: "link or reference to an existing JD when present" },
    },
  },
  defaultRuleSet: "recruiter_intake",
  minRelevanceScore: 0.5,
};

/** Build the full taxonomy (visible categories + universal noise buckets)
 *  for a preset def — the exact `taxonomy` jsonb the seed persists. */
export function presetTaxonomy(def: InboxPresetDef): InboxCategory[] {
  return [...def.visibleCategories, ...UNIVERSAL_CATEGORIES];
}

/** Materialise a preset def into a full runtime profile (version 1). */
export function presetToProfile(def: InboxPresetDef): InboxProfileShape {
  const { visibleCategories, ...rest } = def;
  return { ...rest, taxonomy: presetTaxonomy(def), version: 1 };
}

/** Every system preset, in seed order. */
export const INBOX_PRESETS: readonly InboxPresetDef[] = [
  JOB_HUNTER,
  RECRUITER_SOURCING,
  RECRUITER_BIZDEV,
  RECRUITER_INTAKE,
] as const;

/** The preset a freshly-onboarded user of `role` should default to.
 *  Job Hunter for candidates; Sourcing for recruiters; falls back to
 *  Job Hunter (the universal default) for any other role. Single SSoT
 *  for onboarding + role-switch seeding (#1984). */
export function defaultPresetKeyForRole(role: string | null | undefined): string {
  switch (role) {
    case "recruiter":
      return "recruiter_sourcing";
    case "job_seeker":
    default:
      return "job_hunter";
  }
}

export { JOB_HUNTER, RECRUITER_SOURCING, RECRUITER_BIZDEV, RECRUITER_INTAKE };
