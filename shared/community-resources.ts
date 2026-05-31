/**
 * Community Resources — shared SSoT for the location-scoped, user-submitted
 * resource directory (job-seeker / employer help: government agencies, job
 * boards, unemployment offices, training, legal aid, etc.).
 *
 * A "resource" is a title + description plus AT LEAST ONE of { url, phone }
 * — the research on TX + MI surfaced both link-only entries (job boards) and
 * phone-first entries (claimant help lines), so the shape carries both and
 * the validator requires one. Owned jointly by the API validator
 * (`api/src/routes/community-resources.ts`) and the schema
 * (`api/src/db/schema/communityResources.ts`) — add a value here, mirror it
 * there, and the submission form + admin queue pick it up for free.
 */

export const RESOURCE_AUDIENCES = ["job_seeker", "employer", "both"] as const;
export type ResourceAudience = (typeof RESOURCE_AUDIENCES)[number];

export const RESOURCE_CATEGORIES = [
  "government_agency",
  "unemployment",
  "job_board",
  "workforce_center",
  "training",
  "veterans",
  "disability",
  "legal_aid",
  "employer_services",
  "financial_assistance",
] as const;
export type ResourceCategory = (typeof RESOURCE_CATEGORIES)[number];

export const RESOURCE_STATUSES = ["pending", "approved", "rejected"] as const;
export type ResourceStatus = (typeof RESOURCE_STATUSES)[number];

export const RESOURCE_AUDIENCE_LABEL: Record<ResourceAudience, string> = {
  job_seeker: "Job seekers",
  employer: "Employers",
  both: "Everyone",
};

export const RESOURCE_CATEGORY_LABEL: Record<ResourceCategory, string> = {
  government_agency: "Government agency",
  unemployment: "Unemployment benefits",
  job_board: "Job board",
  workforce_center: "Workforce / career center",
  training: "Training & education",
  veterans: "Veterans services",
  disability: "Disability & vocational rehab",
  legal_aid: "Legal aid & worker rights",
  employer_services: "Employer / hiring services",
  financial_assistance: "Financial & food assistance",
};

export const RESOURCE_STATUS_LABEL: Record<ResourceStatus, string> = {
  pending: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
};

/** The shape the submission form posts and the directory renders. */
export interface CommunityResourceInput {
  title: string;
  description: string;
  url?: string | null;
  phone?: string | null;
  category: ResourceCategory;
  audience: ResourceAudience;
  /** Lowercase country slug, e.g. "us" — matches the /in/:country route. */
  countryCode: string;
  /** Lowercase state/region slug, e.g. "tx" — null for country-wide. */
  stateCode?: string | null;
  /** Lowercase city slug — null for state-wide. */
  citySlug?: string | null;
}

/** A resource is only useful if a seeker can act on it — require a link or a
 *  phone number (the TX/MI research had both kinds). */
export function resourceHasContact(r: Pick<CommunityResourceInput, "url" | "phone">): boolean {
  return Boolean((r.url && r.url.trim()) || (r.phone && r.phone.trim()));
}
