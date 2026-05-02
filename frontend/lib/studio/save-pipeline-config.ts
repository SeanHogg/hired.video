// save-pipeline-config.ts — which save-pipeline steps run when the user
// hits Save. Default is "all on" (the user's existing mental model: Save
// = persist + generate + render + upload). The split-button dropdown
// lets the user turn off Generate / Render / Upload so they can save just
// their edits without paying the render time — useful when iterating on
// scene text/elements and the user doesn't want every keystroke save to
// trigger a 30s render.
//
// Single source of truth for SaveButton (renders the toggles, the
// "Save*" label) and StudioLayout (skips disabled steps inside
// handleSavePipeline). Persists to localStorage so the user's choice
// survives reloads — but never persists "skip render" if it would leave
// the project in an unexportable state forever, so we always re-enable
// any step that's downstream of an enabled one (consumers can request
// strict order via `enforceOrder`).

import { useCallback, useEffect, useState } from "react";
import type { StepId } from "@/lib/studio/save-pipeline-steps";

const STORAGE_KEY = "studio_save_pipeline_config";

const ALL_STEPS: readonly StepId[] = ["generate", "render", "upload"] as const;

export interface SavePipelineConfig {
  /** Steps the user wants to run on the next Save. */
  enabled: ReadonlySet<StepId>;
  /** True when at least one default-on step has been turned off. Drives the
   *  "Save*" label so the user knows their click won't run the full pipeline. */
  customized: boolean;
}

function load(): Set<StepId> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as string[];
      const valid = parsed.filter((s): s is StepId => (ALL_STEPS as readonly string[]).includes(s));
      return new Set(valid);
    }
  } catch {}
  return new Set(ALL_STEPS);
}

function save(set: Set<StepId>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)));
  } catch {}
}

export interface UseSavePipelineConfig extends SavePipelineConfig {
  toggle(step: StepId): void;
  reset(): void;
}

export function useSavePipelineConfig(): UseSavePipelineConfig {
  const [enabled, setEnabled] = useState<Set<StepId>>(() => load());

  useEffect(() => { save(enabled); }, [enabled]);

  const toggle = useCallback((step: StepId) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(step)) next.delete(step);
      else next.add(step);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setEnabled(new Set(ALL_STEPS));
  }, []);

  return {
    enabled,
    customized: enabled.size !== ALL_STEPS.length,
    toggle,
    reset,
  };
}

export const SAVE_PIPELINE_STEPS: ReadonlyArray<{ id: StepId; label: string; description: string }> = [
  {
    id: "generate",
    label: "Re-generate script",
    description: "Re-runs the AI generator. Skip if you've manually edited scenes.",
  },
  {
    id: "render",
    label: "Render video",
    description: "Encodes the canvas to MP4. Skip for fast template-only saves.",
  },
  {
    id: "upload",
    label: "Upload to library",
    description: "Pushes the rendered MP4 to R2 + flips status to Published.",
  },
];
