/**
 * Views per day (#861) — a single-series column chart over the
 * `viewsOverTime` series from GET /api/analytics/artifacts/:kind/:id.
 * Single series → no legend; the card title names it. Columns use the
 * primary theme token, a 2px gap between bars, and a per-bar hover/focus
 * tooltip; a visually hidden table carries the same numbers.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Point {
  date: string;
  views: number;
}

export default function ViewsOverTimeChart({ series }: { series: Point[] | undefined }) {
  const { t, i18n } = useTranslation();
  const [active, setActive] = useState<number | null>(null);
  if (!series?.length) return null;

  const max = Math.max(1, ...series.map((p) => p.views));
  const total = series.reduce((a, p) => a + p.views, 0);
  const fmtDate = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString(i18n.language, { month: "short", day: "numeric", timeZone: "UTC" });
  const focus = active != null ? series[active] : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{t("resumeAnalytics.viewsOverTime.title", { days: series.length })}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {focus
            ? t("resumeAnalytics.viewsOverTime.point", { date: fmtDate(focus.date), count: focus.views })
            : t("resumeAnalytics.viewsOverTime.total", { count: total })}
        </p>
      </CardHeader>
      <CardContent>
        <div
          className="flex h-28 items-end gap-[2px] border-b border-border"
          onMouseLeave={() => setActive(null)}
          aria-hidden
        >
          {series.map((p, i) => (
            <div
              key={p.date}
              className="flex h-full min-w-0 flex-1 items-end"
              onMouseEnter={() => setActive(i)}
            >
              <div
                className={`w-full rounded-t-[4px] ${active === i ? "bg-primary" : "bg-primary/70"}`}
                style={{ height: p.views > 0 ? `${Math.max(4, (p.views / max) * 100)}%` : "0%" }}
              />
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
          <span>{fmtDate(series[0].date)}</span>
          <span>{fmtDate(series[series.length - 1].date)}</span>
        </div>
        <table className="sr-only">
          <caption>{t("resumeAnalytics.viewsOverTime.title", { days: series.length })}</caption>
          <tbody>
            {series.map((p) => (
              <tr key={p.date}>
                <th scope="row">{fmtDate(p.date)}</th>
                <td>{p.views}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
