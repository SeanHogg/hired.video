/**
 * #411 — JobAnalyticsDialog. Mounted from JobActionsMenu's Analytics
 * entry; reads from `/api/analytics/artifacts/job/:id?view=rollup` which aggregates view
 * series + applications-by-source + pipeline funnel + sponsored-vs-
 * organic view split. Self-gates on `isOpen` so the dialog only fires
 * the fetch when actually visible.
 */

import { useEffect, useState } from "react";
import { BarChart3, Eye, FileText, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiClient } from "@/lib/api-client";

interface JobAnalyticsResponse {
  jobId: string;
  totalViews: number;
  sponsoredViews: number;
  organicViews: number;
  totalApplications: number;
  viewsByDay: Array<{ day: string; count: number }>;
  applicationsBySource: Array<{ source: string; count: number }>;
  pipelineFunnel: Array<{ stage: string; count: number }>;
}

interface JobAnalyticsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  jobTitle: string;
}

export default function JobAnalyticsDialog({
  isOpen,
  onClose,
  jobId,
  jobTitle,
}: JobAnalyticsDialogProps) {
  const [data, setData] = useState<JobAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !jobId) return;
    let cancelled = false;
    setLoading(true);
    setErrorMsg(null);
    apiClient
      .fetchData<JobAnalyticsResponse | null>(`/api/analytics/artifacts/job/${encodeURIComponent(jobId)}?view=rollup`)
      .then((body) => {
        if (cancelled) return;
        setData(body ?? null);
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorMsg(err instanceof Error ? err.message : "Failed to load analytics");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, jobId]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Job analytics
          </DialogTitle>
          <DialogDescription>
            Engagement summary for <span className="font-medium">{jobTitle}</span>.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="py-6 text-sm text-muted-foreground">Loading analytics…</div>
        )}
        {errorMsg && !loading && (
          <div className="py-4 text-sm text-destructive">Could not load analytics: {errorMsg}</div>
        )}
        {data && !loading && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-md border p-3">
                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                  <Eye className="w-3.5 h-3.5" /> Total views
                </div>
                <div className="text-2xl font-semibold mt-1">{data.totalViews.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {data.sponsoredViews.toLocaleString()} sponsored · {data.organicViews.toLocaleString()} organic
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                  <FileText className="w-3.5 h-3.5" /> Applications
                </div>
                <div className="text-2xl font-semibold mt-1">
                  {data.totalApplications.toLocaleString()}
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                  <Megaphone className="w-3.5 h-3.5" /> Sources
                </div>
                <div className="text-2xl font-semibold mt-1">
                  {data.applicationsBySource.length}
                </div>
              </div>
            </div>

            {data.applicationsBySource.length > 0 && (
              <div className="rounded-md border p-3">
                <div className="text-xs font-medium uppercase text-muted-foreground mb-2">
                  Applications by source
                </div>
                <div className="space-y-1.5">
                  {data.applicationsBySource.map((row) => (
                    <div key={row.source} className="flex items-center justify-between text-sm">
                      <span>{row.source}</span>
                      <span className="text-muted-foreground">{row.count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.pipelineFunnel.length > 0 && (
              <div className="rounded-md border p-3">
                <div className="text-xs font-medium uppercase text-muted-foreground mb-2">
                  Pipeline funnel
                </div>
                <div className="space-y-1.5">
                  {data.pipelineFunnel.map((row) => (
                    <div key={row.stage} className="flex items-center justify-between text-sm">
                      <span>{row.stage}</span>
                      <span className="text-muted-foreground">{row.count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.viewsByDay.length > 0 && (
              <div className="rounded-md border p-3">
                <div className="text-xs font-medium uppercase text-muted-foreground mb-2">
                  Views (last 30 days)
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {data.viewsByDay.slice(-21).map((row) => {
                    const intensity = Math.min(1, row.count / 25);
                    return (
                      <div
                        key={row.day}
                        title={`${row.day} · ${row.count} views`}
                        className="h-8 rounded"
                        style={{
                          backgroundColor: `rgba(79,70,229,${0.15 + 0.75 * intensity})`,
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
