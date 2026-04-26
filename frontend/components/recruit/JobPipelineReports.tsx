// JobPipelineReports — Reports tab content for one job. Phase-1 surface:
// per-stage counts + funnel + average days-in-stage. Time-to-hire breakdown,
// source attribution, and exportable PDF reports land in Phase 2.

import { useEffect, useState } from "react";
import { Loader2, TrendingDown, Users, X, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  PIPELINE_STAGE_LABELS,
  jobPipelineService,
  type PipelineReport,
  type PipelineStage,
} from "@/lib/services/job-pipeline-service";

interface JobPipelineReportsProps {
  jobId: string;
}

export default function JobPipelineReports({ jobId }: JobPipelineReportsProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<PipelineReport | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const r = await jobPipelineService.getReport(jobId);
        if (!cancelled) setReport(r);
      } catch {
        if (!cancelled) {
          toast({
            title: "Failed to load reports",
            description: "Refresh the page or check your connection.",
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId, toast]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading reports…
      </div>
    );
  }

  if (!report) return null;

  const maxStageCount = Math.max(...report.stages.map((s) => s.count), 1);
  const conversionPct = report.total > 0 ? Math.round((report.hired / report.total) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Total candidates" value={report.total} icon={Users} />
        <KpiCard label="Active" value={report.active} icon={Users} accent="text-blue-600" />
        <KpiCard label="Hired" value={report.hired} icon={CheckCircle2} accent="text-green-600" />
        <KpiCard label="Rejected" value={report.rejected} icon={X} accent="text-red-600" />
      </div>

      <Card>
        <CardContent className="pt-5 space-y-3">
          <div className="flex items-baseline justify-between">
            <h3 className="font-semibold">Stage funnel</h3>
            <span className="text-xs text-muted-foreground">
              Hire rate: <span className="font-semibold">{conversionPct}%</span>
            </span>
          </div>
          <div className="space-y-2">
            {report.stages.map((s) => {
              const widthPct = (s.count / maxStageCount) * 100;
              return (
                <div key={s.stage} className="flex items-center gap-3">
                  <span className="w-28 text-xs font-medium shrink-0">
                    {PIPELINE_STAGE_LABELS[s.stage as PipelineStage]}
                  </span>
                  <div className="flex-1 h-6 bg-muted rounded relative overflow-hidden">
                    <div
                      className="h-full bg-primary/70 transition-all"
                      style={{ width: `${widthPct}%` }}
                    />
                    <span className="absolute inset-0 flex items-center px-2 text-xs font-medium">
                      {s.count}
                    </span>
                  </div>
                  <span className="w-20 text-right text-xs text-muted-foreground shrink-0 inline-flex items-center justify-end gap-1">
                    <TrendingDown className="w-3 h-3" />
                    {s.avgDaysInStage}d avg
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Time-to-hire breakdown, source attribution, and exportable PDF reports
        land in Phase 2 alongside the live hiring-manager portal.
      </p>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  accent?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold">{value.toLocaleString()}</p>
          </div>
          <Icon className={`w-5 h-5 mt-1 ${accent ?? "text-muted-foreground"}`} />
        </div>
      </CardContent>
    </Card>
  );
}
