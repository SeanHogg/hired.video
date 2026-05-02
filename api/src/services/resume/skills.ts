// skill-extraction.ts — Shared skill extraction logic, consumed by the
// /api/skillextractor route AND the resume parse pipeline. Produces a
// deduplicated, categorised skill list from a job description or resume.

import { z } from "zod";
import { callLLMJsonWithUsage, type LLMUsage } from "../adapters/ai.js";

export const SkillSchema = z.object({
  name: z.string(),
  category: z.enum([
    "technical",
    "soft",
    "tool",
    "language",
    "framework",
    "certification",
    "domain",
    "other",
  ]),
  importance: z.enum(["required", "preferred", "nice-to-have"]).optional(),
});

// ───────────────────────────────────────────────────────────────────────────
// The LLM-facing schema does NOT include `sourceType` — the caller already
// knows it (passes it in as a parameter) and echoing it back through the
// model just confused some providers into returning literal strings like
// `"job" | "resume"` or dropping the rest of the payload entirely. After
// 2026-04-20: we validate only the fields the LLM is actually producing,
// then stamp `sourceType` on the way out. The outer ExtractResponse type
// (consumed by callers) still has sourceType for downstream code.
// ───────────────────────────────────────────────────────────────────────────

const LLMExtractResponseSchema = z.object({
  skills: z.array(SkillSchema).max(80),
  summary: z.string().optional(),
});

export const ExtractResponseSchema = LLMExtractResponseSchema.extend({
  sourceType: z.enum(["job", "resume"]),
});

export type ExtractResponse = z.infer<typeof ExtractResponseSchema>;
export type Skill = z.infer<typeof SkillSchema>;

export const SKILL_EXTRACTOR_PROMPT = `You extract skills from a job description or a resume.

Return ONLY valid JSON matching this exact shape:
{
  "skills": [
    { "name": "<skill name>", "category": "technical"|"soft"|"tool"|"language"|"framework"|"certification"|"domain"|"other", "importance": "required"|"preferred"|"nice-to-have" }
  ],
  "summary": "<one sentence overview of the skills found>"
}

Rules:
- Deduplicate near-identical skills (e.g. "JS" and "JavaScript" → "JavaScript").
- Normalize names to their canonical form (e.g. "react.js" → "React").
- For resumes, set "importance" only when clearly implied by emphasis — otherwise omit it.
- For job descriptions, infer "importance": "required" for must-have sections, "preferred" for preferred/nice sections.
- Limit to the top 40 most relevant skills.
- Do not invent skills that aren't in the text.`;

/** Heuristic fallback used when no LLM is available. */
export function buildFallbackExtraction(
  content: string,
  sourceType: "job" | "resume",
): ExtractResponse {
  const knownSkills: Array<{
    name: string;
    category: Skill["category"];
    patterns: RegExp[];
  }> = [
    { name: "JavaScript", category: "language", patterns: [/\bjavascript\b/i, /\bjs\b/i] },
    { name: "TypeScript", category: "language", patterns: [/\btypescript\b/i, /\bts\b/i] },
    { name: "Python", category: "language", patterns: [/\bpython\b/i] },
    { name: "Java", category: "language", patterns: [/\bjava\b(?!script)/i] },
    { name: "Go", category: "language", patterns: [/\bgolang\b/i, /\bgo\b/i] },
    { name: "Rust", category: "language", patterns: [/\brust\b/i] },
    { name: "C#", category: "language", patterns: [/\bc#\b/i, /\bc sharp\b/i] },
    { name: "SQL", category: "language", patterns: [/\bsql\b/i] },
    { name: "React", category: "framework", patterns: [/\breact\b/i] },
    { name: "Vue", category: "framework", patterns: [/\bvue\b/i] },
    { name: "Angular", category: "framework", patterns: [/\bangular\b/i] },
    { name: "Node.js", category: "framework", patterns: [/\bnode\.?js\b/i] },
    { name: "Next.js", category: "framework", patterns: [/\bnext\.?js\b/i] },
    { name: "Django", category: "framework", patterns: [/\bdjango\b/i] },
    { name: "FastAPI", category: "framework", patterns: [/\bfastapi\b/i] },
    { name: "Spring", category: "framework", patterns: [/\bspring\b/i] },
    { name: "AWS", category: "tool", patterns: [/\baws\b/i, /\bamazon web services\b/i] },
    { name: "GCP", category: "tool", patterns: [/\bgcp\b/i, /\bgoogle cloud\b/i] },
    { name: "Azure", category: "tool", patterns: [/\bazure\b/i] },
    { name: "Docker", category: "tool", patterns: [/\bdocker\b/i] },
    { name: "Kubernetes", category: "tool", patterns: [/\bkubernetes\b/i, /\bk8s\b/i] },
    { name: "Terraform", category: "tool", patterns: [/\bterraform\b/i] },
    { name: "Git", category: "tool", patterns: [/\bgit\b/i] },
    { name: "PostgreSQL", category: "tool", patterns: [/\bpostgres\b/i, /\bpostgresql\b/i] },
    { name: "MongoDB", category: "tool", patterns: [/\bmongodb\b/i, /\bmongo\b/i] },
    { name: "Redis", category: "tool", patterns: [/\bredis\b/i] },
    { name: "GraphQL", category: "framework", patterns: [/\bgraphql\b/i] },
    { name: "REST APIs", category: "technical", patterns: [/\brest\b/i, /\brestful\b/i] },
    { name: "CI/CD", category: "technical", patterns: [/\bci\/cd\b/i, /\bcontinuous integration\b/i] },
    { name: "Machine Learning", category: "domain", patterns: [/\bmachine learning\b/i, /\bml\b/i] },
    { name: "Leadership", category: "soft", patterns: [/\bleadership\b/i, /\blead\b/i] },
    { name: "Communication", category: "soft", patterns: [/\bcommunication\b/i] },
    { name: "Problem Solving", category: "soft", patterns: [/\bproblem[- ]solving\b/i] },
    { name: "Collaboration", category: "soft", patterns: [/\bcollaborat/i, /\bteamwork\b/i] },
    { name: "Agile", category: "technical", patterns: [/\bagile\b/i] },
    { name: "Scrum", category: "technical", patterns: [/\bscrum\b/i] },
  ];

  const found = knownSkills
    .filter((s) => s.patterns.some((re) => re.test(content)))
    .map(({ name, category }) => ({ name, category }));

  return {
    sourceType,
    skills: found,
    summary:
      found.length === 0
        ? "No common skills detected in the text."
        : `Detected ${found.length} common ${sourceType === "job" ? "job-description" : "resume"} skill${found.length === 1 ? "" : "s"}.`,
  };
}

/**
 * Extract skills via LLM with a 20s timeout and a heuristic fallback when
 * the provider is unavailable or slow. Callers that need billing/usage
 * data receive the raw LLM usage alongside the result.
 */
export async function extractSkills(
  apiKey: string | null,
  content: string,
  sourceType: "job" | "resume",
): Promise<{ data: ExtractResponse; usage?: LLMUsage }> {
  if (!apiKey) {
    return { data: buildFallbackExtraction(content, sourceType) };
  }

  const LLM_TIMEOUT_MS = 20_000;
  const llmCall = callLLMJsonWithUsage(
    apiKey,
    {
      useCase: "skill_extract",
      systemPrompt: SKILL_EXTRACTOR_PROMPT,
      // `Source type` is informational context for the prompt — not an
      // output field. Keeping it in the user message lets the model
      // calibrate importance ("required" vs "preferred" weighting), but
      // the validated output schema no longer asks for it back.
      userMessage: `Source type: ${sourceType}\n\nText:\n${content.slice(0, 6000)}`,
    },
    LLMExtractResponseSchema,
  );

  try {
    const result = await Promise.race([
      llmCall,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`LLM timeout after ${LLM_TIMEOUT_MS}ms`)),
          LLM_TIMEOUT_MS,
        ),
      ),
    ]);
    // Stamp sourceType from the caller, not the LLM — we own this value.
    return {
      data: { sourceType, skills: result.data.skills, summary: result.data.summary },
      usage: result.usage,
    };
  } catch (err) {
    console.error(
      "[skill-extraction] LLM error, falling back to heuristic:",
      err,
    );
    return { data: buildFallbackExtraction(content, sourceType) };
  }
}

