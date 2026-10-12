/**
 * The AI Tools run from the kit's chat (a stage plan step or a tool chip), as
 * a log the conversation renders as result cards. A tool runs on the saved
 * row of the draft on screen — its reads and edits go through the open draft
 * (lib/tools/resume-content.ts), so a change lands as an Undo step. A Pro
 * tool asks for an account, then Pro, up front (in-place sheets), before
 * anything runs. A new draft clears the log; a reload brings the finished
 * runs back (useDraftScopedState). Every finished run is also saved on the
 * server on the résumé and the studio session (/studio/<id>), and opening
 * the session loads its saved runs into the log (saved-tool-runs.ts) — so
 * nothing is lost to another browser or cleared storage. The same tool
 * asked for again while it is still running joins that run instead of
 * starting a second one, and `reuse` answers with a finished run already in
 * the log. The host renders `<ProGateSheet {...proGateSheet} />` once.
 */
import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { getTool } from "@/lib/tools/registry";
import type { NormalizedToolRunResult } from "@/lib/tools/types";
import { toolRunsService } from "@/lib/services/tool-runs-service";
import { saveToolRun } from "@/lib/tools/save-tool-run";
import { useProGateState } from "@/lib/hooks/use-pro-gate-state";
import { useDraftScopedState } from "./use-draft-scoped-state";
import { mergeSavedRuns } from "./saved-tool-runs";

export type ToolRun =
  | { id: number; at: number; toolId: string; status: "running" }
  | { id: number; at: number; toolId: string; status: "done"; result: NormalizedToolRunResult; savedId?: string }
  | { id: number; at: number; toolId: string; status: "failed"; message: string | null };

/** Results carry the tool's raw response (page findings read it), so only
 *  the latest few are kept between visits. */
const KEPT_RUNS = 30;
const NO_RUNS: ToolRun[] = [];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** Finished runs only — one still "running" when the page went away never settles. */
function reviveRuns(stored: unknown): ToolRun[] | null {
  if (!Array.isArray(stored)) return null;
  return stored.filter(
    (r): r is ToolRun =>
      isRecord(r) &&
      typeof r.id === "number" &&
      typeof r.at === "number" &&
      typeof r.toolId === "string" &&
      ((r.status === "done" && isRecord(r.result)) || r.status === "failed"),
  );
}

const persistRuns = (runs: ToolRun[]): ToolRun[] => runs.filter((r) => r.status !== "running").slice(-KEPT_RUNS);

interface Args {
  /** A new draft (new parse, Start over) clears the log. */
  draftKey: unknown;
  /** The saved résumé the log is remembered under. */
  resumeId: string | null;
  /** The studio session the runs are saved on, once known. */
  projectId: string | null;
  /** Find or make the session, so a run made before it existed still lands on it. */
  ensureProjectId: () => Promise<string | null>;
  ensureSaved: () => Promise<string>;
  /** False shows the in-place sign-in sheet with this reason. */
  requireAccount: (reasonKey: string) => boolean;
}

