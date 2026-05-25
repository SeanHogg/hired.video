/**
 * Agent v2 intake helpers — derive structured search criteria from
 * either a natural-language brief or an existing job posting.
 *
 * `deriveCriteriaFromBrief` is LLM-first (closes the LinkedIn Hiring
 * Assistant "Semantic Sourcing" parity gap) with a heuristic fallback
 * that handles the no-API-key local-dev case.
 *
 * `deriveCriteriaFromJobRow` is pure — it just shapes existing job
 * fields into AgentCriteria. Used when the recruiter picks an existing
 * job posting to recruit for instead of typing a brief.
 *
 * Both return the same `AgentCriteria` shape so the calling route can
 * pipe straight into POST /agent/source without further translation.
 */

import type { LLMClient } from "../adapters/llm-client.js";

export interface AgentCriteria {
  jobTitle: string;
  skills: string[];
  location: string;
  experienceYears: number | null;
  maxCandidates: number;
}

/** Defaults for the follow-up scheduling sequence. Externalised so the
 *  route handler, the worker, and tests all read from one place. */
export const FOLLOWUP_DEFAULTS = {
  firstOffsetDays: 3,
  secondOffsetDays: 7,
  finalOffsetDays: 14,
  maxCandidates: 20,
};

// ---------------------------------------------------------------------------
// Heuristic helpers (pure, testable)
// ---------------------------------------------------------------------------

const TITLE_STOPWORDS = new Set([
  "looking", "need", "want", "hiring", "seeking", "recruit", "role", "position",
  "candidate", "candidates", "for", "to", "the", "a", "an", "and", "or", "with",
  "of", "in", "at", "on",
]);

const SKILL_DICTIONARY = [
  // Programming
  "react", "typescript", "javascript", "python", "java", "go", "rust", "c#",
  ".net", "node", "node.js", "kotlin", "swift", "ruby", "rails", "django",
  "fastapi", "spring", "graphql", "rest", "grpc",
  // Data
  "sql", "postgres", "postgresql", "mysql", "mongodb", "redis", "kafka",
  "snowflake", "bigquery", "dbt", "airflow", "spark", "hadoop",
  // Cloud / Infra
  "aws", "gcp", "azure", "kubernetes", "k8s", "docker", "terraform", "ansible",
  // ML / AI
  "pytorch", "tensorflow", "ml", "machine learning", "nlp", "llm", "computer vision",
  // Design
  "figma", "sketch", "adobe", "photoshop", "illustrator",
  // Sales / Marketing
  "salesforce", "hubspot", "marketo", "seo", "sem", "google ads",
];

/** Extract a probable job title from a free-text brief. Picks the
 *  first significant noun phrase — works on "Looking for a senior
 *  staff engineer to join…" → "senior staff engineer". */
export function extractTitleFromBrief(brief: string): string {
  const cleaned = brief.toLowerCase().replace(/[^a-z0-9\s\-/]+/g, " ");
  const words = cleaned.split(/\s+/).filter(Boolean);
  // Find first run of 1–4 consecutive non-stopword tokens.
  const buf: string[] = [];
  for (const w of words) {
    if (TITLE_STOPWORDS.has(w)) {
      if (buf.length >= 1) break;
      continue;
    }
    buf.push(w);
    if (buf.length >= 4) break;
  }
  return buf.join(" ").trim();
}

