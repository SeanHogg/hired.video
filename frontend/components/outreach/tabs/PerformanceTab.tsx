/**
 * PerformanceTab — cross-placement ad analytics + cross-channel context.
 * All metrics are derived from `adStats` and `communicationStats` so the
 * tab is a pure view over the advertising/communication aggregates.
 */
import {
  BarChart3,
  DollarSign,
  Eye,
  Mail,
  MousePointer,
  Target,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { KpiCard } from "@/components/outreach/shared/KpiCard";
import { cn } from "@/lib/utils";
import type {
  AdvertisingStats,
  JobBoost,
} from "@/lib/services/advertising-service";
import type { CommunicationStats } from "@/types/communication";

export interface PerformanceTabProps {
  adStats: AdvertisingStats | null;
  activeBoosts: JobBoost[];
  communicationStats: CommunicationStats | null;
  onGoToAdvertise: () => void;
}

export function PerformanceTab({
  adStats,
  activeBoosts,
  communicationStats,
  onGoToAdvertise,
}: PerformanceTabProps) {
  const impressions = adStats?.totalImpressions ?? 0;
  const clicks = adStats?.totalClicks ?? 0;
  const apps = adStats?.totalApplications ?? 0;
  const clickRate = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const applyRate = clicks > 0 ? (apps / clicks) * 100 : 0;
  const stages: Array<{
    label: string;
    value: number;
    rate: number | null;
    color: string;
  }> = [
    { label: "Impressions", value: impressions, rate: null, color: "bg-brand-primary/80" },
    { label: "Clicks", value: clicks, rate: clickRate, color: "bg-brand-blue/80" },
    { label: "Applications", value: apps, rate: applyRate, color: "bg-primary/80" },
  ];
  const funnelMax = Math.max(impressions, 1);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <KpiCard
          title="Cost per Click"
          icon={MousePointer}
          value={
            adStats?.costPerClick != null
              ? `$${adStats.costPerClick.toFixed(2)}`
              : "—"
          }
          caption={`${(adStats?.totalClicks ?? 0).toLocaleString()} clicks`}
        />
        <KpiCard
          title="Cost per Application"
          icon={TrendingUp}
          value={
            adStats?.costPerApplication != null
              ? `$${adStats.costPerApplication.toFixed(2)}`
              : "—"
          }
          caption={`${adStats?.totalApplications ?? 0} attributed`}
        />
        <KpiCard
          title="Cost per Hire"
          icon={DollarSign}
          value="—"
          caption="Hire attribution in progress"
        />
        <KpiCard
          title="CTR"
          icon={Eye}
          value={`${(adStats?.ctr ?? 0).toFixed(2)}%`}
          caption="Impression → Click"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Conversion Funnel
          </CardTitle>
          <CardDescription>
            How paid traffic flows from impression to application across all placements.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {stages.map((s) => (
              <div key={s.label}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium">{s.label}</span>
                  <span className="text-muted-foreground">
                    {s.value.toLocaleString()}
                    {s.rate != null && (
                      <span className="ml-2 text-xs">
                        ({s.rate.toFixed(1)}% from prev)
                      </span>
                    )}
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn("h-full transition-all", s.color)}
                    style={{ width: `${(s.value / funnelMax) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Spend Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <SummaryRow
              label="Total spent"
              value={`$${(adStats?.totalSpentDollars ?? 0).toFixed(2)}`}
            />
            <SummaryRow label="Active boosts" value={adStats?.activeBoosts ?? 0} />
            <SummaryRow label="Active campaigns" value={adStats?.activeCampaigns ?? 0} />
            <SummaryRow
              label="Avg spend / active boost"
              value={
                adStats && adStats.activeBoosts > 0
                  ? `$${(adStats.totalSpentDollars / adStats.activeBoosts).toFixed(2)}`
                  : "—"
              }
              divider
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Email Outreach Performance
            </CardTitle>
            <CardDescription>
              Cross-channel context — how direct outreach compares to paid.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <SummaryRow
              label="Messages sent"
              value={communicationStats?.totalMessages ?? 0}
            />
            <SummaryRow
              label="Response rate"
              value={
                communicationStats?.responseRate != null
                  ? `${Math.round(communicationStats.responseRate * 100)}%`
                  : "—"
              }
            />
            <SummaryRow
              label="Active conversations"
              value={communicationStats?.activeConversations ?? 0}
            />
            <SummaryRow
              label="Pending follow-ups"
              value={communicationStats?.pendingFollowUps ?? 0}
              divider
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Per-Boost Performance
          </CardTitle>
          <CardDescription>
            Compare placements and CTR across all active and past boosts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activeBoosts.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Placement</TableHead>
                  <TableHead className="text-right">Spent</TableHead>
                  <TableHead className="text-right">Impressions</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead className="text-right">CTR</TableHead>
                  <TableHead className="text-right">CPC</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeBoosts.map((boost) => {
                  const cpc = boost.clicks > 0 ? boost.spentDollars / boost.clicks : null;
                  return (
                    <TableRow key={boost.id}>
                      <TableCell className="font-medium">
                        {boost.jobTitle ?? boost.jobId.slice(0, 8)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize text-xs">
                          {boost.placementType.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        ${boost.spentDollars.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        {boost.impressions.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {boost.clicks.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {boost.ctr.toFixed(2)}%
                      </TableCell>
                      <TableCell className="text-right">
                        {cpc != null ? `$${cpc.toFixed(2)}` : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p className="text-sm mb-4">
                No boosts yet — create one on the Advertise tab to start collecting performance data.
              </p>
              <Button variant="outline" onClick={onGoToAdvertise}>
                Go to Advertise
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  divider,
}: {
  label: string;
  value: React.ReactNode;
  divider?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between",
        divider && "pt-2 border-t",
      )}
    >
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

export default PerformanceTab;
