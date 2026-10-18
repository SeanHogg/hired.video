import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Clock, Play, Square, Loader2, CalendarRange, Send, CheckCircle2, XCircle, Printer } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatDuration } from "@/lib/format";
import { createRolePermissions } from "@/lib/role-utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { workforceService, type TaskTimeEntry, type Timesheet } from "@/lib/services/workforce-service";

/**
 * Workforce timesheet surface (employee + employer-as-self).
 *
 * Self-gates on role — returns null for viewers who aren't part of the
 * workforce loop. Per the DRY rule, consumers mount <TimesheetTab/>
 * unconditionally and this component decides its own visibility from
 * the auth context.
 *
 * Phase 1 (#1349) — punch in/out + week view + submit week.
 */
export function TimesheetTab() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const permissions = createRolePermissions(user?.role);
  if (!permissions.canPunchTime && !permissions.canManageWorkforce) return null;

  // Employer-only viewers (no employee membership) see a different prompt;
  // they should be using the Workforce settings panel, not this surface.
  if (!permissions.canPunchTime) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("timesheet.noTimesheet.title")}</CardTitle>
          <CardDescription>
            {t("timesheet.noTimesheet.description")}{" "}
            <strong>{t("timesheet.noTimesheet.settingsPath")}</strong>
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return <EmployeeTimesheetSurface />;
}

