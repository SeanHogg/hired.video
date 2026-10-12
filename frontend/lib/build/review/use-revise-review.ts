/**
 * useReviseReview — per-change review of a kit chat revision.
 *
 * A chat change request still applies at once (one undo step, as before);
 * the revision only returns the whole revised résumé, so its changes are
 * computed client-side (content-diff.ts). "Review changes" on the reply
 * opens them on the page with Before / After / compare and a Revert per
 * change; "Done" applies the reverts to the CURRENT draft as one undo step
 * (anything edited since stays).
 */
import { useCallback, useMemo, useState } from "react";
import type { ResumeContent } from "@shared/resume";
import { diffContent, revertChanges } from "./content-diff";
import type { ReviewCore, ReviewHost } from "./review-model";
import { useChangeList } from "./use-change-list";

export interface ReviseReview extends ReviewCore {
  kind: "revise";
}

export function useReviseReview(host: ReviewHost) {
  const [run, setRun] = useState<{ before: ResumeContent; after: ResumeContent } | null>(null);
  const changes = useMemo(() => (run ? diffContent(run.before, run.after) : []), [run]);
  const list = useChangeList(run?.before ?? null, run?.after ?? null, changes);

  const { reset } = list;
  const start = useCallback(
    (before: ResumeContent, after: ResumeContent) => {
      reset();
      setRun({ before, after });
    },
    [reset],
  );
  const discard = useCallback(() => setRun(null), []);

  const done = useCallback(async () => {
    if (!run || !host.draft) return;
    const reverted = changes.filter((c) => list.list.find((l) => l.id === c.id)?.status === "reverted");
    if (reverted.length > 0) host.commit(revertChanges(host.draft, run.before, reverted));
    discard();
  }, [run, host, changes, list.list, discard]);

  const review: ReviseReview | null = useMemo(
    () =>
      run && {
        kind: "revise",
        status: "ready",
        subject: "",
        baseline: run.before,
        proposed: list.final,
        changes: list.list,
        remaining: 0,
        setChange: list.setChange,
        setAll: list.setAll,
        primary: { labelKey: "review.revise.done", run: done, busy: false },
        discard,
      },
    [run, list, done, discard],
  );

  return { review, start };
}
