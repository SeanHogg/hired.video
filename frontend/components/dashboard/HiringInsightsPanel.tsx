/**
 * Hiring Insights — employer-facing aggregate funnel + source mix +
 * time-to-hire across every job the recruiter owns. The DEI section is
 * intentionally honest: candidate demographic data is not collected
 * today, so the panel surfaces only what's computable from anonymous
 * pipeline state and explains where real DEI dashboards (Greenhouse-
 * grade EEO-1 breakdowns) require additional opt-in data capture.
 *
 * Self-gates: an employer with no jobs gets an empty-state explaining
 * what they'll see once they post a role. Non-employers don't mount
 * this — the consumer (EmployerDashboard) is already role-gated.
 */

import { useEffect, useState } from "react";
import { BarChart3, Info, ShieldQuestion, Users, Clock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { apiClient } from "@/lib/api-client";

interface HiringInsights {
  jobIds: string[];
  pipelineFunnel: Record<string, number>;
  totalCandidates: number;
  totalHires: number;
  avgTimeToHireDays: number | null;
  medianTimeToHireDays: number | null;
  sourceMix: Record<string, number>;
  demographics: { supported: boolean; reason: string };
}

const STAGE_ORDER = ["applied", "screen", "interview", "offer", "hired", "rejected"];

export function HiringInsightsPanel() {
  const [data, setData] = useState<HiringInsights | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiClient
      .get<HiringInsights>("/api/recruiter/hiring-insights", null as any)
      .then((res) => {
        if (cancelled) return;
        setData(res.data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Hiring Insights</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.jobIds.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" /> Hiring Insights</CardTitle>
          <CardDescription>
            Post a job to start seeing org-level pipeline velocity, source mix, and time-to-hire here.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const funnelEntries = STAGE_ORDER.map((s) => ({ stage: s, count: data.pipelineFunnel[s] ?? 0 }));
  const sourceEntries = Object.entries(data.sourceMix).sort((a, b) => b[1] - a[1]);
  const sourceTotal = sourceEntries.reduce((a, b) => a + b[1], 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" /> Hiring Insights</CardTitle>
        <CardDescription>
          Aggregate metrics across every role you own. Anonymous — no candidate-level identifiers.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Headline numbers */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Candidates" value={String(data.totalCandidates)} icon={<Users className="h-4 w-4" />} />
          <Stat label="Hires" value={String(data.totalHires)} icon={<Users className="h-4 w-4" />} />
          <Stat
            label="Median TTH"
            value={data.medianTimeToHireDays != null ? `${data.medianTimeToHireDays}d` : "—"}
            icon={<Clock className="h-4 w-4" />}
          />
          <Stat
            label="Avg TTH"
            value={data.avgTimeToHireDays != null ? `${data.avgTimeToHireDays}d` : "—"}
            icon={<Clock className="h-4 w-4" />}
          />
        </div>

        {/* Funnel */}
        <div>
          <p className="text-sm font-medium mb-2">Pipeline funnel</p>
          <div className="space-y-1.5">
            {funnelEntries.map((e) => {
              const pct = data.totalCandidates > 0 ? Math.round((e.count / data.totalCandidates) * 100) : 0;
              return (
                <div key={e.stage}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="capitalize">{e.stage}</span>
                    <span className="text-muted-foreground">{e.count} · {pct}%</span>
                  </div>
                  <div className="h-1.5 rounded bg-muted overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Source mix */}
        {sourceEntries.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2">Where pipeline candidates came from</p>
            <ul className="space-y-1">
              {sourceEntries.map(([source, count]) => {
                const pct = sourceTotal > 0 ? Math.round((count / sourceTotal) * 100) : 0;
                return (
                  <li key={source} className="flex items-center justify-between text-sm">
                    <span className="capitalize">{source.replace(/_/g, " ")}</span>
                    <span className="text-xs text-muted-foreground">{count} · {pct}%</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* DEI / demographic capture honesty banner */}
        <div className="border border-dashed rounded-md p-3 bg-muted/30">
          <div className="flex items-start gap-2">
            <ShieldQuestion className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium flex items-center gap-2">
                DEI / EEO-1 Breakdown
                <Badge variant="outline" className="text-[10px]">Coming soon</Badge>
              </p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {data.demographics.reason} A Greenhouse-grade DEI dashboard (gender,
                ethnicity, veteran status, disability, age band) requires opt-in
                demographic capture from candidates plus aggregate-anonymisation
                thresholds. Tracked as a roadmap item; no incomplete or guessed numbers
                are shown above.
              </p>
              <p className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1">
                <Info className="h-3 w-3" /> Today's panel shows only anonymous pipeline + source data.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded border p-2">
      <p className="text-[10px] uppercase text-muted-foreground tracking-wide inline-flex items-center gap-1">
        {icon} {label}
      </p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}
