import { Hono } from "hono";
import type { Variables } from "../types/index.js";
import { success } from "../types/index.js";
import { attachTokenBudget, requireTokenBudget } from "../middleware/tierEnforcement.js";

export const valuePropositionRoutes = new Hono<{ Variables: Variables }>();
valuePropositionRoutes.use("*", attachTokenBudget());

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

// One generator for all four variants — they only differ by how the
// caller identifies the job+resume pair. The budget gate is applied via
// middleware at the route registration (roadmap #148).
async function generate(c: any) {
  await c.req.json().catch(() => ({}));
  return c.json(success(buildResponse()), 200);
}

valuePropositionRoutes.post("/generate/content", requireTokenBudget(), generate);
valuePropositionRoutes.post("/generate/job-content-resume-id", requireTokenBudget(), generate);
valuePropositionRoutes.post("/generate/job-id-resume-id", requireTokenBudget(), generate);
valuePropositionRoutes.post("/generate/job-id-resume-content", requireTokenBudget(), generate);

valuePropositionRoutes.all("*", (c) =>
  c.json(
    {
      success: false as const,
      error: { code: "NOT_IMPLEMENTED", message: "Value proposition routes coming soon" },
      timestamp: new Date().toISOString(),
    },
    501,
  ),
);
