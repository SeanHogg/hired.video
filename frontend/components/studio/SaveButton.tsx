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
 * Used in BOTH the sidebar action cluster (full-width primary block) and
 * the player's playback row (compact primary). One source of truth for
 * what "Save" means across the app.
 */

import { Loader2, Save as SaveIcon, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useExportProgress } from "@/lib/hooks/useExportProgress";
import type { StudioProjectState } from "@/types/studio";

interface SaveButtonProps {
  state: StudioProjectState;
  onSave: () => void;
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
  variant = "block",
  className,
}: SaveButtonProps) {
  const exportProgress = useExportProgress();
  const busy = BUSY_STATUSES.has(state.status);

  // Label is always the "Saving" verb during work. We surface % in the
  // popover below, not in the button text — keeps the click target stable
  // and visually quiet, with detail one glance away.
  const label = busy ? "Saving…" : "Save";

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSave();
  };

  // First-render uses Sparkles to nudge toward the primary action; once a
  // script exists we switch to a floppy. Tiny detail, big difference for
  // first-run perceived intent.
  const Icon = busy ? Loader2 : state.script ? SaveIcon : Sparkles;
  const iconClass = busy ? "w-3.5 h-3.5 animate-spin" : "w-3.5 h-3.5";

  // Auto-show popover during the export phase only. Generate / upload /
  // publish are short and don't need a percentage; export is the long one
  // where the user benefits from forward-motion feedback.
  const showProgressPopover = state.status === "exporting";
  const pct = Math.max(0, Math.min(1, exportProgress));

  const button =
    variant === "compact" ? (
      <Button
        size="sm"
        className={cn("h-7 gap-1.5 text-xs", className)}
        disabled={busy}
        onClick={handleClick}
      >
        <Icon className={iconClass} />
        {label}
      </Button>
    ) : (
      <Button
        size="sm"
        className={cn("h-8 w-full gap-1.5 text-xs", className)}
        disabled={busy}
        onClick={handleClick}
      >
        <Icon className={iconClass} />
        <span className="truncate">{label}</span>
      </Button>
    );

  return (
    <div className="relative">
      {button}
      {showProgressPopover && (
        <div
          role="status"
          aria-live="polite"
          className="absolute z-20 bottom-full right-0 mb-1.5 w-48 rounded-md border bg-popover text-popover-foreground shadow-md p-2"
        >
          <div className="flex items-center justify-between text-[11px] font-medium">
            <span>Rendering video</span>
            <span className="font-mono text-muted-foreground">{Math.round(pct * 100)}%</span>
          </div>
          <div className="mt-1.5 h-1 w-full bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-[width] duration-200"
              style={{ width: `${pct * 100}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground leading-tight">
            Hang tight — your video is being saved.
          </p>
        </div>
      )}
    </div>
  );
}
