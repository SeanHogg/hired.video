/**
 * Résumé parse pipeline — résumé text → JSON Resume content.
 *
 *   0. preprocess  regex pre-parse (instant, no model) → first `preview`
 *   1. structure   one full-résumé model pass
 *   2. backfill    ONLY the sections step 1 left empty, in parallel
 *   3. merge       regex fills what the model missed; fragments folded;
 *                  stable item ids minted → second `preview`
 *   4. refine      date rescan + skill enrichment, concurrently, each bounded
 *                  by `refineBudgetMs` so optional polish never holds the
 *                  result hostage
 *
 * Progress is reported through `onEvent` (the parse route streams it to the
 * client as SSE). Model access is injected, so this module is free of
 * env/HTTP and fakeable in tests.
 */
import type { ResumeContent } from "../../../../shared/resume.js";
import type { ResumeParseEvent } from "../../../../shared/resume-parse-stream.js";
import type { AiTextCaller } from "../adapters/ai-text-caller.js";
import { isAbortError } from "../../utils/abort.js";
import { mapWithConcurrency, settleWithin } from "../../utils/async.js";
import { hasRealSectionContent } from "./content.js";
import { extractJson, isParseComplete, parseResumeWithRegex } from "./parse.js";
import { RESUME_PARSE_PROMPT, SECTION_PROMPTS } from "./parsePrompts.js";
import {
  applyDateRescan,
  consolidateFragmentedEntries,
  ensureSectionItemIds,
  findEntriesMissingDates,
  mergeRegexFallback,
  rescanMissingDates,
} from "./parseRefine.js";
import { countSkillItems, mergeExtractedSkillsIntoResume, type Skill } from "./skills.js";
import { logger } from "../../lib/logger.js";

export interface ResumeParsePorts {
  callAI: AiTextCaller;
  /** Dedicated skill extractor; null when no typed LLM client is configured. */
  extractSkills: ((content: ResumeContent) => Promise<Skill[]>) | null;
}

export interface ResumeParseOptions {
  onEvent?: (event: ResumeParseEvent) => void;
  /** Ceiling for each optional refinement pass. */
  refineBudgetMs?: number;
}

/** Section backfill prompts in flight at once — parallel, but gentle on the gateway. */
const SECTION_CONCURRENCY = 4;
const DEFAULT_REFINE_BUDGET_MS = 20_000;
/** Below this many skills the dedicated extractor runs. */
const SKILL_ENRICHMENT_THRESHOLD = 5;

export async function runResumeParse(
  resumeText: string,
  ports: ResumeParsePorts,
  { onEvent, refineBudgetMs = DEFAULT_REFINE_BUDGET_MS }: ResumeParseOptions = {},
): Promise<Record<string, unknown>> {
  const emit = onEvent ?? (() => {});

  const regex = parseResumeWithRegex(resumeText);
  emit({ type: "preview", content: regex });

  emit({ type: "stage", stage: "structure" });
  let structured = await structureOnePass(ports.callAI, resumeText);
  if (!structured || !isParseComplete(structured)) {
    const backfill = await backfillSections(ports.callAI, resumeText, missingSections(structured));
    structured = overlaySections(structured ?? {}, backfill);
  }
  if (Object.keys(structured).length === 0) {
    ensureSectionItemIds(regex);
    return regex;
  }

  const merged = mergeRegexFallback(structured, regex);
  merged.work = consolidateFragmentedEntries(merged.work, ["name"], ["position", "startDate", "endDate"]);
  merged.volunteer = consolidateFragmentedEntries(merged.volunteer, ["organization"], ["position", "startDate", "endDate"]);
  // Skill evidence binds to item `id`, so ids must exist before enrichment.
  ensureSectionItemIds(merged);
  emit({ type: "preview", content: merged });

  emit({ type: "stage", stage: "refine" });
  await refine(merged, resumeText, ports, refineBudgetMs);
  return merged;
}

