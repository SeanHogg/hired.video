/**
 * IntakeOption — one big choice row on the kit empty state (icon tile +
 * title + hint, the mockup's 64px rows). Shared by every intake path (upload,
 * paste, use an existing resume) so a new path never re-styles the row.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface IntakeOptionProps {
  icon: ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
  /** The primary path (upload) — dashed accent tile instead of a plain card. */
  emphasis?: boolean;
}

export function IntakeOption({
  icon,
  title,
  hint,
  onClick,
  disabled,
  emphasis,
}: IntakeOptionProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex min-h-16 w-full items-center gap-3 rounded-[14px] p-3.5 text-left text-foreground transition-colors disabled:opacity-60",
        emphasis
          ? "border-[1.5px] border-dashed border-primary/30 bg-accent/40 hover:bg-accent/70"
          : "border border-border bg-card hover:bg-muted/50",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex h-10 w-10 flex-none items-center justify-center rounded-xl [&_svg]:h-5 [&_svg]:w-5",
          emphasis ? "bg-accent text-primary" : "bg-muted text-foreground",
        )}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <strong className="text-[15px] font-semibold">{title}</strong>
        <span className="truncate text-[13px] text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}
