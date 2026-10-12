/**
 * CanvasRouter — the single dispatch point that picks which canvas
 * runtime surface mounts in the studio editor. Per Consolidated Gap
 * Register #931 + the canvas-runtime extensibility model in PRD §1.2,
 * `mediaKind` is the first-class extensibility hook: the Timeline
 * runtime hosts video / podcast / voice / animation / comic; each
 * non-Timeline kind (game / image / cad / animated_film / ...) mounts
 * its own surface via this router.
 *
 * Why a router, not an inline branch:
 *   • Per the DRY rule (`feedback_extract_on_duplication`): one place
 *     owns the per-kind dispatch decision. Adding a new runtime surface
 *     is one entry in this component, not an `if mediaKind === "X"`
 *     branch the host has to remember to extend.
 *   • Per SOLID (open/closed): the router is closed to modification
 *     in the host (StudioEditorV2) and open to extension via the
 *     `surfaces` prop — each runtime contributes a surface ReactNode
 *     without the host learning anything about its props.
 *
 * Why surfaces are ReactNodes (not component types + per-kind props):
 *   each runtime's surface needs its own props bundle that only the
 *   host knows how to assemble (Timeline needs scene + selection +
 *   drag/drop callbacks + zoom; Game needs persisted gameState +
 *   zoom; Image needs imageState + setter + zoom). Asking the router
 *   to know all per-runtime contracts would re-couple it to every
 *   runtime — exactly what the seam exists to prevent. The host
 *   assembles each surface with its proper props once; the router
 *   picks which one to render.
 *
 * The `timeline` surface is REQUIRED — it's the default for every
 * Timeline-runtime kind (5 of the 7 kinds today). Per-kind overrides
 * are OPTIONAL — when omitted, the router falls back to the timeline
 * surface (the safe default — a comic project would still render its
 * authoring canvas via CanvasState even though its export pipeline is
 * a non-Timeline runtime).
 */

import type { ReactNode } from "react";
import type { MediaKind } from "@shared/media-kinds";

/** Per-mediaKind surface mapping. Every runtime that owns a distinct
 *  AUTHORING surface (vs. an export-pipeline-only difference) registers
 *  here. Kinds not present in this map fall back to `timeline`. */
export type CanvasRuntimeSurfaces = {
  /** Default surface for every Timeline-runtime kind. Required. */
  timeline: ReactNode;
  /** Game runtime surface. Mounted when `mediaKind === "game"`. */
  game?: ReactNode;
  /** Image / drawing runtime surface (#932). Mounted when
   *  `mediaKind === "image"`. */
  image?: ReactNode;
  /** Animation runtime surface (#1003). Mounted when
   *  `mediaKind === "animation"`. Frame-by-frame raster authoring with
   *  onion-skin overlay; runtime owns its own state shape
   *  (`AnimationState` in `shared/animation-state.ts`). */
  animation?: ReactNode;
  /** CAD runtime surface (#930). Mounted when `mediaKind === "cad"`.
   *  2D vector drafting; runtime owns its own state shape
   *  (`CadState` in `shared/cad-state.ts`). */
  cad?: ReactNode;
  /** 3D CAD runtime surface (#930 follow-on). Mounted when
   *  `mediaKind === "cad_3d"`. Primitive solids + Three.js viewer;
   *  runtime owns its own state shape (`Cad3DState` in
   *  `shared/cad-3d-state.ts`). */
  cad_3d?: ReactNode;
  /** Interactive comic runtime surface (#929). Mounted when
   *  `mediaKind === "interactive_comic"`. Branching page graph +
   *  reader pacing; runtime owns its own state shape
   *  (`InteractiveComicState` in `shared/interactive-comic-state.ts`). */
  interactive_comic?: ReactNode;
  /** Document runtime surface (#1912). Mounted when
   *  `mediaKind === "document"`. Paged WYSIWYG resume / job / article / blog;
   *  runtime owns its own state shape (`DocumentState` in
   *  `frontend/lib/studio/editor-v2/document-state.ts`). */
  document?: ReactNode;
};

interface CanvasRouterProps {
  mediaKind: MediaKind;
  surfaces: CanvasRuntimeSurfaces;
}

/** Single dispatch point — replaces the inline `if mediaKind === "X"`
 *  branch the editor used to host. Per #931 + the PRD §1.2 model. */
export default function CanvasRouter({
  mediaKind,
  surfaces,
}: CanvasRouterProps): ReactNode {
  if (mediaKind === "game" && surfaces.game !== undefined) {
    return surfaces.game;
  }
  if (mediaKind === "image" && surfaces.image !== undefined) {
    return surfaces.image;
  }
  if (mediaKind === "animation" && surfaces.animation !== undefined) {
    return surfaces.animation;
  }
  if (mediaKind === "cad" && surfaces.cad !== undefined) {
    return surfaces.cad;
  }
  if (mediaKind === "cad_3d" && surfaces.cad_3d !== undefined) {
    return surfaces.cad_3d;
  }
  if (mediaKind === "interactive_comic" && surfaces.interactive_comic !== undefined) {
    return surfaces.interactive_comic;
  }
  if (mediaKind === "document" && surfaces.document !== undefined) {
    return surfaces.document;
  }
  return surfaces.timeline;
}
