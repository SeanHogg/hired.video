/**
 * useWorkspaceReview — the kit review layer wired to the workspace's own
 * hooks: the session owner (useBuildReview), the composer / paperclip
 * router (useReviewIntake) and tool-page hand-offs (useReviewHandoff).
 * Composition only, so Build.tsx makes one call.
 */
import type { ResumeContent } from "@shared/resume";
import { useBuildReview } from "./use-build-review";
import { useReviewHandoff } from "./use-review-handoff";
import { useReviewIntake } from "./use-review-intake";

interface Args {
  draft: ResumeContent | null;
  draftKey: unknown;
  ready: boolean;
  resumeId: string | null;
  ensureSaved: () => Promise<string>;
  commit: (next: ResumeContent, group?: string) => void;
  openResume: (content: ResumeContent, title: string, resumeId: string) => void;
  requireAccount: (reasonKey: string) => boolean;
  /** "Start over with it": re-import a second résumé into the open one. */
  replaceWith: (file: File) => void;
}

export function useWorkspaceReview({ ready, replaceWith, ...args }: Args) {
  const review = useBuildReview(args);
  const intake = useReviewIntake({ review, resumeId: args.resumeId, ensureSaved: args.ensureSaved, replaceWith });
  const openHandoff = useReviewHandoff(review, ready);
  return { review, intake, openHandoff };
}
