/**
 * Two-stage classifier for synced emails.
 *
 * Stage-1: deterministic rules (rules.ts). Free, high-precision, runs
 * on every message. ATS sender domains, application-status phrases,
 * interview/offer/rejection phrases, recruiter outreach phrasing,
 * newsletter heuristics.
 *
 * Stage-2: LLM. Only invoked when Stage-1 returns null. Keeps the
 * full-mailbox-sync cost bounded — most messages are caught by rules.
 *
 * Per-message summary is generated for any email scored ≥ 0.6 in any
 * job-related category, so the inbox row preview shows an AI gist
 * rather than the raw provider snippet.
 */

import { z } from "zod";
import type { LLMClient } from "../adapters/llm-client.js";
import type { NormalisedEmail } from "./providers/types.js";
import type { EmailUserRuleRow } from "../../repositories/emailUserRulesRepository.js";
import {
  classifyByRules,
  type ClassificationResult,
  type EmailCategory,
} from "./rules.js";

const JOB_RELATED: EmailCategory[] = [
  "job_opportunity",
  "application_status",
  "recruiter_outreach",
  "interview_invite",
  "offer",
  "rejection",
];

const ClassifySchema = z.object({
  category: z.enum([
    "job_opportunity",
    "application_status",
    "recruiter_outreach",
    "interview_invite",
    "offer",
    "rejection",
    "newsletter",
    "spam",
    "personal",
    "other",
  ]),
  score: z.number().min(0).max(1),
  reason: z.string().max(200).optional(),
});

const SUMMARY_PROMPT = `You produce a one-sentence summary of an email for a job-seeker's inbox.
Constraints:
- One sentence, max 25 words.
- Lead with the most actionable detail (date, role, company, action requested).
- Plain text, no markdown, no quoting.
`;

const CLASSIFY_PROMPT = `You classify an email for a job-seeker's inbox.
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

function summaryUserMessage(email: NormalisedEmail): string {
  const body = (email.bodyText ?? email.bodyHtml ?? email.snippet ?? "").slice(0, 4000);
  return `From: ${email.fromName ?? email.fromEmail} <${email.fromEmail}>\nSubject: ${email.subject}\n\n${body}`;
}

function classifyUserMessage(email: NormalisedEmail): string {
  return summaryUserMessage(email);
}

export interface ClassifierDeps {
  llm: LLMClient;
}

export async function classifyEmail(
  deps: ClassifierDeps,
  email: NormalisedEmail,
  userRules: EmailUserRuleRow[],
): Promise<ClassificationResult> {
  const stage1 = classifyByRules(email, userRules);
  if (stage1) return stage1;
  // Stage-2 — LLM. Falls back to a low-confidence "other" if the LLM
  // call blows up so we still persist the row.
  try {
    const result = await deps.llm.callJson(
      "email_classify",
      {
        useCase: "email_classify",
        systemPrompt: CLASSIFY_PROMPT,
        userMessage: classifyUserMessage(email),
      },
      ClassifySchema,
    );
    return {
      category: result.data.category,
      score: result.data.score,
      source: "llm",
    };
  } catch (err) {
    console.error("[email-classifier] LLM stage failed:", err);
    return { category: "other", score: 0.2, source: "llm" };
  }
}

export async function summariseEmail(
  deps: ClassifierDeps,
  email: NormalisedEmail,
  classification: ClassificationResult,
): Promise<string | null> {
  // Only summarise job-related categories above the noise floor — keeps
  // LLM cost off newsletters/spam/personal mail.
  if (!JOB_RELATED.includes(classification.category)) return null;
  if (classification.score < 0.6) return null;
  try {
    const result = await deps.llm.callText("email_summary", {
      useCase: "email_summary",
      systemPrompt: SUMMARY_PROMPT,
      userMessage: summaryUserMessage(email),
    });
    return (result.content ?? "").trim() || null;
  } catch (err) {
    console.error("[email-classifier] summary stage failed:", err);
    return null;
  }
}
