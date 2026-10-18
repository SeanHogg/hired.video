import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../types/index.js";
import { success } from "../types/index.js";
import { requirePro, checkAIUsage } from "../middleware/tierEnforcement.js";
import { createLLMClient, hasAnyLLMProviderKey } from "../services/adapters/llm-client.js";
import { aiFailure } from "../services/adapters/llm-error.js";
import { cacheMiddleware } from "../utils/cache-headers.js";
import { etagMiddleware } from "../utils/etag.js";
import {
  buildBaseDashboard,
  getBaseDashboard,
  getEmployerDashboard,
  getJobseekerDashboard,
  getRecruiterDashboard,
} from "../services/dashboard/roleDashboards.js";
import {
  getCareerProgress,
  getCopilotMetrics,
  getExtensionAnalytics,
  getInsightsFunnelMetrics,
} from "../services/dashboard/seekerInsights.js";
import { requireUser } from "./helpers/routerHelpers.js";

export const dashboardRoutes = new Hono<AppEnv>();

// Every successful GET on /api/dashboard/* is user-scoped, expensive
// (6–8 parallel DB queries), and tolerates 60s of staleness. Pair the
// max-age window with an ETag — when the same browser polls past the
// window but nothing actually changed, the server returns 304 instead of
// re-shipping the entire aggregate body. The role payloads themselves are
// isolate-cached for 120s in services/dashboard/roleDashboards.ts.
dashboardRoutes.use("/*", cacheMiddleware({ scope: "private", maxAge: 60 }));
dashboardRoutes.use("/*", etagMiddleware());

// ---------------------------------------------------------------------------
// GET /api/dashboard/
// ---------------------------------------------------------------------------
dashboardRoutes.get("/", async (c) => {
  const role = c.var.user.roles?.[0] ?? "job_seeker";
  return c.json(success(await getBaseDashboard(c.var.userId, role)), 200);
});

// ---------------------------------------------------------------------------
// GET /api/dashboard/jobseeker
// ---------------------------------------------------------------------------
dashboardRoutes.get("/jobseeker", async (c) => {
  const role = c.var.user.roles?.[0] ?? "job_seeker";
  return c.json(success(await getJobseekerDashboard(c.var.userId, role)), 200);
});

// ---------------------------------------------------------------------------
// GET /api/dashboard/recruiter
// ---------------------------------------------------------------------------
dashboardRoutes.get("/recruiter", async (c) => {
  const role = c.var.user.roles?.[0] ?? "recruiter";
  return c.json(success(await getRecruiterDashboard(c.var.userId, role)), 200);
});

// ---------------------------------------------------------------------------
// GET /api/dashboard/employer
// ---------------------------------------------------------------------------
dashboardRoutes.get("/employer", async (c) => {
  const role = c.var.user.roles?.[0] ?? "employer";
  return c.json(success(await getEmployerDashboard(c.var.userId, role)), 200);
});

// ---------------------------------------------------------------------------
// GET /api/dashboard/career-progress  (Pro — Job Seeker only)
// ---------------------------------------------------------------------------
dashboardRoutes.get("/career-progress", requirePro("Career Progress Tracking"), async (c) => {
  return c.json(success(await getCareerProgress(c.var.userId)), 200);
});

// ---------------------------------------------------------------------------
// GET /api/dashboard/admin
// ---------------------------------------------------------------------------
dashboardRoutes.get("/admin", async (c) => {
  const base = await buildBaseDashboard(c.var.userId, c.var.user.roles?.[0] ?? "admin");
  return c.json(success(base), 200);
});

dashboardRoutes.post("/activity", (c) => c.json(success({ success: true }), 200));
dashboardRoutes.post("/engagement", (c) => c.json(success({ success: true }), 200));
dashboardRoutes.post("/refresh", (c) => c.json(success({ success: true }), 200));

// ---------------------------------------------------------------------------
// POST /api/dashboard/ai-insights — AI narrative insights for Pro (#27)
// Summarises the user's funnel metrics and generates actionable hiring advice.
// ---------------------------------------------------------------------------
const InsightsPromptSchema = z.object({
  role: z.enum(["job_seeker", "recruiter", "employer"]).default("job_seeker"),
});

const AiInsightsResponseSchema = z.object({
  headline: z.string(),
  insights: z.array(z.string()),
  recommendations: z.array(z.string()),
  riskFlags: z.array(z.string()),
});

