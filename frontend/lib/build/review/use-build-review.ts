/**
 * useBuildReview — THE owner of the kit's review session (merge a résumé in,
 * pull the master into a version, compare, tailor to a job, create from a
 * job, review a chat revision). One review is open at a time; starting one
 * closes the others; a new draft (new parse, Start over) closes all.
 *
 * Owns the shared UI state too — Changes / Before / After, the compare
 * panel, the selected change — and the page content that state implies,
 * so the page, the chat column and the compare panel all read ONE model.
 * Applying is the review's own primary action; anything it puts on the
 * page goes through `commit` = one undo step in the existing history.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ResumeContent } from "@shared/resume";
import type { ReviewCore, ReviewHost, ReviewView } from "./review-model";
import { useResumeLineage } from "./use-resume-lineage";
import { useMergeReview, type MergeReview, type MergeSource } from "./use-merge-review";
import { useTailorReview, type JobInput, type TailorReview } from "./use-tailor-review";
import { useJobDraftReview, type JobDraftReview } from "./use-job-draft-review";
import { useReviseReview, type ReviseReview } from "./use-revise-review";
import { useCompareReview, type CompareReview } from "./use-compare-review";

export type ActiveReview = MergeReview | TailorReview | JobDraftReview | ReviseReview | CompareReview;

interface Args {
  draft: ResumeContent | null;
  /** Identity of the draft — a new one closes any review. */
  draftKey: unknown;
  resumeId: string | null;
  ensureSaved: () => Promise<string>;
  commit: (next: ResumeContent, group?: string) => void;
  openResume: (content: ResumeContent, title: string, resumeId: string) => void;
  requireAccount: (reasonKey: string) => boolean;
}

export function useBuildReview({ draft, draftKey, resumeId, ensureSaved, commit, openResume, requireAccount }: Args) {
  const { lineage, refresh } = useResumeLineage(resumeId);
  const host: ReviewHost = useMemo(
    () => ({
      draft,
      resumeId,
      lineage,
      ensureSaved,
      commit: (next) => commit(next, "review"),
      openResume,
      refreshLineage: refresh,
      requireAccount,
    }),
    [draft, resumeId, lineage, ensureSaved, commit, openResume, refresh, requireAccount],
  );

  const merge = useMergeReview(host);
  const tailor = useTailorReview(host);
  const fromJob = useJobDraftReview(host);
  const revise = useReviseReview(host);
  const compare = useCompareReview(host);
  const all = [merge.review, tailor.review, fromJob.review, revise.review, compare.review];
  const active: ActiveReview | null = all.find((r): r is NonNullable<typeof r> => r !== null) ?? null;

  const [view, setView] = useState<ReviewView>("changes");
  const [compareOpen, setCompareOpen] = useState(false);
  const [selected, setSelected] = useState(0);

  // Close every open review, then run `start` — one review at a time.
  const allRef = useRef(all);
  allRef.current = all;
  const exclusive = useCallback(<A extends unknown[]>(start: (...a: A) => unknown) => (...a: A) => {
    allRef.current.forEach((r) => r?.discard());
    setView("changes");
    setCompareOpen(false);
    setSelected(0);
    void start(...a);
  }, []);

  const startMerge = useMemo(() => exclusive((s: MergeSource) => merge.start(s)), [exclusive, merge.start]);
  const startPull = useMemo(() => exclusive((id: string, title: string) => merge.startPull(id, title)), [exclusive, merge.startPull]);
  const startTailor = useMemo(() => exclusive((job: JobInput) => tailor.start(job)), [exclusive, tailor.start]);
  const startFromJob = useMemo(() => exclusive((job: JobInput) => fromJob.start(job)), [exclusive, fromJob.start]);
  const startRevise = useMemo(() => exclusive((b: ResumeContent, a: ResumeContent) => revise.start(b, a)), [exclusive, revise.start]);
  const startCompare = useMemo(() => exclusive((file: File) => compare.start(file)), [exclusive, compare.start]);

  // The last chat revision, so its reply can open it for review. The chat
  // applies through `onRevised` (the same one undo step as before).
  const [lastRevision, setLastRevision] = useState<{ before: ResumeContent; after: ResumeContent } | null>(null);
  const onRevised = useCallback(
    (next: ResumeContent) => {
      if (draft) setLastRevision({ before: draft, after: next });
      commit(next);
    },
    [draft, commit],
  );
  const reviewLastRevision = useMemo(
    () => (lastRevision ? () => startRevise(lastRevision.before, lastRevision.after) : undefined),
    [lastRevision, startRevise],
  );

  const draftRef = useRef(draftKey);
  useEffect(() => {
    if (draftRef.current === draftKey) return;
    draftRef.current = draftKey;
    allRef.current.forEach((r) => r?.discard());
    setLastRevision(null);
  }, [draftKey]);

  /** What the page shows now. */
  const pageContent: ResumeContent | null = !active
    ? draft
    : view === "before"
      ? (active.baseline ?? draft)
      : (active.proposed ?? active.baseline ?? draft);

  const changeCount = active?.changes.length ?? 0;
  const select = useCallback(
    (i: number) => setSelected(changeCount === 0 ? 0 : ((i % changeCount) + changeCount) % changeCount),
    [changeCount],
  );

  return {
    active: active as (ActiveReview & ReviewCore) | null,
    lineage,
    pageContent,
    view,
    setView,
    compareOpen,
    openCompare: () => setCompareOpen(true),
    closeCompare: () => setCompareOpen(false),
    selected: Math.min(selected, Math.max(0, changeCount - 1)),
    select,
    startMerge,
    startPull,
    startTailor,
    startFromJob,
    startCompare,
    onRevised,
    reviewLastRevision,
  };
}

export type BuildReview = ReturnType<typeof useBuildReview>;
