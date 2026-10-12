/**
 * Owner-facing use cases on a studio project's video:
 *
 *   getProjectScanStatus   what the Post panel shows — the verdict and the
 *                          categories (never the reason / offending text)
 *   submitProjectFrames    the frames the client sampled from the render it
 *                          just uploaded → vision scan → re-evaluate the video
 */
import { ownerStatusOf, type OwnerScanStatus } from "../../../../../shared/moderation/explicit.js";
import { assertCanWrite } from "../../studio/workspace.js";
import { getScan } from "./contentScanRepository.js";
import { evaluateVideoForPublic, scanVideoFrames } from "./videoScan.js";
import { loadProjectVideo } from "./videoScanContext.js";
import type { ImageInput } from "./imageClassifier.js";
import type { ExplicitScanDeps } from "./deps.js";

export class ProjectScanError extends Error {
  constructor(readonly code: "NOT_FOUND" | "NO_VIDEO") {
    super(code === "NOT_FOUND" ? "Project not found" : "This project has no uploaded video yet");
  }
}

async function authorizedVideo(actorId: string, projectId: string) {
  const row = await loadProjectVideo(projectId);
  if (!row) throw new ProjectScanError("NOT_FOUND");
  await assertCanWrite(actorId, row.projectUserId, row.projectCompanyId ?? null);
  return row;
}

export async function getProjectScanStatus(actorId: string, projectId: string): Promise<OwnerScanStatus | null> {
  const row = await authorizedVideo(actorId, projectId);
  if (!row.videoId) return null;
  const scan = await getScan("video", row.videoId);
  if (!scan) return null;
  return ownerStatusOf(scan);
}

export async function submitProjectFrames(
  args: { actorId: string; projectId: string; frames: readonly ImageInput[] },
  deps: ExplicitScanDeps,
): Promise<OwnerScanStatus | null> {
  const row = await authorizedVideo(args.actorId, args.projectId);
  if (!row.videoId || !row.r2Key || !row.ownerUserId) throw new ProjectScanError("NO_VIDEO");
  await scanVideoFrames({ videoId: row.videoId, r2Key: row.r2Key, ownerUserId: row.ownerUserId, frames: args.frames }, deps);
  const scan = await evaluateVideoForPublic(row.videoId, deps);
  if (!scan) return null;
  return ownerStatusOf(scan);
}
