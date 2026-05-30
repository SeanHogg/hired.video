/**
 * useLayoutPreset — workspace-layout dropdown for the V2 studio (#349).
 *
 * Pro NLEs ship named workspaces ("Editing", "Color", "Audio") that flip
 * which panels are visible / which tab is active so the user can switch
 * between tasks without re-laying-out the surface. Implementation
 * mirrors that: a small enum of layouts, each binding the editor's
 * existing visibility / active-tab state.
 *
 * Persisted per-user in localStorage so the chosen layout survives
 * reload. State that already lives in `usePersistentState` (e.g. the
 * collapsed-section map in V1's sidebar) is unaffected — this hook
 * controls editor-level layout, not panel-internal toggles.
 *
 * Adding a layout = one entry in `LAYOUT_PRESETS`. The consumer reads
 * `bindings` and applies them to its existing state setters.
 */
import { useCallback, useEffect, useState } from "react";

/** What an editor layout actually controls. The shape is the union of
 *  state slices the V2 editor already drives — adding a new control
 *  (e.g. `inspectorOpen`) means extending this interface and the
 *  consumer's `apply()` call. leftTab stays a string so adding new
 *  LEFT_TABS entries doesn't force a type update here; the consumer
 *  ignores unknown values. */
export interface LayoutBindings {
  leftTab: string;
  advancedTimelineOpen: boolean;
  /** Reserved for a future right-panel toggle. Today the right panel
   *  is always mounted; when it gains a visibility toggle the layout
   *  preset will already know how to flip it. */
  rightPanelOpen?: boolean;
}

export interface LayoutPreset {
  id: string;
  label: string;
  description: string;
  bindings: LayoutBindings;
}

export const LAYOUT_PRESETS: ReadonlyArray<LayoutPreset> = [
  {
    id: "editing",
    label: "Editing",
    description: "Widget palette + timeline open — default authoring view.",
    bindings: {
      leftTab: "widgets",
      advancedTimelineOpen: true,
      rightPanelOpen: true,
    },
  },
  {
    id: "color",
    label: "Color",
    description: "Inspector-focused: left panel widgets, timeline collapsed.",
    bindings: {
      leftTab: "widgets",
      advancedTimelineOpen: false,
      rightPanelOpen: true,
    },
  },
  {
    id: "audio",
    label: "Audio",
    description: "Actions panel + timeline open — voiceover + mix focus.",
    bindings: {
      leftTab: "actions",
      advancedTimelineOpen: true,
      rightPanelOpen: false,
    },
  },
  {
    id: "preview",
    label: "Preview",
    description: "Both side panels collapsed — full canvas surface.",
    bindings: {
      leftTab: "widgets",
      advancedTimelineOpen: false,
      rightPanelOpen: false,
    },
  },
];

const STORAGE_KEY = "hv.studio.layoutPreset.v1";

function readStored(): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(id: string) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Quota / private-mode — ignore.
  }
}

export interface UseLayoutPreset {
  /** Active preset id. */
  presetId: string;
  /** All available presets — drives the dropdown options. */
  presets: ReadonlyArray<LayoutPreset>;
  /** Switch presets. Calls onApply with the new bindings so the
   *  consumer can wire it through its state setters. */
  apply: (id: string) => void;
}

/**
 * @param onApply Called when the user picks a new preset. The consumer
 *                threads the bindings through its own setLeftTab /
 *                setAdvancedTimelineOpen / etc. setters. We pass an
 *                application callback rather than mutating directly
 *                because the editor's state lives in component state
 *                this hook doesn't know about.
 */
export function useLayoutPreset(
  onApply: (bindings: LayoutBindings) => void,
): UseLayoutPreset {
  const [presetId, setPresetId] = useState<string>(
    () => readStored() ?? LAYOUT_PRESETS[0].id,
  );

  useEffect(() => {
    writeStored(presetId);
  }, [presetId]);

  const apply = useCallback(
    (id: string) => {
      const preset = LAYOUT_PRESETS.find((p) => p.id === id);
      if (!preset) return;
      setPresetId(preset.id);
      onApply(preset.bindings);
    },
    [onApply],
  );

  return { presetId, presets: LAYOUT_PRESETS, apply };
}
