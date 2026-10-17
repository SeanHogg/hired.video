/**
 * #1769 — the ONE translation of an `AdSetTargeting` spec into SQL.
 *
 * `buildTargetingWhere(spec)` returns a WHERE predicate over
 * `users` LEFT JOIN `user_profiles` LEFT JOIN `job_preferences` LEFT JOIN
 * `content_locations` (the user's home location: kind 'user_profile',
 * role 'origin' — the FROM clause AdTargetingRepository builds). Every user-attribute rule is
 * evaluated by Postgres — the evaluator never loads users and filters them
 * in memory — so ad-render eligibility (one user id) and reach estimation
 * (COUNT over everyone) run the same predicate.
 *
 * Request-context rules (device, daypart) are not user attributes; they
 * are matched against the serving request in targeting-evaluator.ts.
 *
 * Signals with no data source yet are deliberately NOT enforced (an
 * unenforceable rule must not silently zero an audience):
 *   attributes.experienceLevel, attributes.education,
 *   attributes.preferredSkills (ranking only).
 */

import { inArray, sql, type Column, type SQL } from "drizzle-orm";
import { schema } from "../../db/index.js";
import type { AdSetTargeting } from "../../../../shared/ad-targeting.js";

const {
  users,
  userProfiles,
  jobPreferences,
  contentLocations,
  countries,
  stateProvinces,
  activityLogs,
  artifactViews,
  toolRuns,
  jobApplications,
  companyTeamMembers,
} = schema;

const DAY_MS = 86_400_000;
/** "Viewed company X" looks back this far (ExclusionTargeting doc). */
const VIEWED_COMPANY_WINDOW_DAYS = 30;
const EARTH_RADIUS_KM = 6371;

