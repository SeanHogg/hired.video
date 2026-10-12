/**
 * useReviewHandoff — a review another page asked the kit workspace to open (the merge
 * and tailor tool pages hand off with `?resume=…&merge=…` / `&job=…`, or a
 * file / pasted job post in router state). The résumé loads first; the
 * review starts once it is on the page (it reviews against what is there).
 */
import { useEffect, useState } from "react";
import type { BuildReview } from "./use-build-review";
import type { MergeSource } from "./use-merge-review";
import type { JobInput } from "./use-tailor-review";

export type ReviewHandoff =
  | { kind: "merge"; source: MergeSource }
  | { kind: "job"; job: JobInput; create: boolean };

export function useReviewHandoff(review: BuildReview, ready: boolean) {
  const [pending, setPending] = useState<ReviewHandoff | null>(null);
  const { startMerge, startTailor, startFromJob } = review;

  useEffect(() => {
    if (!ready || !pending) return;
    setPending(null);
    if (pending.kind === "merge") startMerge(pending.source);
    else if (pending.create) startFromJob(pending.job);
    else startTailor(pending.job);
  }, [ready, pending, startMerge, startTailor, startFromJob]);

  return setPending;
}
