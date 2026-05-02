import { Hono } from "hono";
import { and, count, eq, gte, lt, sql, sum, desc } from "drizzle-orm";
import { z } from "zod";
import type { Variables } from "../types/index.js";
import { success } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { getOnboardingTasksForUser } from "../lib/onboarding.js";
import { getSubscription } from "../services/billing/BillingService.js";
import { requirePro, checkAIUsage } from "../middleware/tierEnforcement.js";
import { callLLMJson, getApiKey } from "../services/adapters/ai.js";

export const dashboardRoutes = new Hono<{ Variables: Variables }>();

const now = () => new Date().toISOString();
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
  const base = await buildBase(c.var.user.sub, c.var.user.roles?.[0] ?? "job_seeker");
  return c.json(success(base), 200);
});

// ---------------------------------------------------------------------------
// GET /api/dashboard/jobseeker
// ---------------------------------------------------------------------------
dashboardRoutes.get("/jobseeker", async (c) => {
  const userId = c.var.user.sub;
  const db = getDb();
  const weekAgo = daysAgo(7);
  const monthAgo = daysAgo(30);

  const [base, applications, weekViews, monthViews, recentViewers, conversations, unreadCount] = await Promise.all([
    buildBase(userId, c.var.user.roles?.[0] ?? "job_seeker"),

    // All applications grouped by status
    db
      .select({ status: schema.jobApplications.status, total: count() })
      .from(schema.jobApplications)
      .where(eq(schema.jobApplications.userId, userId))
      .groupBy(schema.jobApplications.status),

    // Profile views this week
    db
      .select({ total: count() })
      .from(schema.profileViews)
      .where(and(eq(schema.profileViews.viewedUserId, userId), gte(schema.profileViews.createdAt, weekAgo))),

    // Profile views this month
    db
      .select({ total: count() })
      .from(schema.profileViews)
      .where(and(eq(schema.profileViews.viewedUserId, userId), gte(schema.profileViews.createdAt, monthAgo))),

    // Recent viewers (last 5 distinct)
    db
      .select({
        viewerUserId: schema.profileViews.viewerUserId,
        viewedAt: schema.profileViews.createdAt,
      })
      .from(schema.profileViews)
      .where(eq(schema.profileViews.viewedUserId, userId))
      .orderBy(desc(schema.profileViews.createdAt))
      .limit(5),

    // Conversations this user participates in
    db
      .select({ conversationId: schema.conversationParticipants.conversationId })
      .from(schema.conversationParticipants)
      .where(eq(schema.conversationParticipants.userId, userId)),

    // Unread messages count via message read receipts
    db
      .select({ total: count() })
      .from(schema.notifications)
      .where(and(eq(schema.notifications.userId, userId), eq(schema.notifications.isRead, false))),
  ]);

  const byStatus = Object.fromEntries(applications.map((a) => [a.status, a.total]));
  const totalApplications = applications.reduce((s, a) => s + a.total, 0);
  const interviewRequests = (byStatus["interview"] ?? 0) + (byStatus["interview_scheduled"] ?? 0);
  const rejectedApplications = byStatus["rejected"] ?? 0;
  const offersReceived = byStatus["offer"] ?? 0;
  const successRate = totalApplications > 0 ? Math.round((offersReceived / totalApplications) * 100) : 0;

  return c.json(
    success({
      ...base,
      profileStats: {
        totalViews: monthViews[0]?.total ?? 0,
        viewsThisWeek: weekViews[0]?.total ?? 0,
        viewsThisMonth: monthViews[0]?.total ?? 0,
        viewsChangePercentage: 0,
        recentViewers,
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
      jobMatches: [],
      upcomingInterviews: [],
      messageStats: {
        unreadCount: unreadCount[0]?.total ?? 0,
        totalConversations: conversations.length,
        recentMessages: [],
      },
    }),
    200,
  );
});

// ---------------------------------------------------------------------------
// GET /api/dashboard/recruiter
// ---------------------------------------------------------------------------
dashboardRoutes.get("/recruiter", async (c) => {
  const userId = c.var.user.sub;
  const db = getDb();
  const monthAgo = daysAgo(30);

  const [base, poolCandidates, submissions, placementRows] = await Promise.all([
    buildBase(userId, c.var.user.roles?.[0] ?? "recruiter"),

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

    // Placements
    db
      .select({
        id: schema.placements.id,
        status: schema.placements.status,
        commissionAmount: schema.placements.commissionAmount,
        commissionStatus: schema.placements.commissionStatus,
        startDate: schema.placements.startDate,
        createdAt: schema.placements.createdAt,
      })
      .from(schema.placements)
      .where(eq(schema.placements.recruiterId, userId)),
  ]);

  const submissionsByStatus = Object.fromEntries(submissions.map((s) => [s.status.toLowerCase(), s.total]));
  const totalSubmissions = submissions.reduce((s, r) => s + r.total, 0);
  const totalPlacements = placementRows.length;
  const placementRate = totalSubmissions > 0 ? Math.round((totalPlacements / totalSubmissions) * 100) : 0;

  const totalCommission = placementRows
    .filter((p) => p.commissionStatus === "Paid")
    .reduce((s, p) => s + parseFloat(String(p.commissionAmount ?? 0)), 0);

  // Time-to-hire: avg days from placement createdAt to startDate
  const placementsWithDates = placementRows.filter((p) => p.startDate && p.createdAt);
  const avgTimeToHireDays =
    placementsWithDates.length > 0
      ? Math.round(
          placementsWithDates.reduce((s, p) => {
            const ms = new Date(p.startDate!).getTime() - new Date(p.createdAt).getTime();
            return s + ms / (1000 * 60 * 60 * 24);
          }, 0) / placementsWithDates.length,
        )
      : 0;

  return c.json(
    success({
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
            (new Date(p.startDate!).getTime() - new Date(p.createdAt).getTime()) / (1000 * 60 * 60 * 24),
          ),
        })),
      },
    }),
    200,
  );
});

