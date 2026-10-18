// Central catalog: every Free-tier / Pro-tier limit advertised on the Pricing
// page lives here as data. Adding or changing a limit is a one-line edit, not
// a code change scattered across middleware. The catalog is what makes the
// Usage Statement panel honest — every dimension shown to users has a
// corresponding entry below, and vice-versa.
//
// SSoT for numeric Free-tier limits previously scattered across
// [shared/pricing.ts](../../../../shared/pricing.ts) (FREE_AI_MONTHLY_TOKENS,
// FREE_TEAM_MEMBER_LIMIT, FREE_PUBLISHED_VIDEOS_LIMIT,
// FREE_INTERVIEW_SESSIONS_PER_MONTH) + the Pricing.tsx marketing values that
// had no backing constant (gap-register #765, #766, #770).

import {
  FREE_AI_MONTHLY_TOKENS,
  PRO_AI_MONTHLY_TOKENS,
  FREE_TEAM_MEMBER_LIMIT,
  FREE_PUBLISHED_VIDEOS_LIMIT,
  FREE_INTERVIEW_SESSIONS_PER_MONTH,
  INBOX_SYNC_INCLUDED_ACCOUNTS,
} from "../../../../shared/pricing.js";
import type { PlanTier, UsageEventType } from "../../../../shared/usage-statement.js";

/** Where the gate reads "consumed so far" from.
 *
 *  - `"ledger_monthly"` (default): SUM(`usage_ledger.quantity`) for the
 *    current calendar month. The right answer for AI-event dimensions
 *    that have no domain table of their own.
 *
 *  - `"team_invitations_lifetime"`: count of `account_invitations` rows
 *    (`pending` + `accepted`) authored by the user. Lifetime semantic —
 *    the cap counts the total team-member count, not how many invites
 *    they sent this month.
 *
 *  - `"interview_sessions_monthly"`: count of `interview_sessions` rows
 *    the user created since the start of the current UTC month. Monthly
 *    semantic, but reads from the authoritative domain table so legacy
 *    sessions that pre-date ledger metering still count.
 *
 *  - `"published_video_projects_lifetime"`: count of distinct
 *    `studio_projects` the user has a published `videos` row against.
 *    Lifetime semantic — the cap is the total number of published video
 *    resumes, not a publish rate. Re-uploads to the same project replace
 *    the existing video and don't count.
 *
 *  - `"connected_inboxes_active"`: count of connected mailboxes
 *    (provider_connections "email_inbox") active and not paused for the user. Snapshot semantic —
 *    the cap is the current number of connected mailboxes, not a
 *    connect rate. Disconnecting a mailbox frees the slot immediately.
 */
export type ConsumedSource =
  | "ledger_monthly"
  | "team_invitations_lifetime"
  | "interview_sessions_monthly"
  | "published_video_projects_lifetime"
  | "connected_inboxes_active";

export interface EntitlementSpec {
  eventType: UsageEventType;
  label: string;
  /** Display unit. "tokens" | "videos" | "invites" | "sessions" | "searches" |
   *  "companies" | "calls" | "exports" | "runs" */
  unit: string;
  /** Plan allowance per month. 0 = unlimited / unmetered. */
  monthlyCap: Record<PlanTier, number>;
  /** Overage USD-cent rate per unit. 0 = entitlement-only (block at cap, no
   *  pay-to-overflow). AI tokens have an overage rate so token-pack top-ups
   *  apply cleanly; everything else is a hard cap by default. */
  overageCentsPerUnit: number;
  /** 'hard' returns 402 when over cap. 'soft' records the overage without
   *  blocking; the user pays at month close. AI tokens are 'soft' because
   *  packs cover the overflow; counts are 'hard' for the Free tier. */
  gateBehavior: "hard" | "soft";
  /** Where the gate counts "consumed so far" from. Defaults to
   *  `ledger_monthly` when omitted (the right answer for every dimension
   *  that doesn't have its own authoritative domain table). */
  consumedSource?: ConsumedSource;
}

