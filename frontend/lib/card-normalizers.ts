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
  NormalizedMediaData,
  CardContext,
  CardType,
} from "@/types/normalized-cards";

/**
 * Normalize job data from various API formats
 */
export function normalizeJobData(
  item: RawApiItem,
  context: CardContext,
): NormalizedJobData {
  // Handle nested jobData structure vs flat structure
  const jobData: RawApiItem = (item.jobData as unknown as RawApiItem) || item;

  return {
    id: jobData.id || item.id,
    type: "job" as const,
    title: jobData.title || item.title || "Untitled Position",
    company: jobData.company || item.company || "Unknown Company",
    location: jobData.location || item.location || "Remote",
    salary: jobData.salary || item.salary,
    employmentType:
      jobData.employmentType || item.employmentType || "Full-time",
    experienceLevel:
      jobData.experienceLevel ||
      item.experienceLevel ||
      "Not specified",
    status: jobData.status || item.status || "active",
    privacy: (jobData.privacy || item.privacy || "public") as "public" | "private",
    summary: jobData.summary || item.summary || "",
    createdAt:
      jobData.createdAt ||
      jobData.postedDate ||
      item.createdAt ||
      new Date().toISOString(),
    updatedAt:
      jobData.updatedAt ||
      item.updatedAt ||
      new Date().toISOString(),
    views: jobData.views || item.views || 0,
    applications:
      jobData.applications || item.applications || 0,
    ownership:
      determineOwnership(item, context) === "none"
        ? "tracked"
        : (determineOwnership(item, context) as "owned" | "tracked"),
    showOwnership: context.showOwnership || false,
    userId: jobData.userId || item.userId || "unknown",
    companyId: jobData.companyId || item.companyId,
    expiresAt: jobData.expiresAt || item.expiresAt,
    slug: jobData.slug || item.slug || `job-${item.id}`,
  };
}

/**
 * Normalize company data from various API formats
 */
export function normalizeCompanyData(
  item: RawApiItem,
  context: CardContext,
): NormalizedCompanyData {
  // Handle nested data structure from API
  const companyData = item.data || item;

  return {
    id: item.id || companyData.id,
    type: "company" as const,
    name: companyData.name || item.name || item.title || "Unknown Company",
    logo: companyData.logo || item.logo || item.avatar,
    tagline: companyData.tagline || item.tagline || item.summary,
    industry: companyData.industry || item.industry || "Not specified",
    size: companyData.size || item.size || "Not specified",
    location: companyData.location || item.location ||
      (companyData.headquarters?.city && companyData.headquarters?.state
        ? `${companyData.headquarters.city}, ${companyData.headquarters.state}`
        : "Not specified"),
    status: item.status || companyData.status || "active",
    visibility: item.visibility || companyData.visibility || item.privacy || "public",
    createdAt: item.createdAt || companyData.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || companyData.updatedAt || new Date().toISOString(),
    views: item.views || companyData.views || 0,
    followers: item.followers || companyData.followers || 0,
    jobCount: item.jobCount || companyData.jobCount || 0,
    activeJobCount: item.activeJobCount || companyData.activeJobCount || 0,
    ownership:
      determineOwnership(item, context) === "none"
        ? "tracked"
        : (determineOwnership(item, context) as "owned" | "tracked"),
    showOwnership: context.showOwnership || false,
    userId: item.userId || companyData.userId || "unknown",
    teamMembers: item.teamMembers || companyData.teamMembers || [],
    onboardingProgress: item.onboardingProgress || companyData.onboardingProgress || 0,
    slug: item.slug || companyData.slug || `company-${item.id}`,
  };
}

/**
 * Normalize person data from various API formats
 */
export function normalizePersonData(
  item: RawApiItem,
  context: CardContext,
): NormalizedPersonData {
  // The backend toPublicUserCardDto returns canonical field names:
  // firstName, lastName, fullName, avatar, headline, currentCompany, etc.
  return {
    id: item.id,
    type: "people" as const,
    firstName: item.firstName || "",
    lastName: item.lastName || "",
    fullName: item.fullName || item.name || "Unknown User",
    avatar: item.avatar,
    headline: item.headline || "Professional",
    location: item.location || "Location not specified",
    role: item.role || "Professional",
    visibility: item.visibility || "public",
    status: item.status || "active",
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || new Date().toISOString(),
    views: item.views || 0,
    companyId: item.companyId,
    companyName: item.currentCompany,
    lastActiveAt: item.lastActiveAt || new Date().toISOString(),
    profileViews: item.views || 0,
    connectionCount: item.connectionCount || 0,
    followerCount: item.followerCount || 0,
    emailConfirmed: item.emailConfirmed || false,
    isPremium: item.isPremium || false,
    openToWork: item.openToWork || false,
    experienceLevel: item.experienceLevel,
    currentPosition: item.currentRole || item.role,
    currentCompany: item.currentCompany,
    ownership:
      determineOwnership(item, context) === "none"
        ? "tracked"
        : (determineOwnership(item, context) as
          | "owned"
          | "tracked"
          | "connected"),
    showOwnership: context.showOwnership || false,
    slug: item.slug || `person-${item.id}`,
  };
}

