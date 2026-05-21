/**
 * Pre-publish content review queue — articles / FAQs / guides that creators
 * have submitted but a SuperAdmin hasn't approved yet. Multi-select bulk
 * scan, bulk approve, bulk reject. Scan recommendations + finding chips are
 * stored on the row so re-rendering doesn't burn another LLM call.
 */
import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  RefreshCcw,
  ScanLine,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
  adminArticleService,
  type AdminQueueEntry,
  type ArticleKind,
  type ModerationSeverity,
} from "@/lib/services/article-service";

type QueueFilter = "submitted" | "rejected" | "published";

const SEVERITY_VARIANT: Record<ModerationSeverity, "outline" | "default" | "secondary" | "destructive"> = {
  low: "outline",
  medium: "secondary",
  high: "default",
  block: "destructive",
};

export default function ContentReviewPanel() {
  const { toast } = useToast();
  const [rows, setRows] = useState<AdminQueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<QueueFilter>("submitted");
  const [kindFilter, setKindFilter] = useState<"all" | ArticleKind>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState<"scan" | "approve" | "reject" | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  async function load() {
    setLoading(true);
    try {
      const q = await adminArticleService.queue({
        status: statusFilter,
        kind: kindFilter === "all" ? undefined : kindFilter,
      });
      setRows(q);
      setSelected(new Set());
    } catch (err) {
      toast({
        title: "Couldn't load queue",
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
  }, [statusFilter, kindFilter]);

  const selectedIds = useMemo(() => Array.from(selected), [selected]);

  const allChecked = rows.length > 0 && selected.size === rows.length;
  const someChecked = selected.size > 0 && selected.size < rows.length;

  function toggleAll() {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.article.id)));
  }
  function toggleOne(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runScan() {
    if (selectedIds.length === 0) return;
    setRunning("scan");
    try {
      const res = await adminArticleService.scan(selectedIds);
      toast({
        title: `Scanned ${res.scanned} pieces`,
        description: summariseScan(res.results),
      });
      await load();
    } catch (err) {
      toast({
        title: "Scan failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setRunning(null);
    }
  }

  async function runApprove() {
    if (selectedIds.length === 0) return;
    setRunning("approve");
    try {
      const res = await adminArticleService.approve(selectedIds);
      toast({ title: `Approved ${res.approved} pieces` });
      await load();
    } catch (err) {
      toast({
        title: "Approve failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setRunning(null);
    }
  }

  async function runReject() {
    if (selectedIds.length === 0 || !rejectReason.trim()) return;
    setRunning("reject");
    try {
      const res = await adminArticleService.reject(selectedIds, rejectReason.trim());
      toast({ title: `Rejected ${res.rejected} pieces` });
      setRejectOpen(false);
      setRejectReason("");
      await load();
    } catch (err) {
      toast({
        title: "Reject failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Submitted articles, FAQs, and guides awaiting SuperAdmin review. Scan runs the same
          safety classifier the creator hit on submit (re-scan stores the latest score on the row).
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as QueueFilter)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="published">Published</SelectItem>
            </SelectContent>
          </Select>
          <Select value={kindFilter} onValueChange={(v) => setKindFilter(v as any)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All kinds</SelectItem>
              <SelectItem value="article">Articles</SelectItem>
              <SelectItem value="faq">FAQs</SelectItem>
              <SelectItem value="guide">Guides</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCcw className="mr-1.5 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
        <Checkbox
          checked={allChecked || (someChecked ? "indeterminate" : false)}
          onCheckedChange={toggleAll}
          aria-label="Select all"
        />
        <span className="text-xs text-muted-foreground">
          {selected.size} of {rows.length} selected
        </span>
        <div className="ml-auto flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={selected.size === 0 || running !== null}
            onClick={runScan}
          >
            {running === "scan" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <ScanLine className="h-3.5 w-3.5 mr-1" />
            )}
            Scan
          </Button>
          <Button
            size="sm"
            disabled={selected.size === 0 || running !== null || statusFilter !== "submitted"}
            onClick={runApprove}
          >
            {running === "approve" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            )}
            Approve
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={selected.size === 0 || running !== null || statusFilter !== "submitted"}
            onClick={() => setRejectOpen(true)}
          >
            <XCircle className="h-3.5 w-3.5 mr-1" />
            Reject
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <ShieldCheck className="h-8 w-8 text-emerald-500" />
            <p className="text-sm font-medium">Nothing pending</p>
            <p className="text-xs text-muted-foreground">No content in this queue right now.</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <ReviewRow
              key={r.article.id}
              entry={r}
              checked={selected.has(r.article.id)}
              onToggle={() => toggleOne(r.article.id)}
            />
          ))}
        </ul>
      )}

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject {selected.size} piece{selected.size === 1 ? "" : "s"}</DialogTitle>
            <DialogDescription>
              The reason is stored on each article and shown to the creator so they can revise.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">Reason</Label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="What's wrong, and what should the creator change?"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={running !== null}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={runReject} disabled={running !== null || !rejectReason.trim()}>
              {running === "reject" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function summariseScan(results: { severity: ModerationSeverity; recommendation: string }[]): string {
  if (results.length === 0) return "No rows scanned.";
  const counts: Record<string, number> = {};
  for (const r of results) counts[r.recommendation] = (counts[r.recommendation] ?? 0) + 1;
  return Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ");
}

function ReviewRow({
  entry,
  checked,
  onToggle,
}: {
  entry: AdminQueueEntry;
  checked: boolean;
  onToggle: () => void;
}) {
  const { article, author } = entry;
  const findings = article.moderationFindings;
  return (
    <li>
      <Card>
        <CardContent className="p-3 flex items-start gap-3">
          <Checkbox checked={checked} onCheckedChange={onToggle} aria-label={`Select ${article.title}`} />
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold truncate">{article.title}</span>
              <Badge variant="outline" className="text-[10px] uppercase">{article.kind}</Badge>
              <Badge variant="secondary" className="text-[10px]">{article.status}</Badge>
              {article.moderationScore != null && (
                <Badge variant="outline" className="text-[10px]">
                  Safety {Math.round((article.moderationScore ?? 0) * 100)}/100
                </Badge>
              )}
              {findings && (
                <Badge variant={SEVERITY_VARIANT[findings.severity]} className="text-[10px]">
                  {findings.severity}
                </Badge>
              )}
            </div>
            {article.summary && (
              <p className="text-xs text-muted-foreground line-clamp-2">{article.summary}</p>
            )}
            <p className="text-xs text-muted-foreground">
              by <strong>{author.name ?? author.email ?? "Unknown"}</strong>
              {" · "}
              {article.readMinutes} min
              {article.submittedForReviewAt && ` · submitted ${new Date(article.submittedForReviewAt).toLocaleString()}`}
            </p>
            {findings && (findings.profanity.length + findings.racism.length + findings.tosViolations.length > 0) && (
              <div className="flex flex-wrap gap-1 text-[10px]">
                {findings.profanity.map((w) => <Badge key={`p:${w}`} variant="outline">profanity:{w}</Badge>)}
                {findings.racism.map((w) => <Badge key={`r:${w}`} variant="destructive">racism:{w}</Badge>)}
                {findings.tosViolations.map((w) => <Badge key={`t:${w}`} variant="secondary">tos:{w}</Badge>)}
              </div>
            )}
            {findings?.rationale && (
              <p className="text-xs text-muted-foreground italic">"{findings.rationale}"</p>
            )}
            {article.status === "rejected" && article.rejectionReason && (
              <p className="text-xs text-destructive">Rejected: {article.rejectionReason}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </li>
  );
}
