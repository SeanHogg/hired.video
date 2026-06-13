// GigMarketplace — the gig hub. Browse open briefs and bid; see the briefs you
// posted and the bids you placed. Posting + awarding deliverables wires through
// gig-service (#101). Creators work awarded gigs on Content Creator → Gigs.

import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Briefcase, DollarSign, Clock, Loader2, Send, Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import GigBidDialog from "@/components/gigs/GigBidDialog";
import { useSEO } from "@/lib/seo";
import { gigService, type GigProject, type GigBid } from "@/lib/services/gig-service";

type View = "browse" | "posted" | "bids";

const money = (cents: number) => `$${(cents / 100).toLocaleString()}`;

const BID_STATUS_BADGE: Record<string, string> = {
  submitted: "bg-blue-100 text-blue-700",
  awarded: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  withdrawn: "bg-gray-100 text-gray-700",
};

export default function GigMarketplace() {
  const location = useLocation();
  useSEO(location.pathname, {
    title: "Gig Marketplace — hired.video",
    description: "Browse open gigs and bid, or post a brief for content creators.",
  });
  const [view, setView] = useState<View>("browse");
  const [open, setOpen] = useState<GigProject[]>([]);
  const [mine, setMine] = useState<GigProject[]>([]);
  const [myBids, setMyBids] = useState<{ bid: GigBid; project: GigProject }[]>([]);
  const [loading, setLoading] = useState(true);
  const [bidProject, setBidProject] = useState<GigProject | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      gigService.listOpen().catch(() => []),
      gigService.listMine().catch(() => []),
      gigService.listMyBids().catch(() => []),
    ])
      .then(([o, m, b]) => {
        if (cancelled) return;
        setOpen(o);
        setMine(m);
        setMyBids(b);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshMyBids = async () => setMyBids(await gigService.listMyBids().catch(() => myBids));

  const sortedOpen = useMemo(() => [...open].sort((a, b) => b.budgetMaxCents - a.budgetMaxCents), [open]);

  const TABS: { key: View; label: string; count: number }[] = [
    { key: "browse", label: "Browse", count: open.length },
    { key: "posted", label: "My posted gigs", count: mine.length },
    { key: "bids", label: "My bids", count: myBids.length },
  ];

  return (
    <AppShell bgClassName="bg-background">
      <div className="p-6 space-y-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Briefcase className="w-7 h-7 text-primary" />
              Gig marketplace
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Post a brief with deliverables for content creators to bid on — or browse open gigs and place your own bid.
            </p>
          </div>
          <Link to="/gigs/new">
            <Button>
              <Plus className="w-4 h-4 mr-1" /> Post a gig
            </Button>
          </Link>
        </div>

        <div className="flex gap-1 border-b">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setView(tab.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                view === tab.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label} <span className="text-xs text-muted-foreground">({tab.count})</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : view === "browse" ? (
          sortedOpen.length === 0 ? (
            <EmptyState title="No open gigs" body="Be the first to post a brief for creators." />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sortedOpen.map((p) => (
                <Card key={p.id}>
                  <CardContent className="pt-5 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <Link to={`/gigs/${p.id}`} className="font-semibold hover:underline">
                        {p.title}
                      </Link>
                      <Badge variant="secondary" className="font-semibold whitespace-nowrap">
                        <DollarSign className="w-3 h-3 mr-0.5" />
                        {money(p.budgetMinCents)}–{money(p.budgetMaxCents)}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">{p.description}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {p.estimatedDurationDays && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" />~{p.estimatedDurationDays} days
                        </span>
                      )}
                      {p.requiredSkills.slice(0, 4).map((s) => (
                        <Badge key={s} variant="outline" className="text-[10px]">
                          {s}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex justify-end">
                      <Button size="sm" onClick={() => setBidProject(p)}>
                        <Send className="w-3.5 h-3.5 mr-1" /> Place bid
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )
        ) : view === "posted" ? (
          mine.length === 0 ? (
            <EmptyState title="You haven't posted any gigs" body="Post a brief and creators will bid on it." />
          ) : (
            <div className="space-y-2">
              {mine.map((p) => (
                <Link key={p.id} to={`/gigs/${p.id}`}>
                  <Card className="hover:border-primary/40 transition-colors">
                    <CardContent className="py-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium">{p.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {money(p.budgetMinCents)}–{money(p.budgetMaxCents)}
                        </div>
                      </div>
                      <Badge variant="secondary">{p.status.replace("_", " ")}</Badge>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )
        ) : myBids.length === 0 ? (
          <EmptyState title="No bids yet" body="Browse open gigs and place a bid to get started." />
        ) : (
          <div className="space-y-2">
            {myBids.map(({ bid, project }) => (
              <Link key={bid.id} to={`/gigs/${project.id}`}>
                <Card className="hover:border-primary/40 transition-colors">
                  <CardContent className="py-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">{project.title}</div>
                      <div className="text-xs text-muted-foreground">Your bid: {money(bid.proposedAmountCents)}</div>
                    </div>
                    <Badge variant="secondary" className={BID_STATUS_BADGE[bid.status] ?? ""}>
                      {bid.status}
                    </Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
            </div>
          )}
      </div>

      <GigBidDialog project={bidProject} onOpenChange={() => setBidProject(null)} onBidPlaced={refreshMyBids} />
    </AppShell>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-10 text-center">
      <Briefcase className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
      <h3 className="font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">{body}</p>
    </div>
  );
}
