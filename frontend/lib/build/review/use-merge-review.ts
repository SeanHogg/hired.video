/**
 * useMergeReview — merge another résumé INTO what is on the page, reviewed
 * on the page; also "Pull into this version" (the master merged into a
 * stale version, same engine, same review).
 *
 *   analyse   POST /merge/from-file | /merge/analyze with the page's
 *             content as the target (inline — unsaved edits count)
 *   decide    useMergeDecisions; the "Needs you" queue = basics conflicts,
 *             entries the engine was unsure about, likely-misclassified
 *             new items. Apply waits until the queue is empty.
 *   preview   POST /merge/preview (debounced) → the After page; marks =
 *             diff(before, after); any mark can still be reverted
 *   apply     "Update my master" (default; ONE undo step on the page) or
 *             "Save as a version of master". When the page is a version,
 *             "Also add to my master" re-runs the merge against the master
 *             with default decisions. A pull marks the version in sync.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ResumeContentSchema, type ResumeContent } from "@shared/resume";
import type { ResumeLineage } from "@shared/resume-lineage";
import { resumeService } from "@/lib/services/resume-service";
import { resumeVersionsService } from "@/lib/services/resume-versions-service";
import { mergeReimported } from "@/lib/build/use-resume-reimport";
import { buildDecisions, buildFinalDecisions, buildNewItemDecisions, newItemKey } from "@/lib/merge/merge-decisions";
import { describeMergeItem } from "@/lib/merge/merge-labels";
import { useMergeDecisions, type MergeDecisionState } from "@/lib/merge/use-merge-decisions";
import type { MergeAnalysis } from "@/types/resume";
import { diffContent } from "./content-diff";
import type { ReviewCore, ReviewHost } from "./review-model";
import { useChangeList } from "./use-change-list";
import { reviewErrorKey } from "./review-errors";
import { saveVersionOfMaster } from "./save-version";

export type MergeSource = { kind: "file"; file: File } | { kind: "resume"; resumeId: string; title: string };
export type MergeSaveChoice = "update" | "version";

export interface QueueItem {
  id: string;
  /** Where its card is on the page. */
  path: string;
  kind: "basics" | "match" | "misclassified";
  /** The field (basics) or the entry's name, for the queue row. */
  name: string;
  done: boolean;
}

export interface MergeReview extends ReviewCore {
  kind: "merge" | "pull";
  analysis: MergeAnalysis | null;
  parseConfidence: number | null;
  sourceContent: Record<string, unknown> | null;
  decisions: MergeDecisionState;
  queue: readonly QueueItem[];
  resolve: (id: string) => void;
  saveChoice: MergeSaveChoice;
  setSaveChoice: (c: MergeSaveChoice) => void;
  versionTitle: string;
  setVersionTitle: (t: string) => void;
  /** Only when the page is a version: also merge into the master. */
  alsoMaster: boolean | null;
  setAlsoMaster: (on: boolean) => void;
  lineage: ResumeLineage | null;
}

type Run = {
  kind: "merge" | "pull";
  subject: string;
  baseline: ResumeContent;
  status: ReviewCore["status"];
  errorKey?: string;
  analysis: MergeAnalysis | null;
  sourceContent: Record<string, unknown> | null;
  parseConfidence: number | null;
};

const PREVIEW_DEBOUNCE_MS = 250;

function queueOf(a: MergeAnalysis, source: Record<string, unknown>): Array<Omit<QueueItem, "done">> {
  const nameOf = (section: string, item: unknown) => describeMergeItem(section, (item ?? {}) as Record<string, unknown>).label;
  return [
    ...a.basics.conflicts.map((c) => ({ id: `basics:${c.field}`, path: "basics", kind: "basics" as const, name: c.field })),
    ...a.sectionMatches
      .filter((m) => m.mergeAction === "manual")
      .map((m) => ({
        id: `match:${m.sectionType}:${m.sourceIndex}`,
        path: m.targetIndex !== null ? `${m.sectionType}.${m.targetIndex}` : m.sectionType,
        kind: "match" as const,
        name: nameOf(m.sectionType, (source[m.sectionType] as unknown[] | undefined)?.[m.sourceIndex]),
      })),
    ...a.newSections
      .filter((n) => n.crossSectionConflict)
      .map((n) => ({
        id: `new:${newItemKey(n.sectionType, n.sourceIndex)}`,
        path: n.sectionType,
        kind: "misclassified" as const,
        name: nameOf(n.sectionType, n.item),
      })),
  ];
}

