/**
 * useTailorReview — fit the open résumé to a job, review every change on
 * the page, save a VERSION OF THE MASTER.
 *
 * Source = what is on screen (the master, or the version that is open);
 * the server tailors it in preview mode (nothing saved), each change with
 * its content path + why, plus what the job asks for that the résumé does
 * not show (gaps). Keep / Revert / Edit per change (use-change-list.ts);
 * gap answers (use-gap-answers.ts) are added to the copy and — "Also add
 * it to my master", on by default — to the master. Saving goes over the
 * open résumé when it is already a version, else becomes a new version of
 * the master (save-version.ts).
 *
 * The cover letter for the job is written automatically once the tailored
 * résumé is ready (use-cover-letter-writer.ts) and saved on the version.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ResumeContent } from "@shared/resume";
import { applyConfirmedFacts, type JobGap } from "@shared/resume-tailor";
import { withCoverLetter } from "@shared/cover-letter";
import { matchService, type JobTailorResponse } from "@/lib/services/match-service";
import { useToolRunRecorder } from "@/lib/tools/use-tool-run-recorder";
import { tailorRunRecord } from "./tailor-run-record";
import type { ReviewCore, ReviewHost } from "./review-model";
import { useChangeList, type AnchoredChange } from "./use-change-list";
import { useGapAnswers, type GapAnswers } from "./use-gap-answers";
import { reviewErrorKey } from "./review-errors";
import { saveLabelKey, saveReviewedResume } from "./save-version";
import { useCoverLetterWriter } from "./use-cover-letter-writer";

/** A job to fit: tracked (`jobId`) or pasted / fetched text (`jobHtml`). */
export interface JobInput {
  jobId?: string;
  jobHtml?: string;
  /** "VP Engineering · Northwind Health" or a file name. */
  label: string;
}

export interface TailorReview extends ReviewCore {
  kind: "tailor";
  job: JobInput;
  oldScore: number;
  /** Estimated: the tailored score scaled by how many changes are kept. */
  score: number;
  newScore: number;
  recommendations: string;
  gaps: readonly JobGap[];
  /** Job keywords already on the résumé (#2344). */
  matchedKeywords: readonly string[];
  answers: GapAnswers;
}

type Run = { job: JobInput; baseline: ResumeContent; result: JobTailorResponse | null; status: ReviewCore["status"]; errorKey?: string };

export function useTailorReview(host: ReviewHost) {
  const { t } = useTranslation();
  const { recordRun } = useToolRunRecorder("resume-tailor");
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const runId = useRef(0);

  const changes: AnchoredChange[] = useMemo(
    () =>
      (run?.result?.changes ?? []).map((c, i) => ({
        id: `t${i}`,
        path: c.path ?? c.section,
        section: c.section,
        kind: "changed" as const,
        before: c.before,
        after: c.after,
        why: c.why,
      })),
    [run?.result],
  );
  const list = useChangeList(run?.baseline ?? null, run?.result?.tailoredResume ?? null, changes);
  const answers = useGapAnswers(run?.result?.gaps ?? [], run?.baseline ?? null);
  const fitted = useMemo(() => (list.final ? applyConfirmedFacts(list.final, answers.facts) : null), [list.final, answers.facts]);
  const writer = useCoverLetterWriter();
  // The letter rides on the proposal; a letter the baseline carried (an
  // older job's) never survives into this job's version.
  const final = useMemo(() => (fitted ? withCoverLetter(fitted, writer.letter) : null), [fitted, writer.letter]);

  const { reset: resetList } = list;
  const { reset: resetAnswers } = answers;
  const { request: requestLetter, reset: resetLetter } = writer;
  const start = useCallback(
    async (job: JobInput) => {
      if (!host.draft || !host.requireAccount("review.auth.tailor")) return;
      const id = ++runId.current;
      const baseline = host.draft;
      resetList();
      resetAnswers();
      resetLetter();
      setRun({ job, baseline, result: null, status: "loading" });
      try {
        const resumeId = host.resumeId ?? (await host.ensureSaved());
        const result = await matchService.tailorResumeFromJobHtml({
          jobId: job.jobId,
          jobHtml: job.jobHtml,
          resumeId,
          preview: true,
          resumeContent: baseline,
        });
        if (id !== runId.current) return;
        setRun({ job, baseline, result, status: "ready" });
        requestLetter(job, result.tailoredResume);
        void recordRun(tailorRunRecord(result, t, { resumeId, jobDescription: job.jobHtml, jobLabel: job.label }));
      } catch (err) {
        if (id === runId.current) setRun({ job, baseline, result: null, status: "error", errorKey: reviewErrorKey(err) });
      }
    },
    [host, resetList, resetAnswers, resetLetter, requestLetter, recordRun, t],
  );

  const discard = useCallback(() => {
    runId.current++;
    setRun(null);
    resetLetter();
  }, [resetLetter]);

  const save = useCallback(async () => {
    if (!run?.result || !final) return;
    setBusy(true);
    try {
      await saveReviewedResume(host, {
        content: final,
        title: run.result.variationTitle,
        facts: answers.facts,
        alsoMaster: answers.alsoMaster,
      });
      discard();
    } finally {
      setBusy(false);
    }
  }, [run, final, host, answers.facts, answers.alsoMaster, discard]);

  const review: TailorReview | null = useMemo(() => {
    if (!run) return null;
    const r = run.result;
    const total = changes.length || 1;
    const oldScore = r?.oldScore ?? 0;
    const newScore = r?.newScore ?? 0;
    return {
      kind: "tailor",
      status: run.status,
      errorKey: run.errorKey,
      subject: run.job.label,
      baseline: run.baseline,
      proposed: final,
      changes: list.list,
      remaining: 0,
      setChange: list.setChange,
      setAll: list.setAll,
      editChange: list.editChange,
      primary: r ? { labelKey: saveLabelKey(host), run: save, busy } : null,
      discard,
      job: run.job,
      oldScore,
      newScore,
      score: Math.round(oldScore + ((newScore - oldScore) * list.keptCount) / total),
      recommendations: r?.summaryRecommendations ?? "",
      gaps: r?.gaps ?? [],
      matchedKeywords: r?.matchedKeywords ?? [],
      answers,
      letter: writer.draft(run.job, fitted),
    };
  }, [run, final, fitted, list, changes.length, save, busy, discard, answers, writer.draft, host]);

  return { review, start };
}
