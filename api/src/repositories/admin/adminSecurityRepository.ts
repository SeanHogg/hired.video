/**
 * AdminSecurityRepository — SuperAdmin security operator reads/writes:
 * active account locks, bot-block telemetry, the out-of-region waitlist and
 * signup-spam investigation (accounts + login events grouped by IP).
 */
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";

const { users, accountLocks, botBlockEvents, regionWaitlist, loginEvents } = schema;

type DbHandle = ReturnType<typeof getDb>;

export class AdminSecurityRepository {
  constructor(private readonly db: DbHandle) {}

  static create(): AdminSecurityRepository {
    return new AdminSecurityRepository(getDb());
  }

  listActiveLocks() {
    return this.db
      .select({
        lockId: accountLocks.id,
        userId: accountLocks.userId,
        email: users.email,
        name: users.name,
        reason: accountLocks.reason,
        lockedAt: accountLocks.lockedAt,
        unlocksAt: accountLocks.unlocksAt,
        lockedBy: accountLocks.lockedBy,
        notes: accountLocks.notes,
      })
      .from(accountLocks)
      .innerJoin(users, eq(users.id, accountLocks.userId))
      .where(eq(accountLocks.active, true))
      .orderBy(desc(accountLocks.lockedAt));
  }

  /** Per-country + per-reason bot-block counts since `since` (globe feed). */
  async botStats(since: Date) {
    const window = gte(botBlockEvents.createdAt, since);
    const n = sql<number>`count(*)::int`;
    const [byCountry, byReason, [total]] = await Promise.all([
      this.db.select({ countryCode: botBlockEvents.countryCode, count: n }).from(botBlockEvents).where(window).groupBy(botBlockEvents.countryCode),
      this.db.select({ reason: botBlockEvents.reason, count: n }).from(botBlockEvents).where(window).groupBy(botBlockEvents.reason),
      this.db.select({ count: n }).from(botBlockEvents).where(window),
    ]);
    return { total: total?.count ?? 0, byCountry, byReason };
  }

  listBotEvents(limit: number) {
    return this.db.select().from(botBlockEvents).orderBy(desc(botBlockEvents.createdAt)).limit(limit);
  }

  listWaitlist(status: string) {
    return this.db
      .select()
      .from(regionWaitlist)
      .where(eq(regionWaitlist.status, status))
      .orderBy(desc(regionWaitlist.createdAt));
  }

  async reviewWaitlist(id: string, status: "invited" | "declined", reviewedBy: string): Promise<void> {
    await this.db
      .update(regionWaitlist)
      .set({ status, reviewedBy, reviewedAt: new Date() })
      .where(eq(regionWaitlist.id, id));
  }

  /** Signup IPs with >= minCount accounts since `cutoff`, busiest first.
   *  NULL signup_ip (legacy users predating 0030) can't be grouped. */
  signupGroupsByIp(cutoff: Date, minCount: number, limit: number) {
    return this.db
      .select({
        ip: users.signupIp,
        count: sql<number>`count(*)::int`.as("count"),
        firstSeen: sql<Date>`min(${users.createdAt})`.as("first_seen"),
        lastSeen: sql<Date>`max(${users.createdAt})`.as("last_seen"),
        // Spot-check sample; array_agg is bounded by the group count.
        sampleEmails: sql<string[]>`(array_agg(${users.email} ORDER BY ${users.createdAt} DESC))[1:5]`.as("sample_emails"),
        verifiedCount: sql<number>`sum(case when ${users.emailVerified} then 1 else 0 end)::int`.as("verified_count"),
        bannedCount: sql<number>`sum(case when ${users.isBanned} then 1 else 0 end)::int`.as("banned_count"),
      })
      .from(users)
      .where(and(gte(users.createdAt, cutoff), sql`${users.signupIp} is not null`))
      .groupBy(users.signupIp)
      .having(sql`count(*) >= ${minCount}`)
      .orderBy(desc(sql`count(*)`))
      .limit(limit);
  }

  /** Accounts registered from `ip` + the raw login_events stream for it. */
  async activityFromIp(ip: string, cutoff: Date, limit: number) {
    const [accounts, events] = await Promise.all([
      this.db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          emailVerified: users.emailVerified,
          isBanned: users.isBanned,
          isSuspended: users.isSuspended,
          isActive: users.isActive,
          createdAt: users.createdAt,
          signupUserAgent: users.signupUserAgent,
        })
        .from(users)
        .where(and(eq(users.signupIp, ip), gte(users.createdAt, cutoff)))
        .orderBy(desc(users.createdAt))
        .limit(limit),
      this.db
        .select({
          id: loginEvents.id,
          userId: loginEvents.userId,
          email: loginEvents.email,
          kind: loginEvents.kind,
          provider: loginEvents.provider,
          success: loginEvents.success,
          failureReason: loginEvents.failureReason,
          userAgent: loginEvents.userAgent,
          createdAt: loginEvents.createdAt,
        })
        .from(loginEvents)
        .where(and(eq(loginEvents.ipAddress, ip), gte(loginEvents.createdAt, cutoff)))
        .orderBy(desc(loginEvents.createdAt))
        .limit(limit),
    ]);
    return { accounts, events };
  }

  /** One user's signup attribution + auth event timeline (newest first), or null. */
  async userAuthHistory(userId: string, limit: number) {
    const [account] = await this.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
        emailVerified: users.emailVerified,
        isBanned: users.isBanned,
        isSuspended: users.isSuspended,
        isActive: users.isActive,
        signupIp: users.signupIp,
        signupUserAgent: users.signupUserAgent,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!account) return null;
    const events = await this.db
      .select({
        id: loginEvents.id,
        kind: loginEvents.kind,
        provider: loginEvents.provider,
        success: loginEvents.success,
        failureReason: loginEvents.failureReason,
        ipAddress: loginEvents.ipAddress,
        userAgent: loginEvents.userAgent,
        createdAt: loginEvents.createdAt,
      })
      .from(loginEvents)
      .where(eq(loginEvents.userId, userId))
      .orderBy(desc(loginEvents.createdAt))
      .limit(limit);
    return { account, events };
  }
}
