// Shared filter-pill primitives. Single source of truth for the pill +
// labelled-row visual used by /studio's Type / Use-for / Visibility rows,
// the new-project Wizard's template filters, and any future filter surface
// that wants the same look (per the standing DRY rule —
// `feedback_extract_on_duplication`).
//
// Self-gating: callers compose their own pill instances inside a row; the
// row is dumb to which axis lives inside it. No prop-drilled `canX`
// booleans — the consumer decides what to render.

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function FilterPillRow({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  /** Overrides the default `mb-2` spacing — pass `""` when composing the
   *  row inline with other controls (e.g. on one action-bar line). */
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className ?? "mb-2")}>
      <span className="mr-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

export function CategoryPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm transition",
        active
          ? "border-brand-purple bg-brand-purple/10 text-brand-purple"
          : "border-border bg-card text-muted-foreground hover:border-brand-purple/40 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