export function useMergeReview(host: ReviewHost) {
  const { lineage } = host;
  const [run, setRun] = useState<Run | null>(null);
  const [preview, setPreview] = useState<ResumeContent | null>(null);
  const [resolved, setResolved] = useState<ReadonlySet<string>>(new Set());
  const [saveChoice, setSaveChoice] = useState<MergeSaveChoice>("update");
  const [versionTitle, setVersionTitle] = useState("");
  const [alsoMaster, setAlsoMaster] = useState(true);
  const [busy, setBusy] = useState(false);
  const runId = useRef(0);

  const decisions = useMergeDecisions(run?.analysis ?? null);
  const marks = useMemo(() => (run && preview ? diffContent(run.baseline, preview) : []), [run, preview]);
  const list = useChangeList(run?.baseline ?? null, preview, marks);

  // Server preview of the merged document, re-run as decisions change.
  const { finalDecisions, basics } = decisions;
  useEffect(() => {
    if (!run?.analysis || !run.sourceContent) return;
    const id = runId.current;
    const timer = setTimeout(() => {
      resumeService
        .previewMerge({ sourceContent: run.sourceContent ?? {}, targetContent: run.baseline, decisions: finalDecisions, basicDecisions: basics })
        .then((p) => {
          if (id !== runId.current) return;
          const parsed = ResumeContentSchema.safeParse(p.mergedContent);
          setPreview(parsed.success ? mergeReimported(run.baseline, parsed.data) : null);
        })
        .catch((err) => {
          if (id === runId.current) setRun((r) => (r ? { ...r, status: "error", errorKey: reviewErrorKey(err) } : r));
        });
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [run?.analysis, run?.sourceContent, run?.baseline, finalDecisions, basics]);

  const { reset: resetList } = list;
  const begin = useCallback(
    async (kind: "merge" | "pull", subject: string, analyse: (target: ResumeContent) => Promise<Pick<Run, "analysis" | "sourceContent" | "parseConfidence">>) => {
      if (!host.draft || !host.requireAccount("review.auth.merge")) return;
      const id = ++runId.current;
      const baseline = host.draft;
      resetList();
      setPreview(null);
      setResolved(new Set());
      setSaveChoice("update");
      setAlsoMaster(true);
      setRun({ kind, subject, baseline, status: "loading", analysis: null, sourceContent: null, parseConfidence: null });
      try {
        const result = await analyse(baseline);
        if (id === runId.current) setRun({ kind, subject, baseline, status: "ready", ...result });
      } catch (err) {
        if (id === runId.current) setRun((r) => (r ? { ...r, status: "error", errorKey: reviewErrorKey(err) } : r));
      }
    },
    [host, resetList],
  );

  /** Merge a dropped file or another saved résumé into the page. */
  const start = useCallback(
    (source: MergeSource) => {
      const subject = source.kind === "file" ? source.file.name : source.title;
      setVersionTitle(subject);
      return begin("merge", subject, async (target) => {
        if (source.kind === "file") {
          const r = await resumeService.analyzeFileMerge(source.file, { content: target });
          return { analysis: r.analysis, sourceContent: r.parsedContent, parseConfidence: r.parseConfidence };
        }
        const r = await resumeService.analyzeMerge(source.resumeId, { content: target });
        return { analysis: r.analysis, sourceContent: r.sourceContent, parseConfidence: null };
      });
    },
    [begin],
  );

  /** "Pull into this version": the master merged into the open version. */
  const startPull = useCallback(
    (masterId: string, masterTitle: string) =>
      begin("pull", masterTitle, async (target) => {
        const r = await resumeService.analyzeMerge(masterId, { content: target });
        return { analysis: r.analysis, sourceContent: r.sourceContent, parseConfidence: null };
      }),
    [begin],
  );

  const discard = useCallback(() => {
    runId.current++;
    setRun(null);
    setPreview(null);
  }, []);

  const queue: QueueItem[] = useMemo(() => {
    if (!run?.analysis) return [];
    return queueOf(run.analysis, run.sourceContent ?? {}).map((q) => ({
      ...q,
      done: q.kind === "basics" ? !!basics[q.id.slice("basics:".length)] || resolved.has(q.id) : resolved.has(q.id),
    }));
  }, [run?.analysis, run?.sourceContent, basics, resolved]);
  const remaining = queue.filter((q) => !q.done).length;
  const resolve = useCallback((id: string) => setResolved((prev) => new Set(prev).add(id)), []);

  const final = list.final;
  const apply = useCallback(async () => {
    if (!run || !final) return;
    setBusy(true);
    try {
      if (run.kind === "merge" && saveChoice === "version") {
        await saveVersionOfMaster(host, { content: final, title: versionTitle.trim() || run.subject });
      } else {
        host.commit(final);
        if (run.kind === "pull" && host.resumeId) await resumeVersionsService.markSynced(host.resumeId);
        const master = lineage?.role === "version" ? lineage.master : null;
        if (run.kind === "merge" && master && alsoMaster && run.sourceContent) {
          const a = await resumeService.analyzeParsedMerge(run.sourceContent, master.id);
          await resumeService.executeMerge({
            sourceContent: run.sourceContent,
            targetResumeId: master.id,
            decisions: buildFinalDecisions(buildDecisions(a.analysis), buildNewItemDecisions(a.analysis)),
            basicDecisions: {},
            createNew: false,
          });
        }
        host.refreshLineage();
      }
      discard();
    } finally {
      setBusy(false);
    }
  }, [run, final, saveChoice, versionTitle, host, lineage, alsoMaster, discard]);

  const review: MergeReview | null = useMemo(() => {
    if (!run) return null;
    return {
      kind: run.kind,
      status: run.status === "ready" && !preview ? "loading" : run.status,
      errorKey: run.errorKey,
      subject: run.subject,
      baseline: run.baseline,
      proposed: final,
      changes: list.list,
      remaining,
      setChange: list.setChange,
      setAll: list.setAll,
      primary: run.analysis
        ? { labelKey: run.kind === "pull" ? "review.merge.applyPull" : saveChoice === "version" ? "review.saveVersion" : "review.merge.apply", run: apply, busy }
        : null,
      discard,
      analysis: run.analysis,
      parseConfidence: run.parseConfidence,
      sourceContent: run.sourceContent,
      decisions,
      queue,
      resolve,
      saveChoice,
      setSaveChoice,
      versionTitle,
      setVersionTitle,
      alsoMaster: lineage?.role === "version" && run.kind === "merge" ? alsoMaster : null,
      setAlsoMaster,
      lineage,
    };
  }, [run, preview, final, list, remaining, saveChoice, apply, busy, discard, decisions, queue, resolve, versionTitle, alsoMaster, lineage]);

  return { review, start, startPull };
}
