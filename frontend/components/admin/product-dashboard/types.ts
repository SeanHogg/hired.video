export interface GrowthPoint {
  date: string;
  count: number;
}

export interface SaasMetrics {
  monthlyRecurringRevenue: number;
  annualRecurringRevenue: number;
  averageRevenuePerUser: number;
  customerLifetimeValue?: number;
  customerAcquisitionCost?: number;
  churnRate: number;
  growthRate: number;
  conversionRate: number;
  totalSubscriptions: number;
  activeSubscriptions: number;
  subscriptionsByTier?: Record<string, number>;
  revenueByTier?: Record<string, number>;
}

export interface ProductDashboardData {
  userMetrics: {
    totalUsers: number;
    activeUsers: number;
    newUsersLast30Days: number;
    usersByRole?: Record<string, number>;
    newUsersByRole?: Record<string, number>;
    usersByStatus?: Record<string, number>;
  };
  jobMetrics: {
    totalJobs: number;
    activeJobs: number;
    newJobsLast30Days: number;
    jobsByStatus?: Record<string, number>;
    jobsByOrigin?: Record<string, number>;
  };
  profileMetrics?: {
    totalProfiles: number;
    publicProfiles: number;
    newProfilesLast30Days: number;
    profilesByStatus?: Record<string, number>;
    profilesByPrivacy?: Record<string, number>;
  };
  companyMetrics: {
    totalCompanies: number;
    activeCompanies?: number;
    newCompaniesLast30Days: number;
    companiesByStatus?: Record<string, number>;
    companiesBySize?: Record<string, number>;
  };
  resumeMetrics: {
    totalResumes: number;
    publicResumes?: number;
    newResumesLast30Days: number;
    resumesByType?: Record<string, number>;
    resumesByStatus?: Record<string, number>;
  };
  saasMetrics?: SaasMetrics;
  userGrowthLast90Days?: GrowthPoint[];
  jobGrowthLast90Days?: GrowthPoint[];
  profileGrowthLast90Days?: GrowthPoint[];
  companyGrowthLast90Days?: GrowthPoint[];
  resumeGrowthLast90Days?: GrowthPoint[];
}

export type ProductDashboardTab =
  | "overview"
  | "users"
  | "jobs"
  | "companies"
  | "resumes"
  | "affiliates"
  | "saas";
