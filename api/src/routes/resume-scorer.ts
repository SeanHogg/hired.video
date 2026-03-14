import { Hono } from "hono";
import type { Variables } from "../types/index.js";

export const resumeScorerRoutes = new Hono<{ Variables: Variables }>();

function ok<T>(data: T) {
  return { success: true as const, data, timestamp: new Date().toISOString() };
}

function buildScoreResult() {
  return {
    overallScore: 74,
    atsCompatibility: 78,
    contentQuality: 72,
    keywordScore: 70,
    formatScore: 76,
    impactScore: 71,
    grade: "B",
    strengths: ["Clear structure", "Action-oriented language"],
    weaknesses: ["Could add more measurable outcomes"],
    recommendations: [
      {
        category: "important",
        title: "Add quantified achievements",
        description: "Include metrics such as percentages, revenue, or time saved.",
        impact: 8,
      },
    ],
  };
}

resumeScorerRoutes.post("/score", async (c) => {
  const result = buildScoreResult();
  return c.json(ok({ result: JSON.stringify(result) }), 200);
});

resumeScorerRoutes.post("/category-breakdown", async (c) =>
  c.json(ok({
    atsCompatibility: 78,
    contentQuality: 72,
    keywordScore: 70,
    formatScore: 76,
    impactScore: 71,
  }), 200),
);

resumeScorerRoutes.post("/recommendations", async (c) =>
  c.json(ok(buildScoreResult().recommendations), 200),
);

resumeScorerRoutes.all("*", (c) =>
  c.json(
    { success: false, error: { code: "NOT_IMPLEMENTED", message: "Resume scorer route not implemented" }, timestamp: new Date().toISOString() },
    501,
  ),
);
