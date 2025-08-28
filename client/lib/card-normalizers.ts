/**
 * Card Data Normalizers
 * 
 * These functions transform inconsistent API data into standardized card interfaces,
 * eliminating hardcoded business assumptions and data structure inconsistencies.
 */

import type {
  RawApiItem,
  NormalizedJobData,
  NormalizedCompanyData,
  NormalizedPersonData,
  NormalizedResumeData,
  NormalizedVideoData,
  CardContext,
  CardType
} from "@/types/normalized-cards";

/**
 * Normalize job data from various API formats
 */
export function normalizeJobData(
  item: RawApiItem, 
  context: CardContext
): NormalizedJobData {
  // Handle nested jobData structure vs flat structure
  const jobData = item.jobData || item;
  
  return {
    id: jobData.id || item.id,
    type: "job" as const,
    title: jobData.title || item.title || "Untitled Position",
    company: jobData.company || item.company || "Unknown Company",
    location: jobData.location || item.location || "Remote",
    salary: (jobData as any)?.salary || (item as any)?.salary,
    employmentType: jobData.employmentType || item.employmentType || "Full-time",
    experienceLevel: (jobData as any)?.experienceLevel || (item as any)?.experienceLevel || "Not specified",
    status: (jobData as any)?.status || (item as any)?.status || "active",
    privacy: (jobData as any)?.privacy || (item as any)?.privacy || "public",
    summary: (jobData as any)?.summary || (item as any)?.summary || "",
    createdAt: (jobData as any)?.createdAt || (jobData as any)?.postedDate || (item as any)?.createdAt || new Date().toISOString(),
    views: jobData.views || item.views || 0,
    applications: (jobData as any)?.applications || (item as any)?.applications || 0,
    ownership: determineOwnership(item, context) === "none" ? "tracked" : determineOwnership(item, context) as "owned" | "tracked",
    showOwnership: context.showOwnership || false,
    userId: (jobData as any)?.userId || (item as any)?.userId,
    companyId: (jobData as any)?.companyId || (item as any)?.companyId,
    expiresAt: (jobData as any)?.expiresAt || (item as any)?.expiresAt,
    slug: (jobData as any)?.slug || (item as any)?.slug
  };
}

/**
 * Normalize company data from various API formats
 */
export function normalizeCompanyData(
  item: RawApiItem,
  context: CardContext
): NormalizedCompanyData {
  return {
    id: item.id,
    type: "company" as const,
    name: item.name || item.title || "Unknown Company",
    logo: item.logo || item.avatar,
    tagline: item.tagline || item.summary,
    industry: item.industry || "Technology", // Remove hardcoded assumption
    size: item.size || "Unknown",
    location: item.location || "Unknown",
    status: item.status || "active",
    visibility: item.visibility || item.privacy || "public",
    createdAt: item.createdAt || new Date().toISOString(),
    views: item.views || 0,
    followers: item.followers || 0,
    jobCount: item.jobCount || 0,
    activeJobCount: item.activeJobCount || 0,
    ownership: determineOwnership(item, context) === "none" ? "tracked" : determineOwnership(item, context) as "owned" | "tracked",
    showOwnership: context.showOwnership || false,
    userId: item.userId,
    teamMembers: item.teamMembers || [],
    onboardingProgress: item.onboardingProgress,
    slug: item.slug
  };
}

/**
 * Normalize person data from various API formats
 */
