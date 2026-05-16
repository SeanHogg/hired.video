// save-pipeline-config.ts — which steps run for the two user-facing
// pipeline verbs:
//
//   • Save             — persist JSON + (optionally) re-generate the
//                        script. NEVER renders or uploads. The shared
//                        <StudioPlayer/> can play the saved JSON live
//                        from the canvas, so Save is enough to make a
//                        project viewable on the in-platform watch
//                        page.
//   • Publish-to-X     — render the canvas to MP4, upload to R2, then
//                        hand the resulting blob to the destination
//                        handler (LinkedIn / YouTube / Download). The
//                        render step is skipped when the baked video
//                        is still fresh per `isBakedFresh()` — clicking
//                        Publish on an unchanged project is instant.
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
import { isBakedFresh } from "@/lib/studio/baked-freshness";
import type { StudioProjectState } from "@/types/studio";

const FALLBACK_STORAGE_KEY = "studio_save_pipeline_config";

/** All atomic step ids in the system. Save uses `SAVE_STEPS`, Publish
 *  uses `PUBLISH_STEPS`; the full list is kept so the fallback-storage
 *  parser can validate legacy localStorage entries that still carry
 *  pre-split step ids. */
const ALL_STEPS: readonly StepId[] = ["generate", "render", "upload"] as const;
/** Steps that participate in the Save verb's run plan. Save NEVER
 *  renders or uploads — the live <StudioPlayer/> handles unrendered
 *  projects directly from JSON. */
const SAVE_STEPS: readonly StepId[] = ["generate"] as const;
/** Steps that participate in any Publish verb's run plan. */
const PUBLISH_STEPS: readonly StepId[] = ["render", "upload"] as const;

export interface SavePipelineConfig {
  /** Steps the user wants to run on the next Save. */
  enabled: ReadonlySet<StepId>;
  /** True when at least one default-on step has been turned off. */
  customized: boolean;
}

// ─── Pure helpers — read/write disabled-step lists on a script ─────────────

function fromDisabledList(disabled: readonly StepId[] | undefined): SavePipelineConfig {
  const dis = new Set(disabled ?? []);
  // Only Save-scope steps participate in the customised count — Publish
  // steps (`render`, `upload`) aren't user-toggleable from the Save
  // dropdown anymore, so their presence in the disabled list (legacy
  // projects from before the split) shouldn't show "Save customised".
  const enabled = new Set(SAVE_STEPS.filter((s) => !dis.has(s)));
  return {
    enabled,
    customized: enabled.size !== SAVE_STEPS.length,
  };
}

/** Read the active config from a script. Pure — used by StudioLayout's
 *  handleSavePipeline (outside of React). */
export function readSavePipelineConfig(script: VideoScript | null | undefined): SavePipelineConfig {
  if (!script) return fromDisabledList(undefined);
  const list = script._meta?.savePipelineDisabled;
  return fromDisabledList(list);
}

/** Return a new script with the disabled-list updated. Pure. Only
 *  Save-scope steps are persisted — Publish steps don't have a "skip"
 *  preference (Publish always renders+uploads when the baked video is
 *  stale and never when it's fresh). */