function startOfWeekISO(date = new Date()): string {
  // ISO weeks start Monday. Convert local "today" to UTC midnight Monday.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0..6 Sun..Sat
  const diff = (day === 0 ? -6 : 1 - day);
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

const formatTimesheetDuration = (sec: number): string => formatDuration(sec, { style: "hoursMin" });

function EmployeeTimesheetSurface() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [active, setActive] = useState<TaskTimeEntry | null>(null);
  const [weekEntries, setWeekEntries] = useState<TaskTimeEntry[]>([]);
  const [myTimesheets, setMyTimesheets] = useState<Timesheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState("");
  const [billable, setBillable] = useState(true);
  const [tick, setTick] = useState(0);
  const periodStart = useMemo(() => startOfWeekISO(), []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [a, w, mine] = await Promise.all([
        workforceService.getActive(),
        workforceService.getWeek(periodStart),
        workforceService.listMyTimesheets(),
      ]);
      setActive(a);
      setWeekEntries(w.entries);
      setMyTimesheets(mine.timesheets);
    } catch (e) {
      toast({ title: t("timesheet.toast.loadFailed"), description: String((e as Error).message), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [periodStart, toast, t]);

  useEffect(() => { refresh(); }, [refresh]);

  // Tick every second while punched-in so the timer display advances.
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [active]);

  const elapsedSec = useMemo(() => {
    if (!active) return 0;
    return Math.max(0, Math.floor((Date.now() - new Date(active.startedAt).getTime()) / 1000));
    // tick is intentionally read via the dep below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, tick]);

  const handlePunchIn = async () => {
    setBusy(true);
    try {
      await workforceService.punchIn({ notes: notes.trim() || null, billable });
      setNotes("");
      await refresh();
    } catch (e) {
      toast({ title: t("timesheet.toast.punchInFailed"), description: String((e as Error).message), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handlePunchOut = async () => {
    setBusy(true);
    try {
      await workforceService.punchOut();
      await refresh();
    } catch (e) {
      toast({ title: t("timesheet.toast.punchOutFailed"), description: String((e as Error).message), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitWeek = async () => {
    setBusy(true);
    try {
      const ts = await workforceService.submitTimesheet(periodStart);
      toast({
        title: t("timesheet.toast.submitted"),
        description: t("timesheet.toast.submittedDescription", { periodStart: ts.periodStart, hours: ts.totalHours }),
      });
      await refresh();
    } catch (e) {
      toast({ title: t("timesheet.toast.submitFailed"), description: String((e as Error).message), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const closedEntries = weekEntries.filter((e) => e.endedAt && (e.status === "closed"));
  const submittedEntries = weekEntries.filter((e) => e.status === "submitted" || e.status === "approved");
  const weekTotalSec = weekEntries.reduce((s, e) => s + (e.durationSec ?? 0), 0);
  const weekBillableSec = weekEntries.filter((e) => e.billable).reduce((s, e) => s + (e.durationSec ?? 0), 0);
  const existingThisWeek = myTimesheets.find((ts) => ts.periodStart === periodStart);
  const statusLabel = (status: string) => t(`timesheet.status.${status}`, { defaultValue: status });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Clock className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-2xl font-semibold">{t("timesheet.title")}</h2>
      </div>

      {/* Punch widget */}
      <Card>
        <CardHeader>
          <CardTitle>{active ? t("timesheet.punchedIn") : t("timesheet.readyToPunchIn")}</CardTitle>
          <CardDescription>
            {active
              ? t("timesheet.startedAt", { time: new Date(active.startedAt).toLocaleString() })
              : t("timesheet.punchHint")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {active ? (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="text-3xl font-mono tabular-nums">{formatTimesheetDuration(elapsedSec)}</div>
              <Button variant="destructive" onClick={handlePunchOut} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Square className="h-4 w-4 mr-2" />}
                {t("timesheet.punchOut")}
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="punch-notes">{t("timesheet.notesLabel")}</Label>
                <Textarea
                  id="punch-notes"
                  placeholder={t("timesheet.notesPlaceholder")}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="min-h-[60px]"
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch id="billable" checked={billable} onCheckedChange={setBillable} />
                  <Label htmlFor="billable">{t("timesheet.billable")}</Label>
                </div>
                <Button onClick={handlePunchIn} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                  {t("timesheet.punchIn")}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* This week */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarRange className="h-5 w-5" />
                {t("timesheet.thisWeek", { periodStart })}
              </CardTitle>
              <CardDescription>
                {t("timesheet.weekTotals", {
                  total: formatTimesheetDuration(weekTotalSec),
                  billable: formatTimesheetDuration(weekBillableSec),
                })}
              </CardDescription>
            </div>
            {existingThisWeek ? (
              <Badge variant={existingThisWeek.status === "approved" ? "default" : existingThisWeek.status === "rejected" ? "destructive" : "secondary"}>
                {statusLabel(existingThisWeek.status)}
              </Badge>
            ) : (
              <Button
                onClick={handleSubmitWeek}
                disabled={busy || closedEntries.length === 0 || !!active}
                title={active ? t("timesheet.punchOutBeforeSubmit") : closedEntries.length === 0 ? t("timesheet.noClosedEntries") : ""}
              >
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                {t("timesheet.submitWeek")}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">{t("timesheet.loading")}</div>
          ) : weekEntries.length === 0 ? (
            <div className="text-sm text-muted-foreground">{t("timesheet.noTimeThisWeek")}</div>
          ) : (
            <div className="space-y-2">
              {weekEntries.map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-2 border-b last:border-0 py-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{new Date(e.startedAt).toLocaleString()}</div>
                    {e.notes && <div className="text-muted-foreground text-xs mt-1 break-words">{e.notes}</div>}
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {!e.billable && <Badge variant="outline" className="text-xs">{t("timesheet.nonBillable")}</Badge>}
                    <Badge variant="outline" className="text-xs">{statusLabel(e.status)}</Badge>
                    <div className="font-mono tabular-nums w-20 text-right">
                      {e.durationSec != null ? formatTimesheetDuration(e.durationSec) : t("timesheet.activeEntry")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* History */}
      {myTimesheets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("timesheet.myTimesheets")}</CardTitle>
            <CardDescription>{t("timesheet.submittedCount", { count: myTimesheets.length })}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {myTimesheets.slice(0, 8).map((ts) => (
                <div key={ts.id} className="flex items-center justify-between gap-2 border-b last:border-0 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium">{t("timesheet.weekOf", { periodStart: ts.periodStart })}</div>
                    <div className="text-xs text-muted-foreground">
                      {t("timesheet.historyTotals", { total: ts.totalHours, billable: ts.totalBillableHours })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {ts.status === "approved" && <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />}
                    {ts.status === "rejected" && <XCircle className="h-4 w-4 text-destructive" />}
                    <Badge variant={ts.status === "approved" ? "default" : ts.status === "rejected" ? "destructive" : "secondary"}>
                      {statusLabel(ts.status)}
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => window.open(`/api/workforce/timesheets/${ts.id}/print`, "_blank", "noopener")}
                      title={t("timesheet.print")}
                      aria-label={t("timesheet.print")}
                    >
                      <Printer className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            {myTimesheets.some((ts) => ts.status === "rejected" && ts.rejectionReason) && (
              <div className="mt-4 text-xs text-muted-foreground">
                {t("timesheet.rejectedHint")}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
