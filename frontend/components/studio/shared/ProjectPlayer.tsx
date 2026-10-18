/**
 * ProjectPlayer — kind-aware playback dispatcher (the SSoT for
 * "play a studio project on a page", regardless of mediaKind).
 *
 * Per the canvas-runtime extensibility model (PRD §1.2), every
 * `mediaKind` has its own play surface. This component is the single
 * SoT dispatcher: hand it a `StudioProject` (or an already-fetched
 * `PublicVideoReady` payload via `eagerReady`) and it mounts the right
 * runtime per kind:
 *
 *   - Game     → `<GameStage mode="play">` over `gameState`
 *   - Image    → `<img>` of the first drawn layer (or template
 *                placeholder if the project has no pixels yet)
 *   - Animation→ `<img>` of the first painted frame (mirrors image —
 *                a full client-side strip player is overkill for a
 *                public preview; the editor's preview is canonical)
 *   - CAD      → first-shape SVG preview (or template placeholder)
 *   - Timeline kinds (video / podcast / voice / comic) →
 *     `<StudioVideoSurface>` (the existing player that handles
 *     YouTube / baked MP4 / live-script preview / poster fallback)
 *
 * Per the standing DRY rule (`feedback_extract_on_duplication`),
 * every consumer that "plays a studio project on a page" should mount
 * THIS, not `<StudioVideoSurface>` directly. Adding a new kind is one
 * `KIND_PLAYERS` entry here, and the existing consumers (EntityMedia rail, the /v/
 * public watch page, ProfileHeaderVideos, HeroVideoSpotlight,
 * ResumeProfileLayout, etc.) inherit the right surface automatically
 * — that's how we stop showing "Video is being processed" on a
 * Photoshop image / memory-match game / animation.
 *
 * Eager-payload mode: pass `eagerReady` to skip the StudioVideoSurface
 * lazy re-fetch when the caller already hydrated the public payload
 * (e.g. the /v/<id> watch page fetched `/api/studio/public/<id>` to
 * render owner chrome + SEO meta and would otherwise duplicate the
 * fetch). Non-Timeline kinds ignore eagerReady — they need the
 * parallel-column state which is always on the project object.
 */
