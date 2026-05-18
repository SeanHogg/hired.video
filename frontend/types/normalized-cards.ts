/**
 * Normalized Card Data Interfaces
 *
 * These interfaces define consistent data structures for all card components,
 * eliminating the architectural inconsistencies found in the current implementation.
 */

// Base interface for all card types
export interface BaseCardData {
  id: string;
  type: CardType;
  slug: string;
  createdAt: string;
  updatedAt: string;
  views: number;
  showOwnership: boolean;
}

// Enhanced user context and permissions
export interface UserContext {
  userId: string;
  role: "account_owner" | "recruiter" | "regular_user" | "admin";
  accountId?: string;
  permissions: string[];
  isAuthenticated: boolean;
}

// Enhanced ownership and interaction patterns
export interface ItemOwnership {
  ownership: "owned" | "tracked" | "account_owned" | "none";
  ownerId?: string;
  accountId?: string;
  canEdit?: boolean;
  canDelete?: boolean;
  canManage?: boolean;
  showOwnership?: boolean;
}

export interface CardInteractions {
  onView?: (item: NormalizedCardData) => void;
  onActions?: (item: NormalizedCardData) => void;
   
  onTrack?: (id: string) => void;
   
  onUntrack?: (id: string) => void;
   
  onEdit?: (id: string) => void;
   
  onDelete?: (id: string) => void;
   
  onManage?: (id: string) => void;
   
  onAssign?: (id: string) => void;
   
  onContact?: (id: string) => void;
   
  onReview?: (id: string) => void;
}

// Job Card Data
export interface NormalizedJobData extends BaseCardData {
  title: string;
  company: string;
  location: string;
  salary?: string;
  employmentType: string;
  experienceLevel: string;
  status: "active" | "paused" | "closed" | "draft";
  privacy: "public" | "private";
  summary: string;
  applications: number;
  expiresAt?: string;
  userId: string;
  companyId?: string;
  ownership: "owned" | "tracked";
}

// Company Card Data
export interface NormalizedCompanyData extends BaseCardData {
  name: string;
  logo?: string;
  tagline?: string;
  industry: string;
  size: string;
  location: string;
  status: "active" | "onboarding" | "draft" | "paused" | "inactive";
  visibility: "public" | "private";
  followers: number;
  jobCount: number;
  activeJobCount: number;
  userId: string;
  teamMembers?: string[];
  onboardingProgress: number;
  ownership: "owned" | "tracked";
}

// People Card Data
export interface NormalizedPersonData extends BaseCardData {
  firstName: string;
  lastName: string;
  fullName: string;
  avatar?: string;
  headline: string;
  location: string;
  role: string;
  visibility: "public" | "private";
  status: "active" | "inactive";
  companyId?: string;
  companyName?: string;
  lastActiveAt: string;
  profileViews: number;
  connectionCount: number;
  followerCount: number;
  emailConfirmed: boolean;
  isPro: boolean;
  openToWork: boolean;
  experienceLevel?: "entry" | "mid" | "senior" | "executive";
  currentPosition?: string;
  currentCompany?: string;
  ownership: "owned" | "tracked" | "connected";
  userId?: string;
  isCreator?: boolean;
  creatorPrograms?: { video: boolean; voice: boolean; services: boolean };
}

// Resume Card Data
export interface NormalizedResumeData extends BaseCardData {
  name: string;
  title?: string;
  summary: string;
  privacy: "public" | "recruiter_only" | "connections" | "private" | "draft";
  status?: "active" | "draft" | "archived";
  isMaster?: boolean;
  isActive?: boolean;
  parentId?: string | null;
  ownership: "owned" | "tracked";
  userId?: string;
}

// Video Card Data
export interface NormalizedVideoData extends BaseCardData {
  title: string;
  description: string;
  thumbnail?: string;
  duration: string;
  videoType: "resume" | "job_description";
  profession?: string;
  company?: string;
  ownership: "owned" | "tracked";
  userId?: string;
  status?: "active" | "draft" | "archived";
}

// Media Card Data
export interface NormalizedMediaData extends BaseCardData {
  title: string;
  name: string;
  description: string;
  metaType: number;
  url: string;
  userId?: string;
  referenceId?: string;
  ownership: "owned" | "tracked";
}

// Union type for all normalized card data
export type NormalizedCardData =
  | NormalizedJobData
  | NormalizedCompanyData
  | NormalizedPersonData
  | NormalizedResumeData
  | NormalizedVideoData
  | NormalizedMediaData;

// Card type discriminator
export type CardType = "job" | "company" | "people" | "resume" | "video" | "media";

// Card rendering context
export interface CardContext {
  section: "featured" | "recent" | "latest" | "top" | "all";
  userContext?: UserContext;
  showOwnership?: boolean;
  maxItems?: number;
  interactions?: CardInteractions;
}

// Raw API data types (what we currently receive)
export interface RawApiItem {
  id: string;
  type: string;
  name?: string;
  title?: string;
  summary?: string;
  createdAt?: string;
  views?: number;
  privacy?: string;
  avatar?: string;
  logo?: string;
  location?: string;
  company?: string;
  profession?: string;
  role?: string;
  size?: string;
  isVerified?: boolean;
  isPro?: boolean;
  /** True when the content was authored by hired.video / a superadmin
   *  (Sean Hogg) rather than a community creator. Drives `<OfficialBadge/>`
   *  visibility on listing cards + detail surfaces. See gap #183. */
  isOfficial?: boolean;
  jobData?: {
    id: string;
    title: string;
    company: string;
    location: string;
    employmentType: string;
    postedDate: string;
    views?: number;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any; // For additional properties we might not know about
}
