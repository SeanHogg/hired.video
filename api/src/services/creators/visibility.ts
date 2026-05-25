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
import { eq, inArray } from "drizzle-orm";
import { getSubscription } from "../billing/BillingService.js";
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
  const rows = await getDb()
    .select({ id: users.id, isSystem: users.isSystem })
    .from(users)
    .where(inArray(users.id, unique));
  const system = new Set(rows.filter((r) => r.isSystem).map((r) => r.id));
  const remaining = unique.filter((id) => !system.has(id));
  const paid = await Promise.all(
    remaining.map(async (id) => [id, (await getSubscription(id)).isPro] as const),
  );
  const visible = new Set<string>(system);
  for (const [id, ok] of paid) if (ok) visible.add(id);
  return visible;
}
