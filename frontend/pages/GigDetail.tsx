// GigDetail — a single brief: its deliverable items + (for the poster) the bids
// to award and the escrow controls (approve → release) per item. Non-owners on
// an open gig get a Place-bid CTA. Awarded items become the winner's task board
// (Content Creator → Gigs).

import { useCallback, useEffect, useState } from "react";
import { useParams, useLocation, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Briefcase, Loader2, Check, X, DollarSign, Send } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import GigBidDialog from "@/components/gigs/GigBidDialog";
import MilestoneDisputePanel from "@/components/gigs/MilestoneDisputePanel";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useSEO } from "@/lib/seo";
import {
  gigService,
  type GigProject,
  type GigMilestone,
  type GigBidWithBidder,
  type GigMilestoneStatus,
} from "@/lib/services/gig-service";

const money = (cents: number) => `$${(cents / 100).toLocaleString()}`;

const MILESTONE_BADGE: Record<GigMilestoneStatus, string> = {
  pending: "bg-muted text-foreground/80",
  in_progress: "bg-amber-100 text-amber-700",
  submitted: "bg-accent text-primary",
  approved: "bg-sky-100 text-sky-700",
  disputed: "bg-red-100 text-red-700",
  released: "bg-green-100 text-green-700",
  refunded: "bg-amber-100 text-amber-700",
};

// Milestone states from which either party may open a dispute.
const DISPUTABLE = new Set(["in_progress", "submitted", "approved"]);

