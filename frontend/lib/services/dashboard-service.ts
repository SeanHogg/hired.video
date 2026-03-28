/**
 * Dashboard Service
 * Handles user dashboard data and analytics with real API integration
 */

import { z } from "zod";
import { apiClient } from "../api-client";
import {
  createRolePermissions,
  DASHBOARD_TYPES,
  type DashboardType,
} from "../role-utils";
import {
  searchService,
  type SearchResponse,
  type SearchFilters,
} from "./search-service";

// ============================================================================
// SCHEMAS
// ============================================================================

// Dashboard metric schema
export const DashboardMetricSchema = z.object({
  title: z.string(),
  value: z.string(),
  change: z.string().optional(),
  changeType: z.enum(["up", "down", "neutral"]).optional(),
  icon: z.string().optional(),
  description: z.string().optional(),
  trend: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

// Activity item schema
export const ActivityItemSchema = z.object({
  id: z.string(),
  type: z.string(),
  content: z.string(),
  time: z.string(),
  timestamp: z.string().transform((val) => new Date(val)),
  icon: z.string().optional(),
  url: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

// Onboarding task schema
export const OnboardingTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  completed: z.boolean(),
  completedDate: z.string().optional().transform((val) => val ? new Date(val) : undefined),
  url: z.string().optional(),
  priority: z.number().default(1),
});

// Base dashboard schema
export const BaseDashboardSchema = z.object({
  title: z.string(),
  description: z.string(),
  metrics: z.array(DashboardMetricSchema),
  recentActivity: z.array(ActivityItemSchema),
  onboardingTasks: z.array(OnboardingTaskSchema),
  onboardingCompletionPercentage: z.number().default(0),
  lastUpdated: z.string().transform((val) => new Date(val)),
});

// Profile stats schema
export const ProfileStatsSchema = z.object({
  totalViews: z.number(),
  viewsThisWeek: z.number(),
  viewsThisMonth: z.number(),
  viewsChangePercentage: z.number(),
  recentViewers: z.array(
    z.object({
      userId: z.string().optional(),
      name: z.string(),
      company: z.string().optional(),
      role: z.string().optional(),
      viewedAt: z.string().transform((val) => new Date(val)),
    }),
  ),
});

// Application stats schema
export const ApplicationStatsSchema = z.object({
  totalApplications: z.number(),
  pendingApplications: z.number(),
  interviewRequests: z.number(),
  rejectedApplications: z.number(),
  successRate: z.number(),
  recentApplications: z.array(
    z.object({
      applicationId: z.string(),
      jobTitle: z.string(),
      company: z.string(),
      status: z.string(),
      appliedAt: z.string().transform((val) => new Date(val)),
      updatedAt: z
        .string()
        .transform((val) => new Date(val))
        .optional(),
    }),
  ),
});

// Job seeker dashboard schema
export const JobSeekerDashboardSchema = BaseDashboardSchema.extend({
  profileStats: ProfileStatsSchema.optional(),
  applicationStats: ApplicationStatsSchema.optional(),
  jobMatches: z.array(
    z.object({
      jobId: z.string(),
      title: z.string(),
      company: z.string(),
      location: z.string(),
      matchScore: z.number(),
      postedDate: z.string().transform((val) => new Date(val)),
      salary: z.string().optional(),
    }),
  ),
  upcomingInterviews: z.array(
    z.object({
      id: z.string(),
      jobTitle: z.string(),
      company: z.string(),
      scheduledTime: z.string().transform((val) => new Date(val)),
      type: z.string(),
      status: z.string(),
      notes: z.string().optional(),
    }),
  ),
  messageStats: z.object({
    unreadCount: z.number(),
    totalConversations: z.number(),
    recentMessages: z.array(
      z.object({
        conversationId: z.string(),
        senderName: z.string(),
        preview: z.string(),
        sentAt: z.string().transform((val) => new Date(val)),
        isRead: z.boolean(),
      }),
    ),
  }),
});

// Employer dashboard specific schemas
export const TeamMetricsSchema = z.object({
  totalTeamMembers: z.number(),
  activeRecruiters: z.number(),
  openPositions: z.number(),
  teamPerformanceScore: z.number(),
});

export const BudgetStatsSchema = z.object({
  totalBudget: z.number(),
  spentAmount: z.number(),
  remainingBudget: z.number(),
  costPerHire: z.number(),
});

export const CompanyStatsSchema = z.object({
  totalEmployees: z.number(),
  newHires: z.number(),
  hiringVelocity: z.number(),
  employeeRetentionRate: z.number(),
});

export const CandidateStatsSchema = z.object({
  totalCandidates: z.number(),
  newCandidates: z.number(),
  qualifiedCandidates: z.number(),
  interviewedCandidates: z.number(),
});

export const JobPostingStatsSchema = z.object({
  activeJobs: z.number(),
  totalApplications: z.number(),
  filledPositions: z.number(),
  averageTimeToFill: z.number(),
});

export const RecruitmentMetricsSchema = z.object({
  placementsMade: z.number(),
  placementRate: z.number(),
  averageTimeToHire: z.number(),
  costPerHire: z.number(),
});

export const MessageStatsSchema = z.object({
  unreadCount: z.number(),
  totalConversations: z.number(),
  recentMessages: z.array(z.any()),
});

// Employer dashboard schema
export const EmployerDashboardSchema = BaseDashboardSchema.extend({
  teamMetrics: TeamMetricsSchema,
  budgetStats: BudgetStatsSchema,
  recruiterPerformance: z.array(z.any()),
  companyStats: CompanyStatsSchema,
  candidateStats: CandidateStatsSchema,
  jobPostingStats: JobPostingStatsSchema,
  recruitmentMetrics: RecruitmentMetricsSchema,
  newCandidates: z.array(z.any()),
  scheduledInterviews: z.array(z.any()),
  messageStats: MessageStatsSchema,
});

// Legacy dashboard stats schema (for backward compatibility)
export const DashboardStatsSchema = z.object({
  totalJobs: z.number(),
  totalCompanies: z.number(),
  totalUsers: z.number(),
  totalResumes: z.number(),
  totalViews: z.number(),
  recentJobs: z.number(),
  recentCompanies: z.number(),
  recentUsers: z.number(),
  recentResumes: z.number(),
});

export const HomepageContentSchema = z.object({
  jobs: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      company: z.string(),
      location: z.string(),
      employmentType: z.string(),
      postedDate: z.string(),
      views: z.number().optional(),
    }),
  ),
  companies: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      industry: z.string(),
      location: z.string(),
      logo: z.string().optional(),
      views: z.number().optional(),
    }),
  ),
  users: z.array(
    z.object({
      id: z.string(),
      firstName: z.string(),
      lastName: z.string(),
      headline: z.string(),
      location: z.string(),
      avatar: z.string().optional(),
      views: z.number().optional(),
    }),
  ),
  resumes: z.array(
    z.object({
      id: z.string(),
      title: z.string().optional(),
      name: z.string().optional(),
      summary: z.string().optional(),
      description: z.string().optional(),
      skills: z.array(z.string()).optional(),
      location: z.string().optional(),
      views: z.number().optional(),
      userId: z.string().optional(),
      templateName: z.string().optional(),
      isPublic: z.boolean().optional(),
      createdAt: z.string().optional(),
    }),
  ),
});

