/**
 * Job seeker's points hub. Balance, streak, badges, activity feed,
 * redemption catalog. Phase-1: redemption shows the catalog but the
 * action button surfaces "coming soon" because the backend returns 501
 * until phase 3.
 *
 * Self-gates on role inside the component (per
 * [[feedback_extract_on_duplication]] — no canViewPoints prop-drill);
 * non-job_seekers see a friendly notice and a link back to dashboard.
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Navigate } from "react-router-dom";
import {
  Flame,
  Trophy,
  Sparkles,
  Gift,
  CreditCard,
  Calendar,
  Lock,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  pointsService,
  isPointsEligible,
  type PointsCatalog,
  type PointsRedemption,
  type PointsSummary,
} from "@/lib/services/points-service";

export default function PointsPage() {
  const { user } = useAuth();
  const isEligible = isPointsEligible(user);

  const summary = useQuery<PointsSummary>({
    queryKey: ["points", "me"],
    queryFn: () => pointsService.getMe(),
    enabled: isEligible,
  });

  const catalog = useQuery<PointsCatalog>({
    queryKey: ["points", "catalog"],
    queryFn: () => pointsService.getCatalog(),
    enabled: isEligible,
  });

  if (!user) return <Navigate to="/login" replace />;
  if (!isEligible) {
    return (
      <div className="container mx-auto max-w-3xl py-12 px-4">
        <Card className="p-8 text-center">
          <Sparkles className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Points are coming for your role</h2>
          <p className="text-muted-foreground">
            The rewards program launches first for job seekers. Your role's
            catalog is in the works — check back soon.
          </p>
        </Card>
      </div>
    );
  }

  if (summary.isLoading || !summary.data) {
    return (
      <div className="container mx-auto max-w-5xl py-12 px-4 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const data = summary.data;

  return (
    <div className="container mx-auto max-w-5xl py-8 px-4 space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Points & Rewards</h1>
        <p className="text-muted-foreground mt-1">
          Earn for every step of your job hunt. Cash out for AI credits, premium time, or gift cards.
        </p>
      </header>

      {data.isSuspended && (
        <Card className="p-4 border-amber-500 bg-amber-50 dark:bg-amber-950/30">
          <div className="flex items-start gap-3">
            <Lock className="h-5 w-5 text-amber-600 mt-0.5" />
            <div>
              <div className="font-semibold">Points paused for review</div>
              <p className="text-sm text-muted-foreground mt-1">
                {data.suspendedReason ?? "Our system flagged unusual activity. Earning and redemption are paused until support reviews your account."}
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-5">
          <div className="text-xs uppercase text-muted-foreground tracking-wide">Balance</div>
          <div className="text-3xl font-bold tabular-nums mt-1">{data.balance.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-2">
            {data.lifetimeEarned.toLocaleString()} earned · {data.lifetimeRedeemed.toLocaleString()} redeemed
          </div>
        </Card>

        <Card className="p-5">
          <div className="text-xs uppercase text-muted-foreground tracking-wide flex items-center gap-1">
            <Flame className="h-3.5 w-3.5" /> Streak
          </div>
          <div className="text-3xl font-bold tabular-nums mt-1">
            {data.streak.current} <span className="text-base font-normal text-muted-foreground">days</span>
          </div>
          <div className="text-xs text-muted-foreground mt-2">
            Longest: {data.streak.longest} days · Last active: {data.streak.lastActivityDate ?? "—"}
          </div>
        </Card>

        <Card className="p-5">
          <div className="text-xs uppercase text-muted-foreground tracking-wide flex items-center gap-1">
            <Trophy className="h-3.5 w-3.5" /> Badges
          </div>
          <div className="text-3xl font-bold tabular-nums mt-1">
            {data.badges.filter((b) => b.earned).length}
            <span className="text-base font-normal text-muted-foreground"> / {data.badges.length}</span>
          </div>
          <UserTaskGateRow gate={data.userTaskGate} />
        </Card>
      </div>

      <BadgesGrid badges={data.badges} />
      <RedemptionGrid catalog={catalog.data ?? null} balance={data.balance} disabled={data.isSuspended} />
      <ActivityFeed activity={data.recentActivity} />
    </div>
  );
}

function UserTaskGateRow({ gate }: { gate: PointsSummary["userTaskGate"] }) {
  if (gate.unlocked) {
    return (
      <div className="text-xs text-green-600 dark:text-green-400 mt-2">
        ✓ Self-task earnings unlocked
      </div>
    );
  }
  const pct = Math.min(100, Math.round((gate.completed / gate.threshold) * 100));
  return (
    <div className="text-xs text-muted-foreground mt-2 space-y-1">
      <div className="flex justify-between">
        <span>Self-task gate</span>
        <span className="tabular-nums">{gate.completed}/{gate.threshold}</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function BadgesGrid({ badges }: { badges: PointsSummary["badges"] }) {
  return (
    <Card className="p-5">
      <h2 className="font-semibold mb-3 flex items-center gap-2">
        <Trophy className="h-4 w-4" /> Badges
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {badges.map((b) => (
          <div
            key={b.id}
            className={`p-3 rounded-lg border ${b.earned ? "border-primary bg-primary/5" : "border-border opacity-50"}`}
          >
            <div className="font-medium text-sm">{b.name}</div>
            <div className="text-xs text-muted-foreground mt-1">{b.description}</div>
            {b.earned && b.earnedAt && (
              <div className="text-[10px] text-muted-foreground mt-2">
                {new Date(b.earnedAt).toLocaleDateString()}
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function RedemptionGrid({
  catalog,
  balance,
  disabled,
}: {
  catalog: PointsCatalog | null;
  balance: number;
  disabled: boolean;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [redeeming, setRedeeming] = useState<string | null>(null);
  const [giftCardSku, setGiftCardSku] = useState<PointsRedemption | null>(null);

  if (!catalog) return null;

  async function executeRedeem(skuId: string, recipient?: { name: string; email: string }) {
    setRedeeming(skuId);
    try {
      const res = await pointsService.redeem({
        skuId,
        recipientName: recipient?.name,
        recipientEmail: recipient?.email,
      });
      if (res.status === "fulfilled") {
        toast.success("Redemption fulfilled.");
      } else if (res.status === "queued") {
        toast.success("Gift card on the way.", {
          description: "Tremendous will deliver to your email within minutes.",
        });
      } else if (res.status === "pending_kyc") {
        toast.message("Tax info required.", {
          description: "You've crossed the $599 reporting threshold; support will reach out before dispatch.",
        });
      }
      qc.invalidateQueries({ queryKey: ["points"] });
      setGiftCardSku(null);
    } catch (e) {
      const err = e as { message?: string };
      toast.error("Redemption failed.", { description: err.message ?? String(e) });
    } finally {
      setRedeeming(null);
    }
  }

  function handleRedeemClick(sku: PointsRedemption) {
    if (sku.kind === "gift_card") {
      setGiftCardSku(sku);
    } else {
      void executeRedeem(sku.id);
    }
  }

  const groups: Array<{ kind: PointsCatalog["redemptions"][number]["kind"]; label: string; icon: typeof Sparkles }> = [
    { kind: "ai_credits", label: "AI Credits", icon: Sparkles },
    { kind: "premium_month", label: "Premium Time", icon: Calendar },
    { kind: "gift_card", label: "Gift Cards", icon: Gift },
  ];

  return (
    <Card className="p-5">
      <h2 className="font-semibold mb-1 flex items-center gap-2">
        <CreditCard className="h-4 w-4" /> Cash out
      </h2>
      <p className="text-xs text-muted-foreground mb-4">
        Convert points to AI credits, a free month of Pro, or a Tremendous gift card.
      </p>
      <div className="space-y-5">
        {groups.map(({ kind, label, icon: Icon }) => {
          const items = catalog.redemptions.filter((r) => r.kind === kind);
          if (items.length === 0) return null;
          return (
            <div key={kind}>
              <div className="text-sm font-medium mb-2 flex items-center gap-2">
                <Icon className="h-4 w-4" /> {label}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {items.map((sku) => {
                  const affordable = balance >= sku.pointsCost;
                  return (
                    <div
                      key={sku.id}
                      className={`p-3 rounded-lg border ${affordable ? "border-border" : "border-border opacity-60"}`}
                    >
                      <div className="font-medium text-sm">{sku.label}</div>
                      <div className="text-xs text-muted-foreground tabular-nums mt-1">
                        {sku.pointsCost.toLocaleString()} pts
                      </div>
                      <Button
                        size="sm"
                        variant={affordable ? "default" : "outline"}
                        className="mt-2 w-full"
                        disabled={disabled || !affordable || redeeming === sku.id}
                        onClick={() => handleRedeemClick(sku)}
                      >
                        {redeeming === sku.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Redeem"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <GiftCardDialog
        sku={giftCardSku}
        defaultEmail={user?.email ?? ""}
        defaultName={user?.name ?? ""}
        busy={!!redeeming}
        onCancel={() => setGiftCardSku(null)}
        onConfirm={(name, email) => giftCardSku && executeRedeem(giftCardSku.id, { name, email })}
      />
    </Card>
  );
}

function GiftCardDialog({
  sku,
  defaultName,
  defaultEmail,
  busy,
  onCancel,
  onConfirm,
}: {
  sku: PointsRedemption | null;
  defaultName: string;
  defaultEmail: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (name: string, email: string) => void;
}) {
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);

  return (
    <Dialog open={!!sku} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send {sku?.label}</DialogTitle>
          <DialogDescription>
            Tremendous emails the gift card to the recipient below. The card lets them choose
            from a catalog (Amazon, Visa, Target, and more).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="gc-name">Recipient name</Label>
            <Input id="gc-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="gc-email">Recipient email</Label>
            <Input id="gc-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">
            Reminder: redemptions over $599/year require a W-9 for IRS reporting. We'll reach out before
            dispatch if you cross the threshold.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(name, email)}
            disabled={busy || !name.trim() || !email.includes("@")}
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Send gift card"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ActivityFeed({ activity }: { activity: PointsSummary["recentActivity"] }) {
  return (
    <Card className="p-5">
      <h2 className="font-semibold mb-3">Recent activity</h2>
      {activity.length === 0 ? (
        <p className="text-sm text-muted-foreground">No activity yet — complete a task to start earning.</p>
      ) : (
        <ul className="space-y-2">
          {activity.map((a) => (
            <li key={a.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border last:border-0">
              <div>
                <div className="font-medium">{a.label}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(a.at).toLocaleString()} · {a.category}
                </div>
              </div>
              <div className={`font-semibold tabular-nums ${a.delta > 0 ? "text-green-600" : a.delta < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                {a.delta > 0 ? "+" : ""}
                {a.delta}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
