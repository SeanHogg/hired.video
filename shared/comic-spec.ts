/**
 * Wire shape for the comic AI scaffolder.
 *
 * Lives in `shared/` so both the API route + scaffolder service AND
 * the frontend `useGenerateComic` hook + `comicSpecToCanvas()` consume
 * the same types. Two-sided contracts in a typed monorepo belong in
 * `shared/` (DRY rule — never duplicate the structure on both ends).
 *
 * Consumers:
 *   - `api/src/services/comics/scaffolder.ts` returns this shape.
 *   - `api/src/routes/studio.ts` (`POST /api/studio/generate-comic`)
 *     wraps it in the standard `ok()` envelope.
 *   - `frontend/lib/studio/editor-v2/comic-spec-to-canvas.ts` reads it.
 *   - `frontend/components/studio/templates/intake/ComicIntake.tsx`
 *     indirectly through the `useGenerateComic` hook.
 */

import type { ComicGenreId, ComicPalette } from "./comic-genres.js";

/** One panel's deterministic layout inside the page. Stored on the
 *  spec so the seed path + the AI path produce visually identical
 *  canvases — the only difference between them is the words. */
export interface ComicSpecLayout {
  bg: { x: number; y: number; width: number; height: number };
  panelFrame: { x: number; y: number; width: number; height: number };
  caption: { x: number; y: number; width: number; height: number };
  character: { x: number; y: number; width: number; height: number };
  prop: { x: number; y: number; width: number; height: number };
  bubble: { x: number; y: number; width: number; height: number };
  otherBubble: { x: number; y: number; width: number; height: number };
  sfx: { x: number; y: number; width: number; height: number; rotation: number };
}

/** One page's worth of LLM-generated content + the stock assets the
 *  scaffolder picked to illustrate it. */
export interface ComicSpecPage {
  pageNumber: number;
  /** Beat label ("Hook", "Climax", …). */
  label: string;
  /** Caption-box text — the narration ribbon at the top of the panel. */
  caption: string;
  /** The protagonist's line of dialogue or thought. */
  protagonistLine: string;
  protagonistMode: "speech" | "thought";
  /** A second speaker's line. Empty string when only one speaker. */
  otherLine: string;
  /** Display label for the second speaker (used in inspector chrome). */
  otherLabel: string;
  /** Loud SFX word ("POW!", "DOKI", …). Empty string when none. */
  sfx: string;
  /** The model's visual brief — persisted for editor reference. */
  visualBrief: string;
  /** Pre-resolved stock asset URLs the editor mounts directly. */
  assets: {
    backgroundUrl: string | null;
    characterUrl: string | null;
    propUrl: string | null;
    sfxUrl: string | null;
  };
}

/** Full server-side spec the frontend hydrates into a CanvasState. */
export interface ComicSpec {
  genreId: ComicGenreId;
  title: string;
  palette: ComicPalette;
  pages: ComicSpecPage[];
  layout: ComicSpecLayout;
}

/** Canonical per-page widget layout. Single source of truth shared by
 *  the AI scaffolder (which stamps it on each `ComicSpec` it returns)
 *  AND the static template-seed path (which reuses the same layout so
 *  users see structurally identical pages whether they ran the AI or
 *  not). Adding a new slot (e.g. a corner stamp) means one entry here
 *  and pick-up by both paths automatically. */
export const COMIC_DEFAULT_LAYOUT: ComicSpecLayout = {
  bg:          { x: 0,    y: 0,    width: 1,    height: 1    },
  panelFrame:  { x: 0.02, y: 0.02, width: 0.96, height: 0.96 },
  caption:     { x: 0.04, y: 0.04, width: 0.5,  height: 0.08 },
  character:   { x: 0.08, y: 0.22, width: 0.36, height: 0.62 },
  prop:        { x: 0.66, y: 0.62, width: 0.22, height: 0.26 },
  bubble:      { x: 0.5,  y: 0.18, width: 0.45, height: 0.26 },
  otherBubble: { x: 0.08, y: 0.85, width: 0.55, height: 0.12 },
  sfx:         { x: 0.6,  y: 0.55, width: 0.22, height: 0.22, rotation: -12 },
};

/** Envelope returned by `POST /api/studio/generate-comic`. */
export interface GenerateComicResponse {
  spec: ComicSpec;
  /** Which artefact the route actually pulled from. When the user
   *  picked "auto" this tells the UI what landed ("resume" / "profile"
   *  / etc.) so the toast can be specific. */
  sourceKindResolved: "resume" | "profile" | "services" | "auto";
}
