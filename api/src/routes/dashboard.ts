import { Hono } from "hono";
import { and, count, eq, gte, lt, sql, sum, desc, isNotNull } from "drizzle-orm";
import { isNotRenderVariant } from "../repositories/renderVariantRepository.js";
import { z } from "zod";
import type { Variables, AppEnv } from "../types/index.js";
import { success } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { getOnboardingTasksForUser } from "../lib/onboarding.js";
import { getProfileStats } from "../services/profile/profileStats.js";
import { getSubscription } from "../services/billing/BillingService.js";
import { requirePro, checkAIUsage } from "../middleware/tierEnforcement.js";
import { createLLMClient, hasAnyLLMProviderKey } from "../services/adapters/llm-client.js";
import { aiFailure } from "../services/adapters/llm-error.js";
import { cacheMiddleware } from "../utils/cache-headers.js";
import { etagMiddleware } from "../utils/etag.js";
import { DashboardRepository } from "../repositories/dashboardRepository.js";
import { getOrSetIsolateCached } from "../utils/isolate-cache.js";
import { NotificationsRepository } from "../repositories/notificationsRepository.js";
import { getCachedUnreadCount } from "../services/messaging/inboxCache.js";

export const dashboardRoutes = new Hono<AppEnv>();

// Every successful GET on /api/dashboard/* is user-scoped, expensive
// (6–8 parallel DB queries), and tolerates 60s of staleness. Pair the
// max-age window with an ETag — when the same browser polls past the
// window but nothing actually changed, the server still hashes (and
// runs the queries — fixing that is #852) but returns 304 instead of
// re-shipping the entire aggregate body.
dashboardRoutes.use("/*", cacheMiddleware({ scope: "private", maxAge: 60 }));
dashboardRoutes.use("/*", etagMiddleware());

const now = () => new Date().toISOString();

// Each role dashboard is 6–12 aggregate queries per load. The payload is
// cached per (user, role) for 120s in the isolate (utils/isolate-cache.ts —
// no KV writes on Workers Free), the same staleness the private max-age
// above already tolerates, so repeat loads and the ETag revalidation don't
// re-run the counts.
const DASHBOARD_CACHE_TTL_SECONDS = 120;

function cachedDashboard<T>(kind: string, userId: string, role: string, loader: () => Promise<T>): Promise<T> {
  return getOrSetIsolateCached({
    key: `dash:v1:${kind}:${role}:${userId}`,
    ttlSeconds: DASHBOARD_CACHE_TTL_SECONDS,
    loader,
  });
}
const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

async function buildBase(userId: string, role: string) {
  const { tasks: onboardingTasks, completionPercentage } = await getOnboardingTasksForUser(userId, role);
  return {
    title: "Dashboard",
    description: "Overview of your account",
    metrics: [],
    recentActivity: [],
    onboardingTasks,
    onboardingCompletionPercentage: completionPercentage,
    lastUpdated: now(),
  };
}

// ---------------------------------------------------------------------------
// GET /api/dashboard/
// ---------------------------------------------------------------------------
dashboardRoutes.get("/", async (c) => {
  const userId = c.var.user.sub;
  const role = c.var.user.roles?.[0] ?? "job_seeker";
  const base = await cachedDashboard("base", userId, role, () => buildBase(userId, role));
  return c.json(success(base), 200);
});

// ---------------------------------------------------------------------------
// GET /api/dashboard/jobseeker
// ---------------------------------------------------------------------------
dashboardRoutes.get("/jobseeker", async (c) => {
  const userId = c.var.user.sub;
  const role = c.var.user.roles?.[0] ?? "job_seeker";
  const payload = await cachedDashboard("jobseeker", userId, role, () => buildJobseekerDashboard(userId, role));
  return c.json(success(payload), 200);
});

