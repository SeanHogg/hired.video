// eslint-page-chrome: skip - authed app surface - chrome via AppShell; no public SEO/breadcrumbs needed (pre-existing; #1869).
// SourcingBrowse — recruiter-side of the sourcing marketplace. Browse jobs
// that are accepting sourcing bids, see the fee + deadline + terms, place a
// bid with a proposal. See memory: project_bidding_marketplace.

import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Briefcase, DollarSign, Clock, MapPin, Loader2, Send } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useSEO } from "@/lib/seo";
import {
  sourcingBidService,
  type SourcingJobSummary,
} from "@/lib/services/sourcing-bid-service";

export default function SourcingBrowse() {
  const { t } = useTranslation();
  const location = useLocation();
  useSEO(location.pathname, {
    title: "Sourcing Marketplace — hired.video",
    description: "Browse jobs accepting recruiter sourcing bids and place a proposal.",
  });

  const { toast } = useToast();

  const [jobs, setJobs] = useState<SourcingJobSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [bidJob, setBidJob] = useState<SourcingJobSummary | null>(null);
  const [bidAmount, setBidAmount] = useState("");
  const [proposal, setProposal] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    sourcingBidService
      .browseOpenJobs()
      .then((res) => {
        if (!cancelled) setJobs(res.jobs);
      })
      .catch(() => {
        if (!cancelled) setJobs([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const openBid = (job: SourcingJobSummary) => {
    setBidJob(job);
    setBidAmount(job.sourcingFeeCents != null ? (job.sourcingFeeCents / 100).toString() : "");
    setProposal("");
  };

  const submitBid = async () => {
    if (!bidJob) return;
    const amount = Number.parseFloat(bidAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ title: t("errors.enterValidBidAmount"), variant: "destructive" });
      return;
    }
    if (!proposal.trim()) {
      toast({ title: t("errors.addProposal"), variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await sourcingBidService.placeBid(bidJob.id, {
        bidAmount: amount,
        proposalText: proposal.trim(),
      });
      toast({ title: t("messages.bidSubmittedTitle"), description: t("messages.bidSubmittedDesc") });
      setBidJob(null);
    } catch (e) {
      toast({
        title: t("errors.bidFailed"),
        description: (e as Error)?.message ?? t("messages.tryAgain"),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const sortedJobs = useMemo(
    () =>
      [...jobs].sort((a, b) => (b.sourcingFeeCents ?? 0) - (a.sourcingFeeCents ?? 0)),
    [jobs],
  );

  return (
    <AppShell bgClassName="bg-background">
      <div className="p-6">
          <div>
            <div className="mb-6">
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <Briefcase className="w-7 h-7 text-primary" />
                {t("headings.sourcingMarketplace")}
              </h1>
              <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                {t("messages.sourcingMarketplaceIntro")}
              </p>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("status.loadingOpenJobs")}
              </div>
            ) : sortedJobs.length === 0 ? (
              <div className="rounded-lg border bg-muted/30 p-10 text-center">
                <Briefcase className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <h3 className="font-semibold">{t("headings.noOpenSourcingJobs")}</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                  {t("messages.noOpenSourcingJobsDesc")}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sortedJobs.map((job) => {
                  const fee = job.sourcingFeeCents != null ? `$${(job.sourcingFeeCents / 100).toLocaleString()}` : t("labels.openFee");
                  const deadlinePassed = job.sourcingDeadline ? new Date(job.sourcingDeadline) < new Date() : false;
                  return (
                    <Card key={job.id} className={deadlinePassed ? "opacity-60" : ""}>
                      <CardContent className="pt-5 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <Link to={`/jobs/${job.id}`} className="font-semibold hover:underline">
                              {job.title}
                            </Link>
                            <p className="text-xs text-muted-foreground">{job.company ?? t("labels.confidential")}</p>
                          </div>
                          <Badge variant="secondary" className="font-semibold">
                            <DollarSign className="w-3 h-3 mr-0.5" />
                            {fee}
                          </Badge>
                        </div>

                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {(job.location || job.isRemote) && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {job.isRemote ? t("labels.remote") : job.location}
                            </span>
                          )}
                          {job.sourcingDeadline && (
                            <span className="inline-flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {t("labels.bidBy", { date: new Date(job.sourcingDeadline).toLocaleDateString() })}
                              {deadlinePassed && ` ${t("labels.closedSuffix")}`}
                            </span>
                          )}
                        </div>

                        {job.sourcingTerms && (
                          <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                            {job.sourcingTerms}
                          </p>
                        )}

                        <div className="flex justify-end">
                          <Button size="sm" onClick={() => openBid(job)} disabled={deadlinePassed}>
                            <Send className="w-3.5 h-3.5 mr-1" />
                            {t("actions.placeBid")}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
      </div>

      <Dialog open={Boolean(bidJob)} onOpenChange={(open) => !open && setBidJob(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("headings.bidOnJob", { title: bidJob?.title ?? "" })}</DialogTitle>
            <DialogDescription>
              {t("messages.bidDialogDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="sourcing-bid-amount">{t("fields.yourFee.label")}</Label>
              <Input
                id="sourcing-bid-amount"
                type="number"
                step="0.01"
                min="0"
                value={bidAmount}
                onChange={(e) => setBidAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sourcing-proposal">{t("fields.proposal.label")}</Label>
              <Textarea
                id="sourcing-proposal"
                rows={6}
                placeholder={t("fields.proposal.placeholder")}
                value={proposal}
                onChange={(e) => setProposal(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBidJob(null)} disabled={submitting}>
              {t("actions.cancel")}
            </Button>
            <Button onClick={submitBid} disabled={submitting || !proposal.trim()}>
              {submitting ? t("status.submitting") : t("actions.submitBid")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
