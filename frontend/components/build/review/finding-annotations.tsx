/**
 * The scoring runs' findings as page annotations (no review open): the
 * criticised line is marked for review and a flag after it selects that line,
 * which opens the "This line" inspector in the right slot with its Findings
 * expanded (components/build/this-line/) — what the tool said, the rewrite,
 * Apply and Dismiss live there. A missing email / phone flag opens the
 * header's editor instead (it is not a line). `findings` arrive with the
 * dismissed ones already left out (useFindingActions).
 */
import { useMemo } from "react";
import type { ResumeContent } from "@shared/resume";
import type { ResumeAnnotations } from "@/components/resume-renderer/annotations";
import type { PageFinding } from "@/lib/build/page-findings";
import { lineRefOfPath, resolveKitLine } from "@/lib/build/this-line";
import { useKitLineSelection } from "@/lib/workspace/kit/use-kit-line-selection";
import { annotate, type Mutable } from "./annotation-builders";
import FindingFlag from "./FindingFlag";

interface Args {
  /** Undefined (or empty) draws nothing. */
  findings: readonly PageFinding[] | undefined;
  /** The draft the findings are anchored on. */
  draft: ResumeContent;
  /** Opens a section's editor (a missing email / phone → the header). */
  onEditSection: (key: string) => void;
}

export function useFindingAnnotations({ findings, draft, onEditSection }: Args): ResumeAnnotations | undefined {
  const { line, select } = useKitLineSelection();
  const selectedPath = useMemo(() => resolveKitLine(draft, line)?.path ?? null, [draft, line]);

  return useMemo(() => {
    if (!findings || findings.length === 0) return undefined;
    const map: Mutable = {};
    for (const f of findings) {
      const missing = f.kind === "missing";
      const onSelect = missing
        ? () => onEditSection(f.anchor.section)
        : () => {
            const ref = lineRefOfPath(draft, f.anchor.path);
            if (ref) select(ref);
          };
      const flag = (
        <FindingFlag
          key={f.id}
          finding={f}
          selected={!missing && selectedPath === f.anchor.path}
          onSelect={onSelect}
        />
      );
      annotate(map, f.anchor.path, { kind: missing ? "pin" : "review", cardAfter: flag });
    }
    return map;
  }, [findings, draft, selectedPath, select, onEditSection]);
}