async function buildJobseekerDashboard(userId: string, role: string) {
  const db = getDb();

  const [base, applications, profileStats, totalConversations, unreadCount, publishedResumes, videoResumes] =
    await Promise.all([
      buildBase(userId, role),

      // All applications grouped by status
      db
        .select({ status: schema.jobApplications.status, total: count() })
        .from(schema.jobApplications)
        .where(eq(schema.jobApplications.userId, userId))
        .groupBy(schema.jobApplications.status),

      // Profile-view metrics — delegated to the SSoT so the dashboard,
      // /api/users/:id/stats, and the profile page stay in lockstep and
      // read from the unified artifact_views table (gap #1021).
      getProfileStats(db, userId),

      // Count of conversations this user participates in
      new DashboardRepository(db).countConversationsForUser(userId),

      // Unread notifications — the same per-user cached count the bell uses.
      getCachedUnreadCount(new NotificationsRepository(db), userId),

      // Published résumés — privacyLevel < 10 means visible to someone
      // (public / recruiter-only / connections), i.e. "posted" rather
      // than a private draft. Drives the job-readiness gauge (#2073).
      db
        .select({ total: count() })
        .from(schema.resumeInformation)
        .where(and(eq(schema.resumeInformation.userId, userId), lt(schema.resumeInformation.privacyLevel, 10))),

      // Video résumés — videos attached to one of the user's résumés.
      // `video_resumes` was dropped in 0062; association now lives on
      // videos.resumeId (see schema/videos.ts).
      db
        .select({ total: count() })
        .from(schema.videos)
        .where(and(eq(schema.videos.userId, userId), isNotNull(schema.videos.resumeId), isNotRenderVariant(schema.videos.id))),
    ]);

  const byStatus = Object.fromEntries(applications.map((a) => [a.status, a.total]));
  const totalApplications = applications.reduce((s, a) => s + a.total, 0);
  const interviewRequests = (byStatus["interview"] ?? 0) + (byStatus["interview_scheduled"] ?? 0);
  const rejectedApplications = byStatus["rejected"] ?? 0;
  const offersReceived = byStatus["offer"] ?? 0;
  const successRate = totalApplications > 0 ? Math.round((offersReceived / totalApplications) * 100) : 0;

  return {
    ...base,
    profileStats: {
      totalViews: profileStats.totalViews,
      viewsThisWeek: profileStats.viewsThisWeek,
      viewsThisMonth: profileStats.viewsThisMonth,
      viewsChangePercentage: profileStats.viewsChangePercentage,
      recentViewers: profileStats.recentViewers,
    },
    applicationStats: {
      totalApplications,
      pendingApplications: byStatus["applied"] ?? byStatus["pending"] ?? 0,
      interviewRequests,
      rejectedApplications,
      offersReceived,
      successRate,
      recentApplications: [],
    },
    resumeStats: {
      publishedResumes: publishedResumes[0]?.total ?? 0,
      videoResumes: videoResumes[0]?.total ?? 0,
    },
    jobMatches: [],
    upcomingInterviews: [],
    messageStats: {
      unreadCount,
      totalConversations,
      recentMessages: [],
    },
  };
}

// ---------------------------------------------------------------------------
// GET /api/dashboard/recruiter
// ---------------------------------------------------------------------------
dashboardRoutes.get("/recruiter", async (c) => {
  const userId = c.var.user.sub;
  const role = c.var.user.roles?.[0] ?? "recruiter";
  const payload = await cachedDashboard("recruiter", userId, role, () => buildRecruiterDashboard(userId, role));
  return c.json(success(payload), 200);
});

