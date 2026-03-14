import { Hono } from "hono";
import type { Variables } from "../types/index.js";

export const valuePropositionRoutes = new Hono<{ Variables: Variables }>();

function ok<T>(data: T) {
  return { success: true as const, data, timestamp: new Date().toISOString() };
}

function buildResponse() {
  return {
    valueProposition:
      "I combine execution speed, cross-functional collaboration, and measurable product impact to help teams deliver outcomes faster.",
    executiveSummary:
      "Strong alignment between role expectations and demonstrated delivery across planning, implementation, and stakeholder communication.",
    keyStrengths: [
      "Translates ambiguous requirements into clear deliverables",
      "Balances quality with delivery velocity",
      "Communicates effectively with technical and non-technical stakeholders",
    ],
    alignmentPoints: [
      "Relevant domain experience",
      "Evidence of ownership across project lifecycle",
      "Consistent focus on measurable outcomes",
    ],
    callToAction:
      "Recommend moving forward to a focused interview on impact examples and role-specific execution scenarios.",
    confidenceScore: 0.82,
  };
}

valuePropositionRoutes.post("/generate/content", async (c) => {
  await c.req.json().catch(() => ({}));
  return c.json(ok(buildResponse()), 200);
});
valuePropositionRoutes.post("/generate/job-content-resume-id", async (c) => {
  await c.req.json().catch(() => ({}));
  return c.json(ok(buildResponse()), 200);
});
valuePropositionRoutes.post("/generate/job-id-resume-id", async (c) => {
  await c.req.json().catch(() => ({}));
  return c.json(ok(buildResponse()), 200);
});
valuePropositionRoutes.post("/generate/job-id-resume-content", async (c) => {
  await c.req.json().catch(() => ({}));
  return c.json(ok(buildResponse()), 200);
});

valuePropositionRoutes.all("*", (c) =>
  c.json(
    {
      success: false,
      error: { code: "NOT_IMPLEMENTED", message: "Value proposition routes coming soon" },
      timestamp: new Date().toISOString(),
    },
    501,
  ),
);
