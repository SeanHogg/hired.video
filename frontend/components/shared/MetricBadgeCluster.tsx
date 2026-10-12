/**
 * MetricBadgeCluster — generic chip cluster for "the headline numbers
 * on this artifact". Visual language lifted from <ResumeScoreBadges>
 * (Overall / ATS / KW / Fmt / Cnt / Imp) so the resume version of the
 * drawer matches the rest visually. Returns null when nothing has been
 * computed yet (DRY rule: shared components decide their own visibility).
 *
 * `tone` lets callers express semantic intent without leaking concrete
 * color classes — the cluster maps it to the same palette every other
 * surface uses.
 */

import { cn } from "@/lib/utils";

export interface MetricBadge {
  /** Short label shown in the chip ("ATS", "Views", "CTR"). */
  label: string;
  /** Long-form label for the tooltip / accessibility name. */
  fullLabel?: string;
  /** Formatted display value. Pass `null`/`undefined` to skip rendering
   *  this chip — saves the parent from filtering. */
  value: string | number | null | undefined;
  /** Semantic tone — picks the chip's color treatment. */
  tone?: "neutral" | "positive" | "negative" | "warn" | "info";
  onClick?: () => void;
}

interface Props {
  badges: MetricBadge[];
  size?: "sm" | "md";
  className?: string;
}

const TONE_CLASSES: Record<NonNullable<MetricBadge["tone"]>, string> = {
  neutral: "bg-muted text-foreground/80",
  positive: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  negative: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  warn: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  info: "bg-accent text-accent-foreground",
};

export default function MetricBadgeCluster({
  badges,
  size = "sm",
  className,
}: Props) {
  const visible = badges.filter(
    (b) => b.value !== null && b.value !== undefined && b.value !== "",
  );
  if (visible.length === 0) return null;

  const sizeCls =
    size === "md"
      ? "text-sm px-2.5 py-1"
      : "text-xs px-2 py-0.5";

  return (
    <span
      className={cn("inline-flex items-center gap-1 flex-wrap", className)}
    >
      {visible.map((b) => {
        const tone = b.tone ?? "neutral";
        const Tag = b.onClick ? "button" : "span";
        return (
          <Tag
            key={b.label}
            type={b.onClick ? "button" : undefined}
            onClick={b.onClick}
            title={b.fullLabel ?? b.label}
            aria-label={b.fullLabel ?? b.label}
            className={cn(
              "inline-flex items-center gap-1 rounded-full font-medium",
              sizeCls,
              TONE_CLASSES[tone],
              b.onClick && "hover:opacity-80 cursor-pointer",
            )}
          >
            <span className="opacity-70">{b.label}</span>
            <span className="tabular-nums">{b.value}</span>
          </Tag>
        );
      })}
    </span>
  );
}
