/**
 * Per-section visibility on the public /people/[id] profile page.
 *
 * Two layers:
 *   1. Role-based defaults from `getDefaultProfileSections(role)` — what a
 *      brand-new account shows out of the box. Recruiters and employers
 *      hide resume-centric sections; job seekers show everything.
 *   2. Per-user overrides persisted on `user_profiles.profile_sections`
 *      (JSONB partial of `ProfileSections`). Stored as a partial so the
 *      shape can evolve without rewriting historical rows.
 *
 * `resolveProfileSections(stored, role)` merges (2) over (1) and is the
 * single source of truth — every render site and gate must call it
 * rather than spot-checking a single key, so missing-key behaviour stays
 * consistent.
 */
import { USER_ROLES } from "./user-roles.js";

export const PROFILE_SECTION_KEYS = [
  "videoResume",
  "masterResume",
  "skillNetwork",
  "skills",
] as const;

export type ProfileSectionKey = (typeof PROFILE_SECTION_KEYS)[number];

export type ProfileSections = Record<ProfileSectionKey, boolean>;

export type StoredProfileSections = Partial<ProfileSections>;

const JOB_SEEKER_DEFAULTS: ProfileSections = {
  videoResume: true,
  masterResume: true,
  skillNetwork: true,
  skills: true,
};

const HIRING_SIDE_DEFAULTS: ProfileSections = {
  videoResume: false,
  masterResume: false,
  skillNetwork: false,
  skills: true,
};

export function getDefaultProfileSections(role: string | null | undefined): ProfileSections {
  switch (role) {
    case USER_ROLES.RECRUITER:
    case USER_ROLES.EMPLOYER:
      return { ...HIRING_SIDE_DEFAULTS };
    case USER_ROLES.JOB_SEEKER:
    case USER_ROLES.ADMIN:
    case USER_ROLES.SUPER_ADMIN:
    default:
      return { ...JOB_SEEKER_DEFAULTS };
  }
}

export function resolveProfileSections(
  stored: StoredProfileSections | null | undefined,
  role: string | null | undefined,
): ProfileSections {
  const defaults = getDefaultProfileSections(role);
  if (!stored || typeof stored !== "object") return defaults;
  const out: ProfileSections = { ...defaults };
  for (const key of PROFILE_SECTION_KEYS) {
    const val = (stored as Record<string, unknown>)[key];
    if (typeof val === "boolean") out[key] = val;
  }
  return out;
}

export function isProfileSectionVisible(
  stored: StoredProfileSections | null | undefined,
  role: string | null | undefined,
  key: ProfileSectionKey,
): boolean {
  return resolveProfileSections(stored, role)[key];
}

export const PROFILE_SECTION_LABELS: Record<ProfileSectionKey, string> = {
  videoResume: "Video Resume",
  masterResume: "Master Resume",
  skillNetwork: "Skill Network",
  skills: "Skills, Industries & SEO Keywords",
};

export function sanitizeProfileSectionsInput(input: unknown): StoredProfileSections {
  if (!input || typeof input !== "object") return {};
  const out: StoredProfileSections = {};
  for (const key of PROFILE_SECTION_KEYS) {
    const val = (input as Record<string, unknown>)[key];
    if (typeof val === "boolean") out[key] = val;
  }
  return out;
}
