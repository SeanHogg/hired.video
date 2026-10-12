// Linked card tile used by the SEO index grids (/for, /sectors, sector
// matrix, resource buckets): rounded-20 card surface, display title, muted
// body, optional mono chip and footer. The whole tile is the link target.

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

interface LinkTileProps {
  to: string;
  title: ReactNode;
  body?: ReactNode;
  /** Small label rendered top-right (e.g. a MonoChip). */
  chip?: ReactNode;
  /** Bottom row (e.g. "Open map →"). */
  footer?: ReactNode;
  /** Heading element for the title (h4 when nested under a section h3). */
  headingLevel?: "h3" | "h4";
  className?: string;
}

export function LinkTile({ to, title, body, chip, footer, headingLevel = "h3", className }: LinkTileProps) {
  const Heading = headingLevel;
  return (
    <Link
      to={to}
      className={cn(
        "group flex h-full min-h-[44px] flex-col gap-3 rounded-[20px] border border-border bg-card p-6 transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <Heading className="font-display text-xl font-bold tracking-[-0.02em] text-foreground">{title}</Heading>
        {chip}
      </div>
      {body && <div className="line-clamp-3 flex-1 text-[15px] leading-relaxed text-muted-foreground">{body}</div>}
      {footer && (
        <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-primary group-hover:underline">
          {footer}
        </span>
      )}
    </Link>
  );
}

/** Pill link used by every "related" chip strip on the SEO pages. */
export const PILL_LINK_CLASS =
  "inline-flex min-h-[44px] items-center rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:text-primary";