// ============================================================================
// TYPES
// ============================================================================

export type DashboardStats = z.infer<typeof DashboardStatsSchema>;
export type HomepageContent = z.infer<typeof HomepageContentSchema>;

// New dashboard types
export type DashboardMetric = z.infer<typeof DashboardMetricSchema>;
export type ActivityItem = z.infer<typeof ActivityItemSchema>;
export type OnboardingTask = z.infer<typeof OnboardingTaskSchema>;
export type BaseDashboard = z.infer<typeof BaseDashboardSchema>;
export type ProfileStats = z.infer<typeof ProfileStatsSchema>;
export type ApplicationStats = z.infer<typeof ApplicationStatsSchema>;
export type JobSeekerDashboard = z.infer<typeof JobSeekerDashboardSchema>;
export type EmployerDashboard = z.infer<typeof EmployerDashboardSchema>;

// Dashboard service response wrapper
export interface DashboardResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Profile view recording request
export interface RecordProfileViewRequest {
  profileUserId: string;
  viewType?: string;
  itemId?: string;
  viewDurationSeconds?: number;
}

// Activity recording request
export interface RecordActivityRequest {
  activityType: string;
  description: string;
  entityType?: string;
  entityId?: string;
  activityData?: any;
  priority?: number;
}

// User engagement recording request
export interface RecordEngagementRequest {
  sessionDurationMinutes: number;
  pageViews: number;
  actionCount: number;
  featuresUsed?: string[];
}

export interface HomepageFilters {
  search?: string;
  category?: "all" | "jobs" | "companies" | "people" | "resumes";
  location?: string;
  limit?: number;
}