export function normalizePersonData(
  item: RawApiItem,
  context: CardContext
): NormalizedPersonData {
  const firstName = item.firstName || "";
  const lastName = item.lastName || "";
  const fullName = item.fullName || item.name || `${firstName} ${lastName}`.trim() || "Unknown User";

  return {
    id: item.id,
    type: "people" as const,
    firstName,
    lastName,
    fullName,
    avatar: item.avatar || item.logo,
    headline: item.headline || item.tagline || item.summary,
    location: item.location,
    role: item.role || item.profession,
    visibility: item.visibility || item.privacy || "public",
    status: item.status || "active",
    createdAt: item.createdAt || new Date().toISOString(),
    views: item.views || item.profileViews || 0,
    companyId: item.companyId,
    companyName: item.companyName || item.company,
    lastActiveAt: item.lastActiveAt,
    profileViews: item.profileViews || item.views || 0,
    connectionCount: item.connectionCount || 0,
    followerCount: item.followerCount || 0,
    isVerified: item.isVerified || false,
    isPremium: item.isPremium || false,
    openToWork: item.openToWork || false,
    experienceLevel: item.experienceLevel,
    currentPosition: item.currentPosition || item.role,
    currentCompany: item.currentCompany || item.company,
    ownership: determineOwnership(item, context) === "none" ? "tracked" : determineOwnership(item, context) as "owned" | "tracked" | "connected",
    showOwnership: context.showOwnership || false,
    slug: item.slug
  };
}

/**
 * Normalize resume data from various API formats
 */
export function normalizeResumeData(
  item: RawApiItem,
  context: CardContext
): NormalizedResumeData {
  return {
    id: item.id,
    type: "resume" as const,
    name: item.name || item.title || "Untitled Resume",
    title: item.title,
    summary: item.summary || "",
    privacy: normalizeResumePrivacy(item, context),
    createdAt: item.createdAt || new Date().toISOString(),
    views: item.views || 0,
    isMaster: item.isMaster,
    isActive: item.isActive,
    parentId: item.parentId,
    ownership: determineOwnership(item, context),
    showOwnership: context.showOwnership || false,
    slug: item.slug
  };
}

/**
 * Normalize video data from various API formats
 */
export function normalizeVideoData(
  item: RawApiItem
): NormalizedVideoData {
  return {
    id: item.id,
    type: "video" as const,
    title: item.title || item.name || "Untitled Video",
    description: item.description || item.summary || "",
    thumbnail: item.thumbnail,
    duration: item.duration || "0:00",
    videoType: (item.type as "resume" | "job_description") || "resume",
    profession: item.profession,
    company: item.company,
    createdAt: item.createdAt || new Date().toISOString(),
    views: item.views || 0,
    slug: item.slug,
    ownership: determineOwnership(item, context),
    showOwnership: context.showOwnership || false
  };
}

/**
 * Determine ownership status based on context and item data
 */
function determineOwnership(
  item: RawApiItem,
  // eslint-disable-next-line no-unused-vars
  _context: CardContext
): "owned" | "tracked" | "none" {
  // Remove hardcoded "tracked" assumption
  if (item.ownership) {
    return item.ownership;
  }
  
  if (item.userId) {
    return "owned";
  }
  
  return "none";
}

/**
 * Normalize resume privacy with context-aware logic
 */
function normalizeResumePrivacy(
  item: RawApiItem,
  context: CardContext
): "public" | "recruiter_only" | "private" | "draft" {
  // Handle the inconsistency between "Latest Resumes" and "All" sections
  if (context.section === "latest") {
    return (item.privacy as "public" | "private" | "draft" | "recruiter_only") || "public";
  }

  // For "All" section, don't override with hardcoded "public"
  return (item.privacy as "public" | "private" | "draft" | "recruiter_only") || "draft";
}

/**
 * Get card type from raw API item
 */
export function getCardType(item: RawApiItem): CardType {
  if (item.type) {
    return item.type as CardType;
  }

  // Infer type from data structure - improved detection

  // Company detection - look for company-specific fields
  if (item.industry || item.size || item.logo ||
      (item.title === 'Company') ||
      (item.summary && item.summary.includes('Company'))) {
    return "company";
  }

  // Job detection - look for job-specific fields
  if (item.jobData || item.company || item.location || item.salary ||
      (item.title && item.title.includes('Engineer')) ||
      (item.summary && item.summary.includes('at Unknown Company'))) {
    return "job";
  }

  // Person detection
  if (item.firstName || item.lastName || item.role) {
    return "people";
  }

  // Resume detection
  if (item.privacy && (item.privacy === "public" || item.privacy === "private")) {
    return "resume";
  }

  // Video detection
  if (item.duration || item.thumbnail) {
    return "video";
  }

  return "job"; // Default fallback
}