/** Extract probable skills from a brief by dictionary match. */
export function extractSkillsFromBrief(brief: string): string[] {
  const lower = brief.toLowerCase();
  const matched = SKILL_DICTIONARY.filter((skill) => {
    const escaped = skill.replace(/[.+]/g, "\\$&");
    return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`).test(lower);
  });
  return [...new Set(matched)];
}

/** Extract a years-of-experience hint. Recognises "3+ years",
 *  "5 years of experience", "senior" (≥5), "staff" (≥7). */
export function extractExperienceFromBrief(brief: string): number | null {
  const yearsMatch = brief.match(/(\d{1,2})\s*\+?\s*(?:years?|yrs?)/i);
  if (yearsMatch) return Number(yearsMatch[1]);
  const lower = brief.toLowerCase();
  if (/\bprincipal\b/.test(lower)) return 10;
  if (/\bstaff\b/.test(lower)) return 7;
  if (/\bsenior\b|\bsr\.?\b/.test(lower)) return 5;
  if (/\bjunior\b|\bjr\.?\b|\bentry\b/.test(lower)) return 0;
  return null;
}

/** Extract a location hint from a brief. Looks for "in {place}" and
 *  "remote" / "hybrid" patterns. */
export function extractLocationFromBrief(brief: string): string {
  if (/\bfully\s+remote\b|\bremote(?:-?only)?\b/i.test(brief)) return "Remote";
  const inMatch = brief.match(/\bin\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?(?:,\s*[A-Z]{2})?)/);
  if (inMatch) return inMatch[1].trim();
  return "";
}

export function heuristicCriteriaFromBrief(brief: string): AgentCriteria {
  const jobTitle = extractTitleFromBrief(brief) || "Software Engineer";
  return {
    jobTitle,
    skills: extractSkillsFromBrief(brief),
    location: extractLocationFromBrief(brief),
    experienceYears: extractExperienceFromBrief(brief),
    maxCandidates: FOLLOWUP_DEFAULTS.maxCandidates,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

interface JobRowForCriteria {
  title: string | null;
  description: string | null;
  location: string | null;
  skillsRequired: unknown;
}

export function deriveCriteriaFromJobRow(row: JobRowForCriteria): AgentCriteria {
  const skills: string[] = Array.isArray(row.skillsRequired)
    ? row.skillsRequired.filter((s): s is string => typeof s === "string")
    : [];
  // Pull experience hint from the description if present so the agent
  // doesn't have to guess.
  const experienceYears = row.description
    ? extractExperienceFromBrief(row.description)
    : null;
  return {
    jobTitle: row.title ?? "",
    skills,
    location: row.location ?? "",
    experienceYears,
    maxCandidates: FOLLOWUP_DEFAULTS.maxCandidates,
  };
}

/** LLM-first; falls back to the heuristic when no client is provided
 *  or the LLM call fails to return parseable JSON. */
export async function deriveCriteriaFromBrief(
  brief: string,
  llm: LLMClient | null,
): Promise<AgentCriteria> {
  if (!llm) return heuristicCriteriaFromBrief(brief);
  try {
    const prompt = `You are a recruiter intake assistant. Read this hiring brief and return JSON with the search criteria.

Brief:
"""
${brief}
"""

Return ONLY valid JSON in this shape:
{
  "jobTitle": "...",
  "skills": ["...", "..."],
  "location": "Remote | City, ST | (empty if none mentioned)",
  "experienceYears": 0,
  "maxCandidates": 20
}`;
    const { content } = await llm.callText("recruiter_agent_intake", {
      useCase: "recruiter_match",
      systemPrompt: "",
      userMessage: prompt,
    });
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return heuristicCriteriaFromBrief(brief);
    const parsed = JSON.parse(match[0]) as Partial<AgentCriteria>;
    const heur = heuristicCriteriaFromBrief(brief);
    return {
      jobTitle: typeof parsed.jobTitle === "string" && parsed.jobTitle.trim() ? parsed.jobTitle.trim() : heur.jobTitle,
      skills: Array.isArray(parsed.skills) ? parsed.skills.filter((s): s is string => typeof s === "string") : heur.skills,
      location: typeof parsed.location === "string" ? parsed.location.trim() : heur.location,
      experienceYears:
        typeof parsed.experienceYears === "number" && Number.isFinite(parsed.experienceYears)
          ? Math.max(0, Math.min(40, Math.round(parsed.experienceYears)))
          : heur.experienceYears,
      maxCandidates:
        typeof parsed.maxCandidates === "number" && Number.isFinite(parsed.maxCandidates)
          ? Math.max(1, Math.min(50, Math.round(parsed.maxCandidates)))
          : heur.maxCandidates,
    };
  } catch {
    return heuristicCriteriaFromBrief(brief);
  }
}
