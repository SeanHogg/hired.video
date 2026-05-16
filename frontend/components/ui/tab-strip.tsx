/**
 * TabStrip — the shared underline-style tab nav used by in-page
 * surfaces (panel headers, dialog sections) that need the SAME visual
 * as the top-level `<PageHeader>` tabs (Jobs / People / Resumes / …)
 * but driven by component state instead of route navigation.
 *
 * Single source of truth for the underline-tab visual — both the
 * route-based `PageHeader` and any state-based surface should style
 * through this primitive so a future visual tweak (active colour,
 * underline weight, badge style) lands in one place.
 */

import type { ComponentType, ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface TabStripItem<K extends string = string> {
  key: K;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  /** Optional badge (count / status pill). Mirrors PageHeader's contract. */
  badge?: ReactNode;
}

interface Props<K extends string = string> {
  tabs: TabStripItem<K>[];
  activeKey: K;
  onChange: (key: K) => void;
  /** Optional aria-label override (default: "Section"). */
  ariaLabel?: string;
  className?: string;
}

export default function TabStrip<K extends string = string>({
  tabs,
  activeKey,
  onChange,
  ariaLabel = "Section",
  className,
}: Props<K>) {
  return (
    <nav
      className={cn("border-b", className)}
      aria-label={ariaLabel}
      role="tablist"
    >
      <ul className="flex gap-1 -mb-px overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = tab.key === activeKey;
          return (
            <li key={tab.key}>
              <button
                type="button"
                role="tab"
                aria-selected={active}
                aria-current={active ? "page" : undefined}
                onClick={() => onChange(tab.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted",
                )}
              >
                {Icon && <Icon className="w-4 h-4" />}
                {tab.label}
                {tab.badge !== undefined &&
                  tab.badge !== null &&
                  tab.badge !== false && (
                    <Badge
                      variant="secondary"
                      className="ml-1 px-1.5 py-0 text-xs font-normal"
                    >
                      {tab.badge}
                    </Badge>
                  )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
