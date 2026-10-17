// TeamActivities (/team) — the employer's hub for paid activities assigned to
// people they've hired. Assign new activities, approve/reject submitted ones
// (approval credits the worker's payout balance), and see tracked hours + pay.
//
// The clear, easy entry point for the "message a hired person to do work, even
// part-time, then pay them" loop. Backed by /api/activities/*.

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardList, Clock, DollarSign, Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import AssignActivityButton from "@/components/activities/AssignActivityButton";
import { activitiesService, type ActivityDTO } from "@/lib/services/activities-service";
import { formatMoneyCents, formatDurationHms } from "@/lib/format";

export default function TeamActivities(): JSX.Element {
  useSEO("/team");
  const { t } = useTranslation();
  useBreadcrumbs([{ name: t("activities.team.breadcrumb"), url: "/team" }]);
  const { toast } = useToast();

  const [activities, setActivities] = useState<ActivityDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await activitiesService.listCompanyActivities();
      setActivities(r.activities);
    } catch (e) {
      toast({ title: t("activities.team.loadError"), description: String((e as Error).message), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [t, toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const pending = useMemo(() => activities.filter((a) => a.status === "submitted"), [activities]);
  const stats = useMemo(() => {
    const approved = activities.filter((a) => a.status === "approved");
    const paidCents = approved.reduce((s, a) => s + a.earnedCents, 0);
    return { total: activities.length, pending: pending.length, paidCents };
  }, [activities, pending]);

  const approve = (id: string) => run(id, () => activitiesService.approve(id), "activities.team.approveError");
  const doReject = (id: string) => {
    if (!rejectReason.trim()) return;
    run(id, () => activitiesService.reject(id, rejectReason.trim()), "activities.team.rejectError").then(() => {
      setRejectingId(null);
      setRejectReason("");
    });
  };

  const run = async (id: string, fn: () => Promise<unknown>, errKey: string) => {
    setBusyId(id);
    try {
      await fn();
      await refresh();
    } catch (e) {
      toast({ title: t(errKey), description: String((e as Error).message), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AppShell bgClassName="bg-background">
      <main className="mx-auto w-full max-w-5xl px-4 sm:px-6 py-8 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
              <ClipboardList className="h-7 w-7 text-primary" />
              {t("activities.team.title")}
            </h1>
            <p className="text-muted-foreground mt-1">{t("activities.team.subtitle")}</p>
          </div>
          <AssignActivityButton variant="default" size="default" onAssigned={refresh} />
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatTile label={t("activities.team.statTotal")} value={String(stats.total)} icon={<ClipboardList className="h-4 w-4" />} />
          <StatTile label={t("activities.team.statPending")} value={String(stats.pending)} icon={<Clock className="h-4 w-4" />} />
          <StatTile label={t("activities.team.statPaid")} value={formatMoneyCents(stats.paidCents)} icon={<DollarSign className="h-4 w-4" />} />
        </div>

        {/* Approval queue */}
        {pending.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>{t("activities.team.queueTitle")}</CardTitle>
              <CardDescription>{t("activities.team.queueSubtitle")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {pending.map((a) => (
                <div key={a.id} className="rounded-lg border border-border p-3 sm:p-4 space-y-3">
                  <ActivityRow a={a} />
                  {rejectingId === a.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder={t("activities.team.rejectReasonPlaceholder")}
                        className="flex-1 min-w-[180px]"
                        autoFocus
                      />
                      <Button size="sm" variant="destructive" disabled={busyId === a.id || !rejectReason.trim()} onClick={() => doReject(a.id)}>
                        {busyId === a.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        {t("activities.team.confirmReject")}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setRejectingId(null); setRejectReason(""); }}>
                        {t("actions.cancel")}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" disabled={busyId === a.id} onClick={() => approve(a.id)}>
                        {busyId === a.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                        {t("activities.team.approve", { amount: formatMoneyCents(a.earnedCents, a.currency) })}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setRejectingId(a.id); setRejectReason(""); }}>
                        <X className="mr-2 h-4 w-4" />
                        {t("activities.team.reject")}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* All activities */}
        <Card>
          <CardHeader>
            <CardTitle>{t("activities.team.allTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-sm text-muted-foreground">{t("status.loading")}</div>
            ) : activities.length === 0 ? (
              <div className="text-sm text-muted-foreground">{t("activities.team.empty")}</div>
            ) : (
              <div className="space-y-2">
                {activities.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-3 border-b border-border last:border-0 py-2.5">
                    <ActivityRow a={a} compact />
                    <StatusBadge status={a.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </AppShell>
  );
}

function ActivityRow({ a, compact }: { a: ActivityDTO; compact?: boolean }): JSX.Element {
  const { t } = useTranslation();
  const earned =
    a.payType === "hourly" && a.status !== "approved"
      ? Math.round((a.trackedSec / 3600) * (a.rateCents ?? 0))
      : a.earnedCents;
  return (
    <div className="min-w-0 flex-1">
      <div className="font-medium break-words">{a.title}</div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs text-muted-foreground">
        {a.workerName && <span>{a.workerName}</span>}
        <span className="inline-flex items-center gap-1">
          {a.payType === "hourly" ? <Clock className="h-3.5 w-3.5" /> : <DollarSign className="h-3.5 w-3.5" />}
          {a.payType === "hourly"
            ? t("activities.mine.rate", { amount: formatMoneyCents(a.rateCents ?? 0, a.currency) })
            : t("activities.mine.fixed", { amount: formatMoneyCents(a.amountCents ?? 0, a.currency) })}
        </span>
        {a.payType === "hourly" && <span className="font-mono tabular-nums">{formatDurationHms(a.trackedSec)}</span>}
        {!compact && <span className="font-medium text-foreground">{t("activities.team.earned", { amount: formatMoneyCents(earned, a.currency) })}</span>}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ActivityDTO["status"] }): JSX.Element {
  const { t } = useTranslation();
  const variant = status === "approved" ? "default" : status === "rejected" ? "destructive" : "secondary";
  return <Badge variant={variant}>{t(`activities.status.${status}`)}</Badge>;
}

function StatTile({ label, value, icon }: { label: string; value: string; icon: JSX.Element }): JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
