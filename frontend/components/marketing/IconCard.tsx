// Bordered feature card with an accent icon tile, display title and muted
// body — the repeated "value / feature / benefit" tile on marketing pages.
// Transparent surface so it reads on both `page` and `card` bands.

import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface IconCardProps {
  icon: ComponentType<{ className?: string }>;
  title: ReactNode;
  body?: ReactNode;
  /** Small label above the title (e.g. a MonoChip). */
  chip?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export default function IconCard({ icon: Icon, title, body, chip, children, className }: IconCardProps) {
  return (
    <div className={cn("flex flex-col gap-3 rounded-[20px] border border-border p-6", className)}>
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent text-primary" aria-hidden="true">
        <Icon className="h-6 w-6" />
      </span>
      {chip}
      <h3 className="font-display text-[22px] font-bold leading-tight tracking-[-0.02em] text-foreground">{title}</h3>
      {body && <p className="text-[15px] leading-relaxed text-muted-foreground">{body}</p>}
      {children}
    </div>
  );
}
