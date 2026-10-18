/**
 * Role dashboards — the GET /api/dashboard/{,jobseeker,recruiter,employer}
 * aggregates. Each payload is 6–12 aggregate queries, cached per
 * (kind, role, user) for 120s in the isolate (utils/isolate-cache.ts — no KV
 * writes on Workers Free), the same staleness the route's private max-age
 * already tolerates.
 *
 * Application statuses follow the ONE vocabulary in shared/statuses.ts
 * (applied / interviewing / offered / accepted / …); submission statuses
 * follow SUBMISSION_STATUSES (… / offer / placed / …).
 */
import { getDb } from "../../db/index.js";
import { getOnboardingTasksForUser } from "../../lib/onboarding.js";
import { getProfileStats } from "../profile/profileStats.js";
import { getCachedUnreadCount } from "../messaging/inboxCache.js";
import { getOrSetIsolateCached } from "../../utils/isolate-cache.js";
import { DashboardRepository } from "../../repositories/dashboardRepository.js";
import { NotificationsRepository } from "../../repositories/notificationsRepository.js";
import { JobApplicationStatsRepository } from "../../repositories/jobApplicationStatsRepository.js";
import { ResumeRepository } from "../../repositories/resumeRepository.js";
import { MediaRepository } from "../../repositories/mediaRepository.js";
import { PlatformRepository } from "../../repositories/platformRepository.js";
import { countTalentPoolForRecruiter } from "../../repositories/talentPoolRepository.js";
import { countSubmissionsByStatusForRecruiter } from "../../repositories/recruiterSubmissionsRepository.js";

const DASHBOARD_CACHE_TTL_SECONDS = 120;

/** Application statuses that mean the seeker reached the interview stage. */
export const INTERVIEW_STAGE_STATUSES: readonly string[] = ["interviewing"];
/** Application statuses that mean an offer was received. */
export const OFFER_STAGE_STATUSES: readonly string[] = ["offered", "accepted"];
/** Reached at least an interview (interview or offer stage). */
export const REACHED_INTERVIEW_STATUSES: readonly string[] = [...INTERVIEW_STAGE_STATUSES, ...OFFER_STAGE_STATUSES];

export type DashboardKind = "base" | "jobseeker" | "recruiter" | "employer";

function cachedDashboard<T>(kind: DashboardKind, userId: string, role: string, loader: () => Promise<T>): Promise<T> {
  return getOrSetIsolateCached({
    key: `dash:v1:${kind}:${role}:${userId}`,
    ttlSeconds: DASHBOARD_CACHE_TTL_SECONDS,
    loader,
  });
}

const sumWhere = (counts: Record<string, number>, statuses: readonly string[]) =>
  statuses.reduce((s, st) => s + (counts[st] ?? 0), 0);

export async function buildBaseDashboard(userId: string, role: string) {
  const { tasks: onboardingTasks, completionPercentage } = await getOnboardingTasksForUser(userId, role);
  return {
    title: "Dashboard",
    description: "Overview of your account",
    metrics: [],
    recentActivity: [],
    onboardingTasks,
    onboardingCompletionPercentage: completionPercentage,
    lastUpdated: new Date().toISOString(),
  };
}

export function getBaseDashboard(userId: string, role: string) {
  return cachedDashboard("base", userId, role, () => buildBaseDashboard(userId, role));
}

export function getJobseekerDashboard(userId: string, role: string) {
  return cachedDashboard("jobseeker", userId, role, () => buildJobseekerDashboard(userId, role));
}

export function getRecruiterDashboard(userId: string, role: string) {
  return cachedDashboard("recruiter", userId, role, () => buildRecruiterDashboard(userId, role));
}

export function getEmployerDashboard(userId: string, role: string) {
  return cachedDashboard("employer", userId, role, () => buildEmployerDashboard(userId, role));
}

