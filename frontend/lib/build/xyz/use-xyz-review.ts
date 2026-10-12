/**
 * useXyzReview — the whole-résumé XYZ pass (#990) on one résumé: walks every
 * step (xyz-review.ts), asks the XYZ endpoints for each rewrite as it comes
 * up, and keeps the person's Apply / Skip per step. Finishing writes every
 * applied step through the one résumé content port in ONE change — on the kit workspace
 * that is the open draft, so the whole pass is ONE Undo step; elsewhere it is
 * one save of the row.
 *
 * The cursor and the decisions survive a reload (per résumé, in this
 * browser — useDraftScopedState), so a refresh resumes the pass instead of
 * restarting it. Rewrites are paid AI: the pass asks for Pro up front.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ResumeContent } from "@shared/resume";
import { useProGateState } from "@/lib/hooks/use-pro-gate-state";
import { readResumeContent, writeResumeContent } from "@/lib/tools/resume-content";
import { xyzRewriteService } from "@/lib/services/xyz-rewrite-service";
import { useDraftScopedState } from "../use-draft-scoped-state";
import { applyXyzDecisions, appliedCount, xyzSteps, type XyzDecision, type XyzStep } from "./xyz-review";

interface Progress {
  started: boolean;
  cursor: number;
  decisions: Record<string, XyzDecision>;
}

const NOT_STARTED: Progress = { started: false, cursor: 0, decisions: {} };

const reviveProgress = (stored: unknown): Progress | null => {
  if (typeof stored !== "object" || stored === null) return null;
  const p = stored as Partial<Progress>;
  if (typeof p.cursor !== "number" || typeof p.decisions !== "object" || p.decisions === null) return null;
  return { started: p.started === true, cursor: Math.max(0, Math.floor(p.cursor)), decisions: p.decisions as Record<string, XyzDecision> };
};

export type Suggestion = { status: "loading" } | { status: "ready"; value: string | string[] } | { status: "failed" };

/** The rewrite request for one step. */
function rewrite(step: XyzStep): Promise<string | string[]> {
  if (step.kind === "highlights") {
    const bullets = (step.original as string[]).filter((h) => h.trim());
    return xyzRewriteService.highlights(bullets, step.context);
  }
  return xyzRewriteService.text(step.kind === "position" ? "position" : "summary", step.original as string, step.context);
}

export function useXyzReview(resumeId: string | null) {
  const { t } = useTranslation();
  const { requirePro, sheet: proGateSheet } = useProGateState();
  const [content, setContent] = useState<ResumeContent | null>(null);
  const [suggestions, setSuggestions] = useState<Record<string, Suggestion>>({});
  const [finishing, setFinishing] = useState(false);
  const [finished, setFinished] = useState<{ applied: number } | null>(null);
  /** Bumped by Retry so the current step asks again. */
  const [attempt, setAttempt] = useState(0);
  const { value: progress, set: setProgress } = useDraftScopedState({
    draftKey: resumeId,
    resumeId,
    slice: "xyz",
    empty: NOT_STARTED,
    revive: reviveProgress,
  });

  // The résumé as it is now (the open draft when there is one).
  useEffect(() => {
    let live = true;
    setContent(null);
    if (resumeId) void readResumeContent(resumeId).then((c) => live && setContent(c)).catch(() => live && setContent(null));
    return () => {
      live = false;
    };
  }, [resumeId]);

  const steps = useMemo(() => (content ? xyzSteps(content) : []), [content]);
  const current: XyzStep | null = progress.started ? (steps[progress.cursor] ?? null) : null;

  // Ask for the current step's rewrite once.
  const currentId = current?.id;
  useEffect(() => {
    if (!current || suggestions[current.id]) return;
    const id = current.id;
    setSuggestions((all) => ({ ...all, [id]: { status: "loading" } }));
    rewrite(current)
      .then((value) => setSuggestions((all) => ({ ...all, [id]: { status: "ready", value } })))
      .catch(() => setSuggestions((all) => ({ ...all, [id]: { status: "failed" } })));
    // Keyed by the step id (+ Retry): a new step asks, the same one does not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, attempt]);

  const start = useCallback(() => {
    if (!requirePro(t("build.xyz.proReason"))) return;
    setFinished(null);
    setProgress((p) => ({ ...p, started: true }));
  }, [requirePro, setProgress, t]);

  const retry = useCallback(() => {
    if (!current) return;
    const id = current.id;
    setSuggestions((all) => {
      const rest = { ...all };
      delete rest[id];
      return rest;
    });
    setAttempt((n) => n + 1);
  }, [current]);

  /** Apply the rewrite (as edited) — or skip with null — and move on. */
  const decide = useCallback(
    (value: string | string[] | null) => {
      if (!current) return;
      const decision: XyzDecision = value === null ? { status: "skipped" } : { status: "applied", value, original: current.original };
      setProgress((p) => ({ ...p, cursor: p.cursor + 1, decisions: { ...p.decisions, [current.id]: decision } }));
    },
    [current, setProgress],
  );

  const back = useCallback(() => setProgress((p) => ({ ...p, cursor: Math.max(0, p.cursor - 1) })), [setProgress]);

  /** Drop the whole pass — nothing was written yet. */
  const cancelAll = useCallback(() => {
    setProgress(NOT_STARTED);
    setSuggestions({});
  }, [setProgress]);

  /** Write every applied step in ONE change (one Undo step on the kit workspace). */
  const finish = useCallback(async () => {
    if (!resumeId) return;
    setFinishing(true);
    try {
      const applied = appliedCount(progress.decisions);
      if (applied > 0) {
        await writeResumeContent(
          resumeId,
          (copy) => {
            const next = applyXyzDecisions(copy, progress.decisions);
            return next === copy ? null : next;
          },
          "ai:xyz-review",
        );
      }
      setFinished({ applied });
      setProgress(NOT_STARTED);
      setSuggestions({});
      setContent(await readResumeContent(resumeId).catch(() => null));
    } finally {
      setFinishing(false);
    }
  }, [resumeId, progress.decisions, setProgress]);

  return {
    loading: resumeId !== null && content === null,
    steps,
    started: progress.started,
    cursor: progress.cursor,
    current,
    suggestion: current ? (suggestions[current.id] ?? { status: "loading" as const }) : null,
    decisions: progress.decisions,
    applied: appliedCount(progress.decisions),
    /** Every step has a decision: only Finish is left. */
    atEnd: progress.started && progress.cursor >= steps.length,
    finishing,
    finished,
    start,
    retry,
    decide,
    back,
    cancelAll,
    finish,
    proGateSheet,
  };
}

export type XyzReview = ReturnType<typeof useXyzReview>;
