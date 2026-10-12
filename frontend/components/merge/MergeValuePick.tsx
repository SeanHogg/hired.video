/**
 * Pick one of two values for a field the two résumés disagree on — a basics
 * conflict (headline, email…) or a matched entry's field (end date…). The
 * target (the résumé being merged into) is the default.
 */
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export type MergeSide = "source" | "target";

interface MergeValuePickProps {
  /** What the field is ("Headline"), already translated. */
  label?: string;
  sourceValue: string;
  targetValue: string;
  /** Names of the two sides ("FractionalCTO.pdf", "Master"). */
  sourceName: string;
  targetName: string;
  value: MergeSide | undefined;
  onChange: (side: MergeSide) => void;
}

export default function MergeValuePick({
  label,
  sourceValue,
  targetValue,
  sourceName,
  targetName,
  value,
  onChange,
}: MergeValuePickProps) {
  const { t } = useTranslation();
  const picked = value ?? "target";
  const option = (side: MergeSide, text: string, from: string) => (
    <button
      type="button"
      aria-pressed={picked === side}
      onClick={(e) => {
        e.stopPropagation();
        onChange(side);
      }}
      className={cn(
        "flex min-h-11 min-w-0 flex-1 basis-[200px] flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
        picked === side ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted",
      )}
    >
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {picked === side ? t("merge.pick.chosen", { from }) : from}
      </span>
      <span className="w-full break-words text-foreground">{text || <em className="text-muted-foreground">{t("merge.pick.empty")}</em>}</span>
    </button>
  );
  return (
    <div className="flex flex-col gap-1.5">
      {label && <p className="text-xs font-medium text-foreground">{label}</p>}
      <div className="flex flex-wrap gap-2">
        {option("target", targetValue, t("merge.pick.keep", { name: targetName }))}
        {option("source", sourceValue, sourceName)}
      </div>
    </div>
  );
}
