/**
 * `exportProjectByKind` — single dispatch point for the studio editor's
 * export pipeline. Closes the studio-audit DRY finding that
 * `handleExport` had three parallel branches (image early-return,
 * animation early-return, then `renderProjectToBlob` with its own
 * game branch).
 *
 * Per the canvas-runtime extensibility model (PRD §1.2), every
 * mediaKind owns its own export pipeline:
 *   - image      → flatten the layer stack to a single PNG blob
 *   - animation  → GIF89a (in-tree) / APNG / WebP / MP4-alpha via
 *                  `renderAnimation` in
 *                  `lib/studio/animation/animation-export.ts`
 *   - game       → JSZip HTML5 bundle via `bundleGame` in
 *                  `lib/studio/game/game-export.ts`
 *   - comic      → PDF / CBZ / PNG-strip (Phase 2 pending) OR Timeline
 *                  fallback while #939 lands
 *   - video / podcast / voice → Timeline render facade via the
 *                  caller-supplied `renderTimeline` callback (kept as
 *                  an injection point so the facade doesn't pull
 *                  ffmpeg.wasm / WebCodecs imports into every kind's
 *                  bundle).
 *
 * Adding a new mediaKind = one more case in this switch + (if it has
 * a runtime-specific export pipeline) one new strategy module under
 * `lib/studio/<kind>/`.
 */
import type { MediaKind } from "@shared/media-kinds";
import { defaultOutputProfile } from "@shared/media-kinds";
import type { ImageState } from "@shared/image-state";
import type { AnimationState } from "@shared/animation-state";
import type { GameState } from "@shared/game-state";

/** Inputs the facade needs to dispatch per kind. The Timeline branch is
 *  injected so the facade module doesn't pull the heavy Timeline
 *  render code into bundles for projects that never use it. */
export interface ExportInputs {
  mediaKind: MediaKind;
  title: string;
  /** Snapshot of the editor's per-runtime state — exactly one is
   *  relevant per kind; the facade picks the right one. */
  snapshot: {
    imageState: ImageState | null;
    animationState: AnimationState | null;
    gameState: GameState | null;
    /** Flatten-active-image-canvas-to-PNG handler — supplied by the
     *  host because it needs access to the live DrawingStage canvas
     *  ref. Returns the PNG blob the facade downloads. */
    flattenImage?: () => Promise<Blob>;
    /** Timeline render handler — supplied by the host so the heavy
     *  ffmpeg.wasm / WebCodecs imports don't enter the facade's
     *  bundle. Returns the rendered Blob (MP4/MP3/WAV) or null when
     *  the project isn't renderable yet (no scenes). */
    renderTimeline?: () => Promise<Blob | null>;
  };
}

/** Dispatch the export. Returns the produced Blob or null when the
 *  active kind can't render yet (e.g. game without a seeded state). */
export async function exportProjectByKind(inputs: ExportInputs): Promise<Blob | null> {
  const { mediaKind, title, snapshot } = inputs;
  switch (mediaKind) {
    case "image": {
      if (!snapshot.flattenImage) return null;
      return snapshot.flattenImage();
    }
    case "animation": {
      const { renderAnimation } = await import("@/lib/studio/animation/animation-export");
      const profile = defaultOutputProfile("animation");
      if (!snapshot.animationState) return null;
      const { blob } = await renderAnimation(snapshot.animationState, profile);
      return blob;
    }
    case "game": {
      if (!snapshot.gameState) return null;
      const { bundleGame } = await import("@/lib/studio/game/game-export");
      return bundleGame(snapshot.gameState, { title });
    }
    case "video":
    case "podcast":
    case "voice":
    case "comic": {
      // Timeline-runtime kinds + comic (which authors via CanvasState
      // even though its export pipeline is non-Timeline today — Phase 2
      // will swap this branch for the comic-specific PDF/CBZ exporter
      // per gap #939).
      if (!snapshot.renderTimeline) return null;
      return snapshot.renderTimeline();
    }
    default:
      return assertNever(mediaKind, `Unhandled mediaKind in exportProjectByKind(): ${String(mediaKind)}`);
  }
}

/** Derive the download file extension from a returned Blob. Lives
 *  here (not inline in the host) so each kind's MIME → extension
 *  mapping is single-sourced. */
export function extensionForBlob(blob: Blob): string {
  if (blob.type === "application/zip") return "zip";
  if (blob.type === "image/gif") return "gif";
  if (blob.type === "image/png") return "png";
  if (blob.type === "image/webp") return "webp";
  if (blob.type === "image/apng") return "apng";
  if (blob.type.includes("webm")) return "webm";
  if (blob.type.includes("wav")) return "wav";
  if (blob.type.includes("mpeg")) return "mp3";
  if (blob.type.includes("quicktime")) return "mov";
  return "mp4";
}

function assertNever(_x: never, msg: string): never {
  throw new Error(msg);
}
