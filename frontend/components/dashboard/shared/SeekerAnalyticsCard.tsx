import { BarChart3, Flame, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SeekerAnalytics } from "@/lib/services/dashboard-service";

interface SeekerAnalyticsCardProps {
  analytics?: SeekerAnalytics | null;
  loading?: boolean;
}

// Mirrors the Chrome extension's Analytics tab (jobseeker/sidepanel.js
// renderAnalytics). Keep stat names and order aligned so users see the same
// numbers on /profile and in the extension.
const FUNNEL_STAGES: Array<{ key: keyof SeekerAnalytics["funnel"]; label: string; color: string }> = [
  { key: "tracked", label: "Tracked", color: "bg-muted-foreground/70" },
  { key: "applied", label: "Applied", color: "bg-blue-500" },
  { key: "interviewing", label: "Interviewing", color: "bg-primary" },
  { key: "offered", label: "Offered", color: "bg-amber-500" },
  { key: "accepted", label: "Accepted", color: "bg-green-600" },
  { key: "rejected", label: "Rejected", color: "bg-red-500" },
];

function Delta({ value }: { value: number }) {
  if (value === 0) return <span className="text-xs text-muted-foreground">—</span>;
  const Icon = value > 0 ? TrendingUp : TrendingDown;
  const color = value > 0 ? "text-green-600" : "text-red-600";
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs ${color}`}>
      <Icon className="h-3 w-3" />
      {Math.abs(value)}
    </span>
  );
}

export function SeekerAnalyticsCard({ analytics, loading = false }: SeekerAnalyticsCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <BarChart3 className="h-5 w-5" />
          Application Analytics
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading && !analytics ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 bg-muted/40 rounded animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {/* This week snapshot */}
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                This Week
              </h4>
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center p-2 bg-muted/30 rounded-lg">
                  <div className="text-xl font-bold text-primary">
                    {analytics?.thisWeek.tracked ?? 0}
                  </div>
                  <div className="text-[11px] text-muted-foreground">Tracked</div>
                  <Delta value={analytics?.thisWeek.trackedDelta ?? 0} />
                </div>
                <div className="text-center p-2 bg-muted/30 rounded-lg">
                  <div className="text-xl font-bold text-blue-600">
                    {analytics?.thisWeek.applied ?? 0}
                  </div>
                  <div className="text-[11px] text-muted-foreground">Applied</div>
                  <Delta value={analytics?.thisWeek.appliedDelta ?? 0} />
                </div>
                <div className="text-center p-2 bg-muted/30 rounded-lg">
                  <div className="text-xl font-bold text-amber-600 flex items-center justify-center gap-1">
                    <Flame className="h-4 w-4" />
                    {analytics?.thisWeek.streak ?? 0}
                  </div>
                  <div className="text-[11px] text-muted-foreground">Day streak</div>
                </div>
              </div>
            </div>

            {/* Funnel */}
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                Pipeline
              </h4>
              <div className="space-y-1.5">
                {(() => {
                  const funnel = analytics?.funnel;
                  const max = Math.max(
                    1,
                    ...FUNNEL_STAGES.map((s) => funnel?.[s.key] ?? 0),
                  );
                  return FUNNEL_STAGES.map((s) => {
                    const count = funnel?.[s.key] ?? 0;
                    const pct = Math.round((count / max) * 100);
                    return (
                      <div key={s.key} className="flex items-center gap-2 text-xs">
                        <div className="w-20 text-muted-foreground shrink-0">{s.label}</div>
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full ${s.color} transition-all`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="w-6 text-right font-medium">{count}</div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Conversion rates */}
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                Conversion
              </h4>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 bg-muted/30 rounded-lg">
                  <div className="text-base font-bold">
                    {analytics?.conversion.applyRate ?? 0}%
                  </div>
                  <div className="text-[11px] text-muted-foreground">Apply</div>
                </div>
                <div className="p-2 bg-muted/30 rounded-lg">
                  <div className="text-base font-bold">
                    {analytics?.conversion.interviewRate ?? 0}%
                  </div>
                  <div className="text-[11px] text-muted-foreground">Interview</div>
                </div>
                <div className="p-2 bg-muted/30 rounded-lg">
                  <div className="text-base font-bold">
                    {analytics?.conversion.offerRate ?? 0}%
                  </div>
                  <div className="text-[11px] text-muted-foreground">Offer</div>
                </div>
              </div>
            </div>

            {/* Response tracker + totals */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 bg-muted/30 rounded-lg">
                <div className="text-base font-bold">
                  {analytics?.ghostRate ?? 0}%
                </div>
                <div className="text-[11px] text-muted-foreground">Ghost rate</div>
              </div>
              <div className="p-2 bg-muted/30 rounded-lg">
                <div className="text-base font-bold">
                  {analytics?.totals.applied ?? 0}
                </div>
                <div className="text-[11px] text-muted-foreground">All-time applied</div>
              </div>
              <div className="p-2 bg-muted/30 rounded-lg">
                <div className="text-base font-bold">
                  {analytics?.totals.offers ?? 0}
                </div>
                <div className="text-[11px] text-muted-foreground">All-time offers</div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default SeekerAnalyticsCard;
