/**
 * Stage-1 deterministic classifier — rules engine over (sender, subject,
 * body, headers).
 *
 * Two rule sources, evaluated in order:
 *   1. User-authored rules from `email_user_rules` (priority asc).
 *   2. The default ruleset below — pinned, version-controlled, evolves
 *      with the product.
 *
 * The first match wins. If nothing matches, Stage-2 LLM gets a turn.
 *
 * Conditions are intentionally simple — sender-domain match, subject
 * contains, body contains. Anything more nuanced belongs in the LLM
 * stage: the deterministic stage is for high-precision, zero-cost
 * classification.
 */

import type { NormalisedEmail } from "./providers/types.js";
import type { EmailUserRuleRow } from "../../repositories/emailUserRulesRepository.js";

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

export interface RuleCondition {
  /** Where to match on. */
  field: "from_email" | "from_domain" | "subject" | "body" | "any";
  /** Operator. `regex` is anchored as-is — caller controls anchors. */
  op: "contains" | "equals" | "starts_with" | "ends_with" | "regex";
  value: string;
  /** Default false — caller decides case sensitivity per condition. */
  caseSensitive?: boolean;
}

export interface ClassificationResult {
  category: EmailCategory;
  score: number;
  source: "user_rule" | "default_rule" | "llm";
  ruleName?: string;
}

interface DefaultRule {
  name: string;
  conditions: RuleCondition[];
  category: EmailCategory;
  /** Confidence applied by the deterministic match — defaults are tight
   *  on ATS senders (0.95) and looser on heuristics (0.7). */
  score: number;
}

// ATS / job-board sender domains — high-precision matches.
const ATS_DOMAINS = [
  "greenhouse.io",
  "lever.co",
  "ashbyhq.com",
  "workday.com",
  "myworkday.com",
  "icims.com",
  "smartrecruiters.com",
  "bamboohr.com",
  "jobvite.com",
  "personio.com",
  "teamtailor.com",
  "recruitee.com",
  "linkedin.com",
  "indeed.com",
  "indeedemail.com",
  "ziprecruiter.com",
  "wellfound.com",
  "angel.co",
  "glassdoor.com",
  "hired.com",
  "otta.com",
];

const APPLICATION_STATUS_PHRASES = [
  "thank you for applying",
  "we received your application",
  "your application has been received",
  "application received",
  "your application status",
  "status of your application",
  "next steps",
  "moving forward",
  "moving you forward",
];

const INTERVIEW_PHRASES = [
  "interview",
  "schedule a chat",
  "schedule a call",
  "phone screen",
  "technical screen",
  "calendly",
];

const OFFER_PHRASES = [
  "offer letter",
  "we'd like to offer",
  "we are pleased to offer",
  "extending an offer",
];

const REJECTION_PHRASES = [
  "we have decided not to move forward",
  "unfortunately, we will not be moving forward",
  "we will not be proceeding",
  "we have decided to pursue other candidates",
  "your application was not selected",
  "we've decided to move forward with other",
];

const RECRUITER_PHRASES = [
  "i came across your profile",
  "your profile caught my eye",
  "we have an exciting opportunity",
  "would you be open to discussing",
  "are you open to a new role",
  "interested in a new opportunity",
];

const NEWSLETTER_HINTS = [
  "unsubscribe",
  "view in browser",
  "manage preferences",
];

