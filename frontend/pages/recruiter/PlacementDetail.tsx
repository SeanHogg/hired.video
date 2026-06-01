import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Briefcase,
  Clock,
  ClipboardCheck,
  DollarSign,
  FileText,
  Loader2,
  Printer,
  Upload,
  CheckCircle2,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import PageHeader, { type PageHeaderTab } from "@/components/PageHeader";
import { useToast } from "@/components/ui/use-toast";
import { apiClient } from "@/lib/api-client";
import {
  workforceService,
  type DeskMarginRow,
  type PlacementDocument,
} from "@/lib/services/workforce-service";

/**
 * Placement detail screen (#1443).
 *
 * Overview / Documents / Timesheets / Margin tabs over a single
 * placement row. Each tab pulls scoped data on-demand. The route is
 * recruiter-only (recruiter who owns the placement); the underlying
 * /api/recruiter/placements/:id endpoint already enforces ownership.
 */

interface PlacementRow {
  id: string;
  candidateId: string;
  candidateName: string;
  recruiterId: string;
  recruiterName: string;
  companyName: string | null;
  jobTitle: string | null;
  status: string;
  placementKind: string | null;
  startDate: string | null;
  endDate: string | null;
  billRateHourly: string | null;
  payRateHourly: string | null;
  currency: string | null;
  poNumber: string | null;
  msaRef: string | null;
}

type TabKey = "overview" | "documents" | "timesheets" | "margin";

const TABS: PageHeaderTab[] = [
  { key: "overview", label: "Overview", icon: Briefcase },
  { key: "documents", label: "Documents", icon: FileText },
  { key: "timesheets", label: "Timesheets", icon: Clock },
  { key: "margin", label: "Margin", icon: DollarSign },
];

