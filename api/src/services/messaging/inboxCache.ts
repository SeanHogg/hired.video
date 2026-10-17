/**
 * Per-user cache for the Communication Hub reads — the inbox aggregate
 * (`getInboxFor`, ~8 queries) and the unread-notification count. Both are
 * polled (bell every 120s, /api/bootstrap on every load), so they were the
 * hottest uncached per-user reads.
 *
 * Isolate-local only (utils/isolate-cache.ts): zero KV writes, because the
 * account is on Workers Free. Every write that changes what a user's inbox
 * shows calls `bumpInboxFor(userIds)` (inboxCacheVersion.ts) — the
 * notifications repository (all writes), conversation/message writes,
 * external-email writes. The TTL
 * (≤ 60s) bounds anything a writer misses and other isolates' copies.
 *
 * Only the default inbox view is cached; filtered / paged reads (account
 * chips, unread-only, junk, cursor) go straight to Postgres.
 */
import { getOrSetIsolateCached } from "../../utils/isolate-cache.js";
import { inboxCacheKey, unreadCountCacheKey } from "./inboxCacheVersion.js";
import type { FindInboxOptions } from "../../repositories/externalEmailMessagesRepository.js";
import type { INotificationsRepository } from "../../repositories/notificationsRepository.js";
import { getInboxFor, type InboxResponse, type InboxServiceDeps } from "./inboxService.js";

/** Short: invalidation only reaches the writing isolate. Still collapses
 *  the bootstrap + bell + inbox reads of one page load into one load. */
export const INBOX_CACHE_TTL_SECONDS = 60;

function isDefaultView(opts: FindInboxOptions): boolean {
  return (
    opts.limit === undefined &&
    !opts.cursor &&
    !opts.unreadOnly &&
    !opts.includeArchived &&
    !opts.junkOnly &&
    !(opts.accountIds && opts.accountIds.length > 0)
  );
}

export async function getCachedInbox(
  deps: InboxServiceDeps,
  userId: string,
  emailOpts: FindInboxOptions = {},
): Promise<InboxResponse> {
  if (!isDefaultView(emailOpts)) return getInboxFor(deps, userId, emailOpts);
  return getOrSetIsolateCached({
    key: inboxCacheKey(userId),
    ttlSeconds: INBOX_CACHE_TTL_SECONDS,
    loader: () => getInboxFor(deps, userId, emailOpts),
  });
}

export async function getCachedUnreadCount(
  repo: Pick<INotificationsRepository, "countUnreadForUser">,
  userId: string,
): Promise<number> {
  return getOrSetIsolateCached({
    key: unreadCountCacheKey(userId),
    ttlSeconds: INBOX_CACHE_TTL_SECONDS,
    loader: () => repo.countUnreadForUser(userId),
  });
}
