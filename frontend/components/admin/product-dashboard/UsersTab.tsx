import { useTranslation } from "react-i18next";
import { Users, UserCheck, TrendingUp, UserPlus } from "lucide-react";
import {
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getRoleDisplayLabel } from "@/lib/role-utils";
import { MetricCard } from "./MetricCard";
import { GrowthChartCard } from "./GrowthChartCard";
import { GROWTH_STROKES, ROLE_PIE_COLORS, isPaidRole } from "./helpers";
import type { ProductDashboardData } from "./types";

export function UsersTab({ data }: { data: ProductDashboardData }) {
  const { t } = useTranslation();
  const { userMetrics } = data;
  const roleEntries = Object.entries(userMetrics.usersByRole || {});
  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          title={t("admin.productDashboard.totalUsers")}
          value={userMetrics.totalUsers}
          icon={<Users className="h-4 w-4" />}
          description={t("admin.productDashboard.allRegisteredUsers")}
        />
        <MetricCard
          title={t("admin.productDashboard.activeUsers")}
          value={userMetrics.activeUsers}
          icon={<UserCheck className="h-4 w-4" />}
          description={t("admin.productDashboard.activeUsersDesc")}
        />
        <MetricCard
          title={t("admin.productDashboard.newUsers")}
          value={userMetrics.newUsersLast30Days}
          icon={<TrendingUp className="h-4 w-4" />}
          description={t("admin.productDashboard.registeredLast30Days")}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 mt-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("admin.productDashboard.accountTypesTitle")}</CardTitle>
            <CardDescription>
              {t("admin.productDashboard.accountTypesDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <Pie
                    data={roleEntries.map(([role, count]) => ({
                      name: getRoleDisplayLabel(role),
                      value: count,
                      isPaid: isPaidRole(role),
                    }))}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value, percent }) =>
                      `${name}: ${value} (${(percent * 100).toFixed(0)}%)`
                    }
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {roleEntries.map((_entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={ROLE_PIE_COLORS[index % ROLE_PIE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name) => [value, name]}
                    labelFormatter={(label) => t("admin.productDashboard.accountTypeLabel", { label })}
                  />
                  <Legend />
                </RechartsPieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 space-y-2">
              <div className="text-sm font-medium">
                {t("admin.productDashboard.accountStatusSummary")}
              </div>
              {roleEntries.map(([role, count]) => {
                const isPaid = isPaidRole(role);
                return (
                  <div
                    key={role}
                    className="flex justify-between items-center text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <div
                        className={`w-3 h-3 rounded-full ${isPaid ? "bg-green-500" : "bg-gray-400"}`}
                      />
                      {getRoleDisplayLabel(role)}
                      <span
                        className={`px-2 py-1 rounded-full text-xs ${isPaid ? "bg-green-100 text-green-800" : "bg-muted text-muted-foreground"}`}
                      >
                        {isPaid ? t("admin.productDashboard.paid") : t("admin.productDashboard.free")}
                      </span>
                    </span>
                    <span className="font-medium">{count}</span>
                  </div>
                );
              })}
            </div>

            {/* New signups by role (last 30d) — the growth-by-role view
                that motivated promoting creator/affiliate to roles (#2000).
                Dynamic over usersByRole keys so any role appears. */}
            {userMetrics.newUsersByRole &&
              Object.keys(userMetrics.newUsersByRole).length > 0 && (
                <div className="mt-6 space-y-2 border-t pt-4">
                  <div className="text-sm font-medium">{t("admin.productDashboard.newSignupsByRole")}</div>
                  {Object.entries(userMetrics.newUsersByRole)
                    .sort((a, b) => b[1] - a[1])
                    .map(([role, count]) => (
                      <div key={role} className="flex justify-between items-center text-sm">
                        <span className="flex items-center gap-2">
                          <UserPlus className="h-3.5 w-3.5 text-muted-foreground" />
                          {getRoleDisplayLabel(role)}
                        </span>
                        <span className="font-medium">{count}</span>
                      </div>
                    ))}
                </div>
              )}
          </CardContent>
        </Card>

        <GrowthChartCard
          title={t("admin.productDashboard.userGrowthTrend")}
          description={t("admin.productDashboard.userGrowthTrendDesc")}
          data={data.userGrowthLast90Days}
          stroke={GROWTH_STROKES.users}
        />
      </div>
    </>
  );
}