export function useToolRuns({ draftKey, resumeId, projectId, ensureProjectId, ensureSaved, requireAccount }: Args) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { requirePro, sheet: proGateSheet } = useProGateState();
  const {
    value: runs,
    set: setRuns,
    draftRef,
  } = useDraftScopedState({ draftKey, resumeId, slice: "runs", empty: NO_RUNS, revive: reviveRuns, persist: persistRuns });
  const nextId = useRef(0);
  const runsRef = useRef(runs);
  /** Runs still working, by tool + args, for the draft they started on. */
  const inFlight = useRef(new Map<string, { forDraft: unknown; done: Promise<ToolRun | null> }>());

  // Restored runs keep their ids (page findings are keyed by them): new ones follow.
  useEffect(() => {
    runsRef.current = runs;
    for (const r of runs) nextId.current = Math.max(nextId.current, r.id + 1);
  }, [runs]);

  // The session's saved runs, into the log — when it opens, and for each new draft.
  useEffect(() => {
    if (!projectId) return;
    const forDraft = draftRef.current;
    let cancelled = false;
    toolRunsService
      .listForEntity({ entityType: "project", entityId: projectId, limit: KEPT_RUNS })
      .then((saved) => {
        if (cancelled || draftRef.current !== forDraft) return;
        setRuns((all) => mergeSavedRuns(all, saved, () => nextId.current++));
      })
      .catch(() => {
        // Not signed in yet / offline: this browser's copy of the log stands.
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, draftKey, draftRef, setRuns]);

  /** Save a finished run on its résumé + the session; the log keeps its saved id. */
  const save = useCallback(
    async (id: number, toolId: string, result: NormalizedToolRunResult, onResume: string) => {
      const studioProjectId = (await ensureProjectId().catch(() => null)) ?? undefined;
      const saved = await saveToolRun(queryClient, {
        toolId,
        resumeId: onResume,
        studioProjectId,
        result,
        score: typeof result.overallScore === "number" ? result.overallScore : null,
      });
      if (saved) setRuns((all) => all.map((r) => (r.id === id && r.status === "done" ? { ...r, savedId: saved.id } : r)));
    },
    [ensureProjectId, queryClient, setRuns],
  );

  /** May this tool run now? Pro tools gate up front, never after a wait. */
  const allowed = useCallback(
    (toolId: string): boolean => {
      const tool = getTool(toolId);
      if (!tool?.requiresPro) return true;
      if (!requireAccount("build.tools.authReason")) return false;
      return requirePro(t("build.tools.proReason", { tool: tool.label }));
    },
    [requireAccount, requirePro, t],
  );

  /** Run `toolId` on the draft. Resolves with the finished run (null when it
   *  was gated, unknown, or the draft changed meanwhile). The same tool and
   *  args already running on this draft is joined, not run twice. */
  const run = useCallback(
    async (toolId: string, args: Record<string, unknown> = {}): Promise<ToolRun | null> => {
      const forDraft = draftRef.current;
      const runKey = `${toolId}:${JSON.stringify(args)}`;
      const joined = inFlight.current.get(runKey);
      if (joined && joined.forDraft === forDraft) return joined.done;
      const tool = getTool(toolId);
      if (!tool || !allowed(toolId)) return null;
      const id = nextId.current++;
      const at = Date.now();
      const settle = (next: ToolRun) => {
        if (draftRef.current !== forDraft) return null;
        setRuns((all) => all.map((r) => (r.id === id ? next : r)));
        return next;
      };
      setRuns((all) => [...all, { id, at, toolId, status: "running" }]);
      const done = (async () => {
        try {
          const resumeId = await ensureSaved();
          const result = await tool.run({ bound: { resumeId }, args });
          const finished = settle({ id, at, toolId, status: "done", result });
          if (finished) void save(id, toolId, result, resumeId);
          return finished;
        } catch (err) {
          return settle({ id, at, toolId, status: "failed", message: err instanceof Error ? err.message : null });
        } finally {
          inFlight.current.delete(runKey);
        }
      })();
      inFlight.current.set(runKey, { forDraft, done });
      return done;
    },
    [allowed, ensureSaved, draftRef, setRuns, save],
  );

  /** The latest finished run of `toolId` on this draft, or a new run when it
   *  has none — so a tool the user already ran isn't run again for them. */
  const reuse = useCallback(
    (toolId: string): Promise<ToolRun | null> => {
      const finished = [...runsRef.current].reverse().find((r) => r.toolId === toolId && r.status === "done");
      return finished ? Promise.resolve(finished) : run(toolId);
    },
    [run],
  );

  /** A run that finished elsewhere (a tool in the slide-out, which saved it
   *  itself as `savedId`) joins the log. */
  const record = useCallback(
    (toolId: string, result: NormalizedToolRunResult, savedId: string | null) => {
      const id = nextId.current++;
      setRuns((all) => [...all, { id, at: Date.now(), toolId, status: "done", result, ...(savedId ? { savedId } : {}) }]);
    },
    [setRuns],
  );

  return { runs, run, reuse, record, allowed, proGateSheet };
}
