// InterviewerReliabilityPanel — self-gating reliability scorecard for an
// interviewer (#1434). Loads stats from `/api/scorecards/reliability/:id`
// and renders three KPI tiles + a small on-time-rate visual.
//
// Self-gating: returns null when the API has no usable history (no
// dueAt-bound submissions ever). Consumers don't pass a `canShow` boolean.

import { useEffect, useState } from "react";
import { Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  scorecardsService,
  type InterviewerReliability,
} from "@/lib/services/scorecards-service";

interface Props {
  userId: string;
}

function formatLag(ms: number | null): string {
  if (ms == null) return "—";
  const abs = Math.abs(ms);
  const HOUR = 60 * 60 * 1000;
  if (abs >= 24 * HOUR) return `${Math.round(abs / (24 * HOUR))}d ${ms < 0 ? "early" : "late"}`;
  if (abs >= HOUR) return `${Math.round(abs / HOUR)}h ${ms < 0 ? "early" : "late"}`;
  return `${Math.round(abs / (60 * 1000))}m ${ms < 0 ? "early" : "late"}`;
}

export function InterviewerReliabilityPanel({ userId }: Props) {
  const [stats, setStats] = useState<InterviewerReliability | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await scorecardsService.getReliability(userId).catch(() => null);
      if (!cancelled) {
        setStats(s);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) return null;
  // Self-gate: nothing to render when the interviewer has never had an
  // SLA-bound submission AND no overdue drafts AND no 30d activity.
  if (
    !stats ||
    (stats.totalWithSla === 0 &&
      stats.overdueDraftCount === 0 &&
      stats.last30dCount === 0)
  ) {
    return null;
  }

  const onTimePct =
    stats.totalWithSla > 0
      ? Math.round((stats.onTimeCount / stats.totalWithSla) * 100)
      : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4" /> Scorecard reliability
          {stats.overdueDraftCount > 0 && (
            <Badge className="bg-red-600 text-white">
              <AlertTriangle className="mr-1 h-3 w-3" /> {stats.overdueDraftCount} overdue
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <Stat
            label="On time"
            value={onTimePct !== null ? `${onTimePct}%` : "—"}
            sub={`${stats.onTimeCount} of ${stats.totalWithSla}`}
            tone={onTimePct === null ? "muted" : onTimePct >= 80 ? "good" : "warn"}
          />
          <Stat
            label="Avg lag"
            value={formatLag(stats.avgLagMs)}
            sub="from due_at"
          />
          <Stat label="Late" value={String(stats.lateCount)} sub="lifetime" />
          <Stat label="Last 30d" value={String(stats.last30dCount)} sub="submissions" />
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "warn" | "muted";
}) {
  const valueColor =
    tone === "good"
      ? "text-green-700"
      : tone === "warn"
        ? "text-amber-700"
        : "";
  return (
    <div className="rounded border p-3">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        {tone === "good" && <CheckCircle2 className="h-3 w-3" />}
        {label}
      </div>
      <div className={`text-xl font-semibold mt-1 ${valueColor}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
