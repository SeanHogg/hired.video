/**
 * XyzReviewAllWizard — "Review my whole résumé in XYZ" (#990): one step at a
 * time over every entry's bullets, summary and title, each with the XYZ
 * rewrite beside the original — edit it, Apply or Skip; Back and Cancel all
 * at any point. Nothing changes on the résumé until Finish, which writes
 * every applied step as ONE change (one Undo step on the kit workspace). A refresh
 * resumes where the pass was. Logic: lib/build/xyz/use-xyz-review.ts.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Check, Loader2, RotateCw, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { ProGateSheet } from "@/components/billing/useProGate";
import { useXyzReview } from "@/lib/build/xyz/use-xyz-review";

interface XyzReviewAllWizardProps {
  resumeId: string;
}

const asLines = (v: string | string[]) => (Array.isArray(v) ? v.filter((l) => l.trim()) : [v]);

export default function XyzReviewAllWizard({ resumeId }: XyzReviewAllWizardProps) {
  const { t } = useTranslation();
  const xyz = useXyzReview(resumeId);
  const { current, suggestion } = xyz;
  // The rewrite as the person edits it (one bullet per line for a group).
  const [draft, setDraft] = useState("");
  const suggested = suggestion?.status === "ready" ? suggestion.value : null;
  useEffect(() => {
    setDraft(suggested ? asLines(suggested).join("\n") : "");
  }, [suggested, current?.id]);

  if (xyz.loading) {
    return (
      <div role="status" className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
        {t("status.loading")}
      </div>
    );
  }

  if (!xyz.started) {
    return (
      <section className="space-y-3">
        {xyz.finished && (
          <p role="status" className="rounded-lg bg-brand-green/10 p-3 text-sm text-brand-green-text">
            {t("build.xyz.done", { count: xyz.finished.applied })}
          </p>
        )}
        <p className="text-sm text-muted-foreground">{t("build.xyz.intro", { count: xyz.steps.length })}</p>
        <Button className="min-h-11 gap-2" disabled={xyz.steps.length === 0} onClick={xyz.start}>
          <Sparkles aria-hidden="true" className="h-4 w-4" />
          {xyz.cursor > 0 ? t("build.xyz.resume") : t("build.xyz.start")}
        </Button>
        {xyz.steps.length === 0 && <p className="text-xs text-muted-foreground">{t("build.xyz.nothing")}</p>}
        <ProGateSheet {...xyz.proGateSheet} />
      </section>
    );
  }

  const total = xyz.steps.length;
  const position = Math.min(xyz.cursor + 1, total);

  if (xyz.atEnd || !current) {
    return (
      <section className="space-y-3">
        <p className="text-sm">{t("build.xyz.review", { count: xyz.applied, total })}</p>
        <div className="flex flex-wrap gap-2">
          <Button className="min-h-11 gap-2" disabled={xyz.finishing} onClick={() => void xyz.finish()}>
            {xyz.finishing ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Check aria-hidden="true" className="h-4 w-4" />}
            {t("build.xyz.finish", { count: xyz.applied })}
          </Button>
          <Button variant="outline" className="min-h-11" onClick={xyz.back}>
            <ArrowLeft aria-hidden="true" className="mr-1 h-4 w-4" />
            {t("build.xyz.back")}
          </Button>
          <Button variant="ghost" className="min-h-11" onClick={xyz.cancelAll}>
            {t("build.xyz.cancelAll")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t("build.xyz.undoHint")}</p>
      </section>
    );
  }

  const isGroup = current.kind === "highlights";
  const edited = isGroup ? draft.split("\n").map((l) => l.trim()).filter(Boolean) : draft.trim();
  const canApply = suggestion?.status === "ready" && (Array.isArray(edited) ? edited.length > 0 : edited.length > 0);

  return (
    <section aria-label={t("build.xyz.stepLabel", { position, total })} className="space-y-3 [overflow-wrap:anywhere]">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{t("build.xyz.stepLabel", { position, total })}</span>
          <span>{t("build.xyz.appliedSoFar", { count: xyz.applied })}</span>
        </div>
        <Progress value={(xyz.cursor / Math.max(1, total)) * 100} aria-hidden="true" />
      </div>
      <p className="text-sm font-medium">
        {t(`build.xyz.kind.${current.kind}`)}
        {current.entry ? <span className="text-muted-foreground"> · {current.entry}</span> : null}
      </p>

      <div>
        <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("build.xyz.now")}</span>
        <ul className="m-0 list-none space-y-1 p-0 text-sm">
          {asLines(current.original).map((line, i) => (
            <li key={i} className="rounded bg-diff-removed px-1.5 py-0.5 text-diff-removed-foreground">
              {line}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <label htmlFor="xyz-rewrite" className="mb-1 block text-xs font-medium text-muted-foreground">
          {isGroup ? t("build.xyz.rewriteBullets") : t("build.xyz.rewrite")}
        </label>
        {suggestion?.status === "loading" && (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            {t("build.xyz.writing")}
          </p>
        )}
        {suggestion?.status === "failed" && (
          <p role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
            {t("build.xyz.failed")}
            <Button size="sm" variant="outline" className="min-h-11 gap-1 sm:min-h-9" onClick={xyz.retry}>
              <RotateCw aria-hidden="true" className="h-3.5 w-3.5" />
              {t("build.xyz.retry")}
            </Button>
          </p>
        )}
        {suggestion?.status === "ready" && (
          <Textarea
            id="xyz-rewrite"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={isGroup ? Math.min(10, Math.max(3, asLines(suggestion.value).length + 1)) : 3}
            className="border-diff-added-foreground/30 bg-diff-added text-sm text-diff-added-foreground"
          />
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button className="min-h-11 gap-1" disabled={!canApply} onClick={() => xyz.decide(edited)}>
          <Check aria-hidden="true" className="h-4 w-4" />
          {t("build.xyz.apply")}
        </Button>
        <Button variant="outline" className="min-h-11" onClick={() => xyz.decide(null)}>
          {t("build.xyz.skip")}
        </Button>
        <Button variant="ghost" className="min-h-11" disabled={xyz.cursor === 0} onClick={xyz.back}>
          <ArrowLeft aria-hidden="true" className="mr-1 h-4 w-4" />
          {t("build.xyz.back")}
        </Button>
        <Button variant="ghost" className="min-h-11 text-muted-foreground" onClick={xyz.cancelAll}>
          <X aria-hidden="true" className="mr-1 h-4 w-4" />
          {t("build.xyz.cancelAll")}
        </Button>
      </div>
    </section>
  );
}
