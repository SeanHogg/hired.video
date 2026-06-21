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
import { useTranslation } from "react-i18next";
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
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { AppShell } from "@/components/AppShell";
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
import MarketingFAQ from "@/components/MarketingFAQ";
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

const ROLE_LABEL_KEYS: Record<string, string> = {
  job_seeker: "labels.rewards.roleJobSeeker",
  recruiter: "labels.rewards.roleRecruiter",
  employer: "labels.rewards.roleEmployer",
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
  const { t } = useTranslation();
  useSEO("/rewards");
  useBreadcrumbs([{ name: t("labels.rewards.breadcrumb"), url: "/rewards" }]);

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
    <AppShell bgClassName="bg-background">
      <main>
        <article className="py-10 px-4">
          <header className="space-y-3 mb-10 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
          <Sparkles className="h-3.5 w-3.5" /> {t("labels.rewards.badge")}
        </div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
          {t("headings.rewards.heroTitle")}
        </h1>
        <p className="text-lg text-muted-foreground">
          {t("messages.rewards.heroDescription")}
        </p>
        {user && eligible && (
          <div className="flex items-center justify-center gap-2 pt-3">
            <Button asChild>
              <Link to="/points">{t("actions.rewards.seeMyPoints")}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/settings?tab=points">{t("actions.rewards.cashOut")}</Link>
            </Button>
          </div>
        )}
      </header>

      {/* ── Badges showcase ─────────────────────────────────────── */}
      <Section icon={<Trophy className="h-5 w-5" />} title={t("headings.rewards.badgesYouCanWin")}>
        <p className="text-muted-foreground mb-5">
          {t("messages.rewards.badgesDesc")}
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
      <Section icon={<Coins className="h-5 w-5" />} title={t("headings.rewards.howYouEarn")}>
        <p className="text-muted-foreground mb-5">
          {t("messages.rewards.earnDesc")}
        </p>
        {catalog.isLoading || !catalog.data ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("labels.rewards.colAction")}</TableHead>
                  <TableHead>{t("labels.rewards.colWhoFor")}</TableHead>
                  <TableHead className="text-right">{t("labels.rewards.colPoints")}</TableHead>
                  <TableHead className="text-right">{t("labels.rewards.colDailyCap")}</TableHead>
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
                          ? t("labels.rewards.everyone")
                          : a.roles
                              .map((r) => (ROLE_LABEL_KEYS[r] ? t(ROLE_LABEL_KEYS[r]) : r))
                              .join(" · ")}
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
          title={t("headings.rewards.antiGamingTitle")}
        >
          {t("messages.rewards.antiGamingBody")}
        </Callout>
      </Section>

      {/* ── Streaks ─────────────────────────────────────────────── */}
      <Section icon={<Flame className="h-5 w-5 text-orange-500" />} title={t("headings.rewards.streaks")}>
        <p className="text-muted-foreground mb-5">
          {t("messages.rewards.streaksDesc")}
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
              <div className="text-xs text-muted-foreground">{t("labels.rewards.days")}</div>
              <div className="text-xs font-medium mt-2">{t("labels.rewards.bonusPts", { count: m.bonus })}</div>
              <div className="text-[10px] text-muted-foreground">{t(m.nameKey)}</div>
            </Card>
          ))}
        </div>
      </Section>

      {/* ── Cashout ─────────────────────────────────────────────── */}
      <Section icon={<CreditCard className="h-5 w-5" />} title={t("headings.rewards.cashOutTitle")}>
        <p className="text-muted-foreground mb-5">
          {t("messages.rewards.cashOutDesc")}
        </p>
        {catalog.isLoading || !catalog.data ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <CashoutColumn
              icon={<Sparkles className="h-5 w-5" />}
              title={t("labels.rewards.aiCreditsTitle")}
              subtitle={t("labels.rewards.aiCreditsSubtitle")}
              items={catalog.data.redemptions.filter((r) => r.kind === "ai_credits")}
            />
            <CashoutColumn
              icon={<Award className="h-5 w-5" />}
              title={t("labels.rewards.proTimeTitle")}
              subtitle={t("labels.rewards.proTimeSubtitle")}
              items={catalog.data.redemptions.filter((r) => r.kind === "premium_month")}
            />
            <CashoutColumn
              icon={<Gift className="h-5 w-5" />}
              title={t("labels.rewards.giftCardsTitle")}
              subtitle={t("labels.rewards.giftCardsSubtitle")}
              items={catalog.data.redemptions.filter((r) => r.kind === "gift_card")}
            />
            <CashoutColumn
              icon={<Megaphone className="h-5 w-5" />}
              title={t("labels.rewards.campaignTitle")}
              subtitle={t("labels.rewards.campaignSubtitle")}
              items={catalog.data.redemptions.filter((r) => r.kind === "campaign_dollars")}
            />
          </div>
        )}
        <Callout
          tone="warn"
          icon={<Lock className="h-4 w-4" />}
          title={t("headings.rewards.taxTitle")}
        >
          {t("messages.rewards.taxBody")}
        </Callout>
      </Section>

      {/* ── FAQ ─────────────────────────────────────────────────── */}
      {/* MarketingFAQ ships the schema.org FAQPage JSON-LD so each Q is
          eligible for Google rich results — the SEO surface every other
          marketing page on the site gets. */}
      <MarketingFAQ
        schemaId="rewards"
        heading={t("headings.rewards.faqHeading")}
        items={FAQ.map((f) => ({
          question: t(f.questionKey),
          answer: t(f.answerKey),
        }))}
        className="py-8 px-0"
      />

      {/* ── CTA ─────────────────────────────────────────────────── */}
      <Card className="p-8 mt-12 text-center bg-gradient-to-br from-primary/10 via-primary/5 to-background">
        <Trophy className="h-10 w-10 mx-auto text-primary mb-3" />
        <h2 className="text-2xl font-bold mb-2">{t("headings.rewards.ctaTitle")}</h2>
        <p className="text-muted-foreground mb-5">
          {t("messages.rewards.ctaDesc")}
        </p>
        <div className="flex items-center justify-center gap-2">
          {user ? (
            <Button asChild>
              <Link to="/points">{t("actions.rewards.goToMyPoints")}</Link>
            </Button>
          ) : (
            <>
              <Button asChild>
                <Link to="/signup">{t("actions.signUpFree")}</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/login">{t("actions.signIn")}</Link>
              </Button>
            </>
          )}
        </div>
      </Card>
        </article>
      </main>
    </AppShell>
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
  const { t } = useTranslation();
  if (items.length === 0) return null;
  // A column is "coming soon" when none of its SKUs are currently
  // redeemable (e.g. gift cards while we onboard a new provider). The
  // `available` flag is the catalog SSoT — no per-kind branching here.
  const comingSoon = items.every((sku) => sku.available === false);
  return (
    <Card className={`p-5 h-full ${comingSoon ? "opacity-70" : ""}`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <h3 className="font-semibold">{title}</h3>
        {comingSoon && (
          <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            {t("labels.rewards.comingSoon")}
          </span>
        )}
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
              {t("labels.rewards.ptsValue", { amount: sku.pointsCost.toLocaleString() })}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ── Static content ───────────────────────────────────────────────────

const STREAK_MILESTONES: Array<{ day: number; bonus: number; nameKey: string }> = [
  { day: 7, bonus: 100, nameKey: "labels.rewards.streakOnFire" },
  { day: 14, bonus: 250, nameKey: "labels.rewards.streakFortnightForce" },
  { day: 30, bonus: 500, nameKey: "labels.rewards.streak30" },
  { day: 60, bonus: 1000, nameKey: "labels.rewards.streakUnstoppable" },
  { day: 90, bonus: 2500, nameKey: "labels.rewards.streakLegendary" },
];

const FAQ: Array<{ questionKey: string; answerKey: string }> = [
  { questionKey: "messages.rewards.faq1Q", answerKey: "messages.rewards.faq1A" },
  { questionKey: "messages.rewards.faq2Q", answerKey: "messages.rewards.faq2A" },
  { questionKey: "messages.rewards.faq3Q", answerKey: "messages.rewards.faq3A" },
  { questionKey: "messages.rewards.faq4Q", answerKey: "messages.rewards.faq4A" },
  { questionKey: "messages.rewards.faq5Q", answerKey: "messages.rewards.faq5A" },
  { questionKey: "messages.rewards.faq6Q", answerKey: "messages.rewards.faq6A" },
  { questionKey: "messages.rewards.faq7Q", answerKey: "messages.rewards.faq7A" },
];
