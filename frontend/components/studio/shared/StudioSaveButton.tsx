/**
 * StudioSaveButton — shared "Save" primary button used by BOTH editors.
 *
 * Owns the visual + busy-state logic that v1's SaveButton (with its
 * pipeline-step dropdown) and v2's editor header both need:
 *   - icon swap: Sparkles → SaveIcon → Loader2 (busy)
 *   - label swap: "Save" → "Save*" (customised) → "Saving…"
 *   - click stop-propagation so the button can sit inside clickable rows
 *   - block / compact size variants
 *
 * Per the standing DRY rule: every "Save" CTA in the studio surfaces this
 * primitive. v1's SaveButton wraps it and adds the pipeline-step
 * chevron-dropdown; v2's header mounts it directly because v2's save
 * flow is a single-step `saveDraft` call.
 */
import { Loader2, Save as SaveIcon, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface StudioSaveButtonProps {
  /** True while a save / render / upload is in flight. */
  saving: boolean;
  /** Click handler — primary action. Wrapped in stopPropagation so the
   *  button can sit inside clickable rows. */
  onSave: () => void;
  /** When false (no script / no widgets), the icon flips to Sparkles to
   *  nudge "start here". Defaults to true. */
  hasContent?: boolean;
  /** When true, the label becomes "Save*" to signal that some pipeline
   *  steps are disabled. v2 doesn't have pipeline steps so it never
   *  sets this; v1's SaveButton sets it from `config.customized`. */
  customised?: boolean;
  /** `block` = full-width primary block (sidebar cluster).
   *  `compact` = inline (player row / editor header). Defaults to compact. */
  variant?: "block" | "compact";
  /** When true the right-side corners are squared off because the
   *  consumer is wrapping this in a split-button (chevron on the right).
   *  v1 SaveButton sets this; v2 leaves it false. */
  splitLeft?: boolean;
  className?: string;
  /** Optional title attribute — surfaced when the customised label is
   *  active so the user knows why it's asterisked. */
  title?: string;
}

export default function StudioSaveButton({
  saving,
  onSave,
  hasContent = true,
  customised = false,
  variant = "compact",
  splitLeft = false,
  className,
  title,
}: StudioSaveButtonProps) {
  const label = saving ? "Saving…" : customised ? "Save*" : "Save";
  const Icon = saving ? Loader2 : hasContent ? SaveIcon : Sparkles;
  const iconClass = saving
    ? "w-3.5 h-3.5 animate-spin"
    : "w-3.5 h-3.5";

  const heightClass = variant === "compact" ? "h-7" : "h-8";
  const sharedClasses = cn(
    heightClass,
    "gap-1.5 text-xs px-3",
    splitLeft ? "rounded-r-none flex-1 min-w-0" : undefined,
    className,
  );

  return (
    <Button
      size="sm"
      className={sharedClasses}
      disabled={saving}
      onClick={(e) => {
        e.stopPropagation();
        onSave();
      }}
      title={title ?? (customised ? "Some pipeline steps are disabled — open the dropdown to review" : undefined)}
    >
      <Icon className={iconClass} />
      <span className="truncate">{label}</span>
    </Button>
  );
}
