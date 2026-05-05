/**
 * Thin HTTP route layer for /api/salarycalculator.
 *
 * Business logic lives in services/salary/handlers.ts. This file only:
 *   1. Builds SalaryDeps from the Hono request env (LLM client + usage).
 *   2. Parses the JSON body.
 *   3. Delegates to the handler and returns its HandlerResult.
 *
 * Behaviour: AI-first (qwen3-coder for /analyze, gemma for
 * /negotiation-tips — see USE_CASE_PROFILES). When no provider key is
 * configured or every fallback model fails, the handler returns a
 * deterministic stub keyed off years-of-experience so the UI never
 * shows a hard error.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import type { Variables } from "../types/index.js";
import { success } from "../types/index.js";
import {
  attachTokenBudget,
  checkTokenBudget,
  requirePro,
} from "../middleware/tierEnforcement.js";
import { recordTokenUsage } from "../services/billing/BillingService.js";
import { createLLMClient } from "../services/adapters/llm-client.js";
import { getProviderApiKey } from "../services/adapters/providers.js";
import {
  handleAnalyze,
  handleNegotiationTips,
  type SalaryDeps,
} from "../services/salary/handlers.js";

export const salaryRoutes = new Hono<{ Variables: Variables }>();
salaryRoutes.use("*", attachTokenBudget());

// ---------------------------------------------------------------------------
// Dep wiring — one source of truth for prod. Tests wire up their own.
// ---------------------------------------------------------------------------

function buildSalaryDeps(c: Context<{ Variables: Variables }>): SalaryDeps {
  const env = (c.env as any) ?? {};
  const hasAnyKey =
    !!getProviderApiKey(env, "openrouter") || !!getProviderApiKey(env, "cerebras");

  return {
    llm: hasAnyKey ? createLLMClient(env, c.var.user) : null,
    recordUsage: ({ userId, usage, featureKey }) => {
      void recordTokenUsage({
        userId,
        model: usage.model,
        featureKey,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
      });
    },
  };
}

async function relay(
  c: Context<{ Variables: Variables }>,
  handlerResult: Promise<{ status: number; body: unknown }>,
) {
  const limitError = await checkTokenBudget(c as any);
  if (limitError) return limitError;
  const { status, body } = await handlerResult;
  return c.json(body as any, status as any);
}

// ---------------------------------------------------------------------------
// Industries catalog — static reference data, no AI.
// ---------------------------------------------------------------------------

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

salaryRoutes.get("/industries", (c) => {
  return c.json(success({ industries: INDUSTRIES }), 200);
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

salaryRoutes.post("/analyze", requirePro("Salary Calculator"), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return relay(
    c,
    handleAnalyze(buildSalaryDeps(c), c.var.user?.sub ?? null, body),
  );
});

salaryRoutes.post(
  "/negotiation-tips",
  requirePro("Salary Negotiation Tips"),
  async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return relay(
      c,
      handleNegotiationTips(buildSalaryDeps(c), c.var.user?.sub ?? null, body),
    );
  },
);

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
