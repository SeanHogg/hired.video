// SuperAdmin: what AI consumption costs us vs what those users pay
// (shared/ai-spend.ts). Cost is recorded per call from the model rate card;
// revenue is an estimate (Pro pro-rated over the window + packs bought).
// Users whose cost exceeds their revenue are flagged.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { DollarSign, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatTokens } from "@/hooks/use-token-budget";
import { aiSpendService } from "@/lib/services/ai-spend-service";
import { AI_SPEND_DEFAULT_WINDOW, AI_SPEND_WINDOWS, type AiSpendWindow } from "@shared/ai-spend";

const STALE_MS = 60_000;

function useUsd() {
  const { i18n } = useTranslation();
  return (n: number) =>
    new Intl.NumberFormat(i18n.language, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: Math.abs(n) < 1 ? 4 : 2,
    }).format(n);
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bad" }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-semibold tabular-nums text-foreground", tone === "bad" && "text-destructive")}>
        {value}
      </p>
    </div>
  );
}

export function AiSpendPanel() {
  const { t } = useTranslation();
  const usd = useUsd();
  const [days, setDays] = useState<AiSpendWindow>(AI_SPEND_DEFAULT_WINDOW);
  const report = useQuery({
    queryKey: ["admin", "ai-spend", days],
    queryFn: () => aiSpendService.report(days),
    staleTime: STALE_MS,
  });
  const data = report.data;

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" aria-hidden="true" />
            {t("admin.aiSpend.title")}
          </CardTitle>
          <CardDescription className="mt-1 max-w-2xl">{t("admin.aiSpend.subtitle")}</CardDescription>
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label={t("admin.aiSpend.windowLabel")}>
          {AI_SPEND_WINDOWS.map((w) => (
            <Button
              key={w}
              size="sm"
              variant={w === days ? "default" : "outline"}
              aria-pressed={w === days}
              onClick={() => setDays(w)}
            >
              {t("admin.aiSpend.window", { days: w })}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {report.isLoading ? (
          <div className="flex justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-label={t("admin.aiSpend.loading")} />
          </div>
        ) : report.isError || !data ? (
          <p role="alert" className="text-sm text-destructive">
            {t("admin.aiSpend.error")}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label={t("admin.aiSpend.totalCost")} value={usd(data.totals.costUsd)} />
              <Stat label={t("admin.aiSpend.totalCalls")} value={data.totals.calls.toLocaleString()} />
              <Stat label={t("admin.aiSpend.totalTokens")} value={formatTokens(data.totals.tokens)} />
              <Stat
                label={t("admin.aiSpend.unprofitable")}
                value={data.unprofitableUsers.toLocaleString()}
                tone={data.unprofitableUsers > 0 ? "bad" : undefined}
              />
            </div>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">{t("admin.aiSpend.byModel")}</h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("admin.aiSpend.col.model")}</TableHead>
                      <TableHead className="text-right">{t("admin.aiSpend.col.calls")}</TableHead>
                      <TableHead className="text-right">{t("admin.aiSpend.col.tokens")}</TableHead>
                      <TableHead className="text-right">{t("admin.aiSpend.col.cost")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.models.map((m) => (
                      <TableRow key={m.rateId}>
                        <TableCell className="font-mono text-xs">{m.rateId}</TableCell>
                        <TableCell className="text-right tabular-nums">{m.calls.toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatTokens(m.tokens)}</TableCell>
                        <TableCell className="text-right tabular-nums">{usd(m.costUsd)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">{t("admin.aiSpend.topUsers")}</h3>
              <p className="text-xs text-muted-foreground">{t("admin.aiSpend.revenueNote")}</p>
              {data.users.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("admin.aiSpend.empty")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("admin.aiSpend.col.user")}</TableHead>
                        <TableHead>{t("admin.aiSpend.col.plan")}</TableHead>
                        <TableHead className="text-right">{t("admin.aiSpend.col.tokens")}</TableHead>
                        <TableHead className="text-right">{t("admin.aiSpend.col.cost")}</TableHead>
                        <TableHead className="text-right">{t("admin.aiSpend.col.revenue")}</TableHead>
                        <TableHead className="text-right">{t("admin.aiSpend.col.margin")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.users.map((u) => (
                        <TableRow key={u.userId}>
                          <TableCell className="max-w-[16rem]">
                            <div className="truncate font-medium text-foreground">{u.name ?? u.email ?? u.userId}</div>
                            {u.name && u.email && <div className="truncate text-xs text-muted-foreground">{u.email}</div>}
                          </TableCell>
                          <TableCell>
                            <Badge variant={u.isPro ? "default" : "secondary"}>
                              {u.isPro ? t("admin.aiSpend.plan.pro") : t("admin.aiSpend.plan.free")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{formatTokens(u.tokens)}</TableCell>
                          <TableCell className="text-right tabular-nums">{usd(u.costUsd)}</TableCell>
                          <TableCell className="text-right tabular-nums">{usd(u.revenueUsd)}</TableCell>
                          <TableCell
                            className={cn("text-right font-medium tabular-nums", u.marginUsd < 0 && "text-destructive")}
                          >
                            {usd(u.marginUsd)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}