/** One full-résumé pass. Null when the model failed or returned nothing usable. */
async function structureOnePass(callAI: AiTextCaller, resumeText: string): Promise<Record<string, unknown> | null> {
  try {
    const result = extractJson(await callAI(RESUME_PARSE_PROMPT, resumeText));
    if (!isParseComplete(result)) logger.warn("[parse] Single-pass result incomplete, backfilling sections");
    return Object.keys(result).length > 0 ? result : null;
  } catch (err) {
    // Disconnect is not a model failure — rethrow so we never backfill 8 more calls.
    if (isAbortError(err)) throw err;
    logger.error("[parse] Single-pass failed", err);
    return null;
  }
}

/** Sections the one-pass result has no real content for (all of them when it failed). */
function missingSections(result: Record<string, unknown> | null): string[] {
  return Object.keys(SECTION_PROMPTS).filter((section) => {
    if (!result) return true;
    if (section === "basics") {
      const basics = result.basics as Record<string, unknown> | undefined;
      return !basics?.name;
    }
    return !hasRealSectionContent(result[section], section);
  });
}

/** Ask for each missing section on its own, concurrently. Failed sections are skipped. */
async function backfillSections(
  callAI: AiTextCaller,
  resumeText: string,
  sections: readonly string[],
): Promise<Record<string, unknown>> {
  const entries = await mapWithConcurrency(sections, SECTION_CONCURRENCY, async (section) => {
    try {
      const raw = await callAI(
        `You are a resume parser. ${SECTION_PROMPTS[section]} Return only valid JSON, no markdown.`,
        resumeText,
      );
      return [section, extractJson(raw)[section]] as const;
    } catch (err) {
      if (isAbortError(err)) throw err;
      logger.warn("[parse-sectional] section failed", { section, error: err });
      return [section, undefined] as const;
    }
  });
  const out: Record<string, unknown> = {};
  for (const [section, value] of entries) if (value !== undefined) out[section] = value;
  return out;
}

/** Lay backfilled sections over the one-pass result, filling only what it lacked. */
function overlaySections(
  base: Record<string, unknown>,
  backfill: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...base };
  for (const [section, value] of Object.entries(backfill)) {
    if (section === "basics") {
      const current = (out.basics ?? {}) as Record<string, unknown>;
      const filled: Record<string, unknown> = { ...(value as Record<string, unknown>) };
      for (const [k, v] of Object.entries(current)) if (v) filled[k] = v;
      out.basics = filled;
    } else if (hasRealSectionContent(value, section) || out[section] === undefined) {
      out[section] = value;
    }
  }
  return out;
}

/** Date rescan + skill enrichment, side by side. Each result is applied only if it lands within budget. */
async function refine(
  merged: Record<string, unknown>,
  resumeText: string,
  { callAI, extractSkills }: ResumeParsePorts,
  budgetMs: number,
): Promise<void> {
  const needsDates = findEntriesMissingDates(merged);
  const wantsSkills = extractSkills !== null && countSkillItems(merged.skills) < SKILL_ENRICHMENT_THRESHOLD;

  const [dates, skills] = await Promise.all([
    needsDates.length > 0
      ? settleWithin(logFailure(rescanMissingDates(callAI, resumeText, needsDates), "Date rescan"), budgetMs)
      : null,
    wantsSkills
      ? settleWithin(logFailure(extractSkills(merged as unknown as ResumeContent), "Skill enrichment"), budgetMs)
      : null,
  ]);

  if (dates) applyDateRescan(merged, dates);
  if (skills && skills.length > 0) {
    const result = mergeExtractedSkillsIntoResume(merged.skills, skills, {
      content: merged as unknown as ResumeContent,
    });
    merged.skills = result.skills;
    merged.skillEvidence = result.evidence;
  }
}

function logFailure<T>(promise: Promise<T>, label: string): Promise<T> {
  return promise.catch((err) => {
    logger.warn(`[parse] ${label} failed`, err);
    throw err;
  });
}