export const ENTITLEMENT_CATALOG: Record<UsageEventType, EntitlementSpec> = {
  ai_tokens: {
    eventType: "ai_tokens",
    label: "AI tokens",
    unit: "tokens",
    monthlyCap: {
      free: FREE_AI_MONTHLY_TOKENS,
      pro: PRO_AI_MONTHLY_TOKENS,
      trial: PRO_AI_MONTHLY_TOKENS,
    },
    overageCentsPerUnit: 0, // pack-paid; the pack balance covers overflow
    gateBehavior: "soft",
  },
  video_publish: {
    eventType: "video_publish",
    label: "Published video resumes",
    unit: "videos",
    monthlyCap: {
      free: FREE_PUBLISHED_VIDEOS_LIMIT,
      pro: 0,
      trial: 0,
    },
    overageCentsPerUnit: 0,
    gateBehavior: "hard",
    // Cap is "lifetime distinct published video projects", not monthly.
    // Re-uploads to the same project replace the existing video and don't
    // count as new publishes.
    consumedSource: "published_video_projects_lifetime",
  },
  team_invite: {
    eventType: "team_invite",
    label: "Team members",
    unit: "invites",
    monthlyCap: {
      free: FREE_TEAM_MEMBER_LIMIT - 1, // inviter is seat 1, cap counts invitees
      pro: 0,
      trial: 0,
    },
    overageCentsPerUnit: 0,
    gateBehavior: "hard",
    // Cap is "lifetime total team size", not invites-per-month. Counts
    // pending + accepted invitations authored by this user.
    consumedSource: "team_invitations_lifetime",
  },
  interview_session: {
    eventType: "interview_session",
    label: "AI interview sessions",
    unit: "sessions",
    monthlyCap: {
      free: FREE_INTERVIEW_SESSIONS_PER_MONTH,
      pro: 0,
      trial: 0,
    },
    overageCentsPerUnit: 0,
    gateBehavior: "hard",
    // Monthly semantic, but reads from the authoritative interview_sessions
    // table so sessions that pre-date ledger metering still count.
    consumedSource: "interview_sessions_monthly",
  },
  saved_search: {
    eventType: "saved_search",
    label: "Saved searches & talent lists",
    unit: "searches",
    monthlyCap: { free: 3, pro: 0, trial: 0 }, // closes gap-register #766
    overageCentsPerUnit: 0,
    gateBehavior: "hard",
  },
  company_db_write: {
    eventType: "company_db_write",
    label: "Companies in your database",
    unit: "companies",
    monthlyCap: { free: 50, pro: 0, trial: 0 }, // closes gap-register #766
    overageCentsPerUnit: 0,
    gateBehavior: "hard",
  },
  resume_tailor: {
    eventType: "resume_tailor",
    label: "AI Resume Tailor variations",
    unit: "variations",
    monthlyCap: { free: 3, pro: 0, trial: 0 }, // closes gap-register #765
    overageCentsPerUnit: 0,
    gateBehavior: "hard",
  },
  resume_roast: {
    eventType: "resume_roast",
    label: "AI Resume Roasts",
    unit: "roasts",
    monthlyCap: { free: 3, pro: 0, trial: 0 }, // closes gap-register #765
    overageCentsPerUnit: 0,
    gateBehavior: "hard",
  },
  resume_summary: {
    eventType: "resume_summary",
    label: "AI Resume Summaries",
    unit: "summaries",
    monthlyCap: { free: 5, pro: 0, trial: 0 }, // closes gap-register #765
    overageCentsPerUnit: 0,
    gateBehavior: "hard",
  },
  value_prop_pitch: {
    eventType: "value_prop_pitch",
    label: "AI Value Proposition pitches",
    unit: "pitches",
    monthlyCap: { free: 3, pro: 0, trial: 0 }, // closes gap-register #765
    overageCentsPerUnit: 0,
    gateBehavior: "hard",
  },
  resume_parse: {
    eventType: "resume_parse",
    label: "PDF resume parses",
    unit: "parses",
    monthlyCap: { free: 5, pro: 0, trial: 0 }, // closes gap-register #765
    overageCentsPerUnit: 0,
    gateBehavior: "hard",
  },
  career_coach_msg: {
    eventType: "career_coach_msg",
    label: "AI Career Coach messages",
    unit: "messages",
    monthlyCap: { free: 20, pro: 0, trial: 0 }, // closes gap-register #765
    overageCentsPerUnit: 0,
    gateBehavior: "hard",
  },
  export_4k: {
    eventType: "export_4k",
    label: "4K MP4 exports",
    unit: "exports",
    monthlyCap: { free: 0, pro: 0, trial: 0 }, // Pro-only feature; Free hits the catalog miss path and is blocked
    overageCentsPerUnit: 0,
    gateBehavior: "hard",
  },
  export_1080p: {
    eventType: "export_1080p",
    label: "1080p MP4 exports",
    unit: "exports",
    monthlyCap: { free: 0, pro: 0, trial: 0 }, // unlimited for both tiers; metered for the statement only
    overageCentsPerUnit: 0,
    gateBehavior: "soft",
  },
  bulk_score_run: {
    eventType: "bulk_score_run",
    label: "Bulk resume-scoring runs",
    unit: "runs",
    monthlyCap: { free: 0, pro: 0, trial: 0 },
    overageCentsPerUnit: 0,
    gateBehavior: "soft",
  },
  // Inbox Sync — Pro-only feature. `email_sync` counts each ingest chunk
  // for the Usage Statement (display only; unlimited within the Pro plan).
  // `email_account` is a snapshot dimension (current connected mailbox
  // count, not a monthly tally) — services-processor's dispatcher reads
  // the count from the connected mailboxes (provider_connections "email_inbox").
  email_sync: {
    eventType: "email_sync",
    label: "Inbox sync runs",
    unit: "runs",
    monthlyCap: { free: 0, pro: 0, trial: 0 },
    overageCentsPerUnit: 0,
    gateBehavior: "soft",
  },
  email_account: {
    eventType: "email_account",
    label: "Connected inboxes",
    unit: "inboxes",
    monthlyCap: {
      free: 0,
      pro: INBOX_SYNC_INCLUDED_ACCOUNTS,
      trial: INBOX_SYNC_INCLUDED_ACCOUNTS,
    },
    overageCentsPerUnit: 0,
    gateBehavior: "hard",
    consumedSource: "connected_inboxes_active",
  },
};

/** Return all entitlements visible on the Usage Statement for a given plan,
 *  in catalog-iteration order. */
export function listEntitlements(plan: PlanTier): EntitlementSpec[] {
  return Object.values(ENTITLEMENT_CATALOG).filter((spec) => {
    // Hide 4K from Free statements — Free users can't trigger it. Everything
    // else stays visible so users see what's available + consumed.
    if (spec.eventType === "export_4k" && plan === "free") return false;
    // Inbox Sync dimensions are Pro-only — hide from Free statements so the
    // panel doesn't advertise a feature the user can't access.
    if (
      (spec.eventType === "email_sync" || spec.eventType === "email_account") &&
      plan === "free"
    ) {
      return false;
    }
    return true;
  });
}

export function getEntitlement(eventType: UsageEventType): EntitlementSpec {
  const spec = ENTITLEMENT_CATALOG[eventType];
  if (!spec) {
    throw new Error(`[entitlement-catalog] unknown event_type: ${eventType}`);
  }
  return spec;
}