async function buildRecruiterDashboard(userId: string, role: string) {
  const db = getDb();
  const monthAgo = daysAgo(30);

  const dashRepo = new DashboardRepository(db);
  const [base, poolCandidates, submissions, placementAgg, placementsWithDates] = await Promise.all([
    buildBase(userId, role),

    // Total candidates in talent pools
    db
      .select({ total: count() })
      .from(schema.talentPoolCandidates)
      .where(eq(schema.talentPoolCandidates.recruiterId, userId)),

    // Submissions by status
    db
      .select({ status: schema.candidateSubmissions.status, total: count() })
      .from(schema.candidateSubmissions)
      .where(eq(schema.candidateSubmissions.recruiterId, userId))
      .groupBy(schema.candidateSubmissions.status),

    // Placement aggregates (count / paid commission / avg time-to-hire) in SQL
    dashRepo.aggregatePlacementsForRecruiter(userId),
    // Recent dated placements for the per-placement time-to-hire list (capped)
    dashRepo.findRecentDatedPlacementsForRecruiter(userId),
  ]);

  const submissionsByStatus = Object.fromEntries(submissions.map((s) => [s.status.toLowerCase(), s.total]));
  const totalSubmissions = submissions.reduce((s, r) => s + r.total, 0);
  const totalPlacements = placementAgg.total;
  const placementRate = totalSubmissions > 0 ? Math.round((totalPlacements / totalSubmissions) * 100) : 0;

  const totalCommission = placementAgg.paidCommission;

  // Time-to-hire: avg days from placement createdAt to startDate (SQL AVG)
  const avgTimeToHireDays = placementAgg.avgDaysToHire == null ? 0 : Math.round(placementAgg.avgDaysToHire);

  return {
    ...base,
    candidateStats: {
      totalCandidates: poolCandidates[0]?.total ?? 0,
      newCandidatesThisMonth: 0,
      activeCandidates: poolCandidates[0]?.total ?? 0,
    },
    submissionStats: {
      total: totalSubmissions,
      submitted: submissionsByStatus["submitted"] ?? 0,
      interviewing: submissionsByStatus["interviewing"] ?? 0,
      offered: submissionsByStatus["offered"] ?? 0,
      placed: submissionsByStatus["placed"] ?? 0,
      withdrawn: submissionsByStatus["withdrawn"] ?? 0,
    },
    placementStats: {
      totalPlacements,
      placementRate,
      totalCommissionEarned: Math.round(totalCommission * 100) / 100,
    },
    hiringSuccessMetrics: {
      submissionToPlacementRate: placementRate,
      averageTimeToHireDays: avgTimeToHireDays,
      totalRevenue: Math.round(totalCommission * 100) / 100,
    },
    timeToHireAnalytics: {
      averageDays: avgTimeToHireDays,
      placements: placementsWithDates.map((p) => ({
        id: p.id,
        daysToHire: Math.round(
          (new Date(p.startDate).getTime() - new Date(p.createdAt).getTime()) / (1000 * 60 * 60 * 24),
        ),
      })),
    },
  };
}

// ---------------------------------------------------------------------------
// GET /api/dashboard/employer
// ---------------------------------------------------------------------------
dashboardRoutes.get("/employer", async (c) => {
  const userId = c.var.user.sub;
  const role = c.var.user.roles?.[0] ?? "employer";
  const payload = await cachedDashboard("employer", userId, role, () => buildEmployerDashboard(userId, role));
  return c.json(success(payload), 200);
});

async function buildEmployerDashboard(userId: string, role: string) {
  const db = getDb();

  const [base, jobAgg, teamMembers] = await Promise.all([
    buildBase(userId, role),

    // Jobs posted by this user + their applications/placements, aggregated in SQL
    new DashboardRepository(db).aggregateEmployerJobs(userId),

    // Team members (accepted invitations)
    db
      .select({ total: count() })
      .from(schema.accountInvitations)
      .where(and(eq(schema.accountInvitations.invitedBy, userId), eq(schema.accountInvitations.status, "accepted"))),
  ]);

  const activeJobs = jobAgg.activeJobs;
  const applicationRows = jobAgg.applicationsByStatus;

  const totalApplications = applicationRows.reduce((s, r) => s + r.total, 0);
  const interviewedCount = applicationRows
    .filter((r) => ["interview", "interview_scheduled", "offer"].includes(r.status))
    .reduce((s, r) => s + r.total, 0);
  const filledPositions = jobAgg.filledPositions;

  // Time-to-hire for employer (SQL AVG over placements with a start date)
  const avgTimeToFill = jobAgg.avgDaysToFill == null ? 0 : Math.round(jobAgg.avgDaysToFill);

  return {
    ...base,
    teamMetrics: {
      totalTeamMembers: (teamMembers[0]?.total ?? 0) + 1, // +1 for the owner
      activeRecruiters: 0,
      openPositions: activeJobs,
      teamPerformanceScore: 0,
    },
    budgetStats: { totalBudget: 0, spentAmount: 0, remainingBudget: 0, costPerHire: 0 },
    recruiterPerformance: [],
    companyStats: { totalEmployees: (teamMembers[0]?.total ?? 0) + 1, newHires: filledPositions, hiringVelocity: 0, employeeRetentionRate: 0 },
    candidateStats: {
      totalCandidates: totalApplications,
      newCandidates: 0,
      qualifiedCandidates: interviewedCount,
      interviewedCandidates: interviewedCount,
    },
    jobPostingStats: {
      activeJobs,
      totalJobs: jobAgg.totalJobs,
      totalApplications,
      filledPositions,
      averageTimeToFill: avgTimeToFill,
    },
    recruitmentMetrics: {
      placementsMade: filledPositions,
      placementRate: totalApplications > 0 ? Math.round((filledPositions / totalApplications) * 100) : 0,
      averageTimeToHire: avgTimeToFill,
      costPerHire: 0,
    },
    hiringSuccessMetrics: {
      offerAcceptanceRate: 0,
      applicationToInterviewRate: totalApplications > 0 ? Math.round((interviewedCount / totalApplications) * 100) : 0,
      timeToFillDays: avgTimeToFill,
      totalHires: filledPositions,
    },
    timeToHireAnalytics: {
      averageDays: avgTimeToFill,
      trend: [],
    },
    newCandidates: [],
    scheduledInterviews: [],
    messageStats: { unreadCount: 0, totalConversations: 0, recentMessages: [] },
  };
}

