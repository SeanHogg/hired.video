/**
 * The public watch payload (`GET /api/studio/public/:videoId`, the /v/:id
 * and /m/:slug pages). The param may be a videos.id, a YouTube id, a
 * studio project id ("Copy URL") or a project vanity slug. Projects resolve
 * first so a shared link to a saved-but-unrendered project still plays its
 * canvas live (<CanvasStatePreview/>, #665/#721) — or returns a "pending"
 * placeholder while it is private. Served through getPublicWatchCached;
 * "pending" is never cached (the owner publishes from that very page).
 */
import { getDb, type Db } from "../../db/index.js";
import { cdnUrl } from "../../utils/cdn.js";
import { isUuid } from "../../../../shared/value-types.js";
import { isValidSlug } from "../../../../shared/slugify.js";
import { extractCtaHotzones } from "../../../../shared/cta-hotzones.js";
import { bakeCampaignUtmIntoHotzones } from "../../../../shared/campaign-utm.js";
import type { Timeline } from "../../../../shared/timeline.js";
import {
  findProjectTimeline,
  findWatchProject,
  findWatchVideo,
  type WatchProjectRow,
  type WatchVideoRow,
} from "../../repositories/studioPublicWatchRepository.js";
import { asIso } from "./project-dto.js";
import { findProjectCampaignUtm } from "./project-campaign-utm.js";
import { legacyScriptForPublic } from "./public-video-state.js";
import { projectStateDto } from "./project-state.js";
import { getPublicWatchCached } from "./public-watch-cache.js";
import { success, error } from "../../types/index.js";

/** `{ status, body }` with the studio envelope as body — the exact shape
 *  the watch cache has always stored, so cached entries survive deploys. */
export type WatchResult =
  | { status: 404; body: ReturnType<typeof error> }
  | { status: 200; body: { success: true; data: Record<string, unknown> & { pending: boolean }; timestamp: string } };

/** The JSONB-stored meta of a project row, lifted in one place. */
function toProjectInfo(proj: WatchProjectRow) {
  const meta = proj.storyboard as Record<string, unknown> | null;
  const state = projectStateDto(proj);
  return {
    id: proj.id,
    isPublic: proj.isPublic,
    // Published = live by link (the profile post); `isPublic` is the
    // separate public / unlisted listing flag.
    published: proj.status === "published",
    title: proj.name ?? null,
    storyboard: proj.storyboard ?? null,
    timelineSpec: state.timelineSpec,
    kind: proj.kind ?? null,
    mediaKind: proj.mediaKind ?? "video",
    gameState: state.gameState,
    imageState: state.imageState,
    animationState: state.animationState,
    cadState: state.cadState,
    comicState: state.comicState,
    ownerName: proj.ownerName,
    ownerAvatar: proj.ownerAvatar,
    metaDescription: (meta?._metaDescription as string | undefined) ?? null,
    keywords: Array.isArray(meta?._keywords) ? (meta!._keywords as string[]) : [],
    socialCardImage: (meta?._socialCardImage as string | undefined) ?? null,
  };
}
type ProjectInfo = ReturnType<typeof toProjectInfo>;

/** CTA hot-zones from the backing project's Timeline, with campaign UTMs
 *  (#1138) baked in. Best-effort: malformed / missing → []. */
async function loadCtaHotzones(db: Db, projectInfo: ProjectInfo | null, v: WatchVideoRow | null) {
  let hotzones: ReturnType<typeof extractCtaHotzones> = [];
  try {
    const proj = projectInfo
      ? await findProjectTimeline(db, { projectId: projectInfo.id })
      : v
        ? await findProjectTimeline(db, { videoId: v.id })
        : null;
    if (proj?.timelineSpec) hotzones = extractCtaHotzones(proj.timelineSpec as Timeline);
    if (hotzones.length > 0 && proj?.id) {
      hotzones = bakeCampaignUtmIntoHotzones(hotzones, await findProjectCampaignUtm(proj.id));
    }
  } catch {
    // Malformed timeline / schema drift — no hot-zones rather than a failed payload.
  }
  return hotzones;
}

