/**
 * Article moderation classifier — gap #175.
 *
 * Runs at publish + on every edit. Two outputs:
 *
 *   1. `quality_score` (0..1)  — overall content quality
 *   2. `moderation_findings` — profanity / racism / ToS terms, with a
 *      severity rollup
 *
 * Gates partner-program earning eligibility (#172): an article only
 * counts toward the engagement pool when `moderation_findings.severity`
 * is `low` or `medium`. `high` flips status → 'unlisted' and zeroes
 * `partner_program_eligible`; `block` flips status → 'flagged' and
 * unconditionally excludes from the pool.
 *
 * No human moderation queue — fully automated, per gap-register spec.
 * Authors can still publish a `low_quality` article (status='unlisted')
 * but will not accrue payable engagement.
 */

import { z } from "zod";
import type { LLMClient } from "../adapters/llm-client.js";
import {
  type ModerationFindings,
  type ModerationSeverity,
  MODERATION_SEVERITY,
} from "../../db/schema/articles.js";

const ClassifierResultSchema = z.object({
  qualityScore: z.number().min(0).max(1),
  qualityRationale: z.string().max(800),
  findings: z.object({
    profanity: z.array(z.string().min(1).max(40)).max(50),
    racism: z.array(z.string().min(1).max(80)).max(20),
    tosViolations: z.array(z.string().min(1).max(80)).max(20),
    severity: z.enum(MODERATION_SEVERITY),
    rationale: z.string().max(800).optional(),
  }),
});

export type ClassifierResult = z.infer<typeof ClassifierResultSchema>;

const SYSTEM_PROMPT = `You are a content-moderation classifier for a job-search platform.
Score the article on quality (0..1 — higher = more original, on-topic, useful) AND
return a moderation finding object with three array fields and one severity:

  - profanity[]     : list of profane terms present
  - racism[]        : list of racist phrases or dog-whistles present
  - tosViolations[] : list of ToS-violating phrases (e.g. self-harm, illegal services, harassment of named people)
  - severity        : one of "low" | "medium" | "high" | "block"
                      • low    — no findings of concern
                      • medium — minor profanity, no malice
                      • high   — slurs, harassment, doxxing  (article becomes unlisted)
                      • block  — illegal content, CSAM hint, malware (article becomes flagged)

Return ONLY JSON conforming to the ClassifierResult schema.`;

export async function classifyArticle(args: {
  llm: LLMClient;
  title: string;
  body: string;
}): Promise<ClassifierResult> {
  const result = await args.llm.callJson<ClassifierResult>(
    {
      useCase: "article_moderation",
      systemPrompt: SYSTEM_PROMPT,
      userMessage: `Title: ${args.title}\n\nBody:\n${args.body}`,
      responseFormat: "json_object",
    },
    ClassifierResultSchema,
  );
  return result.data;
}

/** Apply the severity rollup to a row update spec. */
export function gateForSeverity(severity: ModerationSeverity): {
  status?: "unlisted" | "flagged";
  partnerProgramEligible: boolean;
} {
  switch (severity) {
    case "low":
    case "medium":
      return { partnerProgramEligible: true };
    case "high":
      return { status: "unlisted", partnerProgramEligible: false };
    case "block":
      return { status: "flagged", partnerProgramEligible: false };
  }
}

export function toFindings(result: ClassifierResult): ModerationFindings {
  return {
    profanity: result.findings.profanity,
    racism: result.findings.racism,
    tosViolations: result.findings.tosViolations,
    severity: result.findings.severity,
    rationale: result.findings.rationale,
  };
}
