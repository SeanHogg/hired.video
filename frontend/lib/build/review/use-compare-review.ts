/**
 * useCompareReview — "Just compare": another résumé file next to the one on
 * the page, read-only. Same page marks + compare panel as every review, no
 * action; the page is never changed.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import type { ResumeContent } from "@shared/resume";
import { resumeService } from "@/lib/services/resume-service";
import { mergeReimported } from "@/lib/build/use-resume-reimport";
import { diffContent } from "./content-diff";
import type { ReviewCore, ReviewHost } from "./review-model";
import { useChangeList } from "./use-change-list";
import { reviewErrorKey } from "./review-errors";

export interface CompareReview extends ReviewCore {
  kind: "compare";
}

type Run = { subject: string; baseline: ResumeContent; other: ResumeContent | null; status: ReviewCore["status"]; errorKey?: string };

export function useCompareReview(host: ReviewHost) {
  const [run, setRun] = useState<Run | null>(null);
  const runId = useRef(0);
  const changes = useMemo(() => (run?.other ? diffContent(run.baseline, run.other) : []), [run]);
  const list = useChangeList(run?.baseline ?? null, run?.other ?? null, changes);

  const start = useCallback(
    async (file: File) => {
      if (!host.draft) return;
      const id = ++runId.current;
      const baseline = host.draft;
      setRun({ subject: file.name, baseline, other: null, status: "loading" });
      try {
        const { data } = await resumeService.parseResumeFromFile(file);
        if (id === runId.current) setRun({ subject: file.name, baseline, other: mergeReimported(baseline, data), status: "ready" });
      } catch (err) {
        if (id === runId.current) setRun({ subject: file.name, baseline, other: null, status: "error", errorKey: reviewErrorKey(err) });
      }
    },
    [host.draft],
  );
  const discard = useCallback(() => {
    runId.current++;
    setRun(null);
  }, []);

  const review: CompareReview | null = useMemo(
    () =>
      run && {
        kind: "compare",
        status: run.status,
        errorKey: run.errorKey,
        subject: run.subject,
        baseline: run.baseline,
        proposed: run.other,
        changes: list.list.map((c) => ({ ...c, status: "kept" as const })),
        remaining: 0,
        setChange: () => undefined,
        setAll: () => undefined,
        primary: null,
        discard,
      },
    [run, list.list, discard],
  );

  return { review, start };
}