// ─── Merge extracted skills into JSON Resume skills[] ─────────────────────

type ResumeSkill = { name: string; level?: string; keywords?: string[] };

const categoryToGroupName: Record<Skill["category"], string> = {
  technical: "Technical",
  soft: "Soft Skills",
  tool: "Tools",
  language: "Languages",
  framework: "Frameworks",
  certification: "Certifications",
  domain: "Domain",
  other: "Skills",
};

/**
 * Group a flat Skill[] into JSON Resume skills[] entries (one per category)
 * with the skill names as `keywords`. Merges into an existing skills array,
 * deduplicating keywords case-insensitively.
 */
export function mergeExtractedSkillsIntoResume(
  existing: unknown,
  extracted: Skill[],
): ResumeSkill[] {
  const base: ResumeSkill[] = Array.isArray(existing)
    ? (existing as ResumeSkill[]).map((s) => ({
        name: s?.name ?? "",
        level: s?.level ?? "",
        keywords: Array.isArray(s?.keywords) ? [...s.keywords] : [],
      }))
    : [];

  const findGroup = (name: string) =>
    base.find((g) => (g.name ?? "").toLowerCase() === name.toLowerCase());

  const addKeyword = (groupName: string, keyword: string) => {
    let group = findGroup(groupName);
    if (!group) {
      group = { name: groupName, level: "", keywords: [] };
      base.push(group);
    }
    const kws = group.keywords ?? (group.keywords = []);
    const lower = keyword.toLowerCase();
    if (!kws.some((k) => k.toLowerCase() === lower)) {
      kws.push(keyword);
    }
  };

  for (const skill of extracted) {
    if (!skill?.name) continue;
    const groupName = categoryToGroupName[skill.category] ?? "Skills";
    addKeyword(groupName, skill.name);
  }

  return base.filter(
    (g) => (g.keywords && g.keywords.length > 0) || (g.name && g.name.length > 0),
  );
}

/**
 * Count the total number of distinct skill items in a JSON Resume skills[].
 * Used to decide whether the primary parse captured enough skills to skip
 * the extractor enrichment pass.
 */
export function countSkillItems(skills: unknown): number {
  if (!Array.isArray(skills)) return 0;
  let total = 0;
  for (const s of skills as ResumeSkill[]) {
    if (!s) continue;
    const name = (s.name ?? "").trim();
    const keywords = Array.isArray(s.keywords) ? s.keywords.filter(Boolean) : [];
    if (keywords.length > 0) total += keywords.length;
    else if (name) total += 1;
  }
  return total;
}
