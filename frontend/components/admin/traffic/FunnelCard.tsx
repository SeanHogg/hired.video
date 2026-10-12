// One registered funnel (shared/usage.ts USAGE_FUNNELS) as ordered bars: each
// step's visitors, its share of the first step, and the step-over-step rate.
// Single series → one hue, every value labelled, no legend.

import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { findFunnel, type TrafficWindowDays } from "@shared/usage";
import { useFunnelReport } from "./use-traffic-report";
import { CardState } from "./CardState";

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

export function FunnelCard({ funnelId, days }: { funnelId: string; days: TrafficWindowDays }) {
  const { t } = useTranslation();
  const q = useFunnelReport(funnelId, days);
  const definition = findFunnel(funnelId);
  if (!definition) return null;

  const steps = q.data?.steps ?? [];
  const first = steps[0]?.visitors ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t(definition.labelKey)}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("admin.traffic.funnel.subtitle")}</p>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <CardState state="loading" />
        ) : q.isError ? (
          <CardState state="error" />
        ) : first === 0 ? (
          <CardState state="empty" />
        ) : (
          <ol className="space-y-3">
            {steps.map((step, i) => {
              const prev = i === 0 ? step.visitors : steps[i - 1].visitors;
              const share = pct(step.visitors, first);
              return (
                <li key={step.id}>
                  <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                    <span className="text-foreground">{t(step.labelKey)}</span>
                    <span className="tabular-nums text-muted-foreground">
                      <span className="font-semibold text-foreground">{step.visitors.toLocaleString()}</span>
                      {" · "}
                      {t("admin.traffic.funnel.ofFirst", { pct: share })}
                      {i > 0 && <> {" · "}{t("admin.traffic.funnel.fromPrev", { pct: pct(step.visitors, prev) })}</>}
                    </span>
                  </div>
                  <div className="h-3 w-full rounded-sm bg-muted" aria-hidden="true">
                    <div
                      className="h-3 rounded-r"
                      style={{
                        width: `${Math.max(share, step.visitors > 0 ? 1 : 0)}%`,
                        background: "hsl(var(--chart-1))",
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