export const DEFAULT_RULES: DefaultRule[] = [
  // Application status (highest precision when paired with ATS sender)
  ...APPLICATION_STATUS_PHRASES.map((phrase) => ({
    name: `default:application_status_${phrase}`,
    conditions: [
      { field: "subject", op: "contains", value: phrase } as RuleCondition,
    ],
    category: "application_status" as EmailCategory,
    score: 0.85,
  })),
  // Interview invitation
  ...INTERVIEW_PHRASES.map((phrase) => ({
    name: `default:interview_${phrase}`,
    conditions: [
      { field: "subject", op: "contains", value: phrase } as RuleCondition,
    ],
    category: "interview_invite" as EmailCategory,
    score: 0.85,
  })),
  // Offer
  ...OFFER_PHRASES.map((phrase) => ({
    name: `default:offer_${phrase}`,
    conditions: [
      { field: "any", op: "contains", value: phrase } as RuleCondition,
    ],
    category: "offer" as EmailCategory,
    score: 0.9,
  })),
  // Rejection
  ...REJECTION_PHRASES.map((phrase) => ({
    name: `default:rejection_${phrase}`,
    conditions: [
      { field: "body", op: "contains", value: phrase } as RuleCondition,
    ],
    category: "rejection" as EmailCategory,
    score: 0.9,
  })),
  // ATS sender → likely application_status (lower-precision, fires when
  // subject/body wording didn't trigger the more specific rules above).
  ...ATS_DOMAINS.map((dom) => ({
    name: `default:ats_sender_${dom}`,
    conditions: [
      { field: "from_domain", op: "ends_with", value: dom } as RuleCondition,
    ],
    category: "application_status" as EmailCategory,
    score: 0.7,
  })),
  // Recruiter outreach phrasing
  ...RECRUITER_PHRASES.map((phrase) => ({
    name: `default:recruiter_${phrase}`,
    conditions: [
      { field: "body", op: "contains", value: phrase } as RuleCondition,
    ],
    category: "recruiter_outreach" as EmailCategory,
    score: 0.8,
  })),
  // Newsletter heuristics
  ...NEWSLETTER_HINTS.map((phrase) => ({
    name: `default:newsletter_${phrase}`,
    conditions: [
      { field: "body", op: "contains", value: phrase } as RuleCondition,
    ],
    category: "newsletter" as EmailCategory,
    score: 0.55,
  })),
];

function getDomain(email: string): string {
  const at = email.indexOf("@");
  if (at < 0) return email.toLowerCase();
  return email.slice(at + 1).toLowerCase();
}

function getField(email: NormalisedEmail, field: RuleCondition["field"]): string {
  switch (field) {
    case "from_email":
      return email.fromEmail.toLowerCase();
    case "from_domain":
      return getDomain(email.fromEmail);
    case "subject":
      return email.subject;
    case "body":
      return email.bodyText ?? email.bodyHtml ?? email.snippet;
    case "any":
      return [
        email.fromEmail,
        email.subject,
        email.bodyText ?? email.bodyHtml ?? email.snippet,
      ].join("\n");
  }
}

function evalCondition(email: NormalisedEmail, c: RuleCondition): boolean {
  const haystack = getField(email, c.field);
  const left = c.caseSensitive ? haystack : haystack.toLowerCase();
  const right = c.caseSensitive ? c.value : c.value.toLowerCase();
  switch (c.op) {
    case "contains":
      return left.includes(right);
    case "equals":
      return left === right;
    case "starts_with":
      return left.startsWith(right);
    case "ends_with":
      return left.endsWith(right);
    case "regex":
      try {
        return new RegExp(c.value, c.caseSensitive ? "" : "i").test(haystack);
      } catch {
        return false;
      }
  }
}

function evalRule(email: NormalisedEmail, conditions: RuleCondition[]): boolean {
  // Conditions AND together — every condition must match for the rule
  // to fire. Orred behaviour belongs in the LLM stage.
  return conditions.every((c) => evalCondition(email, c));
}

function isUserRuleConditionsArray(x: unknown): x is RuleCondition[] {
  return Array.isArray(x) && x.every((c) =>
    c &&
    typeof c === "object" &&
    typeof (c as any).field === "string" &&
    typeof (c as any).op === "string" &&
    typeof (c as any).value === "string"
  );
}

export function classifyByRules(
  email: NormalisedEmail,
  userRules: EmailUserRuleRow[],
): ClassificationResult | null {
  // 1. User rules first — they override defaults.
  for (const r of userRules) {
    const conds = isUserRuleConditionsArray(r.conditions) ? r.conditions : [];
    if (conds.length === 0) continue;
    if (evalRule(email, conds)) {
      return {
        category: r.actionCategory as EmailCategory,
        score: Number(r.actionScore ?? 1),
        source: "user_rule",
        ruleName: r.name,
      };
    }
  }
  // 2. Default rules.
  for (const r of DEFAULT_RULES) {
    if (evalRule(email, r.conditions)) {
      return { category: r.category, score: r.score, source: "default_rule", ruleName: r.name };
    }
  }
  return null;
}
