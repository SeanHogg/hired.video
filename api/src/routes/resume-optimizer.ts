import { Hono } from "hono";
import type { Variables } from "../types/index.js";

export const resumeOptimizerRoutes = new Hono<{ Variables: Variables }>();

function ok<T>(data: T) {
  return { success: true as const, data, timestamp: new Date().toISOString() };
}

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
  const result = buildOptimizationResult();
  return c.json(ok({ result: JSON.stringify(result) }), 200);
});

resumeOptimizerRoutes.post("/ats-analysis", async (c) => c.json(ok({ score: 82, issues: [] }), 200));
resumeOptimizerRoutes.post("/keyword-suggestions", async (c) => c.json(ok(["leadership", "automation", "cross-functional"]), 200));

resumeOptimizerRoutes.all("*", (c) =>
  c.json(
    { success: false, error: { code: "NOT_IMPLEMENTED", message: "Resume optimizer route not implemented" }, timestamp: new Date().toISOString() },
    501,
  ),
);
