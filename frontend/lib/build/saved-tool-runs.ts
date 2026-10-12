/**
 * The kit's AI Tool runs as saved on the server (/api/tool-runs), tied to the
 * studio session they were made in (/studio/<id>): reopening the session —
 * after a reload, in another browser — brings them back into the chat log.
 * Pure: the log's hook (use-tool-runs.ts) does the fetching and saving.
 */
import type { ToolRun as SavedToolRun } from "@/lib/services/tool-runs-service";
import type { NormalizedToolRunResult } from "@/lib/tools/types";
import type { ToolRun } from "./use-tool-runs";

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** The saved ids the log already holds. */
function savedIdsIn(runs: readonly ToolRun[]): Set<string> {
  return new Set(runs.flatMap((r) => (r.status === "done" && r.savedId ? [r.savedId] : [])));
}

/**
 * The log with the session's saved runs it doesn't hold yet added, in time
 * order. Runs already in it (same saved id) are left as they are, so their
 * log ids — which page findings are keyed by — never change.
 */
export function mergeSavedRuns(local: ToolRun[], saved: readonly SavedToolRun[], nextId: () => number): ToolRun[] {
  const held = savedIdsIn(local);
  const added: ToolRun[] = saved
    .filter((s) => !held.has(s.id) && isRecord(s.result))
    .map((s) => ({
      id: nextId(),
      at: Date.parse(s.createdAt) || Date.now(),
      toolId: s.toolId,
      status: "done" as const,
      result: s.result as NormalizedToolRunResult,
      savedId: s.id,
    }));
  if (added.length === 0) return local;
  return [...local, ...added].sort((a, b) => a.at - b.at);
}
