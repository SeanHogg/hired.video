// Entity-agnostic tool-run history. Given an anchor (entityType + entityId)
// it lists every tool the user has run that referenced that entity, with
// a sparkline for score-producing tools and expandable rows to re-view
// each historical result.
//
// Tool labels and ordering are read from the public tools catalog so the
// panel stays in lock-step with the Tools page and the Run-Tool action
// menu — runs of any catalog tool show up correctly, including the ones
// (resume-roast, resume-consolidator, …) that aren't in the runtime
// registry.

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, Play, TrendingDown, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToolRunResultPanel } from "@/components/ToolRunResultPanel";
import {
  TOOLS_CATALOG,
  getCatalogTool,
  type ToolEntityContext,
} from "@/data/tools-catalog";
import type { NormalizedToolRunResult, ToolEntityType } from "@/lib/tools/types";
import {
  toolRunsService,
  type ToolRun,
  toolRunScore,
} from "@/lib/services/tool-runs-service";

/**
 * Where history is anchored. Three shapes today:
 *   • `entity`  — every run against one specific resume/job/video/etc.
 *   • `mine`    — every run I've made (optionally narrowed to one tool),
 *                 used by the "View History" button on full-page tools
 *                 where a user pastes text directly with no anchor.
 *   • `user`    — admin-scoped inspection of another user's runs. The
 *                 panel itself is source-agnostic; this shape routes the
 *                 query through the admin-scoped fetcher instead of the
 *                 owner-scoped one.
 */
export type ToolHistorySource =
  | { kind: "entity"; entityType: ToolEntityType; entityId: string }
  | { kind: "mine"; toolId?: string }
  | { kind: "user"; userId: string; toolId?: string };

