import { Hono } from "hono";
import { z } from "zod";
import type { Env, Variables } from "../types/index.js";
import { success } from "../types/index.js";
import { callLLMJsonWithUsage, getApiKey } from "../services/ai.js";
import { recordTokenUsage } from "../services/billing.js";
import { attachTokenBudget, checkTokenBudget } from "../middleware/tierEnforcement.js";

export const skillExtractorRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();
skillExtractorRoutes.use("*", attachTokenBudget());

const ExtractRequestSchema = z.object({
  content: z.string().min(10).max(50000),
  sourceType: z.enum(["job", "resume"]).optional(),
});

const SkillSchema = z.object({
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

const ExtractResponseSchema = z.object({
  sourceType: z.enum(["job", "resume"]),
  skills: z.array(SkillSchema).max(80),
  summary: z.string().optional(),
});

type ExtractResponse = z.infer<typeof ExtractResponseSchema>;

const SYSTEM_PROMPT = `You extract skills from a job description or a resume.

Return ONLY valid JSON matching this exact shape:
{
  "sourceType": "job" | "resume",
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

// Heuristic fallback when the LLM is unavailable. Returns a coarse match on a
// curated skill list so the tool still returns something useful without an API key.
function buildFallbackExtraction(content: string, sourceType: "job" | "resume"): ExtractResponse {
  const knownSkills: Array<{ name: string; category: z.infer<typeof SkillSchema>["category"]; patterns: RegExp[] }> = [
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

skillExtractorRoutes.post("/extract", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = ExtractRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        success: false as const,
        error: {
          code: "VALIDATION_ERROR",
          message: "content is required (10–50 000 chars)",
          details: parsed.error.flatten(),
        },
        timestamp: new Date().toISOString(),
      },
      400,
    );
  }

  const sourceType = parsed.data.sourceType ?? "resume";

  const userId = c.var.user?.sub;
  if (userId) {
    const blocked = await checkTokenBudget(c as any);
    if (blocked) return blocked;
  }

  const apiKey = getApiKey(c.env);
  if (apiKey) {
    // Cap the whole LLM call (incl. provider fallback chain) at 20s so we
    // stay well under the client's 30s timeout. If we can't get a structured
    // response in time, return the heuristic fallback instead of letting the
    // request hang.
    const LLM_TIMEOUT_MS = 20_000;
    const llmCall = callLLMJsonWithUsage(
      apiKey,
      {
        temperature: 0,
        // Cap output tokens — a categorized skill list is small. Keeps each
        // provider attempt fast and prevents runaway completions.
        maxTokens: 900,
        systemPrompt: SYSTEM_PROMPT,
        userMessage: `Source type: ${sourceType}\n\nText:\n${parsed.data.content.slice(0, 6000)}`,
      },
      ExtractResponseSchema,
    );

    try {
      const { data, usage } = await Promise.race([
        llmCall,
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`LLM timeout after ${LLM_TIMEOUT_MS}ms`)),
            LLM_TIMEOUT_MS,
          ),
        ),
      ]);

      if (userId) {
        void recordTokenUsage({
          userId,
          model: usage.model,
          featureKey: "skill_extractor",
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
        });
      }

      return c.json(success(data), 200);
    } catch (err) {
      console.error("[skill-extractor] LLM error, falling back to heuristic:", err);
    }
  }

  return c.json(success(buildFallbackExtraction(parsed.data.content, sourceType)), 200);
});

skillExtractorRoutes.all("*", (c) =>
  c.json(
    {
      success: false as const,
      error: { code: "NOT_IMPLEMENTED", message: "Skill extractor route not implemented" },
      timestamp: new Date().toISOString(),
    },
    501,
  ),
);
