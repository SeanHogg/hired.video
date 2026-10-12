/**
 * visibility.ts — single source of truth for "should this creator's
 * content surface on public marketplaces?"
 *
 * A creator's listings (services, articles, courses, voice clones,
 * creator profile, etc.) only appear on public surfaces when the owner
 * has an active paid subscription. Free creators can enroll and
 * configure their workspace, but their content stays hidden until
 * billing kicks in.
 *
 * Per #314, every marketplace route consumes the same predicate so the
 * paywall rule is enforced uniformly. Routes previously had this check
 * only on `/creators/browse` + `/creators/public/:id`; the four content
 * surfaces (services / articles / courses / voice clones) bypassed it
 * and surfaced free creators' listings.
 */
import { eq } from "drizzle-orm";
import { getSubscription } from "../billing/BillingService.js";
import { resolveIsProForUsers } from "../billing/effectiveUserPlan.js";
import { defaultApiDeps } from "../apiDeps.js";
import { getDb, schema } from "../../db/index.js";

const { users } = schema;

/** Public listings hidden until the owner is on a paid plan — except for
 *  system / editorial author accounts (`users.is_system = true`), which
 *  bypass the paywall so seeded long-form content publishes without a
 *  creator subscription. */
export async function isCreatorVisible(userId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ isSystem: users.isSystem })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (row?.isSystem) return true;
  const sub = await getSubscription(userId);
  return sub.isPro;
}

/**
 * Batch filter — returns the subset of `userIds` whose creator content
 * should surface publicly. Routes that fetch list pages should call this
 * once with the result-row owner ids and filter in memory rather than
 * checking N subscriptions in a tight loop. System editorial accounts
 * bypass the subscription check.
 */
export async function filterVisibleCreators(
  userIds: readonly string[],
): Promise<Set<string>> {
  if (!userIds.length) return new Set();
  const unique = Array.from(new Set(userIds));
  const repos = defaultApiDeps().repos;
  // One users read (role + isSystem), then one batched plan resolution
  // (subscriptions + overrides in parallel) — a fixed query count instead
  // of 3 × N getSubscription lookups on a cold cache.
  const rows = await repos.users.findManyByIds(unique);
  const visible = new Set<string>(rows.filter((r) => r.isSystem).map((r) => r.id));
  const roleById = new Map(rows.map((r) => [r.id, r.role]));
  const remaining = unique.filter((id) => !visible.has(id));
  const isPro = await resolveIsProForUsers(
    remaining.map((id) => ({ id, role: roleById.get(id) ?? null })),
    repos,
  );
  for (const [id, ok] of isPro) if (ok) visible.add(id);
  return visible;
}
