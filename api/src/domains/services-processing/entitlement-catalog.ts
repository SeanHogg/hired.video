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
  },
  team_invite: {
    eventType: "team_invite",
    label: "Team members",
    unit: "invites",
    monthlyCap: {
      free: FREE_TEAM_MEMBER_LIMIT,
      pro: 0,
      trial: 0,
    },
    overageCentsPerUnit: 0,
    gateBehavior: "hard",
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
  // count, not a monthly tally) — the cap is enforced at /connect time;
  // services-processor injects a synthetic statement line from the
  // external_email_accounts table because the dimension doesn't fit the
  // append-only ledger semantics.
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
