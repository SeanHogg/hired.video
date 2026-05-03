// skill-extraction.ts — Shared skill extraction logic, consumed by the
// /api/skillextractor route AND the resume parse pipeline. Produces a
// deduplicated, categorised skill list from a job description or resume.
//
// The 2026-05-02 upgrade asks the LLM for three additional fields on
// resume-side extraction: proficiency level, years of experience, and
// evidence labels (the items the skill was used at). The labels are
// resolved server-side to section-item UUIDs by `mergeExtractedSkillsIntoResume`,
// which builds `content.skillEvidence` rows in the same shape the
// SkillNetwork visualizer reads. We never trust the LLM to mint UUIDs —
// it produces human labels and the resolver does the binding.

import { z } from "zod";
import { callLLMJsonWithUsage, type LLMUsage } from "../adapters/ai.js";
import {
  resolveItemByLabel,
  listResolvableItems,
  dedupeAndOptimizeSkills,
  type ResolvedItem,
} from "../../../../shared/skill-evidence.js";
import {
  SKILL_LEVELS,
  type ResumeContent,
  type Skill as ResumeSkillType,
  type SkillEvidence,
} from "../../../../shared/resume.js";

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
  /** Resume-side enrichment, filled in for resumes; ignored for jobs. */
  level: z.enum(SKILL_LEVELS).optional(),
  yearsOfExperience: z.number().nonnegative().max(60).optional(),
  /** Free-form labels for the work / volunteer / project / education
   *  items where this skill was applied. e.g. "Senior Engineer at Stripe"
   *  or "Payments Migration Project". The server resolves these to
   *  section-item UUIDs via `resolveItemByLabel`. */
  evidenceLabels: z.array(z.string()).max(20).optional(),
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

// ─── Prompt builders ───────────────────────────────────────────────────────

const BASE_PROMPT = `You extract skills from a job description or a resume.

Return ONLY valid JSON matching this exact shape:
{
  "skills": [
    {
      "name": "<skill name>",
      "category": "technical"|"soft"|"tool"|"language"|"framework"|"certification"|"domain"|"other",
      "importance": "required"|"preferred"|"nice-to-have",
      "level": "Beginner"|"Intermediate"|"Advanced"|"Expert",
      "yearsOfExperience": <number>,
      "evidenceLabels": ["<label of work/volunteer/project/education item where this skill was used>"]
    }
  ],
  "summary": "<one sentence overview of the skills found>"
}

Rules:
- Deduplicate near-identical skills (e.g. "JS" and "JavaScript" → "JavaScript").
- Normalize names to their canonical form (e.g. "react.js" → "React").
- For job descriptions, infer "importance": "required" for must-have sections, "preferred" for preferred/nice sections. Omit "level", "yearsOfExperience", and "evidenceLabels" — those describe a candidate, not a job.
- For resumes:
  - Set "level" only when supported by years used or explicit phrasing ("expert in", "deep experience"). When unclear, omit it.
  - Set "yearsOfExperience" by summing the date ranges of items where the skill was demonstrated. If you can't anchor it to dated evidence, omit it.
  - Set "evidenceLabels" to the exact titles of the work / volunteer / project / education / certificate items where the skill was used. Use the "Position at Organization" form for jobs (e.g. "Senior Engineer at Stripe"), the project name for projects, and the institution + degree for education. If a skill is asserted but not tied to a specific item, omit "evidenceLabels".
  - Only include items that appear in the resume — do not invent positions or projects.
  - Set "importance" only when clearly emphasized.
- Limit to the top 40 most relevant skills.
- Do not invent skills that aren't in the text.`;

/** Build the system prompt. When `items` is provided (resume-side calls),
 *  inject a list of the resume's section items so the LLM can produce
 *  evidenceLabels that the resolver can actually bind. Without this
 *  context the model often fabricates plausible-sounding labels that
 *  match nothing — the resolver drops them, but billing the user for
 *  a wasted call is worse than a slightly longer prompt. */
export function buildSkillExtractorPrompt(items?: ResolvedItem[]): string {
  if (!items || items.length === 0) return BASE_PROMPT;
  const lines = items
    .slice(0, 40)
    .map((it) => {
      const dateRange = [it.startDate, it.endDate].filter(Boolean).join(" – ");
      const orgPart = it.organization ? ` @ ${it.organization}` : "";
      const datePart = dateRange ? ` (${dateRange})` : "";
      return `- [${it.itemType}] ${it.title}${orgPart}${datePart}`;
    })
    .join("\n");
  return `${BASE_PROMPT}

Resume items available for evidenceLabels (use the title/organization shown — anything else won't bind):
${lines}`;
}

