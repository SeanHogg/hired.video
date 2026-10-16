/**
 * Promotion queue use cases (Lane A, #2046): a creator submits a rendered,
 * watermarked Studio project; an AI pre-screen blocks clear violations; a
 * SuperAdmin approves (→ publish on hired.video's managed brand account) or
 * rejects. The creator is notified of the outcome.
 *
 * Queue reads are deliberately uncached: the creator read is one indexed
 * lookup made only while the Post panel is open, and the SuperAdmin queue
 * must reflect approvals immediately. Platform reach (external API) IS
 * cached — see promotionReach.ts.
 */
import { eq, sql } from "drizzle-orm";
import { publicProfilePath } from "../../../../shared/public-paths.js";
import { getDb, schema } from "../../db/index.js";
import type { PromotionPlatform, PromotionStatus } from "../../../../shared/promotions.js";
import { assertCanWrite } from "../studio/workspace.js";
import { CandidateConsentRequiredError } from "../../domains/candidate-consent/consent-gate.js";
import { assertCandidateVideoConsent } from "../candidate-consent/candidate-consent-deps.js";
import { requireCompiledVideo } from "../studio/compiled-video.js";
import { currentCutVideoId, resolvePostedVariant } from "../studio/render-variants.js";
import { socialConnectionServiceFor } from "../social/social-connection-factory.js";
import type { SocialEnv } from "../social/social-connection-service.js";
import { createLLMClient, type LLMEnv } from "../adapters/llm-client.js";
import { frontendBaseUrl } from "../../utils/public-urls.js";
import { PROMOTION_PUBLISHERS } from "./promotionPublishers.js";
import { screenPromotion } from "./promotionScreening.js";
import { notifyPromotionOutcome } from "./promotionNotifications.js";
import { invalidateReach, projectReach } from "./promotionReach.js";
import * as repo from "./promotionRepository.js";

export type PromotionEnv = SocialEnv & LLMEnv;

export type PromotionErrorKind =
  | "PROJECT_NOT_FOUND"
  | "VIDEO_NOT_READY"
  | "VIDEO_UNBRANDED"
  | "INVALID_VARIANT"
  | "CONSENT_REQUIRED"
  | "LANE_NOT_READY"
  | "ALREADY_SUBMITTED"
  | "NOT_FOUND"
  | "NOT_REVIEWABLE";

export class PromotionError extends Error {
  constructor(
    public readonly kind: PromotionErrorKind,
    message: string,
    /** Envelope `details` (CONSENT_REQUIRED carries `{ reason }`). */
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "PromotionError";
  }
}

async function loadProject(projectId: string) {
  const { studioProjects } = schema;
  const [project] = await getDb()
    .select({
      id: studioProjects.id,
      userId: studioProjects.userId,
      companyId: studioProjects.companyId,
      videoId: studioProjects.videoId,
      script: studioProjects.resumeText,
      /** The hash the master render is stamped with (baked-freshness). */
      masterHash: sql<string | null>`${studioProjects.timelineSpec}->'_meta'->>'bakedHash'`,
    })
    .from(studioProjects)
    .where(eq(studioProjects.id, projectId))
    .limit(1);
  if (!project) throw new PromotionError("PROJECT_NOT_FOUND", "Project not found");
  return project;
}

/** The project's hosted render — or the fitted cut for the platform (#2045)
 *  — which must carry the hired.video watermark: brand posts are never
 *  un-watermarked. */
async function requireBrandedVideo(project: { videoId: string | null; userId: string }, cutVideoId?: string | null) {
  if (!project.videoId) {
    throw new PromotionError("VIDEO_NOT_READY", "Render the video before submitting it for promotion.");
  }
  const video = await requireCompiledVideo(getDb(), { videoId: cutVideoId ?? project.videoId, ownerUserId: project.userId });
  if (!video.branded) {
    throw new PromotionError(
      "VIDEO_UNBRANDED",
      "Promoted videos carry the hired.video watermark. Turn branding back on and re-render to submit.",
    );
  }
  return video;
}

/** Non-removable creator credit + backlink on every brand post. It leads the
 *  text so adapters that trim to a platform limit (X: 280) cut the
 *  creator's description, never the credit. */
async function withAttribution(description: string, creatorUserId: string): Promise<string> {
  const [creator] = await getDb()
    .select({ name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.id, creatorUserId))
    .limit(1);
  const credit = `Made by ${creator?.name ?? "a hired.video creator"} on hired.video — ${frontendBaseUrl()}${publicProfilePath(creatorUserId)}`;
  return [credit, description.trim()].filter(Boolean).join("\n\n");
}

/** The cut a submission names — it must be a cut of THIS project. */
async function requireOwnCut(projectId: string, videoId: string | undefined) {
  if (!videoId) return null;
  const cut = await resolvePostedVariant(getDb(), { projectId, videoId });
  if (!cut) throw new PromotionError("INVALID_VARIANT", "That cut doesn't belong to this video.");
  return cut;
}

