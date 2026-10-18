/**
 * Theme application over a whole `CanvasState`. Part of the canvas-state
 * model; re-exported by `../canvas-state`.
 */

import {
  resolveLinkedContentColors,
  stampLinkedContentColors,
  stampEngagementAssetColors,
} from "../linked-content";
import type { CanvasState } from "./scene-types";

/**
 * Apply a visual theme to the entire canvas state. Recolours every scene
 * background to the theme's primary, and recolours every text/heading
 * widget to the theme's accent for contrast. Single source of truth so
 * the v2 editor's "Pick theme" action and any other consumer (e.g. a
 * future "apply on import" flow) produce identical state.
 */
export function applyThemeToState(
  state: CanvasState,
  theme: { id: string; colors: [string, string, string] },
): CanvasState {
  const [themePrimary, themeAccent, themeSurface] = theme.colors;
  // #582 — `state.colorPalette` (4-chip custom palette
  // [primary, accent, surface, neutral]) is a real override layer. When
  // the user has set one, its entries take precedence over the theme
  // triple so reapplying a theme doesn't clobber the user's palette
  // choices. The triple is only the fallback for unset chip slots.
  const palette = state.colorPalette;
  const primary = palette?.[0] ?? themePrimary;
  const accent = palette?.[1] ?? themeAccent;
  const surface = palette?.[2] ?? themeSurface;
  // Resolve linked-content card colours against the same theme so a
  // resume / job card already on the canvas re-themes when the user
  // picks a new visual theme. Single source of truth lives in
  // `resolveLinkedContentColors` so insert-time stamping and re-theme
  // stamping can't drift.
  const themedState: CanvasState = {
    ...state,
    themeId: theme.id,
  };
  const linkedColors = resolveLinkedContentColors(themedState);
  return {
    ...themedState,
    scenes: state.scenes.map((scene) => ({
      ...scene,
      backgroundColor: primary,
      widgets: scene.widgets.map((w) => {
        if (w.params.kind === "text" || w.params.kind === "heading") {
          return {
            ...w,
            params: {
              kind: w.params.kind,
              data: {
                ...w.params.data,
                color: w.params.kind === "heading" ? accent : surface,
              },
            },
          };
        }
        if (w.params.kind === "linked-content") {
          return {
            ...w,
            params: {
              kind: "linked-content",
              data: stampLinkedContentColors(w.params.data, linkedColors),
            },
          };
        }
        // #1587 — re-stamp engagement-asset cards on theme switch, same
        // as linked-content, so a theme change restyles forms/CTAs too.
        if (w.params.kind === "engagement-asset") {
          return {
            ...w,
            params: {
              kind: "engagement-asset",
              data: stampEngagementAssetColors(w.params.data, themedState),
            },
          };
        }
        return w;
      }),
    })),
  };
}
