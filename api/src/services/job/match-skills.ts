/**
 * Skill lists for POST /api/match/analyze (`matchedSkills` / `missingSkills`).
 *
 * The AI path asks the SAME match_analyze call that scores the résumé to also
 * name the job's skills it found / didn't find (no extra LLM call). The
 * keyword fallback (no LLM, or the call failed) can only see the résumé's own
 * skills, so it reports the ones the job text mentions and no missing list.
 */
import { z } from "zod";

/** Cap per list — enough for a fit panel, small enough for the payload. */
const MAX_SKILLS = 25;

/** Trim, drop empties, de-duplicate case-insensitively (first spelling wins), cap. */
export function normalizeSkillList(values: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (typeof v !== "string") continue;
    const skill = v.trim().replace(/\s+/g, " ");
    const key = skill.toLowerCase();
    if (!skill || skill.length > 80 || seen.has(key)) continue;
    seen.add(key);
    out.push(skill);
    if (out.length >= MAX_SKILLS) break;
  }
  return out;
}

/** Lenient: a missing or malformed list from the model reads as []. */
const SkillListSchema = z.array(z.unknown()).catch([]).transform(normalizeSkillList);

export const AnalyzeSkillsSchema = z.object({
  matchedSkills: SkillListSchema,
  missingSkills: SkillListSchema,
});

/** The JSON fragment the analyze prompt asks for alongside score + recommendations. */
export const ANALYZE_SKILLS_PROMPT_FRAGMENT =
  `"matchedSkills": ["<skill the job asks for that the resume shows>"], "missingSkills": ["<skill the job asks for that the resume lacks>"]`;

/** The résumé's declared skills (JSON Resume `skills[].name` + `keywords`). */
export function resumeSkillNames(content: unknown): string[] {
  const skills = (content as { skills?: unknown } | null)?.skills;
  if (!Array.isArray(skills)) return [];
  const names: string[] = [];
  for (const s of skills) {
    if (typeof s === "string") names.push(s);
    else if (s && typeof s === "object") {
      const { name, keywords } = s as { name?: unknown; keywords?: unknown };
      if (typeof name === "string") names.push(name);
      if (Array.isArray(keywords)) for (const k of keywords) if (typeof k === "string") names.push(k);
    }
  }
  return names.map((n) => n.trim()).filter(Boolean);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Keyword fallback: résumé skills the job text mentions (whole-word, case-insensitive). */
export function keywordSkillLists(
  resumeContent: unknown,
  jobText: string,
): { matchedSkills: string[]; missingSkills: string[] } {
  const haystack = jobText.toLowerCase();
  const matched = resumeSkillNames(resumeContent).filter((skill) =>
    new RegExp(`(^|[^a-z0-9])${escapeRe(skill.toLowerCase())}($|[^a-z0-9])`).test(haystack),
  );
  return { matchedSkills: normalizeSkillList(matched), missingSkills: [] };
}
