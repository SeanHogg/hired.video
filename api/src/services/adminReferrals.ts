/**
 * SuperAdmin referral attribution surface for /admin/users.
 *
 * Two reads, one source of truth (affiliate_referrals → affiliate_profiles →
 * users):
 *
 *   • `loadReferralsForUsers` — batch enrichment for the user list, so each
 *     row can show a "Referred by …" indicator without an N+1 fan-out.
 *   • `getReferredUsersGrouped` — the "group by referrer" view that buckets
 *     every referred user under the affiliate who brought them in.
 *
 * The whole /api/admin/sa tree is SuperAdmin-gated at the route mount,
 * so neither function re-checks authority.
 */

import { count, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb, schema } from "../db/index.js";
import { getOrSetIsolateCached } from "../utils/isolate-cache.js";
import { logger } from "../lib/logger.js";

const { affiliateReferrals, affiliateProfiles, users } = schema;

/** Attribution attached to a single user row in the admin list. */
export interface UserReferralInfo {
  referrerUserId: string;
  referrerName: string;
  referrerEmail: string;
  referralCode: string;
  referredAt: string; // ISO
  converted: boolean;
  convertedAt: string | null; // ISO | null
}

/**
 * Batch-load referral attribution for a page of users, keyed by the
 * referred user's id. Best-effort: if the affiliate tables are missing or
 * the query throws, we log and return an empty map — the list then renders
 * every row as "not referred", which is the same as if no one had ever
 * signed up via a referral link. A missing sidecar must never break the
 * whole /admin/users page (mirrors the plan-override loader contract).
 */
export async function loadReferralsForUsers(
  db: ReturnType<typeof getDb>,
  userIds: string[],
): Promise<Map<string, UserReferralInfo>> {
  if (userIds.length === 0) return new Map();
  try {
    const rows = await db
      .select({
        referredUserId: affiliateReferrals.referredUserId,
        referralCode: affiliateProfiles.referralCode,
        referrerUserId: affiliateProfiles.userId,
        referrerName: users.name,
        referrerEmail: users.email,
        referredAt: affiliateReferrals.createdAt,
        convertedAt: affiliateReferrals.convertedAt,
      })
      .from(affiliateReferrals)
      .innerJoin(affiliateProfiles, eq(affiliateReferrals.affiliateId, affiliateProfiles.id))
      // The joined `users` row here is the *referrer* (affiliate owner),
      // not the referred user — that's affiliateReferrals.referredUserId.
      .innerJoin(users, eq(affiliateProfiles.userId, users.id))
      .where(inArray(affiliateReferrals.referredUserId, userIds));

    const map = new Map<string, UserReferralInfo>();
    for (const r of rows) {
      if (!r.referredUserId) continue;
      map.set(r.referredUserId, {
        referrerUserId: r.referrerUserId,
        referrerName: r.referrerName,
        referrerEmail: r.referrerEmail,
        referralCode: r.referralCode,
        referredAt: r.referredAt.toISOString(),
        converted: r.convertedAt !== null,
        convertedAt: r.convertedAt ? r.convertedAt.toISOString() : null,
      });
    }
    return map;
  } catch (err) {
    logger.error("[adminReferrals] Failed to load referral attribution; degrading to none", err);
    return new Map();
  }
}

// ── Grouped "referred users by referrer" view ─────────────────────────────────

export interface ReferredUser {
  id: string;
  name: string;
  email: string;
  role: string;
  referredAt: string; // ISO
  converted: boolean;
}

export interface ReferralGroup {
  affiliateId: string;
  referralCode: string;
  referrerUserId: string;
  referrerName: string;
  referrerEmail: string;
  referredCount: number; // authoritative (from aggregate, never truncated)
  convertedCount: number; // authoritative
  // The most-recent referred users, capped globally (see DETAIL_CAP). When
  // `referredUsers.length < referredCount` there are older referrals not
  // shown in this list.
  referredUsers: ReferredUser[];
}

export interface ReferredUsersGrouped {
  groups: ReferralGroup[];
  totalReferred: number;
  totalConverted: number;
  // True when the detail-row list was capped — counts stay authoritative,
  // but some groups' `referredUsers` arrays omit older entries.
  truncated: boolean;
}

/** Raw per-affiliate aggregate row (authoritative counts + referrer identity). */
export interface RawReferralGroupCount {
  affiliateId: string;
  referralCode: string;
  referrerUserId: string;
  referrerName: string;
  referrerEmail: string;
  referredCount: number;
  convertedCount: number;
}

/** Raw detail row — one referred user, possibly orphaned (user deleted). */
export interface RawReferralDetailRow {
  affiliateId: string;
  referredUserId: string | null;
  referredName: string | null;
  referredEmail: string | null;
  referredRole: string | null;
  referredAt: Date;
  convertedAt: Date | null;
}

/**
 * Pure assembly of the grouped view from the two raw query result sets.
 * Counts come from `groupsBase` (authoritative, never truncated); the nested
 * `referredUsers` lists come from `detailRows` (capped). Extracted so the
 * grouping/merge/truncation logic is unit-testable without a DB — the fake-db
 * harness can't evaluate the joins the loader uses.
 */
