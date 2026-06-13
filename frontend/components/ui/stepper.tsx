// Shared horizontal step indicator for multi-stage flows (tool wizards,
// enrollment, etc.). Renders numbered pills + connector lines, marks
// completed steps with a check, and rings the current step so the
// "where am I / what's left" affordance is consistent instead of being
// re-implemented per flow.

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StepperStep {
  /** Stable key matched against `current`. */
  key: string;
  label: string;
}

interface StepperProps {
  steps: StepperStep[];
  /** `key` of the step the user is currently on. */
  current: string;
  className?: string;
}

export function Stepper({ steps, current, className }: StepperProps) {
  const activeIdx = steps.findIndex((s) => s.key === current);
  return (
    <div
      className={cn(
        "flex items-center gap-2 text-xs text-muted-foreground",
        className,
      )}
    >
      {steps.map((s, i) => {
        const done = i < activeIdx;
        const active = i === activeIdx;
        return (
          <div key={s.key} className="flex items-center gap-2">
            <span
              className={cn(
                "h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-semibold transition-colors",
                (done || active) && "bg-primary text-primary-foreground",
                active && "ring-2 ring-primary/30",
                !done && !active && "bg-muted",
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span
              className={cn(
                "hidden sm:inline",
                active && "font-medium text-foreground",
              )}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && <span className="w-6 h-px bg-border" />}
          </div>
        );
      })}
    </div>
  );
}
