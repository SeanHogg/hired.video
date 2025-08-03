export interface CompanyLocation {
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  timezone?: string;
  remote?: boolean;
}

export interface CompanyContact {
  email?: string;
  phone?: string;
  website?: string;
  linkedin?: string;
  twitter?: string;
  facebook?: string;
}

export interface CompanyFinancials {
  fundingStage?: 'pre-seed' | 'seed' | 'series-a' | 'series-b' | 'series-c' | 'series-d' | 'ipo' | 'acquired' | 'private';
  fundingAmount?: number;
  totalFunding?: number;
  currency?: string;
  valuation?: number;
  revenue?: number;
  profitability?: 'profitable' | 'break-even' | 'burning' | 'unknown';
  investors?: string[];
}

export interface CompanyBenefits {
  healthInsurance: boolean;
  dentalInsurance: boolean;
  visionInsurance: boolean;
  retirement401k: boolean;
  retirementPlan: boolean;
  stockOptions: boolean;
  paidTimeOff: boolean;
  parentalLeave: boolean;
  flexibleSchedule: boolean;
  remoteWork: boolean;
  learningBudget: boolean;
  professionalDevelopment: boolean;
  gymMembership: boolean;
  freeFood: boolean;
  commuteBenefits: boolean;
  other?: string[];
}

export interface CompanyData {
  name: string;
  logo?: string;
  website?: string;
  tagline?: string;
  description: string;
  industry: string;
  size: string; // e.g., "1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"
  founded?: number;
  headquarters: CompanyLocation;
  locations?: CompanyLocation[];
  contact: CompanyContact;
  financials?: CompanyFinancials;
  benefits: CompanyBenefits;
  culture: string[];
  technologies: string[];
  techStack?: string[]; // Alternative name for technologies
  perks: string[];
  mission?: string;
  vision?: string;
  values?: string[];
}

export type CompanyStatus = 'draft' | 'onboarding' | 'active' | 'paused' | 'inactive';
export type CompanyVisibility = 'public' | 'private' | 'draft';

export interface OnboardingTask {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  required: boolean;
  order: number;
}

export interface Company {
  id: string;
  slug: string; // User-friendly URL identifier (e.g., "techcorp-inc" or "acme-corp")
  data: CompanyData;
  status: CompanyStatus;
  visibility: CompanyVisibility;
  onboardingTasks: OnboardingTask[];
  createdAt: string;
  updatedAt: string;
  views: number;
  followers: number;
  jobCount: number;
  activeJobCount: number;
  userId: string; // Owner/admin user
  teamMembers?: string[]; // Array of user IDs who are part of this company
}

export interface CompanyMetadata {
  id: string;
  slug: string; // User-friendly URL identifier
  name: string;
  logo?: string;
  tagline?: string;
  industry: string;
  size: string;
  location: string;
  status: CompanyStatus;
  visibility: CompanyVisibility;
  createdAt: string;
  updatedAt: string;
  views: number;
  followers: number;
  jobCount: number;
  activeJobCount: number;
  userId: string;
  teamMembers?: string[];
  onboardingProgress: number; // Percentage of completed onboarding tasks
}

export type CompanyOwnership = 'owned' | 'tracked';

export interface CompanyWithOwnership extends CompanyMetadata {
  ownership: CompanyOwnership;
}

export interface CreateCompanyRequest {
  data: CompanyData;
  status?: CompanyStatus;
  visibility?: CompanyVisibility;
}

export interface UpdateCompanyRequest {
  data?: Partial<CompanyData>;
  status?: CompanyStatus;
  visibility?: CompanyVisibility;
}

export interface CompanySearchFilters {
  industry?: string[];
  size?: string[];
  location?: string;
  fundingStage?: string[];
  benefits?: string[];
  technologies?: string[];
  search?: string;
  status?: CompanyStatus;
  visibility?: CompanyVisibility;
}

export interface CompanyFollower {
  id: string;
  companyId: string;
  userId: string;
  followedAt: string;
  source?: 'direct' | 'job_tracking' | 'referral'; // How they started following
}

export interface CompanyStats {
  totalViews: number;
  totalFollowers: number;
  totalJobs: number;
  activeJobs: number;
  totalApplications: number;
  avgApplicationsPerJob: number;
  topJobCategories: string[];
  followerGrowth: Array<{ date: string; count: number }>;
}

// Default onboarding tasks
export const DEFAULT_ONBOARDING_TASKS: Array<Omit<OnboardingTask, 'completed'>> = [
  {
    id: 'update_profile',
    title: 'Update Business Profile',
    description: 'Complete your company profile with description, culture, and benefits',
    required: true,
    order: 1
  },
  {
    id: 'post_job',
    title: 'Post Your First Job',
    description: 'Create and publish your first job posting to attract talent',
    required: true,
    order: 2
  },
  {
    id: 'add_team_members',
    title: 'Invite Team Members',
    description: 'Add other team members to help manage your company profile',
    required: false,
    order: 3
  },
  {
    id: 'setup_branding',
    title: 'Setup Company Branding',
    description: 'Upload your company logo and customize your profile appearance',
    required: false,
    order: 4
  }
];
