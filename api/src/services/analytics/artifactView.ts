/**
 * artifactView.ts — single seam for "record that a viewer looked at a
 * thing." Replaces the scatter of `insertView` / `recordResumeView` /
 * `insertCompanyView` / `studioVideoHeatmap` writes that grew
 * artifact-by-artifact.
 *
 * Called from:
 *   • routes/resumes.ts        — public GET /resumes/:id (kind='resume')
 *   • routes/companies.ts      — public GET /companies/:slug (kind='company')
 *   • routes/userprofile.ts    — public GET /profile/:id (kind='profile')
 *   • routes/studio-features.ts — POST /analytics/track (kind='video')
 *   • routes/articles.ts       — public GET /articles/:slug (kind='article')
 *   • routes/jobs.ts           — public GET /jobs/:id (kind='job')
 *   • routes/studio-templates.ts — public GET (kind='studio_template')
 *   • routes/services.ts       — public GET (kind='service')
 *
 * Owner-skip rule: NEVER record a view where viewerId === ownerUserId.
 * Owners refreshing their own thing would otherwise inflate every
 * metric in the creator dashboard. The shared rule used to be
 * recordResumeView-only; lifting it here applies it uniformly.
 *
 * Dual-write: during the migration 0107 bake window, callers that
 * previously wrote to a per-entity table (resume_views, profile_views,
 * company_views, studio_video_heatmap) keep doing so via their existing
 * code paths. This helper writes to the new polymorphic artifact_views
 * table — the readers cut over first, then the legacy writers get
 * removed in a follow-up gap.
 */

import { getDb, schema } from "../../db/index.js";
import { detectCountry } from "../auth/geo.js";
import type { ArtifactKind } from "../../../../shared/artifact-views.js";

const { artifactViews } = schema;
type NewArtifactView = typeof artifactViews.$inferInsert;

export interface RecordArtifactViewArgs {
  artifactKind: ArtifactKind;
  artifactId: string;
  ownerUserId: string | null;
  viewerId: string | null;
  viewerEmail?: string | null;
  viewerCompany?: string | null;
  ipHash?: string | null;
  ipCountry?: string | null;
  referrer?: string | null;
  userAgent?: string | null;
  engagement?: number[] | null;
  engagementUnit?: "s" | "%";
  totalEngagementSec?: number | null;
  /** 0..1 — fraction of duration consumed. */
  percentConsumed?: number | null;
  dropOffBucket?: number | null;
}

/** Record a single artifact view. No-op when the viewer IS the owner —
 *  see header. Safe to fire-and-forget; the function never throws
 *  because telemetry must not break a page load. */
export async function recordArtifactView(
  args: RecordArtifactViewArgs,
): Promise<void> {
  if (
    args.viewerId &&
    args.ownerUserId &&
    args.viewerId === args.ownerUserId
  ) {
    return;
  }

  const row: NewArtifactView = {
    artifactKind: args.artifactKind,
    artifactId: args.artifactId,
    ownerUserId: args.ownerUserId,
    viewerId: args.viewerId,
    viewerEmail: args.viewerEmail ?? null,
    viewerCompany: args.viewerCompany ?? null,
    ipHash: args.ipHash ?? null,
    ipCountry: args.ipCountry ?? null,
    referrer: args.referrer ?? null,
    userAgent: args.userAgent ?? null,
    engagement: args.engagement ?? null,
    engagementUnit:
      args.engagementUnit ??
      (args.artifactKind === "video" ? "s" : "%"),
    totalEngagementSec: args.totalEngagementSec ?? 0,
    percentConsumed: args.percentConsumed ?? 0,
    dropOffBucket: args.dropOffBucket ?? null,
  };

  try {
    const db = getDb();
    await db.insert(artifactViews).values(row);
  } catch {
    // Telemetry must never break the request — swallow.
  }
}

/** Extract ip-country from a Hono context. Hono header API differs from
 *  the Headers Web type so the geo helper takes a flexible shape; this
 *  adapter centralizes the lookup. */
export function ipCountryFromCtx(c: {
  req: { header: (name: string) => string | undefined };
}): string | null {
  return detectCountry({
    get: (name: string) => c.req.header(name) ?? null,
  });
}
