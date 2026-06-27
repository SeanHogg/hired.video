import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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
  Users,
  Plus,
  Trash2,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import PageHeader, { type PageHeaderTab } from "@/components/PageHeader";
import { useToast } from "@/components/ui/use-toast";
import { apiClient, standardAuthHeaders } from "@/lib/api-client";
import {
  workforceService,
  type DeskMarginRow,
  type PlacementDocument,
} from "@/lib/services/workforce-service";
import {
  placementService,
  type PlacementJobType,
  type PlacementSplit,
} from "@/lib/services/placement-service";

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
  placementTypeId: string | null;
  startDate: string | null;
  endDate: string | null;
  billRateHourly: string | null;
  payRateHourly: string | null;
  currency: string | null;
  poNumber: string | null;
  msaRef: string | null;
}

type TabKey = "overview" | "splits" | "documents" | "timesheets" | "margin";

/** Module-scope tab defs carry a stable i18n key resolved at render. */
const TABS: { key: string; labelKey: string; icon: PageHeaderTab["icon"] }[] = [
  { key: "overview", labelKey: "tabs.overview", icon: Briefcase },
  { key: "splits", labelKey: "labels.placement.splits", icon: Users },
  { key: "documents", labelKey: "labels.placement.documents", icon: FileText },
  { key: "timesheets", labelKey: "labels.placement.timesheets", icon: Clock },
  { key: "margin", labelKey: "labels.placement.margin", icon: DollarSign },
];

export default function PlacementDetail() {
  const { t } = useTranslation();
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
    TABS.map((tab) => ({ key: tab.key, icon: tab.icon, label: t(tab.labelKey), to: `?tab=${tab.key}` })),
    [t]);

  if (loading) {
    return (
      <AppShell bgClassName="bg-background">
        <div className="max-w-6xl mx-auto p-6 text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("messages.placement.loading")}
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
              <CardTitle>{t("headings.placement.notFound")}</CardTitle>
              <CardDescription>
                {error ?? t("messages.placement.notFoundBody")}
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
            <Link to="/dashboard"><ArrowLeft className="h-4 w-4 mr-1" /> {t("actions.back")}</Link>
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

        {activeTab === "overview" && <OverviewTab placement={placement} onUpdated={setPlacement} toast={toast} />}
        {activeTab === "splits" && <SplitsTab placementId={placement.id} recruiterId={placement.recruiterId} recruiterName={placement.recruiterName} toast={toast} />}
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
  const { t } = useTranslation();
  return (
    <div className="-mt-4 flex gap-1 border-b">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key as TabKey)}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === tab.key
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {t(tab.labelKey)}
        </button>
      ))}
    </div>
  );
}

/** Editable back-office axis (invoice / payable / payroll) — #229. Read-only
 *  grid by default; "Edit" reveals an inline form that PUTs the whitelisted
 *  fields to `/api/recruiter/placements/:id` (same sanitizer as create) and
 *  lifts the refreshed row back to the page. */
