import { Hono } from "hono";
import type { Variables } from "../types/index.js";
import { requirePremium } from "../middleware/tierEnforcement.js";

export const salaryRoutes = new Hono<{ Variables: Variables }>();

function ok<T>(data: T) {
  return { success: true as const, data, timestamp: new Date().toISOString() };
}

function buildSalaryPayload(body: Record<string, unknown>) {
  const experience =
    typeof body.experienceYears === "number"
      ? body.experienceYears
      : typeof body.yearsExperience === "number"
        ? body.yearsExperience
        : 0;

  const base = 60000 + Math.max(0, experience) * 3500;
  const low = Math.round(base * 0.85);
  const high = Math.round(base * 1.2);

  return {
    medianSalary: Math.round(base),
    estimatedSalary: Math.round(base),
    salaryRange: { min: low, max: high },
    percentiles: {
      p10: Math.round(base * 0.7),
      p25: Math.round(base * 0.85),
      p50: Math.round(base),
      p75: Math.round(base * 1.15),
      p90: Math.round(base * 1.3),
    },
    locationAdjustment: 1,
    industryComparison: {
      industry: typeof body.industry === "string" ? body.industry : "general",
      marketPosition: "competitive",
    },
  };
}

salaryRoutes.post("/analyze", requirePremium("Salary Calculator"), async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  return c.json(ok(buildSalaryPayload(body)), 200);
});

salaryRoutes.post("/negotiation-tips", requirePremium("Salary Negotiation Tips"), async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const currentOffer = typeof body.currentOffer === "number" ? body.currentOffer : undefined;
  const marketRate = typeof body.marketRate === "number" ? body.marketRate : undefined;

  return c.json(
    ok({
      strategies: [
        "Lead with market data and role impact.",
        "Anchor your range slightly above your target.",
      ],
      talkingPoints: [
        "Summarize outcomes and measurable impact.",
        "Frame compensation as alignment with current market benchmarks.",
      ],
      targetRange:
        currentOffer && marketRate
          ? {
              min: Math.round(Math.max(currentOffer, marketRate) * 1.02),
              max: Math.round(Math.max(currentOffer, marketRate) * 1.12),
            }
          : undefined,
    }),
    200,
  );
});

salaryRoutes.all("*", (c) =>
  c.json(
    {
      success: false,
      error: { code: "NOT_IMPLEMENTED", message: "Salary routes coming soon" },
      timestamp: new Date().toISOString(),
    },
    501,
  ),
);