// ---------------------------------------------------------------------------
// GET /api/dashboard/career-progress  (Pro — Job Seeker only)
// ---------------------------------------------------------------------------
dashboardRoutes.get("/career-progress", requirePro("Career Progress Tracking"), async (c) => {
  const userId = c.var.user.sub;
  const db = getDb();

  // Monthly application counts for the last 6 months
  const sixMonthsAgo = daysAgo(180);

  const [allApplications, interviewSessions] = await Promise.all([
    db
      .select({
        status: schema.jobApplications.status,
        appliedAt: schema.jobApplications.appliedAt,
      })
      .from(schema.jobApplications)
      .where(and(eq(schema.jobApplications.userId, userId), gte(schema.jobApplications.appliedAt, sixMonthsAgo)))
      .orderBy(schema.jobApplications.appliedAt),

    db
      .select({ id: schema.interviewSessions.id, overallScore: schema.interviewSessions.overallScore, createdAt: schema.interviewSessions.createdAt })
      .from(schema.interviewSessions)
      .where(and(eq(schema.interviewSessions.userId, userId), eq(schema.interviewSessions.status, "completed")))
      .orderBy(desc(schema.interviewSessions.createdAt))
      .limit(10),
  ]);

  // Group applications by month (YYYY-MM)
  const monthlyApplications: Record<string, { applied: number; interviews: number; offers: number }> = {};
  for (const app of allApplications) {
    const month = new Date(app.appliedAt).toISOString().slice(0, 7);
    if (!monthlyApplications[month]) monthlyApplications[month] = { applied: 0, interviews: 0, offers: 0 };
    monthlyApplications[month].applied++;
    if (["interview", "interview_scheduled"].includes(app.status)) monthlyApplications[month].interviews++;
    if (app.status === "offer") monthlyApplications[month].offers++;
  }

  const total = allApplications.length;
  const interviews = allApplications.filter((a) => ["interview", "interview_scheduled", "offer"].includes(a.status)).length;
  const offers = allApplications.filter((a) => a.status === "offer").length;
  const avgInterviewScore =
    interviewSessions.filter((s) => s.overallScore).length > 0
      ? Math.round(
          interviewSessions
            .filter((s) => s.overallScore)
            .reduce((s, sess) => s + parseFloat(sess.overallScore!), 0) /
            interviewSessions.filter((s) => s.overallScore).length *
            10,
        ) / 10
      : null;

  return c.json(
    success({
      summary: {
        totalApplications: total,
        totalInterviews: interviews,
        totalOffers: offers,
        applicationToInterviewRate: total > 0 ? Math.round((interviews / total) * 100) : 0,
        interviewToOfferRate: interviews > 0 ? Math.round((offers / interviews) * 100) : 0,
        averageInterviewPracticeScore: avgInterviewScore,
      },
      monthlyTrend: Object.entries(monthlyApplications)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, data]) => ({ month, ...data })),
      recentInterviewPractice: interviewSessions.map((s) => ({
        id: s.id,
        score: s.overallScore ? parseFloat(s.overallScore) : null,
        practisedAt: s.createdAt,
      })),
    }),
    200,
  );
});