// ---------------------------------------------------------------------------
// GET /api/dashboard/employer
// ---------------------------------------------------------------------------
dashboardRoutes.get("/employer", async (c) => {
  const userId = c.var.user.sub;
  const db = getDb();

  const [base, jobRows, teamMembers] = await Promise.all([
    buildBase(userId, c.var.user.roles?.[0] ?? "employer"),

    // Jobs posted by this user
    db
      .select({
        id: schema.jobItems.id,
        isActive: schema.jobItems.isActive,
        createdAt: schema.jobItems.createdAt,
      })
      .from(schema.jobItems)
      .where(eq(schema.jobItems.postedByUserId, userId)),

    // Team members (accepted invitations)
    db
      .select({ total: count() })
      .from(schema.accountInvitations)
      .where(and(eq(schema.accountInvitations.invitedBy, userId), eq(schema.accountInvitations.status, "accepted"))),
  ]);

  const activeJobs = jobRows.filter((j) => j.isActive).length;

  // Applications across all jobs by this employer
  const [applicationRows, placementRows] = await Promise.all([
    jobRows.length > 0
      ? db
          .select({ status: schema.jobApplications.status, total: count() })
          .from(schema.jobApplications)
          .where(
            sql`${schema.jobApplications.jobId} IN (${sql.join(
              jobRows.map((j) => sql`${j.id}::uuid`),
              sql`, `,
            )})`,
          )
          .groupBy(schema.jobApplications.status)
      : Promise.resolve([]),

    // Placements for this employer's jobs (as the company posting jobs)
    db
      .select({
        startDate: schema.placements.startDate,
        createdAt: schema.placements.createdAt,
      })
      .from(schema.placements)
      .where(
        jobRows.length > 0
          ? sql`${schema.placements.jobId} IN (${sql.join(
              jobRows.map((j) => sql`${j.id}::uuid`),
              sql`, `,
            )})`
          : sql`1=0`,
      ),
  ]);

  const totalApplications = applicationRows.reduce((s, r) => s + r.total, 0);
  const interviewedCount = applicationRows
    .filter((r) => ["interview", "interview_scheduled", "offer"].includes(r.status))
    .reduce((s, r) => s + r.total, 0);
  const filledPositions = placementRows.length;

  // Time-to-hire for employer
  const placementsWithDates = placementRows.filter((p) => p.startDate && p.createdAt);
  const avgTimeToFill =
    placementsWithDates.length > 0
      ? Math.round(
          placementsWithDates.reduce((s, p) => {
            return s + (new Date(p.startDate!).getTime() - new Date(p.createdAt).getTime()) / (1000 * 60 * 60 * 24);
          }, 0) / placementsWithDates.length,
        )
      : 0;

  return c.json(
    success({
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
        totalJobs: jobRows.length,
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
    }),
    200,
  );
});

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