function OverviewTab({
  placement,
  onUpdated,
  toast,
}: {
  placement: PlacementRow;
  onUpdated: (p: PlacementRow) => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<PlacementRow>>({});
  // #226 — Placement Type taxonomy options for the picker (loaded once).
  const [jobTypes, setJobTypes] = useState<PlacementJobType[]>([]);
  useEffect(() => {
    placementService.getJobTypes().then(setJobTypes).catch(() => setJobTypes([]));
  }, []);
  const placementTypeLabel = useMemo(
    () => jobTypes.find((j) => j.id === placement.placementTypeId)?.label ?? null,
    [jobTypes, placement.placementTypeId],
  );

  const fmtRate = (rate: string | null) =>
    rate
      ? new Intl.NumberFormat(undefined, { style: "currency", currency: placement.currency ?? "USD" })
          .format(Number(rate))
      : "—";

  const startEdit = () => {
    setForm({
      placementKind: placement.placementKind,
      placementTypeId: placement.placementTypeId,
      billRateHourly: placement.billRateHourly,
      payRateHourly: placement.payRateHourly,
      currency: placement.currency,
      poNumber: placement.poNumber,
      msaRef: placement.msaRef,
      endDate: placement.endDate ? placement.endDate.slice(0, 10) : null,
    });
    setEditing(true);
  };

  const set = (key: keyof PlacementRow, value: string) =>
    setForm((f) => ({ ...f, [key]: value === "" ? null : value }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await apiClient.put<PlacementRow>(`/api/recruiter/placements/${placement.id}`, form);
      onUpdated(res.data);
      setEditing(false);
      toast({ title: t("messages.saved", { defaultValue: "Saved" }) });
    } catch (e) {
      toast({
        title: t("messages.saveFailed", { defaultValue: "Couldn't save" }),
        description: String((e as Error).message),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t("headings.placement.engagementDetails")}</CardTitle>
        {!editing ? (
          <Button size="sm" variant="outline" onClick={startEdit}>
            {t("actions.edit", { defaultValue: "Edit" })}
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
              {t("actions.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {t("actions.save", { defaultValue: "Save" })}
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {editing ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <label className="space-y-1">
              <span className="text-muted-foreground text-xs">{t("labels.placement.kind", { defaultValue: "Engagement type" })}</span>
              <select
                value={(form.placementKind) ?? ""}
                onChange={(e) => set("placementKind", e.target.value)}
                className="w-full rounded border border-border px-2 py-1 text-sm"
              >
                <option value="">—</option>
                <option value="contract">Contract</option>
                <option value="direct_hire">Direct hire</option>
              </select>
            </label>
            {/* #226 — Placement Type (tenant job-type taxonomy → fee/overtime defaults). */}
            <label className="space-y-1">
              <span className="text-muted-foreground text-xs">{t("labels.placement.type")}</span>
              <select
                value={(form.placementTypeId) ?? ""}
                onChange={(e) => set("placementTypeId", e.target.value)}
                className="w-full rounded border border-border px-2 py-1 text-sm"
              >
                <option value="">{t("labels.placement.typeNone")}</option>
                {jobTypes.map((jt) => (
                  <option key={jt.id} value={jt.id}>{jt.label}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground text-xs">{t("labels.placement.billRate")}</span>
              <Input type="number" value={(form.billRateHourly) ?? ""} onChange={(e) => set("billRateHourly", e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground text-xs">{t("labels.placement.payRate")}</span>
              <Input type="number" value={(form.payRateHourly) ?? ""} onChange={(e) => set("payRateHourly", e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground text-xs">{t("fields.currency.label")}</span>
              <Input value={(form.currency) ?? ""} onChange={(e) => set("currency", e.target.value)} placeholder="USD" />
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground text-xs">{t("labels.placement.end")}</span>
              <Input type="date" value={(form.endDate) ?? ""} onChange={(e) => set("endDate", e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground text-xs">{t("labels.placement.poNumber")}</span>
              <Input value={(form.poNumber) ?? ""} onChange={(e) => set("poNumber", e.target.value)} />
            </label>
            <label className="space-y-1">
              <span className="text-muted-foreground text-xs">{t("labels.placement.msaRef")}</span>
              <Input value={(form.msaRef) ?? ""} onChange={(e) => set("msaRef", e.target.value)} />
            </label>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground text-xs">{t("labels.placement.billRate")}</div>
              <div className="font-mono tabular-nums">{fmtRate(placement.billRateHourly)} / h</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">{t("labels.placement.payRate")}</div>
              <div className="font-mono tabular-nums">{fmtRate(placement.payRateHourly)} / h</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">{t("fields.currency.label")}</div>
              <div>{placement.currency ?? "USD"}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">{t("labels.placement.type")}</div>
              <div>{placementTypeLabel ?? "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">{t("labels.start")}</div>
              <div>{placement.startDate ? new Date(placement.startDate).toLocaleDateString() : "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">{t("labels.placement.end")}</div>
              <div>{placement.endDate ? new Date(placement.endDate).toLocaleDateString() : "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">{t("labels.recruiter")}</div>
              <div>{placement.recruiterName}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">{t("labels.placement.poNumber")}</div>
              <div>{placement.poNumber ?? "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">{t("labels.placement.msaRef")}</div>
              <div>{placement.msaRef ?? "—"}</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DocumentsTab({ placementId, toast }: { placementId: string; toast: ReturnType<typeof useToast>["toast"] }) {
  const { t } = useTranslation();
  const [docs, setDocs] = useState<PlacementDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await workforceService.listDocuments();
      setDocs(r.documents.filter((d) => d.placementId === placementId));
    } catch (e) {
      toast({ title: t("messages.placement.docsLoadFailed"), description: String((e as Error).message), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [placementId, toast, t]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleUpload = async (docId: string, file: File) => {
    setUploadingId(docId);
    try {
      const buf = await file.arrayBuffer();
      const uploadUrl = `/api/workforce/documents/${docId}/upload`;
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "x-filename": file.name,
          // authMiddleware reads the Bearer header only — relying on the cookie
          // alone 401'd this raw upload cross-origin. Reuse the canonical headers.
          ...standardAuthHeaders(uploadUrl),
        },
        body: buf,
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      toast({ title: t("messages.placement.uploaded"), description: file.name });
      await refresh();
    } catch (e) {
      toast({ title: t("messages.placement.uploadFailed"), description: String((e as Error).message), variant: "destructive" });
    } finally {
      setUploadingId(null);
    }
  };

  const handleMarkSigned = async (docId: string) => {
    try {
      await apiClient.post(`/api/workforce/documents/${docId}/mark-signed`, {});
      toast({ title: t("messages.placement.markedSigned") });
      await refresh();
    } catch (e) {
      toast({ title: t("status.failed"), description: String((e as Error).message), variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          {t("labels.placement.documents")}
          {!loading && <Badge variant="secondary">{docs.length}</Badge>}
        </CardTitle>
        <CardDescription>{t("messages.placement.documentsDesc")}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground">{t("status.loading")}</div>
        ) : docs.length === 0 ? (
          <div className="text-sm text-muted-foreground">{t("messages.placement.noDocuments")}</div>
        ) : (
          <div className="space-y-2">
            {docs.map((d) => (
              <div key={d.id} className="border rounded-md p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <div className="font-medium uppercase text-xs">{d.kind}</div>
                  <div className="text-xs text-muted-foreground">
                    {d.filePath ? t("labels.placement.fileUploaded") : t("labels.placement.noFile")} · {d.status}
                    {d.expiresAt ? ` · ${t("labels.placement.expires", { date: new Date(d.expiresAt).toLocaleDateString() })}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer inline-flex items-center gap-1 border px-3 py-1.5 rounded-md text-sm hover:bg-muted">
                    {uploadingId === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {d.filePath ? t("actions.replace") : t("actions.upload")}
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
                      {t("actions.placement.markSigned")}
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
  const { t } = useTranslation();
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
        toast({ title: t("messages.placement.timesheetsLoadFailed"), description: String((e as Error).message), variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, [candidateId, toast, t]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5" />
          {t("labels.placement.timesheets")}
          {!loading && <Badge variant="secondary">{rows.length}</Badge>}
        </CardTitle>
        <CardDescription>{t("messages.placement.timesheetsDesc")}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground">{t("status.loading")}</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">{t("messages.placement.noTimesheets")}</div>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.id} className="border rounded-md p-3 flex items-center justify-between text-sm">
                <div>
                  <div className="font-medium">{t("labels.placement.weekOf", { date: r.periodStart })}</div>
                  <div className="text-xs text-muted-foreground">
                    {t("labels.placement.hoursSummary", { total: r.totalHours, billable: r.totalBillableHours })}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={r.status === "approved" ? "default" : "secondary"}>{r.status}</Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(`/api/workforce/timesheets/${r.id}/print`, "_blank", "noopener")}
                  >
                    <Printer className="h-4 w-4 mr-1" /> {t("actions.print")}
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
  const { t } = useTranslation();
  const [row, setRow] = useState<DeskMarginRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const r = await workforceService.getDeskMargin();
        setRow(r.rows.find((m) => m.placementId === placementId) ?? null);
      } catch (e) {
        toast({ title: t("messages.placement.marginLoadFailed"), description: String((e as Error).message), variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, [placementId, toast, t]);

  const fmt = (cents: number, currency = "USD") =>
    new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          {t("headings.placement.deskMarginYtd")}
        </CardTitle>
        <CardDescription>{t("messages.placement.marginDesc")}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground">{t("status.loading")}</div>
        ) : !row ? (
          <div className="text-sm text-muted-foreground">{t("messages.placement.noMargin")}</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div className="border rounded-md p-3">
              <div className="text-muted-foreground text-xs">{t("labels.placement.revenueYtd")}</div>
              <div className="font-mono tabular-nums text-lg">{fmt(row.revenueCents, row.currency)}</div>
            </div>
            <div className="border rounded-md p-3">
              <div className="text-muted-foreground text-xs">{t("labels.placement.contractorPayYtd")}</div>
              <div className="font-mono tabular-nums text-lg">{fmt(row.payoutCents, row.currency)}</div>
            </div>
            <div className="border rounded-md p-3">
              <div className="text-muted-foreground text-xs">{t("labels.placement.grossMarginYtd")}</div>
              <div className={`font-mono tabular-nums text-lg ${row.grossMarginCents >= 0 ? "text-green-600" : "text-red-600"}`}>
                {fmt(row.grossMarginCents, row.currency)}
              </div>
            </div>
            <div className="sm:col-span-3 text-xs text-muted-foreground mt-2">
              {t("labels.placement.approvedTimesheets", { count: row.approvedTimesheetCount })} ·
              {" "}{t("labels.placement.billableHoursYtd", { hours: row.billableHoursYTD })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * #228 — Placement fee splits. The commission engine fans the placement's fee
 * out across these rows (recruiter / sourcer / manager). A placement either
 * has NO splits (the owning recruiter takes the whole fee) or a set summing to
 * exactly 100%. The owning recruiter is pre-seeded at 100% when none exist.
 */
function SplitsTab({
  placementId,
  recruiterId,
  recruiterName,
  toast,
}: {
  placementId: string;
  recruiterId: string;
  recruiterName: string;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<PlacementSplit[] | null>(null);
  const [saving, setSaving] = useState(false);

  const seedOwner = (): PlacementSplit => ({
    ownerUserId: recruiterId,
    ownerType: "recruiter",
    percentBps: 10000,
    ownerName: recruiterName,
  });

  useEffect(() => {
    placementService
      .getSplits(placementId)
      .then((s) => setRows(s.length > 0 ? s : [seedOwner()]))
      .catch(() => setRows([seedOwner()]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placementId, recruiterId, recruiterName]);

  const totalBps = (rows ?? []).reduce((n, r) => n + (Number.isFinite(r.percentBps) ? r.percentBps : 0), 0);
  const balanced = totalBps === 10000;

  const update = (i: number, patch: Partial<PlacementSplit>) =>
    setRows((prev) => (prev ? prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) : prev));
  const removeRow = (i: number) => setRows((prev) => (prev ? prev.filter((_, idx) => idx !== i) : prev));
  const addRow = () =>
    setRows((prev) => [...(prev ?? []), { ownerUserId: "", ownerType: "recruiter", percentBps: 0 }]);

  const save = async () => {
    if (!rows) return;
    setSaving(true);
    try {
      const saved = await placementService.setSplits(placementId, rows.filter((r) => r.ownerUserId));
      setRows(saved.length > 0 ? saved : [seedOwner()]);
      toast({ title: t("messages.placement.splitsSaved") });
    } catch (e) {
      toast({ title: t("messages.placement.splitsSaveFailed"), description: String((e as Error).message), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const clearSplits = async () => {
    setSaving(true);
    try {
      await placementService.setSplits(placementId, []);
      setRows([seedOwner()]);
      toast({ title: t("messages.placement.splitsCleared") });
    } catch (e) {
      toast({ title: t("messages.placement.splitsSaveFailed"), description: String((e as Error).message), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!rows) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("messages.placement.loading")}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>{t("headings.placement.splits")}</CardTitle>
          <CardDescription>{t("messages.placement.splitsHelp")}</CardDescription>
        </div>
        <Badge variant={balanced ? "default" : "destructive"}>
          {t("labels.placement.splitTotal", { percent: (totalBps / 100).toFixed(0) })}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <label className="space-y-1 flex-1 min-w-[180px]">
              <span className="text-muted-foreground text-xs">{t("labels.placement.splitOwner")}</span>
              <Input
                value={r.ownerName ?? r.ownerUserId}
                onChange={(e) => update(i, { ownerUserId: e.target.value, ownerName: null })}
                placeholder={t("labels.placement.splitOwnerPlaceholder")}
                disabled={i === 0 && r.ownerUserId === recruiterId}
              />
            </label>
            <label className="space-y-1 w-[140px]">
              <span className="text-muted-foreground text-xs">{t("labels.placement.splitRole")}</span>
              <select
                value={r.ownerType}
                onChange={(e) => update(i, { ownerType: e.target.value })}
                className="w-full rounded border border-border px-2 py-[7px] text-sm"
              >
                <option value="recruiter">{t("labels.placement.roleRecruiter")}</option>
                <option value="sourcer">{t("labels.placement.roleSourcer")}</option>
                <option value="manager">{t("labels.placement.roleManager")}</option>
                <option value="other">{t("labels.placement.roleOther")}</option>
              </select>
            </label>
            <label className="space-y-1 w-[110px]">
              <span className="text-muted-foreground text-xs">{t("labels.placement.splitPercent")}</span>
              <Input
                type="number"
                min={0}
                max={100}
                value={Math.round(r.percentBps / 100)}
                onChange={(e) => update(i, { percentBps: Math.max(0, Math.min(100, Number(e.target.value) || 0)) * 100 })}
              />
            </label>
            {rows.length > 1 && (
              <Button variant="ghost" size="icon" className="text-destructive" onClick={() => removeRow(i)} aria-label={t("actions.delete")}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={addRow}>
            <Plus className="h-4 w-4 mr-1" /> {t("actions.placement.addSplit")}
          </Button>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={clearSplits} disabled={saving}>
            {t("actions.placement.clearSplits")}
          </Button>
          <Button size="sm" onClick={save} disabled={saving || !balanced}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            {t("actions.save", { defaultValue: "Save" })}
          </Button>
        </div>
        {!balanced && (
          <p className="text-xs text-destructive">{t("messages.placement.splitsMustTotal")}</p>
        )}
      </CardContent>
    </Card>
  );
}