async function buildJobseekerDashboard(userId: string, role: string) {
  const db = getDb();

  const [base, applications, profileStats, totalConversations, unreadCount, publishedResumes, videoResumes] =
    await Promise.all([
      buildBaseDashboard(userId, role),
      new JobApplicationStatsRepository(db).countByStatus(userId),
      // Profile-view metrics — the SSoT shared with /api/users/:id/stats and
      // the profile page (unified artifact_views, gap #1021).
      getProfileStats(db, userId),
      new DashboardRepository(db).countConversationsForUser(userId),
      // Unread notifications — the same per-user cached count the bell uses.
      getCachedUnreadCount(new NotificationsRepository(db), userId),
      new ResumeRepository(db).countPublishedByOwner(userId),
      new MediaRepository(db).countResumeVideosForUser(userId),
    ]);

  const byStatus = Object.fromEntries(applications.map((a) => [a.status, a.total]));
  const totalApplications = applications.reduce((s, a) => s + a.total, 0);
  const interviewRequests = sumWhere(byStatus, INTERVIEW_STAGE_STATUSES);
  const rejectedApplications = byStatus["rejected"] ?? 0;
  const offersReceived = sumWhere(byStatus, OFFER_STAGE_STATUSES);
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
      pendingApplications: byStatus["applied"] ?? 0,
      interviewRequests,
      rejectedApplications,
      offersReceived,
      successRate,
      recentApplications: [],
    },
    resumeStats: {
      publishedResumes,
      videoResumes,
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

async function buildRecruiterDashboard(userId: string, role: string) {
  const dashRepo = new DashboardRepository(getDb());
  const [base, poolCandidates, submissions, placementAgg, placementsWithDates] = await Promise.all([
    buildBaseDashboard(userId, role),
    countTalentPoolForRecruiter(userId),
    countSubmissionsByStatusForRecruiter(userId),
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
  const avgTimeToHireDays = placementAgg.avgDaysToHire == null ? 0 : Math.round(placementAgg.avgDaysToHire);

  return {
    ...base,
    candidateStats: {
      totalCandidates: poolCandidates,
      newCandidatesThisMonth: 0,
      activeCandidates: poolCandidates,
    },
    submissionStats: {
      total: totalSubmissions,
      submitted: submissionsByStatus["submitted"] ?? 0,
      interviewing: submissionsByStatus["interviewing"] ?? 0,
      offered: submissionsByStatus["offer"] ?? 0,
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

async function buildEmployerDashboard(userId: string, role: string) {
  const db = getDb();

  const [base, jobAgg, teamMembers] = await Promise.all([
    buildBaseDashboard(userId, role),
    // Jobs posted by this user + their applications/placements, aggregated in SQL
    new DashboardRepository(db).aggregateEmployerJobs(userId),
    // Team members (accepted invitations)
    new PlatformRepository(db).countAcceptedInvitationsSentBy(userId),
  ]);

  const activeJobs = jobAgg.activeJobs;
  const applicationRows = jobAgg.applicationsByStatus;
  const totalApplications = applicationRows.reduce((s, r) => s + r.total, 0);
  const interviewedCount = applicationRows
    .filter((r) => REACHED_INTERVIEW_STATUSES.includes(r.status))
    .reduce((s, r) => s + r.total, 0);
  const filledPositions = jobAgg.filledPositions;
  const avgTimeToFill = jobAgg.avgDaysToFill == null ? 0 : Math.round(jobAgg.avgDaysToFill);

  return {
    ...base,
    teamMetrics: {
      totalTeamMembers: teamMembers + 1, // +1 for the owner
      activeRecruiters: 0,
      openPositions: activeJobs,
      teamPerformanceScore: 0,
    },
    budgetStats: { totalBudget: 0, spentAmount: 0, remainingBudget: 0, costPerHire: 0 },
    recruiterPerformance: [],
    companyStats: { totalEmployees: teamMembers + 1, newHires: filledPositions, hiringVelocity: 0, employeeRetentionRate: 0 },
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