dashboardRoutes.post("/ai-insights", requirePro("AI Dashboard Insights"), async (c) => {
  const limitError = await checkAIUsage(c as any);
  if (limitError) return limitError;

  const body = await c.req.json().catch(() => ({}));
  const parsed = InsightsPromptSchema.safeParse(body);
  const role = parsed.success ? parsed.data.role : "job_seeker";

  // Gather funnel metrics for the LLM prompt
  const m = await getInsightsFunnelMetrics(c.var.userId);

  if (!hasAnyLLMProviderKey(c.env as any)) {
    return c.json(success({
      headline: "Keep up the momentum — consistency is key in your job search.",
      insights: [
        `You have ${m.recentApplications} applications in the last 30 days.`,
        `Interview conversion rate: ${m.interviewRate}%.`,
        `${m.savedJobs} saved jobs — make sure to apply before they close.`,
      ],
      recommendations: [
        "Aim for at least 5 applications per week to maintain pipeline.",
        "Personalise each cover letter to the role to improve callback rates.",
        "Follow up with recruiters 5–7 days after applying.",
      ],
      riskFlags: m.interviewRate < 10 ? ["Low interview conversion — review your resume and application quality."] : [],
    }), 200);
  }

  try {
    const llm = createLLMClient(c.env as any, c.var.user);
    const { data } = await llm.callJson(
      "dashboard_insights",
      {
        systemPrompt: "You are a career analytics AI. Analyse the user's hiring funnel metrics and provide concise, data-driven insights and recommendations. Return valid JSON only.",
        userMessage: `Role: ${role}
Applications (last 30d): ${m.recentApplications}
Status breakdown: ${JSON.stringify(m.statusCounts)}
Interview rate: ${m.interviewRate}%
Offer rate (from interviews): ${m.offerRate}%
Saved jobs: ${m.savedJobs}

Return JSON: { "headline": "<1-sentence summary>", "insights": ["<3-4 key observations>"], "recommendations": ["<3-4 actionable next steps>"], "riskFlags": ["<any red flags, empty array if none>"] }`,
        responseFormat: "json_object",
        useCase: "dashboard_summary",
      },
      AiInsightsResponseSchema,
    );

    return c.json(success(data), 200);
  } catch (err) {
    // Configured-but-threw: surface a typed AI_* envelope instead of
    // returning canned insights as if the AI produced them. The no-key
    // branch above remains the genuine static fallback.
    return aiFailure(c, err, "[dashboard/ai-insights] LLM error");
  }
});

// ─── POST /api/dashboard/career-copilot ─────────────────────────────────────
// Weekly AI action plan based on activity, market signals, and profile gaps.
// Pro + AI usage gated.

const CareerCopilotResponseSchema = z.object({
  summary: z.string(),
  actionItems: z.array(z.string()),
  skillGaps: z.array(z.string()),
  marketSignals: z.array(z.string()),
  wins: z.array(z.string()),
  nextReviewDate: z.string(),
});

dashboardRoutes.post("/career-copilot", requirePro("Career Copilot"), async (c) => {
  const limitError = await checkAIUsage(c as any);
  if (limitError) return limitError;

  const { appCount, interviewCount, interviewRate, userName, userRole } = await getCopilotMetrics(c.var.userId);

  if (!hasAnyLLMProviderKey(c.env)) {
    // Static fallback
    const nextReviewDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    return c.json(success({
      summary: `Hi ${userName}! Here's your weekly career snapshot. You've submitted ${appCount} applications this month.`,
      actionItems: [
        "Follow up on any applications older than 5 days that haven't received a response.",
        "Update your video resume with your most recent achievement.",
        "Spend 20 minutes practising one interview question on the Interview Practice page.",
        "Connect with 3 new people in your target industry on the Feed.",
      ],
      skillGaps: ["Add certifications to your profile to strengthen your application.", "Consider adding a skills section to your resume."],
      marketSignals: ["Remote roles in your industry have increased 12% this quarter.", "AI / machine learning skills are seeing the highest demand growth."],
      wins: appCount > 0 ? [`${appCount} applications submitted — great momentum!`] : ["Your profile is set up and ready to go!"],
      nextReviewDate,
    }), 200);
  }

  try {
    const llm = createLLMClient(c.env, c.var.user);
    const { data } = await llm.callJson(
      "career_copilot",
      {
        systemPrompt: `You are an AI career coach generating a weekly action plan for a ${userRole.replace("_", " ")}.
Be specific, actionable, and encouraging. Focus on the next 7 days.

Stats this month:
- Applications submitted: ${appCount}
- Interviews secured: ${interviewCount} (${interviewRate}% conversion)
- User name: ${userName}

Return JSON: {
  "summary": "<2-3 sentence personalised weekly summary>",
  "actionItems": ["<4-5 specific, time-bound action items>"],
  "skillGaps": ["<2-3 skill areas to develop based on job market trends>"],
  "marketSignals": ["<2-3 relevant job market observations>"],
  "wins": ["<1-2 things to celebrate, even small ones>"],
  "nextReviewDate": "<ISO date string 7 days from now>"
}`,
        userMessage: "Generate my weekly career action plan.",
        responseFormat: "json_object",
        useCase: "career",
      },
      CareerCopilotResponseSchema,
    );

    return c.json(success(data), 200);
  } catch (err) {
    // Configured-but-threw: surface a typed AI_* envelope instead of
    // returning a canned copilot plan as if the AI generated it. The
    // no-key branch above remains the genuine static fallback.
    return aiFailure(c, err, "[dashboard/career-copilot] LLM error");
  }
});

// ---------------------------------------------------------------------------
// GET /api/dashboard/extension-analytics — metrics for the Chrome extension
// Analytics tab. Combines saved-job pipeline data with scoring stats.
// ---------------------------------------------------------------------------
dashboardRoutes.get("/extension-analytics", async (c) => {
  const userId = requireUser(c);
  return c.json(success(await getExtensionAnalytics(userId)));
});
