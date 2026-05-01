/**
 * SaveButton — primary CTA for the active studio project.
 *
 * Encapsulates the save-pipeline UI logic: busy detection across the
 * generate / export / upload / publish phases, label handling (always
 * just "Save" — internally the click runs save → generate → render, but
 * that's an implementation detail the user shouldn't have to track), and
 * stop-propagation so the button can sit inside clickable parents (e.g.
 * the active row in the Recent list) without re-triggering them.
 *
 * Used in BOTH the sidebar action cluster (full-width primary block) and
 * the player's playback row (compact primary). One source of truth for
 * what "Save" means across the app.
 */

import { Loader2, Save as SaveIcon, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { StudioProjectState } from "@/types/studio";

interface SaveButtonProps {
  state: StudioProjectState;
  onSave: () => void;
  /** Render percentage on the label during the exporting phase so the user
   *  sees forward motion on long renders. We still call the verb "Saving"
   *  rather than "Rendering" — progress visible, mechanism abstracted. */
  exportProgress?: number;
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
  exportProgress,
  variant = "block",
  className,
}: SaveButtonProps) {
  const busy = BUSY_STATUSES.has(state.status);

  // Label always uses the "Saving" verb — we don't expose render mechanics
  // to the user — but appends a percentage during the exporting phase so
  // the user has feedback during long renders.
  const label = (() => {
    if (!busy) return "Save";
    if (state.status === "exporting" && typeof exportProgress === "number") {
      return `Saving… ${Math.round(exportProgress * 100)}%`;
    }
    return "Saving…";
  })();

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSave();
  };

  // First-render uses the Sparkles icon to nudge the user toward the
  // primary action when no script exists yet; subsequent saves show the
  // floppy. Tiny detail, big difference for first-run perceived intent.
  const Icon = busy ? Loader2 : state.script ? SaveIcon : Sparkles;
  const iconClass = busy ? "w-3.5 h-3.5 animate-spin" : "w-3.5 h-3.5";

  if (variant === "compact") {
    return (
      <Button
        size="sm"
        className={cn("h-7 gap-1.5 text-xs", className)}
        disabled={busy}
        onClick={handleClick}
      >
        <Icon className={iconClass} />
        {label}
      </Button>
    );
  }

  return (
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
}
