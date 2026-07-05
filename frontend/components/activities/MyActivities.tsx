// MyActivities — the worker's view of paid activities an employer assigned.
//
// Self-gating (DRY): mount it anywhere; it renders nothing when the signed-in
// user has no assigned activities. Hourly activities get a start/stop timer;
// any assigned/rejected activity can be marked done → submitted for approval.
// Approved activities show the credited amount and link to Payouts & Earnings.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Clock, DollarSign, Loader2, Play, Send, Square } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  activitiesService,
  type ActivityDTO,
  type ActivityTimeEntry,
} from "@/lib/services/activities-service";
import { formatMoney, formatDuration } from "@/lib/activities/format";

export default function MyActivities(): JSX.Element | null {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [activities, setActivities] = useState<ActivityDTO[]>([]);
  const [activeTimer, setActiveTimer] = useState<ActivityTimeEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const loadedOnce = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const [a, timer] = await Promise.all([
        activitiesService.listAssignedToMe(),
        activitiesService.getActiveTimer(),
      ]);
      setActivities(a.activities);
      setActiveTimer(timer);
    } catch {
      /* silent — panel just stays hidden/empty */
    } finally {
      setLoading(false);
      loadedOnce.current = true;
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Advance the running timer display once per second.
  useEffect(() => {
    if (!activeTimer) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [activeTimer]);

  const liveElapsedSec = useMemo(() => {
    if (!activeTimer) return 0;
    return Math.max(0, Math.floor((Date.now() - new Date(activeTimer.startedAt).getTime()) / 1000));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTimer, tick]);

  const runAction = async (id: string, fn: () => Promise<unknown>, errKey: string) => {
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

  // Hidden until we know there's something to show.
  if (loading && !loadedOnce.current) return null;
  if (activities.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardIcon />
          {t("activities.mine.title")}
        </CardTitle>
        <CardDescription>{t("activities.mine.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {activities.map((a) => {
          const running = activeTimer?.taskId === a.id;
          const trackedSec = running ? a.trackedSec + liveElapsedSec : a.trackedSec;
          const earned = a.payType === "hourly"
            ? Math.round((trackedSec / 3600) * (a.rateCents ?? 0))
            : a.earnedCents;
          const editable = a.status === "assigned" || a.status === "rejected";
          const busy = busyId === a.id;
          return (
            <div
              key={a.id}
              className="rounded-lg border border-border p-3 sm:p-4 flex flex-col gap-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium break-words">{a.title}</div>
                  {a.description && (
                    <div className="text-sm text-muted-foreground mt-0.5 break-words">{a.description}</div>
                  )}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      {a.payType === "hourly" ? <Clock className="h-3.5 w-3.5" /> : <DollarSign className="h-3.5 w-3.5" />}
                      {a.payType === "hourly"
                        ? t("activities.mine.rate", { amount: formatMoney(a.rateCents ?? 0, a.currency) })
                        : t("activities.mine.fixed", { amount: formatMoney(a.amountCents ?? 0, a.currency) })}
                    </span>
                    {a.payType === "hourly" && (
                      <span className="font-mono tabular-nums">{formatDuration(trackedSec)}</span>
                    )}
                    {a.dueDate && <span>{t("activities.mine.due", { date: new Date(a.dueDate).toLocaleDateString() })}</span>}
                  </div>
                </div>
                <StatusBadge status={a.status} />
              </div>

              {a.status === "rejected" && a.rejectionReason && (
                <div className="text-xs text-destructive">
                  {t("activities.mine.rejected", { reason: a.rejectionReason })}
                </div>
              )}

              {/* Actions */}
              {editable && (
                <div className="flex flex-wrap items-center gap-2">
                  {a.payType === "hourly" && (
                    running ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busy}
                        onClick={() => runAction(a.id, () => activitiesService.stopTimer(a.id), "activities.mine.timerError")}
                      >
                        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Square className="mr-2 h-4 w-4" />}
                        {t("activities.mine.stop", { elapsed: formatDuration(liveElapsedSec) })}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy || !!activeTimer}
                        title={activeTimer ? t("activities.mine.timerBusy") : undefined}
                        onClick={() => runAction(a.id, () => activitiesService.startTimer(a.id), "activities.mine.timerError")}
                      >
                        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                        {t("activities.mine.start")}
                      </Button>
                    )
                  )}
                  <Button
                    size="sm"
                    disabled={busy || running}
                    title={running ? t("activities.mine.stopFirst") : undefined}
                    onClick={() => runAction(a.id, () => activitiesService.submit(a.id), "activities.mine.submitError")}
                  >
                    {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                    {t("activities.mine.submit")}
                  </Button>
                  {a.payType === "hourly" && (
                    <span className="text-xs text-muted-foreground">
                      {t("activities.mine.willEarn", { amount: formatMoney(earned, a.currency) })}
                    </span>
                  )}
                </div>
              )}

              {a.status === "submitted" && (
                <div className="text-xs text-muted-foreground">{t("activities.mine.awaiting")}</div>
              )}

              {a.status === "approved" && (
                <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-500">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{t("activities.mine.approved", { amount: formatMoney(a.earnedCents, a.currency) })}</span>
                  <Link to="/settings?tab=payouts" className="underline underline-offset-2">
                    {t("activities.mine.viewPayouts")}
                  </Link>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: ActivityDTO["status"] }): JSX.Element {
  const { t } = useTranslation();
  const variant =
    status === "approved" ? "default" : status === "rejected" ? "destructive" : "secondary";
  return <Badge variant={variant}>{t(`activities.status.${status}`)}</Badge>;
}

function ClipboardIcon(): JSX.Element {
  return <Clock className="h-5 w-5 text-muted-foreground" />;
}