export default function PlacementDetail() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [placement, setPlacement] = useState<PlacementRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      try {
        const res = await apiClient.get<PlacementRow>(`/api/recruiter/placements/${id}`);
        setPlacement(res.data);
        setError(null);
      } catch (e) {
        setError(String((e as Error).message));
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const tabsWithLinks = useMemo<PageHeaderTab[]>(() =>
    TABS.map((t) => ({ ...t, to: `?tab=${t.key}` })),
    []);

  if (loading) {
    return (
      <AppShell bgClassName="bg-background">
        <div className="max-w-6xl mx-auto p-6 text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading placement…
        </div>
      </AppShell>
    );
  }
  if (error || !placement) {
    return (
      <AppShell bgClassName="bg-background">
        <div className="max-w-6xl mx-auto p-6">
          <Card>
            <CardHeader>
              <CardTitle>Placement not found</CardTitle>
              <CardDescription>
                {error ?? "Either this placement doesn't exist or you don't own it."}
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell bgClassName="bg-background">
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/dashboard"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  {placement.candidateName}
                  <Badge variant="outline">{placement.placementKind ?? "—"}</Badge>
                  <Badge variant={placement.status === "active" ? "default" : "secondary"}>
                    {placement.status}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  {placement.jobTitle ?? "—"} {placement.companyName ? `· ${placement.companyName}` : ""}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>

        <PageHeader
          tabs={tabsWithLinks}
          activeTabKey={activeTab}
        />

        <div className="hidden">{/* Use anchor-style tabs but switch via local state below */}</div>
        <TabSwitcher activeTab={activeTab} onChange={setActiveTab} />

        {activeTab === "overview" && <OverviewTab placement={placement} />}
        {activeTab === "documents" && <DocumentsTab placementId={placement.id} toast={toast} />}
        {activeTab === "timesheets" && <TimesheetsTab placementId={placement.id} candidateId={placement.candidateId} toast={toast} />}
        {activeTab === "margin" && <MarginTab placementId={placement.id} toast={toast} />}
      </div>
    </AppShell>
  );
}

/** Inline tab switcher that mirrors PageHeader visually but works off
 *  local state instead of URL routing — avoids a separate router config
 *  for sub-tabs while still feeling like real tabs. */
function TabSwitcher({ activeTab, onChange }: { activeTab: TabKey; onChange: (t: TabKey) => void }) {
  return (
    <div className="-mt-4 flex gap-1 border-b">
      {TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key as TabKey)}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === t.key
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function OverviewTab({ placement }: { placement: PlacementRow }) {
  const fmtRate = (rate: string | null) =>
    rate
      ? new Intl.NumberFormat(undefined, { style: "currency", currency: placement.currency ?? "USD" })
          .format(Number(rate))
      : "—";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Engagement details</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground text-xs">Bill rate</div>
            <div className="font-mono tabular-nums">{fmtRate(placement.billRateHourly)} / h</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Pay rate</div>
            <div className="font-mono tabular-nums">{fmtRate(placement.payRateHourly)} / h</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Currency</div>
            <div>{placement.currency ?? "USD"}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Start</div>
            <div>{placement.startDate ? new Date(placement.startDate).toLocaleDateString() : "—"}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">End</div>
            <div>{placement.endDate ? new Date(placement.endDate).toLocaleDateString() : "—"}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Recruiter</div>
            <div>{placement.recruiterName}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">PO #</div>
            <div>{placement.poNumber ?? "—"}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">MSA ref</div>
            <div>{placement.msaRef ?? "—"}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DocumentsTab({ placementId, toast }: { placementId: string; toast: ReturnType<typeof useToast>["toast"] }) {
  const [docs, setDocs] = useState<PlacementDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await workforceService.listDocuments();
      setDocs(r.documents.filter((d) => d.placementId === placementId));
    } catch (e) {
      toast({ title: "Failed to load documents", description: String((e as Error).message), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [placementId, toast]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleUpload = async (docId: string, file: File) => {
    setUploadingId(docId);
    try {
      const buf = await file.arrayBuffer();
      await fetch(`/api/workforce/documents/${docId}/upload`, {
        method: "POST",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "x-filename": file.name,
        },
        body: buf,
        credentials: "include",
      });
      toast({ title: "Uploaded", description: file.name });
      await refresh();
    } catch (e) {
      toast({ title: "Upload failed", description: String((e as Error).message), variant: "destructive" });
    } finally {
      setUploadingId(null);
    }
  };

  const handleMarkSigned = async (docId: string) => {
    try {
      await apiClient.post(`/api/workforce/documents/${docId}/mark-signed`, {});
      toast({ title: "Marked signed" });
      await refresh();
    } catch (e) {
      toast({ title: "Failed", description: String((e as Error).message), variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Documents
          {!loading && <Badge variant="secondary">{docs.length}</Badge>}
        </CardTitle>
        <CardDescription>Placement-scoped compliance artefacts. Upload a file to attach + then mark signed.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : docs.length === 0 ? (
          <div className="text-sm text-muted-foreground">No placement-scoped documents yet.</div>
        ) : (
          <div className="space-y-2">
            {docs.map((d) => (
              <div key={d.id} className="border rounded-md p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <div className="font-medium uppercase text-xs">{d.kind}</div>
                  <div className="text-xs text-muted-foreground">
                    {d.filePath ? "file uploaded" : "no file"} · {d.status}
                    {d.expiresAt ? ` · expires ${new Date(d.expiresAt).toLocaleDateString()}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer inline-flex items-center gap-1 border px-3 py-1.5 rounded-md text-sm hover:bg-muted">
                    {uploadingId === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {d.filePath ? "Replace" : "Upload"}
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleUpload(d.id, f);
                        e.target.value = ""; // reset for re-upload of same file
                      }}
                    />
                  </label>
                  {d.status !== "signed" && (
                    <Button size="sm" variant="outline" onClick={() => handleMarkSigned(d.id)}>
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      Mark signed
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface PlacementTimesheetRow {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  totalHours: string | null;
  totalBillableHours: string | null;
}

function TimesheetsTab({ candidateId, toast }: { placementId: string; candidateId: string; toast: ReturnType<typeof useToast>["toast"] }) {
  const [rows, setRows] = useState<PlacementTimesheetRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // The approval-queue endpoint returns the employer's whole queue;
        // filter to this candidate's timesheets. For a single-placement
        // dedicated endpoint, see the sub-gap noted under #1443.
        const q = await workforceService.getApprovalQueue();
        setRows(q.queue
          .filter((r) => r.timesheet.userId === candidateId)
          .map((r) => ({
            id: r.timesheet.id,
            periodStart: r.timesheet.periodStart,
            periodEnd: r.timesheet.periodEnd,
            status: r.timesheet.status,
            totalHours: r.timesheet.totalHours,
            totalBillableHours: r.timesheet.totalBillableHours,
          })));
      } catch (e) {
        toast({ title: "Failed to load timesheets", description: String((e as Error).message), variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, [candidateId, toast]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5" />
          Timesheets
          {!loading && <Badge variant="secondary">{rows.length}</Badge>}
        </CardTitle>
        <CardDescription>Submitted weekly timesheets for the placed employee.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">No submitted timesheets yet for this placement.</div>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.id} className="border rounded-md p-3 flex items-center justify-between text-sm">
                <div>
                  <div className="font-medium">Week of {r.periodStart}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.totalHours}h total · {r.totalBillableHours}h billable
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={r.status === "approved" ? "default" : "secondary"}>{r.status}</Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(`/api/workforce/timesheets/${r.id}/print`, "_blank", "noopener")}
                  >
                    <Printer className="h-4 w-4 mr-1" /> Print
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MarginTab({ placementId, toast }: { placementId: string; toast: ReturnType<typeof useToast>["toast"] }) {
  const [row, setRow] = useState<DeskMarginRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const r = await workforceService.getDeskMargin();
        setRow(r.rows.find((m) => m.placementId === placementId) ?? null);
      } catch (e) {
        toast({ title: "Failed to load margin", description: String((e as Error).message), variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, [placementId, toast]);

  const fmt = (cents: number, currency = "USD") =>
    new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Desk margin YTD
        </CardTitle>
        <CardDescription>Aggregated from approved-timesheet derivations.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : !row ? (
          <div className="text-sm text-muted-foreground">No margin data yet — approve a timesheet for this placement to start populating.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div className="border rounded-md p-3">
              <div className="text-muted-foreground text-xs">Revenue YTD</div>
              <div className="font-mono tabular-nums text-lg">{fmt(row.revenueCents, row.currency)}</div>
            </div>
            <div className="border rounded-md p-3">
              <div className="text-muted-foreground text-xs">Contractor pay YTD</div>
              <div className="font-mono tabular-nums text-lg">{fmt(row.payoutCents, row.currency)}</div>
            </div>
            <div className="border rounded-md p-3">
              <div className="text-muted-foreground text-xs">Gross margin YTD</div>
              <div className={`font-mono tabular-nums text-lg ${row.grossMarginCents >= 0 ? "text-green-600" : "text-red-600"}`}>
                {fmt(row.grossMarginCents, row.currency)}
              </div>
            </div>
            <div className="sm:col-span-3 text-xs text-muted-foreground mt-2">
              {row.approvedTimesheetCount} approved timesheet{row.approvedTimesheetCount === 1 ? "" : "s"} ·
              {" "}{row.billableHoursYTD}h billable
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