interface Props {
  source: ToolHistorySource;
  /** Fires when "Run again" is clicked from the `mine` source — typically
   *  scrolls the host tool page back to the top so the user can rerun
   *  with new inputs. Ignored for the `entity` source (which uses a
   *  deep-link to the tool's page) and the `user` source (read-only). */
  onRunAgain?: (toolId: string) => void;
  /** Catalog tool id(s) to pre-expand on first render. When the panel
   *  is opened from a clicked score chip, this lets the user land on
   *  the relevant tool's history without re-clicking the accordion
   *  header. Accepts a single id or an array — chips that map to
   *  multiple tools (e.g. ATS score, which both Resume Scorer and
   *  Resume Optimizer write) pass every id that may have produced the
   *  value so the user sees runs from either. Silently ignored if the
   *  user has no runs of any listed tool yet. */
  initialToolId?: string | readonly string[];
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function Sparkline({ points, width = 120, height = 32 }: { points: number[]; width?: number; height?: number }) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const stepX = width / (points.length - 1);
  const path = points
    .map((p, i) => {
      const x = i * stepX;
      const y = height - ((p - min) / span) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={width} height={height} className="text-brand-primary" aria-hidden="true">
      <path d={path} fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}

interface RunAgainAffordance {
  /** When set, render a link that deep-links to the tool's page with
   *  the current entity preselected. Used by the `entity` source. */
  href?: string;
  /** When set, render a button that calls back into the host page —
   *  used by the `mine` source where the user is already on the tool's
   *  page. */
  onClick?: () => void;
}

interface ToolHistoryGroupProps {
  toolId: string;
  toolLabel: string;
  runs: ToolRun[];
  /** When omitted, the "Run again" button is hidden — used by the
   *  admin view, which is read-only from the operator's side. */
  runAgain?: RunAgainAffordance;
  /** When true, scroll this group into view after mount — set by the
   *  panel for whichever group matches the deep-link `initialToolId`
   *  so a chip click reliably lands on the right tool's history even
   *  on a tall side-sheet with many groups. */
  autoScrollIntoView?: boolean;
}

function ToolHistoryGroup({ toolId, toolLabel, runs, runAgain, autoScrollIntoView }: ToolHistoryGroupProps) {
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const itemRef = useRef<HTMLDivElement | null>(null);

  // When the chip-deep-link points at this group, scroll the header
  // into view after mount so the user actually sees the accordion that
  // just expanded (otherwise on resumes with many tool groups it can
  // sit below the fold of the side sheet).
  useEffect(() => {
    if (!autoScrollIntoView) return;
    const el = itemRef.current;
    if (!el) return;
    // Defer so the accordion's open animation runs first.
    const timer = window.setTimeout(() => {
      el.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [autoScrollIntoView]);

  // Runs arrive newest-first; sparkline reads oldest → newest.
  const scorePoints = useMemo(
    () =>
      runs
        .map(toolRunScore)
        .filter((s): s is number => s !== null)
        .reverse(),
    [runs],
  );
  const latestScore = scorePoints.length > 0 ? scorePoints[scorePoints.length - 1] : null;
  const firstScore = scorePoints.length > 1 ? scorePoints[0] : null;
  const delta = latestScore !== null && firstScore !== null ? latestScore - firstScore : null;

  return (
    <AccordionItem value={toolId} ref={itemRef}>
      <AccordionTrigger>
        <div className="flex items-center gap-3 w-full">
          <span className="font-medium">{toolLabel}</span>
          <Badge variant="secondary">{runs.length} run{runs.length === 1 ? "" : "s"}</Badge>
          {latestScore !== null && (
            <Badge variant="outline" className="ml-auto">Latest: {Math.round(latestScore)}</Badge>
          )}
          {delta !== null && delta !== 0 && (
            <span className={`text-xs flex items-center gap-1 ${delta > 0 ? "text-green-600" : "text-red-600"}`}>
              {delta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {delta > 0 ? "+" : ""}{Math.round(delta)}
            </span>
          )}
          {scorePoints.length >= 2 && <Sparkline points={scorePoints} />}
        </div>
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-3">
          {runAgain && (
            <div className="flex justify-end">
              {runAgain.href ? (
                <Button asChild size="sm" variant="outline" className="gap-2">
                  <Link to={runAgain.href}>
                    <Play className="h-4 w-4" /> Run again
                  </Link>
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  onClick={runAgain.onClick}
                >
                  <Play className="h-4 w-4" /> Run again
                </Button>
              )}
            </div>
          )}
          <ul className="space-y-2">
            {runs.map((run) => {
              const score = toolRunScore(run);
              const isOpen = openRunId === run.id;
              return (
                <li key={run.id} className="border rounded-md">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between p-3 hover:bg-accent/50 transition-colors text-left"
                    onClick={() => setOpenRunId(isOpen ? null : run.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {run.summary || (score !== null ? `Score: ${Math.round(score)}` : "Tool run")}
                      </div>
                      <div className="text-xs text-muted-foreground">{formatDate(run.createdAt)}</div>
                    </div>
                    {score !== null && <Badge variant="outline">{Math.round(score)}</Badge>}
                  </button>
                  {isOpen && run.result && (
                    <div className="p-3 border-t bg-muted/30">
                      <ToolRunResultPanel
                        toolLabel={toolLabel}
                        result={run.result as unknown as NormalizedToolRunResult}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

/** Build the deep-link href for a "Run again" button on a tool run that
 *  was anchored to an entity. Mirrors `getCatalogToolsForEntity` so the
 *  history panel and the Run-Tool submenu stay consistent. Returns
 *  undefined when the tool has been removed from the catalog or the
 *  entity context isn't supported by it. */
function buildRunAgainHref(
  toolId: string,
  source: Extract<ToolHistorySource, { kind: "entity" }>,
): string | undefined {
  const entry = getCatalogTool(toolId);
  if (!entry) return undefined;
  const context = source.entityType as ToolEntityContext;
  if (!entry.appliesTo?.includes(context)) return entry.href;
  const sep = entry.href.includes("?") ? "&" : "?";
  return `${entry.href}${sep}${context}Id=${encodeURIComponent(source.entityId)}`;
}

export function ToolHistoryPanel({ source, onRunAgain, initialToolId }: Props) {
  // Normalize to an array up front so the rest of the component can
  // treat single-id and multi-id chip deep-links identically.
  const initialToolIds = useMemo<readonly string[]>(
    () =>
      typeof initialToolId === "string"
        ? [initialToolId]
        : Array.isArray(initialToolId)
          ? initialToolId
          : [],
    [initialToolId],
  );
  const queryKey =
    source.kind === "entity"
      ? (["tool-runs", "entity", source.entityType, source.entityId] as const)
      : source.kind === "mine"
      ? (["tool-runs", "mine", source.toolId ?? "*"] as const)
      : (["tool-runs", "user", source.userId, source.toolId ?? "*"] as const);

  const { data: runs, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => {
      if (source.kind === "entity") {
        return toolRunsService.listForEntity({
          entityType: source.entityType,
          entityId: source.entityId,
          limit: 100,
        });
      }
      if (source.kind === "mine") {
        return toolRunsService.listMine({ toolId: source.toolId, limit: 100 });
      }
      return toolRunsService.listForUser({ userId: source.userId, toolId: source.toolId, limit: 200 });
    },
    enabled: source.kind !== "entity" || !!source.entityId,
  });

  const byTool = useMemo(() => {
    const map = new Map<string, ToolRun[]>();
    for (const run of runs ?? []) {
      const arr = map.get(run.toolId) ?? [];
      arr.push(run);
      map.set(run.toolId, arr);
    }
    return map;
  }, [runs]);

  // Order primarily by the catalog (matches the Tools page + Run-Tool
  // submenu order). Any persisted toolIds the catalog doesn't know about
  // — legacy renames, removed tools — fall through at the end so the
  // user still sees them.
  const orderedToolIds = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const entry of TOOLS_CATALOG) {
      if (byTool.has(entry.id)) {
        ordered.push(entry.id);
        seen.add(entry.id);
      }
    }
    for (const id of byTool.keys()) {
      if (!seen.has(id)) ordered.push(id);
    }
    return ordered;
  }, [byTool]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5" />
          Tool Run History
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Loading history…</p>}
        {isError && <p className="text-sm text-destructive">Failed to load tool-run history.</p>}
        {!isLoading && !isError && orderedToolIds.length === 0 && (
          <div className="text-sm text-muted-foreground space-y-3">
            {source.kind === "entity" ? (
              <>
                <p>No tools have been run against this {source.entityType} yet.</p>
                <p>Open the "…" menu and pick a tool under <strong>Run Tool</strong> to see your first result tracked here.</p>
              </>
            ) : source.kind === "mine" ? (
              <>
                <p>You haven't run {source.toolId ? "this tool" : "any tools"} yet.</p>
                <p>Run the tool once and your results will show up here.</p>
              </>
            ) : (
              <p>This user hasn't run any tools yet.</p>
            )}
          </div>
        )}
        {orderedToolIds.length > 0 && (
          <Accordion
            type="multiple"
            className="w-full"
            // Re-mount when the chip-deep-link target changes so a
            // different click re-expands cleanly even if the sheet
            // stayed mounted between opens (shadcn Sheet keeps its
            // content portal alive).
            key={initialToolIds.length > 0 ? initialToolIds.join(",") : "all"}
            defaultValue={initialToolIds.filter((id) => byTool.has(id))}
          >
            {orderedToolIds.map((toolId) => {
              const entry = getCatalogTool(toolId);
              const label = entry?.title ?? toolId;
              let runAgain: RunAgainAffordance | undefined;
              if (source.kind === "entity") {
                const href = buildRunAgainHref(toolId, source);
                if (href) runAgain = { href };
              } else if (source.kind === "mine" && onRunAgain) {
                runAgain = { onClick: () => onRunAgain(toolId) };
              }
              return (
                <ToolHistoryGroup
                  key={toolId}
                  toolId={toolId}
                  toolLabel={label}
                  runs={byTool.get(toolId)!}
                  runAgain={runAgain}
                  autoScrollIntoView={initialToolIds.includes(toolId)}
                />
              );
            })}
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
}
