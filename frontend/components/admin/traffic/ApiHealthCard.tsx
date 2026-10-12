// API health from request_logs (30 days): the routes failing most, with their
// error code and file:line, plus capabilities the latest config snapshot
// reports as not configured. Answers "is it live and working?" from evidence.

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useApiHealthReport } from "./use-traffic-report";
import { CardState } from "./CardState";

const MAX_ERRORS = 10;

function notReadyCapabilities(metadata: unknown): string[] {
  const list = (metadata as { notReady?: unknown } | null)?.notReady;
  return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
}

function Tile({ labelKey, value }: { labelKey: string; value: string }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-md border border-border p-3">
      <dt className="text-xs text-muted-foreground">{t(labelKey)}</dt>
      <dd className="text-xl font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

export function ApiHealthCard() {
  const { t } = useTranslation();
  const q = useApiHealthReport();
  const report = q.data;
  const serverErrors = report?.errors.filter((e) => (e.status ?? 0) >= 500).slice(0, MAX_ERRORS) ?? [];
  const notReady = notReadyCapabilities(report?.configSnapshot?.metadata);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("admin.traffic.health.title")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("admin.traffic.health.subtitle")}</p>
      </CardHeader>
      <CardContent className="space-y-5">
        {q.isLoading ? (
          <CardState state="loading" />
        ) : q.isError || !report ? (
          <CardState state="error" />
        ) : (
          <>
            <dl className="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-3">
              <Tile labelKey="admin.traffic.health.requests" value={report.totals.requests.toLocaleString()} />
              <Tile labelKey="admin.traffic.health.errorRate" value={`${report.totals.serverErrorRate}%`} />
              <Tile labelKey="admin.traffic.health.releases" value={String(report.releases.length)} />
            </dl>

            <section>
              <h3 className="mb-2 text-sm font-medium text-foreground">{t("admin.traffic.health.config")}</h3>
              {!report.configSnapshot ? (
                <p className="text-sm text-muted-foreground">{t("admin.traffic.health.noSnapshot")}</p>
              ) : notReady.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-foreground">
                  <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden="true" />
                  {t("admin.traffic.health.allConfigured")}
                </p>
              ) : (
                <ul className="flex flex-wrap gap-2" aria-label={t("admin.traffic.health.notConfigured")}>
                  {notReady.map((cap) => (
                    <li
                      key={cap}
                      className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-foreground"
                    >
                      <AlertTriangle className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
                      <code>{cap}</code>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="mb-2 text-sm font-medium text-foreground">{t("admin.traffic.health.topErrors")}</h3>
              {serverErrors.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("admin.traffic.health.noErrors")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[32rem] text-left text-sm tabular-nums">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="py-1 pr-3 font-medium">{t("admin.traffic.health.route")}</th>
                        <th className="py-1 pr-3 font-medium">{t("admin.traffic.health.status")}</th>
                        <th className="py-1 pr-3 font-medium">{t("admin.traffic.health.code")}</th>
                        <th className="py-1 pr-3 font-medium">{t("admin.traffic.health.count")}</th>
                        <th className="py-1 font-medium">{t("admin.traffic.health.lastSeen")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {serverErrors.map((e) => (
                        <tr key={`${e.route}-${e.status}-${e.errorCode}`} className="border-t border-border align-top">
                          <td className="py-1 pr-3">
                            <code className="break-all text-foreground">{e.route}</code>
                            {e.errorSource && <div className="text-xs text-muted-foreground">{e.errorSource}</div>}
                          </td>
                          <td className="py-1 pr-3 text-foreground">{e.status}</td>
                          <td className="py-1 pr-3 text-foreground">{e.errorCode ?? "—"}</td>
                          <td className="py-1 pr-3 text-foreground">{e.count.toLocaleString()}</td>
                          <td className="py-1 text-muted-foreground">
                            {e.lastSeen ? new Date(e.lastSeen).toLocaleString() : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}
