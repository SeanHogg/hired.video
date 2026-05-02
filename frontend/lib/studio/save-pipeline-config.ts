// save-pipeline-config.ts — which save-pipeline steps run when the user
// hits Save. Default is "all on" (Save = persist + generate + render +
// upload). The split-button dropdown lets the user turn off Generate /
// Render / Upload to save edits without paying render time.
//
// SOURCE OF TRUTH: `script._meta.savePipelineDisabled` on the active
// project. The toggles travel with the project across devices and
// collaborators — until this lived in the project JSON, the
// preference was per-browser and a user who turned off "Re-generate"
// on their laptop would see it back on default the next morning.
//
// localStorage is kept only as a transient fallback for pre-script
// projects (the user toggles before clicking Run for the first time,
// so there's no script._meta to write into yet). Once a script is
// generated and saved, the project JSON wins.

import { useCallback, useSyncExternalStore } from "react";
import type { VideoScript } from "@/types/video-script";
import type { StepId } from "@/lib/studio/save-pipeline-steps";

const FALLBACK_STORAGE_KEY = "studio_save_pipeline_config";

const ALL_STEPS: readonly StepId[] = ["generate", "render", "upload"] as const;

export interface SavePipelineConfig {
  /** Steps the user wants to run on the next Save. */
  enabled: ReadonlySet<StepId>;
  /** True when at least one default-on step has been turned off. */
  customized: boolean;
}

// ─── Pure helpers — read/write disabled-step lists on a script ─────────────

function fromDisabledList(disabled: readonly StepId[] | undefined): SavePipelineConfig {
  const dis = new Set(disabled ?? []);
  const enabled = new Set(ALL_STEPS.filter((s) => !dis.has(s)));
  return {
    enabled,
    customized: enabled.size !== ALL_STEPS.length,
  };
}

/** Read the active config from a script. Pure — used by StudioLayout's
 *  handleSavePipeline (outside of React). */
export function readSavePipelineConfig(script: VideoScript | null | undefined): SavePipelineConfig {
  if (!script) return fromDisabledList(undefined);
  const list = script._meta?.savePipelineDisabled;
  return fromDisabledList(list);
}

/** Return a new script with the disabled-list updated. Pure. */
export function withSavePipelineDisabled(
  script: VideoScript,
  disabled: ReadonlySet<StepId>,
): VideoScript {
  return {
    ...script,
    _meta: {
      ...(script._meta ?? {}),
      savePipelineDisabled: ALL_STEPS.filter((s) => disabled.has(s)),
    },
  };
}

// ─── Pre-script fallback — localStorage-backed shared store ────────────────
// Only consulted when the user has no script yet (a new project before its
// first Run). Module-level so SaveButton's hook and StudioLayout's pipeline
// see the same value during that brief window.

function loadFallback(): Set<StepId> {
  if (typeof localStorage === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(FALLBACK_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as string[];
      return new Set(parsed.filter((s): s is StepId => (ALL_STEPS as readonly string[]).includes(s)));
    }
  } catch {}
  return new Set();
}

function saveFallback(disabled: ReadonlySet<StepId>) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(Array.from(disabled)));
  } catch {}
}

let fallbackDisabled: Set<StepId> = loadFallback();
const fallbackListeners = new Set<() => void>();
function fallbackSubscribe(l: () => void) { fallbackListeners.add(l); return () => fallbackListeners.delete(l); }
function fallbackEmit() { for (const l of fallbackListeners) l(); }

/** Test-only: hard-reset the fallback store. */
export function __resetFallbackStore() {
  fallbackDisabled = new Set();
  saveFallback(fallbackDisabled);
  fallbackEmit();
}

// ─── Hook ──────────────────────────────────────────────────────────────────

export interface UseSavePipelineConfig extends SavePipelineConfig {
  toggle(step: StepId): void;
  reset(): void;
}

interface HookInput {
  script: VideoScript | null | undefined;
  onScriptChange?: (next: VideoScript) => void;
}