// ============================================================================
// SERVICE
// ============================================================================

export class DashboardService {
  /**
   * Get homepage content with filtering using unified search
   */
  async getHomepageContent(
    filters: HomepageFilters = {},
  ): Promise<HomepageContent> {
    const limit = filters.limit || 4;

    try {
      // Use unified search service
      const searchResponse = await searchService.searchPublicContent({
        search: filters.search,
        category: filters.category === "all" ? undefined : filters.category,
        location: filters.location,
        page: 1,
        limit: limit * 4, // Get more items to distribute across categories
      });

      // Group items by type
      const jobs = searchResponse.items.filter((item) => item.type === "job");
      const companies = searchResponse.items.filter(
        (item) => item.type === "company",
      );
      const users = searchResponse.items.filter(
        (item) => item.type === "people",
      );
      const resumes = searchResponse.items.filter(
        (item) => item.type === "resume",
      );

      return {
        jobs: jobs.slice(0, limit).map((job) => ({
          id: job.id,
          title: job.title,
          company: job.company || "Unknown Company",
          location: job.location || "Unknown Location",
          employmentType: job.employmentType || "Full-time",
          postedDate:
            job.postedDate || job.createdAt || new Date().toISOString(),
          views: job.views || 0,
        })),
        companies: companies.slice(0, limit).map((company) => ({
          id: company.id,
          name: company.name || company.title,
          description:
            company.description ||
            company.summary ||
            "No description available",
          industry: company.industry || "Technology",
          location: company.location || "Unknown location",
          logo: company.logo,
          views: company.views || 0,
        })),
        users: users.slice(0, limit).map((user) => ({
          id: user.id,
          firstName: user.name?.split(" ")[0] || "Unknown",
          lastName: user.name?.split(" ").slice(1).join(" ") || "",
          headline: user.headline || user.summary || "Professional",
          location: user.location || "Unknown location",
          avatar: user.avatar,
          views: user.views || 0,
        })),
        resumes: resumes.slice(0, limit).map((resume) => ({
          id: resume.id,
          title: resume.title || resume.name || "Untitled Resume",
          name: resume.name || resume.title || "Untitled Resume",
          summary:
            resume.summary || resume.description || "No summary available",
          description:
            resume.description || resume.summary || "No description available",
          skills: resume.skills || [],
          location: resume.location || "Unknown location",
          views: resume.views || 0,
          userId: resume.id, // TODO: Get actual owner ID
          templateName: resume.templateName,
          isPublic: resume.isPublic,
          createdAt: resume.createdAt,
        })),
      };
    } catch (error) {
      console.error("Failed to get homepage content:", error);
      throw error;
    }
  }

  /**
   * Search across all content types using unified search
   */
  async searchContent(
    query: string,
    category = "all",
    limit = 20,
  ): Promise<SearchResponse> {
    return searchService.searchPublicContent({
      page: 1,
      search: query,
      category: category as "all" | "jobs" | "resumes" | "people" | "companies",
      limit,
    });
  }

  /**
   * Get dashboard data for the current user based on their role
   */
  async getDashboard(): Promise<DashboardResponse<BaseDashboard>> {
    try {
      const response = (await apiClient.get("/api/userdashboard")) as {
        data: any;
      };
      const dashboard = BaseDashboardSchema.parse(response.data);

      return { success: true, data: dashboard };
    } catch (error) {
      console.error("Error creating default dashboard:", error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch dashboard data",
      };
    }
  }

  /**
   * Get dashboard data based on user role - centralized role logic
   */
  async getDashboardForRole(
    userRole: string | number | undefined | null,
  ): Promise<DashboardResponse<any>> {
    const rolePermissions = createRolePermissions(userRole);
    const dashboardType = rolePermissions.dashboardType;

    try {
      switch (dashboardType) {
        case DASHBOARD_TYPES.JOB_SEEKER:
          return await this.getJobSeekerDashboard();
        case DASHBOARD_TYPES.RECRUITER:
          return await this.getRecruiterDashboard();
        case DASHBOARD_TYPES.EMPLOYER:
          return await this.getEmployerDashboard();
        case DASHBOARD_TYPES.ADMIN:
          return await this.getAdminDashboard();
        case DASHBOARD_TYPES.AFFILIATE:
          return await this.getAffiliateDashboard();
        case DASHBOARD_TYPES.DEFAULT:
        default:
          return await this.getDashboard();
      }
    } catch (error) {
      console.error("Error fetching role-based dashboard:", error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch dashboard data",
      };
    }
  }

