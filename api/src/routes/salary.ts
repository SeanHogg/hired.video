import { Hono } from "hono";
import type { Variables } from "../types/index.js";
import { success } from "../types/index.js";
import { attachTokenBudget, requirePremium } from "../middleware/tierEnforcement.js";

export const salaryRoutes = new Hono<{ Variables: Variables }>();
salaryRoutes.use("*", attachTokenBudget());

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

const INDUSTRIES = [
  { id: "technology", name: "Technology", subcategories: ["Software Engineering", "Data Science", "Product Management", "DevOps", "Cybersecurity"] },
  { id: "finance", name: "Finance & Banking", subcategories: ["Investment Banking", "Asset Management", "FinTech", "Insurance", "Accounting"] },
  { id: "healthcare", name: "Healthcare", subcategories: ["Nursing", "Pharmaceuticals", "Medical Devices", "Hospital Administration", "Telehealth"] },
  { id: "marketing", name: "Marketing & Advertising", subcategories: ["Digital Marketing", "Brand Management", "Content Strategy", "Performance Marketing", "PR"] },
  { id: "sales", name: "Sales", subcategories: ["Account Executive", "Business Development", "Sales Engineering", "Customer Success", "Revenue Operations"] },
  { id: "design", name: "Design & Creative", subcategories: ["UX/UI Design", "Graphic Design", "Motion Design", "Product Design", "Art Direction"] },
  { id: "operations", name: "Operations & Logistics", subcategories: ["Supply Chain", "Project Management", "Business Operations", "Procurement", "Facilities"] },
  { id: "legal", name: "Legal", subcategories: ["Corporate Law", "Intellectual Property", "Compliance", "Paralegal", "Contract Management"] },
  { id: "hr", name: "Human Resources", subcategories: ["Talent Acquisition", "People Operations", "Compensation & Benefits", "L&D", "HRBP"] },
  { id: "education", name: "Education", subcategories: ["K-12 Teaching", "Higher Education", "EdTech", "Curriculum Design", "Corporate Training"] },
  { id: "consulting", name: "Consulting", subcategories: ["Management Consulting", "Strategy", "IT Consulting", "HR Consulting", "Financial Advisory"] },
  { id: "retail", name: "Retail & E-commerce", subcategories: ["Merchandising", "E-commerce Management", "Store Operations", "Category Management", "Visual Merchandising"] },
  { id: "manufacturing", name: "Manufacturing & Engineering", subcategories: ["Mechanical Engineering", "Electrical Engineering", "Quality Assurance", "Process Engineering", "Lean/Six Sigma"] },
  { id: "media", name: "Media & Entertainment", subcategories: ["Journalism", "Video Production", "Podcasting", "Social Media", "Publishing"] },
  { id: "real_estate", name: "Real Estate", subcategories: ["Commercial Real Estate", "Residential Sales", "Property Management", "Development", "REITs"] },
  { id: "nonprofit", name: "Nonprofit & Government", subcategories: ["Program Management", "Grant Writing", "Policy", "Community Outreach", "Public Administration"] },
];

// GET /api/salarycalculator/industries — industry list with subcategories
salaryRoutes.get("/industries", (c) => {
  return c.json(success({ industries: INDUSTRIES }), 200);
});

salaryRoutes.post("/analyze", requirePremium("Salary Calculator"), async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  return c.json(success(buildSalaryPayload(body)), 200);
});

salaryRoutes.post("/negotiation-tips", requirePremium("Salary Negotiation Tips"), async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const currentOffer = typeof body.currentOffer === "number" ? body.currentOffer : undefined;
  const marketRate = typeof body.marketRate === "number" ? body.marketRate : undefined;

  return c.json(
    success({
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
      success: false as const,
      error: { code: "NOT_IMPLEMENTED", message: "Salary routes coming soon" },
      timestamp: new Date().toISOString(),
    },
    501,
  ),
);
