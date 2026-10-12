/**
 * Render + host a v2 canvas for off-platform publishing — the ONE
 * implementation behind every "post this video" surface: the studio editor
 * (StudioEditorV2) and the inline post dock (ShareVideoDock, used by
 * the kit workspace). Before this lived inline in the editor, so no other surface could
 * post without sending the visitor to the studio first.
 *
 *   renderCanvasToBlob    canvas → MP4 Blob through the render facade, with
 *                         the branding pill decided by the caller
 *   hostRenderedVideo     upload the Blob onto the project row, then stamp the
 *                         timeline hash so freshness checks know this render
 *                         matches the content (re-posting skips a re-render)
 *
 * Pure of React; callers own state (cached blob, saved row, busy flags).
 */
import type { CanvasState } from "@/lib/studio/editor-v2/canvas-state";
import { canvasStateToTimeline, resolveTimelineAudioSources } from "@/lib/studio/editor-v2/timeline-emit";
import { computeTimelineSpecHash, withBakedTimelineHash } from "@/lib/studio/baked-freshness";
import { studioService, type StudioProject } from "@/lib/services/studio-service";
import { scanRenderedFrames } from "./moderation-frames";
import { isPostingCodec, timelineForPosting, type Timeline } from "@shared/timeline";
import { bakeCampaignUtmIntoTimeline, type CampaignUtm } from "@shared/campaign-utm";
import { withExportTarget } from "@/lib/studio/widgets/export-target";

export interface RenderCanvasOptions {
  /** Resolved branding decision — `shouldShowBranding({ isPro, removeBrandingFlag })`.
   *  Must be explicit so a free export never silently drops the watermark. */
  includeBranding: boolean;
  /** Lets the facade enforce Pro-only export profiles. */
  isPro: boolean;
  /** Render progress, 0..1. */
  onProgress?: (progress: number) => void;
  /** "download" (default) honours the owner's export codec (ProRes / DNxHD
   *  MOV, HEVC / VP9 MP4); "post" always renders H.264 MP4 (POSTING RULE,
   *  shared/timeline `timelineForPosting`). */
  purpose?: "download" | "post";
  /** The studio project the canvas belongs to — its engagement assets'
   *  titles are fetched for the export painter. Absent = untitled cards. */
  projectId?: string | null;
  /** The project's campaign (`pickProjectCampaign`) — its UTMs are baked
   *  into every CTA URL the renderer reads (#1138). The saved state is
   *  never touched. */
  campaign?: CampaignUtm | null;
  /** Last step before encoding — a fitted cut's trim (export-facade
   *  `renderVariant`, #2045). The saved state is never touched. */
  reshapeTimeline?: (timeline: Timeline) => Timeline;
}

/** Blobs rendered WITH the watermark. The fact travels with the exact bytes
 *  (cached blobs included) so the upload reports it without every caller
 *  re-deriving the branding policy. */
const brandedRenders = new WeakSet<Blob>();
/** Blobs rendered as H.264 MP4 — the only renders `hostRenderedVideo` uploads
 *  as-is. A download render in a mastering codec is re-rendered for posting. */
const postableRenders = new WeakSet<Blob>();

/** Canvas → video Blob (MP4, or MOV for a ProRes / DNxHD download). Null when there is nothing to render. */
export async function renderCanvasToBlob(state: CanvasState, opts: RenderCanvasOptions): Promise<Blob | null> {
  if (state.scenes.length === 0) return null;
  // A file has no click overlay: the export target makes interactive
  // widgets paint their fallback (a CTA's readable link + QR). Stamped
  // AFTER the UTM bake so the QR encodes the campaign URL.
  const authored = await withExportTarget(bakeCampaignUtmIntoTimeline(canvasStateToTimeline(state), opts.campaign));
  const posting = opts.purpose === "post" ? timelineForPosting(authored) : authored;
  const timeline = opts.reshapeTimeline ? opts.reshapeTimeline(posting) : posting;
  const sources = await resolveTimelineAudioSources(state);
  if (opts.projectId) {
    // Render prep: the engagement-asset painter reads titles synchronously.
    const { preloadEngagementTitles } = await import("@/lib/timeline/effects/engagement-asset");
    await preloadEngagementTitles(opts.projectId, timeline);
  }
  const { renderTimeline } = await import("@/lib/timeline/render");
  const result = await renderTimeline(timeline, sources, opts);
  if (result.blob && opts.includeBranding) brandedRenders.add(result.blob);
  if (result.blob && isPostingCodec(timeline.exportCodec)) postableRenders.add(result.blob);
  return result.blob;
}

/** POSTING RULE: the blob to upload — the given render when it is already
 *  H.264 MP4, otherwise a fresh H.264 render of the same canvas carrying the
 *  same branding decision. */
async function postableBlob(blob: Blob, state: CanvasState, projectId: string | undefined): Promise<Blob | null> {
  if (postableRenders.has(blob)) return blob;
  // `isPro` only gates platform profiles, which a posting render never uses.
  return renderCanvasToBlob(state, { includeBranding: brandedRenders.has(blob), isPro: false, purpose: "post", projectId });
}

/**
 * Upload a rendered Blob as the project's hosted video, then re-save the
 * timeline stamped with the hash that produced it. Returns the freshest row.
 * Throws when the upload itself fails; a failed stamp is non-fatal (the next
 * save retries it), so the upload still counts.
 */
export async function hostRenderedVideo(args: {
  blob: Blob;
  title: string;
  state: CanvasState;
  projectId: string | undefined;
  uploadFailedMessage: string;
}): Promise<StudioProject> {
  const blob = await postableBlob(args.blob, args.state, args.projectId);
  if (!blob) throw new Error(args.uploadFailedMessage);
  const uploadRes = await studioService.uploadVideo(
    blob,
    args.title,
    args.projectId,
    undefined,
    undefined,
    brandedRenders.has(blob),
  );
  if (!uploadRes.data) throw new Error(args.uploadFailedMessage);
  let row = uploadRes.data;
  // Home-wall explicit scan: sample frames of THIS render for the server's
  // vision check. Background — never delays or fails the post.
  void scanRenderedFrames({
    blob,
    projectId: row.id,
    sceneDurations: args.state.scenes.map((scene) => scene.durationSeconds),
  });
  const timeline = canvasStateToTimeline(args.state);
  try {
    const stamped = await studioService.saveDraft({
      name: args.title,
      projectId: row.id,
      kind: "nle",
      timelineSpec: withBakedTimelineHash(timeline, computeTimelineSpecHash(timeline)),
    });
    if (stamped.data) row = stamped.data;
  } catch {
    // Non-fatal — see the doc comment.
  }
  return row;
}
