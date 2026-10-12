/** The compare panel's header: title, "3 of N" change navigation, Scroll
 *  together, Only changed sections, Compare with, Revert all, Keep changes
 *  and ✕ (Esc closes too). Wraps on narrow screens. */
import { useId } from "react";
import { useTranslation } from "react-i18next";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { BuildReview } from "@/lib/build/review/use-build-review";
import type { CompareWith, useCompareSource } from "@/lib/build/review/use-compare-source";

export interface CompareToggles {
  together: boolean;
  onlyChanged: boolean;
}

interface CompareHeaderProps {
  review: BuildReview;
  source: ReturnType<typeof useCompareSource>;
  toggles: CompareToggles;
  onToggles: (t: CompareToggles) => void;
}

const encode = (c: CompareWith) => (c.kind === "version" ? `version:${c.id}` : c.kind);
const decode = (v: string): CompareWith =>
  v.startsWith("version:") ? { kind: "version", id: v.slice("version:".length) } : ({ kind: v } as CompareWith);

export default function CompareHeader({ review, source, toggles, onToggles }: CompareHeaderProps) {
  const { t } = useTranslation();
  const selectId = useId();
  const active = review.active;
  const total = active?.changes.length ?? 0;
  const canRevert = !!active && active.kind !== "compare" && total > 0;

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-3 sm:px-5">
      <div className="flex min-w-0 flex-col">
        <Dialog.Title className="text-base font-semibold text-foreground">{t("review.compare.title")}</Dialog.Title>
        {active?.subject && <span className="truncate text-[12.5px] text-muted-foreground">{active.subject}</span>}
      </div>
      <span className="flex-1" />
      {total > 0 && (
        <div className="flex items-center gap-1 text-[13.5px] text-foreground">
          <Button variant="outline" size="icon" className="h-11 w-11 sm:h-9 sm:w-9" aria-label={t("review.change.previous")} onClick={() => review.select(review.selected - 1)}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <span className="min-w-[96px] text-center" aria-live="polite">
            {t("review.compare.position", { n: review.selected + 1, total })}
          </span>
          <Button variant="outline" size="icon" className="h-11 w-11 sm:h-9 sm:w-9" aria-label={t("review.change.next")} onClick={() => review.select(review.selected + 1)}>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      )}
      <label className="flex min-h-11 items-center gap-2 text-[13px] text-foreground sm:min-h-0">
        <Checkbox checked={toggles.together} onCheckedChange={(v) => onToggles({ ...toggles, together: v === true })} />
        {t("review.compare.together")}
      </label>
      <label className="flex min-h-11 items-center gap-2 text-[13px] text-foreground sm:min-h-0">
        <Checkbox checked={toggles.onlyChanged} onCheckedChange={(v) => onToggles({ ...toggles, onlyChanged: v === true })} />
        {t("review.compare.onlyChanged")}
      </label>
      <label htmlFor={selectId} className="flex items-center gap-2 text-[13px] text-foreground">
        {t("review.compare.with.label")}
        <select
          id={selectId}
          value={encode(source.choice)}
          onChange={(e) => source.setChoice(decode(e.target.value))}
          className="h-11 rounded-lg border border-input bg-card px-2 text-[13px] text-foreground sm:h-9"
        >
          {source.canReview && <option value="review">{t("review.compare.with.review")}</option>}
          {source.canMaster && <option value="master">{t("review.compare.with.master")}</option>}
          {source.canSaved && <option value="saved">{t("review.compare.with.saved")}</option>}
          {source.versions.map((v) => (
            <option key={v.id} value={`version:${v.id}`}>
              {t("review.compare.with.versionNamed", { title: v.title })}
            </option>
          ))}
        </select>
      </label>
      {canRevert && (
        <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" onClick={() => active.setAll("reverted")}>
          {t("review.compare.revertAll")}
        </Button>
      )}
      <Dialog.Close asChild>
        <Button size="sm" className="min-h-11 sm:min-h-9">
          {t(active && active.kind !== "compare" ? "review.compare.keep" : "actions.close")}
        </Button>
      </Dialog.Close>
      <Dialog.Close asChild>
        <Button variant="secondary" size="icon" className="h-11 w-11 sm:h-10 sm:w-10" aria-label={t("review.compare.close")} title={t("review.compare.close")}>
          <X className="h-[18px] w-[18px]" aria-hidden="true" />
        </Button>
      </Dialog.Close>
    </div>
  );
}
