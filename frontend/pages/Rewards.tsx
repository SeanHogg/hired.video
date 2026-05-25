/**
 * /rewards — public article-style guide to the gamification program.
 * Surfaces every badge the user could earn (incentive), explains how
 * points work, walks through cashout, and answers FAQs. Indexable;
 * uses only public endpoints (`/api/points/badges` + `/api/points/catalog`)
 * so it works for anonymous visitors.
 *
 * Logged-in eligible users get a small "Your progress" banner that
 * links to /points + /settings?tab=points so existing users can jump
 * to their personal view from the guide.
 */

import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Award,
  Coins,
  CreditCard,
  Flame,
  Gift,
  Loader2,
  Lock,
  Megaphone,
  ShieldCheck,
  Sparkles,
  Trophy,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  BadgesGallery,
  type BadgeGalleryItem,
} from "@/components/badges/BadgesGallery";
import {
  isPointsEligible,
  pointsService,
  type PointsCatalog,
  type ShowcaseBadge,
} from "@/lib/services/points-service";

const ROLE_LABELS: Record<string, string> = {
  job_seeker: "Job seeker",
  recruiter: "Recruiter",
  employer: "Employer",
};

function showcaseBadgeToGalleryItem(b: ShowcaseBadge): BadgeGalleryItem {
  // The gallery already accepts the per-user shape with earn fields;
  // in showcase mode it ignores them, so we feed sentinel values.
  return {
    id: b.id,
    slug: b.slug,
    name: b.name,
    description: b.description,
    tier: b.tier,
    iconKey: b.iconKey,
    earned: false,
    earnedAt: null,
    earnCount: 0,
    earnedHistory: [],
    isRepeatable: b.isRepeatable,
  };
}

