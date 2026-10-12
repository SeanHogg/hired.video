/**
 * #109 — Typed targeting schema for Ad Sets. The DB column
 * `ad_sets.targeting_json` is already a JSONB blob; this module is the
 * canonical TypeScript shape every caller (audience estimator, ad
 * dispatcher, admin tools) reads/writes through.
 *
 * Keeping the shape in `shared/` means the frontend audience-config UI
 * and the API audience-estimator route can't drift. Add new dimensions
 * here, not in two files.
 *
 * Data sources (existing schemas):
 *   - userProfiles.location / userProfiles.openToWork
 *   - jobPreferences (skills, experience years, education level)
 *   - activityLogs (recently active, viewed similar companies, …)
 *
 * No external DMP integration — every signal below is derivable from
 * tables we already own.
 */

import { z } from "zod";

export type ExperienceLevel = "intern" | "entry" | "mid" | "senior" | "lead" | "principal" | "executive";

export type EducationLevel = "high_school" | "associate" | "bachelor" | "master" | "doctorate" | "vocational";

export type DevicePlatform = "desktop" | "mobile" | "tablet";

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // Sun..Sat

export interface GeoTargeting {
  /** ISO 3166-1 alpha-2 country codes. Empty = no country filter. */
  countries?: string[];
  /** ISO 3166-2 subdivision codes (e.g. "US-CA", "CA-ON"). */
  regions?: string[];
  /** City IDs from `cities` table. */
  cities?: string[];
  /** Lat/lng + radius for proximity targeting. */
  radius?: {
    centerLat: number;
    centerLng: number;
    radiusKm: number;
  };
}

export interface AttributeTargeting {
  /** Current role keywords (matched against `userProfiles.headline` /
   *  resumes' most recent position). */
  currentRoleKeywords?: string[];
  /** Required skills (intersection — every targeted user must have all listed). */
  requiredSkills?: string[];
  /** Preferred skills (union — boost relevance score). */
  preferredSkills?: string[];
  experienceLevel?: ExperienceLevel[];
  yearsExperienceMin?: number;
  yearsExperienceMax?: number;
  education?: EducationLevel[];
  openToWorkOnly?: boolean;
}

export interface BehaviouralTargeting {
  /** "Recently active" = activityLog within N days. */
  activeWithinDays?: number;
  /** User has viewed any of these company IDs in the last 30 days. */
  viewedCompanyIds?: string[];
  /** User has run one of these tools (e.g. resume-optimizer) in the
   *  last 30 days — signal of active job-search intent. */
  ranToolsRecently?: string[];
}

export interface DeviceTargeting {
  platforms?: DevicePlatform[];
}

export interface DaypartingTargeting {
  /** Hours (0-23) when the ad is eligible to render. Empty = always. */
  hoursOfDay?: number[];
  /** Days of the week (Sun=0). Empty = always. */
  daysOfWeek?: DayOfWeek[];
  /** IANA timezone for the dayparting check. Defaults to viewer's local. */
  timezone?: string;
}

export interface ExclusionTargeting {
  /** Skip users who have already applied to one of these job IDs. */
  excludeApplicantsOfJobIds?: string[];
  /** Skip users who currently work for one of these company IDs. */
  excludeEmployeesOfCompanyIds?: string[];
  /** Skip users whose home country is one of these (ISO 3166-1 alpha-2). */
  excludeCountries?: string[];
}

export interface AdSetTargeting {
  geo?: GeoTargeting;
  attributes?: AttributeTargeting;
  behavioural?: BehaviouralTargeting;
  device?: DeviceTargeting;
  dayparting?: DaypartingTargeting;
  exclusions?: ExclusionTargeting;
}

/**
 * Audience-size estimate returned by the targeting preview endpoint.
 * Buckets are surfaced to the UI so we don't disclose exact counts
 * (privacy + competitive). Range is heuristic — production-grade
 * estimates would sample the users table.
 */
export interface AudienceSizeEstimate {
  /** Bucket label shown to the advertiser ("Narrow" / "Balanced" / "Broad"). */
  bucket: "narrow" | "balanced" | "broad" | "too_narrow";
  /** Order-of-magnitude estimate (e.g. 1_000, 10_000, 100_000). */
  approxReach: number;
  /** Human-readable summary line. */
  summary: string;
}

// ─── Validation ────────────────────────────────────────────────────────────
// The one runtime schema for `ad_sets.targeting_json` — the API validates
// writes with it and the evaluator trusts its output. Unknown keys are
// stripped so a stale client can't persist junk.

const iso2 = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/);
const idList = z.array(z.string().trim().min(1).max(64)).max(200);
const keywordList = z.array(z.string().trim().min(1).max(80)).max(50);

export const DEVICE_PLATFORMS = ["desktop", "mobile", "tablet"] as const satisfies readonly DevicePlatform[];

