/**
 * One finding pinned on the page: a small flag after the line it criticises
 * ("Roast · rewrite", "ATS", "+ add email"). Clicking it selects the line, so
 * the "This line" inspector opens with the finding (FindingCard) — the page
 * itself only carries the flag (A2 board). Presentational: the action comes
 * from finding-annotations.tsx. Built from spans so it can sit inside a page
 * paragraph or bullet.
 */
import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { FindingSeverity, PageFinding } from "@/lib/build/page-findings";

export const FINDING_TONE: Record<FindingSeverity, string> = {
  critical: "bg-destructive/10 text-destructive dark:bg-destructive/20",
  important: "bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  minor: "bg-accent text-accent-foreground",
};

interface FindingFlagProps {
  finding: PageFinding;
  /** Its line is the one the inspector shows. */
  selected: boolean;
  onSelect: () => void;
}

export default function FindingFlag({ finding, selected, onSelect }: FindingFlagProps) {
  const { t } = useTranslation();
  const label = t(finding.labelKey);
  // The flag sits inside page elements that toggle on click (a timeline
  // entry opens / closes), so its own clicks stop here.
  const onClick = (e: MouseEvent) => {
    e.stopPropagation();
    onSelect();
  };

  return (
    <button
      type="button"
      aria-pressed={finding.kind === "missing" ? undefined : selected}
      aria-label={t("build.findings.cardLabel", { label })}
      onClick={onClick}
      className="ml-1.5 inline-flex min-h-11 items-center align-middle font-sans focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0 sm:rounded"
    >
      <span
        className={cn(
          "whitespace-nowrap rounded px-1.5 py-0.5 text-[10.5px] font-semibold leading-none",
          finding.kind === "missing" && "border border-dashed border-current",
          selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
          FINDING_TONE[finding.severity],
        )}
      >
        {label}
      </span>
    </button>
  );
}
