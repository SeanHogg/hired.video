/**
 * `ComicSpec` (server scaffolder output) → `CanvasState` (editor input).
 *
 * Thin adapter — the per-page widget assembly lives in
 * `buildComicPage()`. This file only translates the spec's per-page
 * fields into the `ComicPageContent` shape the assembler accepts.
 * Visual layout / palette / widget defaults are NOT decided here.
 *
 * Single consumer: `useCreateStudioDraft({ kind: "comicSpec" })`. The
 * draft hook calls `POST /api/studio/generate-comic`, then runs the
 * spec through this function to mint a comic project.
 */

import type { ComicSpec } from "@shared/comic-spec";
import { emptyCanvasState, type CanvasState } from "./canvas-state";
import { buildComicPage, type ComicPageContent } from "./comic-page-builder";

export function comicSpecToCanvas(spec: ComicSpec): CanvasState {
  return {
    ...emptyCanvasState({ width: 1080, height: 1920, fps: 24 }),
    scenes: spec.pages.map((page) =>
      buildComicPage(
        {
          label: page.label,
          caption: page.caption || page.label.toUpperCase(),
          protagonistLine: page.protagonistLine,
          protagonistMode: page.protagonistMode,
          otherLine: page.otherLine,
          sfx: page.sfx,
          backgroundUrl: page.assets.backgroundUrl,
          characterUrl: page.assets.characterUrl,
          // SFX assets aren't drawn as separate widgets — the SFX
          // burst's silhouette is the burst widget's own SVG shape.
          // Skip the prop slot when SFX is present to avoid visual
          // clutter (mirror of the seed path's prop-on-odd-pages rule).
          propUrl: page.sfx ? null : page.assets.propUrl,
        } satisfies ComicPageContent,
        spec.palette,
        spec.layout,
      ),
    ),
  };
}
