// Presentational title block for every tool surface: accent icon tile,
// mono chip row, display h1, muted lede, and an optional action slot on
// the right. ToolPageHeader composes it for /tools/* pages; tool pages
// that own their own shell (AI Coach, Interview Practice, Pivot
// Explorer, tool detail) render it directly so every tool reads the same.

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  /** Icon element (lucide). Colour + size are normalised by the tile. */
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** MonoChips / badges shown above the title (category, tier, …). */
  chips?: ReactNode;
  /** Right-aligned actions (history, primary CTA). */
  actions?: ReactNode;
  className?: string;
}

/** Accent icon tile — exported so cards/lists reuse the exact same tile. */
export function ToolIconTile({
  children,
  size = "lg",
  className,
}: {
  children: ReactNode;
  size?: "md" | "lg";
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl bg-accent text-primary [&_svg]:text-primary",
        size === "lg"
          ? "h-12 w-12 [&_svg]:h-6 [&_svg]:w-6"
          : "h-11 w-11 [&_svg]:h-[22px] [&_svg]:w-[22px]",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function ToolTitleBlock({ icon, title, description, chips, actions, className }: Props) {
  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-5", className)}>
      <div className="flex min-w-0 flex-[1_1_420px] items-start gap-4">
        <ToolIconTile>{icon}</ToolIconTile>
        <div className="flex min-w-0 flex-col gap-2.5">
          {chips && <div className="flex flex-wrap items-center gap-1.5">{chips}</div>}
          <h1 className="font-display text-[clamp(30px,4vw,48px)] font-bold leading-[1.02] tracking-[-0.03em] text-foreground">
            {title}
          </h1>
          {description && (
            <div className="max-w-[40em] text-base leading-relaxed text-muted-foreground sm:text-[17px]">
              {description}
            </div>
          )}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
