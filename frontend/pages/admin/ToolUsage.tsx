// SuperAdmin — Tool Usage insights. Shows which tools are getting traction
// across the platform, unique-user counts, average/median score, and
// top-users drill-down. Powered by /api/admin/usage/tools/*.

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2, RefreshCw, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiClient } from "@/lib/api-client";
import { getTool, toolRegistry } from "@/lib/tools/registry";

interface SummaryRow {
  toolId: string;
  runs: number;
  uniqueUsers: number;
  avgScore: number | string | null;
  medianScore: number | string | null;
  lastRunAt: string | null;
}

interface TopUserRow {
  userId: string;
  runs: number;
  lastRunAt: string | null;
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function useSummary() {
  return useQuery({
    queryKey: ["admin", "tool-usage", "summary"],
    queryFn: async () => {
      const res = await apiClient.get<SummaryRow[]>("/api/admin/usage/tools/summary");
      return res.data;
    },
  });
}

function useTopUsers() {
  return useQuery({
    queryKey: ["admin", "tool-usage", "top-users"],
    queryFn: async () => {
      const res = await apiClient.get<TopUserRow[]>("/api/admin/usage/tools/top-users?limit=20");
      return res.data;
    },
  });
}

export default function ToolUsage() {
  const { t } = useTranslation();
  const summary = useSummary();
  const topUsers = useTopUsers();

  // Build a merged view: every registered tool even if it has zero runs
  // (so ops can see which tools aren't being used yet).
  const rowsByTool = new Map<string, SummaryRow>();
  for (const row of summary.data ?? []) rowsByTool.set(row.toolId, row);

  const rows = toolRegistry.map((tool) => {
    const row = rowsByTool.get(tool.id);
    return {
      toolId: tool.id,
      tool,
      runs: row?.runs ?? 0,
      uniqueUsers: row?.uniqueUsers ?? 0,
      avgScore: toNumber(row?.avgScore ?? null),
      medianScore: toNumber(row?.medianScore ?? null),
      lastRunAt: row?.lastRunAt ?? null,
    };
  }).sort((a, b) => b.runs - a.runs);

  // Runs from tools that aren't in the registry anymore (renamed, retired).
  const orphanRows = (summary.data ?? []).filter((r) => !toolRegistry.some((t) => t.id === r.toolId));

  const totalRuns = rows.reduce((sum, r) => sum + r.runs, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wand2 className="h-6 w-6" /> {t("headings.toolUsage")}
          </h1>
          <p className="text-muted-foreground text-sm">{t("messages.toolUsageIntro")}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => { summary.refetch(); topUsers.refetch(); }}
          disabled={summary.isFetching}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${summary.isFetching ? "animate-spin" : ""}`} />
          {t("actions.refresh")}
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground font-normal">{t("labels.totalRuns")}</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{totalRuns.toLocaleString()}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground font-normal">{t("labels.toolsInUse")}</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{rows.filter((r) => r.runs > 0).length} / {rows.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground font-normal">{t("labels.mostActiveUsersTop20")}</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{topUsers.data?.length ?? 0}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">{t("headings.perToolAdoption")}</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("labels.tool")}</TableHead>
                <TableHead className="text-right">{t("labels.runs")}</TableHead>
                <TableHead className="text-right">{t("labels.uniqueUsers")}</TableHead>
                <TableHead className="text-right">{t("labels.avgScore")}</TableHead>
                <TableHead className="text-right">{t("labels.medianScore")}</TableHead>
                <TableHead>{t("labels.lastRun")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />
                    {t("status.loadingUsage")}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map(({ toolId, tool, runs, uniqueUsers, avgScore, medianScore, lastRunAt }) => (
                  <TableRow key={toolId}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <tool.icon className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{tool.label}</span>
                        {tool.requiresPro && <Badge variant="secondary" className="bg-amber-100 text-amber-800 text-[10px]">{t("admin.toolUsage.proBadge")}</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">{toolId}</div>
                    </TableCell>
                    <TableCell className="text-right font-mono">{runs.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono">{uniqueUsers.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono">{avgScore !== null ? avgScore.toFixed(1) : "—"}</TableCell>
                    <TableCell className="text-right font-mono">{medianScore !== null ? medianScore.toFixed(1) : "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(lastRunAt)}</TableCell>
                  </TableRow>
                ))
              )}
              {orphanRows.length > 0 && (
                <>
                  <TableRow><TableCell colSpan={6} className="text-xs text-muted-foreground bg-muted/30">{t("admin.toolUsage.orphanIdsHeader")}</TableCell></TableRow>
                  {orphanRows.map((row) => (
                    <TableRow key={row.toolId}>
                      <TableCell className="font-mono text-sm">{row.toolId}</TableCell>
                      <TableCell className="text-right font-mono">{row.runs.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono">{row.uniqueUsers.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono">{toNumber(row.avgScore)?.toFixed(1) ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono">{toNumber(row.medianScore)?.toFixed(1) ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(row.lastRunAt)}</TableCell>
                    </TableRow>
                  ))}
                </>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{t("headings.topUsersAllTools")}</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("labels.userFallback")}</TableHead>
                <TableHead className="text-right">{t("labels.runs")}</TableHead>
                <TableHead>{t("labels.lastRun")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topUsers.isLoading ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />
                    {t("status.loadingEllipsis")}
                  </TableCell>
                </TableRow>
              ) : (topUsers.data ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-8">{t("messages.noToolRunsRecorded")}</TableCell>
                </TableRow>
              ) : (
                (topUsers.data ?? []).map((u) => (
                  <TableRow key={u.userId}>
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded" title={u.userId}>
                        {u.userId.slice(0, 8)}…
                      </code>
                    </TableCell>
                    <TableCell className="text-right font-mono">{u.runs.toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(u.lastRunAt)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
