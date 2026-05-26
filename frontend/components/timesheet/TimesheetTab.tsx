import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock, Play, Square, Loader2, CalendarRange, Send, CheckCircle2, XCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";
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
  const { user } = useAuth();
  const permissions = createRolePermissions(user?.role);
  if (!permissions.canPunchTime && !permissions.canManageWorkforce) return null;

  // Employer-only viewers (no employee membership) see a different prompt;
  // they should be using the Workforce settings panel, not this surface.
  if (!permissions.canPunchTime) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No timesheet for you</CardTitle>
          <CardDescription>
            Workforce timesheets are punched by employees. To review your
            employees' weekly submissions, go to <strong>Settings → Workforce</strong>.
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

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return h > 0 ? `${h}h ${mm}m` : `${mm}m`;
}

function EmployeeTimesheetSurface() {
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
      const [a, w, t] = await Promise.all([
        workforceService.getActive(),
        workforceService.getWeek(periodStart),
        workforceService.listMyTimesheets(),
      ]);
      setActive(a);
      setWeekEntries(w.entries);
      setMyTimesheets(t.timesheets);
    } catch (e) {
      toast({ title: "Failed to load timesheet", description: String((e as Error).message), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [periodStart, toast]);

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
      toast({ title: "Punch in failed", description: String((e as Error).message), variant: "destructive" });
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
      toast({ title: "Punch out failed", description: String((e as Error).message), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitWeek = async () => {
    setBusy(true);
    try {
      const ts = await workforceService.submitTimesheet(periodStart);
      toast({ title: "Timesheet submitted", description: `Week of ${ts.periodStart} — ${ts.totalHours}h total` });
      await refresh();
    } catch (e) {
      toast({ title: "Submit failed", description: String((e as Error).message), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const closedEntries = weekEntries.filter((e) => e.endedAt && (e.status === "closed"));
  const submittedEntries = weekEntries.filter((e) => e.status === "submitted" || e.status === "approved");
  const weekTotalSec = weekEntries.reduce((s, e) => s + (e.durationSec ?? 0), 0);
  const weekBillableSec = weekEntries.filter((e) => e.billable).reduce((s, e) => s + (e.durationSec ?? 0), 0);
  const existingThisWeek = myTimesheets.find((t) => t.periodStart === periodStart);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Clock className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-2xl font-semibold">Timesheet</h2>
      </div>

      {/* Punch widget */}
      <Card>
        <CardHeader>
          <CardTitle>{active ? "Punched in" : "Ready to punch in"}</CardTitle>
          <CardDescription>
            {active
              ? `Started ${new Date(active.startedAt).toLocaleString()}`
              : "Capture time against your work — log goes to your weekly timesheet."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {active ? (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="text-3xl font-mono tabular-nums">{formatDuration(elapsedSec)}</div>
              <Button variant="destructive" onClick={handlePunchOut} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Square className="h-4 w-4 mr-2" />}
                Punch out
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="punch-notes">Notes (optional)</Label>
                <Textarea
                  id="punch-notes"
                  placeholder="What are you working on?"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="min-h-[60px]"
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch id="billable" checked={billable} onCheckedChange={setBillable} />
                  <Label htmlFor="billable">Billable</Label>
                </div>
                <Button onClick={handlePunchIn} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                  Punch in
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
                This week ({periodStart})
              </CardTitle>
              <CardDescription>
                {formatDuration(weekTotalSec)} total • {formatDuration(weekBillableSec)} billable
              </CardDescription>
            </div>
            {existingThisWeek ? (
              <Badge variant={existingThisWeek.status === "approved" ? "default" : existingThisWeek.status === "rejected" ? "destructive" : "secondary"}>
                {existingThisWeek.status}
              </Badge>
            ) : (
              <Button
                onClick={handleSubmitWeek}
                disabled={busy || closedEntries.length === 0 || !!active}
                title={active ? "Punch out before submitting" : closedEntries.length === 0 ? "No closed entries to submit" : ""}
              >
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                Submit week
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : weekEntries.length === 0 ? (
            <div className="text-sm text-muted-foreground">No time logged this week yet.</div>
          ) : (
            <div className="space-y-2">
              {weekEntries.map((e) => (
                <div key={e.id} className="flex items-center justify-between border-b last:border-0 py-2 text-sm">
                  <div className="flex-1">
                    <div className="font-medium">{new Date(e.startedAt).toLocaleString()}</div>
                    {e.notes && <div className="text-muted-foreground text-xs mt-1">{e.notes}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    {!e.billable && <Badge variant="outline" className="text-xs">non-billable</Badge>}
                    <Badge variant="outline" className="text-xs">{e.status}</Badge>
                    <div className="font-mono tabular-nums w-20 text-right">
                      {e.durationSec != null ? formatDuration(e.durationSec) : "active"}
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
            <CardTitle>My timesheets</CardTitle>
            <CardDescription>{myTimesheets.length} submitted</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {myTimesheets.slice(0, 8).map((t) => (
                <div key={t.id} className="flex items-center justify-between border-b last:border-0 py-2 text-sm">
                  <div>
                    <div className="font-medium">Week of {t.periodStart}</div>
                    <div className="text-xs text-muted-foreground">
                      {t.totalHours}h total • {t.totalBillableHours}h billable
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {t.status === "approved" && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                    {t.status === "rejected" && <XCircle className="h-4 w-4 text-red-600" />}
                    <Badge variant={t.status === "approved" ? "default" : t.status === "rejected" ? "destructive" : "secondary"}>
                      {t.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
            {myTimesheets.some((t) => t.status === "rejected" && t.rejectionReason) && (
              <div className="mt-4 text-xs text-muted-foreground">
                Rejected timesheets unlock their entries so you can edit + re-submit.
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
