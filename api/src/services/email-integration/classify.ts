/**
 * Two-stage classifier for synced emails — now **profile-driven**.
 *
 * Stage-1: deterministic rules (rules.ts). Free, high-precision, runs
 * on every message. The default rule set is selected by the active
 * profile (`profile.defaultRuleSet`) so a recruiter mailbox runs
 * recruiter rules, not the job-seeker ATS rules.
 *
 * Stage-2: LLM. Only invoked when Stage-1 returns null. The system
 * prompt + allowed categories + optional structured extraction all come
 * from the active profile (`classify_prompt` / `taxonomy` /
 * `extract_schema`) rather than hardcoded constants. Keeps the
 * full-mailbox-sync cost bounded — most messages are caught by rules.
 *
 * Per-message summary is generated for any email scored ≥ 0.6 in a
 * VISIBLE category (per the profile taxonomy), so the inbox row preview
 * shows an AI gist rather than the raw provider snippet.
 *
 * Zero-regression: the Job Hunter preset carries the exact pre-profiles
 * prompt + taxonomy, so the job-seeker path is byte-for-byte unchanged.
 */

import { z } from "zod";
import type { LLMClient } from "../adapters/llm-client.js";
import type { NormalisedEmail } from "./providers/types.js";
import type { EmailUserRuleRow } from "../../repositories/emailUserRulesRepository.js";
import {
  classifyByRules,
  type ClassificationResult,
  type InboxProfileShape,
  categoryKeys,
  isVisibleCategory,
} from "../../../../shared/email-classification/index.js";
import { logger } from "../../lib/logger.js";

const GENERIC_SUMMARY_PROMPT = `You produce a one-sentence summary of an email.
Constraints:
- One sentence, max 25 words.
- Lead with the most actionable detail (date, role, company, action requested).
- Plain text, no markdown, no quoting.
`;

/** Stage-2 result schema. `category` is validated as a free string then
 *  coerced against the profile's taxonomy (a hallucinated category falls
 *  back to "other"); `extracted` is an open record shaped by the
 *  profile's `extract_schema`. */
const ClassifySchema = z.object({
  category: z.string(),
  score: z.number().min(0).max(1),
  reason: z.string().max(200).optional(),
  extracted: z.record(z.string(), z.any()).optional(),
});

/** Render the profile's `extract_schema` properties as a short bullet
 *  list the LLM can follow, appended to the classify prompt. */
function describeExtractSchema(schema: Record<string, unknown>): string {
  const props = (schema as any)?.properties;
  if (!props || typeof props !== "object") return "";
  const lines: string[] = [];
  for (const [field, def] of Object.entries(props)) {
    const desc = (def as any)?.description ?? "";
    lines.push(`- ${field}${desc ? `: ${desc}` : ""}`);
  }
  return lines.join("\n");
}

/** Build the Stage-2 system prompt from the profile, appending an
 *  extraction instruction block when the profile defines fields. */
function buildClassifySystemPrompt(profile: InboxProfileShape): string {
  if (!profile.extractSchema) return profile.classifyPrompt;
  const fields = describeExtractSchema(profile.extractSchema);
  if (!fields) return profile.classifyPrompt;
  return (
    profile.classifyPrompt +
    `\n\nAlso return an "extracted" object pulling these fields out of the email (omit a field when it isn't present):\n${fields}`
  );
}

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
  profile: InboxProfileShape,
): Promise<ClassificationResult> {
  const stage1 = classifyByRules(email, userRules as any, profile.defaultRuleSet);
  if (stage1) return stage1;
  // Stage-2 — LLM. Falls back to a low-confidence "other" if the LLM
  // call blows up so we still persist the row.
  const allowed = new Set(categoryKeys(profile));
  try {
    const result = await deps.llm.callJson(
      "email_classify",
      {
        useCase: "email_classify",
        systemPrompt: buildClassifySystemPrompt(profile),
        userMessage: classifyUserMessage(email),
      },
      ClassifySchema,
    );
    // Coerce a hallucinated category to "other" so it can't leak into the
    // feed as a visible category the profile never declared.
    const category = allowed.has(result.data.category) ? result.data.category : "other";
    return {
      category,
      score: result.data.score,
      source: "llm",
      extracted:
        profile.extractSchema && result.data.extracted
          ? result.data.extracted
          : null,
    };
  } catch (err) {
    logger.error("[email-classifier] LLM stage failed", err);
    return { category: "other", score: 0.2, source: "llm" };
  }
}

export async function summariseEmail(
  deps: ClassifierDeps,
  email: NormalisedEmail,
  classification: ClassificationResult,
  profile: InboxProfileShape,
): Promise<string | null> {
  // Only summarise VISIBLE categories above the noise floor — keeps LLM
  // cost off newsletters/spam/personal mail.
  if (!isVisibleCategory(classification.category, profile)) return null;
  if (classification.score < 0.6) return null;
  try {
    const result = await deps.llm.callText("email_summary", {
      useCase: "email_summary",
      systemPrompt: profile.summaryPrompt ?? GENERIC_SUMMARY_PROMPT,
      userMessage: summaryUserMessage(email),
    });
    return (result.content ?? "").trim() || null;
  } catch (err) {
    logger.error("[email-classifier] summary stage failed", err);
    return null;
  }
}
