/**
 * One scoring finding on the selected line, in the "This line" inspector:
 * which tool said it, what it said, and for a rewrite the line as it is now
 * vs the rewrite (editable — Apply writes what's in the box, as one Undo
 * step) and Dismiss. Presentational: the actions come from useFindingActions.
 */
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { PageFinding } from "@/lib/build/page-findings";
import { FINDING_TONE } from "@/components/build/review/FindingFlag";
import { INSPECTOR_LABEL } from "@/components/workspace/inspector/inspector-styles";

interface FindingCardProps {
  finding: PageFinding;
  /** Present when the rewrite can be applied (a rewrite on a saved draft);
   *  called with the rewrite as the visitor edited it. */
  onApply?: (after: string) => void;
  onDismiss: () => void;
  /** Present when the analyzer named a wand for it (#375): runs the wand,
   *  whose proposal lands in the chat with Apply. */
  onFix?: () => void;
  applying: boolean;
  failed: boolean;
}

const CAPTION = `block ${INSPECTOR_LABEL}`;

export default function FindingCard({ finding, onApply, onDismiss, onFix, applying, failed }: FindingCardProps) {
  const { t } = useTranslation();
  const label = t(finding.labelKey);
  const { rewrite } = finding;
  const [draft, setDraft] = useState(rewrite?.after ?? "");
  const rewriteId = useId();

  return (
    <article
      aria-label={t("build.findings.cardLabel", { label })}
      className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 text-[13.5px] leading-snug text-foreground [overflow-wrap:anywhere]"
    >
      <span className="flex flex-wrap items-center gap-2">
        <span className={cn("rounded px-1.5 py-0.5 text-[10.5px] font-semibold leading-none", FINDING_TONE[finding.severity])}>
          {label}
        </span>
        <span className="text-xs font-semibold text-muted-foreground">{t(`build.findings.source.${finding.source}`)}</span>
      </span>
      {finding.title && <p className="m-0">{finding.title}</p>}
      {rewrite && (
        <>
          <span className="block">
            <span className={CAPTION}>{t("build.findings.before")}</span>
            <del className="rounded bg-diff-removed px-1 text-diff-removed-foreground">{rewrite.before}</del>
          </span>
          <span className="block">
            <label htmlFor={rewriteId} className={CAPTION}>
              {t("build.findings.after")}
            </label>
            {onApply ? (
              <Textarea
                id={rewriteId}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                aria-describedby={`${rewriteId}-hint`}
                className="min-h-0 resize-y border-diff-added-foreground/30 bg-diff-added px-2 py-1.5 text-[13.5px] leading-snug text-diff-added-foreground [field-sizing:content]"
                rows={2}
              />
            ) : (
              <ins className="rounded bg-diff-added px-1 text-diff-added-foreground no-underline">{rewrite.after}</ins>
            )}
          </span>
        </>
      )}
      {failed && (
        <p role="alert" className="m-0 text-xs text-destructive">
          {t("build.findings.applyFailed")}
        </p>
      )}
      <span className="flex flex-wrap items-center gap-2">
        {onApply && (
          <Button size="sm" className="min-h-11" disabled={applying || !draft.trim()} onClick={() => onApply(draft)}>
            {t(applying ? "build.findings.applying" : "build.findings.apply")}
          </Button>
        )}
        {onFix && finding.action && (
          <Button size="sm" className="min-h-11" onClick={onFix}>
            {t(finding.action.labelKey)}
          </Button>
        )}
        <Button size="sm" variant="outline" className="min-h-11" onClick={onDismiss}>
          {t("build.findings.dismiss")}
        </Button>
        {onApply && (
          <span id={`${rewriteId}-hint`} className="text-xs text-muted-foreground">
            {t("build.findings.undoHint")}
          </span>
        )}
      </span>
    </article>
  );
}
