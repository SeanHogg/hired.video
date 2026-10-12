/**
 * Per-section visibility on the public /people/[id] profile page.
 *
 * Two layers:
 *   1. Role-based defaults from `getDefaultProfileSections(role)` — what a
 *      brand-new account shows out of the box. Recruiters and employers
 *      hide candidate-only sections (Video Resume, Master Resume, Skill
 *      Network, Opportunity Preferences); job seekers show everything.
 *   2. Per-user overrides persisted on `user_profiles.profile_sections`
 *      (JSONB partial of `ProfileSections`). Stored as a partial so the
 *      shape can evolve without rewriting historical rows.
 *
 * `resolveProfileSections(stored, role)` merges (2) over (1) and is the
 * single source of truth — every render site and gate must call it
 * rather than spot-checking a single key, so missing-key behaviour stays
 * consistent.
 *
 * Adding a section: append to PROFILE_SECTION_KEYS, add its boolean to
 * JOB_SEEKER_DEFAULTS + HIRING_SIDE_DEFAULTS, add an entry to
 * PROFILE_SECTION_I18N (label + description i18n keys), translate those
 * keys in `frontend/public/locales/*.json`, and drop a
 * `useProfileSectionVisibility("<key>")` self-gate at the top of the
 * section component. The Settings panel and gap register pick it up
 * automatically.
 */
import { USER_ROLES } from "./user-roles.js";

export const PROFILE_SECTION_KEYS = [
  "videoResume",
  "masterResume",
  "skillNetwork",
  "skills",
  "about",
  "contact",
  "social",
  "opportunityPreferences",
  "additionalInfo",
  "profileVideos",
  // Professional references (#1677). Surfaces names + roles only (contact
  // details stay private behind the NDA-gated share flow). SSoT is the
  // `reference_contacts` store managed at /references.
  "references",
  // Networking-side sections. `openToCoffee` gates the discoverable
  // "Grab a coffee" CTA on /people/[id] AND the user's pin visibility
  // on the /map page. Opt-in by default for job_seekers (they're the
  // primary networking audience) and opt-OUT for hiring-side accounts
  // (recruiters/employers prefer their existing Connect/Message CTAs).
  "openToCoffee",
] as const;

export type ProfileSectionKey = (typeof PROFILE_SECTION_KEYS)[number];

export type ProfileSections = Record<ProfileSectionKey, boolean>;

export type StoredProfileSections = Partial<ProfileSections>;

const JOB_SEEKER_DEFAULTS: ProfileSections = {
  videoResume: true,
  masterResume: true,
  skillNetwork: true,
  skills: true,
  about: true,
  contact: true,
  social: true,
  opportunityPreferences: true,
  additionalInfo: true,
  profileVideos: true,
  // Opt-IN even for job seekers: reference contacts are confidential by
  // design (the feature's whole point is the NDA-gated share flow), so we
  // never retroactively publish saved reference names. The owner enables
  // the section from Settings → Profile sections when they want it shown.
  references: false,
  openToCoffee: true,
};

// Recruiters and employers hide candidate-only sections by default but
// keep Skills/Industries (discoverability tags), About, Contact, Social,
// AdditionalInfo, and ProfileVideos — those are equally useful for
// hiring-side accounts presenting themselves to candidates.
const HIRING_SIDE_DEFAULTS: ProfileSections = {
  videoResume: false,
  masterResume: false,
  skillNetwork: false,
  skills: true,
  about: true,
  contact: true,
  social: true,
  opportunityPreferences: false,
  additionalInfo: true,
  profileVideos: true,
  references: false,
  openToCoffee: false,
};

// Workforce members (#1349 #1407 #1436) — invite-only employees of an
// employer. They CAN engage socially + post content on the platform
// (adoption play), but are NOT on the job market: candidate-discovery
// surfaces should never feature them. The public profile-section
// defaults err private — visitors only see what an employee explicitly
// opts in via the Settings → Profile sections panel.
const WORKFORCE_DEFAULTS: ProfileSections = {
  videoResume: false,
  masterResume: false,
  skillNetwork: false,
  skills: false,
  about: true,                 // light social baseline so the profile isn't empty
  contact: false,
  social: true,
  opportunityPreferences: false,
  additionalInfo: false,
  profileVideos: true,         // creator/social posts surface here
  references: false,
  openToCoffee: false,
};