export function withSavePipelineDisabled(
  script: VideoScript,
  disabled: ReadonlySet<StepId>,
): VideoScript {
  return {
    ...script,
    _meta: {
      ...(script._meta ?? {}),
      savePipelineDisabled: SAVE_STEPS.filter((s) => disabled.has(s)),
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
        : new Set(SAVE_STEPS.filter((s) => !fallbackDisabled.has(s)));
      const enabled = new Set(cur);
      if (enabled.has(step)) enabled.delete(step);
      else enabled.add(step);
      // The persisted shape is the DISABLED list (defaulting to empty),
      // so invert before writing.
      const disabled = new Set(SAVE_STEPS.filter((s) => !enabled.has(s)));

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
];

/** Steps the Publish-to-* verbs run, in order. Render is skipped at
 *  runtime when `isBakedFresh()` is true (clicking Publish on an
 *  unchanged project just re-uses the existing MP4). */
export const PUBLISH_PIPELINE_STEPS: ReadonlyArray<{ id: StepId; label: string; description: string }> = [
  {
    id: "render",
    label: "Render video",
    description: "Encodes the canvas to MP4. Skipped when the existing rendered video is still in sync with the script.",
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

// ─── Run-plan summary ──────────────────────────────────────────────────────
// Save's only step (`generate`) has no upstream dep; the Publish plan
// treats render+upload as an atomic pair gated by `isBakedFresh()`, so
// the cascading-dependency table from the old "all three steps live in
// Save" world is no longer needed. Both plans now derive directly from
// their step lists.

export interface StepRunPlan {
  id: StepId;
  /** Will this step actually run on the next Save / Publish click? */
  willRun: boolean;
  /** True when the user toggled it off directly. */
  userDisabled: boolean;
  /** True when the step is auto-skipped due to project state:
   *    • Save: `generate` is skipped when a script already exists.
   *    • Publish: `render` + `upload` are skipped when `isBakedFresh()`. */
  autoSkipped?: boolean;
  /** Human-readable explanation for tooltips. */
  reason: string;
}

/** Project-state context that shapes the run plan. Per the DRY rule the
 *  rules live in `describeRunPlan` only — every consumer (SaveButton
 *  preview, StudioLayout pipeline) passes the same context so the
 *  preview can never disagree with what actually fires. */
export interface RunPlanContext {
  /** True when the project already has a generated script with scenes.
   *  When true, `generate` is auto-skipped on Save. */
  hasScript: boolean;
}

const DEFAULT_RUN_CTX: RunPlanContext = { hasScript: false };

/** Compute the per-step run plan for the next Save, applying cascade rules
 *  AND project-state auto-skips. Used by SaveButton to render tooltips +
 *  grey out blocked toggles, and by StudioLayout's pipeline to decide
 *  which steps to skip. Save's scope is `SAVE_STEPS` only — Publish
 *  steps belong to `describeRunPlanForPublish` below. */
export function describeRunPlan(
  config: SavePipelineConfig,
  ctx: RunPlanContext = DEFAULT_RUN_CTX,
): StepRunPlan[] {
  return SAVE_STEPS.map((id) => {
    const userDisabled = !config.enabled.has(id);
    // Auto-skip generate when a script already exists. Save preserves
    // user edits — re-generation is an explicit "wipe and start over"
    // action, not a side-effect of clicking Save.
    const autoSkipped = id === "generate" && ctx.hasScript;
    const willRun = !userDisabled && !autoSkipped;
    let reason: string;
    if (autoSkipped)       reason = "Skipped — a storyboard already exists. Save preserves your edits.";
    else if (userDisabled) reason = "Disabled in Save options.";
    else                   reason = "Will run on the next Save.";
    return { id, willRun, userDisabled, autoSkipped, reason };
  });
}

/** Subset of describeRunPlan that returns the set of steps to actually run.
 *  Pipeline uses this to gate its `await` calls. */
export function effectiveStepsForSave(
  config: SavePipelineConfig,
  ctx: RunPlanContext = DEFAULT_RUN_CTX,
): ReadonlySet<StepId> {
  return new Set(describeRunPlan(config, ctx).filter((p) => p.willRun).map((p) => p.id));
}

// ─── Publish run plan ──────────────────────────────────────────────────────
// Symmetric to the Save plan above but runs on the Publish-to-* verbs.
// Single source of truth for "is a re-render needed?" — both the Publish
// button labels (e.g. "Re-render & publish to YouTube") and the actual
// pipeline read this, so they cannot disagree.

export interface PublishPlanContext {
  /** Project state used for the freshness check. Only the fields read
   *  by `isBakedFresh()` are required; pass the full project state so
   *  the call site is a one-liner. */
  state: Pick<StudioProjectState, "script" | "videoUrl" | "voiceover" | "captions"> & {
    removeBranding?: boolean;
  };
}

/** Per-step plan for the next Publish click. Render + upload are an
 *  atomic pair gated by `isBakedFresh()` — when fresh, neither runs
 *  (the existing MP4 is reused); when stale, both run. There are no
 *  user-toggleable disables on the Publish path. */
export function describeRunPlanForPublish(ctx: PublishPlanContext): StepRunPlan[] {
  const fresh = isBakedFresh(ctx.state);
  const willRun = !fresh;
  const reason = fresh
    ? "Skipped — the rendered video is already in sync with the current script."
    : "Will run before the publish destination uploads the result.";
  return PUBLISH_STEPS.map((id) => ({
    id,
    willRun,
    userDisabled: false,
    autoSkipped: fresh,
    reason,
  }));
}

export function effectiveStepsForPublish(ctx: PublishPlanContext): ReadonlySet<StepId> {
  return new Set(describeRunPlanForPublish(ctx).filter((p) => p.willRun).map((p) => p.id));
}
