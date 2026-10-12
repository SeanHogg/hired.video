/**
 * "Let AI do this step" for the open kit stage, at the top of the chat and
 * again at its end (StageFollowUp), so a stage change lands beside it:
 * the plan's steps (stage-plan.ts) as a checklist, each tagged with the tool
 * that does it, and Pro steps marked before anything runs. "Do it for me"
 * runs the steps on the draft; "Show me first" runs only the findings. A step
 * that needs input (a job post) opens its tool in the slide-out when clicked.
 */
import { useTranslation } from "react-i18next";
import { Check, Loader2, PanelRight, X } from "lucide-react";
import { getTool } from "@/lib/tools/registry";
import type { StagePlanControls, StepState } from "@/lib/build/use-stage-plan";
import { cn } from "@/lib/utils";
import ProTag from "./ProTag";


const TAG = "rounded-[5px] bg-primary/10 px-1.5 py-px font-mono text-[10.5px] text-primary";
const PRIMARY =
  "inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 sm:min-h-8";

function StepMark({ state }: { state: StepState }) {
  const base = "flex h-4 w-4 flex-none items-center justify-center rounded-full border-[1.5px]";
  if (state === "running") return <Loader2 aria-hidden="true" className="h-4 w-4 flex-none animate-spin text-primary" />;
  if (state === "done")
    return (
      <span aria-hidden="true" className={cn(base, "border-emerald-600 bg-emerald-600 text-white")}>
        <Check className="h-2.5 w-2.5" strokeWidth={3} />
      </span>
    );
  if (state === "failed")
    return (
      <span aria-hidden="true" className={cn(base, "border-destructive text-destructive")}>
        <X className="h-2.5 w-2.5" strokeWidth={3} />
      </span>
    );
  return <span aria-hidden="true" className={cn(base, "border-border")} />;
}

export default function StagePlanCard({ controls }: { controls: StagePlanControls }) {
  const { t } = useTranslation();
  const { plan, stepStates, busy, doIt, showFirst, openStep } = controls;
  const runnable = plan.steps.some((s) => s.kind !== "panel");
  const hasFindings = plan.steps.some((s) => s.kind === "tool");
  const done = runnable && plan.steps.every((s, i) => s.kind === "panel" || stepStates[i] === "done");

  return (
    <section
      aria-label={t(plan.titleKey)}
      className="flex flex-col gap-2.5 rounded-xl border border-primary bg-gradient-to-b from-primary/10 to-card to-70% px-3.5 py-3"
    >
      <h3 className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
        {t(plan.titleKey)}
        <span className={TAG}>{t("build.plan.tag")}</span>
      </h3>
      <ol className="flex flex-col gap-1.5 text-[13px]">
        {plan.steps.map((step, i) => {
          const state = stepStates[i] ?? "idle";
          const toolId = step.kind === "revise" ? "revise" : step.toolId;
          const pro = step.kind !== "revise" && getTool(step.toolId)?.requiresPro;
          const label = (
            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              <span className="min-w-0">
                {t(step.labelKey)} <code className="font-mono text-[10.5px] text-muted-foreground">{toolId}</code>
              </span>
              {pro && <ProTag />}
            </span>
          );
          return (
            <li key={step.labelKey} className="flex items-start gap-2">
              {step.kind === "panel" ? (
                <button
                  type="button"
                  aria-haspopup="dialog"
                  disabled={busy}
                  onClick={() => openStep(i)}
                  className="flex min-h-11 flex-1 items-start gap-2 rounded-md text-left text-foreground hover:text-primary disabled:opacity-60 sm:min-h-0"
                >
                  <PanelRight aria-hidden="true" className="mt-0.5 h-4 w-4 flex-none text-primary" />
                  {label}
                </button>
              ) : (
                <>
                  <span className="mt-0.5">
                    <StepMark state={state} />
                  </span>
                  {label}
                  <span className="sr-only">{t(`build.plan.state.${state}`)}</span>
                </>
              )}
            </li>
          );
        })}
      </ol>
      {done ? (
        <p role="status" className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
          {t("build.plan.done")}
        </p>
      ) : runnable ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void doIt()} disabled={busy} className={PRIMARY}>
            {busy && <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />}
            {busy ? t("build.plan.working") : t("build.plan.doIt")}
          </button>
          {hasFindings && (
            <button
              type="button"
              onClick={() => void showFirst()}
              disabled={busy}
              className="min-h-11 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-60 sm:min-h-8"
            >
              {t("build.plan.showFirst")}
            </button>
          )}
        </div>
      ) : (
        <button type="button" aria-haspopup="dialog" onClick={() => openStep(0)} className={cn(PRIMARY, "self-start")}>
          {t("build.plan.startWithJob")}
        </button>
      )}
    </section>
  );
}
