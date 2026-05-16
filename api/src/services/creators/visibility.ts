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
import { getSubscription } from "../billing/BillingService.js";

/** Public listings hidden until the owner is on a paid plan. */
export async function isCreatorVisible(userId: string): Promise<boolean> {
  const sub = await getSubscription(userId);
  return sub.isPro;
}

/**
 * Batch filter — returns the subset of `userIds` whose creator content
 * should surface publicly. Routes that fetch list pages should call this
 * once with the result-row owner ids and filter in memory rather than
 * checking N subscriptions in a tight loop.
 */
export async function filterVisibleCreators(
  userIds: readonly string[],
): Promise<Set<string>> {
  if (!userIds.length) return new Set();
  const unique = Array.from(new Set(userIds));
  const flags = await Promise.all(unique.map(async (id) => [id, await isCreatorVisible(id)] as const));
  return new Set(flags.filter(([, ok]) => ok).map(([id]) => id));
}
