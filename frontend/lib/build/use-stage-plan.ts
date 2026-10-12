/**
 * Runs a kit stage's plan (stage-plan.ts) and tracks each step's state for
 * the plan card's checklist. "Do it for me" runs the tool and revise steps in
 * order; "Show me first" runs only the tool steps. A panel step opens its tool
 * in the slide-out instead (it needs input only the user has). A tool step
 * the user already ran from a chip isn't run again: it joins that run, or
 * counts its finished result (only an `afterChanges` re-score always runs
 * fresh), and the checklist shows it. Step states
 * are kept per stage, so moving between stages keeps what each one did; a new
 * draft clears them, and a reload brings them back (useDraftScopedState).
 */
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BuildStageId } from "./build-stages";
import { STAGE_PLANS, type PlanStep } from "./stage-plan";
import type { ToolRun } from "./use-tool-runs";
import { useDraftScopedState } from "./use-draft-scoped-state";

export type StepState = "idle" | "running" | "done" | "failed";

type StepStates = Record<string, StepState>;
const NO_STATES: StepStates = {};
const KEPT: ReadonlySet<string> = new Set<StepState>(["done", "failed"]);

/** Only settled steps: one "running" when the page went away is idle again. */
function reviveStates(stored: unknown): StepStates | null {
  if (typeof stored !== "object" || stored === null) return null;
  return Object.fromEntries(
    Object.entries(stored).filter((e): e is [string, StepState] => typeof e[1] === "string" && KEPT.has(e[1])),
  );
}
const persistStates = (states: StepStates): StepStates => reviveStates(states) ?? NO_STATES;

interface Args {
  stage: BuildStageId;
  draftKey: unknown;
  /** The saved résumé the checkmarks are remembered under. */
  resumeId: string | null;
  /** The chat's run log, so steps already run from a chip show as such. */
  runs: readonly ToolRun[];
  /** Run a tool fresh (joining one of it already running). */
  runTool: (toolId: string) => Promise<ToolRun | null>;
  /** A finished run of the tool already in the log, else a new run. */
  reuseTool: (toolId: string) => Promise<ToolRun | null>;
  /** Send a change request to the page's chat. */
  revise: (text: string) => Promise<void>;
  openPanel: (toolId: string) => void;
}

const key = (stage: BuildStageId, index: number) => `${stage}:${index}`;

/** What the run log says about a findings step — its latest run, from the
 *  plan or a chip. A re-score only counts the plan's own run. */
function stateFromRuns(step: PlanStep, runs: readonly ToolRun[]): StepState {
  if (step.kind !== "tool" || step.afterChanges) return "idle";
  return [...runs].reverse().find((r) => r.toolId === step.toolId)?.status ?? "idle";
}

export function useStagePlan({ stage, draftKey, resumeId, runs, runTool, reuseTool, revise, openPanel }: Args) {
  const { t } = useTranslation();
  const {
    value: states,
    set: setStates,
    draftRef,
  } = useDraftScopedState({ draftKey, resumeId, slice: "plan", empty: NO_STATES, revive: reviveStates, persist: persistStates });
  const [busy, setBusy] = useState(false);

  useEffect(() => setBusy(false), [draftKey]);

  const plan = STAGE_PLANS[stage];

  const runStep = useCallback(
    async (step: PlanStep, index: number): Promise<boolean> => {
      if (step.kind === "panel") {
        openPanel(step.toolId);
        return false;
      }
      const k = key(stage, index);
      setStates((s) => ({ ...s, [k]: "running" }));
      let ok = true;
      if (step.kind === "tool") {
        const done = await (step.afterChanges ? runTool : reuseTool)(step.toolId);
        ok = done?.status === "done";
        // Gated (sign-in / Pro sheet open): stop here, nothing failed.
        if (!done) {
          setStates((s) => ({ ...s, [k]: "idle" }));
          return false;
        }
      } else {
        await revise(t(step.promptKey));
      }
      setStates((s) => ({ ...s, [k]: ok ? "done" : "failed" }));
      return true;
    },
    [stage, openPanel, runTool, reuseTool, revise, t, setStates],
  );

  const runSteps = useCallback(
    async (only: (step: PlanStep) => boolean) => {
      if (busy) return;
      const forDraft = draftRef.current;
      setBusy(true);
      try {
        for (const [index, step] of plan.steps.entries()) {
          if (!only(step)) continue;
          if (draftRef.current !== forDraft) return;
          if (!(await runStep(step, index))) return;
        }
      } finally {
        if (draftRef.current === forDraft) setBusy(false);
      }
    },
    [busy, plan, runStep, draftRef],
  );

  /** Run everything that can run on the draft. */
  const doIt = useCallback(() => runSteps((s) => s.kind !== "panel"), [runSteps]);
  /** Findings only — nothing on the résumé changes (so no re-score either). */
  const showFirst = useCallback(() => runSteps((s) => s.kind === "tool" && !s.afterChanges), [runSteps]);
  const openStep = useCallback((index: number) => void runStep(plan.steps[index], index), [plan, runStep]);

  const stepStates = plan.steps.map((step, i) => {
    const fromRuns = stateFromRuns(step, runs);
    return fromRuns !== "idle" ? fromRuns : (states[key(stage, i)] ?? "idle");
  });
  return { plan, stepStates, busy, doIt, showFirst, openStep };
}

/** What the plan card needs to show and run the open stage's plan. */
export type StagePlanControls = ReturnType<typeof useStagePlan>;
