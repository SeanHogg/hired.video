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
import { defaultOutputProfile, outputProfilesFor } from "@shared/media-kinds";
import type { ImageState } from "@shared/image-state";
import type { AnimationState } from "@shared/animation-state";
import type { GameState } from "@shared/game-state";
import type { CadState } from "@shared/cad-state";
import type { CanvasState } from "./canvas-state";

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
    cadState: CadState | null;
    cad3dState?: import("@shared/cad-3d-state").Cad3DState | null;
    interactiveComicState?: import("@shared/interactive-comic-state").InteractiveComicState | null;
    /** Canvas state — used by the comic export path which renders each
     *  scene/page through the timeline render facade. */
    canvasState: CanvasState;
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
      // PSD dispatch (#940 Phase 2 — Photoshop round-trip via ag-psd).
      // Falls through to the flatten path for every other container
      // (png/jpg/webp) so the existing image export flow doesn't change.
      const profile = defaultOutputProfile("image");
      if (profile.container === "psd") {
        if (!snapshot.imageState) return null;
        const { exportImageStateToPsd } = await import("@/lib/studio/drawing/psd-roundtrip");
        const buffer = await exportImageStateToPsd(snapshot.imageState);
        const { toBlobPart } = await import("@/lib/studio/bytes/to-blob-part");
        return new Blob([toBlobPart(new Uint8Array(buffer))], { type: "image/vnd.adobe.photoshop" });
      }
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
    case "cad": {
      if (!snapshot.cadState) return null;
      // CAD Phase 1 (#930) — dispatch by output profile. SVG + DXF +
      // PDF all ship today; STL + STEP are 3D-only and stay deferred
      // until the `cad_3d` runtime lands. The PNG path falls through
      // to the canvas-2D rasteriser (a CAD drawing rendered at 150dpi
      // — same path the PDF encoder uses internally).
      const profile = (await import("@shared/media-kinds")).defaultOutputProfile("cad");
      if (profile.container === "dxf") {
        const { renderCadDxf } = await import("@/lib/studio/cad/cad-dxf-encoder");
        return renderCadDxf(snapshot.cadState);
      }
      if (profile.container === "pdf") {
        const { renderCadPdf } = await import("@/lib/studio/cad/cad-pdf-encoder");
        return renderCadPdf(snapshot.cadState);
      }
      if (profile.container === "stl") {
        const { renderCadStlBlob } = await import("@/lib/studio/cad/cad-stl-encoder");
        return renderCadStlBlob(snapshot.cadState);
      }
      if (profile.container === "step") {
        const { renderCadStepBlob } = await import("@/lib/studio/cad/cad-step-encoder");
        return renderCadStepBlob(snapshot.cadState);
      }
      const { renderCadSvg } = await import("@/lib/studio/cad/cad-export");
      return renderCadSvg(snapshot.cadState);
    }
    case "comic":
    case "interactive_comic": {
      // Comic Phase 2 (#939) — render via the dedicated comic exporter
      // (CBZ / PNG-strip / PDF). Motion-comic profiles (`comic-mp4` /
      // `comic-gif`) fall back to the Timeline render path because
      // they ARE Timeline outputs. Interactive comics flatten to a
      // linear strip on print export (first-valid-branch walk happens
      // inside `renderComic` when the snapshot carries an interactive
      // comic state — for now they share the linear path).
      const profile = outputProfilesFor(mediaKind)[0] ?? outputProfilesFor("comic")[0];
      const isMotionProfile = profile.container === "mp4" || profile.container === "gif";
      if (isMotionProfile) {
        if (!snapshot.renderTimeline) return null;
        return snapshot.renderTimeline();
      }
      const { renderComic } = await import("@/lib/studio/comic/comic-export");
      const { blob } = await renderComic(snapshot.canvasState, profile);
      return blob;
    }
    case "cad_3d": {
      // 3D CAD runtime (#930 follow-on). The bundled mesh-export pipeline
      // is the existing `cad-stl-encoder` extended to take the 3D
      // state's triangulated mesh — for now we delegate to the cad_3d
      // export module that ships alongside the runtime.
      const { renderCad3D } = await import("@/lib/studio/cad/cad-3d-export");
      return renderCad3D(snapshot, mediaKind);
    }
    case "video":
    case "podcast":
    case "voice": {
      // Timeline-runtime kinds — route through the caller's
      // renderTimeline callback so the heavy render imports don't
      // enter the facade's bundle.
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
  if (blob.type === "application/vnd.comicbook+zip") return "cbz";
  if (blob.type === "application/zip") return "zip";
  if (blob.type === "application/pdf") return "pdf";
  if (blob.type === "image/gif") return "gif";
  if (blob.type === "image/png") return "png";
  if (blob.type === "image/webp") return "webp";
  if (blob.type === "image/svg+xml") return "svg";
  if (blob.type === "application/dxf") return "dxf";
  if (blob.type === "model/stl") return "stl";
  if (blob.type === "model/step") return "step";
  if (blob.type === "image/vnd.adobe.photoshop") return "psd";
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
