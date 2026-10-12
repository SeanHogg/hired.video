/**
 * Recruiter placements list + bulk-add (#225) at /recruiter/placements.
 *
 * The missing list surface for the placement back-office: a commission
 * snapshot, every placement the recruiter owns (each links to its detail
 * page for splits / type / margin), and a "Bulk add" dialog that records N
 * placements against (optionally) one job in a single round-trip via
 * `POST /api/recruiter/placements/bulk`. Each row carries its own salary /
 * fee / placement-type; splits are set per-placement on the detail page.
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import { Loader2, Plus, Trash2, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/components/ui/use-toast";
import { usePermissions } from "@/hooks/use-permissions";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import {
  placementService,
  type PlacementDTO,
  type CommissionSummaryDTO,
  type PlacementJobType,
  type BulkPlacementRow,
} from "@/lib/services/placement-service";

interface DraftRow {
  candidateName: string;
  jobTitle: string;
  annualSalary: string;
  commissionPercentage: string;
  placementTypeId: string;
}

const emptyDraft = (): DraftRow => ({
  candidateName: "",
  jobTitle: "",
  annualSalary: "",
  commissionPercentage: "20",
  placementTypeId: "",
});

export default function PlacementsList() {
  const { t } = useTranslation();
  const location = useLocation();
  useSEO(location.pathname);
  useBreadcrumbs([
    { name: t("crossJobPipeline.breadcrumbJobs"), url: "/jobs" },
    { name: t("headings.placements.title"), url: "/recruiter/placements" },
  ]);
  const { canManageJobs } = usePermissions();
  const { toast } = useToast();

  const [placements, setPlacements] = useState<PlacementDTO[] | null>(null);
  const [summary, setSummary] = useState<CommissionSummaryDTO | null>(null);
  const [jobTypes, setJobTypes] = useState<PlacementJobType[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);

  const load = async () => {
    try {
      const [p, s] = await Promise.all([
        placementService.getPlacements(),
        placementService.getCommissionSummary().catch(() => null),
      ]);
      setPlacements(p);
      setSummary(s);
    } catch {
      setPlacements([]);
    }
  };

  useEffect(() => {
    if (!canManageJobs) return;
    void load();
    placementService.getJobTypes().then(setJobTypes).catch(() => setJobTypes([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManageJobs]);

  const typeLabel = (id: string | null | undefined) =>
    jobTypes.find((j) => j.id === id)?.label ?? null;

  if (!canManageJobs) {
    return (
      <AppShell>
        <div className="px-4 py-6">
          <Alert>
            <AlertDescription>{t("crossJobPipeline.recruiterOnly")}</AlertDescription>
          </Alert>
        </div>
      </AppShell>
    );
  }

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);

  return (
    <AppShell>
      <div className="px-4 py-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold">{t("headings.placements.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("messages.placements.subtitle")}</p>
          </div>
          <Button onClick={() => setBulkOpen(true)} className="gap-1">
            <Plus className="h-4 w-4" /> {t("actions.placements.bulkAdd")}
          </Button>
        </div>

        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label={t("labels.placements.earned")} value={fmtMoney(summary.totalEarned)} />
            <Kpi label={t("labels.placements.pending")} value={fmtMoney(summary.totalPending)} />
            <Kpi label={t("labels.placements.paid")} value={fmtMoney(summary.totalPaid)} />
            <Kpi label={t("labels.placements.total")} value={String(summary.totalPlacements)} />
          </div>
        )}

        {placements === null ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : placements.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center space-y-2">
              <Users className="h-10 w-10 text-muted-foreground/50 mx-auto" />
              <p className="text-sm text-muted-foreground">{t("messages.placements.empty")}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {placements.map((p) => (
              <Link
                key={p.id}
                to={`/recruiter/placements/${p.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3 hover:shadow-sm transition-shadow"
              >
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{p.candidateName || t("labels.unnamedCandidate")}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {p.jobTitle || "—"}{p.companyName ? ` · ${p.companyName}` : ""}
                    {typeLabel(p.placementTypeId) ? ` · ${typeLabel(p.placementTypeId)}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-sm font-mono tabular-nums">{fmtMoney(p.commissionAmount)}</span>
                  <Badge variant={p.commissionStatus === "Paid" ? "default" : "secondary"}>{p.commissionStatus}</Badge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <BulkAddDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        jobTypes={jobTypes}
        onSaved={() => {
          setBulkOpen(false);
          void load();
        }}
        toast={toast}
      />
    </AppShell>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-lg font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

function BulkAddDialog({
  open,
  onOpenChange,
  jobTypes,
  onSaved,
  toast,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  jobTypes: PlacementJobType[];
  onSaved: () => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<DraftRow[]>([emptyDraft()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setRows([emptyDraft()]);
  }, [open]);

  const update = (i: number, patch: Partial<DraftRow>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));
  const addRow = () => setRows((prev) => [...prev, emptyDraft()]);

  const valid = useMemo(
    () => rows.filter((r) => r.candidateName.trim()).length,
    [rows],
  );

  const save = async () => {
    const payload: BulkPlacementRow[] = rows
      .filter((r) => r.candidateName.trim())
      .map((r) => ({
        candidateName: r.candidateName.trim(),
        jobTitle: r.jobTitle.trim() || undefined,
        annualSalary: r.annualSalary ? Number(r.annualSalary) : undefined,
        commissionPercentage: r.commissionPercentage ? Number(r.commissionPercentage) : undefined,
        placementTypeId: r.placementTypeId || null,
      }));
    if (payload.length === 0) return;
    setSaving(true);
    try {
      const saved = await placementService.bulkRecordPlacements(payload);
      toast({ title: t("messages.placements.bulkSaved", { count: saved.length }) });
      onSaved();
    } catch (e) {
      toast({ title: t("messages.placements.bulkFailed"), description: String((e as Error).message), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("headings.placements.bulkAdd")}</DialogTitle>
          <DialogDescription>{t("messages.placements.bulkHelp")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <label className="space-y-1 flex-1 min-w-[160px]">
                <span className="text-muted-foreground text-xs">{t("labels.placements.candidate")}</span>
                <Input value={r.candidateName} onChange={(e) => update(i, { candidateName: e.target.value })} />
              </label>
              <label className="space-y-1 flex-1 min-w-[140px]">
                <span className="text-muted-foreground text-xs">{t("labels.placements.jobTitle")}</span>
                <Input value={r.jobTitle} onChange={(e) => update(i, { jobTitle: e.target.value })} />
              </label>
              <label className="space-y-1 w-[110px]">
                <span className="text-muted-foreground text-xs">{t("labels.placements.salary")}</span>
                <Input type="number" value={r.annualSalary} onChange={(e) => update(i, { annualSalary: e.target.value })} />
              </label>
              <label className="space-y-1 w-[90px]">
                <span className="text-muted-foreground text-xs">{t("labels.placements.feePct")}</span>
                <Input type="number" value={r.commissionPercentage} onChange={(e) => update(i, { commissionPercentage: e.target.value })} />
              </label>
              <label className="space-y-1 w-[130px]">
                <span className="text-muted-foreground text-xs">{t("labels.placement.type")}</span>
                <select
                  value={r.placementTypeId}
                  onChange={(e) => update(i, { placementTypeId: e.target.value })}
                  className="w-full rounded border border-border px-2 py-[7px] text-sm"
                >
                  <option value="">{t("labels.placement.typeNone")}</option>
                  {jobTypes.map((jt) => (
                    <option key={jt.id} value={jt.id}>{jt.label}</option>
                  ))}
                </select>
              </label>
              {rows.length > 1 && (
                <Button variant="ghost" size="icon" className="text-destructive" onClick={() => removeRow(i)} aria-label={t("actions.delete")}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addRow}>
            <Plus className="h-4 w-4 mr-1" /> {t("actions.placements.addRow")}
          </Button>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("actions.cancel")}
          </Button>
          <Button onClick={save} disabled={saving || valid === 0}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            {t("actions.placements.saveCount", { count: valid })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
