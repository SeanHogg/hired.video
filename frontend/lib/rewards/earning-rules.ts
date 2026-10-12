// Pure presentation rules for the public /rewards page.
//
// The points catalog (GET /api/points/catalog) lists every rule for every
// role. hired.video now speaks only to job seekers, so the page shows the
// rules a job seeker can actually earn from, grouped into three plain-language
// buckets. Kept pure (no React, no fetch) so the filtering + grouping is
// unit-tested and the page only renders.

import { USER_ROLES } from "@shared/user-roles";

/** Minimal shape these helpers need — structurally compatible with
 *  `PointsCatalogAction` and `ShowcaseBadge` from points-service. */
export interface RoleScoped {
  roles: readonly string[];
}

export interface KeyedRule extends RoleScoped {
  key: string;
}

/** Bookkeeping actions that aren't something a visitor "does" — the bonuses
 *  are explained by the streak + badge sections instead. */
const HIDDEN_KEY_PREFIXES = ["streak.", "badge.", "admin."] as const;

/** True when the audience is everyone (empty roles) or includes job seekers. */
export function isJobSeekerAudience(item: RoleScoped): boolean {
  return item.roles.length === 0 || item.roles.includes(USER_ROLES.JOB_SEEKER);
}

/** True when a catalog rule should be listed on /rewards: job-seeker (or
 *  everyone) audience, and not an internal bonus/admin key. */
export function isJobSeekerRule(action: KeyedRule): boolean {
  if (HIDDEN_KEY_PREFIXES.some((p) => action.key.startsWith(p))) return false;
  return isJobSeekerAudience(action);
}

export type EarnGroup = "jobHunt" | "getSeen" | "learn" | "other";

/** Render order of the groups. "other" is last and only shows when an
 *  unmapped key exists — new rules never silently disappear. */
export const EARN_GROUP_ORDER: readonly EarnGroup[] = ["jobHunt", "getSeen", "learn", "other"];

/** Exact keys win over prefixes (e.g. publishing a course is about being
 *  seen, while passing one is learning). */
const EXACT_GROUP: Record<string, EarnGroup> = {
  "course.published": "getSeen",
  "cohort.created": "getSeen",
};

const PREFIX_GROUP: ReadonlyArray<readonly [string, EarnGroup]> = [
  ["application.", "jobHunt"],
  ["resume.", "jobHunt"],
  ["cover_letter.", "jobHunt"],
  ["saved_search.", "jobHunt"],
  ["task.", "jobHunt"],
  ["session.", "jobHunt"],
  ["ai.", "jobHunt"],
  ["feed.", "getSeen"],
  ["article.", "getSeen"],
  ["reference.", "getSeen"],
  ["company_review.", "getSeen"],
  ["event.", "getSeen"],
  ["studio.", "getSeen"],
  ["resource.", "getSeen"],
  ["feedback.", "getSeen"],
  ["lesson.", "learn"],
  ["course.", "learn"],
  ["certificate.", "learn"],
  ["learning.", "learn"],
  ["cohort.", "learn"],
  ["booking.", "learn"],
  ["play.", "learn"],
];

/** Which card a rule key belongs to. Unknown keys → "other". */
export function earnGroupFor(key: string): EarnGroup {
  const exact = EXACT_GROUP[key];
  if (exact) return exact;
  const hit = PREFIX_GROUP.find(([prefix]) => key.startsWith(prefix));
  return hit ? hit[1] : "other";
}

/** Filter to job-seeker rules and bucket them. Returns only non-empty
 *  groups, in EARN_GROUP_ORDER, preserving catalog order within a group. */
export function groupJobSeekerRules<T extends KeyedRule>(
  actions: readonly T[],
): Array<{ group: EarnGroup; rules: T[] }> {
  const buckets = new Map<EarnGroup, T[]>();
  for (const a of actions) {
    if (!isJobSeekerRule(a)) continue;
    const g = earnGroupFor(a.key);
    const list = buckets.get(g) ?? [];
    list.push(a);
    buckets.set(g, list);
  }
  return EARN_GROUP_ORDER.filter((g) => buckets.has(g)).map((group) => ({
    group,
    rules: buckets.get(group) as T[],
  }));
}
