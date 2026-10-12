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
import {
  deriveEntityOwnership,
  type OwnershipClassification,
} from "@/lib/use-entity-ownership";

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
    isOfficial: item.isOfficial,
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
    isOfficial: item.isOfficial,
  };
}

/**
 * Normalize person data from various API formats.
 *
 * Display-derivation is NOT this normalizer's job (#1657 / #1659) —
 * it only does shape coercion. Empty strings flow through; the
 * canonical seam at `lib/person-display.ts` decides what to render
 * for blank values. Pre-#1657 this normalizer hardcoded "Unknown
 * User" / "Professional" / `role` as `currentPosition`, which
 * surfaced as snake_case role chips and generic "Professional"
 * headlines on the homepage People cards.
 *
 * If a field is missing from the API, this normalizer returns
 * empty string / undefined. Components MUST handle empty values
 * (either hide the section or render the i18n fallback). Inventing
 * generic display text here would re-create the duplicate-fallback
 * anti-pattern this module exists to prevent.
 */
export function normalizePersonData(
  item: RawApiItem,
  context: CardContext,
): NormalizedPersonData {
  return {
    id: item.id,
    type: "people" as const,
    firstName: item.firstName || "",
    lastName: item.lastName || "",
    // Empty when API doesn't supply — getPersonDisplayName in the
    // consumer renders the i18n "User" fallback.
    fullName: item.fullName || item.name || "",
    avatar: item.avatar,
    // Empty when not set — consumer renders nothing for the headline
    // rather than fabricating "Professional".
    headline: item.headline || "",
    location: item.location || "",
    // Raw role enum (e.g. JOB_SEEKER / RECRUITER). Consumers MUST
    // render via getPersonRoleLabel from lib/person-display.ts so
    // the snake_case enum never reaches the DOM.
    role: item.role || "",
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
    isPro: item.isPro || false,
    openToWork: item.openToWork || false,
    isCreator: item.isCreator === true,
    creatorPrograms: item.creatorPrograms ?? { video: false, voice: false, services: false },
    experienceLevel: item.experienceLevel,
    // Use the proper current-position field. NEVER fall back to the
    // raw role enum — that's how "recruiter" / "job_seeker" leaked
    // into the Briefcase chip on the public People cards (#1659).
    currentPosition: item.currentRole || undefined,
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
    isOfficial: item.isOfficial,
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
  // Resume listings carry a server-derived `isOwner` flag on each row —
  // collapse it into the same `ownership` enum the shared predicate
  // accepts, then run through `deriveEntityOwnership` so this surface
  // agrees with every other card / hook call site.
  const explicitOwnership: OwnershipClassification | undefined =
    item.isOwner === true
      ? "owned"
      : (item.ownership as OwnershipClassification | undefined);
  const { isOwner } = deriveEntityOwnership({
    itemUserId: item.userId,
    viewerUserId: context.userContext?.userId,
    ownership: explicitOwnership,
  });
  const ownership: "owned" | "tracked" = isOwner ? "owned" : "tracked";

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
    isOfficial: item.isOfficial,
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
    isOfficial: item.isOfficial,
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
    isOfficial: item.isOfficial,
  };
}

/**
 * Determine ownership status based on context and item data
 */
function determineOwnership(
  item: RawApiItem,
  context: CardContext,
): "owned" | "tracked" | "none" {
  // Single predicate shared with `useEntityOwnership` — see
  // `lib/use-entity-ownership.ts` for the resolution order. Card cards
  // that listed every entity with a userId as "owned" used to leak
  // Edit / Delete / Create Video onto non-owned profile cards; the
  // pure helper enforces an actual viewer-vs-item match.
  const { classification } = deriveEntityOwnership({
    itemUserId: item.userId,
    viewerUserId: context.userContext?.userId,
    ownership: item.ownership as OwnershipClassification | undefined,
  });
  // Card normalizers only care about owned / tracked / none — collapse
  // the richer enum to the legacy three-value shape.
  if (classification === "owned" || classification === "account_owned") {
    return "owned";
  }
  if (classification === "tracked") {
    return "tracked";
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
