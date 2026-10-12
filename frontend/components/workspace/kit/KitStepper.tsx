/**
 * KitStepper — a career kit's Create → Post journey under the header, the
 * same in Simple and Advanced: "Step N of 5" with the stage's line, ONE bar
 * of five labelled segments (click one to go there; finished stages fill,
 * the open one half-fills, a stage with fixes left carries a dot), Skip on
 * an optional stage, and ONE primary button — Next — always in the same
 * spot. Next at the last stage opens the Post panel; nothing else posts.
 *
 * Each segment's status line ("Score 82 · 2 to fix", the readiness) is its
 * tooltip and accessible name. On phones the stepper is ONE row — "Step 4
 * of 5 · Make the video  Skip" — over a thin bar of the same five segments,
 * and Next moves to the bottom bar (`KitNextButton`, the frame's footer).
 */
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { BUILD_STAGES, stageKeys, type BuildStageId } from "@/lib/build/build-stages";
import type { StageStatus } from "@/lib/build/stage-status";
import {
  KIT_STAGE_COUNT,
  kitNextAction,
  nextLabelKey,
  stageIsOptional,
  stageNumber,
  stageTitleKey,
} from "@/lib/workspace/kit-stages";
import { useIsWideWorkspace } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

interface KitStepperProps {
  stage: BuildStageId;
  statuses: Record<BuildStageId, StageStatus>;
  /** 0–100 once scored; a nudge, never a gate. */
  readiness: number | null;
  onStageChange: (stage: BuildStageId) => void;
  onNext: () => void;
}

/** A status line in the active locale; `…Key` values are i18n keys too. */
function useStatusText() {
  const { t } = useTranslation();
  return ({ key, values = {} }: StageStatus) =>
    t(
      key,
      Object.fromEntries(
        Object.entries(values).map(([name, value]) =>
          name.endsWith("Key") ? [name.slice(0, -3), t(String(value))] : [name, value],
        ),
      ),
    );
}

