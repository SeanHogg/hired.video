/**
 * Advanced video analytics (Wistia-quality heatmap, #122): record a per-second
 * view, roll the views up into the creator dashboard summary, and derive the
 * retention diagnosis the AI hook optimizer (#143) feeds its prompt. SQL lives
 * in repositories/studioVideoHeatmapRepository.ts.
 */
import { getDb } from "../../db/index.js";
import { recordArtifactView } from "../analytics/artifactView.js";
import { findProjectAccess } from "../../repositories/studioProjectsRepository.js";
import {
  insertVideoHeatmap,
  listVideoHeatmapViews,
  type VideoHeatmapRow,
} from "../../repositories/studioVideoHeatmapRepository.js";

const MAX_VIEWS = 500;
const FREEMAIL_DOMAINS = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com"];

export interface HeatmapViewInput {
  projectId: string;
  viewerId?: string;
  viewerEmail?: string;
  secondsWatched: number[];
  totalWatchTimeSec: number;
  percentWatched: number;
  dropOffSecond?: number;
  referrer?: string;
  userAgent?: string;
}

/** Company name guessed from a non-freemail viewer email domain. */
function companyFromEmail(email: string | undefined): string | null {
  if (!email) return null;
  const domain = email.split("@")[1];
  if (!domain || FREEMAIL_DOMAINS.includes(domain)) return null;
  const label = domain.split(".")[0];
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Store one view's heatmap row and dual-write it to artifact_views for the
 *  unified creator-stats rollup (#1019). Returns the heatmap row id. */
export async function recordHeatmapView(input: HeatmapViewInput, ipCountry: string | null): Promise<string> {
  const db = getDb();
  const viewerCompany = companyFromEmail(input.viewerEmail);
  const heatmap = await insertVideoHeatmap(db, {
    studioProjectId: input.projectId,
    viewerId: input.viewerId ?? null,
    viewerEmail: input.viewerEmail ?? null,
    viewerCompany,
    secondsWatched: input.secondsWatched,
    totalWatchTimeSec: input.totalWatchTimeSec,
    percentWatched: input.percentWatched,
    dropOffSecond: input.dropOffSecond ?? null,
    referrer: input.referrer ?? null,
    userAgent: input.userAgent ?? null,
    ipCountry,
  });

  // Owner lookup is best-effort — if the project was deleted between event
  // and persist, we still record an anonymous view without the owner stamp.
  const project = await findProjectAccess(db, input.projectId);
  await recordArtifactView({
    artifactKind: "video",
    artifactId: input.projectId,
    ownerUserId: project?.userId ?? null,
    viewerId: input.viewerId && /^[0-9a-f-]{36}$/i.test(input.viewerId)
      ? input.viewerId
      : null,
    viewerEmail: input.viewerEmail ?? null,
    viewerCompany,
    ipCountry,
    referrer: input.referrer ?? null,
    userAgent: input.userAgent ?? null,
    engagement: input.secondsWatched,
    engagementUnit: "s",
    totalEngagementSec: input.totalWatchTimeSec,
    percentConsumed: input.percentWatched / 100,
    dropOffBucket: input.dropOffSecond ?? null,
  });
  return heatmap.id;
}

/** Most common drop-off second across the views (as its string key), or null. */
function topDropOff(views: readonly VideoHeatmapRow[]): string | null {
  const counts: Record<number, number> = {};
  for (const view of views) {
    if (view.dropOffSecond != null) counts[view.dropOffSecond] = (counts[view.dropOffSecond] ?? 0) + 1;
  }
  return Object.entries(counts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? null;
}

export interface RetentionDiagnosis {
  earlyDropPct: number | null;
  topDropOffSecond: number | null;
  sampleSize: number;
}

/** The share of viewers who dropped within the first 3 s and the most common
 *  drop-off second, so the hook optimizer can say *why* a hook fails. */
export async function getRetentionDiagnosis(projectId: string): Promise<RetentionDiagnosis> {
  const views = await listVideoHeatmapViews(getDb(), projectId, { limit: MAX_VIEWS, newestFirst: false });
  if (views.length === 0) return { earlyDropPct: null, topDropOffSecond: null, sampleSize: 0 };
  const earlyDrops = views.filter((v) => (v.dropOffSecond ?? 999) <= 3).length;
  const top = topDropOff(views);
  return {
    earlyDropPct: Math.round((earlyDrops / views.length) * 100),
    topDropOffSecond: top ? Number(top) : null,
    sampleSize: views.length,
  };
}

const EMPTY_SUMMARY = {
  totalViews: 0,
  avgWatchTimeSec: 0,
  avgPercentWatched: 0,
  heatmap: [] as number[],
  viewers: [] as unknown[],
  topDropOffSecond: null as number | null,
  referrers: [] as unknown[],
  countries: [] as unknown[],
};

/** Heatmap + drop-off + viewer-company / referrer / country breakdown over
 *  the project's latest 500 views. */
export async function getHeatmapSummary(projectId: string) {
  const views = await listVideoHeatmapViews(getDb(), projectId, { limit: MAX_VIEWS, newestFirst: true });
  if (views.length === 0) return EMPTY_SUMMARY;

  // Build aggregated heatmap (per-second view count)
  const maxDuration = Math.max(...views.map((v) => (v.secondsWatched as number[])?.length ?? 0));
  const heatmap = new Array(maxDuration).fill(0);
  for (const view of views) {
    const sw = view.secondsWatched as number[];
    if (sw) {
      for (let i = 0; i < sw.length; i++) {
        if (sw[i]) heatmap[i] = (heatmap[i] ?? 0) + 1;
      }
    }
  }

  // Normalize heatmap to percentages
  const totalViews = views.length;
  const normalizedHeatmap = heatmap.map((count: number) => Math.round((count / totalViews) * 100));

  const avgWatchTimeSec = Math.round(views.reduce((a, v) => a + (v.totalWatchTimeSec ?? 0), 0) / totalViews);
  const avgPercentWatched = Math.round(views.reduce((a, v) => a + (v.percentWatched ?? 0), 0) / totalViews);
  const topDropOffSecond = topDropOff(views);

  // Viewer list (deduplicated, most recent first)
  const viewerMap = new Map<string, { email?: string; company?: string; lastViewed: string; views: number; avgPercent: number }>();
  for (const view of views) {
    const key = view.viewerEmail ?? view.viewerId ?? "anonymous";
    const existing = viewerMap.get(key);
    if (existing) {
      existing.views += 1;
      existing.avgPercent = Math.round((existing.avgPercent * (existing.views - 1) + (view.percentWatched ?? 0)) / existing.views);
    } else {
      viewerMap.set(key, {
        email: view.viewerEmail ?? undefined,
        company: view.viewerCompany ?? undefined,
        lastViewed: view.createdAt?.toISOString() ?? new Date().toISOString(),
        views: 1,
        avgPercent: Math.round(view.percentWatched ?? 0),
      });
    }
  }

  // Traffic-source rollup keyed on document.referrer captured at view time.
  // Bare hostname is what the dashboard chart needs — strip protocol/path so
  // "https://linkedin.com/feed/abc" + "linkedin.com/in/foo" collapse into one
  // "linkedin.com" bar. Empty/null referrers (direct visits, opaque referrer
  // policy, in-app navigation) land in "Direct" so the chart sums to totalViews.
  const referrerCounts = new Map<string, number>();
  for (const view of views) {
    const raw = view.referrer?.trim();
    let source = "Direct";
    if (raw) {
      try {
        source = new URL(raw).hostname.replace(/^www\./, "");
      } catch {
        source = raw.slice(0, 100);
      }
    }
    referrerCounts.set(source, (referrerCounts.get(source) ?? 0) + 1);
  }
  const referrers = Array.from(referrerCounts.entries())
    .map(([source, count]) => ({ source, views: count }))
    .sort((a, b) => b.views - a.views);

  // Country rollup from the `cf-ipcountry` header captured at view time. Rows
  // with a null `ipCountry` land in the "ZZ" (Unknown) bucket so the chart
  // still sums to totalViews. Codes are uppercased at insert time.
  const countryCounts = new Map<string, number>();
  for (const view of views) {
    const code = view.ipCountry ?? "ZZ";
    countryCounts.set(code, (countryCounts.get(code) ?? 0) + 1);
  }
  const countries = Array.from(countryCounts.entries())
    .map(([country, count]) => ({ country, views: count }))
    .sort((a, b) => b.views - a.views);

  return {
    totalViews,
    avgWatchTimeSec,
    avgPercentWatched,
    heatmap: normalizedHeatmap,
    topDropOffSecond: topDropOffSecond ? Number(topDropOffSecond) : null,
    viewers: Array.from(viewerMap.entries())
      .map(([key, data]) => ({ id: key, ...data }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 50),
    referrers,
    countries,
  };
}
