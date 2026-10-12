/**
 * useThisLine — the selected résumé line's data for the "This line"
 * inspector: the field it is (lib/build/this-line.ts resolves the kit's
 * KitLineRef), the findings pinned on it, the rewrites they suggest, and the
 * target job's keywords for it. `commitLine` writes an edit through the kit's
 * ONE résumé history (useContentHistory.commit), one Undo step per Save, and
 * keeps the selection on the edited line.
 */
import { useCallback, useMemo } from "react";
import type { ResumeContent } from "@shared/resume";
import { writeAt } from "@shared/resume-path";
import type { JobMatch } from "@/lib/build/job-match";
import type { PageFinding } from "@/lib/build/page-findings";
import {
  findingsForLine,
  keywordsForLine,
  resolveKitLine,
  rewriteSuggestions,
} from "@/lib/build/this-line";
import { useKitLineSelection } from "@/lib/workspace/kit/use-kit-line-selection";

interface Args {
  content: ResumeContent | null;
  /** The findings on the page (dismissed ones left out). */
  findings: readonly PageFinding[];
  jobMatch: JobMatch | null;
  /** The kit's history commit (one Undo step per distinct group). */
  commit: (next: ResumeContent, group?: string) => void;
}

export function useThisLine({ content, findings, jobMatch, commit }: Args) {
  const { line: ref, select, clear } = useKitLineSelection();
  const line = useMemo(() => resolveKitLine(content, ref), [content, ref]);
  const path = line?.path ?? null;
  const text = line?.text ?? "";

  const lineFindings = useMemo(() => (path ? findingsForLine(findings, path) : []), [findings, path]);
  const suggestions = useMemo(() => rewriteSuggestions(lineFindings), [lineFindings]);
  const keywords = useMemo(() => (line ? keywordsForLine(jobMatch, text) : null), [line, jobMatch, text]);

  const commitLine = useCallback(
    (next: string) => {
      if (!content || !path || !ref || next === text) return;
      commit(writeAt(content, path, next), `line:${path}`);
      select({ ...ref, text: next });
    },
    [content, path, ref, text, commit, select],
  );

  return { line, findings: lineFindings, suggestions, keywords, jobMatch, commitLine, clear };
}

export type ThisLine = ReturnType<typeof useThisLine>;
