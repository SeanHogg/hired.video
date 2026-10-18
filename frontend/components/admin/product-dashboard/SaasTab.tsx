import { useTranslation } from "react-i18next";
import { DollarSign, BarChart3, Users, TrendingDown, Activity, TrendingUp, PieChart, UserCheck } from "lucide-react";
import {
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
} from "recharts";
import { formatPercent } from "@/lib/format";
import { MetricCard } from "./MetricCard";
import { CountList } from "./CountList";
import { BreakdownCard } from "./BreakdownCard";
import { REVENUE_PIE_COLORS, formatTierName } from "./helpers";
import type { SaasMetrics } from "./types";

function SaasMetricGrid({ saas }: { saas: SaasMetrics }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title={t("admin.productDashboard.mrr")}
          value={`$${saas.monthlyRecurringRevenue.toLocaleString()}`}
          change={`${saas.growthRate > 0 ? "+" : ""}${saas.growthRate.toFixed(1)}%`}
          trend={saas.growthRate > 0 ? "up" : "down"}
          icon={<DollarSign className="h-4 w-4" />}
          description={t("admin.productDashboard.mrrDesc")}
        />
        <MetricCard
          title={t("admin.productDashboard.arr")}
          value={`$${saas.annualRecurringRevenue.toLocaleString()}`}
          icon={<BarChart3 className="h-4 w-4" />}
          description={t("admin.productDashboard.arrDesc")}
        />
        <MetricCard
          title={t("admin.productDashboard.arpu")}
          value={`$${saas.averageRevenuePerUser.toFixed(2)}`}
          icon={<Users className="h-4 w-4" />}
          description={t("admin.productDashboard.arpuDesc")}
        />
        <MetricCard
          title={t("admin.productDashboard.churnRate")}
          value={`${saas.churnRate.toFixed(1)}%`}
          trend={saas.churnRate < 5 ? "up" : "down"}
          icon={<TrendingDown className="h-4 w-4" />}
          description={t("admin.productDashboard.churnRateDesc")}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mt-4">
        <MetricCard
          title={t("admin.productDashboard.ltv")}
          value={`$${saas.customerLifetimeValue.toLocaleString()}`}
          icon={<Activity className="h-4 w-4" />}
          description={t("admin.productDashboard.ltvDesc")}
        />
        <MetricCard
          title={t("admin.productDashboard.cac")}
          value={`$${(saas.customerAcquisitionCost ?? 0).toFixed(2)}`}
          icon={<TrendingUp className="h-4 w-4" />}
          description={t("admin.productDashboard.cacDesc")}
        />
        <MetricCard
          title={t("admin.productDashboard.conversionRate")}
          value={formatPercent(saas.conversionRate)}
          icon={<PieChart className="h-4 w-4" />}
          description={t("admin.productDashboard.conversionRateDesc")}
        />
        <MetricCard
          title={t("admin.productDashboard.activeSubscriptions")}
          value={saas.activeSubscriptions}
          icon={<UserCheck className="h-4 w-4" />}
          description={t("admin.productDashboard.activeSubscriptionsDesc")}
        />
      </div>
    </>
  );
}

function RevenueDistributionCard({ saas }: { saas: SaasMetrics }) {
  const { t } = useTranslation();
  const revenueByTier = saas.revenueByTier || {};
  const subscriptionsByTier = saas.subscriptionsByTier || {};
  const revenueEntries = Object.entries(revenueByTier);
  return (
    <BreakdownCard
      title={t("admin.productDashboard.revenueDistributionTitle")}
      description={t("admin.productDashboard.revenueDistributionDesc")}
    >
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <RechartsPieChart>
            <Pie
              data={revenueEntries.map(([tier, revenue]) => ({
                name: formatTierName(tier),
                value: revenue,
                subscriptions: subscriptionsByTier[tier] || 0,
              }))}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, value, percent }) =>
                `${name}: $${value.toLocaleString()} (${(percent * 100).toFixed(1)}%)`
              }
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              {revenueEntries.map((_entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={REVENUE_PIE_COLORS[index % REVENUE_PIE_COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, name, props) => [
                `$${value.toLocaleString()}`,
                t("admin.productDashboard.tierAccountsTooltip", { name, count: props.payload.subscriptions }),
              ]}
              labelFormatter={(label) => t("admin.productDashboard.revenueFromLabel", { label })}
            />
            <Legend />
          </RechartsPieChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 space-y-2">
        <div className="text-sm font-medium">{t("admin.productDashboard.subscriptionTiers")}</div>
        {Object.entries(subscriptionsByTier).map(([tier, count]) => {
          const revenue = revenueByTier[tier] || 0;
          const avgRevenue = count > 0 ? revenue / count : 0;
          return (
            <div
              key={tier}
              className="flex justify-between items-center text-sm"
            >
              <span className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-primary" />
                {formatTierName(tier)}
              </span>
              <div className="text-right">
                <div className="font-medium">{t("admin.productDashboard.tierAccountCount", { count })}</div>
                <div className="text-xs text-muted-foreground">
                  {t("admin.productDashboard.tierRevenueSummary", {
                    total: revenue.toLocaleString(),
                    avg: avgRevenue.toFixed(0),
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </BreakdownCard>
  );
}

export function SaasTab({ saas }: { saas: SaasMetrics | undefined }) {
  const { t } = useTranslation();
  if (!saas) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          {t("admin.productDashboard.saasUnavailable")}
        </p>
      </div>
    );
  }
  return (
    <>
      <SaasMetricGrid saas={saas} />

      <div className="grid gap-4 md:grid-cols-2 mt-6">
        <BreakdownCard
          title={t("admin.productDashboard.revenueByTier")}
          description={t("admin.productDashboard.revenueByTierDesc")}
        >
          <CountList
            counts={saas.revenueByTier}
            formatValue={(revenue) => <>${revenue.toLocaleString()}</>}
          />
        </BreakdownCard>

        <RevenueDistributionCard saas={saas} />
      </div>
    </>
  );
}
