// Daily visitors vs signed-in visitors over the window, with headline totals.
// Page views are a different scale, so they ride as a stat tile — never a
// second y-axis. Colors come from the --chart-* theme tokens (light + dark).

import { useTranslation } from "react-i18next";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TrafficWindowDays } from "@shared/usage";
import { useTrafficReport } from "./use-traffic-report";
import { CardState } from "./CardState";

const SERIES = [
  { key: "visitors", labelKey: "admin.traffic.trend.visitors", color: "hsl(var(--chart-1))" },
  { key: "signedIn", labelKey: "admin.traffic.trend.signedIn", color: "hsl(var(--chart-2))" },
] as const;

const fmt = (n: number) => n.toLocaleString();

export function TrafficTrendCard({ days }: { days: TrafficWindowDays }) {
  const { t } = useTranslation();
  const q = useTrafficReport(days);
  const series = q.data?.series ?? [];
  const totals = series.reduce(
    (acc, p) => ({ pageViews: acc.pageViews + p.pageViews, peak: Math.max(acc.peak, p.visitors) }),
    { pageViews: 0, peak: 0 },
  );
  const tiles = [
    { labelKey: "admin.traffic.trend.activeDays", value: series.length },
    { labelKey: "admin.traffic.trend.peakVisitors", value: totals.peak },
    { labelKey: "admin.traffic.trend.pageViews", value: totals.pageViews },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("admin.traffic.trend.title")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("admin.traffic.trend.subtitle")}</p>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <CardState state="loading" />
        ) : q.isError ? (
          <CardState state="error" />
        ) : series.length === 0 ? (
          <CardState state="empty" />
        ) : (
          <>
            <dl className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-3">
              {tiles.map((tile) => (
                <div key={tile.labelKey} className="rounded-md border border-border p-3">
                  <dt className="text-xs text-muted-foreground">{t(tile.labelKey)}</dt>
                  <dd className="text-xl font-semibold tabular-nums text-foreground">{fmt(tile.value)}</dd>
                </div>
              ))}
            </dl>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
                  <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tickFormatter={(d: string) => d.slice(5)}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                    stroke="hsl(var(--border))"
                    minTickGap={16}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                    stroke="hsl(var(--border))"
                    width={40}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      color: "hsl(var(--foreground))",
                      borderRadius: 6,
                    }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                    itemStyle={{ color: "hsl(var(--foreground))" }}
                    cursor={{ stroke: "hsl(var(--muted-foreground))", strokeWidth: 1 }}
                  />
                  <Legend wrapperStyle={{ color: "hsl(var(--foreground))", fontSize: 12 }} />
                  {SERIES.map((s) => (
                    <Line
                      key={s.key}
                      type="monotone"
                      dataKey={s.key}
                      name={t(s.labelKey)}
                      stroke={s.color}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 5, stroke: "hsl(var(--card))", strokeWidth: 2 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-muted-foreground">{t("admin.traffic.showTable")}</summary>
              <div className="mt-2 max-h-64 overflow-auto">
                <table className="w-full text-left tabular-nums">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="py-1 pr-3 font-medium">{t("admin.traffic.trend.day")}</th>
                      {SERIES.map((s) => (
                        <th key={s.key} className="py-1 pr-3 font-medium">{t(s.labelKey)}</th>
                      ))}
                      <th className="py-1 font-medium">{t("admin.traffic.trend.pageViews")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {series.map((p) => (
                      <tr key={p.day} className="border-t border-border">
                        <td className="py-1 pr-3">{p.day}</td>
                        <td className="py-1 pr-3">{fmt(p.visitors)}</td>
                        <td className="py-1 pr-3">{fmt(p.signedIn)}</td>
                        <td className="py-1">{fmt(p.pageViews)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </CardContent>
    </Card>
  );
}