export const SKILL_EXTRACTOR_PROMPT = BASE_PROMPT;

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
 *
 * `items` is optional resume-side context — when provided, the prompt
 * lists the section items the LLM may reference in `evidenceLabels`,
 * and the LLM has a fighting chance of returning labels that bind.
 */
export async function extractSkills(
  apiKey: string | null,
  content: string,
  sourceType: "job" | "resume",
  items?: ResolvedItem[],
): Promise<{ data: ExtractResponse; usage?: LLMUsage }> {
  if (!apiKey) {
    return { data: buildFallbackExtraction(content, sourceType) };
  }

  const LLM_TIMEOUT_MS = 20_000;
  const llmCall = callLLMJsonWithUsage(
    apiKey,
    {
      useCase: "skill_extract",
      systemPrompt: buildSkillExtractorPrompt(sourceType === "resume" ? items : undefined),
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

type ResumeSkill = {
  id?: string;
  name: string;
  level?: string;
  keywords?: string[];
  yearsOfExperience?: number;
};

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
 *
 * Backwards-compatible signature: when called with two arguments (the
 * historical shape) it behaves exactly as before. The third argument
 * unlocks evidence-row generation and pulls level/years onto the
 * matching keyword's nearest skill row when the LLM provided them.
 */
export function mergeExtractedSkillsIntoResume(
  existing: unknown,
  extracted: Skill[],
): ResumeSkill[];
export function mergeExtractedSkillsIntoResume(
  existing: unknown,
  extracted: Skill[],
  ctx: {
    /** Resume content the merge is being folded into — used to resolve
     *  evidenceLabels to section-item UUIDs and to read the existing
     *  evidence array (caller assigns the returned `evidence` back). */
    content: ResumeContent;
    /** Function that mints a fresh evidence row id. UUIDs are minted
     *  server-side so the wire format stays canonical. Defaults to
     *  `crypto.randomUUID()` when available. */
    newId?: () => string;
    /** Clock injection for tests. */
    now?: Date;
  },
): { skills: ResumeSkill[]; evidence: SkillEvidence[] };
export function mergeExtractedSkillsIntoResume(
  existing: unknown,
  extracted: Skill[],
  ctx?: { content: ResumeContent; newId?: () => string; now?: Date },
): ResumeSkill[] | { skills: ResumeSkill[]; evidence: SkillEvidence[] } {
  const base: ResumeSkill[] = Array.isArray(existing)
    ? (existing as ResumeSkill[]).map((s) => ({
        id: s?.id,
        name: s?.name ?? "",
        level: s?.level ?? "",
        keywords: Array.isArray(s?.keywords) ? [...s.keywords] : [],
        yearsOfExperience: s?.yearsOfExperience,
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

  // Optimize the merged list before returning: drop bare top-level rows
  // whose name is already a keyword in another category, collapse case-
  // insensitive name duplicates, dedupe keywords. Without this, every
  // re-run of the extractor on the same resume grew the skills array
  // with the same content under slightly different shapes.
  const skills = dedupeAndOptimizeSkills(
    base.filter(
      (g) => (g.keywords && g.keywords.length > 0) || (g.name && g.name.length > 0),
    ),
  );

  if (!ctx) return skills;

  // ─── Evidence rows ───
  const items = listResolvableItems(ctx.content);
  const existingEvidence: SkillEvidence[] = Array.isArray(ctx.content.skillEvidence)
    ? [...(ctx.content.skillEvidence as SkillEvidence[])]
    : [];
  const seen = new Set(
    existingEvidence.map(
      (e) => `${e.skillName.toLowerCase().trim()}::${e.referenceId}`,
    ),
  );
  const mintId =
    ctx.newId ??
    ((): string =>
      (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID?.() ??
      `ev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`);
  const nowIso = (ctx.now ?? new Date()).toISOString();

  for (const skill of extracted) {
    if (!skill?.name) continue;
    const labels = skill.evidenceLabels ?? [];
    for (const label of labels) {
      const item = resolveItemByLabel(label, items);
      if (!item) continue;
      const dedupeKey = `${skill.name.toLowerCase().trim()}::${item.id}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      existingEvidence.push({
        id: mintId(),
        skillName: skill.name,
        itemType: item.itemType,
        referenceId: item.id,
        source: "extracted",
        createdAt: nowIso,
      });
    }
  }

  return { skills, evidence: existingEvidence };
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

// Re-export the shared resume Skill alias under a distinct name so callers
// in this file that need the JSON-Resume-shaped skill (with id/level/years)
// don't collide with the LLM-output Skill alias above.
export type { ResumeSkillType };