/** Escape LIKE metacharacters so a keyword matches literally. */
function likeContains(term: string): string {
  return `%${term.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}

function nonEmpty<T>(list: T[] | undefined): list is T[] {
  return Array.isArray(list) && list.length > 0;
}

/** `<expr> IN ($1, $2, …)` for a computed expression (columns use
 *  Drizzle's inArray). One scalar bind per element — never a JS array in
 *  one slot, which the worker pg driver can't coerce (see
 *  routes/__tests__/no-raw-any-array.lint.test.ts). */
function inList(expr: SQL, values: string[]): SQL {
  return sql`${expr} IN (${sql.join(values.map((v) => sql`${v}`), sql`, `)})`;
}

/** `(<col> ILIKE $1 OR <col> ILIKE $2 …)`. */
function ilikeAnyOf(col: SQL | Column, patterns: string[]): SQL {
  return sql`(${sql.join(patterns.map((p) => sql`${col} ILIKE ${p}`), sql` OR `)})`;
}

/** Users who are real, reachable accounts — the base audience. */
function baseAudience(): SQL {
  return sql`${users.isActive} = true AND ${users.isBanned} = false AND ${users.isGuest} = false`;
}

function geoClauses(spec: AdSetTargeting): SQL[] {
  const out: SQL[] = [];
  const geo = spec.geo;
  if (nonEmpty(geo?.countries)) {
    out.push(sql`${contentLocations.countryId} IN (SELECT ${countries.id} FROM ${countries} WHERE ${inArray(countries.iso2, geo.countries)})`);
  }
  if (nonEmpty(geo?.regions)) {
    out.push(sql`${contentLocations.stateId} IN (
      SELECT ${stateProvinces.id} FROM ${stateProvinces}
      JOIN ${countries} ON ${countries.id} = ${stateProvinces.countryId}
      WHERE ${inList(sql`(${countries.iso2} || '-' || upper(${stateProvinces.code}))`, geo.regions)}
    )`);
  }
  if (nonEmpty(geo?.cities)) {
    out.push(inArray(contentLocations.cityId, geo.cities));
  }
  if (geo?.radius) {
    const { centerLat, centerLng, radiusKm } = geo.radius;
    // Great-circle distance; least() guards acos against float drift > 1.
    out.push(sql`${contentLocations.latitude} IS NOT NULL AND ${contentLocations.longitude} IS NOT NULL AND
      ${EARTH_RADIUS_KM} * acos(least(1, greatest(-1,
        cos(radians(${centerLat})) * cos(radians(${contentLocations.latitude})) *
        cos(radians(${contentLocations.longitude}) - radians(${centerLng})) +
        sin(radians(${centerLat})) * sin(radians(${contentLocations.latitude}))
      ))) <= ${radiusKm}`);
  }
  return out;
}

function attributeClauses(spec: AdSetTargeting): SQL[] {
  const out: SQL[] = [];
  const a = spec.attributes;
  if (!a) return out;
  if (nonEmpty(a.currentRoleKeywords)) {
    const patterns = a.currentRoleKeywords.map(likeContains);
    out.push(sql`(${ilikeAnyOf(userProfiles.currentRole, patterns)} OR ${ilikeAnyOf(userProfiles.headline, patterns)})`);
  }
  if (nonEmpty(a.requiredSkills)) {
    // Every required skill must appear (case-insensitive) on the profile
    // skills — the single store (job_preferences.skills merged in, mig 0631).
    const wanted = [...new Set(a.requiredSkills.map((s) => s.toLowerCase()))];
    out.push(sql`(
      SELECT count(DISTINCT lower(s.skill)) FROM jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(${userProfiles.skills}) = 'array' THEN ${userProfiles.skills} ELSE '[]'::jsonb END
      ) AS s(skill) WHERE ${inList(sql`lower(s.skill)`, wanted)}
    ) = ${wanted.length}`);
  }
  if (a.yearsExperienceMin != null) {
    out.push(sql`${userProfiles.yearsOfExperience} >= ${a.yearsExperienceMin}`);
  }
  if (a.yearsExperienceMax != null) {
    // Unknown experience is not evidence of exceeding the max.
    out.push(sql`(${userProfiles.yearsOfExperience} IS NULL OR ${userProfiles.yearsOfExperience} <= ${a.yearsExperienceMax})`);
  }
  if (a.openToWorkOnly) {
    out.push(sql`(${userProfiles.openToWork} = true OR ${jobPreferences.isOpenToWork} = true)`);
  }
  return out;
}

function behaviouralClauses(spec: AdSetTargeting, now: Date): SQL[] {
  const out: SQL[] = [];
  const b = spec.behavioural;
  if (!b) return out;
  if (b.activeWithinDays != null) {
    const since = new Date(now.getTime() - b.activeWithinDays * DAY_MS);
    // Range scan on idx_activity_logs_created, then a hashed semi-join.
    out.push(sql`${users.id} IN (SELECT ${activityLogs.userId} FROM ${activityLogs} WHERE ${activityLogs.createdAt} >= ${since.toISOString()}::timestamptz AND ${activityLogs.userId} IS NOT NULL)`);
  }
  if (nonEmpty(b.viewedCompanyIds)) {
    const since = new Date(now.getTime() - VIEWED_COMPANY_WINDOW_DAYS * DAY_MS);
    out.push(sql`${users.id} IN (
      SELECT ${artifactViews.viewerId} FROM ${artifactViews}
      WHERE ${artifactViews.artifactKind} = 'company'
        AND ${artifactViews.eventType} = 'view'
        AND ${inArray(artifactViews.artifactId, b.viewedCompanyIds)}
        AND ${artifactViews.viewedAt} >= ${since.toISOString()}::timestamptz
        AND ${artifactViews.viewerId} IS NOT NULL
    )`);
  }
  if (nonEmpty(b.ranToolsRecently)) {
    const since = new Date(now.getTime() - VIEWED_COMPANY_WINDOW_DAYS * DAY_MS);
    out.push(sql`${users.id} IN (
      SELECT ${toolRuns.userId} FROM ${toolRuns}
      WHERE ${toolRuns.createdAt} >= ${since.toISOString()}::timestamptz AND ${inArray(toolRuns.toolId, b.ranToolsRecently)}
    )`);
  }
  return out;
}

function exclusionClauses(spec: AdSetTargeting): SQL[] {
  const out: SQL[] = [];
  const x = spec.exclusions;
  if (!x) return out;
  if (nonEmpty(x.excludeApplicantsOfJobIds)) {
    out.push(sql`${users.id} NOT IN (
      SELECT ${jobApplications.userId} FROM ${jobApplications}
      WHERE ${inArray(jobApplications.jobId, x.excludeApplicantsOfJobIds)}
    )`);
  }
  if (nonEmpty(x.excludeEmployeesOfCompanyIds)) {
    out.push(sql`${users.id} NOT IN (
      SELECT ${companyTeamMembers.userId} FROM ${companyTeamMembers}
      WHERE ${inArray(companyTeamMembers.companyId, x.excludeEmployeesOfCompanyIds)}
        AND ${companyTeamMembers.userId} IS NOT NULL
    )`);
  }
  if (nonEmpty(x.excludeCountries)) {
    // Users with no home country are kept (nothing says they're excluded).
    out.push(sql`(${contentLocations.countryId} IS NULL OR ${contentLocations.countryId} NOT IN (
      SELECT ${countries.id} FROM ${countries} WHERE ${inArray(countries.iso2, x.excludeCountries)}
    ))`);
  }
  return out;
}

/** WHERE predicate for "users this targeting spec reaches". An empty spec
 *  reaches the whole base audience. `now` is injectable for tests. */
export function buildTargetingWhere(spec: AdSetTargeting, now: Date = new Date()): SQL {
  const clauses = [
    baseAudience(),
    ...geoClauses(spec),
    ...attributeClauses(spec),
    ...behaviouralClauses(spec, now),
    ...exclusionClauses(spec),
  ];
  return sql.join(clauses.map((c) => sql`(${c})`), sql` AND `);
}
