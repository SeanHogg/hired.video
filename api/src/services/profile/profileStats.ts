import { and, count, desc, eq, gte, lt, or } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { schema } from "../../db/index.js";

export interface RecentViewer {
  userId?: string;
  name: string;
  company?: string;
  viewedAt: Date;
}

export interface ProfileStats {
  resumeCount: number;
  connectionCount: number;
  jobApplicationCount: number;
  totalViews: number;
  viewsThisWeek: number;
  viewsThisMonth: number;
  viewsChangePercentage: number;
  recentViewers: RecentViewer[];
}

const dayMs = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * dayMs);

/**
 * Single source of truth for the Profile Metrics card. Used by
 * /api/users/:id/stats and the seeker dashboard endpoint so the resume /
 * connection / application counts and the view stats stay in lockstep.
 *
 * `viewsChangePercentage` compares the trailing 30-day window vs. the
 * preceding 30-day window. Falls back to +100 when the prior period is
 * empty but the current one isn't, to avoid divide-by-zero while still
 * signaling growth.
 */
export async function getProfileStats(db: Db, userId: string): Promise<ProfileStats> {
  const weekStart = daysAgo(7);
  const monthStart = daysAgo(30);
  const priorMonthStart = daysAgo(60);

  const [
    resumeRow,
    connectionRow,
    applicationRow,
    totalViewsRow,
    weekViewsRow,
    monthViewsRow,
    priorMonthViewsRow,
    viewerRows,
  ] = await Promise.all([
    db
      .select({ n: count() })
      .from(schema.resumeInformation)
      .where(eq(schema.resumeInformation.userId, userId)),
    db
      .select({ n: count() })
      .from(schema.userConnections)
      .where(
        and(
          eq(schema.userConnections.status, "Accepted"),
          or(
            eq(schema.userConnections.fromUserId, userId),
            eq(schema.userConnections.toUserId, userId),
          ),
        ),
      ),
    db
      .select({ n: count() })
      .from(schema.jobApplications)
      .where(eq(schema.jobApplications.userId, userId)),
    db
      .select({ n: count() })
      .from(schema.profileViews)
      .where(eq(schema.profileViews.viewedUserId, userId)),
    db
      .select({ n: count() })
      .from(schema.profileViews)
      .where(
        and(
          eq(schema.profileViews.viewedUserId, userId),
          gte(schema.profileViews.createdAt, weekStart),
        ),
      ),
    db
      .select({ n: count() })
      .from(schema.profileViews)
      .where(
        and(
          eq(schema.profileViews.viewedUserId, userId),
          gte(schema.profileViews.createdAt, monthStart),
        ),
      ),
    db
      .select({ n: count() })
      .from(schema.profileViews)
      .where(
        and(
          eq(schema.profileViews.viewedUserId, userId),
          gte(schema.profileViews.createdAt, priorMonthStart),
          lt(schema.profileViews.createdAt, monthStart),
        ),
      ),
    // Pull a recent window so we can dedupe by viewer in app code without a
    // window-function query — we want the latest 5 *distinct* signed-in
    // viewers (anonymous hits stay distinct since each represents a
    // separate person).
    db
      .select({
        viewerUserId: schema.profileViews.viewerUserId,
        viewedAt: schema.profileViews.createdAt,
        viewerName: schema.users.name,
        viewerCompany: schema.userProfiles.currentCompany,
      })
      .from(schema.profileViews)
      .leftJoin(schema.users, eq(schema.users.id, schema.profileViews.viewerUserId))
      .leftJoin(
        schema.userProfiles,
        eq(schema.userProfiles.userId, schema.profileViews.viewerUserId),
      )
      .where(eq(schema.profileViews.viewedUserId, userId))
      .orderBy(desc(schema.profileViews.createdAt))
      .limit(50),
  ]);

  const monthViews = Number(monthViewsRow[0]?.n ?? 0);
  const priorMonthViews = Number(priorMonthViewsRow[0]?.n ?? 0);
  const viewsChangePercentage =
    priorMonthViews === 0
      ? monthViews > 0
        ? 100
        : 0
      : Math.round(((monthViews - priorMonthViews) / priorMonthViews) * 100);

  const seenViewers = new Set<string>();
  const recentViewers: RecentViewer[] = [];
  for (const row of viewerRows) {
    if (row.viewerUserId) {
      if (seenViewers.has(row.viewerUserId)) continue;
      seenViewers.add(row.viewerUserId);
    }
    recentViewers.push({
      userId: row.viewerUserId ?? undefined,
      name: row.viewerName ?? "Anonymous viewer",
      company: row.viewerCompany ?? undefined,
      viewedAt: row.viewedAt,
    });
    if (recentViewers.length === 5) break;
  }

  return {
    resumeCount: Number(resumeRow[0]?.n ?? 0),
    connectionCount: Number(connectionRow[0]?.n ?? 0),
    jobApplicationCount: Number(applicationRow[0]?.n ?? 0),
    totalViews: Number(totalViewsRow[0]?.n ?? 0),
    viewsThisWeek: Number(weekViewsRow[0]?.n ?? 0),
    viewsThisMonth: monthViews,
    viewsChangePercentage,
    recentViewers,
  };
}
