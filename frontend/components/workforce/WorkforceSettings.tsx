import { useCallback, useEffect, useState } from "react";
import { Loader2, Users, ClipboardCheck, CheckCircle2, XCircle, UserMinus, DollarSign, TrendingUp, Plug, Unplug, Printer, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { createRolePermissions } from "@/lib/role-utils";
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
  type PlacementDocument,
  type Integration,
  type IntegrationProvider,
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
      <DeskMarginCard />
      <DocumentsCard />
      <IntegrationsCard />
    </div>
  );
}

const ALL_PROVIDERS: { id: IntegrationProvider; label: string; description: string }[] = [
  { id: "quickbooks", label: "QuickBooks Online", description: "Push workforce invoices outbound for AR." },
  { id: "xero", label: "Xero", description: "Push workforce invoices outbound for AR." },
  { id: "gusto", label: "Gusto", description: "Contractor pay rails — 1099 + ACH." },
  { id: "docusign", label: "DocuSign", description: "E-sign envelopes for compliance docs." },
  { id: "helcim", label: "Helcim", description: "Default payment + recurring billing rails." },
];

function IntegrationsCard() {
  const { toast } = useToast();
  const [items, setItems] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await workforceService.listIntegrations();
      setItems(r.integrations);
    } catch (e) {
      toast({ title: "Failed to load integrations", description: String((e as Error).message), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const handleDisconnect = async (it: Integration) => {
    const key = `${it.companyId}:${it.provider}`;
    setBusyKey(key);
    try {
      await workforceService.disconnectIntegration(it.provider, it.companyId);
      toast({ title: "Disconnected", description: `${it.provider} disconnected from your workspace.` });
      await refresh();
    } catch (e) {
      toast({ title: "Disconnect failed", description: String((e as Error).message), variant: "destructive" });
    } finally {
      setBusyKey(null);
    }
  };

  const byProvider = new Map(items.filter((i) => i.status === "connected").map((i) => [i.provider, i] as const));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plug className="h-5 w-5" />
          Integrations
          {!loading && byProvider.size > 0 && (
            <Badge variant="secondary">{byProvider.size} connected</Badge>
          )}
        </CardTitle>
        <CardDescription>
          Connect your accounting + e-sign providers so workforce timesheets push invoices outbound and
          docs sign through your preferred provider. OAuth handshake handlers land per provider once
          client IDs are configured.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="space-y-2">
            {ALL_PROVIDERS.map((p) => {
              const connected = byProvider.get(p.id);
              return (
                <div key={p.id} className="border rounded-md p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm">
                  <div className="flex-1">
                    <div className="font-medium">{p.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.description}
                      {connected?.externalAccountId && ` · ${connected.externalAccountId}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {connected ? (
                      <>
                        <Badge variant="default">connected</Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyKey === `${connected.companyId}:${connected.provider}`}
                          onClick={() => handleDisconnect(connected)}
                        >
                          {busyKey === `${connected.companyId}:${connected.provider}`
                            ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            : <Unplug className="h-4 w-4 mr-1" />}
                          Disconnect
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled
                        title="OAuth handshake lands when provider client ID + redirect URL are configured"
                      >
                        Connect
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
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
                      variant="ghost"
                      onClick={() => window.open(`/api/workforce/timesheets/${row.timesheet.id}/print`, "_blank", "noopener")}
                      title="Print / Save as PDF"
                    >
                      <Printer className="h-4 w-4" />
                    </Button>
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
  const [confirmDeactivate, setConfirmDeactivate] = useState<RosterRow | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await workforceService.getRoster();
      setRoster(r.roster);
    } catch (e) {
      toast({ title: "Failed to load roster", description: String((e as Error).message), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const handleDeactivate = async () => {
    if (!confirmDeactivate) return;
    setDeactivatingId(confirmDeactivate.userId);
    try {
      await workforceService.deactivateEmployee(confirmDeactivate.userId);
      toast({ title: "Employee deactivated", description: `${confirmDeactivate.employeeName} can no longer punch time. Seat billing will reconcile on the next cycle.` });
      setConfirmDeactivate(null);
      await refresh();
    } catch (e) {
      toast({ title: "Deactivate failed", description: String((e as Error).message), variant: "destructive" });
    } finally {
      setDeactivatingId(null);
    }
  };

  const activeRows = roster.filter((r) => r.isActive);
  const activeCount = activeRows.length;
  const monthlyCents = activeCount * 995;
  const monthlyDollars = (monthlyCents / 100).toFixed(2);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Roster
            {!loading && <Badge variant="secondary">{activeCount} active</Badge>}
          </CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-2">
            <span>Active employees in your workspace.</span>
            <span className="inline-flex items-center gap-1 text-foreground">
              <DollarSign className="h-3 w-3" />
              {activeCount} × $9.95/mo = <strong>${monthlyDollars}/mo</strong> at next billing cycle
            </span>
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
                      <>
                        <Badge variant="default">active</Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={deactivatingId === r.userId}
                          onClick={() => setConfirmDeactivate(r)}
                        >
                          {deactivatingId === r.userId ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <UserMinus className="h-4 w-4 mr-1" />}
                          Deactivate
                        </Button>
                      </>
                    ) : (
                      <Badge variant="outline">inactive</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!confirmDeactivate} onOpenChange={(open) => !open && setConfirmDeactivate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate employee?</DialogTitle>
            <DialogDescription>
              {confirmDeactivate && (
                <>
                  <strong>{confirmDeactivate.employeeName}</strong> will lose access to punch in/out
                  and submit timesheets for your workspace. Their account itself isn't deleted, and
                  any open timesheets stay submitted for the historical record. Seat billing
                  reconciles automatically — you'll be charged for {Math.max(0, activeCount - 1)}
                  {" "}seats next cycle.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeactivate(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeactivate} disabled={!!deactivatingId}>
              {deactivatingId ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DeskMarginCard() {
  const { toast } = useToast();
  const [rows, setRows] = useState<DeskMarginRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const r = await workforceService.getDeskMargin();
        setRows(r.rows);
      } catch (e) {
        toast({ title: "Failed to load desk margin", description: String((e as Error).message), variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, [toast]);

  const totalRevenue = rows.reduce((s, r) => s + r.revenueCents, 0);
  const totalPayout = rows.reduce((s, r) => s + r.payoutCents, 0);
  const totalMargin = totalRevenue - totalPayout;
  const fmt = (cents: number, currency = "USD") =>
    new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Desk margin
          {!loading && rows.length > 0 && (
            <Badge variant="secondary">{fmt(totalMargin)} YTD</Badge>
          )}
        </CardTitle>
        <CardDescription>
          Year-to-date revenue vs contractor payout per placement. Sources from approved timesheets only.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No approved timesheets to report yet. Once an employer approves a timesheet against a placement with bill + pay rates, it'll show here.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div className="border rounded-md p-3">
                <div className="text-muted-foreground text-xs">Revenue YTD</div>
                <div className="font-mono tabular-nums text-lg">{fmt(totalRevenue)}</div>
              </div>
              <div className="border rounded-md p-3">
                <div className="text-muted-foreground text-xs">Contractor pay YTD</div>
                <div className="font-mono tabular-nums text-lg">{fmt(totalPayout)}</div>
              </div>
              <div className="border rounded-md p-3">
                <div className="text-muted-foreground text-xs">Gross margin YTD</div>
                <div className="font-mono tabular-nums text-lg">{fmt(totalMargin)}</div>
              </div>
            </div>
            <div className="space-y-2">
              {rows.map((r) => (
                <Link
                  key={r.placementId}
                  to={`/recruiter/placements/${r.placementId}`}
                  className="border rounded-md p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1">
                    <div className="font-medium flex items-center gap-1">
                      {r.candidateName}
                      <ExternalLink className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {r.placementKind ?? "—"} · {r.recruiterName ?? "no recruiter"} ·{" "}
                      {r.approvedTimesheetCount} timesheet{r.approvedTimesheetCount === 1 ? "" : "s"}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-xs text-muted-foreground text-right">
                      <div>{r.billableHoursYTD}h billable</div>
                      <div>{r.billRateHourly > 0 ? `@ ${fmt(Math.round(r.billRateHourly * 100), r.currency)}/h` : "no rate"}</div>
                    </div>
                    <div className="font-mono tabular-nums w-24 text-right">
                      <div className={r.grossMarginCents >= 0 ? "text-green-600" : "text-red-600"}>
                        {fmt(r.grossMarginCents, r.currency)}
                      </div>
                      <div className="text-xs text-muted-foreground">margin</div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DocumentsCard() {
  const { toast } = useToast();
  const [docs, setDocs] = useState<PlacementDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [docKind, setDocKind] = useState("i9");
  const [providerName, setProviderName] = useState("native");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await workforceService.listDocuments();
      setDocs(r.documents);
    } catch (e) {
      toast({ title: "Failed to load documents", description: String((e as Error).message), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const handleCreate = async () => {
    setBusy(true);
    try {
      // Company-scoped placeholder doc — the picker for which company to
      // bind ships in a follow-up. For now we send no companyId; the
      // backend rejects with a clear error if the caller isn't employer-
      // scoped, which is the right failure mode.
      await workforceService.createDocument({ kind: docKind, providerName });
      toast({ title: "Document created", description: "Signing flow will complete via the configured provider." });
      setShowCreate(false);
      await refresh();
    } catch (e) {
      toast({ title: "Create failed", description: String((e as Error).message), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5" />
                Compliance documents
                {!loading && <Badge variant="secondary">{docs.length}</Badge>}
              </CardTitle>
              <CardDescription>
                I-9, W-9, COI, BG check, MSA, contract artefacts. Native flow stores the upload directly;
                connect DocuSign for full audit-trail signing.
              </CardDescription>
            </div>
            <Button size="sm" onClick={() => setShowCreate(true)}>New document</Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : docs.length === 0 ? (
            <div className="text-sm text-muted-foreground">No documents on file yet.</div>
          ) : (
            <div className="space-y-2">
              {docs.map((d) => (
                <div key={d.id} className="border rounded-md p-3 flex items-center justify-between text-sm">
                  <div>
                    <div className="font-medium uppercase text-xs">{d.kind}</div>
                    <div className="text-xs text-muted-foreground">
                      provider: {d.providerName ?? "native"} ·
                      {d.signedAt ? ` signed ${new Date(d.signedAt).toLocaleDateString()}` : " not signed"}
                      {d.expiresAt ? ` · expires ${new Date(d.expiresAt).toLocaleDateString()}` : ""}
                    </div>
                  </div>
                  <Badge
                    variant={
                      d.status === "signed" ? "default" :
                      d.status === "expired" ? "destructive" :
                      "secondary"
                    }
                  >
                    {d.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New compliance document</DialogTitle>
            <DialogDescription>
              Choose the kind + signing provider. Real file upload + DocuSign envelope creation lands next.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="doc-kind">Kind</Label>
              <select
                id="doc-kind"
                className="w-full mt-1 border rounded-md p-2 bg-background"
                value={docKind}
                onChange={(e) => setDocKind(e.target.value)}
              >
                <option value="i9">I-9 employment eligibility</option>
                <option value="w9">W-9 contractor tax form</option>
                <option value="w8ben">W-8BEN foreign contractor</option>
                <option value="coi">COI certificate of insurance</option>
                <option value="bg_check">Background check</option>
                <option value="msa">Master service agreement</option>
                <option value="sow">Statement of work</option>
                <option value="offer_letter">Offer letter</option>
                <option value="nda">NDA</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <Label htmlFor="doc-provider">Provider</Label>
              <select
                id="doc-provider"
                className="w-full mt-1 border rounded-md p-2 bg-background"
                value={providerName}
                onChange={(e) => setProviderName(e.target.value)}
              >
                <option value="native">Native (mark signed manually)</option>
                <option value="docusign">DocuSign</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
