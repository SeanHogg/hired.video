// Feature / benefit cards for the signed-out pitch on app pages (/jobs,
// /people, /tasks, /settings, /resumes, /dashboard). Same anatomy as the
// landing cards: accent icon tile → display title → muted body → optional
// checklist. Auto-fit grid so it wraps cleanly down to 360px.

import type { ComponentType } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FeatureCardItem {
  key: string;
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  bullets?: string[];
}

interface FeatureCardGridProps {
  items: FeatureCardItem[];
  /** Minimum card width before the grid wraps (px). */
  minCardWidth?: 220 | 260 | 300;
  className?: string;
}

const MIN_COLS: Record<NonNullable<FeatureCardGridProps["minCardWidth"]>, string> = {
  220: "grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))]",
  260: "grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))]",
  300: "grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))]",
};

export function FeatureCardGrid({ items, minCardWidth = 260, className }: FeatureCardGridProps) {
  return (
    <ul className={cn("grid gap-5", MIN_COLS[minCardWidth], className)}>
      {items.map(({ key, icon: Icon, title, description, bullets }) => (
        <li key={key} className="flex flex-col gap-3 rounded-[20px] border border-border bg-card p-6">
          {Icon && (
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-primary">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
          )}
          <h3 className="font-display text-xl font-bold tracking-[-0.02em] text-foreground">{title}</h3>
          {description && <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>}
          {bullets && bullets.length > 0 && (
            <ul className="mt-1 flex flex-col gap-2 text-sm text-foreground">
              {bullets.map((b) => (
                <li key={b} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-green-text" aria-hidden="true" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

export default FeatureCardGrid;
