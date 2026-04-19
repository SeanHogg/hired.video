// Entity-agnostic tool-run history. Given an anchor (entityType + entityId)
// it lists every tool the user has run that referenced that entity, with
// a sparkline for score-producing tools and expandable rows to re-view
// each historical result.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, Play, TrendingDown, TrendingUp } from "lucide-react";
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
import { toolRegistry, getTool } from "@/lib/tools/registry";
import type { NormalizedToolRunResult, ToolEntityType } from "@/lib/tools/types";
import {
  toolRunsService,
  type ToolRun,
  toolRunScore,
} from "@/lib/services/tool-runs-service";

interface Props {
  entityType: ToolEntityType;
  entityId: string;
  onRunTool: (toolId: string) => void;
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
    <svg width={width} height={height} className="text-brand-purple" aria-hidden="true">
      <path d={path} fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}

interface ToolHistoryGroupProps {
  toolId: string;
  toolLabel: string;
  runs: ToolRun[];
  onRunTool: (toolId: string) => void;
}

function ToolHistoryGroup({ toolId, toolLabel, runs, onRunTool }: ToolHistoryGroupProps) {
  const [openRunId, setOpenRunId] = useState<string | null>(null);

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
    <AccordionItem value={toolId}>
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
          <div className="flex justify-end">
            <Button size="sm" variant="outline" className="gap-2" onClick={() => onRunTool(toolId)}>
              <Play className="h-4 w-4" /> Run again
            </Button>
          </div>
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

export function ToolHistoryPanel({ entityType, entityId, onRunTool }: Props) {
  const { data: runs, isLoading, isError } = useQuery({
    queryKey: ["tool-runs", entityType, entityId],
    queryFn: () => toolRunsService.listForEntity({ entityType, entityId, limit: 100 }),
    enabled: !!entityId,
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

  const orderedToolIds = toolRegistry
    .map((t) => t.id)
    .filter((id) => byTool.has(id));

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
            <p>No tools have been run against this {entityType} yet.</p>
            <p>Open the "…" menu and pick a tool under <strong>Run Tool</strong> to see your first result tracked here.</p>
          </div>
        )}
        {orderedToolIds.length > 0 && (
          <Accordion type="multiple" className="w-full">
            {orderedToolIds.map((toolId) => {
              const tool = getTool(toolId);
              return (
                <ToolHistoryGroup
                  key={toolId}
                  toolId={toolId}
                  toolLabel={tool?.label ?? toolId}
                  runs={byTool.get(toolId)!}
                  onRunTool={onRunTool}
                />
              );
            })}
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
}