export function KitNextButton({ stage, onNext, className }: { stage: BuildStageId; onNext: () => void; className?: string }) {
  const { t } = useTranslation();
  const post = kitNextAction(stage).kind === "post";
  return (
    <button
      type="button"
      onClick={onNext}
      className={cn(
        "inline-flex min-h-11 flex-none items-center justify-center gap-1.5 rounded-[10px] bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 lg:min-h-9",
        className,
      )}
    >
      {t(nextLabelKey(stage))}
      {!post && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
    </button>
  );
}

export default function KitStepper({ stage, statuses, readiness, onStageChange, onNext }: KitStepperProps) {
  const { t } = useTranslation();
  const wide = useIsWideWorkspace();
  const statusText = useStatusText();
  const current = BUILD_STAGES.indexOf(stage);
  const next = kitNextAction(stage);

  const skip =
    stageIsOptional(stage) && next.kind === "stage" ? (
      <button
        type="button"
        onClick={() => onStageChange(next.stage)}
        className="min-h-11 flex-none rounded-[10px] px-3 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground lg:min-h-9"
      >
        {t("workspace.stepper.skip")}
      </button>
    ) : null;

  const segments = (compact: boolean) => (
    <ol
      className={cn("grid grid-cols-5 gap-1.5", compact ? "w-full" : "min-w-[240px] flex-1")}
      aria-label={t("build.stages.label")}
    >
      {BUILD_STAGES.map((id, i) => {
        const status = statusText(statuses[id]);
        const meter = id === "strengthen" && readiness !== null ? ` · ${t("build.stages.readiness")} ${readiness}%` : "";
        const fill = i < current ? "100%" : i === current ? "45%" : "0%";
        const badge = statuses[id].badge;
        return (
          <li key={id} className="min-w-0">
            <button
              type="button"
              onClick={() => onStageChange(id)}
              aria-current={id === stage ? "step" : undefined}
              aria-label={`${t(stageKeys(id).label)} — ${status}${meter}`}
              title={`${status}${meter}`}
              // Phones: a 44px tap target around the same thin bar.
              className={cn("group flex w-full min-w-0 flex-col gap-1 rounded-md text-left", compact ? "min-h-11 justify-center" : "py-1")}
            >
              <span className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <span
                  className={cn("absolute inset-y-0 left-0 rounded-full", i < current ? "bg-brand-green" : "bg-primary")}
                  style={{ width: fill }}
                />
                {compact && badge !== undefined && (
                  <span aria-hidden="true" className="absolute right-0 top-0 h-1.5 w-1.5 rounded-full bg-brand-orange" />
                )}
              </span>
              {!compact && (
                <span
                  className={cn(
                    "flex items-center gap-1 truncate text-[11.5px] font-semibold",
                    id === stage ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
                  )}
                >
                  <span className="truncate">{t(stageKeys(id).label)}</span>
                  {i < current && <span aria-hidden="true">✓</span>}
                  {badge !== undefined && <span aria-hidden="true" className="h-1.5 w-1.5 flex-none rounded-full bg-brand-orange" />}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );

  const stepOf = t("workspace.stepper.stepOf", { n: stageNumber(stage), total: KIT_STAGE_COUNT });

  if (!wide) {
    return (
      <nav data-region="stepper" aria-label={t("build.stages.label")} className="flex flex-none flex-col border-b border-border bg-card px-3 pt-1">
        {/* 44px whether or not Skip shows, so the frame never moves between stages. */}
        <div className="flex min-h-11 min-w-0 items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-sm">
            <span className="text-muted-foreground">{stepOf} · </span>
            <span className="font-semibold text-foreground">{t(stageTitleKey(stage))}</span>
          </p>
          {skip}
        </div>
        {segments(true)}
      </nav>
    );
  }

  return (
    <nav
      data-region="stepper"
      aria-label={t("build.stages.label")}
      className="flex flex-none flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-card px-3 py-2 sm:px-4"
    >
      <div className="flex min-w-0 flex-none flex-col">
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{stepOf}</span>
        <span className="truncate text-sm font-semibold text-foreground">{t(stageTitleKey(stage))}</span>
      </div>
      {segments(false)}
      <div className="flex flex-none items-center gap-1.5">
        {skip}
        <KitNextButton stage={stage} onNext={onNext} />
      </div>
    </nav>
  );
}

/**
 * The stepper's space before the kit is ready (intake): the same rows at
 * the same height, in muted blocks, so the canvas never jumps when the
 * stepper arrives. Decorative only.
 */
export function KitStepperSkeleton() {
  const wide = useIsWideWorkspace();
  const bars = (compact: boolean) => (
    <div className={cn("grid grid-cols-5 gap-1.5", compact ? "w-full" : "min-w-[240px] flex-1")}>
      {Array.from({ length: KIT_STAGE_COUNT }, (_, i) => (
        <span key={i} className={cn("flex flex-col justify-center gap-1", compact ? "min-h-11" : "py-1")}>
          <span className="h-1.5 w-full rounded-full bg-muted" />
          {!compact && <span className="h-[17px] w-2/3 rounded bg-muted/70" />}
        </span>
      ))}
    </div>
  );
  if (!wide) {
    return (
      <div aria-hidden="true" data-region="stepper" className="flex flex-none flex-col border-b border-border bg-card px-3 pt-1">
        <div className="flex min-h-11 items-center">
          <span className="h-4 w-48 max-w-full rounded bg-muted" />
        </div>
        {bars(true)}
      </div>
    );
  }
  return (
    <div
      aria-hidden="true"
      data-region="stepper"
      className="flex flex-none flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-card px-3 py-2 sm:px-4"
    >
      <div className="flex w-36 flex-none flex-col gap-1.5">
        <span className="h-2.5 w-20 rounded bg-muted/70" />
        <span className="h-4 w-full rounded bg-muted" />
      </div>
      {bars(false)}
      <span className="h-9 w-40 flex-none rounded-[10px] bg-muted" />
    </div>
  );
}