export function assembleReferralGroups(
  groupsBase: RawReferralGroupCount[],
  detailRows: RawReferralDetailRow[],
  truncated: boolean,
): ReferredUsersGrouped {
  const usersByAffiliate = new Map<string, ReferredUser[]>();
  for (const r of detailRows) {
    // referred_user_id is SET NULL on user delete — skip orphaned referrals.
    if (!r.referredUserId || !r.referredName) continue;
    const list = usersByAffiliate.get(r.affiliateId) ?? [];
    list.push({
      id: r.referredUserId,
      name: r.referredName,
      email: r.referredEmail ?? "",
      role: r.referredRole ?? "",
      referredAt: r.referredAt.toISOString(),
      converted: r.convertedAt !== null,
    });
    usersByAffiliate.set(r.affiliateId, list);
  }

  const groups: ReferralGroup[] = groupsBase.map((g) => ({
    affiliateId: g.affiliateId,
    referralCode: g.referralCode,
    referrerUserId: g.referrerUserId,
    referrerName: g.referrerName,
    referrerEmail: g.referrerEmail,
    referredCount: Number(g.referredCount ?? 0),
    convertedCount: Number(g.convertedCount ?? 0),
    referredUsers: usersByAffiliate.get(g.affiliateId) ?? [],
  }));

  const totalReferred = groups.reduce((sum, g) => sum + g.referredCount, 0);
  const totalConverted = groups.reduce((sum, g) => sum + g.convertedCount, 0);

  return { groups, totalReferred, totalConverted, truncated };
}

// Cap on the detail rows fetched for the nested user lists. Group counts come
// from a separate aggregate so they stay exact even past this cap; this only
// bounds how many individual referred-user rows we hydrate per request.
const DETAIL_CAP = 2000;

const GROUPED_CACHE_KEY = "admin:referrals:grouped:v1";

/**
 * Referred users grouped under the affiliate who referred them, ordered by
 * referral volume. Cached for 60s — this is a low-traffic SuperAdmin read
 * over slow-changing data, and a fresh signup showing up a minute late on
 * an analytics view is acceptable.
 */
export async function getReferredUsersGrouped(): Promise<ReferredUsersGrouped> {
  return getOrSetIsolateCached<ReferredUsersGrouped>({
    key: GROUPED_CACHE_KEY,
    ttlSeconds: 60,
    loader: loadReferredUsersGrouped,
  });
}

async function loadReferredUsersGrouped(): Promise<ReferredUsersGrouped> {
  const db = getDb();
  const referrer = alias(users, "referrer");
  const referred = alias(users, "referred");

  try {
    // Authoritative per-affiliate counts (cheap — bounded by #affiliates).
    // Carries the referrer identity so groups with all referrals beyond the
    // detail cap still render with a name/code.
    const groupsBase = await db
      .select({
        affiliateId: affiliateProfiles.id,
        referralCode: affiliateProfiles.referralCode,
        referrerUserId: affiliateProfiles.userId,
        referrerName: referrer.name,
        referrerEmail: referrer.email,
        referredCount: count(affiliateReferrals.id),
        convertedCount: sql<number>`sum(case when ${affiliateReferrals.convertedAt} is not null then 1 else 0 end)::int`,
      })
      .from(affiliateReferrals)
      .innerJoin(affiliateProfiles, eq(affiliateReferrals.affiliateId, affiliateProfiles.id))
      .innerJoin(referrer, eq(affiliateProfiles.userId, referrer.id))
      .groupBy(
        affiliateProfiles.id,
        affiliateProfiles.referralCode,
        affiliateProfiles.userId,
        referrer.name,
        referrer.email,
      )
      .orderBy(desc(count(affiliateReferrals.id)));

    // Detail rows for the nested user lists — most recent first, capped.
    // Fetch CAP+1 so we can detect (and report) truncation honestly.
    const detailRows = await db
      .select({
        affiliateId: affiliateReferrals.affiliateId,
        referredUserId: affiliateReferrals.referredUserId,
        referredName: referred.name,
        referredEmail: referred.email,
        referredRole: referred.role,
        referredAt: affiliateReferrals.createdAt,
        convertedAt: affiliateReferrals.convertedAt,
      })
      .from(affiliateReferrals)
      .leftJoin(referred, eq(affiliateReferrals.referredUserId, referred.id))
      .orderBy(desc(affiliateReferrals.createdAt))
      .limit(DETAIL_CAP + 1);

    const truncated = detailRows.length > DETAIL_CAP;
    const usableRows = truncated ? detailRows.slice(0, DETAIL_CAP) : detailRows;

    if (truncated) {
      logger.warn(
        "[adminReferrals] grouped view detail rows capped; counts remain exact but some groups omit older referred users",
        { detailCap: DETAIL_CAP },
      );
    }

    return assembleReferralGroups(groupsBase, usableRows, truncated);
  } catch (err) {
    logger.error("[adminReferrals] Failed to load grouped referrals; returning empty view", err);
    return { groups: [], totalReferred: 0, totalConverted: 0, truncated: false };
  }
}

/**
 * Count of distinct referred users (for the /admin/users summary card).
 * Best-effort — degrades to 0 if the affiliate tables are unavailable.
 */
export async function countReferredUsers(db: ReturnType<typeof getDb>): Promise<number> {
  try {
    const [row] = await db
      .select({
        n: sql<number>`count(distinct ${affiliateReferrals.referredUserId})::int`,
      })
      .from(affiliateReferrals);
    return Number(row?.n ?? 0);
  } catch (err) {
    logger.error("[adminReferrals] Failed to count referred users; degrading to 0", err);
    return 0;
  }
}
