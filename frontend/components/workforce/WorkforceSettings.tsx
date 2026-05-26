import { useCallback, useEffect, useState } from "react";
import { Loader2, Users, ClipboardCheck, CheckCircle2, XCircle, UserMinus, DollarSign, TrendingUp } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { createRolePermissions } from "@/lib/role-utils";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import {
  workforceService,
  type ApprovalQueueRow,
  type RosterRow,
  type DeskMarginRow,
} from "@/lib/services/workforce-service";

/**
 * Employer-only workforce panel for /settings.
 *
 * Self-gates on `canManageWorkforce` — returns null for non-employers so
 * consumers can mount it unconditionally (DRY rule). Two sub-surfaces:
 *   • Roster — list of employees with last-7-day hour totals
 *   • Approval queue — pending timesheets across the workforce
 *
 * Off-board (deactivate employee) is blocked behind #1406 — the link is
 * rendered but disabled with a tooltip until that ships.
 * Per-employee seat billing reconciliation is tracked under #1409 — the
 * roster row count is the source of truth for seat count.
 */
export function WorkforceSettings() {
  const { user } = useAuth();
  const permissions = createRolePermissions(user?.role);
  if (!permissions.canManageWorkforce) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-2xl font-semibold">Workforce</h2>
      </div>
      <ApprovalQueueCard />
      <RosterCard />
    </div>
  );
}

function ApprovalQueueCard() {
  const { toast } = useToast();
  const [queue, setQueue] = useState<ApprovalQueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectFor, setRejectFor] = useState<ApprovalQueueRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await workforceService.getApprovalQueue();
      setQueue(r.queue);
    } catch (e) {
      toast({ title: "Failed to load approval queue", description: String((e as Error).message), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleApprove = async (row: ApprovalQueueRow) => {
    setBusyId(row.timesheet.id);
    try {
      await workforceService.approveTimesheet(row.timesheet.id);
      toast({ title: "Approved", description: `${row.employeeName}'s week of ${row.timesheet.periodStart}` });
      await refresh();
    } catch (e) {
      toast({ title: "Approve failed", description: String((e as Error).message), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectFor) return;
    setBusyId(rejectFor.timesheet.id);
    try {
      await workforceService.rejectTimesheet(rejectFor.timesheet.id, rejectReason.trim());
      toast({ title: "Rejected", description: `${rejectFor.employeeName}'s week of ${rejectFor.timesheet.periodStart} — entries returned to draft` });
      setRejectFor(null);
      setRejectReason("");
      await refresh();
    } catch (e) {
      toast({ title: "Reject failed", description: String((e as Error).message), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" />
            Approval queue
            {queue.length > 0 && <Badge variant="secondary">{queue.length}</Badge>}
          </CardTitle>
          <CardDescription>Submitted weekly timesheets awaiting your review.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : queue.length === 0 ? (
            <div className="text-sm text-muted-foreground">No timesheets awaiting approval.</div>
          ) : (
            <div className="space-y-3">
              {queue.map((row) => (
                <div key={row.timesheet.id} className="border rounded-md p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex-1">
                    <div className="font-medium">{row.employeeName} <span className="text-muted-foreground text-sm">· {row.employeeEmail}</span></div>
                    <div className="text-sm text-muted-foreground">
                      Week of {row.timesheet.periodStart} · {row.timesheet.totalHours}h total · {row.timesheet.totalBillableHours}h billable
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === row.timesheet.id}
                      onClick={() => { setRejectFor(row); setRejectReason(""); }}
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      disabled={busyId === row.timesheet.id}
                      onClick={() => handleApprove(row)}
                    >
                      {busyId === row.timesheet.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                      Approve
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!rejectFor} onOpenChange={(open) => !open && setRejectFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject timesheet</DialogTitle>
            <DialogDescription>
              {rejectFor && <>Rejecting {rejectFor.employeeName}'s week of {rejectFor.timesheet.periodStart}. Their entries will be returned to draft so they can edit and re-submit.</>}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">Reason (required)</Label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="What needs to change?"
              className="min-h-[80px]"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectFor(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim() || busyId === rejectFor?.timesheet.id}
              onClick={handleConfirmReject}
            >
              {busyId === rejectFor?.timesheet.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RosterCard() {
  const { toast } = useToast();
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const r = await workforceService.getRoster();
        setRoster(r.roster);
      } catch (e) {
        toast({ title: "Failed to load roster", description: String((e as Error).message), variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, [toast]);

  const activeCount = roster.filter((r) => r.isActive).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Roster
          {!loading && <Badge variant="secondary">{activeCount} active</Badge>}
        </CardTitle>
        <CardDescription>
          Active employees in your workspace. Each active member is one seat billed monthly (
          <span className="italic">seat reconciliation pending #1409</span>).
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : roster.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No employees yet. Use the team-invite flow on the Account &amp; Billing tab to add one.
          </div>
        ) : (
          <div className="space-y-2">
            {roster.map((r) => (
              <div key={`${r.userId}:${r.companyId}`} className="border rounded-md p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <div className="font-medium">{r.employeeName}</div>
                  <div className="text-xs text-muted-foreground">{r.employeeEmail}</div>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-muted-foreground">Last 7d:</span>
                  <span className="font-mono tabular-nums">{r.last7DaysHours}h</span>
                  {r.isActive ? (
                    <Badge variant="default">active</Badge>
                  ) : (
                    <Badge variant="outline">inactive</Badge>
                  )}
                </div>
              </div>
            ))}
            <div className="text-xs text-muted-foreground flex items-center gap-1 mt-3">
              <AlertTriangle className="h-3 w-3" />
              Off-boarding (deactivate) is blocked by an admin-only restriction — see gap #1406.
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
