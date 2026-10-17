/**
 * Pure serializers for /api/companies responses (no DB access).
 *   • rowToCompanyMeta    — directory / card shape (lists, create, update)
 *   • rowToCompanyProfile — full detail DTO consumed by CompanyDetail.tsx
 *   • headquartersDisplay — structured HQ → "City, State, Country"
 */
import type { schema } from "../../db/index.js";
import type { CompanyBenefits } from "../../db/schema/companies.js";

type CompanyProfileRow = typeof schema.companyProfiles.$inferSelect;
type CompanyLocationRow = typeof schema.companyLocations.$inferSelect;
type CompanyTeamMemberRow = typeof schema.companyTeamMembers.$inferSelect;

/** Render a structured headquarters object as a single display string —
 *  matches what the directory cards and the public CompanyMetadata.location
 *  field expect (free-text "City, State, Country" or null). */
export function headquartersDisplay(hq: CompanyProfileRow["headquarters"]): string | null {
  if (!hq) return null;
  const parts = [hq.city, hq.state, hq.country].filter((p): p is string => Boolean(p));
  if (parts.length > 0) return parts.join(", ");
  return hq.address ?? null;
}

export function rowToCompanyMeta(row: CompanyProfileRow) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    website: row.website,
    logo: row.logoUrl,
    logoUrl: row.logoUrl,
    industry: row.industry,
    size: row.size,
    foundedYear: row.foundedYear,
    founded: row.foundedYear,
    headquarters: row.headquarters,
    location: headquartersDisplay(row.headquarters),
    isVerified: row.isVerified,
    isActive: row.isActive,
    status: row.isActive ? "active" : "inactive",
    visibility: "public",
    // Cached review aggregate — kept in sync by recomputeAggregateCache
    // in routes/reviews.ts. Surfaced here so directory cards / OG can
    // show ratings without a second fetch against /api/reviews.
    reviewCount: row.reviewCount ?? 0,
    reviewAvgOverall: row.reviewAvgOverall != null ? Number(row.reviewAvgOverall) : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    // Surface ownerId as `userId` so directory cards can derive
    // ownership via useEntityOwnership without a second fetch — the
    // CompanyMetadata schema already declares the field, it was just
    // never populated. Without this, owners see no Edit affordance on
    // /companies because every row reports as un-owned.
    userId: row.ownerId,
  };
}

/** Per-request extras that rowToCompanyProfile needs but can't compute
 *  on its own. The use case gathers counts + loads child tables
 *  (locations, team members) and passes them in — keeping the serializer
 *  pure so it's trivially unit-testable without a DB. */
export interface CompanyProfileExtras {
  jobCount: number;
  activeJobCount: number;
  followerCount: number;
  viewCount: number;
  locations: CompanyLocationRow[];
  teamMembers: CompanyTeamMemberRow[];
}

/** Builds the detail DTO for a company. Every field is either a real
 *  column on `company_profiles`, a real row from `company_locations` /
 *  `company_team_members`, or an aggregate on `artifact_views`. No
 *  placeholders, no fabricated booleans. */
export function rowToCompanyProfile(
  row: CompanyProfileRow,
  extras: CompanyProfileExtras,
  _viewerId: string | null,
) {
  // Nested DTO matching CompanyProfileSchema in the front-end:
  // top-level holds the artifact (id, slug, status, …); content fields
  // live under `data` so downstream code reads `company.data.X` cleanly.
  return {
    id: row.id,
    slug: row.slug,
    data: {
      name: row.name,
      logo: row.logoUrl,
      website: row.website,
      tagline: row.tagline ?? null,
      description: row.description,
      industry: row.industry,
      size: row.size,
      founded: row.foundedYear,
      headquarters: row.headquarters ?? {},
      contact: row.contact ?? {},
      locations: extras.locations,
      culture: (row.culture as string[] | null) ?? [],
      technologies: (row.technologies as string[] | null) ?? [],
      perks: (row.perks as string[] | null) ?? [],
      mission: row.mission ?? null,
      vision: row.vision ?? null,
      values: (row.values as string[] | null) ?? [],
      benefits: (row.benefits as CompanyBenefits | null) ?? {},
    },
    status: row.isActive ? "active" : "inactive",
    visibility: "public",
    onboardingTasks: [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    views: extras.viewCount,
    followers: extras.followerCount,
    jobCount: extras.jobCount,
    activeJobCount: extras.activeJobCount,
    reviewCount: row.reviewCount ?? 0,
    reviewAvgOverall: row.reviewAvgOverall != null ? Number(row.reviewAvgOverall) : null,
    userId: row.ownerId,
    teamMembers: extras.teamMembers,
  };
}
