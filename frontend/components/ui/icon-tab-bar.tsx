/**
 * IconTabBar — the icon-only tab bar for narrow side panels (the workspace
 * panel, the Studio editor's left panel). Equal-width cells with a primary
 * underline on the active one. The label is never dropped: it is each tab's
 * accessible name and shows as a tooltip on hover/focus, so icon-only stays
 * legible for keyboard and screen-reader users.
 *
 * Panels keep owning their tab state and bodies; this owns only the bar.
 * Bodies point back at their tab via `iconTabId(idPrefix, key)`.
 *
 * `cellWidthPx` pins each cell's width, so a tab appended later (the
 * workspace's Advanced tools) never moves the ones before it. A `disabled`
 * tab greys out instead of hiding (its `disabledHint` is the tooltip).
 * `variant="bar"` is the phone bottom bar (equal cells across the width:
 * icon over a short label, the active cell marked on top); `variant="rail"`
 * is the workspace's vertical tool rail (fixed 56px rows, icon over a
 * visible label, appended tabs go BELOW the others).
 */
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export interface IconTab<K extends string = string> {
  key: K;
  /** Accessible name + tooltip (already translated). */
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Greyed out: nothing for this tab here (it stays in its place). */
  disabled?: boolean;
  /** Tooltip while disabled (already translated). */
  disabledHint?: string;
}

interface IconTabBarProps<K extends string = string> {
  tabs: readonly IconTab<K>[];
  /** Selected tab, or null when none is (e.g. an editor has taken the body over). */
  active: K | null;
  onChange: (key: K) => void;
  /** Accessible name of the tab list (already translated). */
  ariaLabel: string;
  /** Prefix for tab / panel element ids — must be unique on the page. */
  idPrefix: string;
  className?: string;
  /** Fixed cell width; omitted → cells share the width equally. */
  cellWidthPx?: number;
  variant?: "tabs" | "bar" | "rail";
}

export const iconTabId = (idPrefix: string, key: string) => `${idPrefix}-tab-${key}`;
export const iconTabPanelId = (idPrefix: string, key: string) => `${idPrefix}-panel-${key}`;

export default function IconTabBar<K extends string = string>({
  tabs,
  active,
  onChange,
  ariaLabel,
  idPrefix,
  className,
  cellWidthPx,
  variant = "tabs",
}: IconTabBarProps<K>) {
  const bar = variant === "bar";
  const rail = variant === "rail";
  return (
    <TooltipProvider delayDuration={300}>
      <div
        role="tablist"
        aria-label={ariaLabel}
        aria-orientation={rail ? "vertical" : "horizontal"}
        className={cn(
          "grid shrink-0 border-border",
          rail ? "auto-rows-[56px] content-start gap-1 border-r px-1.5 py-2" : bar ? "border-t" : "border-b",
          className,
        )}
        style={
          rail
            ? undefined
            : {
                gridTemplateColumns: cellWidthPx
                  ? `repeat(${Math.max(tabs.length, 1)}, ${cellWidthPx}px)`
                  : `repeat(${Math.max(tabs.length, 1)}, minmax(0, 1fr))`,
              }
        }
      >
        {tabs.map(({ key, label, icon: Icon, disabled, disabledHint }) => {
          const selected = key === active && !disabled;
          return (
            <Tooltip key={key}>
              <TooltipTrigger asChild>
                <button
                  id={iconTabId(idPrefix, key)}
                  type="button"
                  role="tab"
                  aria-label={label}
                  aria-selected={selected}
                  aria-controls={iconTabPanelId(idPrefix, key)}
                  aria-disabled={disabled || undefined}
                  onClick={() => {
                    if (!disabled) onChange(key);
                  }}
                  className={cn(
                    "flex min-h-11 items-center justify-center transition-colors",
                    (bar || rail) && "min-h-14 flex-col gap-1 text-[10.5px] font-semibold",
                    rail && "rounded-lg",
                    disabled
                      ? "cursor-not-allowed text-muted-foreground/40"
                      : selected
                        ? cn(
                            "text-foreground",
                            rail
                              ? "bg-primary/10 text-primary"
                              : bar
                                ? "shadow-[inset_0_2px_0_hsl(var(--primary))]"
                                : "shadow-[inset_0_-2px_0_hsl(var(--primary))]",
                          )
                        : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className={rail ? "h-4 w-4" : "h-5 w-5"} aria-hidden="true" />
                  {(bar || rail) && <span className="max-w-full truncate px-0.5">{label}</span>}
                </button>
              </TooltipTrigger>
              <TooltipContent side={bar ? "top" : rail ? "right" : "bottom"}>{disabled && disabledHint ? disabledHint : label}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
