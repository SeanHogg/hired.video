/**
 * SaveButton — primary CTA for the active studio project.
 *
 * Self-contained: owns the busy detection (across generate / export /
 * upload / publish phases), label resolution (always "Save" / "Saving…"
 * — never exposes "Render" as a verb), the auto-showing progress popover
 * during the export phase, and stop-propagation so it can sit inside
 * clickable parents (e.g. the active row in Recent) without re-triggering
 * them.
 *
 * Reads progress from the module-level `useExportProgress()` hook rather
 * than taking a prop, so every Save button across the app shows the same
 * % automatically while the pipeline runs. The save pipeline publishes
 * via `publishExportProgress` from `handleExport`'s progress callback.
 *
 * Split-button shape: the primary "Save" sits on the left; the chevron
 * on the right opens a dropdown of step toggles. When a toggle is off
 * the primary label flips to "Save*" so users know the next click won't
 * run the full pipeline. Step state lives in `useSavePipelineConfig`,
 * which StudioLayout's pipeline also reads — single source of truth per
 * the DRY rule.
 *
 * Used in BOTH the sidebar action cluster (full-width primary block) and
 * the player's playback row (compact primary). One source of truth for
 * what "Save" means across the app.
 */

import { Check, ChevronDown, Loader2, Save as SaveIcon, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useExportProgress } from "@/lib/hooks/useExportProgress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { StudioProjectState } from "@/types/studio";
import type { VideoScript } from "@/types/video-script";
import {
  deriveSavePipelineSteps,
  type PipelineStep,
  type StepStatus,
} from "@/lib/studio/save-pipeline-steps";
import {
  useSavePipelineConfig,
  SAVE_PIPELINE_STEPS,
  describeRunPlan,
  type StepRunPlan,
} from "@/lib/studio/save-pipeline-config";

interface SaveButtonProps {
  state: StudioProjectState;
  onSave: () => void;
  /** Required for the split-button toggles to write back into
   *  `script._meta.savePipelineDisabled` so the user's preferences travel
   *  with the project. Optional only because the compact variant in the
   *  player row may not have it; if absent, toggles fall back to the
   *  shared in-memory store (pre-script projects) until the script lands. */
  onScriptChange?: (next: VideoScript) => void;
  /** "block" → full-width, taller — for the sidebar cluster.
   *  "compact" → small, inline — for the playback row. */
  variant?: "block" | "compact";
  className?: string;
}

const BUSY_STATUSES: ReadonlySet<StudioProjectState["status"]> = new Set([
  "generating",
  "exporting",
  "uploading",
  "publishing",
]);

