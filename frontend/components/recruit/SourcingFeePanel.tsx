// SourcingFeePanel — owner-only widget on the JobDetail Overview tab. Lets
// the company toggle "open this job to recruiter sourcing bids", set a fee
// + deadline + terms, and review/accept/reject incoming bids.
//
// See memory: project_bidding_marketplace.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
      toast({ title: t("messages.sourcingConfigSaved") });
    } catch (e) {
      toast({
        title: t("errors.saveFailed"),
        description: (e as Error)?.message ?? t("errors.tryAgain"),
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
      toast({ title: t("messages.bidAccepted"), description: t("messages.bidAcceptedDesc") });
    } catch (e) {
      toast({ title: t("errors.acceptBidFailed"), description: (e as Error)?.message, variant: "destructive" });
    }
  };

  const handleRejectBid = async (bidId: string) => {
    try {
      await sourcingBidService.reject(bidId);
      setBids((prev) => prev?.map((b) => (b.id === bidId ? { ...b, status: "rejected" } : b)) ?? null);
      toast({ title: t("messages.bidRejected") });
    } catch (e) {
      toast({ title: t("errors.rejectBidFailed"), description: (e as Error)?.message, variant: "destructive" });
    }
  };

  if (configLoading) {
    return (
      <Card className="border-primary/30">
        <CardContent className="pt-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t("status.loadingSourcing")}
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
              {t("headings.recruiterSourcingMarketplace")}
            </h3>
            <p className="text-xs text-muted-foreground max-w-xl">
              {t("messages.recruiterSourcingDesc")}
            </p>
          </div>
          <Switch checked={accepts} onCheckedChange={setAccepts} />
        </div>

        {accepts && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="sourcing-fee">{t("fields.sourcingFee.label")}</Label>
              <Input
                id="sourcing-fee"
                type="number"
                step="0.01"
                min="0"
                placeholder={t("fields.sourcingFee.placeholder")}
                value={feeDollars}
                onChange={(e) => setFeeDollars(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                {t("messages.feeOneTimeNote")}
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="sourcing-deadline">{t("fields.sourcingDeadline.label")}</Label>
              <Input
                id="sourcing-deadline"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                {t("messages.bidsBlockedAfterDeadline")}
              </p>
            </div>
            <div className="sm:col-span-2 space-y-1">
              <Label htmlFor="sourcing-terms">{t("fields.sourcingTerms.label")}</Label>
              <Textarea
                id="sourcing-terms"
                rows={3}
                placeholder={t("fields.sourcingTerms.placeholder")}
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
                {t("status.saving")}
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-1" />
                {t("actions.save")}
              </>
            )}
          </Button>
        </div>

        {accepts && (
          <div className="border-t pt-4 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-sm">{t("headings.incomingBids")}</h4>
              {bids && (
                <span className="text-xs text-muted-foreground">
                  {t("labels.totalBids", { count: bids.length })}
                </span>
              )}
            </div>

            {loadingBids ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {t("status.loadingBids")}
              </div>
            ) : !bids || bids.length === 0 ? (
              <div className="rounded border border-dashed p-6 text-center text-xs text-muted-foreground">
                {t("messages.noBidsYetDesc")}
              </div>
            ) : (
              <div className="space-y-2">
                {bids.map((bid) => (
                  <div key={bid.id} className="rounded border p-3 bg-card text-sm space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-0.5">
                        <p className="font-semibold">
                          {t("labels.feeAmountWithDuration", {
                            amount: Number(bid.bidAmount).toLocaleString(),
                            days: bid.durationDays,
                          })}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {t("labels.bidder", {
                            id: bid.bidderId.slice(0, 8),
                            date: new Date(bid.createdAt).toLocaleDateString(),
                          })}
                        </p>
                      </div>
                      <StatusPill status={bid.status} label={t(`labels.bidStatus.${bid.status}`, bid.status)} />
                    </div>
                    {bid.proposalText && (
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap">{bid.proposalText}</p>
                    )}
                    {bid.status === "pending" && (
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => handleRejectBid(bid.id)}>
                          <ThumbsDown className="w-3.5 h-3.5 mr-1" />
                          {t("actions.reject")}
                        </Button>
                        <Button size="sm" onClick={() => handleAcceptBid(bid.id)}>
                          <ThumbsUp className="w-3.5 h-3.5 mr-1" />
                          {t("actions.accept")}
                        </Button>
                      </div>
                    )}
                    {bid.status === "rejected" && bid.rejectionReason && (
                      <p className="text-[11px] text-muted-foreground italic">
                        {t("labels.rejectedReason", { reason: bid.rejectionReason })}
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

function StatusPill({ status, label }: { status: string; label: string }) {
  const styles: Record<string, string> = {
    pending: "bg-accent text-accent-foreground",
    accepted: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
    withdrawn: "bg-muted text-muted-foreground",
  };
  const cls = styles[status] ?? "bg-muted text-muted-foreground";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${cls}`}>
      {label}
    </span>
  );
}
