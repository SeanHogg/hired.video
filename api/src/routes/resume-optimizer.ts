import { Hono } from "hono";
import type { Variables } from "../types/index.js";
import { success } from "../types/index.js";
import { checkAIUsage } from "../middleware/tierEnforcement.js";

export const resumeOptimizerRoutes = new Hono<{ Variables: Variables }>();

function buildOptimizationResult() {
  return {
    overallScore: 79,
    atsScore: 82,
    keywordScore: 75,
    formatScore: 80,
    contentScore: 78,
    suggestions: [
      {
        type: "important",
        category: "keywords",
        title: "Include role-specific keywords",
        description: "Mirror terms from target job descriptions in your experience bullets.",
        impact: "High",
      },
    ],
    optimizedContent: "Optimized resume content draft.",
  };
}

resumeOptimizerRoutes.post("/optimize", async (c) => {
  const limitError = await checkAIUsage(c as any);
  if (limitError) return limitError;
  return c.json(success(buildOptimizationResult()), 200);
});

resumeOptimizerRoutes.post("/ats-analysis", async (c) => {
  const limitError = await checkAIUsage(c as any);
  if (limitError) return limitError;
  return c.json(success({ score: 82, issues: [] }), 200);
});
resumeOptimizerRoutes.post("/keyword-suggestions", async (c) => {
  const limitError = await checkAIUsage(c as any);
  if (limitError) return limitError;
  // Wrap the raw keyword array in an object so every route's `data` field
  // is consistently an object (fixes LSP violation flagged in roadmap #147).
  return c.json(success({ keywords: ["leadership", "automation", "cross-functional"] }), 200);
});

resumeOptimizerRoutes.all("*", (c) =>
  c.json(
    { success: false as const, error: { code: "NOT_IMPLEMENTED", message: "Resume optimizer route not implemented" }, timestamp: new Date().toISOString() },
    501,
  ),
);