  /**
   * Get job seeker specific dashboard data
   */
  async getJobSeekerDashboard(): Promise<
    DashboardResponse<JobSeekerDashboard>
  > {
    try {
      const response = (await apiClient.get(
        "/api/userdashboard/jobseeker",
      )) as { data: any };

      const parsed = JobSeekerDashboardSchema.safeParse(response.data);
      if (!parsed.success) {
        console.warn("[dashboard] JobSeeker schema validation warning:", parsed.error.issues);
        return { success: true, data: response.data as unknown as JobSeekerDashboard };
      }

      return { success: true, data: parsed.data };
    } catch (error) {
      console.error("Error creating job seeker dashboard:", error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch job seeker dashboard data",
      };
    }
  }

  /**
   * Get recruiter specific dashboard data
   */
  async getRecruiterDashboard(): Promise<DashboardResponse<BaseDashboard>> {
    try {
      const response = (await apiClient.get(
        "/api/userdashboard/recruiter",
      )) as { data: any };
      const dashboard = BaseDashboardSchema.parse(response.data);

      return { success: true, data: dashboard };
    } catch (error) {
      console.error("Error creating recruiter dashboard:", error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch recruiter dashboard data",
      };
    }
  }

  /**
   * Get employer specific dashboard data
   */
  async getEmployerDashboard(): Promise<DashboardResponse<EmployerDashboard>> {
    try {
      const response = (await apiClient.get("/api/userdashboard/employer")) as {
        data: any;
      };
      const dashboard = EmployerDashboardSchema.parse(response.data);

      return { success: true, data: dashboard };
    } catch (error) {
      console.error("Error creating employer dashboard:", error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch employer dashboard data",
      };
    }
  }

  /**
   * Get admin specific dashboard data
   */
  async getAdminDashboard(): Promise<DashboardResponse<BaseDashboard>> {
    try {
      const response = (await apiClient.get("/api/userdashboard/admin")) as {
        data: any;
      };
      const dashboard = BaseDashboardSchema.parse(response.data);

      return { success: true, data: dashboard };
    } catch (error) {
      console.error("Error creating admin dashboard:", error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch admin dashboard data",
      };
    }
  }

  /**
   * Get affiliate specific dashboard data
   */
  async getAffiliateDashboard(): Promise<DashboardResponse<BaseDashboard>> {
    try {
      const response = (await apiClient.get(
        "/api/Affiliate/dashboard",
      )) as { data: any };

      // Transform affiliate dashboard data to match BaseDashboard structure
      const affiliateData = response.data;
      const dashboard = {
        title: "Affiliate Dashboard",
        description: "Manage your referrals and track your earnings",
        metrics: [],
        recentActivity: [],
        onboardingTasks: [],
        ...affiliateData
      };

      return { success: true, data: dashboard };
    } catch (error) {
      console.error("Error creating affiliate dashboard:", error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch affiliate dashboard data",
      };
    }
  }

  /**
   * Record a profile view for analytics
   */
  async recordProfileView(
    request: RecordProfileViewRequest,
  ): Promise<DashboardResponse<void>> {
    try {
      await apiClient.post("/api/userdashboard/profile-view", request);
      return { success: true };
    } catch (error) {
      console.error("Error recording profile view:", error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to record profile view",
      };
    }
  }

  /**
   * Record user activity for analytics
   */
  async recordActivity(
    request: RecordActivityRequest,
  ): Promise<DashboardResponse<void>> {
    try {
      await apiClient.post("/api/userdashboard/activity", request);
      return { success: true };
    } catch (error) {
      console.error("Error recording activity:", error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to record activity",
      };
    }
  }

  /**
   * Record user engagement session
   */
  async recordEngagement(
    request: RecordEngagementRequest,
  ): Promise<DashboardResponse<void>> {
    try {
      await apiClient.post("/api/userdashboard/engagement", request);
      return { success: true };
    } catch (error) {
      console.error("Error recording engagement:", error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to record engagement",
      };
    }
  }

  /**
   * Refresh dashboard metrics for the current user
   */
  async refreshDashboardMetrics(): Promise<DashboardResponse<void>> {
    try {
      await apiClient.post("/api/userdashboard/refresh");
      return { success: true };
    } catch (error) {
      console.error("Error refreshing dashboard metrics:", error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to refresh dashboard metrics",
      };
    }
  }
}

// ============================================================================
// DEFAULT INSTANCE
// ============================================================================

export const dashboardService = new DashboardService();
