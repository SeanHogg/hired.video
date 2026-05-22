/**
 * ProjectPlayer — kind-aware playback dispatcher.
 *
 * Per the canvas-runtime extensibility model (PRD §1.2), every
 * `mediaKind` has its own play surface. This component is the single
 * SoT dispatcher: hand it a `StudioProject` + an aspect-frame and it
 * mounts the right runtime per kind.
 *
 *   - Game → `<GameStage mode="play">` (runs the Phaser-replacement
 *     runtime against `project.gameState`)
 *   - Timeline kinds (video / podcast / voice / animation / comic) →
 *     `<StudioVideoSurface>` (the existing player that handles
 *     YouTube / baked MP4 / live-script preview / poster fallback)
 *
 * Per the standing DRY rule, every consumer that "plays a studio
 * project on a page" should mount THIS, not `<StudioVideoSurface>`
 * directly — adding a new kind is one branch here, and the existing
 * 10+ consumers (EntityVideos rail, ProfileHeaderVideos,
 * HeroVideoSpotlight, ResumeProfileLayout, etc.) inherit the right
 * surface automatically.
 *
 * NOTE: zero consumers today. This is the SEAM for the #937 migration
 * — the dispatcher infrastructure ships before the migration so each
 * consumer can swap independently. Today the editor's playtest button
 * + the exported HTML5 bundle already let users play game projects;
 * #937 is what wires inline playback on entity cards / public pages
 * for every non-video kind. Don't delete as dead code — the
 * architectural seam is the deliverable.
 */
import { lazy, Suspense } from "react";
import type { StudioProject } from "@/lib/services/studio-service";
import type { GameState } from "@shared/game-state";
import { firstLayerPixels, type ImageState } from "@shared/image-state";
import StudioVideoSurface from "@/components/studio/StudioVideoSurface";

const GameStage = lazy(() => import("@/components/studio/game/GameStage"));

interface ProjectPlayerProps {
  project: StudioProject;
  /** Game projects need a zoom multiplier to scale the canvas. Default
   *  1 (design-time pixels); callers in fixed-aspect tiles should pass
   *  the ratio (e.g. `tileWidth / project.gameState.width`). */
  gameZoom?: number;
  /** Threaded straight to `<StudioVideoSurface>` for Timeline kinds —
   *  see its prop docs. Ignored for non-Timeline kinds. */
  videoSurfaceProps?: Omit<React.ComponentProps<typeof StudioVideoSurface>, "mode" | "ready">;
}

export default function ProjectPlayer({
  project,
  gameZoom = 1,
  videoSurfaceProps,
}: ProjectPlayerProps) {
  const mediaKind = project.mediaKind ?? "video";

  if (mediaKind === "game") {
    const gameState = (project.gameState ?? null) as GameState | null;
    return (
      <Suspense fallback={null}>
        <GameStage
          gameState={gameState}
          zoom={gameZoom}
          mode="play"
          hideRuntimeBanner
        />
      </Suspense>
    );
  }

  // Image projects (#932) are static rasters — no time axis, no audio,
  // no playback runtime. The consumer-side play surface is a plain
  // `<img>` showing the first drawn layer (DRY: same `firstLayerPixels`
  // helper VideoProjectThumbnail uses). For full multi-layer composite
  // a future server-side flatten endpoint would render the project to
  // a single PNG at render-time — until then the bottom layer is the
  // honest preview.
  if (mediaKind === "image") {
    const pixels = firstLayerPixels(project.imageState as ImageState | null | undefined);
    if (pixels) {
      return (
        <img
          src={pixels}
          alt={project.title ?? "Drawing"}
          className="h-full w-full object-contain"
          draggable={false}
        />
      );
    }
    // Fall through to the video surface poster fallback when the
    // image project has no layer pixels yet — surfaces a "Open in
    // studio" affordance via the existing poster path.
  }

  // Every Timeline-runtime kind (and comic, which authors via
  // CanvasState) delegates to the existing video surface. The surface
  // already handles MP4 / YouTube / live-script-preview / poster
  // dispatch per its own internal modes.
  return (
    <StudioVideoSurface
      mode="lazy"
      videoId={project.id}
      poster={project.thumbnailUrl ?? undefined}
      {...videoSurfaceProps}
    />
  );
}