export async function submitForPromotion(args: {
  actorUserId: string;
  projectId: string;
  platform: PromotionPlatform;
  title: string;
  description: string;
  /** The fitted cut for this platform, when the master doesn't fit it (#2045). */
  variantVideoId?: string;
  env: PromotionEnv | undefined;
}): Promise<repo.PromotionSubmission> {
  const project = await loadProject(args.projectId);
  await assertCanWrite(args.actorUserId, project.userId, project.companyId ?? null);
  // A candidate's video is promoted only after they approved it (now + scheduled).
  try {
    await assertCandidateVideoConsent(project.id);
  } catch (e) {
    if (e instanceof CandidateConsentRequiredError) throw new PromotionError("CONSENT_REQUIRED", e.message, e.details);
    throw e;
  }
  const cut = await requireOwnCut(project.id, args.variantVideoId);
  await requireBrandedVideo(project, cut?.videoId);
  if (!(await socialConnectionServiceFor(args.env).isManagedLaneReady(args.platform))) {
    throw new PromotionError("LANE_NOT_READY", "Promotion on this platform isn't available yet.");
  }
  const screening = await screenPromotion({
    llm: createLLMClient(args.env, null),
    title: args.title,
    description: args.description,
    script: project.script ?? "",
  });
  const created = await repo.insertSubmission({
    projectId: project.id,
    submittedBy: args.actorUserId,
    platform: args.platform,
    title: args.title,
    description: args.description,
    screeningVerdict: screening.verdict,
    screeningNotes: screening.notes,
    renderVariantId: cut?.id ?? null,
    autoRejectReason: screening.verdict === "block" ? screening.notes ?? "Didn't pass automatic screening." : undefined,
  });
  if (!created) throw new PromotionError("ALREADY_SUBMITTED", "This project is already waiting for review.");
  if (created.status === "rejected") await notifyPromotionOutcome(created);
  return created;
}

export async function listProjectPromotions(args: {
  actorUserId: string;
  projectId: string;
  env: PromotionEnv | undefined;
}): Promise<Array<repo.PromotionSubmission & { views: number | null }>> {
  const project = await loadProject(args.projectId);
  await assertCanWrite(args.actorUserId, project.userId, project.companyId ?? null);
  const rows = await repo.listForProject(project.id);
  const views = await projectReach(project.id, rows, args.env);
  return rows.map((r) => ({ ...r, views: views[r.id] ?? null }));
}

export function listPromotionQueue(status: PromotionStatus): Promise<repo.PromotionSubmission[]> {
  return repo.listByStatus(status);
}

/** SuperAdmin approve → publish on the brand account. A failed upload is
 *  recorded on the row (status `failed`, retryable) and returned, not thrown. */
export async function approvePromotion(args: {
  reviewerId: string;
  submissionId: string;
  env: PromotionEnv | undefined;
}): Promise<repo.PromotionSubmission> {
  const claimed = await repo.claimForPublish(args.submissionId, args.reviewerId);
  if (!claimed) {
    const existing = await repo.findSubmission(args.submissionId);
    if (!existing) throw new PromotionError("NOT_FOUND", "Submission not found");
    throw new PromotionError("NOT_REVIEWABLE", "This submission was already reviewed.");
  }
  const platform = claimed.platform as PromotionPlatform;
  try {
    const project = await loadProject(claimed.projectId);
    // Re-checked at publish: the creator may have re-rendered since submitting.
    const video = await requireBrandedVideo(project, await currentCutVideoId(getDb(), claimed.renderVariantId, project.masterHash));
    const accessToken = await socialConnectionServiceFor(args.env).getFreshManagedAccessToken(platform);
    if (!accessToken) throw new PromotionError("LANE_NOT_READY", "Connect hired.video's brand account for this platform first.");
    const result = await PROMOTION_PUBLISHERS[platform]({
      accessToken,
      video,
      title: claimed.title,
      description: await withAttribution(claimed.description, project.userId),
    });
    const published = await repo.markPublished(claimed.id, result);
    invalidateReach(published.projectId);
    await notifyPromotionOutcome(published);
    return published;
  } catch (err) {
    return repo.markFailed(claimed.id, err instanceof Error ? err.message : String(err));
  }
}

export async function rejectPromotion(args: {
  reviewerId: string;
  submissionId: string;
  reason: string;
}): Promise<repo.PromotionSubmission> {
  const row = await repo.markRejected(args.submissionId, args.reviewerId, args.reason);
  if (row) {
    await notifyPromotionOutcome(row);
    return row;
  }
  const existing = await repo.findSubmission(args.submissionId);
  if (!existing) throw new PromotionError("NOT_FOUND", "Submission not found");
  throw new PromotionError("NOT_REVIEWABLE", "This submission was already reviewed.");
}