export default function SaveButton({
  state,
  onSave,
  onScriptChange,
  variant = "block",
  className,
}: SaveButtonProps) {
  const exportProgress = useExportProgress();
  const config = useSavePipelineConfig({ script: state.script ?? null, onScriptChange });
  // Cascade-aware plan: tells us which steps will actually run after deps
  // AND project-state auto-skips (e.g. generate is skipped when a script
  // already exists). The same `describeRunPlan` powers StudioLayout's
  // pipeline so the dropdown preview cannot disagree with what fires.
  const hasScript = !!state.script?.scenes?.length;
  const runPlan = describeRunPlan(config, { hasScript });
  const busy = BUSY_STATUSES.has(state.status);

  // "Save*" signals to the user that some sub-step is disabled — clicking
  // won't run the full pipeline. Plain "Save" otherwise. Keeping the label
  // stable in busy state ("Saving…") since the dropdown can't be opened
  // anyway and we don't want a flicker between asterisked and not.
  const label = busy ? "Saving…" : (config.customized ? "Save*" : "Save");

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSave();
  };

  // First-render uses Sparkles to nudge toward the primary action; once a
  // script exists we switch to a floppy.
  const Icon = busy ? Loader2 : state.script ? SaveIcon : Sparkles;
  const iconClass = busy ? "w-3.5 h-3.5 animate-spin" : "w-3.5 h-3.5";

  // Step list is shown in the popover whenever the pipeline is running so
  // users see exactly where in the Save → Generate → Render → Upload chain
  // they are.
  const steps = deriveSavePipelineSteps({ state, exportProgress });
  const showProgressPopover = busy;
  const pct = Math.max(0, Math.min(1, exportProgress));

  // Split-button geometry: primary is left, chevron-trigger is right, and
  // they share inner-edge corners so the cluster reads as a single control.
  // The compact variant uses the same shape but with smaller padding so it
  // fits into the playback row.
  const heightClass = variant === "compact" ? "h-7" : "h-8";
  const wrapperClass = variant === "compact"
    ? cn("inline-flex", className)
    : cn("flex w-full", className);

  return (
    <div className="relative">
      <div className={wrapperClass}>
        <Button
          size="sm"
          className={cn(heightClass, "gap-1.5 text-xs rounded-r-none flex-1 min-w-0 px-3")}
          disabled={busy}
          onClick={handleClick}
          title={config.customized ? "Some pipeline steps are disabled — open the dropdown to review" : undefined}
        >
          <Icon className={iconClass} />
          <span className="truncate">{label}</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              className={cn(heightClass, "rounded-l-none border-l border-primary-foreground/20 px-1.5 shrink-0")}
              disabled={busy}
              onClick={(e) => e.stopPropagation()}
              aria-label="Save options"
              title="Save options"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-80"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Save runs these steps
            </DropdownMenuLabel>
            <p className="text-[10px] text-muted-foreground px-2 pb-1.5 leading-tight">
              These toggles only affect <span className="font-medium text-foreground">Save</span>.
              Publish actions (YouTube, LinkedIn, Profile) always render + upload.
            </p>

            <RunPlanPreview plan={runPlan} />

            <DropdownMenuSeparator className="my-1" />

            {SAVE_PIPELINE_STEPS.map((s) => {
              const stepPlan = runPlan.find((p) => p.id === s.id)!;
              // Both "blocked by upstream toggle" and "auto-skipped due
              // to project state" greyed out the same way — the dropdown
              // disables the switch and renders the plan's reason line.
              const isLocked = !!stepPlan.blockedBy || !!stepPlan.autoSkipped;
              return (
                <div
                  key={s.id}
                  className={cn(
                    "flex items-start justify-between gap-2 px-2 py-1.5 rounded transition-colors",
                    isLocked ? "opacity-60" : "hover:bg-accent/40",
                  )}
                  title={stepPlan.reason}
                >
                  <div className="flex-1 min-w-0">
                    <Label
                      className="text-xs leading-tight block cursor-pointer"
                      htmlFor={`save-toggle-${s.id}`}
                    >
                      {s.label}
                    </Label>
                    <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                      {isLocked ? stepPlan.reason : s.description}
                    </p>
                  </div>
                  <Switch
                    id={`save-toggle-${s.id}`}
                    checked={config.enabled.has(s.id)}
                    disabled={isLocked}
                    onCheckedChange={() => config.toggle(s.id)}
                  />
                </div>
              );
            })}
            {config.customized && (
              <>
                <DropdownMenuSeparator />
                <button
                  type="button"
                  className="w-full text-left px-2 py-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent/40 rounded transition-colors"
                  onClick={config.reset}
                >
                  Reset to defaults
                </button>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {showProgressPopover && (
        <div
          role="status"
          aria-live="polite"
          className="absolute z-20 bottom-full right-0 mb-1.5 w-56 rounded-md border bg-popover text-popover-foreground shadow-md p-2"
        >
          <div className="text-[11px] font-semibold mb-1.5">Saving your video</div>
          <ul className="flex flex-col gap-1">
            {steps.map((step) => (
              <StepRow key={step.id} step={step} renderPct={pct} />
            ))}
          </ul>
          <p className="mt-1.5 text-[10px] text-muted-foreground leading-tight">
            You can keep editing — we'll let you know when it's ready.
          </p>
        </div>
      )}
    </div>
  );
}

/** Concrete summary of "what will the next Save click actually do?". Self-
 *  gates on whether anything is being skipped — when every step will run
 *  it shows a single happy line; when something's off it itemises so the
 *  user can see exactly which step is being dropped and why. Per the DRY
 *  rule, the preview reads the same `describeRunPlan` output the pipeline
 *  uses, so the visual summary cannot drift from the runtime behaviour. */
function RunPlanPreview({ plan }: { plan: StepRunPlan[] }) {
  const stepLabels: Record<string, string> = {
    generate: "Generate script",
    render:   "Render video",
    upload:   "Upload to library",
  };
  const willRun = plan.filter((p) => p.willRun).map((p) => stepLabels[p.id]);
  const willSkip = plan.filter((p) => !p.willRun);

  if (willSkip.length === 0) {
    return (
      <div className="px-2 py-1.5 text-[11px] rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400">
        Save will: persist + {willRun.join(" + ")}.
      </div>
    );
  }

  return (
    <div className="px-2 py-1.5 text-[11px] rounded bg-amber-500/10 border border-amber-500/30 space-y-0.5">
      <p className="font-semibold text-amber-700 dark:text-amber-400">Save will:</p>
      <p className="text-foreground">✓ Persist your edits</p>
      {plan.map((p) => (
        <p key={p.id} className={p.willRun ? "text-foreground" : "text-muted-foreground line-through decoration-muted-foreground/40"}>
          {p.willRun ? "✓" : "—"} {stepLabels[p.id]}
          {p.blockedBy && (
            <span className="not-italic ml-1 text-[10px] text-muted-foreground">(needs {p.blockedBy})</span>
          )}
        </p>
      ))}
    </div>
  );
}

function StepRow({ step, renderPct }: { step: PipelineStep; renderPct: number }) {
  return (
    <li className="flex items-center gap-2 text-[11px]">
      <StepIcon status={step.status} />
      <span className={cn(
        "flex-1 truncate",
        step.status === "active" ? "text-foreground font-medium" :
        step.status === "done"   ? "text-muted-foreground line-through decoration-muted-foreground/40" :
        step.status === "error"  ? "text-destructive" : "text-muted-foreground",
      )}>
        {step.label}
      </span>
      {step.id === "render" && step.status === "active" && (
        <span className="font-mono text-[10px] text-muted-foreground">
          {Math.round(renderPct * 100)}%
        </span>
      )}
    </li>
  );
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "active") return <Loader2 className="w-3 h-3 animate-spin text-primary" />;
  if (status === "done")   return <Check    className="w-3 h-3 text-emerald-500" />;
  if (status === "error")  return <X        className="w-3 h-3 text-destructive" />;
  return <span className="w-3 h-3 rounded-full border border-muted-foreground/40" />;
}
