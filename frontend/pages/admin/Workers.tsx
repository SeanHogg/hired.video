import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Loader2, Play, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiClient } from "@/lib/api-client";

type RunStatus = "running" | "success" | "partial" | "error";

interface WorkerRunSummary {
  id: string;
  status: RunStatus;
  trigger: "cron" | "manual";
  itemsScanned: number;
  itemsChanged: number;
  itemsSkipped: number;
  itemsFailed: number;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
}

interface WorkerSummary {
  name: string;
  displayName: string;
  description: string;
  cadenceMs: number;
  batchSize: number;
  latestRun: WorkerRunSummary | null;
}

interface WorkerRunDetail extends WorkerRunSummary {
  workerName: string;
  triggeredBy: string | null;
  details: {
    failures?: Array<{ itemId: string; message: string; extra?: Record<string, unknown>; at: string }>;
    samples?: Array<Record<string, unknown>>;
    truncated?: { failures: boolean; samples: boolean };
  };
}

const STATUS_STYLES: Record<RunStatus, string> = {
  running: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  success: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  partial: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  error:   "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

function formatCadence(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 60 * 60_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 24 * 60 * 60_000) return `${Math.round(ms / 60 / 60_000)}h`;
  return `${Math.round(ms / 24 / 60 / 60_000)}d`;
}

function formatRelative(iso: string): string {
  const ageMs = Date.now() - new Date(iso).getTime();
  if (ageMs < 60_000) return `${Math.round(ageMs / 1000)}s ago`;
  if (ageMs < 60 * 60_000) return `${Math.round(ageMs / 60_000)}m ago`;
  if (ageMs < 24 * 60 * 60_000) return `${Math.round(ageMs / 60 / 60_000)}h ago`;
  return new Date(iso).toLocaleString();
}