async function buildWatchPayload(param: string): Promise<WatchResult> {
  const db = getDb();
  const paramIsUuid = isUuid(param);
  const proj = paramIsUuid
    ? await findWatchProject(db, { id: param })
    // A kebab-case slug (the save-draft validator's exact shape); anything
    // else falls through to the YouTube-id lookup below.
    : isValidSlug(param) ? await findWatchProject(db, { slug: param }) : null;
  const projectInfo = proj ? toProjectInfo(proj) : null;
  const v = await findWatchVideo(db, { resolvedVideoId: proj?.videoId ?? null, param, paramIsUuid });

  if (!v && !projectInfo) return { status: 404, body: error("NOT_FOUND", "Video not found") };

  // The project's own flags are authoritative for the in-platform watch
  // page; videos.privacy_status only gates legacy direct uploads.
  const isViewable = projectInfo ? projectInfo.isPublic || projectInfo.published : v?.privacyStatus === "public";
  const ownerName = projectInfo?.ownerName ?? v?.ownerName ?? null;
  const ownerAvatar = projectInfo?.ownerAvatar ?? v?.ownerAvatar ?? null;
  if (!isViewable) {
    return { status: 200, body: success({
      pending: true,
      // Lets the watch page offer the OWNER "Publish" / "Edit" in place of a
      // dead end. Null for a legacy direct upload (no project).
      id: projectInfo?.id ?? null,
      title: projectInfo?.title || v?.title || "Video in progress",
      ownerName,
      ownerAvatar,
    }) };
  }

  // Prefer the R2 CDN URL; a YouTube URL only for a real (non `yt_`) id.
  const isFakeYoutube = v?.youtubeVideoId?.startsWith("yt_") ?? false;
  const realYoutubeUrl = isFakeYoutube ? null : (v?.youtubeUrl ?? null);
  const realYoutubeId = isFakeYoutube ? null : (v?.youtubeVideoId ?? null);
  const videoUrl = realYoutubeUrl ?? (v?.r2Key ? cdnUrl(v.r2Key) : null);

  // Frame aspect / resolution from the project's (current) storyboard, else
  // the render-time snapshot on the video row.
  const storyboardForPlayback = projectInfo?.storyboard ?? v?.storyboard ?? null;
  const scriptForMeta = storyboardForPlayback as { video?: { aspect?: string; resolution?: string } } | null;

  return { status: 200, body: success({
    pending: false,
    id: projectInfo?.id ?? v!.id,
    title: projectInfo?.title || v?.title || `${ownerName ?? "Owner"}'s Video Resume`,
    description: v?.description ?? null,
    videoUrl,
    youtubeUrl: realYoutubeUrl,
    youtubeVideoId: realYoutubeId,
    thumbnailUrl: v?.thumbnailUrl ?? null,
    ownerName,
    ownerAvatar,
    resumeId: v?.resumeId ?? null,
    // V2 playback state (#721) — hydrated via timelineToCanvasState.
    timelineSpec: projectInfo?.timelineSpec ?? null,
    // V1-editor projects' scenes (meta stripped) for read-time conversion.
    legacyScript: legacyScriptForPublic(storyboardForPlayback),
    kind: projectInfo?.kind ?? null,
    // Output-axis discriminator + per-runtime state for <ProjectPlayer/>.
    mediaKind: projectInfo?.mediaKind ?? "video",
    gameState: projectInfo?.gameState ?? null,
    imageState: projectInfo?.imageState ?? null,
    animationState: projectInfo?.animationState ?? null,
    cadState: projectInfo?.cadState ?? null,
    comicState: projectInfo?.comicState ?? null,
    aspect: scriptForMeta?.video?.aspect ?? null,
    resolution: scriptForMeta?.video?.resolution ?? null,
    ctaHotzones: await loadCtaHotzones(db, projectInfo, v),
    // SEO meta from the project Details drawer; the client decides precedence.
    metaDescription: projectInfo?.metaDescription ?? null,
    keywords: projectInfo?.keywords ?? [],
    socialCardImage: projectInfo?.socialCardImage ?? null,
    createdAt: asIso(v?.createdAt ?? new Date()),
  }) };
}

/** Cached watch payload; a "pending" placeholder is never cached. */
export function getPublicWatchPayload(param: string): Promise<WatchResult> {
  return getPublicWatchCached(param, () => buildWatchPayload(param), (r) => !(r.status === 200 && r.body.data.pending));
}