// ---------------------------------------------------------------------------
// GET /api/dashboard/admin
// ---------------------------------------------------------------------------
dashboardRoutes.get("/admin", async (c) => {
  const base = await buildBase(c.var.user.sub, c.var.user.roles?.[0] ?? "admin");
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

  const userId = c.var.user.sub;
  const body = await c.req.json().catch(() => ({}));
  const parsed = InsightsPromptSchema.safeParse(body);
  const role = parsed.success ? parsed.data.role : "job_seeker";

  const db = getDb();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Gather funnel metrics for the LLM prompt
  const [applications, interviews, offers, savedJobs] = await Promise.all([
    db.select({ status: schema.jobApplications.status })
      .from(schema.jobApplications)
      .where(and(eq(schema.jobApplications.userId, userId), gte(schema.jobApplications.appliedAt, thirtyDaysAgo))),
    db.select({ n: count() }).from(schema.jobApplications)
      .where(and(eq(schema.jobApplications.userId, userId), eq(schema.jobApplications.status, "interview"))),
    db.select({ n: count() }).from(schema.jobApplications)
      .where(and(eq(schema.jobApplications.userId, userId), eq(schema.jobApplications.status, "offer"))),
    db.select({ n: count() }).from(schema.savedJobs).where(eq(schema.savedJobs.userId, userId)),
  ]);

  const statusCounts = applications.reduce<Record<string, number>>((acc, a) => {
    acc[a.status] = (acc[a.status] ?? 0) + 1;
    return acc;
  }, {});
  const interviewRate = applications.length > 0 ? Math.round((interviews[0].n / applications.length) * 100) : 0;
  const offerRate = interviews[0].n > 0 ? Math.round(((offers[0].n) / interviews[0].n) * 100) : 0;

  if (!hasAnyLLMProviderKey(c.env as any)) {
    return c.json(success({
      headline: "Keep up the momentum — consistency is key in your job search.",
      insights: [
        `You have ${applications.length} applications in the last 30 days.`,
        `Interview conversion rate: ${interviewRate}%.`,
        `${savedJobs[0].n} saved jobs — make sure to apply before they close.`,
      ],
      recommendations: [
        "Aim for at least 5 applications per week to maintain pipeline.",
        "Personalise each cover letter to the role to improve callback rates.",
        "Follow up with recruiters 5–7 days after applying.",
      ],
      riskFlags: interviewRate < 10 ? ["Low interview conversion — review your resume and application quality."] : [],
    }), 200);
  }

  try {
    const llm = createLLMClient(c.env as any, c.var.user);
    const { data } = await llm.callJson(
      "dashboard_insights",
      {
        systemPrompt: "You are a career analytics AI. Analyse the user's hiring funnel metrics and provide concise, data-driven insights and recommendations. Return valid JSON only.",
        userMessage: `Role: ${role}
Applications (last 30d): ${applications.length}
Status breakdown: ${JSON.stringify(statusCounts)}
Interview rate: ${interviewRate}%
Offer rate (from interviews): ${offerRate}%
Saved jobs: ${savedJobs[0].n}

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

  const userId = c.var.user.sub;
  const db = getDb();
  const since = daysAgo(30);

  const [applications, interviews, profile] = await Promise.all([
    db.select({ count: count() }).from(schema.jobApplications).where(
      and(eq(schema.jobApplications.userId, userId), gte(schema.jobApplications.createdAt, since)),
    ),
    db.select({ count: count() }).from(schema.jobApplications).where(
      and(
        eq(schema.jobApplications.userId, userId),
        eq(schema.jobApplications.status, "interviewing"),
        gte(schema.jobApplications.createdAt, since),
      ),
    ),
    db.select({ role: schema.users.role, name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1),
  ]);

  const appCount = applications[0]?.count ?? 0;
  const interviewCount = interviews[0]?.count ?? 0;
  const userName = profile[0]?.name ?? "there";
  const userRole = profile[0]?.role ?? "job_seeker";
  const interviewRate = appCount > 0 ? Math.round((interviewCount / appCount) * 100) : 0;

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
  const userId = c.var.user?.sub;
  if (!userId) return c.json({ error: { code: "UNAUTHORIZED" } }, 401);
  const db = getDb();

  const weekAgo = daysAgo(7);
  const twoWeeksAgo = daysAgo(14);
  // Upper bound for "this week" windows — tomorrow, so nothing created
  // during the request is excluded.
  const horizon = daysAgo(-1);

  // Weekly trend buckets (last 4 weeks), oldest first.
  const weekWindows = [3, 2, 1, 0].map((w) => ({
    start: daysAgo((w + 1) * 7),
    end: w === 0 ? horizon : daysAgo(w * 7),
    label: w === 0 ? 'This week' : w === 1 ? 'Last week' : `${w + 1}w ago`,
  }));

  // Every count is a SQL aggregate (COUNT … FILTER / GROUP BY) — the
  // user's saved-job history is never pulled into the Worker.
  const agg = await new DashboardRepository(db).aggregateSavedJobAnalytics(userId, {
    thisWeek: { start: weekAgo, end: horizon },
    lastWeek: { start: twoWeeksAgo, end: weekAgo },
    weeks: weekWindows,
    // Response tracking — "ghost rate" = applied > 14 days ago, still "applied"
    ghostCutoff: twoWeeksAgo,
    streakSince: daysAgo(366),
  });

  // Pipeline funnel counts
  const funnel: Record<string, number> = {
    tracked: 0, applied: 0, interviewing: 0, offered: 0,
    accepted: 0, rejected: 0, cancelled: 0, withdrawn: 0, declined: 0,
    ...agg.funnel,
  };

  const thisWeekTracked = agg.thisWeekTracked;
  const lastWeekTracked = agg.lastWeekTracked;
  const thisWeekApplied = agg.thisWeekApplied;
  const lastWeekApplied = agg.lastWeekApplied;

  const weeklyTrend = weekWindows.map((win, i) => ({
    week: win.label,
    tracked: agg.weeks[i]?.tracked ?? 0,
    applied: agg.weeks[i]?.applied ?? 0,
  }));

  // Conversion rates
  const totalTracked = agg.totalTracked;
  const totalApplied = agg.totalApplied;
  const totalInterviewing = funnel.interviewing + funnel.offered + funnel.accepted;
  const applyRate = totalTracked > 0 ? Math.round((totalApplied / totalTracked) * 100) : 0;
  const interviewRate = totalApplied > 0 ? Math.round((totalInterviewing / totalApplied) * 100) : 0;
  const offerRate = totalInterviewing > 0 ? Math.round(((funnel.offered + funnel.accepted) / totalInterviewing) * 100) : 0;

  // Activity streak — consecutive days (from today) with any tracked/applied/status-change activity
  let streak = 0;
  const today = new Date();
  for (let d = 0; d < 365; d++) {
    const dayStr = new Date(today.getTime() - d * 86400000).toISOString().slice(0, 10);
    if (agg.activeDays.has(dayStr)) streak++;
    else break;
  }

  const ghostRate = agg.appliedBeforeGhostCutoff > 0
    ? Math.round((agg.appliedNoResponse / agg.appliedBeforeGhostCutoff) * 100)
    : 0;

  return c.json(success({
    thisWeek: {
      tracked: thisWeekTracked,
      applied: thisWeekApplied,
      trackedDelta: thisWeekTracked - lastWeekTracked,
      appliedDelta: thisWeekApplied - lastWeekApplied,
      streak,
    },
    funnel,
    conversion: { applyRate, interviewRate, offerRate },
    weeklyTrend,
    ghostRate,
    totals: {
      tracked: totalTracked,
      applied: totalApplied,
      interviewing: totalInterviewing,
      offers: funnel.offered + funnel.accepted,
    },
  }));
});

dashboardRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_IMPLEMENTED", message: "Dashboard route not found" } }, 404),
);
