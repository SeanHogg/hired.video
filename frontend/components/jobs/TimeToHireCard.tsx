/**
 * Time-to-Hire metric card for a job. Self-gates on manager-only access:
 * the backend returns 403 to non-managers, so we just render nothing when
 * the metric endpoint refuses. Consumers can mount this unconditionally
 * — the component decides its own visibility (per the platform rule).
 *
 * Mounted on JobDetail.tsx for managers, and on ArtifactDetailsSheet's
 * Job tab so the metric is one click away from the Globe + Details
 * drawer too.
 */

import { useEffect, useState } from "react";
import { Clock, TrendingUp, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiClient } from "@/lib/api-client";

interface TimeToHireMetric {
  averageDays: number | null;
  medianDays: number | null;
  sampleSize: number;
  fastestDays: number | null;
  slowestDays: number | null;
}

interface TimeToHireCardProps {
  jobId: string;
  /** Render style — `card` (default) is the full Card; `inline` is a one-line stat for sheets. */
  variant?: "card" | "inline";
}

export function TimeToHireCard({ jobId, variant = "card" }: TimeToHireCardProps) {
  const [metric, setMetric] = useState<TimeToHireMetric | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setForbidden(false);
    apiClient
      .get<TimeToHireMetric>(`/api/jobs/${jobId}/metrics/time-to-hire`, null as any)
      .then((res) => {
        if (cancelled) return;
        setMetric(res.data);
      })
      .catch((err: any) => {
        if (cancelled) return;
        // 403 = not a manager. Hide the card entirely.
        if (err?.status === 403 || /forbidden/i.test(String(err?.message))) {
          setForbidden(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  if (forbidden) return null;

  if (variant === "inline") {
    if (loading) return <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Time-to-hire</span>;
    if (!metric || metric.sampleSize === 0) {
      return <span className="text-xs text-muted-foreground">Time-to-hire: not enough hires yet</span>;
    }
    return (
      <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
        <Clock className="h-3 w-3" /> Time-to-hire {metric.medianDays}d (median, n={metric.sampleSize})
      </span>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-5 w-5" /> Time-to-Hire
        </CardTitle>
        <CardDescription>
          How fast this role moves from added-to-pipeline to a hire. Computed live from
          your pipeline history.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="text-sm text-muted-foreground inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Computing…
          </div>
        )}
        {!loading && metric && metric.sampleSize === 0 && (
          <p className="text-sm text-muted-foreground">
            Not enough data yet — once a candidate moves to the <strong>Hired</strong> stage,
            the metric will fill in here.
          </p>
        )}
        {!loading && metric && metric.sampleSize > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Median" value={`${metric.medianDays}d`} />
            <Stat label="Average" value={`${metric.averageDays}d`} />
            <Stat label="Fastest" value={`${metric.fastestDays}d`} />
            <Stat label="Slowest" value={`${metric.slowestDays}d`} />
          </div>
        )}
        {!loading && metric && metric.sampleSize > 0 && (
          <p className="text-xs text-muted-foreground mt-3">
            Based on {metric.sampleSize} hire{metric.sampleSize === 1 ? "" : "s"} from this
            job's pipeline.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border p-2">
      <p className="text-[10px] uppercase text-muted-foreground tracking-wide">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}
