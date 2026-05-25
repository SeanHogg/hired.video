/**
 * Adapter helpers between the wire payload from `/api/studio/public/:id`
 * (the `PublicVideoReady` shape) and the `StudioProject` shape that the
 * studio runtime + dispatchers (e.g. `<ProjectPlayer/>`) consume.
 *
 * Extracted per the standing DRY rule (`feedback_extract_on_duplication`):
 * both the public watch page (`PublicVideoResume.tsx`) and the lazy
 * mode of `StudioVideoSurface` need to map between the two shapes
 * before they can dispatch through `<ProjectPlayer/>`. Keeping the
 * adapter here means a new `PublicVideoReady` field surfaces in both
 * dispatchers in one edit.
 */
import {
  type PublicVideoReady,
} from "@/components/studio/StudioVideoSurface";
import {
  type StudioProject,
  StudioProjectStatus,
} from "@/lib/services/studio-service";

/** Adapt the wire payload from `/api/studio/public/:id` into a
 *  `StudioProject`-shaped object so `<ProjectPlayer/>` (the kind-
 *  aware SSoT dispatcher) can read it. Only fields the dispatcher
 *  + its child surfaces consume are populated — fields like
 *  `userId`, `viewCount`, `creationDateTime` are stubbed because
 *  the public surface has no use for them. */
export function publicReadyToProject(ready: PublicVideoReady): StudioProject {
  return {
    id: ready.id,
    userId: "",
    title: ready.title,
    status: StudioProjectStatus.Published,
    youtubeVideoId: ready.youtubeVideoId ?? null,
    videoUrl: ready.videoUrl ?? null,
    thumbnailUrl: ready.thumbnailUrl ?? null,
    storyboard: null,
    script: null,
    kind: (ready.kind as "scene" | "nle" | null | undefined) ?? "scene",
    mediaKind: (ready.mediaKind as StudioProject["mediaKind"]) ?? "video",
    timelineSpec: ready.timelineSpec ?? null,
    gameState: ready.gameState ?? null,
    imageState: ready.imageState ?? null,
    animationState: ready.animationState ?? null,
    cadState: ready.cadState ?? null,
    // Comic projects still author via the CanvasState path so the
    // dispatcher's Timeline-kind branch handles playback today, but
    // we round-trip the column anyway so a comic-only field added
    // later doesn't silently drop on the public surface (#1217).
    comicState: (ready as { comicState?: unknown }).comicState ?? null,
    prompt: null,
    jobDescription: null,
    resumeText: null,
    purpose: null,
    viewCount: 0,
    ctaClickCount: 0,
    isPublic: true,
    metaDescription: ready.metaDescription ?? null,
    slug: null,
    keywords: ready.keywords ?? [],
    socialCardImage: ready.socialCardImage ?? null,
    subjects: [],
    creationDateTime: ready.createdAt,
    updateDateTime: ready.createdAt,
  };
}