export default function RewardsPage() {
  const { user } = useAuth();
  const eligible = isPointsEligible(user);

  const badges = useQuery<ShowcaseBadge[]>({
    queryKey: ["points", "showcase-badges"],
    queryFn: () => pointsService.listAllBadges(),
    staleTime: 5 * 60 * 1000,
  });

  const catalog = useQuery<PointsCatalog>({
    queryKey: ["points", "catalog"],
    queryFn: () => pointsService.getCatalog(),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <article className="container mx-auto max-w-4xl py-10 px-4">
      <header className="space-y-3 mb-10 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
          <Sparkles className="h-3.5 w-3.5" /> hired.video Rewards
        </div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
          Earn points. Win badges. Cash out.
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Every meaningful step on hired.video earns you points — applications,
          tailored resumes, daily streaks, posts to the feed. Trade them for AI credits,
          a free month of Pro, or a real-world gift card.
        </p>
        {user && eligible && (
          <div className="flex items-center justify-center gap-2 pt-3">
            <Button asChild>
              <Link to="/points">See my points</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/settings?tab=points">Cash out</Link>
            </Button>
          </div>
        )}
      </header>

      {/* ── Badges showcase ─────────────────────────────────────── */}
      <Section icon={<Trophy className="h-5 w-5" />} title="Badges you can win">
        <p className="text-muted-foreground mb-5">
          Earn a badge for each milestone — some unlock once, others (like streak rungs)
          you can win every time you rebuild them. Each badge pays a one-time points
          bonus when you unlock it.
        </p>
        {badges.isLoading || !badges.data ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <BadgesGallery
            badges={badges.data.map(showcaseBadgeToGalleryItem)}
            showcaseMode
            title=""
            card={false}
          />
        )}
      </Section>

      {/* ── Earning ─────────────────────────────────────────────── */}
      <Section icon={<Coins className="h-5 w-5" />} title="How you earn points">
        <p className="text-muted-foreground mb-5">
          Every action below earns its base point value. Daily caps keep things fair —
          once you hit the cap for a specific action, that action still counts toward your
          streak even though the points are paused for the day.
        </p>
        {catalog.isLoading || !catalog.data ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Who it's for</TableHead>
                  <TableHead className="text-right">Points</TableHead>
                  <TableHead className="text-right">Daily cap</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {catalog.data.actions
                  .filter((a) => !a.key.startsWith("streak.") && !a.key.startsWith("badge.") && !a.key.startsWith("admin."))
                  .map((a) => (
                    <TableRow key={a.key}>
                      <TableCell>
                        <div className="font-medium">{a.label}</div>
                        <div className="text-xs text-muted-foreground font-mono mt-0.5">{a.key}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {a.roles.length === 0
                          ? "Everyone"
                          : a.roles.map((r) => ROLE_LABELS[r] ?? r).join(" · ")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        +{a.points}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {a.dailyCapPoints ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </Card>
        )}
        <Callout
          tone="info"
          icon={<ShieldCheck className="h-4 w-4" />}
          title="One anti-gaming rule"
        >
          Self-created tasks don't earn points until you've closed 100 of them. System
          tasks (onboarding, AI-generated suggestions) always pay. This stops anyone from
          farming the system by spinning up fake to-dos and closing them.
        </Callout>
      </Section>

      {/* ── Streaks ─────────────────────────────────────────────── */}
      <Section icon={<Flame className="h-5 w-5 text-orange-500" />} title="Streaks">
        <p className="text-muted-foreground mb-5">
          Show up daily and your streak grows. Hit a milestone — 7, 14, 30, 60, 90 days —
          and you earn a repeatable streak badge plus a points bonus. Skip a day and the
          streak resets to one, but every milestone is winnable again the next time you
          rebuild.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {STREAK_MILESTONES.map((m) => (
            <Card key={m.day} className="p-4 text-center">
              <Flame
                className={`h-6 w-6 mx-auto mb-2 ${
                  m.day >= 60 ? "text-amber-500" : m.day >= 30 ? "text-orange-500" : "text-orange-400"
                }`}
              />
              <div className="text-2xl font-bold">{m.day}</div>
              <div className="text-xs text-muted-foreground">days</div>
              <div className="text-xs font-medium mt-2">+{m.bonus} pts</div>
              <div className="text-[10px] text-muted-foreground">{m.name}</div>
            </Card>
          ))}
        </div>
      </Section>

      {/* ── Cashout ─────────────────────────────────────────────── */}
      <Section icon={<CreditCard className="h-5 w-5" />} title="Cash out your points">
        <p className="text-muted-foreground mb-5">
          Three ways to spend what you earn. AI credits and Pro time fulfill instantly;
          gift cards dispatch through Tremendous within minutes (or after a short
          review if you cross IRS reporting thresholds).
        </p>
        {catalog.isLoading || !catalog.data ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <CashoutColumn
              icon={<Sparkles className="h-5 w-5" />}
              title="AI Credits"
              subtitle="Top up your token wallet"
              items={catalog.data.redemptions.filter((r) => r.kind === "ai_credits")}
            />
            <CashoutColumn
              icon={<Award className="h-5 w-5" />}
              title="Premium Time"
              subtitle="Free month of Pro"
              items={catalog.data.redemptions.filter((r) => r.kind === "premium_month")}
            />
            <CashoutColumn
              icon={<Gift className="h-5 w-5" />}
              title="Gift Cards"
              subtitle="Amazon, Visa, Target & more"
              items={catalog.data.redemptions.filter((r) => r.kind === "gift_card")}
            />
          </div>
        )}
        <Callout
          tone="warn"
          icon={<Lock className="h-4 w-4" />}
          title="Tax reporting at $599 / year"
        >
          The IRS treats earned rewards as income for non-employees. Once your gift-card
          redemptions cross $599 in a calendar year, we'll ask you to file a W-9 before
          dispatching the next one. AI credits and premium-month grants count toward the
          same threshold.
        </Callout>
      </Section>

      {/* ── FAQ ─────────────────────────────────────────────────── */}
      <Section icon={<Megaphone className="h-5 w-5" />} title="Frequently asked">
        <Accordion type="single" collapsible className="w-full">
          {FAQ.map((qa) => (
            <AccordionItem value={qa.q} key={qa.q}>
              <AccordionTrigger className="text-left">{qa.q}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{qa.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Section>

      {/* ── CTA ─────────────────────────────────────────────────── */}
      <Card className="p-8 mt-12 text-center bg-gradient-to-br from-primary/10 via-primary/5 to-background">
        <Trophy className="h-10 w-10 mx-auto text-primary mb-3" />
        <h2 className="text-2xl font-bold mb-2">Start earning today</h2>
        <p className="text-muted-foreground mb-5 max-w-xl mx-auto">
          Sign in to track your balance, see your badges, and cash out the moment you hit
          a redemption tier.
        </p>
        <div className="flex items-center justify-center gap-2">
          {user ? (
            <Button asChild>
              <Link to="/points">Go to my points</Link>
            </Button>
          ) : (
            <>
              <Button asChild>
                <Link to="/signup">Sign up free</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/login">Sign in</Link>
              </Button>
            </>
          )}
        </div>
      </Card>
    </article>
  );
}

// ── Building blocks ───────────────────────────────────────────────────

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-12">
      <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
        {icon} {title}
      </h2>
      {children}
    </section>
  );
}

function Callout({
  tone,
  icon,
  title,
  children,
}: {
  tone: "info" | "warn";
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  const className =
    tone === "warn"
      ? "border-amber-500/40 bg-amber-50 dark:bg-amber-950/30"
      : "border-primary/30 bg-primary/5";
  return (
    <Card className={`p-4 mt-4 ${className}`}>
      <div className="flex items-start gap-3">
        <div className={tone === "warn" ? "text-amber-600" : "text-primary"}>{icon}</div>
        <div>
          <div className="font-semibold mb-1">{title}</div>
          <div className="text-sm text-muted-foreground">{children}</div>
        </div>
      </div>
    </Card>
  );
}

function CashoutColumn({
  icon,
  title,
  subtitle,
  items,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  items: PointsCatalog["redemptions"];
}) {
  if (items.length === 0) return null;
  return (
    <Card className="p-5 h-full">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <h3 className="font-semibold">{title}</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">{subtitle}</p>
      <ul className="space-y-2">
        {items.map((sku) => (
          <li
            key={sku.id}
            className="flex items-center justify-between text-sm py-1 border-b border-border last:border-0"
          >
            <span>{sku.label}</span>
            <span className="tabular-nums text-muted-foreground">
              {sku.pointsCost.toLocaleString()} pts
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ── Static content ───────────────────────────────────────────────────

const STREAK_MILESTONES: Array<{ day: number; bonus: number; name: string }> = [
  { day: 7, bonus: 100, name: "On Fire" },
  { day: 14, bonus: 250, name: "Fortnight Force" },
  { day: 30, bonus: 500, name: "Streak 30" },
  { day: 60, bonus: 1000, name: "Unstoppable" },
  { day: 90, bonus: 2500, name: "Legendary" },
];

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: "Do my points ever expire?",
    a: "No. Points stay in your balance until you redeem them. Lifetime earned and lifetime redeemed are tracked separately so you can see your full history.",
  },
  {
    q: "Can I lose points I've already earned?",
    a: "Only in three cases. (1) When you redeem, the points are debited. (2) If you refund a purchase that earned points, the original earning is reversed. (3) If our fraud system flags unusual activity, earning is paused until support reviews — confirmed fraud leads to point reversal.",
  },
  {
    q: "How fast do gift cards arrive?",
    a: "Tremendous typically delivers the gift-card email within minutes of approval. If you cross the $599 / year reporting threshold, we'll collect a W-9 first.",
  },
  {
    q: "What counts toward my streak?",
    a: "Almost any meaningful action — submitting an application, tailoring a resume, generating a cover letter, completing a task, posting to the feed, running a saved search, making a purchase, or just showing up daily. One qualifying action per day keeps the streak alive.",
  },
  {
    q: "Why is there a 100-task gate?",
    a: "Self-created tasks don't earn points until you've closed 100 of them. This prevents abuse — without the gate, someone could create and close thousands of fake tasks to farm points. System-generated tasks (onboarding flows, AI suggestions) always pay.",
  },
  {
    q: "Can I share points with another user?",
    a: "Not directly. The affiliate program (separate from this) lets you earn commission on referrals; ask in /affiliate-program for details.",
  },
  {
    q: "Why didn't my action earn?",
    a: "A few possibilities: you may have hit the daily cap for that action, your role may not be on the rule's eligibility list, or your points may be paused for review. Check the Activity feed on your points page for the per-action audit trail.",
  },
];