// Content creators (#1997) render a channel-style profile (profileMode
// defaults to "channel" at signup). Lead with their content + social
// presence; hide the résumé-centric sections (Video Resume, Master Resume,
// Skill Network, Opportunity Preferences) since a creator isn't presenting
// as a job applicant. Keep Skills (discoverability), About, Contact, Social,
// ProfileVideos (their library), and openToCoffee (creators network).
const CREATOR_DEFAULTS: ProfileSections = {
  videoResume: false,
  masterResume: false,
  skillNetwork: false,
  skills: true,
  about: true,
  contact: true,
  social: true,
  opportunityPreferences: false,
  additionalInfo: true,
  profileVideos: true,
  references: false,
  openToCoffee: true,
};

// Affiliates (#1997) promote referrals; they are NOT on the job market and
// have no creator library by default. Public profile is a light social
// baseline — About + Social only — so the profile isn't empty but exposes
// nothing candidate-like. They can opt sections back on in Settings.
const AFFILIATE_DEFAULTS: ProfileSections = {
  videoResume: false,
  masterResume: false,
  skillNetwork: false,
  skills: false,
  about: true,
  contact: false,
  social: true,
  opportunityPreferences: false,
  additionalInfo: false,
  profileVideos: false,
  references: false,
  openToCoffee: false,
};

export function getDefaultProfileSections(role: string | null | undefined): ProfileSections {
  switch (role) {
    case USER_ROLES.RECRUITER:
    case USER_ROLES.EMPLOYER:
      return { ...HIRING_SIDE_DEFAULTS };
    case USER_ROLES.EMPLOYEE:
      return { ...WORKFORCE_DEFAULTS };
    case USER_ROLES.CREATOR:
      return { ...CREATOR_DEFAULTS };
    case USER_ROLES.AFFILIATE:
      return { ...AFFILIATE_DEFAULTS };
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

/**
 * i18n key map. Settings panel + any consumer that needs to display a
 * section name does `t(PROFILE_SECTION_I18N[key].label)`. Keep this
 * shared module free of `react-i18next` so it can be imported from the
 * server too.
 */
export const PROFILE_SECTION_I18N: Record<
  ProfileSectionKey,
  { label: string; description: string }
> = {
  videoResume: {
    label: "settings.profileSections.videoResume.label",
    description: "settings.profileSections.videoResume.desc",
  },
  masterResume: {
    label: "settings.profileSections.masterResume.label",
    description: "settings.profileSections.masterResume.desc",
  },
  skillNetwork: {
    label: "settings.profileSections.skillNetwork.label",
    description: "settings.profileSections.skillNetwork.desc",
  },
  skills: {
    label: "settings.profileSections.skills.label",
    description: "settings.profileSections.skills.desc",
  },
  about: {
    label: "settings.profileSections.about.label",
    description: "settings.profileSections.about.desc",
  },
  contact: {
    label: "settings.profileSections.contact.label",
    description: "settings.profileSections.contact.desc",
  },
  social: {
    label: "settings.profileSections.social.label",
    description: "settings.profileSections.social.desc",
  },
  opportunityPreferences: {
    label: "settings.profileSections.opportunityPreferences.label",
    description: "settings.profileSections.opportunityPreferences.desc",
  },
  additionalInfo: {
    label: "settings.profileSections.additionalInfo.label",
    description: "settings.profileSections.additionalInfo.desc",
  },
  profileVideos: {
    label: "settings.profileSections.profileVideos.label",
    description: "settings.profileSections.profileVideos.desc",
  },
  references: {
    label: "settings.profileSections.references.label",
    description: "settings.profileSections.references.desc",
  },
  openToCoffee: {
    label: "settings.profileSections.openToCoffee.label",
    description: "settings.profileSections.openToCoffee.desc",
  },
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
