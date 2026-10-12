// Hero for content index pages (blog, articles, help, tutorials, search,
// learning). Mono eyebrow chip → display h1 → muted lede → optional action
// row, inside the 1200px column on the page background. `size="index"` uses
// the slightly smaller /templates title scale for browse-first pages.

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { EYEBROW_CHIP, INDEX_COLUMN } from "./content-ui";

interface ContentHeroProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  /** CTA row (primary button + text link) or a search field. */
  children?: ReactNode;
  /** Right-hand slot on wide screens (e.g. a segmented switch). */
  aside?: ReactNode;
  size?: "marketing" | "index";
  className?: string;
}

const TITLE_CLASS = {
  marketing: "text-[clamp(42px,5.6vw,72px)] leading-[0.98] tracking-[-0.035em]",
  index: "text-[clamp(36px,4.4vw,56px)] leading-none tracking-[-0.03em]",
} as const;

export default function ContentHero({
  eyebrow,
  title,
  lede,
  children,
  aside,
  size = "index",
  className,
}: ContentHeroProps) {
  return (
    <header className={cn(INDEX_COLUMN, "pb-8 pt-10 sm:pt-12", className)}>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex max-w-[44em] flex-col gap-4">
          {eyebrow && <span className={EYEBROW_CHIP}>{eyebrow}</span>}
          <h1 className={cn("font-display font-bold text-foreground", TITLE_CLASS[size])}>{title}</h1>
          {lede && <p className="max-w-[36em] text-lg leading-relaxed text-muted-foreground">{lede}</p>}
          {children && <div className="flex flex-wrap items-center gap-3 pt-1">{children}</div>}
        </div>
        {aside}
      </div>
    </header>
  );
}