export function useSavePipelineConfig({ script, onScriptChange }: HookInput): UseSavePipelineConfig {
  // Subscribe to fallback changes so pre-script toggles propagate. When a
  // script is loaded the snapshot ignores fallback state — useSyncExternalStore
  // still subscribes (cheap) but the read prefers the project.
  const fallbackSnapshot = useSyncExternalStore(
    fallbackSubscribe,
    () => fallbackDisabled,
    () => fallbackDisabled,
  );

  const config = script
    ? readSavePipelineConfig(script)
    : fromDisabledList(Array.from(fallbackSnapshot));

  const toggle = useCallback(
    (step: StepId) => {
      const cur = script
        ? readSavePipelineConfig(script).enabled
        : new Set(ALL_STEPS.filter((s) => !fallbackDisabled.has(s)));
      const enabled = new Set(cur);
      if (enabled.has(step)) enabled.delete(step);
      else enabled.add(step);
      // The persisted shape is the DISABLED list (defaulting to empty),
      // so invert before writing.
      const disabled = new Set(ALL_STEPS.filter((s) => !enabled.has(s)));

      if (script && onScriptChange) {
        onScriptChange(withSavePipelineDisabled(script, disabled));
        return;
      }
      // Pre-script: update the fallback store so SaveButton + the pipeline
      // both pick up the change before the script is generated.
      fallbackDisabled = disabled;
      saveFallback(disabled);
      fallbackEmit();
    },
    [script, onScriptChange],
  );

  const reset = useCallback(() => {
    if (script && onScriptChange) {
      // Reset = nothing disabled = all steps run.
      onScriptChange(withSavePipelineDisabled(script, new Set()));
      return;
    }
    fallbackDisabled = new Set();
    saveFallback(fallbackDisabled);
    fallbackEmit();
  }, [script, onScriptChange]);

  return {
    enabled: config.enabled,
    customized: config.customized,
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

/** Helper for handleSavePipeline — reads the disabled list from the script
 *  if present, otherwise the fallback store. Single source consulted by the
 *  pipeline so the rule lives in one place. */
export function getEffectiveSavePipelineConfig(script: VideoScript | null | undefined): SavePipelineConfig {
  if (script) return readSavePipelineConfig(script);
  return fromDisabledList(Array.from(fallbackDisabled));
}

// ─── Step dependencies + run-plan summary ──────────────────────────────────
// Cascading rule: Upload requires Render. Without a fresh render there is
// nothing to upload, so toggling Render off implicitly forces Upload off.
// Centralising the rule lets the dropdown UI grey out downstream switches
// and the pipeline skip downstream steps from the same source — the gate
// can never disagree with the visual.

const STEP_DEPENDENCIES: Partial<Record<StepId, StepId>> = {
  upload: "render",
};

export interface StepRunPlan {
  id: StepId;
  /** Will this step actually run on the next Save click? */
  willRun: boolean;
  /** True when the user toggled it off directly. */
  userDisabled: boolean;
  /** When non-null, this step is skipped because an upstream step is off. */
  blockedBy?: StepId;
  /** Human-readable explanation for tooltips. */
  reason: string;
}

/** Compute the per-step run plan for the next Save, applying cascade rules.
 *  Used by SaveButton to render tooltips + grey out blocked toggles, and by
 *  StudioLayout's pipeline to decide which steps to skip. */
export function describeRunPlan(config: SavePipelineConfig): StepRunPlan[] {
  return ALL_STEPS.map((id) => {
    const userDisabled = !config.enabled.has(id);
    const dep = STEP_DEPENDENCIES[id];
    // A step's dep is "satisfied" when the dep itself will run on this Save.
    const depPlan: StepRunPlan | undefined = dep
      ? {
          id: dep,
          willRun: config.enabled.has(dep),
          userDisabled: !config.enabled.has(dep),
          reason: "",
        }
      : undefined;
    const blockedBy = dep && depPlan && !depPlan.willRun ? dep : undefined;
    const willRun = !userDisabled && !blockedBy;
    let reason: string;
    if (userDisabled)        reason = "Disabled in Save options.";
    else if (blockedBy)      reason = `Skipped because ${blockedBy} is off — ${id} has nothing to act on.`;
    else                     reason = "Will run on the next Save.";
    return { id, willRun, userDisabled, blockedBy, reason };
  });
}

/** Subset of describeRunPlan that returns the set of steps to actually run.
 *  Pipeline uses this to gate its `await` calls. */
export function effectiveStepsForSave(config: SavePipelineConfig): ReadonlySet<StepId> {
  return new Set(describeRunPlan(config).filter((p) => p.willRun).map((p) => p.id));
}
