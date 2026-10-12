/**
 * The inline composer the review overlay opens (AnnotationLayer): a sticky
 * note dropped on the page, or a comment on a selected quote. On a quote the
 * reviewer can also "suggest a replacement" (#2220) — the selected words
 * rewritten in place, sent as a structured `suggestedEdit` the owner applies
 * in one click. The suggestion shows as a before/after diff while typing.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { SuggestedEdit } from "@shared/resume-feedback";
import { buildSuggestedEdit, type SuggestTarget } from "@/lib/review-feedback/suggested-edit";

export interface ComposerSubmit {
  body: string;
  suggestedEdit?: SuggestedEdit;
}

interface AnnotationComposerProps {
  mode: "sticky" | "highlight";
  left: number;
  top: number;
  /** The selected quote (highlight mode). */
  quote?: string;
  /** Where the quote sits in the résumé, when a replacement can be suggested. */
  suggest?: SuggestTarget | null;
  onSubmit: (out: ComposerSubmit) => void;
  onCancel: () => void;
}

export default function AnnotationComposer({ mode, left, top, quote, suggest, onSubmit, onCancel }: AnnotationComposerProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [replacement, setReplacement] = useState(() =>
    suggest ? suggest.text.slice(suggest.start, suggest.end) : "",
  );
  const edit = suggesting && suggest ? buildSuggestedEdit(suggest, replacement) : null;
  const canSubmit = suggesting ? edit !== null : draft.trim().length > 0;

  const submit = () => {
    if (!canSubmit) return;
    const body = draft.trim() || t("review.suggest.defaultBody");
    onSubmit({ body, ...(edit ? { suggestedEdit: edit } : {}) });
  };

  return (
    <div
      className="absolute z-40 w-64 max-w-[calc(100vw-2rem)] rounded-lg border bg-card p-2 shadow-lg"
      style={{ left, top, pointerEvents: "auto" }}
      onClick={(e) => e.stopPropagation()}
      role="presentation"
    >
      {mode === "highlight" && quote && (
        <blockquote className="mb-1 line-clamp-2 border-l-2 border-amber-400 pl-2 text-[11px] italic text-muted-foreground">
          “{quote}”
        </blockquote>
      )}
      {mode === "highlight" && suggest && (
        <div className="mb-1 flex gap-1 text-[11px]" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={!suggesting}
            className={`rounded px-1.5 py-0.5 ${!suggesting ? "bg-muted font-medium text-foreground" : "text-muted-foreground"}`}
            onClick={() => setSuggesting(false)}
          >
            {t("review.suggest.comment")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={suggesting}
            className={`rounded px-1.5 py-0.5 ${suggesting ? "bg-muted font-medium text-foreground" : "text-muted-foreground"}`}
            onClick={() => setSuggesting(true)}
          >
            {t("review.suggest.tab")}
          </button>
        </div>
      )}
      {suggesting && suggest && (
        <>
          <label className="mb-0.5 block text-[11px] font-medium text-muted-foreground" htmlFor="annot-suggest">
            {t("review.suggest.replaceWith")}
          </label>
          <textarea
            id="annot-suggest"
            autoFocus
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            rows={2}
            className="mb-1 w-full resize-y rounded border border-border bg-background px-1.5 py-1 text-sm outline-none focus:border-brand-primary"
          />
          {edit && (
            <div className="mb-1 space-y-0.5 rounded bg-muted p-1.5 text-[11px] [overflow-wrap:anywhere]">
              <del className="block rounded bg-diff-removed px-1 text-diff-removed-foreground">{edit.before}</del>
              <ins className="block rounded bg-diff-added px-1 text-diff-added-foreground no-underline">{edit.after}</ins>
            </div>
          )}
        </>
      )}
      <textarea
        autoFocus={!suggesting}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          if (e.key === "Escape") onCancel();
        }}
        aria-label={suggesting ? t("review.suggest.why") : t("review.composer.comment")}
        placeholder={
          suggesting ? t("review.suggest.why") : mode === "sticky" ? t("review.composer.sticky") : t("review.composer.comment")
        }
        rows={suggesting ? 2 : 3}
        className="w-full resize-y rounded border border-border bg-background px-1.5 py-1 text-sm outline-none focus:border-brand-primary"
      />
      <div className="mt-1 flex justify-end gap-1">
        <button type="button" className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted" onClick={onCancel}>
          {t("review.composer.cancel")}
        </button>
        <button
          type="button"
          className="rounded bg-brand-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
          disabled={!canSubmit}
          onClick={submit}
        >
          {suggesting ? t("review.suggest.submit") : t("review.composer.add")}
        </button>
      </div>
    </div>
  );
}
