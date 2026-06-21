/**
 * ReactionPicker — the ONE professional-reaction control, reused for both
 * feed posts and comments (DRY: the reaction vocabulary, the quick-tap
 * default, the flyout, and the selected-state styling live here, not copied
 * into each card).
 *
 * Interaction model (LinkedIn-style, works on mouse + touch):
 *   • Click / tap the trigger → quick toggle: react with the default "Like"
 *     when you have no reaction, or remove your reaction when you do.
 *   • Hover (desktop) or long-press (touch) the trigger → a flyout of the
 *     full professional set appears; picking one sets/changes your reaction.
 *
 * The reaction set + ordering + colours come from shared/feed-reactions.ts,
 * so the picker can never drift from the backend's validation or the
 * trending-rank weights.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import {
  FEED_REACTIONS,
  DEFAULT_REACTION,
  reactionDef,
  type ReactionCount,
} from "@shared/feed-reactions";
import { cn } from "@/lib/utils";

interface ReactionPickerProps {
  /** The viewer's own reaction type, or null/undefined when they haven't reacted. */
  currentReaction?: string | null;
  /** Total reactions across all types (drives the count label). */
  totalCount: number;
  /** Set or change the viewer's reaction. */
  onReact: (reactionType: string) => void;
  /** Remove the viewer's reaction. */
  onRemove: () => void;
  disabled?: boolean;
  /** `sm` for the denser comment row; `default` for post action bars. */
  size?: "sm" | "default";
  /** Show the trailing total count on the trigger. Off when a separate
   *  summary line already shows the count (post action bar). */
  showCount?: boolean;
}

const LONG_PRESS_MS = 350;

export default function ReactionPicker({
  currentReaction,
  totalCount,
  onReact,
  onRemove,
  disabled = false,
  size = "default",
  showCount = true,
}: ReactionPickerProps) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const clearTimers = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };
  useEffect(() => () => clearTimers(), []);

  // Close when tapping/clicking outside (touch flyout dismissal).
  useEffect(() => {
    if (!open) return;
    const onDocPointer = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDocPointer);
    return () => document.removeEventListener("pointerdown", onDocPointer);
  }, [open]);

  const openFlyout = useCallback(() => {
    if (disabled) return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  }, [disabled]);

  const scheduleClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 180);
  }, []);

  const handleQuickToggle = useCallback(() => {
    if (disabled) return;
    if (currentReaction) onRemove();
    else onReact(DEFAULT_REACTION);
  }, [disabled, currentReaction, onRemove, onReact]);

  const handlePick = useCallback(
    (type: string) => {
      setOpen(false);
      if (disabled) return;
      // Tapping the reaction you already have toggles it off.
      if (currentReaction === type) onRemove();
      else onReact(type);
    },
    [disabled, currentReaction, onRemove, onReact],
  );

  const active = currentReaction ? reactionDef(currentReaction) : null;
  const isSm = size === "sm";

  return (
    <div
      ref={wrapRef}
      className="relative inline-flex"
      onMouseEnter={openFlyout}
      onMouseLeave={scheduleClose}
    >
      {/* Flyout — the full professional set. */}
      {open && (
        <div
          className="absolute bottom-full left-0 mb-2 z-30 flex items-center gap-1 rounded-full border bg-popover px-2 py-1.5 shadow-lg"
          onMouseEnter={openFlyout}
          onMouseLeave={scheduleClose}
        >
          {FEED_REACTIONS.map((r) => (
            <button
              key={r.type}
              type="button"
              aria-label={r.label}
              title={r.label}
              onClick={() => handlePick(r.type)}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full text-xl transition-transform hover:scale-125 hover:bg-muted",
                currentReaction === r.type && "bg-muted ring-2 ring-primary/40",
              )}
            >
              <span aria-hidden>{r.emoji}</span>
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        disabled={disabled}
        onClick={handleQuickToggle}
        onPointerDown={() => {
          if (longPressTimer.current) clearTimeout(longPressTimer.current);
          longPressTimer.current = setTimeout(openFlyout, LONG_PRESS_MS);
        }}
        onPointerUp={() => {
          if (longPressTimer.current) clearTimeout(longPressTimer.current);
        }}
        onPointerLeave={() => {
          if (longPressTimer.current) clearTimeout(longPressTimer.current);
        }}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md font-medium transition-colors disabled:opacity-50",
          isSm ? "px-1.5 py-0.5 text-xs" : "px-2 py-1 text-sm",
          active
            ? cn(active.colorClass, "hover:bg-muted")
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <span className={isSm ? "text-sm" : "text-base"} aria-hidden>
          {active ? active.emoji : "👍"}
        </span>
        <span>{active ? active.label : "React"}</span>
        {showCount && totalCount > 0 && (
          <span className="tabular-nums text-muted-foreground">{totalCount}</span>
        )}
      </button>
    </div>
  );
}

/**
 * ReactionSummaryChips — the read-only "who reacted" glyph cluster (top
 * emojis + total). Shown next to the count on cards so the breakdown is
 * visible without opening the picker. Self-gates: renders nothing when there
 * are no reactions.
 */
export function ReactionSummaryChips({
  summary = [],
  totalCount,
  className,
}: {
  summary?: ReactionCount[];
  totalCount: number;
  className?: string;
}) {
  if (!summary.length || totalCount <= 0) return null;
  const top = [...summary].sort((a, b) => b.count - a.count).slice(0, 3);
  return (
    <div className={cn("flex items-center gap-1 text-xs text-muted-foreground", className)}>
      <span className="flex -space-x-1" aria-hidden>
        {top.map((b) => (
          <span
            key={b.type}
            className="flex h-4 w-4 items-center justify-center rounded-full bg-background text-[11px] ring-1 ring-background"
            title={reactionDef(b.type).label}
          >
            {reactionDef(b.type).emoji}
          </span>
        ))}
      </span>
      <span className="tabular-nums">{totalCount}</span>
    </div>
  );
}
