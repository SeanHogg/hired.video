/**
 * Studio project playback analytics — public view / CTA-click tracking and
 * the owner's rollup. Keyed on the project, not the render (post-#665,
 * migration 0085). Split out of routes/studio.ts (W2-3a).
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { findProjectById } from "../../repositories/studioProjectsRepository.js";
import {
  countEventsForProjects,
  findStudioEventSubject,
  insertVideoAnalyticsEvent,
} from "../../repositories/videoAnalyticsRepository.js";
import { isUuid } from "../../../../shared/value-types.js";

export type TrackedProjectEvent = "view" | "cta_click";

/** Record one public event (anonymous allowed). Body fields are optional.
 *  An unknown project records nothing (the retired video_analytics FK
 *  rejected those rows too). */
export async function trackProjectEvent(
  studioProjectId: string,
  event: TrackedProjectEvent,
  viewerUserId: string | null,
  body: { referrer?: unknown; campaignId?: unknown; metadata?: unknown },
): Promise<void> {
  if (!isUuid(studioProjectId)) return;
  const db = getDb();
  const subject = await findStudioEventSubject(db, studioProjectId);
  if (!subject) return;
  await insertVideoAnalyticsEvent(db, {
    studioProjectId,
    artifactKind: subject.artifactKind,
    ownerUserId: subject.ownerUserId,
    viewerId: viewerUserId && isUuid(viewerUserId) ? viewerUserId : null,
    event,
    referrer: typeof body.referrer === "string" ? body.referrer.slice(0, 500) : null,
    campaignId: typeof body.campaignId === "string" ? body.campaignId : null,
    metadata: body.metadata ?? null,
  });
}

export interface ProjectAnalyticsSummary {
  projectId: string;
  views: number;
  ctaClicks: number;
  shares: number;
  clickThroughRate: number;
}

/** Owner-only rollup (the row's userId must be the caller → 404 otherwise). */
export async function getProjectAnalytics(actorUserId: string, projectId: string): Promise<ProjectAnalyticsSummary> {
  const db = getDb();
  const project = await findProjectById(db, projectId);
  if (!project || project.userId !== actorUserId) throw new DomainError(404, "NOT_FOUND", "Project not found");
  const stats = await countEventsForProjects(db, [projectId]);
  return {
    projectId,
    views: stats["view"] ?? 0,
    ctaClicks: stats["cta_click"] ?? 0,
    shares: stats["share"] ?? 0,
    clickThroughRate: stats["view"] ? Math.round(((stats["cta_click"] ?? 0) / stats["view"]) * 100) / 100 : 0,
  };
}