// ---------------------------------------------------------------------------
// Status pill — used in worker list, run history, and detail modal so the
// label/colour is consistent across the page.
// ---------------------------------------------------------------------------
function StatusPill({ status }: { status: RunStatus }) {
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[status]}`}>
      {status}
    </span>
  );
}

// ===========================================================================
// Top-level page
// ===========================================================================
export default function Workers() {
  const { t } = useTranslation();
  const [workers, setWorkers] = useState<WorkerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runningWorker, setRunningWorker] = useState<string | null>(null);
  const [activeWorker, setActiveWorker] = useState<string | null>(null);

  const loadWorkers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.get<{ workers: WorkerSummary[] }>("/api/admin/workers");
      setWorkers(res.data.workers);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.failedToLoadWorkers"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { loadWorkers(); }, [loadWorkers]);

  const runNow = useCallback(async (name: string) => {
    setRunningWorker(name);
    try {
      await apiClient.post(`/api/admin/workers/${name}/run`, {});
      await loadWorkers();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.failedToRunWorker"));
    } finally {
      setRunningWorker(null);
    }
  }, [loadWorkers, t]);

  if (activeWorker) {
    return (
      <WorkerHistory
        workerName={activeWorker}
        onBack={() => { setActiveWorker(null); loadWorkers(); }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("headings.batchWorkers")}</h1>
          <p className="text-muted-foreground text-sm">{t("messages.batchWorkersIntro")}</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={loadWorkers} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          {t("actions.refresh")}
        </Button>
      </div>

      {error && (
        <div className="text-center text-destructive py-4">
          {error}
          <Button variant="ghost" size="sm" className="ml-2" onClick={loadWorkers}>{t("actions.retry")}</Button>
        </div>
      )}

      {loading && workers.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          {t("status.loadingWorkers")}
        </div>
      ) : workers.length === 0 ? (
        <Card>
          <CardContent className="text-center text-muted-foreground py-8">
            {t("messages.noWorkersRegistered")}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {workers.map((w) => (
            <Card key={w.name}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="text-lg truncate">{w.displayName}</CardTitle>
                    <p className="text-xs text-muted-foreground font-mono mt-1">{w.name}</p>
                  </div>
                  {w.latestRun && <StatusPill status={w.latestRun.status} />}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">{w.description}</p>

                <div className="grid grid-cols-3 gap-3 text-xs">
                  <Metric label={t("labels.cadence")} value={formatCadence(w.cadenceMs)} />
                  <Metric label={t("labels.batchSize")} value={String(w.batchSize)} />
                  <Metric
                    label={t("labels.lastRun")}
                    value={w.latestRun ? formatRelative(w.latestRun.startedAt) : "—"}
                  />
                </div>

                {w.latestRun && (
                  <div className="grid grid-cols-4 gap-3 text-xs border-t pt-3">
                    <Metric label={t("labels.scanned")} value={String(w.latestRun.itemsScanned)} />
                    <Metric label={t("labels.changed")} value={String(w.latestRun.itemsChanged)} />
                    <Metric label={t("labels.skipped")} value={String(w.latestRun.itemsSkipped)} />
                    <Metric
                      label={t("labels.failed")}
                      value={String(w.latestRun.itemsFailed)}
                      emphasize={w.latestRun.itemsFailed > 0}
                    />
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    onClick={() => runNow(w.name)}
                    disabled={runningWorker === w.name}
                    className="gap-1.5"
                  >
                    {runningWorker === w.name
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Play className="h-3.5 w-3.5" />}
                    {t("actions.runNow")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setActiveWorker(w.name)}>
                    {t("actions.viewHistory")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div>
      <p className="text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={`font-semibold ${emphasize ? "text-destructive" : ""}`}>{value}</p>
    </div>
  );
}

// ===========================================================================
// Run history view (one worker)
// ===========================================================================
interface HistoryResponse {
  runs: WorkerRunSummary[];
  total: number;
  page: number;
  limit: number;
  worker: { name: string; displayName: string; description: string };
}

function WorkerHistory({ workerName, onBack }: { workerName: string; onBack: () => void }) {
  const { t } = useTranslation();
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const limit = 50;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.get<HistoryResponse>(
        `/api/admin/workers/${workerName}/runs?page=${page}&limit=${limit}`,
      );
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.failedToLoadRuns"));
    } finally {
      setLoading(false);
    }
  }, [workerName, page, t]);

  useEffect(() => { load(); }, [load]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / limit)) : 1;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            {t("actions.back")}
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{data?.worker.displayName ?? workerName}</h1>
            <p className="text-muted-foreground text-sm">{data?.worker.description}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          {t("actions.refresh")}
        </Button>
      </div>

      {error && (
        <div className="text-center text-destructive py-4">{error}</div>
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("labels.startedAt")}</TableHead>
              <TableHead>{t("labels.status")}</TableHead>
              <TableHead>{t("labels.trigger")}</TableHead>
              <TableHead className="text-right">{t("labels.scanned")}</TableHead>
              <TableHead className="text-right">{t("labels.changed")}</TableHead>
              <TableHead className="text-right">{t("labels.skipped")}</TableHead>
              <TableHead className="text-right">{t("labels.failed")}</TableHead>
              <TableHead>{t("labels.duration")}</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />
                  {t("status.loadingRuns")}
                </TableCell>
              </TableRow>
            ) : !data || data.runs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  {t("messages.noWorkerRuns")}
                </TableCell>
              </TableRow>
            ) : (
              data.runs.map((r) => {
                const dur = r.completedAt
                  ? Math.round((new Date(r.completedAt).getTime() - new Date(r.startedAt).getTime()) / 100) / 10
                  : null;
                return (
                  <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setActiveRunId(r.id)}>
                    <TableCell className="text-xs font-mono whitespace-nowrap">
                      {new Date(r.startedAt).toLocaleString()}
                    </TableCell>
                    <TableCell><StatusPill status={r.status} /></TableCell>
                    <TableCell className="text-xs">{r.trigger}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{r.itemsScanned}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{r.itemsChanged}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{r.itemsSkipped}</TableCell>
                    <TableCell className={`text-right font-mono text-xs ${r.itemsFailed > 0 ? "text-destructive" : ""}`}>
                      {r.itemsFailed}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {dur !== null ? `${dur}s` : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setActiveRunId(r.id); }}>
                        {t("actions.details")}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t("labels.pageOfWithEntries", { page, totalPages, total: data?.total ?? 0 })}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              {t("actions.previous")}
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              {t("actions.next")}
            </Button>
          </div>
        </div>
      )}

      <RunDetailDialog
        workerName={workerName}
        runId={activeRunId}
        onClose={() => setActiveRunId(null)}
      />
    </div>
  );
}

// ===========================================================================
// Run detail modal
// ===========================================================================
function RunDetailDialog({
  workerName,
  runId,
  onClose,
}: {
  workerName: string;
  runId: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [run, setRun] = useState<WorkerRunDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!runId) { setRun(null); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await apiClient.get<{ run: WorkerRunDetail }>(`/api/admin/workers/${workerName}/runs/${runId}`);
        if (!cancelled) setRun(res.data.run);
      } catch {
        if (!cancelled) setRun(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [workerName, runId]);

  return (
    <Dialog open={!!runId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("headings.runDetails")}</DialogTitle>
          <DialogDescription>
            {run ? new Date(run.startedAt).toLocaleString() : runId}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin inline mr-2" />{t("status.loading")}</div>
        ) : !run ? null : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <StatusPill status={run.status} />
              <span className="text-sm text-muted-foreground">{run.trigger}</span>
              {run.triggeredBy && (
                <span className="text-xs font-mono text-muted-foreground">
                  {t("labels.triggeredBy")}: {run.triggeredBy.slice(0, 8)}…
                </span>
              )}
            </div>

            {run.errorMessage && (
              <div className="p-3 rounded bg-destructive/10 text-destructive text-sm font-mono">
                {run.errorMessage}
              </div>
            )}

            <div className="grid grid-cols-4 gap-3 text-sm">
              <Metric label={t("labels.scanned")} value={String(run.itemsScanned)} />
              <Metric label={t("labels.changed")} value={String(run.itemsChanged)} />
              <Metric label={t("labels.skipped")} value={String(run.itemsSkipped)} />
              <Metric label={t("labels.failed")} value={String(run.itemsFailed)} emphasize={run.itemsFailed > 0} />
            </div>

            {run.details.failures && run.details.failures.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">
                  {t("labels.failures")}
                  {run.details.truncated?.failures && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">{t("labels.truncated")}</span>
                  )}
                </h3>
                <div className="space-y-2 max-h-64 overflow-y-auto border rounded p-2">
                  {run.details.failures.map((f, i) => (
                    <div key={i} className="text-xs font-mono">
                      <span className="text-muted-foreground">{f.itemId.slice(0, 8)}…</span>{" "}
                      <span className="text-destructive">{f.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {run.details.samples && run.details.samples.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">{t("labels.samples")}</h3>
                <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-64">
                  {JSON.stringify(run.details.samples, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
