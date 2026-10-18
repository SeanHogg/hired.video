/**
 * Seeker insight reads behind /api/dashboard/{career-progress,
 * extension-analytics} and the metric snapshots the AI insight / copilot
 * prompts are built from. Every count is a SQL aggregate in a repository;
 * this module only shapes the payloads.
 */
import { getDb } from "../../db/index.js";
import { DashboardRepository } from "../../repositories/dashboardRepository.js";
import { JobApplicationStatsRepository } from "../../repositories/jobApplicationStatsRepository.js";
import { HiringPipelineRepository } from "../../repositories/hiringPipelineRepository.js";
import { JobsRepository } from "../../repositories/jobsRepository.js";
import { UsersRepository } from "../../repositories/usersRepository.js";
import { INTERVIEW_STAGE_STATUSES, OFFER_STAGE_STATUSES, REACHED_INTERVIEW_STATUSES } from "./roleDashboards.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS);

const RECENT_PRACTICE_LIMIT = 10;

// ─── Career progress (Pro) ───────────────────────────────────────────────────

export async function getCareerProgress(userId: string) {
  const db = getDb();
  const [allApplications, interviewSessions] = await Promise.all([
    // Applications over the last 6 months, oldest first
    new JobApplicationStatsRepository(db).listAppliedSince(userId, daysAgo(180)),
    new HiringPipelineRepository(db).findRecentCompletedInterviewsForUser(userId, RECENT_PRACTICE_LIMIT),
  ]);

  // Group applications by month (YYYY-MM)
  const monthlyApplications: Record<string, { applied: number; interviews: number; offers: number }> = {};
  for (const app of allApplications) {
    const month = new Date(app.appliedAt).toISOString().slice(0, 7);
    if (!monthlyApplications[month]) monthlyApplications[month] = { applied: 0, interviews: 0, offers: 0 };
    monthlyApplications[month].applied++;
    if (INTERVIEW_STAGE_STATUSES.includes(app.status)) monthlyApplications[month].interviews++;
    if (OFFER_STAGE_STATUSES.includes(app.status)) monthlyApplications[month].offers++;
  }

  const total = allApplications.length;
  const interviews = allApplications.filter((a) => REACHED_INTERVIEW_STATUSES.includes(a.status)).length;
  const offers = allApplications.filter((a) => OFFER_STAGE_STATUSES.includes(a.status)).length;
  const scored = interviewSessions.filter((s) => s.overallScore);
  const avgInterviewScore =
    scored.length > 0
      ? Math.round((scored.reduce((s, sess) => s + parseFloat(sess.overallScore!), 0) / scored.length) * 10) / 10
      : null;

  return {
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
  };
}

// ─── AI prompt metric snapshots ──────────────────────────────────────────────

export interface InsightsFunnelMetrics {
  /** Applications applied in the last 30 days. */
  recentApplications: number;
  statusCounts: Record<string, number>;
  interviewRate: number;
  offerRate: number;
  savedJobs: number;
}

/** Funnel metrics for the AI dashboard insights prompt. */
export async function getInsightsFunnelMetrics(userId: string): Promise<InsightsFunnelMetrics> {
  const db = getDb();
  const apps = new JobApplicationStatsRepository(db);
  const [applications, interviews, offers, savedJobs] = await Promise.all([
    apps.listAppliedSince(userId, daysAgo(30)),
    apps.countForUser(userId, { status: "interviewing" }),
    apps.countForUser(userId, { status: "offered" }),
    new JobsRepository(db).countSavedForUser(userId),
  ]);

  const statusCounts = applications.reduce<Record<string, number>>((acc, a) => {
    acc[a.status] = (acc[a.status] ?? 0) + 1;
    return acc;
  }, {});
  return {
    recentApplications: applications.length,
    statusCounts,
    interviewRate: applications.length > 0 ? Math.round((interviews / applications.length) * 100) : 0,
    offerRate: interviews > 0 ? Math.round((offers / interviews) * 100) : 0,
    savedJobs,
  };
}

export interface CopilotMetrics {
  appCount: number;
  interviewCount: number;
  interviewRate: number;
  userName: string;
  userRole: string;
}

/** Last-30-day activity + identity for the weekly career copilot prompt. */
export async function getCopilotMetrics(userId: string): Promise<CopilotMetrics> {
  const db = getDb();
  const since = daysAgo(30);
  const apps = new JobApplicationStatsRepository(db);
  const [appCount, interviewCount, profile] = await Promise.all([
    apps.countForUser(userId, { createdSince: since }),
    apps.countForUser(userId, { status: "interviewing", createdSince: since }),
    new UsersRepository(db).findById(userId),
  ]);
  return {
    appCount,
    interviewCount,
    interviewRate: appCount > 0 ? Math.round((interviewCount / appCount) * 100) : 0,
    userName: profile?.name ?? "there",
    userRole: profile?.role ?? "job_seeker",
  };
}

// ─── Chrome extension analytics tab ──────────────────────────────────────────

export async function getExtensionAnalytics(userId: string) {
  const weekAgo = daysAgo(7);
  const twoWeeksAgo = daysAgo(14);
  // Upper bound for "this week" windows — tomorrow, so nothing created
  // during the request is excluded.
  const horizon = daysAgo(-1);

  // Weekly trend buckets (last 4 weeks), oldest first.
  const weekWindows = [3, 2, 1, 0].map((w) => ({
    start: daysAgo((w + 1) * 7),
    end: w === 0 ? horizon : daysAgo(w * 7),
    label: w === 0 ? "This week" : w === 1 ? "Last week" : `${w + 1}w ago`,
  }));

  // Every count is a SQL aggregate (COUNT … FILTER / GROUP BY) — the
  // user's saved-job history is never pulled into the Worker.
  const agg = await new DashboardRepository(getDb()).aggregateSavedJobAnalytics(userId, {
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

  return {
    thisWeek: {
      tracked: agg.thisWeekTracked,
      applied: agg.thisWeekApplied,
      trackedDelta: agg.thisWeekTracked - agg.lastWeekTracked,
      appliedDelta: agg.thisWeekApplied - agg.lastWeekApplied,
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
  };
}
