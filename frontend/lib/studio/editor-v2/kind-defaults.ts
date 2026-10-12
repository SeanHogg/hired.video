/**
 * Kind-aware editor defaults — single source of truth for "which panel /
 * tab should the V2 editor land on when this project opens?".
 *
 * Used by StudioEditorV2 (`pages/studio/v2/StudioEditorV2.tsx`)
 * on initial mount + once on first project-load to set:
 *   - left-rail tab (Widgets vs Actions)
 *   - whether the advanced multi-track timeline is expanded
 *   - which ActionsPanel sub-sheet is auto-armed
 *
 * Per the standing DRY rule, every consumer reads from this one record
 * rather than rolling its own `if (mediaKind === "podcast")` branch.
 *
 * The `urlCapture` signal always wins — when the chrome extension or a
 * deep-link explicitly asked for a specific recorder (?capture=webcam
 * etc.), that overrides the kind-derived default.
 */

import type { MediaKind } from "@shared/media-kinds";
import { mediaKindHasAudio, mediaKindHasVideo } from "@shared/media-kinds";
import type { RecordingActionId } from "@/lib/studio/recording-modes";

/** Subset of `ActionsPanel.ActionId` that this helper can return. The
 *  helper deliberately stays narrow — it picks the PRIMARY action for a
 *  project kind, not every possible action. ActionsPanel still surfaces
 *  the full menu to the user. */
type DefaultEditorAction = RecordingActionId | "voiceover";

interface KindDefaults {
  /** Which left-rail tab to land on. */
  leftTab: "widgets" | "actions";
  /** Whether the advanced multi-track timeline panel is open from the
   *  first paint. Audio-only projects benefit from seeing a1 + a2
   *  tracks immediately because that's the entire authoring surface. */
  advancedTimelineOpen: boolean;
  /** Which ActionsPanel sub-sheet to auto-arm. `null` = none (the user
   *  picks). */
  defaultAction: DefaultEditorAction | null;
}

/**
 * Resolve the editor's per-kind defaults. `urlCapture` (the
 * `?capture=...` deep-link from chrome extensions / "Record promo"
 * CTAs) wins over the kind-derived default — the explicit user signal
 * always beats the heuristic.
 */
export function deriveKindDefaults(
  mediaKind: MediaKind,
  urlCapture: DefaultEditorAction | null,
): KindDefaults {
  // Explicit URL signal wins — land in Actions, arm the requested
  // recorder, and open the advanced timeline so the user can scrub the
  // recording into place.
  if (urlCapture) {
    return {
      leftTab: "actions",
      advancedTimelineOpen: true,
      defaultAction: urlCapture,
    };
  }

  // Audio-only kinds (podcast, voice) — the entire authoring surface IS
  // the audio panel. Land the user there directly + expose a1/a2 tracks.
  if (mediaKindHasAudio(mediaKind) && !mediaKindHasVideo(mediaKind)) {
    return {
      leftTab: "actions",
      advancedTimelineOpen: true,
      defaultAction: "voiceover",
    };
  }

  // Video + animation default to the existing flow — Widgets tab,
  // timeline collapsed, no recorder pre-armed.
  return {
    leftTab: "widgets",
    advancedTimelineOpen: false,
    defaultAction: null,
  };
}
