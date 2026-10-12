// Shared hook for AI tools that produce a `{ original, improved }` text
// rewrite and want to push the rewrite back into a saved resume's structured
// content (work highlights, summaries, project bullets, etc.).
//
// The hook self-gates on `resumeId`: callers don't pass a `canApply` boolean
// — they just call `applyRewrite` and let the hook decide whether the apply
// is possible. When no resumeId is bound, `applyRewrite` returns
// `{ ok: false, reason: "no_resume" }` and the consumer can render a "Save
// as resume to apply edits" CTA without duplicating the gating logic.
//
// The hook owns React state (isApplying, per-row outcomes); the actual
// fetch → mutate → persist pipeline lives in `applyResumeRewrite` so the
// AI-coach tool runner can reuse it without dragging in React.

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  applyResumeRewrite,
  type ApplyRewriteResult,
} from "@/lib/tools/apply-rewrite";

export type { ApplyRewriteResult };

interface ApplyOptions {
  /** Free-text snippet expected to match a bullet/summary in the resume. */
  original: string;
  /** Replacement text. */
  improved: string;
}

export interface UseApplyToResume {
  /** True while a save is in flight. */
  isApplying: boolean;
  /** Map of `original` → outcome, so the caller can render per-row badges. */
  outcomes: Record<string, ApplyRewriteResult>;
  /** True iff this hook has a resume bound and apply is possible. */
  canApply: boolean;
  applyRewrite: (opts: ApplyOptions) => Promise<ApplyRewriteResult>;
}

export function useApplyToResume(resumeId: string | undefined): UseApplyToResume {
  const [isApplying, setIsApplying] = useState(false);
  const [outcomes, setOutcomes] = useState<Record<string, ApplyRewriteResult>>({});
  const queryClient = useQueryClient();

  const applyRewrite = useCallback(
    async ({ original, improved }: ApplyOptions): Promise<ApplyRewriteResult> => {
      setIsApplying(true);
      try {
        const result = await applyResumeRewrite(resumeId, original, improved, queryClient);
        setOutcomes((prev) => ({ ...prev, [original]: result }));
        return result;
      } finally {
        setIsApplying(false);
      }
    },
    [resumeId, queryClient],
  );

  return {
    isApplying,
    outcomes,
    canApply: !!resumeId,
    applyRewrite,
  };
}