import { lazy, Suspense, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { StudioProject } from "@/lib/services/studio-service";
import type { GameState } from "@shared/game-state";
import { firstLayerPixels, type ImageState } from "@shared/image-state";
import { firstFramePixels, type AnimationState } from "@shared/animation-state";
import { mediaKindNotReadyKey, type MediaKind } from "@shared/media-kinds";
import StudioVideoSurface from "@/components/studio/StudioVideoSurface";
import type { PublicVideoReady } from "@/lib/studio/public-video-schema";

const GameStage = lazy(() => import("@/components/studio/game/GameStage"));

interface ProjectPlayerProps {
  project: StudioProject;
  /** Game projects need a zoom multiplier to scale the canvas. Default
   *  1 (design-time pixels); callers in fixed-aspect tiles should pass
   *  the ratio (e.g. `tileWidth / project.gameState.width`). */
  gameZoom?: number;
  /** Already-fetched public payload — when present, the Timeline-kind
   *  branch uses `<StudioVideoSurface mode="eager" ready={…}>` instead
   *  of the lazy re-fetch path. Avoids the double round-trip on the
   *  /v/<id> watch page which already fetched the payload for owner
   *  chrome + SEO. Ignored for non-Timeline kinds (game / image /
   *  animation read parallel-column state off `project` directly). */
  eagerReady?: PublicVideoReady;
  /** Threaded straight to `<StudioVideoSurface>` for Timeline kinds —
   *  see its prop docs. Ignored for non-Timeline kinds. */
  videoSurfaceProps?: Omit<
    React.ComponentProps<typeof StudioVideoSurface>,
    "mode" | "ready" | "videoId" | "source"
  >;
}

interface KindPlayerArgs {
  project: StudioProject;
  gameZoom: number;
  t: TFunction;
}

/** A still-raster play surface (image / animation): the project's pixels
 *  as an `<img>` whose alt falls back to the kind's localized `labelKey`,
 *  else the kind-tagged unready placeholder. */
function rasterKindPlayer(
  mediaKind: MediaKind,
  labelKey: string,
  pixelsOf: (project: StudioProject) => string | null | undefined,
): (args: KindPlayerArgs) => ReactNode {
  return function RasterKindPlayer({ project, t }) {
    const pixels = pixelsOf(project);
    if (pixels) {
      return (
        <img
          src={pixels}
          alt={project.title ?? t(labelKey)}
          className="h-full w-full object-contain bg-muted"
          draggable={false}
        />
      );
    }
    return <KindUnreadyPlaceholder mediaKind={mediaKind} />;
  };
}

/** Non-Timeline kinds that own a dedicated play surface. Kinds absent here
 *  (video / podcast / voice / comic / …) fall through to the Timeline
 *  `<StudioVideoSurface>` path below. Adding a kind = one entry here. */
const KIND_PLAYERS: Partial<Record<MediaKind, (args: KindPlayerArgs) => ReactNode>> = {
  game: ({ project, gameZoom }) => {
    const gameState = (project.gameState ?? null) as GameState | null;
    return (
      <Suspense fallback={<KindUnreadyPlaceholder mediaKind="game" />}>
        <GameStage
          gameState={gameState}
          zoom={gameZoom}
          mode="play"
          hideRuntimeBanner
        />
      </Suspense>
    );
  },

  // Image projects (#932) are static rasters — no time axis, no audio,
  // no playback runtime. The consumer-side play surface is a plain
  // `<img>` showing the first drawn layer (DRY: same `firstLayerPixels`
  // helper VideoProjectThumbnail uses). For full multi-layer composite
  // a future server-side flatten endpoint would render the project to
  // a single PNG at render-time — until then the bottom layer is the
  // honest preview.
  // Prefer the project's rendered output (the studio's flattened
  // thumbnail) and fall back to the bottom layer's raw pixels. Projects
  // imported/generated without per-layer state still carry a render, so
  // showing it beats a misleading "isn't ready yet" placeholder.
  image: rasterKindPlayer(
    "image",
    "studio.projectPlayer.drawingAlt",
    (project) =>
      (project.thumbnailUrl ?? null) ||
      firstLayerPixels(project.imageState as ImageState | null | undefined),
  ),

  // Animation projects (#1003) — preview the first painted frame as a
  // still raster, mirroring the image-kind path. A full client-side
  // strip player is overkill for a public watch surface; the editor's
  // own preview overlay is the canonical playback. Falling back to a
  // kind-tagged placeholder keeps the surface coherent before the
  // user has painted anything.
  // Same render-first fallback as the image kind — the studio render
  // (thumbnail) wins over the first painted frame.
  animation: rasterKindPlayer(
    "animation",
    "studio.projectPlayer.animationAlt",
    (project) =>
      (project.thumbnailUrl ?? null) ||
      firstFramePixels(project.animationState as AnimationState | null | undefined),
  ),

  // CAD (#930) — vector drafting kind with no public viewer runtime
  // yet (the live editor IS the canonical surface). Show a kind-
  // tagged placeholder so the watch page doesn't fall through to
  // the video "is being processed" message.
  cad: () => <KindUnreadyPlaceholder mediaKind="cad" />,
};

export default function ProjectPlayer({
  project,
  gameZoom = 1,
  eagerReady,
  videoSurfaceProps,
}: ProjectPlayerProps) {
  const { t } = useTranslation();
  const mediaKind = (project.mediaKind ?? "video") as MediaKind;

  const renderKind = KIND_PLAYERS[mediaKind];
  if (renderKind) return renderKind({ project, gameZoom, t });

  // Every Timeline-runtime kind (video / podcast / voice / comic)
  // delegates to the existing video surface. The surface already
  // handles MP4 / YouTube / live-script preview / poster dispatch.
  // When the caller already fetched the public payload, pass it
  // through eagerly to skip the lazy re-fetch round-trip.
  if (eagerReady) {
    return (
      <StudioVideoSurface
        mode="eager"
        ready={eagerReady}
        {...videoSurfaceProps}
      />
    );
  }
  return (
    <StudioVideoSurface
      mode="lazy"
      videoId={project.id}
      poster={project.thumbnailUrl ?? undefined}
      {...videoSurfaceProps}
    />
  );
}

/** Kind-aware empty-state for projects without a play surface yet —
 *  CAD has no public viewer, image/animation projects with no painted
 *  pixels yet, game runtimes that fail to lazy-load, etc. Replaces
 *  the legacy "Video is being processed" copy which (a) was wrong
 *  for non-video kinds and (b) implied a render was in flight when
 *  the project may simply have no public surface. */
function KindUnreadyPlaceholder({ mediaKind }: { mediaKind: MediaKind }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full w-full items-center justify-center bg-black/5 border border-border rounded-xl">
      <p className="text-muted-foreground text-sm px-4 text-center break-words">
        {t(mediaKindNotReadyKey(mediaKind))}
      </p>
    </div>
  );
}
