import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { Variables } from "../../types/index.js";
import { ok } from "../../utils/response.js";
import { getDb, schema } from "../../db/index.js";

const { users, loginEvents } = schema;

// ── Schemas ───────────────────────────────────────────────────────────────────

const RecentSignupsSchema = z.object({
  // Window in hours. Default 24h matches the typical spam-burst horizon.
  hours: z.coerce.number().int().min(1).max(24 * 30).default(24),
  // Min accounts per IP to surface — an IP with one signup is noise.
  minCount: z.coerce.number().int().min(1).max(1000).default(2),
  // Cap groups returned so the UI stays responsive even after a 30-day
  // sweep on a noisy origin.
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

const ByIpSchema = z.object({
  ip: z.string().min(1).max(64),
  hours: z.coerce.number().int().min(1).max(24 * 90).default(24 * 7),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
});

// ── Router ────────────────────────────────────────────────────────────────────

export const securityRoutes = new Hono<{ Variables: Variables }>();

/** GET /signups/recent — group user registrations by signup_ip in the
 *  given window, return the IPs with ≥ minCount accounts, sorted by
 *  count desc. The bread-and-butter "did we get spammed?" query. */
securityRoutes.get("/signups/recent", async (c) => {
  const parsed = RecentSignupsSchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json({ error: { code: "BAD_REQUEST", message: parsed.error.issues[0].message } }, 400);
  }
  const { hours, minCount, limit } = parsed.data;
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  const db = getDb();

  // Aggregate at the DB so we don't pull thousands of rows back. Filter
  // out NULL signup_ip (legacy users predating 0030) — they can't be
  // grouped meaningfully.
  const rows = await db
    .select({
      ip: users.signupIp,
      count: sql<number>`count(*)::int`.as("count"),
      firstSeen: sql<Date>`min(${users.createdAt})`.as("first_seen"),
      lastSeen: sql<Date>`max(${users.createdAt})`.as("last_seen"),
      // Sample of email addresses so the admin can spot-check without
      // a follow-up call. array_agg is bounded by the count itself.
      sampleEmails: sql<string[]>`(array_agg(${users.email} ORDER BY ${users.createdAt} DESC))[1:5]`.as("sample_emails"),
      verifiedCount: sql<number>`sum(case when ${users.emailVerified} then 1 else 0 end)::int`.as("verified_count"),
      bannedCount: sql<number>`sum(case when ${users.isBanned} then 1 else 0 end)::int`.as("banned_count"),
    })
    .from(users)
    .where(and(
      gte(users.createdAt, cutoff),
      sql`${users.signupIp} is not null`,
    ))
    .groupBy(users.signupIp)
    .having(sql`count(*) >= ${minCount}`)
    .orderBy(desc(sql`count(*)`))
    .limit(limit);

  return c.json(ok({ windowHours: hours, minCount, groups: rows }), 200);
});

/** GET /signups/by-ip?ip=... — every signup + login event from a single
 *  IP in the given window. Powers the drill-down on the security page. */
securityRoutes.get("/signups/by-ip", async (c) => {
  const parsed = ByIpSchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.json({ error: { code: "BAD_REQUEST", message: parsed.error.issues[0].message } }, 400);
  }
  const { ip, hours, limit } = parsed.data;
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  const db = getDb();

  // Two parallel reads: (a) the user rows that registered from this IP
  // — gives us account state (banned/verified/etc.) — and (b) the raw
  // login_events stream for the IP. The UI shows them in two stacked
  // panels.
  const [accounts, events] = await Promise.all([
    db
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
    db
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

  return c.json(ok({ ip, windowHours: hours, accounts, events }), 200);
});
