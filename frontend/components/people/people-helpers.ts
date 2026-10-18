/**
 * Pure helpers, form shapes and person projections for the /people page
 * (pages/People.tsx). No React, no fetching — safe to unit-test directly.
 */
import type { TFunction } from "i18next";
import { USER_ROLES } from "@/lib/auth";
import type { UserRole } from "@shared/user-roles";
import { visibleTo } from "@/lib/persona";
import { formatDateMedium } from "@/lib/format";
import type { PublicUser } from "@/lib/services/user-service";
import type { TalentPoolEntry } from "@/lib/services/recruiter-service";
import type { UserWithOwnership } from "@/types/people";

/** Hiring-side viewer (recruiter / employer / admin) — gates the Talent Pool
 * and Submissions loads. */
export function isHiringSideRole(role: string | undefined): boolean {
  return visibleTo(
    [USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER, USER_ROLES.ADMIN],
    role as UserRole,
  );
}

/** Talent-pool / submission dates render as e.g. "Mar 4, 2026". */
export function formatPeopleDate(dateString: string): string {
  return formatDateMedium(dateString, "en-US");
}

type PositionSource = Pick<PublicUser, "currentRole" | "currentCompany">;

// TODO: Calculate experience level from API data when detailed experience is available
export function experienceLevelFor(person: PositionSource): string {
  if (person.currentRole?.toLowerCase().includes("senior")) return "Senior Level";
  if (
    person.currentRole?.toLowerCase().includes("lead") ||
    person.currentRole?.toLowerCase().includes("manager")
  )
    return "Senior Level";
  if (person.currentRole?.toLowerCase().includes("junior")) return "Entry Level";
  return "Mid Level"; // Default fallback
}

export function currentPositionFor(person: PositionSource, t: TFunction): string | undefined {
  if (person.currentRole && person.currentCompany) {
    return t("labels.people.positionAtCompany", {
      role: person.currentRole,
      company: person.currentCompany,
    });
  }
  return person.currentRole || undefined;
}

/** Connections-tab card shape for one of the viewer's accepted connections. */
export function toTrackedPerson(person: PublicUser, t: TFunction): UserWithOwnership {
  return {
    id: person.id,
    slug: person.slug,
    firstName: person.fullName?.split(" ")[0] || "",
    lastName: person.fullName?.split(" ").slice(1).join(" ") || "",
    fullName: person.fullName || "",
    avatar: person.avatar,
    headline: person.headline,
    location: person.location || "",
    role: person.role, // Keep original role value for proper processing
    visibility: "public", // Default for tracked users
    status: "active", // Default status
    companyId: "", // Not available in UserMetadataDTO
    companyName: person.currentCompany || "",
    createdAt: person.createdAt,
    updatedAt: person.updatedAt,
    lastActiveAt: new Date().toISOString(), // Default to now
    profileViews: person.profileViews || 0,
    connectionCount: 0, // Not available in UserMetadataDTO
    followerCount: 0, // Not available in UserMetadataDTO
    emailConfirmed: person.emailConfirmed || false,
    isPro: person.isPro || false,
    openToWork: person.openToWork || false,
    experienceLevel: experienceLevelFor(person),
    currentPosition: currentPositionFor(person, t),
    currentCompany: person.currentCompany || "",
    ownership: "tracked" as const,
  };
}

/** Signed-out marketing page "featured" card shape. */
export function toFeaturedPerson(person: PublicUser, t: TFunction) {
  return {
    id: person.id || "",
    slug: person.slug || "",
    firstName: person.fullName?.split(" ")[0] || "",
    lastName: person.fullName?.split(" ").slice(1).join(" ") || "",
    fullName: person.fullName || "",
    avatar: person.avatar,
    headline: person.headline,
    location: person.location || "",
    role: person.role, // Keep original role value for proper processing
    visibility: "public" as const, // Default for public users
    status: "active" as const, // Default status
    companyId: "", // Not available in PublicUser
    companyName: person.currentCompany || "",
    createdAt: person.createdAt || "",
    updatedAt: person.updatedAt || "",
    lastActiveAt: person.updatedAt || "", // Use updatedAt as fallback
    profileViews: person.profileViews || 0,
    connectionCount: 0, // Not available in PublicUser
    followerCount: 0, // Not available in PublicUser
    emailConfirmed: person.emailConfirmed || false,
    isPro: person.isPro || false,
    openToWork: person.openToWork || false,
    experienceLevel: experienceLevelFor(person),
    currentPosition: currentPositionFor(person, t),
    currentCompany: person.currentCompany || "",
    ownership: "tracked" as const,
  };
}

// ── Form shapes ────────────────────────────────────────────────────────────

export interface EditCandidateForm {
  relationshipStrength: string;
  tags: string[];
  poolName: string;
  status: string;
  notes: string;
  currentCompany: string;
  currentTitle: string;
  desiredSalary: number | undefined;
  preferredLocations: string;
  contactFrequency: string;
  nextFollowUpAt: string;
}

export const EMPTY_EDIT_CANDIDATE_FORM: EditCandidateForm = {
  relationshipStrength: "",
  tags: [],
  poolName: "",
  status: "",
  notes: "",
  currentCompany: "",
  currentTitle: "",
  desiredSalary: undefined,
  preferredLocations: "",
  contactFrequency: "",
  nextFollowUpAt: "",
};

export function editFormFromCandidate(candidate: TalentPoolEntry): EditCandidateForm {
  return {
    relationshipStrength: candidate.relationshipStrength,
    tags: candidate.tags,
    poolName: candidate.poolName || "",
    status: candidate.status,
    notes: candidate.notes || "",
    currentCompany: candidate.currentCompany || "",
    currentTitle: candidate.currentTitle || "",
    desiredSalary: candidate.desiredSalary,
    preferredLocations: candidate.preferredLocations || "",
    contactFrequency: candidate.contactFrequency || "",
    nextFollowUpAt: candidate.nextFollowUpAt || "",
  };
}

export interface InteractionForm {
  interactionType: string;
  subject: string;
  notes: string;
  outcome: string;
  durationMinutes: number | undefined;
  requiresFollowUp: boolean;
  followUpDate: string;
}

export const EMPTY_INTERACTION_FORM: InteractionForm = {
  interactionType: "Call",
  subject: "",
  notes: "",
  outcome: "",
  durationMinutes: undefined,
  requiresFollowUp: false,
  followUpDate: "",
};

export interface SubmitToJobForm {
  jobId: string;
  resumeId: string;
  coverLetter: string;
  recruiterNotes: string;
  proposedSalary: string;
  availableStartDate: string;
}

export const EMPTY_SUBMIT_TO_JOB_FORM: SubmitToJobForm = {
  jobId: "",
  resumeId: "",
  coverLetter: "",
  recruiterNotes: "",
  proposedSalary: "",
  availableStartDate: "",
};

/** Row from GET /api/jobs/user-jobs as the Submit-to-Job picker reads it. */
export interface UserJobOption {
  id: string;
  title: string;
  company?: { name?: string | null } | null;
}
