/**
 * The kit link (path + router state) that opens `resumeId` with a review —
 * the exact inverse of useBuildEntry's `reviewFrom`, so a tool page hands off
 * without knowing the kit's URL shape.
 */
import type { BuildEntryState } from "@/lib/build-entry";
import { resumeEditorPath, resumeJobPath, resumeMergePath } from "@/lib/studio/resume-editor-link";
import type { ReviewHandoff } from "./use-review-handoff";

export interface ReviewHandoffLink {
  path: string;
  state: BuildEntryState;
}

export function reviewHandoffLink(resumeId: string, handoff: ReviewHandoff): ReviewHandoffLink {
  if (handoff.kind === "merge") {
    const { source } = handoff;
    return source.kind === "file"
      ? { path: resumeEditorPath(resumeId), state: { mergeFile: source.file } }
      : { path: resumeMergePath(resumeId, source.resumeId), state: { mergeLabel: source.title || undefined } };
  }
  const { job, create } = handoff;
  if (job.jobId) return { path: resumeJobPath(resumeId, job.jobId, create), state: { jobLabel: job.label || undefined } };
  return {
    path: resumeEditorPath(resumeId),
    state: { jobText: job.jobHtml, jobLabel: job.label || undefined, createForJob: create },
  };
}