dashboardRoutes.post("/profile-view", (c) => c.json(success({ success: true }), 200));
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

  const apiKey = getApiKey((c.env as any) ?? {});
  if (!apiKey) {
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
    const result = await callLLMJson(
      apiKey,
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

    await (db.insert(schema.aiUsageRecords) as any).values({
      userId,
      model: "google/gemini-flash-1.5",
      featureKey: "dashboard_insights",
      promptTokens: 200,
      completionTokens: 150,
      totalTokens: 350,
    });

    return c.json(success(result), 200);
  } catch {
    return c.json(success({
      headline: "Your pipeline is active — here are ways to improve your outcomes.",
      insights: [`${applications.length} applications submitted this month.`, `${interviewRate}% interview conversion rate.`],
      recommendations: ["Follow up on pending applications.", "Update your profile to attract recruiters."],
      riskFlags: [],
    }), 200);
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

  const apiKey = getApiKey(c.env);
  if (!apiKey) {
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
    const result = await callLLMJson(
      apiKey,
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

    await (db.insert(schema.aiUsageRecords) as any).values({
      userId,
      model: "google/gemini-flash-1.5",
      featureKey: "career_copilot",
      promptTokens: 200,
      completionTokens: 200,
      totalTokens: 400,
    });

    return c.json(success(result), 200);
  } catch {
    const nextReviewDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    return c.json(success({
      summary: `Hi ${userName}! Keep up the momentum — ${appCount} applications this month is a great start.`,
      actionItems: ["Follow up on pending applications.", "Update your resume with a recent achievement.", "Practice one interview question today.", "Share a career insight on the Feed."],
      skillGaps: ["Consider adding a relevant certification to your profile.", "Strengthen your LinkedIn presence."],
      marketSignals: ["Demand for your skills remains strong.", "Remote opportunities are expanding in your field."],
      wins: appCount > 0 ? [`${appCount} applications submitted this month!`] : ["Your profile is live and recruiters can find you."],
      nextReviewDate,
    }), 200);
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
  const monthAgo = daysAgo(30);

  // Fetch all saved jobs with their statuses
  const allSaved = await db
    .select({
      id: schema.savedJobs.id,
      jobId: schema.savedJobs.jobId,
      status: schema.savedJobs.status,
      appliedAt: schema.savedJobs.appliedAt,
      statusChangedAt: schema.savedJobs.statusChangedAt,
      createdAt: schema.savedJobs.createdAt,
    })
    .from(schema.savedJobs)
    .where(eq(schema.savedJobs.userId, userId));

  // Pipeline funnel counts
  const funnel: Record<string, number> = {
    tracked: 0, applied: 0, interviewing: 0, offered: 0,
    accepted: 0, rejected: 0, cancelled: 0, withdrawn: 0, declined: 0,
  };
  for (const s of allSaved) {
    const st = ((s as any).status ?? 'tracked').toLowerCase();
    funnel[st] = (funnel[st] ?? 0) + 1;
  }

  // This week vs last week activity
  const thisWeekTracked = allSaved.filter((s) => s.createdAt >= weekAgo).length;
  const lastWeekTracked = allSaved.filter((s) => s.createdAt >= twoWeeksAgo && s.createdAt < weekAgo).length;
  const thisWeekApplied = allSaved.filter((s) =>
    (s as any).status !== 'tracked' && (s as any).appliedAt && (s as any).appliedAt >= weekAgo
  ).length;
  const lastWeekApplied = allSaved.filter((s) =>
    (s as any).status !== 'tracked' && (s as any).appliedAt && (s as any).appliedAt >= twoWeeksAgo && (s as any).appliedAt < weekAgo
  ).length;

  // Weekly trend (last 4 weeks)
  const weeklyTrend: Array<{ week: string; tracked: number; applied: number }> = [];
  for (let w = 3; w >= 0; w--) {
    const start = daysAgo((w + 1) * 7);
    const end = daysAgo(w * 7);
    const label = w === 0 ? 'This week' : w === 1 ? 'Last week' : `${w + 1}w ago`;
    weeklyTrend.push({
      week: label,
      tracked: allSaved.filter((s) => s.createdAt >= start && s.createdAt < end).length,
      applied: allSaved.filter((s) => (s as any).appliedAt && (s as any).appliedAt >= start && (s as any).appliedAt < end).length,
    });
  }

  // Conversion rates
  const totalTracked = allSaved.length;
  const totalApplied = allSaved.filter((s) => (s as any).status !== 'tracked' && (s as any).status !== 'cancelled').length;
  const totalInterviewing = funnel.interviewing + funnel.offered + funnel.accepted;
  const applyRate = totalTracked > 0 ? Math.round((totalApplied / totalTracked) * 100) : 0;
  const interviewRate = totalApplied > 0 ? Math.round((totalInterviewing / totalApplied) * 100) : 0;
  const offerRate = totalInterviewing > 0 ? Math.round(((funnel.offered + funnel.accepted) / totalInterviewing) * 100) : 0;

  // Score insights (from match scores cache in the extension — but we can
  // also pull from aiUsageRecords or jobApplications)
  // For now, derive from job count only; actual score data lives client-side.

  // Activity streak — count consecutive days with at least one tracked or applied job
  const uniqueDays = new Set<string>();
  for (const s of allSaved) {
    uniqueDays.add(s.createdAt.toISOString().slice(0, 10));
    if ((s as any).appliedAt) uniqueDays.add((s as any).appliedAt.toISOString().slice(0, 10));
    if ((s as any).statusChangedAt) uniqueDays.add((s as any).statusChangedAt.toISOString().slice(0, 10));
  }
  let streak = 0;
  const today = new Date();
  for (let d = 0; d < 365; d++) {
    const dayStr = new Date(today.getTime() - d * 86400000).toISOString().slice(0, 10);
    if (uniqueDays.has(dayStr)) streak++;
    else break;
  }

  // Response tracking — estimate "ghost rate" from jobs applied > 14 days ago
  // still in "applied" status (no response)
  const fourteenDaysAgo = daysAgo(14);
  const appliedNoResponse = allSaved.filter((s) =>
    (s as any).status === 'applied' && (s as any).appliedAt && (s as any).appliedAt < fourteenDaysAgo
  ).length;
  const totalAppliedOver14d = allSaved.filter((s) =>
    (s as any).appliedAt && (s as any).appliedAt < fourteenDaysAgo
  ).length;
  const ghostRate = totalAppliedOver14d > 0 ? Math.round((appliedNoResponse / totalAppliedOver14d) * 100) : 0;

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
