// SourcingFeePanel — owner-only widget on the JobDetail Overview tab. Lets
// the company toggle "open this job to recruiter sourcing bids", set a fee
// + deadline + terms, and review/accept/reject incoming bids.
//
// See memory: project_bidding_marketplace.

import { useEffect, useState } from "react";
import { Check, DollarSign, Loader2, ThumbsDown, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  sourcingBidService,
  type SourcingBid,
  type SourcingConfig,
} from "@/lib/services/sourcing-bid-service";

interface SourcingFeePanelProps {
  jobId: string;
}

export default function SourcingFeePanel({ jobId }: SourcingFeePanelProps) {
  const { toast } = useToast();
  const [configLoading, setConfigLoading] = useState(true);
  const [accepts, setAccepts] = useState(false);
  const [feeDollars, setFeeDollars] = useState("");
  const [deadline, setDeadline] = useState("");
  const [terms, setTerms] = useState("");
  const [saving, setSaving] = useState(false);
  const [bids, setBids] = useState<SourcingBid[] | null>(null);
  const [loadingBids, setLoadingBids] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setConfigLoading(true);
    sourcingBidService
      .getConfig(jobId)
      .then((cfg: SourcingConfig) => {
        if (cancelled) return;
        setAccepts(cfg.acceptsBids);
        setFeeDollars(cfg.feeCents != null ? (cfg.feeCents / 100).toFixed(2) : "");
        setDeadline(cfg.deadline ? cfg.deadline.slice(0, 10) : "");
        setTerms(cfg.terms ?? "");
      })
      .catch(() => {
        // Non-owner / 403 — panel just renders with defaults; save will fail
        // visibly. Owner check at the call site keeps this from rendering for
        // non-owners in normal flow.
      })
      .finally(() => {
        if (!cancelled) setConfigLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  useEffect(() => {
    if (!accepts) {
      setBids(null);
      return;
    }
    let cancelled = false;
    setLoadingBids(true);
    sourcingBidService
      .listBidsForJob(jobId)
      .then((res) => {
        if (!cancelled) setBids(res.bids);
      })
      .catch(() => {
        if (!cancelled) setBids([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingBids(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accepts, jobId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const fee = feeDollars.trim() ? Math.round(Number.parseFloat(feeDollars) * 100) : null;
      await sourcingBidService.updateConfig(jobId, {
        acceptsBids: accepts,
        feeCents: fee,
        deadline: deadline ? new Date(deadline).toISOString() : null,
        terms: terms.trim() || null,
      });
      toast({ title: "Sourcing config saved" });
    } catch (e) {
      toast({
        title: "Save failed",
        description: (e as Error)?.message ?? "Try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAcceptBid = async (bidId: string) => {
    try {
      await sourcingBidService.accept(bidId);
      // Other pending bids on this job get auto-rejected server-side; refresh.
      const next = await sourcingBidService.listBidsForJob(jobId);
      setBids(next.bids);
      toast({ title: "Bid accepted", description: "Competing bids were auto-rejected." });
    } catch (e) {
      toast({ title: "Accept failed", description: (e as Error)?.message, variant: "destructive" });
    }
  };

  const handleRejectBid = async (bidId: string) => {
    try {
      await sourcingBidService.reject(bidId);
      setBids((prev) => prev?.map((b) => (b.id === bidId ? { ...b, status: "rejected" } : b)) ?? null);
      toast({ title: "Bid rejected" });
    } catch (e) {
      toast({ title: "Reject failed", description: (e as Error)?.message, variant: "destructive" });
    }
  };

  if (configLoading) {
    return (
      <Card className="border-primary/30">
        <CardContent className="pt-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading sourcing settings…
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/30">
      <CardContent className="pt-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h3 className="font-semibold flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-primary" />
              Recruiter sourcing marketplace
            </h3>
            <p className="text-xs text-muted-foreground max-w-xl">
              Open this job to external recruiters. They bid to source candidates;
              you set the fee and pick the winning bid. The accepted recruiter is
              attached to the pipeline as the sourcing owner.
            </p>
          </div>
          <Switch checked={accepts} onCheckedChange={setAccepts} />
        </div>

        {accepts && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="sourcing-fee">Sourcing fee ($)</Label>
              <Input
                id="sourcing-fee"
                type="number"
                step="0.01"
                min="0"
                placeholder="e.g. 5000"
                value={feeDollars}
                onChange={(e) => setFeeDollars(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                One-time fee paid to the winning recruiter on a successful hire.
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="sourcing-deadline">Bid deadline</Label>
              <Input
                id="sourcing-deadline"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Bids submitted after this date are blocked.
              </p>
            </div>
            <div className="sm:col-span-2 space-y-1">
              <Label htmlFor="sourcing-terms">Terms (optional)</Label>
              <Textarea
                id="sourcing-terms"
                rows={3}
                placeholder="Exclusivity, candidate spec, replacement guarantee, payment schedule…"
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-1" />
                Save
              </>
            )}
          </Button>
        </div>

        {accepts && (
          <div className="border-t pt-4 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-sm">Incoming bids</h4>
              {bids && <span className="text-xs text-muted-foreground">{bids.length} total</span>}
            </div>

            {loadingBids ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Loading bids…
              </div>
            ) : !bids || bids.length === 0 ? (
              <div className="rounded border border-dashed p-6 text-center text-xs text-muted-foreground">
                No bids yet. Recruiters browsing /sourcing/browse will see your job once you save.
              </div>
            ) : (
              <div className="space-y-2">
                {bids.map((bid) => (
                  <div key={bid.id} className="rounded border p-3 bg-card text-sm space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-0.5">
                        <p className="font-semibold">
                          ${Number(bid.bidAmount).toLocaleString()}{" "}
                          <span className="text-xs font-normal text-muted-foreground">
                            · {bid.durationDays}d
                          </span>
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Bidder: {bid.bidderId.slice(0, 8)}… · {new Date(bid.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <StatusPill status={bid.status} />
                    </div>
                    {bid.proposalText && (
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap">{bid.proposalText}</p>
                    )}
                    {bid.status === "pending" && (
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => handleRejectBid(bid.id)}>
                          <ThumbsDown className="w-3.5 h-3.5 mr-1" />
                          Reject
                        </Button>
                        <Button size="sm" onClick={() => handleAcceptBid(bid.id)}>
                          <ThumbsUp className="w-3.5 h-3.5 mr-1" />
                          Accept
                        </Button>
                      </div>
                    )}
                    {bid.status === "rejected" && bid.rejectionReason && (
                      <p className="text-[11px] text-muted-foreground italic">
                        Rejected: {bid.rejectionReason}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-blue-100 text-blue-800",
    accepted: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
    withdrawn: "bg-gray-100 text-gray-700",
  };
  const cls = styles[status] ?? "bg-gray-100 text-gray-700";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${cls}`}>
      {status}
    </span>
  );
}