export default function GigDetail() {
  const { id = "" } = useParams();
  const location = useLocation();
  const { t } = useTranslation();
  useSEO(location.pathname, { title: t("gigs.detail.seoTitle"), description: t("gigs.detail.seoDescription") });
  const { user, isSuperAdmin } = useAuth();
  const { toast } = useToast();

  const [project, setProject] = useState<GigProject | null>(null);
  const [milestones, setMilestones] = useState<GigMilestone[]>([]);
  const [bids, setBids] = useState<GigBidWithBidder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showBid, setShowBid] = useState(false);

  const isOwner = Boolean(project && user && project.ownerUserId === user.id);

  const load = useCallback(async () => {
    const { project: p, milestones: m } = await gigService.getProject(id);
    setProject(p);
    setMilestones(m);
    if (user && p.ownerUserId === user.id) {
      setBids(await gigService.listBids(id).catch(() => []));
    }
  }, [id, user]);

  useEffect(() => {
    let cancelled = false;
    load()
      .catch(() => {
        if (!cancelled) setProject(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusyId(key);
    try {
      await fn();
      await load();
      toast({ title: ok });
    } catch (e) {
      toast({ title: t("gigs.detail.actionFailed"), description: e instanceof Error ? e.message : t("gigs.common.tryAgain"), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const openDispute = (milestoneId: string) => {
    const reason = window.prompt(t("gigs.detail.disputePrompt", "Describe the problem with this milestone (the other party + a mediator will see it):"));
    if (reason == null || reason.trim().length < 10) {
      if (reason != null) toast({ title: t("gigs.detail.disputeTooShort", "Please add a bit more detail (10+ characters)."), variant: "destructive" });
      return;
    }
    void run(milestoneId, () => gigService.openDispute(milestoneId, reason.trim()), t("gigs.detail.disputeOpened", "Dispute opened"));
  };

  if (loading) {
    return (
      <AppShell bgClassName="bg-background">
        <div className="p-6 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> {t("gigs.detail.loading")}
        </div>
      </AppShell>
    );
  }

  if (!project) {
    return (
      <AppShell bgClassName="bg-background">
        <div className="p-6">
          <div className="rounded-lg border bg-muted/30 p-10 text-center">
            <h3 className="font-semibold">{t("gigs.detail.notFound")}</h3>
            <Link to="/services/gigs" className="text-sm text-primary hover:underline mt-2 inline-block">
              {t("gigs.detail.back")}
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  const canBid = !isOwner && project.status === "open";

  return (
    <AppShell bgClassName="bg-background">
      <div className="p-6 max-w-3xl mx-auto space-y-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Briefcase className="w-6 h-6 text-primary" />
              {project.title}
            </h1>
            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
              <Badge variant="secondary">{project.status.replace("_", " ")}</Badge>
              <span>
                {money(project.budgetMinCents)}–{money(project.budgetMaxCents)} · {project.budgetKind}
              </span>
            </div>
          </div>
          {canBid && (
            <Button onClick={() => setShowBid(true)}>
              <Send className="w-4 h-4 mr-1" /> {t("gigs.detail.placeBid")}
            </Button>
          )}
        </div>

        <p className="text-sm whitespace-pre-wrap">{project.description}</p>
        {project.requiredSkills.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {project.requiredSkills.map((s) => (
              <Badge key={s} variant="outline">
                {s}
              </Badge>
            ))}
          </div>
        )}

        {/* Deliverable items / escrow milestones */}
        <div className="space-y-2">
          <h2 className="font-semibold">{t("gigs.detail.deliverables")}</h2>
          {milestones.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("gigs.detail.noItems")}</p>
          ) : (
            milestones.map((m) => (
              <Card key={m.id}>
                <CardContent className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        {m.title}
                        <Badge variant="secondary" className={MILESTONE_BADGE[m.status]}>
                          {m.status.replace("_", " ")}
                        </Badge>
                      </div>
                      {m.description && <div className="text-xs text-muted-foreground mt-0.5">{m.description}</div>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-semibold inline-flex items-center">
                        <DollarSign className="w-3 h-3" />
                        {money(m.amountCents)}
                      </span>
                      {isOwner && m.status === "submitted" && (
                        <Button size="sm" disabled={busyId === m.id} onClick={() => run(m.id, () => gigService.approveMilestone(m.id), t("gigs.detail.approved"))}>
                          <Check className="w-3.5 h-3.5 mr-1" /> {t("gigs.detail.approve")}
                        </Button>
                      )}
                      {isOwner && m.status === "approved" && (
                        <Button size="sm" variant="default" disabled={busyId === m.id} onClick={() => run(m.id, () => gigService.releaseMilestone(m.id), t("gigs.detail.released"))}>
                          {t("gigs.detail.release", { amount: `$${(m.amountCents / 100).toLocaleString()}` })}
                        </Button>
                      )}
                      {/* Either participant may dispute an in-flight milestone (#1768).
                          The API authorises (poster / awarded creator only). */}
                      {user && DISPUTABLE.has(m.status) && (
                        <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" disabled={busyId === m.id} onClick={() => openDispute(m.id)}>
                          {t("gigs.detail.dispute", "Dispute")}
                        </Button>
                      )}
                    </div>
                  </div>
                  {m.status === "disputed" && (
                    <MilestoneDisputePanel milestoneId={m.id} isMediator={isSuperAdmin} onResolved={load} />
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Bids — owner only */}
        {isOwner && (
          <div className="space-y-2">
            <h2 className="font-semibold">{t("gigs.detail.bids", { count: bids.length })}</h2>
            {bids.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("gigs.detail.noBids")}</p>
            ) : (
              bids.map(({ bid, bidderName }) => (
                <Card key={bid.id}>
                  <CardContent className="py-3 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium">{bidderName ?? t("gigs.detail.creator")}</div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="font-semibold">
                          {money(bid.proposedAmountCents)}
                        </Badge>
                        <Badge variant="outline">{bid.status}</Badge>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap">{bid.coverLetter}</p>
                    {project.status === "open" && bid.status === "submitted" && (
                      <div className="flex justify-end">
                        <Button size="sm" disabled={busyId === bid.id} onClick={() => run(bid.id, () => gigService.award(bid.id), t("gigs.detail.awarded"))}>
                          <Check className="w-3.5 h-3.5 mr-1" /> {t("gigs.detail.awardBid")}
                        </Button>
                      </div>
                    )}
                    {bid.status === "rejected" && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <X className="w-3 h-3" /> {t("gigs.detail.notSelected")}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}
      </div>

      <GigBidDialog project={showBid ? project : null} onOpenChange={() => setShowBid(false)} onBidPlaced={load} />
    </AppShell>
  );
}
