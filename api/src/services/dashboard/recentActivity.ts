import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";

/**
 * Last-touched activity timeline (gap #1826).
 *
 * The dashboard marketed a "last-touched activity timeline" but the API hard-
 * returned `recentActivity: []` and no role dashboard rendered it. This builds
 * a real, role-agnostic timeline by merging the user's most recent touches
 * across the surfaces every account has — job tracking, applications, and feed
 * posts — then sorting newest-first.
 *
 * The shape mirrors the frontend `ActivityItemSchema` (id / type / content /
 * time / timestamp / url) so `<ActivityFeed>` renders it directly.
 */
export interface ActivityItemDto {
  id: string;
  type: string;
  content: string;
  time: string;
  timestamp: string;
  url?: string;
}

function relativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export async function getRecentActivity(
  userId: string,
  limit = 8,
  db: ReturnType<typeof getDb> = getDb(),
): Promise<ActivityItemDto[]> {
  const [applications, saved, posts] = await Promise.all([
    db
      .select({
        id: schema.jobApplications.id,
        status: schema.jobApplications.status,
        appliedAt: schema.jobApplications.appliedAt,
      })
      .from(schema.jobApplications)
      .where(eq(schema.jobApplications.userId, userId))
      .orderBy(desc(schema.jobApplications.appliedAt))
      .limit(limit),

    db
      .select({
        id: schema.savedJobs.id,
        status: schema.savedJobs.status,
        statusChangedAt: schema.savedJobs.statusChangedAt,
        createdAt: schema.savedJobs.createdAt,
      })
      .from(schema.savedJobs)
      .where(eq(schema.savedJobs.userId, userId))
      .orderBy(desc(schema.savedJobs.createdAt))
      .limit(limit),

    db
      .select({
        id: schema.feedPosts.id,
        content: schema.feedPosts.content,
        createdAt: schema.feedPosts.createdAt,
      })
      .from(schema.feedPosts)
      .where(eq(schema.feedPosts.userId, userId))
      .orderBy(desc(schema.feedPosts.createdAt))
      .limit(limit),
  ]);

  const items: ActivityItemDto[] = [];

  for (const a of applications) {
    if (!a.appliedAt) continue;
    const when = new Date(a.appliedAt);
    items.push({
      id: `application-${a.id}`,
      type: "application",
      content: `Applied to a job — status: ${a.status ?? "applied"}`,
      time: relativeTime(when),
      timestamp: when.toISOString(),
      url: "/applications",
    });
  }

  for (const s of saved) {
    const when = new Date(s.statusChangedAt ?? s.createdAt);
    const status = (s.status ?? "tracked").toLowerCase();
    items.push({
      id: `saved-${s.id}`,
      type: "saved_job",
      content: status === "tracked" ? "Tracked a new job" : `Moved a tracked job to "${status}"`,
      time: relativeTime(when),
      timestamp: when.toISOString(),
      url: "/jobs",
    });
  }

  for (const p of posts) {
    const when = new Date(p.createdAt);
    const excerpt = (p.content ?? "").trim().slice(0, 60);
    items.push({
      id: `post-${p.id}`,
      type: "feed_post",
      content: excerpt ? `Posted: "${excerpt}${excerpt.length >= 60 ? "…" : ""}"` : "Shared a post",
      time: relativeTime(when),
      timestamp: when.toISOString(),
      url: "/feed",
    });
  }

  return items
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
}
