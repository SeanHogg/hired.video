/** A 0–100 score as a ring: green ≥ 75, amber ≥ 50, red below. */
import { cn } from "@/lib/utils";

const RADIUS = 26;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function toneClass(score: number): string {
  if (score >= 75) return "text-diff-added-foreground";
  if (score >= 50) return "text-review-foreground";
  return "text-destructive";
}

export default function ScoreRing({ score, label, className }: { score: number; label: string; className?: string }) {
  const value = Math.max(0, Math.min(100, Math.round(score)));
  return (
    <div role="img" aria-label={label} className={cn("relative h-16 w-16 flex-none", className)}>
      <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="32" cy="32" r={RADIUS} fill="none" strokeWidth="6" className="stroke-muted" />
        <circle
          cx="32"
          cy="32"
          r={RADIUS}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          stroke="currentColor"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - value / 100)}
          className={cn("transition-[stroke-dashoffset] duration-500", toneClass(value))}
        />
      </svg>
      <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center text-lg font-semibold text-foreground">
        {value}
      </span>
    </div>
  );
}
