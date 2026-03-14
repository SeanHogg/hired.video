import { Hono } from "hono";
import type { Variables } from "../types/index.js";
import { success } from "../types/index.js";
export const dashboardRoutes = new Hono<{ Variables: Variables }>();

const now = () => new Date().toISOString();

const baseDashboard = {
	title: "Dashboard",
	description: "Overview of your account",
	metrics: [],
	recentActivity: [],
	onboardingTasks: [],
	onboardingCompletionPercentage: 0,
	lastUpdated: now(),
};

dashboardRoutes.get("/", (c) => c.json(success(baseDashboard), 200));

dashboardRoutes.get("/jobseeker", (c) =>
	c.json(
		success({
			...baseDashboard,
			profileStats: {
				totalViews: 0,
				viewsThisWeek: 0,
				viewsThisMonth: 0,
				viewsChangePercentage: 0,
				recentViewers: [],
			},
			applicationStats: {
				totalApplications: 0,
				pendingApplications: 0,
				interviewRequests: 0,
				rejectedApplications: 0,
				successRate: 0,
				recentApplications: [],
			},
			jobMatches: [],
			upcomingInterviews: [],
			messageStats: { unreadCount: 0, totalConversations: 0, recentMessages: [] },
		}),
		200,
	),
);

dashboardRoutes.get("/recruiter", (c) => c.json(success(baseDashboard), 200));
dashboardRoutes.get("/admin", (c) => c.json(success(baseDashboard), 200));

dashboardRoutes.get("/employer", (c) =>
	c.json(
		success({
			...baseDashboard,
			teamMetrics: { totalTeamMembers: 0, activeRecruiters: 0, openPositions: 0, teamPerformanceScore: 0 },
			budgetStats: { totalBudget: 0, spentAmount: 0, remainingBudget: 0, costPerHire: 0 },
			recruiterPerformance: [],
			companyStats: { totalEmployees: 0, newHires: 0, hiringVelocity: 0, employeeRetentionRate: 0 },
			candidateStats: { totalCandidates: 0, newCandidates: 0, qualifiedCandidates: 0, interviewedCandidates: 0 },
			jobPostingStats: { activeJobs: 0, totalApplications: 0, filledPositions: 0, averageTimeToFill: 0 },
			recruitmentMetrics: { placementsMade: 0, placementRate: 0, averageTimeToHire: 0, costPerHire: 0 },
			newCandidates: [],
			scheduledInterviews: [],
			messageStats: { unreadCount: 0, totalConversations: 0, recentMessages: [] },
		}),
		200,
	),
);

dashboardRoutes.post("/profile-view", (c) => c.json(success({ success: true }), 200));
dashboardRoutes.post("/activity", (c) => c.json(success({ success: true }), 200));
dashboardRoutes.post("/engagement", (c) => c.json(success({ success: true }), 200));
dashboardRoutes.post("/refresh", (c) => c.json(success({ success: true }), 200));

dashboardRoutes.all("*", (c) =>
	c.json({ error: { code: "NOT_IMPLEMENTED", message: "Dashboard routes coming soon" } }, 501),
);
