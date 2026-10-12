/**
 * One change, explained: where, what it was before, why, and Keep / Revert /
 * Edit — with "‹ 3 of 7 ›" to step through. Anchored under the change's pin
 * on the page (`variant="pin"`) and pinned to the compare panel's foot
 * (`variant="footer"`): the same control in both places.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { changeTitle, type ReviewChange, type ReviewCore } from "@/lib/build/review/review-model";
import { isEditable } from "@/lib/build/review/use-change-list";

interface ChangePopoverProps {
  review: ReviewCore;
  change: ReviewChange;
  index: number;
  onSelect: (index: number) => void;
  variant: "pin" | "footer";
}

export default function ChangePopover({ review, change, index, onSelect, variant }: ChangePopoverProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<string | null>(null);
  const content = review.proposed ?? review.baseline;
  const where = content ? changeTitle(change.path, content) : null;
  const canAct = review.kind !== "compare";
  const canEdit = !!review.editChange && !!content && isEditable(content, change.path);
  const total = review.changes.length;

  return (
    <div
      className={cn(
        "flex flex-col gap-2 font-sans text-[13.5px] text-foreground",
        variant === "pin" && "my-2 rounded-xl border border-border bg-card p-3 shadow-lg",
      )}
      role="group"
      aria-label={t("review.change.label", { n: change.pin })}
    >
      {where && (
        <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <span className="inline-flex h-[19px] min-w-[19px] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground">
            {change.pin}
          </span>
          {t(where.key, { ...where.params, section: t(`tabs.${where.params.section ?? "work"}`) })}
        </p>
      )}
      {change.before && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t("review.change.before")}</p>
          <p className="whitespace-pre-line rounded bg-diff-removed px-1 text-diff-removed-foreground line-through">{change.before}</p>
        </div>
      )}
      {change.why && (
        <p>
          <strong>{t("review.change.why")}</strong> {change.why}
        </p>
      )}
      {editing !== null && (
        <div className="flex flex-col gap-2">
          <label className="sr-only" htmlFor={`edit-${change.id}`}>
            {t("review.change.editLabel")}
          </label>
          <Textarea id={`edit-${change.id}`} value={editing} rows={4} onChange={(e) => setEditing(e.target.value)} />
          <div className="flex gap-2">
            <Button
              size="sm"
              className="min-h-11 sm:min-h-9"
              onClick={() => {
                review.editChange?.(change.id, editing);
                setEditing(null);
              }}
            >
              {t("review.change.saveEdit")}
            </Button>
            <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => setEditing(null)}>
              {t("actions.cancel")}
            </Button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {canAct && editing === null && (
          <>
            <Button
              size="sm"
              variant={change.status === "kept" ? "default" : "outline"}
              className="min-h-11 sm:min-h-9"
              aria-pressed={change.status === "kept"}
              onClick={() => review.setChange(change.id, "kept")}
            >
              {t("review.change.keep")}
            </Button>
            <Button
              size="sm"
              variant={change.status === "reverted" ? "default" : "outline"}
              className="min-h-11 sm:min-h-9"
              aria-pressed={change.status === "reverted"}
              onClick={() => review.setChange(change.id, "reverted")}
            >
              {t("review.change.revert")}
            </Button>
            {canEdit && (
              <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => setEditing(change.after)}>
                {t("review.change.edit")}
              </Button>
            )}
          </>
        )}
        <span className="flex-1" />
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={() => onSelect(index - 1)}
            aria-label={t("review.change.previous")}
            className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-muted sm:h-8 sm:w-8"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          {t("review.change.position", { n: index + 1, total })}
          <button
            type="button"
            onClick={() => onSelect(index + 1)}
            aria-label={t("review.change.next")}
            className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-muted sm:h-8 sm:w-8"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </span>
      </div>
    </div>
  );
}