/**
 * Normalize resume data from various API formats.
 *
 * Accepts the canonicalized `RawApiItem` produced by card-feed (from
 * `/api/resumes/public`), which carries `summary` (Basics.summary),
 * `privacy`, `isMaster`, `isActive`, `parentId`, and the real `userId` —
 * everything the ResumeCard and downstream ownership detection need.
 */
export function normalizeResumeData(
  item: RawApiItem,
  context: CardContext,
): NormalizedResumeData {
  // Ownership resolution order:
  //   1. backend isOwner flag (already derived from auth context server-side)
  //   2. item.userId matches the current viewer's userId
  //   3. fall back to determineOwnership for legacy payloads carrying an
  //      explicit ownership field
  //   4. default to tracked
  // Note: the legacy `determineOwnership` returns "owned" whenever item.userId
  // exists regardless of who owns it, so we must NOT rely on it when a viewer
  // id is available — otherwise every non-anonymous viewer sees "owned".
  const viewerUserId = context.userContext?.userId;
  const legacyOwnership = determineOwnership(item, context);
  const ownership: "owned" | "tracked" =
    item.isOwner === true
      ? "owned"
      : viewerUserId && item.userId && item.userId === viewerUserId
        ? "owned"
        : legacyOwnership === "owned" && !viewerUserId
          ? "owned"
          : "tracked";

  return {
    id: item.id,
    type: "resume" as const,
    name: item.title || "Untitled Resume",
    title: item.title || "Untitled Resume",
    summary: item.summary || item.description || "",
    privacy: normalizeResumePrivacy(item, context),
    status: (item.status as "active" | "draft" | "archived") || "active",
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || new Date().toISOString(),
    views: item.views || 0,
    isMaster: item.isMaster,
    isActive: item.isActive,
    parentId: item.parentId,
    userId: item.userId,
    ownership,
    showOwnership: context.showOwnership || false,
    slug: item.slug || `resume-${item.id}`,
  };
}

/**
 * Normalize video data from various API formats
 */
export function normalizeVideoData(
  item: RawApiItem,
  context: CardContext,
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
    updatedAt: item.updatedAt || new Date().toISOString(),
    views: item.views || 0,
    slug: item.slug || `video-${item.id}`,
    ownership:
      determineOwnership(item, context) === "none"
        ? "tracked"
        : (determineOwnership(item, context) as "owned" | "tracked"),
    showOwnership: context.showOwnership || false,
    userId: item.userId,
    status: (item.status as "active" | "draft" | "archived") || "active",
  };
}

/**
 * Normalize media data from various API formats
 */
export function normalizeMediaData(
  item: RawApiItem,
  context: CardContext,
): NormalizedMediaData {
  return {
    id: item.id,
    type: "media" as const,
    title: item.title || item.name || "Untitled Media",
    name: item.name || item.title || "Untitled Media",
    description: item.description || item.summary || "",
    metaType: item.metaType || 0,
    url: item.experienceLevel || item.url || "", // Backend stores URL in experienceLevel field
    userId: item.location || item.userId || "", // Backend stores userId in location field
    referenceId: item.company || item.referenceId || "", // Backend stores referenceId in company field
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || new Date().toISOString(),
    views: item.views || 0,
    slug: item.slug || `media-${item.id}`,
    showOwnership: context.showOwnership ?? false,
    ownership:
      determineOwnership(item, context) === "none"
        ? "tracked"
        : (determineOwnership(item, context) as "owned" | "tracked"),
  };
}

/**
 * Determine ownership status based on context and item data
 */
function determineOwnership(
  item: RawApiItem,
   
  _context: CardContext,
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
 * Normalize resume privacy. The backend now returns an explicit `privacy`
 * string ("public" | "recruiter_only" | "connections" | "private" | "draft"),
 * so trust it when present. Only fall back when missing.
 */
function normalizeResumePrivacy(
  item: RawApiItem,
  _context: CardContext,
): "public" | "recruiter_only" | "connections" | "private" | "draft" {
  const explicit = item.privacy as
    | "public"
    | "private"
    | "draft"
    | "recruiter_only"
    | "connections"
    | undefined;
  if (explicit) return explicit;

  // No privacy signal at all — fall back to public since the item came from
  // a public listing endpoint.
  return item.isPublic === false ? "private" : "public";
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
  if (
    item.industry ||
    item.size ||
    item.logo ||
    item.title === "Company" ||
    (item.summary && item.summary.includes("Company"))
  ) {
    return "company";
  }

  // Job detection - look for job-specific fields
  if (
    item.jobData ||
    item.company ||
    item.location ||
    item.salary ||
    (item.title && item.title.includes("Engineer")) ||
    (item.summary && item.summary.includes("at Unknown Company"))
  ) {
    return "job";
  }

  // Person detection
  if (item.firstName || item.lastName || item.role) {
    return "people";
  }

  // Resume detection
  if (
    item.privacy &&
    (item.privacy === "public" || item.privacy === "private")
  ) {
    return "resume";
  }

  // Media detection - check for media-specific fields
  if (item.metaType !== undefined || item.skills?.includes("YouTube") || item.skills?.includes("VideoMP4") || item.skills?.includes("Image")) {
    return "media";
  }

  // Video detection
  if (item.duration || item.thumbnail) {
    return "video";
  }

  return "job"; // Default fallback
}
