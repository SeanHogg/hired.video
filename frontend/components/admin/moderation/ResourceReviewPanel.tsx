/**
 * Community-resource review queue — user-submitted location resources awaiting
 * SuperAdmin approval before they render on /in/* location pages. Approve to
 * publish, or reject with a reason. Sibling tab to the article-review and
 * abuse-report panels on /admin/moderation.
 */
import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  MapPin,
  Phone,
  RefreshCcw,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  RESOURCE_AUDIENCE_LABEL,
  RESOURCE_CATEGORY_LABEL,
  type ResourceStatus,
} from "@shared/community-resources";
import {
  communityResourcesService,
  type CommunityResource,
} from "@/lib/services/community-resources-service";

export default function ResourceReviewPanel() {
  const { toast } = useToast();
  const [rows, setRows] = useState<CommunityResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ResourceStatus>("pending");
  const [rejecting, setRejecting] = useState<CommunityResource | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setRows(await communityResourcesService.listQueue(filter));
    } catch (err) {
      toast({
        title: "Couldn't load resources",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function approve(r: CommunityResource) {
    setBusyId(r.id);
    try {
      await communityResourcesService.review(r.id, { status: "approved" });
      toast({ title: "Approved", description: `"${r.title}" is now live.` });
      await load();
    } catch (err) {
      toast({
        title: "Approve failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function confirmReject() {
    if (!rejecting) return;
    setBusyId(rejecting.id);
    try {
      await communityResourcesService.review(rejecting.id, {
        status: "rejected",
        rejectionReason: rejectReason.trim() || undefined,
      });
      toast({ title: "Rejected" });
      setRejecting(null);
      setRejectReason("");
      await load();
    } catch (err) {
      toast({
        title: "Reject failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          User-submitted local resources. Approve to publish them on the matching /in/ location
          page, or reject with a reason.
        </p>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as ResourceStatus)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
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
            <p className="text-sm font-medium">Nothing here</p>
            <p className="text-xs text-muted-foreground">No resources in this queue right now.</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.id}>
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <CardTitle className="text-base">{r.title}</CardTitle>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                        <Badge variant="secondary" className="text-[10px]">
                          {RESOURCE_CATEGORY_LABEL[r.category]}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {RESOURCE_AUDIENCE_LABEL[r.audience]}
                        </Badge>
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {[r.citySlug, r.stateCode, r.countryCode].filter(Boolean).join(" / ")}
                        </span>
                      </div>
                    </div>
                    {filter === "pending" && (
                      <div className="flex shrink-0 gap-2">
                        <Button
                          size="sm"
                          onClick={() => approve(r)}
                          disabled={busyId === r.id}
                        >
                          {busyId === r.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                          )}
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setRejecting(r)}
                          disabled={busyId === r.id}
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1" />
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 pt-0 text-sm">
                  <p className="text-muted-foreground">{r.description}</p>
                  <div className="flex flex-wrap gap-4 text-xs">
                    {r.url && (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        {r.url}
                      </a>
                    )}
                    {r.phone && (
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <Phone className="h-3 w-3" />
                        {r.phone}
                      </span>
                    )}
                  </div>
                  {r.status === "rejected" && r.rejectionReason && (
                    <p className="text-xs text-destructive">Rejected: {r.rejectionReason}</p>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject resource</DialogTitle>
            <DialogDescription>
              Optionally note what's wrong — it's stored on the row for the audit trail.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="res-reject-reason">Reason</Label>
            <Textarea
              id="res-reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="e.g. Dead link, duplicate, or not a real resource."
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRejecting(null)} disabled={busyId !== null}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmReject} disabled={busyId !== null}>
              {busyId !== null ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
