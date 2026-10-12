/**
 * useFindingActions — what can be done with the scoring runs' findings:
 * dismiss one (remembered per résumé across reloads), apply a rewrite
 * (as the visitor edited it), or run the wand the analyzer named (#375). Applying writes the draft through the one
 * résumé content port (lib/tools/resume-content.ts), so it lands as ONE Undo
 * step, and the finding drops off once the line no longer matches.
 *
 * ONE instance per kit (useKitWorkspace): the page's flags and the "This
 * line" inspector read the same `visible` list and the same busy / failed
 * state.
 */
import { useCallback, useMemo, useState } from "react";
import { applyFindingRewrite, type PageFinding } from "./page-findings";
import { writeResumeContent } from "@/lib/tools/resume-content";
import { useDraftScopedState } from "./use-draft-scoped-state";

interface Args {
  findings: readonly PageFinding[];
  /** The saved draft; null until autosave made the row (no Apply yet). */
  resumeId: string | null;
  /** Run a registry tool on the draft as a chat card (the journey's tool
   *  log) — how a finding's wand (#375) proposes its fix. */
  runTool?: (toolId: string, args: Record<string, unknown>) => Promise<unknown>;
}

const NONE_DISMISSED: readonly string[] = [];
const reviveDismissed = (stored: unknown): readonly string[] | null =>
  Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string") : null;

export function useFindingActions({ findings, resumeId, runTool }: Args) {
  // Keyed by the résumé alone: findings belong to its saved runs.
  const { value: dismissedIds, set: setDismissed } = useDraftScopedState({
    draftKey: resumeId,
    resumeId,
    slice: "dismissed",
    empty: NONE_DISMISSED,
    revive: reviveDismissed,
  });
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const dismissed = new Set(dismissedIds);
    return findings.filter((f) => !dismissed.has(f.id));
  }, [findings, dismissedIds]);

  const dismiss = useCallback(
    (id: string) => {
      setDismissed((prev) => (prev.includes(id) ? prev : [...prev, id]));
      setFailedId((current) => (current === id ? null : current));
    },
    [setDismissed],
  );

  const apply = useCallback(
    async (finding: PageFinding, after: string) => {
      if (!resumeId) return;
      setApplyingId(finding.id);
      setFailedId(null);
      try {
        const wrote = await writeResumeContent(resumeId, (copy) => applyFindingRewrite(copy, finding, after), "ai:rewrite");
        if (!wrote) setFailedId(finding.id);
      } catch {
        setFailedId(finding.id);
      } finally {
        setApplyingId(null);
      }
    },
    [resumeId],
  );

  /** Propose the finding's wand fix: its card lands in the chat with Apply. */
  const fix = useCallback(
    (finding: PageFinding) => {
      if (finding.action && runTool) void runTool(finding.action.toolId, finding.action.args);
    },
    [runTool],
  );

  return {
    /** The findings not dismissed, in page order. */
    visible,
    dismiss,
    /** Null when the host has no tool log to run a wand in. */
    fix: runTool ? fix : null,
    /** Null until the draft is saved (a rewrite needs the row). */
    apply: resumeId ? apply : null,
    applyingId,
    failedId,
  };
}

export type FindingActions = ReturnType<typeof useFindingActions>;
