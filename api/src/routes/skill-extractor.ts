import { Hono } from "hono";
import { z } from "zod";
import type { Env, Variables } from "../types/index.js";
import { success } from "../types/index.js";
import { getApiKey } from "../services/ai.js";
import { aiCall } from "../services/ai-call.js";
import { attachTokenBudget } from "../middleware/tierEnforcement.js";
import { extractSkills } from "../services/skill-extraction.js";

export const skillExtractorRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();
skillExtractorRoutes.use("*", attachTokenBudget());

const ExtractRequestSchema = z.object({
  content: z.string().min(10).max(50000),
  sourceType: z.enum(["job", "resume"]).optional(),
});

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
  const apiKey = getApiKey(c.env);

  const result = await aiCall(c, "skill_extractor", () =>
    extractSkills(apiKey ?? null, parsed.data.content, sourceType),
  );
  if (result instanceof Response) return result; // 429 — over budget
  return c.json(success(result.data), 200);
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
