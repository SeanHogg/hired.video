/**
 * Admin Moderation Queue — every `content_reports` row across the
 * platform with reporter + owner chips, status filter, and inline
 * resolve actions. Mounted under /admin/moderation; the route + page
 * are gated by AdminLayout's SuperAdmin guard.
 *
 * Communication after triage flows through /inbox (auto-created by
 * ModerationService) — this page intentionally does NOT render a
 * conversation panel. Resolving from here closes the loop server-side
 * (notifications + recap message).
 */
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCcw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  reportsService,
  type AdminQueueRow,
} from "@/lib/services/reports-service";
import {
  REPORT_ENTITY_LABEL,
  REPORT_REASON_LABEL,
  REPORT_STATUSES,
  REPORT_STATUS_LABEL,
  type ReportStatus,
} from "@shared/moderation";

const RESOLVABLE: Array<Exclude<ReportStatus, "pending">> = [
  "reviewing",
  "resolved_action_taken",
  "resolved_no_action",
  "dismissed",
];

function statusVariant(s: ReportStatus): "default" | "secondary" | "outline" | "destructive" {
  if (s === "pending") return "destructive";
  if (s === "reviewing") return "default";
  if (s === "resolved_action_taken") return "default";
  if (s === "resolved_no_action") return "secondary";
  return "outline"; // dismissed
}

export default function ModerationQueue() {
  const { toast } = useToast();
  const [rows, setRows] = useState<AdminQueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ReportStatus | "all">("pending");
  const [resolving, setResolving] = useState<AdminQueueRow | null>(null);
  const [nextStatus, setNextStatus] = useState<Exclude<ReportStatus, "pending">>("reviewing");
  const [resolution, setResolution] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const queue = await reportsService.listQueue(
        filter === "all" ? {} : { status: filter },
      );
      setRows(queue);
    } catch (err) {
      toast({
        title: "Couldn't load reports",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  function openResolve(row: AdminQueueRow) {
    setResolving(row);
    setNextStatus(row.report.status === "pending" ? "reviewing" : "resolved_action_taken");
    setResolution(row.report.resolution ?? "");
  }

  async function submitResolve() {
    if (!resolving) return;
    setSubmitting(true);
    try {
      await reportsService.resolve(resolving.report.id, {
        status: nextStatus,
        resolution: resolution.trim() || undefined,
      });
      toast({
        title: "Report updated",
        description: `Reporter + owner notified via /inbox.`,
      });
      setResolving(null);
      await load();
    } catch (err) {
      toast({
        title: "Couldn't update the report",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const counts = rows.reduce<Record<ReportStatus, number>>(
    (acc, r) => {
      acc[r.report.status] = (acc[r.report.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<ReportStatus, number>,
  );

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <ShieldCheck className="h-5 w-5 text-pink-500" />
            Moderation Queue
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every abuse report across the platform. Resolving a report
            notifies the reporter (and the entity owner, when action is
            taken) via /inbox.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {REPORT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {REPORT_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCcw className="mr-1.5 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            <p className="text-sm font-medium">Inbox zero</p>
            <p className="text-xs text-muted-foreground">
              No reports match the current filter.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <ReportRow
              key={row.report.id}
              row={row}
              onResolve={() => openResolve(row)}
            />
          ))}
        </ul>
      )}

      {Object.keys(counts).length > 0 && (
        <p className="text-xs text-muted-foreground">
          Showing {rows.length} report{rows.length === 1 ? "" : "s"}.
        </p>
      )}

      <Dialog open={!!resolving} onOpenChange={(o) => !o && setResolving(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Resolve report</DialogTitle>
            <DialogDescription>
              Pick the outcome. The reporter is notified for every
              status; the entity owner is notified only when action was
              taken.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="resolve-status">Status</Label>
              <Select
                value={nextStatus}
                onValueChange={(v) => setNextStatus(v as Exclude<ReportStatus, "pending">)}
              >
                <SelectTrigger id="resolve-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RESOLVABLE.map((s) => (
                    <SelectItem key={s} value={s}>
                      {REPORT_STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="resolve-notes">
                Notes for the reporter / owner
              </Label>
              <Textarea
                id="resolve-notes"
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                maxLength={2000}
                rows={4}
                placeholder="Optional — included verbatim in the inbox recap message."
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setResolving(null)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={submitResolve} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save resolution"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReportRow({
  row,
  onResolve,
}: {
  row: AdminQueueRow;
  onResolve: () => void;
}) {
  const { report, reporter, owner } = row;
  return (
    <li>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                {REPORT_ENTITY_LABEL[report.entityType]} ·{" "}
                <span className="font-mono text-xs text-muted-foreground">
                  {report.entityId.slice(0, 8)}
                </span>
              </CardTitle>
              <CardDescription className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                <Badge variant={statusVariant(report.status)}>
                  {REPORT_STATUS_LABEL[report.status]}
                </Badge>
                <span className="text-muted-foreground">
                  Reason: <strong>{REPORT_REASON_LABEL[report.reason]}</strong>
                </span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">
                  Reported by{" "}
                  <strong>{reporter.name ?? reporter.email ?? "Unknown"}</strong>
                </span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">
                  Owner:{" "}
                  <strong>
                    {owner?.name ?? owner?.email ?? "Unknown / unowned"}
                  </strong>
                </span>
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={onResolve}>
              {report.status === "pending" || report.status === "reviewing"
                ? "Resolve"
                : "Re-resolve"}
            </Button>
          </div>
        </CardHeader>
        {(report.notes || report.resolution) && (
          <CardContent className="space-y-2 pt-0 text-xs">
            {report.notes && (
              <div>
                <p className="font-medium text-muted-foreground">
                  Reporter notes
                </p>
                <p className="whitespace-pre-wrap rounded-md bg-muted/40 px-2 py-1">
                  {report.notes}
                </p>
              </div>
            )}
            {report.resolution && (
              <div>
                <p className="font-medium text-muted-foreground">
                  Admin resolution
                </p>
                <p className="whitespace-pre-wrap rounded-md bg-muted/40 px-2 py-1">
                  {report.resolution}
                </p>
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </li>
  );
}
