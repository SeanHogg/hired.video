/**
 * #109 — Targeting evaluator. Given an `AdSetTargeting` shape and a
 * candidate user id, returns a boolean eligibility decision +
 * optional score for ranking. Reads from `userProfiles` /
 * `jobPreferences` / `activityLogs` — no external DMP.
 *
 * The evaluator is shared between (a) ad-rendering at request time
 * (filter the pool to eligible users) and (b) reach estimation in the
 * admin tools (sample a slice of the user table and project the rate).
 */

import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import type { AdSetTargeting } from "../../../../shared/ad-targeting.js";

export interface EligibilityDecision {
  eligible: boolean;
  /** Diagnostic list of reasons we filtered the user out. */
  reasons: string[];
}

export async function evaluateUserAgainstTargeting(
  userId: string,
  targeting: AdSetTargeting,
): Promise<EligibilityDecision> {
  const reasons: string[] = [];
  const db = getDb();

  const profilesTable = (schema as any).userProfiles;
  if (!profilesTable) {
    return { eligible: true, reasons: ["userProfiles table missing — passing through"] };
  }
  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.userId, userId))
    .limit(1);
  if (!profile) return { eligible: false, reasons: ["no profile"] };

  // Geo
  if (targeting.geo?.countries?.length) {
    const country = (profile as any).countryCode ?? (profile as any).country ?? null;
    if (!country || !targeting.geo.countries.includes(country)) {
      reasons.push(`country mismatch (${country ?? "unknown"})`);
    }
  }

  // Open-to-work
  if (targeting.attributes?.openToWorkOnly) {
    if (!(profile as any).openToWork) reasons.push("not open to work");
  }

  // Years experience
  const yoe = (profile as any).yearsExperience as number | undefined | null;
  if (targeting.attributes?.yearsExperienceMin != null) {
    if (typeof yoe !== "number" || yoe < targeting.attributes.yearsExperienceMin) {
      reasons.push(`yoe below min ${targeting.attributes.yearsExperienceMin}`);
    }
  }
  if (targeting.attributes?.yearsExperienceMax != null) {
    if (typeof yoe === "number" && yoe > targeting.attributes.yearsExperienceMax) {
      reasons.push(`yoe above max ${targeting.attributes.yearsExperienceMax}`);
    }
  }

  // Required skills — every listed skill must appear on the user's
  // skill list. Skills live on `jobPreferences.skills` in most deploys.
  if (targeting.attributes?.requiredSkills?.length) {
    const prefsTable = (schema as any).jobPreferences;
    if (prefsTable) {
      const [prefs] = await db
        .select()
        .from(prefsTable)
        .where(eq(prefsTable.userId, userId))
        .limit(1);
      const userSkills = ((prefs as any)?.skills as string[] | undefined) ?? [];
      const lowerSet = new Set(userSkills.map((s) => s.toLowerCase()));
      const missing = targeting.attributes.requiredSkills.filter((s) => !lowerSet.has(s.toLowerCase()));
      if (missing.length) reasons.push(`missing skills: ${missing.join(",")}`);
    }
  }

  // Recently active
  if (targeting.behavioural?.activeWithinDays != null) {
    const activityTable = (schema as any).activityLogs ?? (schema as any).userActivity;
    if (activityTable) {
      const since = new Date(Date.now() - targeting.behavioural.activeWithinDays * 86_400_000);
      const [recent] = await db
        .select({ id: activityTable.id })
        .from(activityTable)
        .where(and(eq(activityTable.userId, userId), gte(activityTable.createdAt, since)))
        .limit(1);
      if (!recent) reasons.push(`no activity in last ${targeting.behavioural.activeWithinDays}d`);
    }
  }

  // Exclude existing applicants
  if (targeting.exclusions?.excludeApplicantsOfJobIds?.length) {
    const appsTable = (schema as any).jobApplications;
    if (appsTable) {
      const rows = await db
        .select({ id: appsTable.id })
        .from(appsTable)
        .where(
          and(
            eq(appsTable.applicantUserId, userId),
            inArray(appsTable.jobId, targeting.exclusions.excludeApplicantsOfJobIds),
          ),
        )
        .limit(1);
      if (rows.length) reasons.push("already applied to excluded job");
    }
  }

  return { eligible: reasons.length === 0, reasons };
}

/**
 * Sample-based reach estimator. Samples N users and projects the
 * eligibility rate across the total user count. Cheaper than scanning
 * the full table on every inspector tweak.
 */
export async function estimateActualReach(
  targeting: AdSetTargeting,
  opts: { sampleSize?: number } = {},
): Promise<{ sampleSize: number; eligibleInSample: number; projectedTotal: number }> {
  const sampleSize = opts.sampleSize ?? 200;
  const db = getDb();
  const usersTable = (schema as any).users;
  if (!usersTable) {
    return { sampleSize: 0, eligibleInSample: 0, projectedTotal: 0 };
  }
  const sample = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .orderBy(sql`random()`)
    .limit(sampleSize);
  let eligible = 0;
  for (const u of sample) {
    const decision = await evaluateUserAgainstTargeting(u.id, targeting);
    if (decision.eligible) eligible += 1;
  }
  const [{ totalCount }] = await db
    .select({ totalCount: sql<number>`count(*)::int` })
    .from(usersTable);
  const total = Number(totalCount) || 0;
  const rate = sample.length === 0 ? 0 : eligible / sample.length;
  return { sampleSize: sample.length, eligibleInSample: eligible, projectedTotal: Math.round(rate * total) };
}
