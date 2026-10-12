// Where visitors first arrived in the window: entry path, referrer host and
// UTM source — three ranked lists with an inline magnitude bar.

import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TrafficSourceDto, TrafficWindowDays } from "@shared/usage";
import { useTrafficReport } from "./use-traffic-report";
import { CardState } from "./CardState";

function RankedList({ titleKey, rows }: { titleKey: string; rows: TrafficSourceDto[] }) {
  const { t } = useTranslation();
  const max = rows[0]?.visitors ?? 0;
  return (
    <section className="min-w-0">
      <h3 className="mb-2 text-sm font-medium text-foreground">{t(titleKey)}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("admin.traffic.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.key} className="text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-foreground" title={r.key}>{r.key}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{r.visitors.toLocaleString()}</span>
              </div>
              <div className="mt-1 h-1.5 w-full rounded-sm bg-muted" aria-hidden="true">
                <div
                  className="h-1.5 rounded-r"
                  style={{ width: `${max > 0 ? (r.visitors / max) * 100 : 0}%`, background: "hsl(var(--chart-1))" }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function TrafficSourcesCard({ days }: { days: TrafficWindowDays }) {
  const { t } = useTranslation();
  const q = useTrafficReport(days);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("admin.traffic.sources.title")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("admin.traffic.sources.subtitle")}</p>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <CardState state="loading" />
        ) : q.isError || !q.data ? (
          <CardState state="error" />
        ) : (
          <div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(14rem,1fr))]">
            <RankedList titleKey="admin.traffic.sources.entryPaths" rows={q.data.entryPaths} />
            <RankedList titleKey="admin.traffic.sources.referrers" rows={q.data.referrers} />
            <RankedList titleKey="admin.traffic.sources.utm" rows={q.data.utmSources} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
