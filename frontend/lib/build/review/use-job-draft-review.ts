/**
 * useJobDraftReview — "Create a new one for this job": a résumé built from
 * the master's own evidence (POST /api/resume-versions/from-job, nothing
 * saved), reviewed on the page, saved as a VERSION OF THE MASTER.
 *
 *   • every requirement maps to the bullets that prove it (R1…Rn chips);
 *   • a requirement with no evidence is a question ON the page — answered,
 *     it becomes a bullet / skill (and, "Also add it to my master", a fact
 *     on the master); skipped, it stays off; the draft never claims it;
 *   • "Left out for this job" items are hidden until "Show";
 *   • the AI's rephrasings are Keep / Revert / Edit like a tailor.
 *
 * Built from: the master (default), the master + its versions (more
 * evidence), or the résumé that is open.
 *
 * The job's cover letter is written automatically once the draft is ready
 * (use-cover-letter-writer.ts) and saved on the version.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { coveredCount, type FromJobDraft, type JobRequirement } from "@shared/resume-from-job";
import { omitPaths } from "@shared/resume-path";
import { applyConfirmedFacts } from "@shared/resume-tailor";
import { withCoverLetter } from "@shared/cover-letter";
import { resumeVersionsService } from "@/lib/services/resume-versions-service";
import type { ReviewCore, ReviewHost } from "./review-model";
import type { JobInput } from "./use-tailor-review";
import { useChangeList, type AnchoredChange } from "./use-change-list";
import { useGapAnswers, type GapAnswers } from "./use-gap-answers";
import { reviewErrorKey } from "./review-errors";
import { saveLabelKey, saveReviewedResume } from "./save-version";
import { useCoverLetterWriter } from "./use-cover-letter-writer";

export type EvidenceSource = "master" | "masterAndVersions" | "open";

export interface JobDraftReview extends ReviewCore {
  kind: "fromJob";
  job: JobInput;
  evidence: EvidenceSource;
  setEvidence: (source: EvidenceSource) => void;
  draft: FromJobDraft | null;
  /** Requirements with answered gaps counted as covered. */
  requirements: readonly JobRequirement[];
  covered: number;
  answers: GapAnswers;
  openQuestions: number;
  showLeftOut: boolean;
  setShowLeftOut: (show: boolean) => void;
  /** Paths hidden from the draft right now (left out, not shown). */
  hiddenPaths: readonly string[];
}

type Run = { job: JobInput; evidence: EvidenceSource; draft: FromJobDraft | null; status: ReviewCore["status"]; errorKey?: string };

export function useJobDraftReview(host: ReviewHost) {
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const [showLeftOut, setShowLeftOut] = useState(false);
  const runId = useRef(0);
  const draft = run?.draft ?? null;

  const changes: AnchoredChange[] = useMemo(
    () =>
      (draft?.changes ?? []).map((c, i) => ({
        id: `j${i}`,
        path: c.path ?? c.section,
        section: c.section,
        kind: "changed" as const,
        before: c.before,
        after: c.after,
        why: c.why,
      })),
    [draft],
  );
  const list = useChangeList(draft?.sourceContent ?? null, draft?.content ?? null, changes);
  const answers = useGapAnswers(draft?.gaps ?? [], draft?.content ?? null);
  const hiddenPaths = useMemo(() => (showLeftOut ? [] : (draft?.leftOut ?? []).map((l) => l.path)), [draft, showLeftOut]);
  const fitted = useMemo(
    () => (list.final ? omitPaths(applyConfirmedFacts(list.final, answers.facts), hiddenPaths) : null),
    [list.final, answers.facts, hiddenPaths],
  );
  const writer = useCoverLetterWriter();
  const final = useMemo(() => (fitted ? withCoverLetter(fitted, writer.letter) : null), [fitted, writer.letter]);

  const { reset: resetList } = list;
  const { reset: resetAnswers } = answers;
  const { request: requestLetter, reset: resetLetter } = writer;
  const load = useCallback(
    async (job: JobInput, evidence: EvidenceSource) => {
      if (!host.requireAccount("review.auth.fromJob")) return;
      const id = ++runId.current;
      resetList();
      resetAnswers();
      setShowLeftOut(false);
      resetLetter();
      setRun({ job, evidence, draft: null, status: "loading" });
      try {
        const resumeId = evidence === "open" ? (host.resumeId ?? (await host.ensureSaved())) : undefined;
        const result = await resumeVersionsService.draftFromJob({
          jobId: job.jobId,
          jobHtml: job.jobHtml,
          resumeId,
          includeVersions: evidence === "masterAndVersions",
        });
        if (id !== runId.current) return;
        setRun({ job, evidence, draft: result, status: "ready" });
        requestLetter(job, result.content);
      } catch (err) {
        if (id === runId.current) setRun({ job, evidence, draft: null, status: "error", errorKey: reviewErrorKey(err) });
      }
    },
    [host, resetList, resetAnswers, resetLetter, requestLetter],
  );

  const start = useCallback((job: JobInput) => load(job, "master"), [load]);

  const discard = useCallback(() => {
    runId.current++;
    setRun(null);
    resetLetter();
  }, [resetLetter]);

  const save = useCallback(async () => {
    if (!draft || !final) return;
    setBusy(true);
    try {
      const title = [draft.job.title, draft.job.company].filter(Boolean).join(" - ") || run?.job.label || "";
      await saveReviewedResume(host, { content: final, title, facts: answers.facts, alsoMaster: answers.alsoMaster });
      discard();
    } finally {
      setBusy(false);
    }
  }, [draft, final, run?.job.label, host, answers.facts, answers.alsoMaster, discard]);

  const review: JobDraftReview | null = useMemo(() => {
    if (!run) return null;
    const answered = new Set(
      (draft?.gaps ?? []).filter((g) => answers.answerOf(g.id).status === "confirmed").map((g) => g.id),
    );
    const requirements = (draft?.requirements ?? []).map((r) =>
      r.status === "gap" && answered.has(r.id) ? { ...r, status: "covered" as const } : r,
    );
    const openQuestions = (draft?.gaps ?? []).filter((g) => answers.answerOf(g.id).status === "open").length;
    return {
      kind: "fromJob",
      status: run.status,
      errorKey: run.errorKey,
      subject: draft ? [draft.job.title, draft.job.company].filter(Boolean).join(" · ") : run.job.label,
      baseline: draft?.sourceContent ?? host.draft,
      proposed: final,
      changes: list.list,
      remaining: 0,
      setChange: list.setChange,
      setAll: list.setAll,
      editChange: list.editChange,
      primary: draft ? { labelKey: saveLabelKey(host), run: save, busy } : null,
      discard,
      job: run.job,
      evidence: run.evidence,
      setEvidence: (source) => void load(run.job, source),
      draft,
      requirements,
      covered: coveredCount(requirements),
      answers,
      openQuestions,
      showLeftOut,
      setShowLeftOut,
      hiddenPaths,
      letter: writer.draft(run.job, fitted),
    };
  }, [run, draft, final, fitted, list, answers, save, busy, discard, load, showLeftOut, hiddenPaths, host, writer.draft]);

  return { review, start };
}
