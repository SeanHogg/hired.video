// SourcingBrowse — recruiter-side of the sourcing marketplace. Browse jobs
// that are accepting sourcing bids, see the fee + deadline + terms, place a
// bid with a proposal. See memory: project_bidding_marketplace.

import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Briefcase, DollarSign, Clock, MapPin, Loader2, Send } from "lucide-react";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
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
import { useSidebar } from "@/hooks/use-sidebar";
import { useToast } from "@/hooks/use-toast";
import { useSEO } from "@/lib/seo";
import {
  sourcingBidService,
  type SourcingJobSummary,
} from "@/lib/services/sourcing-bid-service";

export default function SourcingBrowse() {
  const location = useLocation();
  useSEO(location.pathname, {
    title: "Sourcing Marketplace | hired.video",
    description: "Browse jobs accepting recruiter sourcing bids and place a proposal.",
  });

  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();
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
      toast({ title: "Enter a valid bid amount", variant: "destructive" });
      return;
    }
    if (!proposal.trim()) {
      toast({ title: "Add a proposal", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      await sourcingBidService.placeBid(bidJob.id, {
        bidAmount: amount,
        proposalText: proposal.trim(),
      });
      toast({ title: "Bid submitted", description: "The hiring company will review your proposal." });
      setBidJob(null);
    } catch (e) {
      toast({
        title: "Bid failed",
        description: (e as Error)?.message ?? "Try again.",
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
    <div className="min-h-screen bg-background">
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} collapsed={sidebarCollapsed} />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation onMenuClick={openSidebar} onSidebarToggle={toggleSidebar} sidebarCollapsed={sidebarCollapsed} />

        <div className="pt-16 p-6">
          <div className="max-w-5xl mx-auto">
            <div className="mb-6">
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <Briefcase className="w-7 h-7 text-primary" />
                Sourcing marketplace
              </h1>
              <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                Companies post jobs with a sourcing fee. Bid to win the assignment;
                the winning recruiter sources candidates and earns the fee on hire.
              </p>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading open jobs…
              </div>
            ) : sortedJobs.length === 0 ? (
              <div className="rounded-lg border bg-muted/30 p-10 text-center">
                <Briefcase className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <h3 className="font-semibold">No open sourcing jobs right now</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                  Check back soon — companies open jobs to external sourcing when they need
                  more pipeline than their in-house team can produce.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sortedJobs.map((job) => {
                  const fee = job.sourcingFeeCents != null ? `$${(job.sourcingFeeCents / 100).toLocaleString()}` : "Open";
                  const deadlinePassed = job.sourcingDeadline ? new Date(job.sourcingDeadline) < new Date() : false;
                  return (
                    <Card key={job.id} className={deadlinePassed ? "opacity-60" : ""}>
                      <CardContent className="pt-5 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <Link to={`/jobs/${job.id}`} className="font-semibold hover:underline">
                              {job.title}
                            </Link>
                            <p className="text-xs text-muted-foreground">{job.company ?? "Confidential"}</p>
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
                              {job.isRemote ? "Remote" : job.location}
                            </span>
                          )}
                          {job.sourcingDeadline && (
                            <span className="inline-flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Bid by {new Date(job.sourcingDeadline).toLocaleDateString()}
                              {deadlinePassed && " (closed)"}
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
                            Place bid
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
        <Footer />
      </div>

      <Dialog open={Boolean(bidJob)} onOpenChange={(open) => !open && setBidJob(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Bid on “{bidJob?.title}”</DialogTitle>
            <DialogDescription>
              Propose your sourcing fee and a short pitch (track record on this kind of role,
              expected timeline, candidate volume).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="sourcing-bid-amount">Your fee ($)</Label>
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
              <Label htmlFor="sourcing-proposal">Proposal</Label>
              <Textarea
                id="sourcing-proposal"
                rows={6}
                placeholder="Why you, how fast, what you'll deliver…"
                value={proposal}
                onChange={(e) => setProposal(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBidJob(null)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={submitBid} disabled={submitting || !proposal.trim()}>
              {submitting ? "Submitting…" : "Submit bid"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
