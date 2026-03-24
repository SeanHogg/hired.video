import { Hono } from "hono";
import { and, count, eq, gte, lt, sql, sum, desc } from "drizzle-orm";
import type { Variables } from "../types/index.js";
import { success } from "../types/index.js";
import { getDb, schema } from "../db/index.js";
import { getOnboardingTasksForUser } from "../lib/onboarding.js";
import { getSubscription } from "../services/billing.js";
import { requirePremium } from "../middleware/tierEnforcement.js";

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
// GET /api/dashboard/career-progress  (Premium — Job Seeker only)
// ---------------------------------------------------------------------------
dashboardRoutes.get("/career-progress", requirePremium("Career Progress Tracking"), async (c) => {
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

dashboardRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_IMPLEMENTED", message: "Dashboard route not found" } }, 404),
);
