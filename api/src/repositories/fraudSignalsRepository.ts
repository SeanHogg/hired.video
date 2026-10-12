/**
 * FraudSignalsRepository — batched read side of the nightly gamification
 * fraud sweep (`services/gamification/fraud-sweep.ts`).
 *
 * The sweep scans up to ~5k users; reading each user's signals with 4–6
 * point queries meant tens of thousands of neon-http round-trips per run.
 * Every method here takes a user-id batch and answers it in a constant
 * number of grouped queries. Semantics mirror the per-user reads exactly:
 *   - redemption value in window: SUM(value_cents) over pending/queued/
 *     fulfilled redemptions created at/after `since`;
 *   - signup-IP cluster: number of OTHER users sharing the user's signup IP;
 *   - refunds: count of the user's `refunded` token-pack purchases;
 *   - device-fingerprint cluster: distinct OTHER users with a session on any
 *     of the user's session fingerprints (same as
 *     PointsRepository.countAccountsOnDeviceFingerprint).
 */

import { and, count, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { schema } from "../db/index.js";

const { pointRedemptions, users, tokenPackPurchases, sessions } = schema;

export type DbLike = any;

export interface IFraudSignalsRepository {
  redemptionValueSince(userIds: string[], since: Date): Promise<Map<string, number>>;
  accountsOnSignupIp(userIds: string[]): Promise<Map<string, number>>;
  refundCounts(userIds: string[]): Promise<Map<string, number>>;
  accountsOnDeviceFingerprint(userIds: string[]): Promise<Map<string, number>>;
}

export class FraudSignalsRepository implements IFraudSignalsRepository {
  constructor(private readonly db: DbLike) {}

  async redemptionValueSince(userIds: string[], since: Date): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (userIds.length === 0) return out;
    const rows: Array<{ userId: string; total: number | string | null }> = await this.db
      .select({
        userId: pointRedemptions.userId,
        total: sql<number>`COALESCE(SUM(${pointRedemptions.valueCents}), 0)::bigint`,
      })
      .from(pointRedemptions)
      .where(
        and(
          inArray(pointRedemptions.userId, userIds),
          gte(pointRedemptions.createdAt, since),
          sql`${pointRedemptions.status} IN ('pending','queued','fulfilled')`,
        ),
      )
      .groupBy(pointRedemptions.userId);
    for (const r of rows) out.set(r.userId, Number(r.total ?? 0));
    return out;
  }

  async accountsOnSignupIp(userIds: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (userIds.length === 0) return out;
    const mine: Array<{ id: string; signupIp: string | null }> = await this.db
      .select({ id: users.id, signupIp: users.signupIp })
      .from(users)
      .where(and(inArray(users.id, userIds), isNotNull(users.signupIp)));
    const ips = [...new Set(mine.map((m) => m.signupIp).filter((ip): ip is string => Boolean(ip)))];
    if (ips.length === 0) return out;
    const counts: Array<{ ip: string; n: number }> = await this.db
      .select({ ip: users.signupIp, n: count() })
      .from(users)
      .where(inArray(users.signupIp, ips))
      .groupBy(users.signupIp);
    const byIp = new Map(counts.map((c) => [c.ip, Number(c.n)]));
    for (const m of mine) {
      if (!m.signupIp) continue;
      // Total accounts on the IP minus the user themself = OTHER accounts.
      out.set(m.id, Math.max(0, (byIp.get(m.signupIp) ?? 1) - 1));
    }
    return out;
  }

  async refundCounts(userIds: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (userIds.length === 0) return out;
    const rows: Array<{ userId: string; n: number }> = await this.db
      .select({ userId: tokenPackPurchases.userId, n: count() })
      .from(tokenPackPurchases)
      .where(and(inArray(tokenPackPurchases.userId, userIds), sql`${tokenPackPurchases.status} = 'refunded'`))
      .groupBy(tokenPackPurchases.userId);
    for (const r of rows) out.set(r.userId, Number(r.n));
    return out;
  }

  async accountsOnDeviceFingerprint(userIds: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (userIds.length === 0) return out;
    const mine: Array<{ uid: string; fp: string | null }> = await this.db
      .select({ uid: sessions.userId, fp: sessions.deviceFingerprint })
      .from(sessions)
      .where(and(inArray(sessions.userId, userIds), isNotNull(sessions.deviceFingerprint)));
    const fpsByUser = new Map<string, Set<string>>();
    for (const r of mine) {
      if (!r.fp) continue;
      const set = fpsByUser.get(r.uid) ?? new Set<string>();
      set.add(r.fp);
      fpsByUser.set(r.uid, set);
    }
    const allFps = [...new Set(mine.map((r) => r.fp).filter((f): f is string => Boolean(f)))];
    if (allFps.length === 0) return out;
    const sharing: Array<{ uid: string; fp: string | null }> = await this.db
      .selectDistinct({ uid: sessions.userId, fp: sessions.deviceFingerprint })
      .from(sessions)
      .where(inArray(sessions.deviceFingerprint, allFps));
    const usersByFp = new Map<string, Set<string>>();
    for (const r of sharing) {
      if (!r.fp) continue;
      const set = usersByFp.get(r.fp) ?? new Set<string>();
      set.add(r.uid);
      usersByFp.set(r.fp, set);
    }
    for (const [uid, fps] of fpsByUser) {
      const others = new Set<string>();
      for (const fp of fps) for (const other of usersByFp.get(fp) ?? []) if (other !== uid) others.add(other);
      out.set(uid, others.size);
    }
    return out;
  }
}
