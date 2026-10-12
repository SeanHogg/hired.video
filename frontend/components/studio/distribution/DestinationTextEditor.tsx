/**
 * One picked destination's own text in the Hub composer (#2047, PRD §4.2):
 * collapsed it says whether the destination uses the shared caption; open,
 * it edits that destination's caption (its own limit, live count) and its
 * title where the network shows one, with "Write for {network}" and "Use
 * the shared caption".
 */
import { Loader2, Sparkles } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { DestinationRef, DestinationTextState } from "./useDestinationText";
import { useDestinationLabel } from "./useDestinationLabel";

const COUNT = "text-xs tabular-nums";

export interface DestinationTextEditorProps {
  target: DestinationRef;
  shared: string;
  text: DestinationTextState;
  disabled: boolean;
  writing: boolean;
  canWrite: boolean;
  onWrite: () => void;
}

export function CharCount({ length, limit }: { length: number; limit: number }) {
  const { t } = useTranslation();
  return (
    <span className={cn(COUNT, length > limit ? "font-semibold text-destructive" : "text-muted-foreground")}>
      {t("distribution.text.count", { length, limit })}
    </span>
  );
}

export default function DestinationTextEditor({ target, shared, text, disabled, writing, canWrite, onWrite }: DestinationTextEditorProps) {
  const { t } = useTranslation();
  const labelOf = useDestinationLabel();
  const name = labelOf(target.destination, target.lane);
  const captionId = useId();
  const titleId = useId();
  const v = text.textFor(target, shared);

  return (
    <details className="rounded-xl border border-border bg-card px-3 py-2" open={v.problem !== null || undefined}>
      <summary className="flex min-h-9 cursor-pointer list-none flex-wrap items-center justify-between gap-2 text-sm">
        <span className="min-w-0 font-semibold text-foreground">{name}</span>
        <span className={cn("text-xs", v.problem ? "text-destructive" : "text-muted-foreground")}>
          {v.problem ? t(`distribution.text.problem.${v.problem}`) : v.overridden ? t("distribution.text.own") : t("distribution.text.usesShared")}
        </span>
      </summary>
      <div className="mt-2 flex flex-col gap-2 pb-1">
        {v.titleLimit !== null && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={titleId} className="text-[13px] text-muted-foreground">
                {t("distribution.text.title")}
              </label>
              <CharCount length={v.title.length} limit={v.titleLimit} />
            </div>
            <input
              id={titleId}
              value={v.title}
              disabled={disabled}
              placeholder={t("distribution.text.titlePlaceholder")}
              onChange={(e) => text.setTitle(target, e.target.value)}
              className="min-h-11 w-full min-w-0 rounded-[10px] border border-border bg-background px-3 text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary disabled:opacity-60"
            />
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor={captionId} className="text-[13px] text-muted-foreground">
            {t("distribution.text.caption", { name })}
          </label>
          <CharCount length={v.caption.length} limit={v.captionLimit} />
        </div>
        <textarea
          id={captionId}
          rows={3}
          value={v.caption}
          disabled={disabled}
          onChange={(e) => text.setCaption(target, e.target.value)}
          className="resize-y rounded-[10px] border border-border bg-background px-3 py-2 text-sm leading-normal text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary disabled:opacity-60"
        />
        <div className="flex flex-wrap gap-2">
          {canWrite && (
            <button
              type="button"
              disabled={disabled || writing}
              onClick={onWrite}
              className="flex min-h-9 items-center gap-1 rounded-lg px-2 text-[13px] font-semibold text-primary hover:bg-accent disabled:opacity-60"
            >
              {writing ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />}
              {t("distribution.text.writeFor", { name })}
            </button>
          )}
          {v.overridden && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => text.setCaption(target, undefined)}
              className="min-h-9 rounded-lg px-2 text-[13px] font-semibold text-foreground hover:bg-accent disabled:opacity-60"
            >
              {t("distribution.text.useShared")}
            </button>
          )}
        </div>
      </div>
    </details>
  );
}