export const AdSetTargetingSchema = z.object({
  geo: z.object({
    countries: z.array(iso2).max(250).optional(),
    regions: z.array(z.string().trim().toUpperCase().regex(/^[A-Z]{2}-[A-Z0-9]{1,3}$/)).max(200).optional(),
    cities: idList.optional(),
    radius: z.object({
      centerLat: z.number().min(-90).max(90),
      centerLng: z.number().min(-180).max(180),
      radiusKm: z.number().positive().max(500),
    }).optional(),
  }).optional(),
  attributes: z.object({
    currentRoleKeywords: keywordList.optional(),
    requiredSkills: keywordList.optional(),
    preferredSkills: keywordList.optional(),
    experienceLevel: z.array(z.enum(["intern", "entry", "mid", "senior", "lead", "principal", "executive"])).optional(),
    yearsExperienceMin: z.number().int().min(0).max(60).optional(),
    yearsExperienceMax: z.number().int().min(0).max(60).optional(),
    education: z.array(z.enum(["high_school", "associate", "bachelor", "master", "doctorate", "vocational"])).optional(),
    openToWorkOnly: z.boolean().optional(),
  }).optional(),
  behavioural: z.object({
    activeWithinDays: z.number().int().min(1).max(365).optional(),
    viewedCompanyIds: idList.optional(),
    ranToolsRecently: keywordList.optional(),
  }).optional(),
  device: z.object({
    platforms: z.array(z.enum(DEVICE_PLATFORMS)).max(3).optional(),
  }).optional(),
  dayparting: z.object({
    hoursOfDay: z.array(z.number().int().min(0).max(23)).max(24).optional(),
    daysOfWeek: z.array(z.union([
      z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6),
    ])).max(7).optional(),
    timezone: z.string().trim().min(1).max(64).optional(),
  }).optional(),
  exclusions: z.object({
    excludeApplicantsOfJobIds: idList.optional(),
    excludeEmployeesOfCompanyIds: idList.optional(),
    excludeCountries: z.array(iso2).max(250).optional(),
  }).optional(),
});

/** Parse stored / posted targeting into the canonical shape; `{}` (no
 *  targeting = everyone) when it doesn't validate. */
export function parseAdSetTargeting(raw: unknown): AdSetTargeting {
  const parsed = AdSetTargetingSchema.safeParse(raw ?? {});
  return parsed.success ? (parsed.data as AdSetTargeting) : {};
}

export function estimateAudienceBucket(targeting: AdSetTargeting): AudienceSizeEstimate {
  let score = 100;
  // Geo narrows audience.
  if (targeting.geo?.cities?.length) score -= 20;
  else if (targeting.geo?.regions?.length) score -= 12;
  else if (targeting.geo?.countries?.length) score -= 6;
  if (targeting.geo?.radius) score -= 12;
  // Attributes narrow audience.
  if (targeting.attributes?.requiredSkills?.length) score -= 10 * targeting.attributes.requiredSkills.length;
  if (targeting.attributes?.experienceLevel?.length) score -= 8;
  if (targeting.attributes?.yearsExperienceMin) score -= 6;
  if (targeting.attributes?.openToWorkOnly) score -= 10;
  if (targeting.attributes?.education?.length) score -= 6;
  if (targeting.behavioural?.activeWithinDays && targeting.behavioural.activeWithinDays <= 7) score -= 8;
  // Device / daypart narrow the impressions an audience can be reached on.
  const platforms = targeting.device?.platforms?.length ?? 0;
  if (platforms > 0 && platforms < DEVICE_PLATFORMS.length) score -= 6 * (DEVICE_PLATFORMS.length - platforms);
  const hours = targeting.dayparting?.hoursOfDay?.length ?? 0;
  if (hours > 0 && hours < 24) score -= Math.round(((24 - hours) / 24) * 15);
  const days = targeting.dayparting?.daysOfWeek?.length ?? 0;
  if (days > 0 && days < 7) score -= Math.round(((7 - days) / 7) * 10);
  // Exclusions remove known slices.
  if (targeting.exclusions?.excludeCountries?.length) score -= 4;
  if (targeting.exclusions?.excludeEmployeesOfCompanyIds?.length) score -= 2;
  if (targeting.exclusions?.excludeApplicantsOfJobIds?.length) score -= 2;

  const clamped = Math.max(0, Math.min(100, score));
  if (clamped < 10) {
    return { bucket: "too_narrow", approxReach: 0, summary: "Audience too narrow — broaden criteria." };
  }
  if (clamped < 35) {
    return { bucket: "narrow", approxReach: 1_000, summary: "Narrow audience (~1K). High intent, low scale." };
  }
  if (clamped < 70) {
    return { bucket: "balanced", approxReach: 10_000, summary: "Balanced (~10K). Reasonable scale + targeting precision." };
  }
  return { bucket: "broad", approxReach: 100_000, summary: "Broad (~100K). High scale, lower per-impression intent." };
}
