import {
  Check,
  Star,
  Users,
  Building2,
  MessageCircle,
  Play,
  ArrowRight,
  Zap,
  Shield,
  Heart,
  Briefcase,
  FileText,
  BarChart3,
  Clock,
  Target,
  Brain,
  Video,
  CheckSquare,
  Send,
  Calendar,
  Bell,
  Globe,
  TrendingUp,
  Handshake,
  ShoppingCart,
  Plus,
  Minus,
  Chrome,
  Sparkles,
  Mic,
  Share2,
  LayoutGrid,
  Search,
  Eye,
  Palette,
  Lock,
  Download,
  Mail,
  Trophy,
  GraduationCap,
  MapPin,
  Phone,
  ListChecks,
  Wand2,
} from "lucide-react";
import {
  PRO_MONTHLY_PRICE as PRO_MONTHLY_PRICE_DEFAULT,
  PRO_YEARLY_PRICE as PRO_YEARLY_PRICE_DEFAULT,
  INBOX_SYNC_INCLUDED_ACCOUNTS,
  INBOX_SYNC_EXTRA_ACCOUNT_PRICE,
} from "@shared/pricing";
import { TIER_COPY } from "@shared/tier-copy";
import {
  UPGRADE_REGISTRY,
  parseUpgradeSlug,
  type UpgradeSlug,
} from "@shared/upgrade-slugs";
import { pricingConfigService } from "@/lib/services/pricing-config-service";
import { TRUST_SIGNALS } from "@/lib/constants";
import { listShippableKindPitches } from "@/lib/studio/kind-marketing";
import type { ComponentType, ReactNode } from "react";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import { useSEO, useBreadcrumbs, generatePricingSchema } from "@/lib/seo";
import MarketingFAQ from "@/components/MarketingFAQ";
import CompetitorComparison from "@/components/CompetitorComparison";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AppShell } from "@/components/AppShell";
import type { UserRole } from "@/lib/auth";
import { useAuth, USER_ROLES } from "@/lib/auth";
import { useCart } from "@/lib/cart-context";
import { useContactPanel } from "@/components/ContactPanel";

export default function Pricing() {
  const { t } = useTranslation();
  const location = useLocation();
  // Live prices from the runtime config (admin-editable). Fall back to the
  // shared/pricing.ts compile-time defaults until the fetch resolves.
  const [basePrice, setBasePrice] = useState<number>(PRO_MONTHLY_PRICE_DEFAULT);
  const [PRO_YEARLY_PRICE, setProYearlyPrice] = useState<number>(PRO_YEARLY_PRICE_DEFAULT);
  useEffect(() => {
    let cancelled = false;
    pricingConfigService
      .get()
      .then((cfg) => {
        if (cancelled) return;
        setBasePrice(cfg.proMonthlyCents / 100);
        setProYearlyPrice(cfg.proYearlyCents / 100);
      })
      .catch(() => {
        // Stick with defaults — pricing is still correct, just compile-time.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // SEO for pricing page — includes Product/Offer structured data for rich snippets
  useSEO(location.pathname, {
    structuredData: generatePricingSchema([
      {
        name: "Free",
        description:
          "Free career tools — AI resume scorer, AI Studio for video / comic / game / podcast creation, job matching, and more.",
        monthlyPrice: 0,
      },
      {
        name: "Pro",
        description:
          "Full access to hired.video — 1M AI tokens/mo, 1080p + 4K video, PDF / CBZ comic export, voice cloning, brand kits, unlimited published projects, plus the built-in Learning Content Library (SCORM 1.2 + xAPI + verifiable certificates — LinkedIn Learning is separately licensed at ~$379/seat/yr; ours is included).",
        monthlyPrice: basePrice,
        annualPrice: PRO_YEARLY_PRICE,
      },
    ]),
  });
  useBreadcrumbs([{ name: "Pricing", url: "/pricing" }]);
  const { isAuthenticated, user } = useAuth();
  const { addItem, openCart } = useCart();
  const { openContactPanel } = useContactPanel();

  // Pricing state
  const [isAnnual, setIsAnnual] = useState(false);
  // Persona state — defaults to the authenticated user's role so each visitor
  // lands on plans tailored to their persona; fall back to Job Seeker for
  // anonymous traffic. Only the three customer-facing roles have pricing
  // tiers, so admin / superadmin / hiring-team roles also fall back.
  const [persona, setPersona] = useState<UserRole>(() => {
    const role = user?.role as UserRole | undefined;
    if (role === USER_ROLES.RECRUITER || role === USER_ROLES.EMPLOYER) return role;
    return USER_ROLES.JOB_SEEKER;
  });
  // If the user logs in / impersonates a role after the page mounts, follow.
  useEffect(() => {
    const role = user?.role as UserRole | undefined;
    if (role === USER_ROLES.JOB_SEEKER || role === USER_ROLES.RECRUITER || role === USER_ROLES.EMPLOYER) {
      setPersona(role);
    }
  }, [user?.role]);

  // One copy line per persona today — keep the inbox quota + add-on price
  // in one string so changing either reaches every plan card simultaneously.
  // "per user" suffix only renders on personas where Pro is billed per-seat.
  // One copy line per persona today. The "scope" variant carries the
  // per-seat / per-user qualifier so changing the quota or add-on price
  // reaches every plan card simultaneously.
  const inboxSyncFeature = (
    scope: "none" | "perSeat" | "perUser" = "none",
  ): string =>
    t(`messages.pricing.inboxSyncFeature.${scope}`, {
      count: INBOX_SYNC_INCLUDED_ACCOUNTS,
      price: INBOX_SYNC_EXTRA_ACCOUNT_PRICE,
    });

  // Per-persona copy is i18n-key driven: each persona carries the dotted keys
  // for its descriptions, feature arrays (resolved via returnObjects), unit /
  // count labels, and an inbox-sync scope appended at render so the dynamic
  // quota + add-on price stay in one place. t() is called at render below —
  // never at module scope.
  type InboxScope = "none" | "perSeat" | "perUser";
  type PersonaCopyKeys = {
    labelKey: string;
    freeDescriptionKey: string;
    proDescriptionKey: string;
    freeFeaturesKey: string;
    proFeaturesKey: string;
    inboxScope: InboxScope; // appended to proFeatures when not "none"
    unitLabelKey: string;
    userCountLabelKey: string | null; // null → no count selector label
  };
  const personaCopy: Partial<Record<UserRole, PersonaCopyKeys>> = {
    [USER_ROLES.JOB_SEEKER]: {
      labelKey: "labels.jobSeeker",
      freeDescriptionKey: "messages.pricing.persona.jobSeeker.freeDesc",
      proDescriptionKey: "messages.pricing.persona.jobSeeker.proDesc",
      freeFeaturesKey: "pricing.persona.jobSeeker.freeFeatures",
      proFeaturesKey: "pricing.persona.jobSeeker.proFeatures",
      inboxScope: "none",
      unitLabelKey: "marketing.pricing.persona.jobSeeker.unitLabel",
      userCountLabelKey: null,
    },
    [USER_ROLES.RECRUITER]: {
      labelKey: "labels.recruiterLowercase",
      freeDescriptionKey: "marketing.pricing.persona.recruiter.freeDesc",
      proDescriptionKey: "marketing.pricing.persona.recruiter.proDesc",
      freeFeaturesKey: "pricing.persona.recruiter.freeFeatures",
      proFeaturesKey: "pricing.persona.recruiter.proFeatures",
      inboxScope: "perSeat",
      unitLabelKey: "marketing.pricing.persona.recruiter.unitLabel",
      userCountLabelKey: "marketing.pricing.persona.recruiter.userCountLabel",
    },
    [USER_ROLES.EMPLOYER]: {
      labelKey: "labels.employerLowercase",
      freeDescriptionKey: "marketing.pricing.persona.employer.freeDesc",
      proDescriptionKey: "marketing.pricing.persona.employer.proDesc",
      freeFeaturesKey: "pricing.persona.employer.freeFeatures",
      proFeaturesKey: "pricing.persona.employer.proFeatures",
      inboxScope: "perUser",
      unitLabelKey: "marketing.pricing.persona.employer.unitLabel",
      userCountLabelKey: "marketing.pricing.persona.employer.userCountLabel",
    },
    [USER_ROLES.ADMIN]: {
      labelKey: "marketing.pricing.persona.admin.label",
      freeDescriptionKey: "marketing.pricing.persona.admin.freeDesc",
      proDescriptionKey: "marketing.pricing.persona.admin.proDesc",
      freeFeaturesKey: "marketing.pricing.persona.admin.freeFeatures",
      proFeaturesKey: "marketing.pricing.persona.admin.proFeatures",
      inboxScope: "none",
      unitLabelKey: "marketing.pricing.persona.admin.unitLabel",
      userCountLabelKey: "marketing.pricing.persona.admin.userCountLabel",
    },
  };

  // Resolve the active persona's copy once per render. Feature arrays come
  // from the catalogue via returnObjects; the inbox-sync line is appended
  // for personas that bundle it into Pro.
  const activeCopy = personaCopy[persona]!;
  const resolveFeatures = (key: string): string[] => {
    const v = t(key, { returnObjects: true });
    return Array.isArray(v) ? (v as string[]) : [];
  };
  const freeFeatures = resolveFeatures(activeCopy.freeFeaturesKey);
  const proFeatures = [
    ...resolveFeatures(activeCopy.proFeaturesKey),
    ...(activeCopy.inboxScope !== "none"
      ? [inboxSyncFeature(activeCopy.inboxScope)]
      : []),
  ];

  const [selectedUsers, setSelectedUsers] = useState(1);
  // Default persona from logged-in user if available
  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) {
      try {
        const u = JSON.parse(stored);
        if (
          u?.role === USER_ROLES.JOB_SEEKER ||
          u?.role === USER_ROLES.RECRUITER ||
          u?.role === USER_ROLES.EMPLOYER
        ) {
          setPersona(u.role as UserRole);
        }
      } catch (_) {}
    }
  }, []);

  const calculatePrice = (users: number, annual: boolean) => {
    const monthlyTotal = basePrice * users;
    if (annual) {
      return monthlyTotal * 12 * 0.8; // 20% discount for annual
    }
    return monthlyTotal;
  };

  const handleAddToCart = () => {
    addItem({
      id: `pro-${selectedUsers}-${isAnnual ? "annual" : "monthly"}`,
      name: t("marketing.pricing.proPlanName"),
      price: calculatePrice(selectedUsers, isAnnual),
      type: "plan",
      billingCycle: isAnnual ? "annual" : "monthly",
      users: selectedUsers,
    });
    openCart();
  };

  // `/pricing?upgrade=<slug>` deep-links from gated features land here with
  // a slug identifying which feature the user hit. Server-side gates that
  // can't render a 402 envelope (top-level browser navigations like the
  // email-integration OAuth `/connect`) redirect through this. The registry
  // now lives in `shared/upgrade-slugs.ts` so every gate, the API redirects,
  // and the Pricing page agree on the slug set and copy (gap #810).
  const upgradeSlug: UpgradeSlug | null = parseUpgradeSlug(
    new URLSearchParams(location.search).get("upgrade"),
  );
  const upgradeBanner = upgradeSlug ? UPGRADE_REGISTRY[upgradeSlug] : null;

  // Smooth-scroll the matching comparison-table row into view + highlight
  // it for ~3s so the user sees the exact line item that gates the feature
  // they were trying to use. Idempotent on slug change (multiple ?upgrade=
  // navigations within the same SPA mount re-fire). Pure DOM — no state.
  useEffect(() => {
    if (!upgradeBanner?.comparisonRowId) return;
    const id = upgradeBanner.comparisonRowId;
    // Defer one frame so the comparison table has mounted.
    const t = window.setTimeout(() => {
      const row = document.querySelector<HTMLElement>(
        `[data-upgrade-id="${id}"]`,
      );
      if (!row) return;
      row.scrollIntoView({ behavior: "smooth", block: "center" });
      row.setAttribute("data-upgrade-active", "true");
      // Strip the highlight after the animation completes so a later
      // navigation can re-trigger it.
      window.setTimeout(() => row.removeAttribute("data-upgrade-active"), 3000);
    }, 120);
    return () => window.clearTimeout(t);
  }, [upgradeBanner?.comparisonRowId]);

  return (
    <AppShell bgClassName="bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5">
<div>
          <div className="px-4 py-8">
            {/* Hero + Controls — compact */}
            <div className="text-center mb-6">
              <h1 className="text-3xl md:text-4xl font-bold mb-2">
                {t("marketing.pricing.heroTitle")}
              </h1>
              <p className="text-sm text-muted-foreground">
                {t("messages.pricing.heroSubtitleCompact")}
              </p>
            </div>

            {upgradeBanner && (
              <Card className="border-2 border-primary/40 bg-primary/5 mb-6">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    {upgradeBanner.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {upgradeBanner.description}
                </CardContent>
              </Card>
            )}

            {/* Persona + Billing controls in one row */}
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 mb-6">
              <div className="p-[2px] rounded-full bg-gradient-to-r from-brand-purple to-brand-blue">
                <div className="bg-background rounded-full p-1">
                  <ToggleGroup
                    type="single"
                    value={persona}
                    onValueChange={(v) => v && setPersona(v as UserRole)}
                    className="gap-1"
                  >
                    <ToggleGroupItem
                      value={USER_ROLES.JOB_SEEKER}
                      className="rounded-full px-3 py-1.5 text-sm data-[state=on]:bg-gradient-to-r data-[state=on]:from-brand-purple data-[state=on]:to-brand-blue data-[state=on]:text-white"
                    >
                      <Users className="h-4 w-4 mr-2" /> {t("labels.jobSeeker")}
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value={USER_ROLES.RECRUITER}
                      className="rounded-full px-3 py-1.5 text-sm data-[state=on]:bg-gradient-to-r data-[state=on]:from-brand-purple data-[state=on]:to-brand-blue data-[state=on]:text-white"
                    >
                      <Briefcase className="h-4 w-4 mr-2" /> {t("labels.recruiter")}
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value={USER_ROLES.EMPLOYER}
                      className="rounded-full px-3 py-1.5 text-sm data-[state=on]:bg-gradient-to-r data-[state=on]:from-brand-purple data-[state=on]:to-brand-blue data-[state=on]:text-white"
                    >
                      <Building2 className="h-4 w-4 mr-2" /> {t("labels.employer")}
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Label
                  htmlFor="billing-toggle"
                  className={!isAnnual ? "font-semibold" : ""}
                >
                  {t("marketing.pricing.billing.monthly")}
                </Label>
                <Switch
                  id="billing-toggle"
                  checked={isAnnual}
                  onCheckedChange={setIsAnnual}
                />
                <Label
                  htmlFor="billing-toggle"
                  className={isAnnual ? "font-semibold" : ""}
                >
                  {t("marketing.pricing.billing.annual")}
                  <Badge variant="secondary" className="ml-2">
                    {t("marketing.pricing.billing.save20")}
                  </Badge>
                </Label>
              </div>

              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Shield className="h-3.5 w-3.5" />
                  {t("marketing.pricing.noHiddenFees")}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {t("marketing.pricing.cancelAnytime")}
                </span>
              </div>
            </div>

            {/* Pricing Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
              {/* Free Plan */}
              <Card className="relative border-2 border-border hover:border-primary/20 transition-colors">
                <CardHeader className="text-center pb-8">
                  <CardTitle className="text-2xl">{t("labels.free")}</CardTitle>
                  <div className="mt-4">
                    <span className="text-5xl font-bold">$0.00</span>
                  </div>
                  <CardDescription className="text-lg mt-4">
                    {t(activeCopy.freeDescriptionKey)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <h4 className="font-semibold text-lg">
                      {t("marketing.pricing.whatsIncluded")}
                    </h4>
                    <div className="space-y-3">
                      {freeFeatures.map((feat) => (
                        <div key={feat} className="flex items-center gap-3">
                          <div className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                            <Check className="h-3 w-3 text-green-600" />
                          </div>
                          <span className="text-sm">{feat}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-4">
                    {!isAuthenticated ? (
                      <Link to="/signup" className="block">
                        <Button className="w-full" variant="outline" size="lg">
                          {t("actions.getStarted")}
                        </Button>
                      </Link>
                    ) : (
                      <Button className="w-full" variant="outline" size="lg">
                        {t("marketing.pricing.currentPlan")}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Pro Plan */}
              <Card className="relative border-2 border-primary shadow-lg">
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <Badge className="bg-gradient-to-r from-brand-purple to-brand-blue text-white px-4 py-1">
                    {t("marketing.pricing.mostPopular")}
                  </Badge>
                </div>
                <CardHeader className="text-center pb-8">
                  <CardTitle className="text-2xl">{t("labels.proBadge")}</CardTitle>

                  {/* Pricing Summary & (Conditional) User Selection */}
                  <div className="mt-4 space-y-4">
                    {/* Price summary always visible */}
                    <div className="text-center">
                      <span className="text-5xl font-bold">
                        $
                        {isAnnual
                          ? (calculatePrice(selectedUsers, true) / 12).toFixed(
                              2,
                            )
                          : calculatePrice(selectedUsers, false).toFixed(2)}
                      </span>
                      <span className="text-lg text-muted-foreground ml-2">
                        / {t(activeCopy.unitLabelKey)}
                        {isAnnual ? ` ${t("marketing.pricing.billedAnnually")}` : ""}
                      </span>
                      {isAnnual && (
                        <div className="text-sm text-green-600 mt-2">
                          {t("marketing.pricing.saveAmountPerYear", {
                            amount: (
                              calculatePrice(selectedUsers, false) * 12 -
                              calculatePrice(selectedUsers, true)
                            ).toFixed(2),
                          })}
                        </div>
                      )}
                    </div>

                    {/* Seats selector only for recruiter/employer */}
                    {persona !== USER_ROLES.JOB_SEEKER && (
                      <div className="flex items-center justify-center gap-4">
                        <Label htmlFor="user-select">
                          {activeCopy.userCountLabelKey
                            ? t(activeCopy.userCountLabelKey)
                            : t("marketing.pricing.numberOfUsers")}
                          :
                        </Label>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() =>
                              setSelectedUsers(Math.max(1, selectedUsers - 1))
                            }
                            disabled={selectedUsers <= 1}
                            className="h-8 w-8"
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                          <Select
                            value={selectedUsers.toString()}
                            onValueChange={(value) =>
                              setSelectedUsers(parseInt(value))
                            }
                          >
                            <SelectTrigger className="w-20">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: 20 }, (_, i) => i + 1).map(
                                (num) => (
                                  <SelectItem key={num} value={num.toString()}>
                                    {num}
                                  </SelectItem>
                                ),
                              )}
                            </SelectContent>
                          </Select>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() =>
                              setSelectedUsers(Math.min(20, selectedUsers + 1))
                            }
                            disabled={selectedUsers >= 20}
                            className="h-8 w-8"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  <CardDescription className="text-lg mt-4">
                    {t(activeCopy.proDescriptionKey)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <h4 className="font-semibold text-lg">
                      {t("marketing.pricing.allFreePlus")}
                    </h4>
                    <div className="space-y-3">
                      {proFeatures.map((feat) => (
                        <div key={feat} className="flex items-start gap-3">
                          <div className="w-5 h-5 bg-primary/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Check className="h-3 w-3 text-primary" />
                          </div>
                          <span className="text-sm">{feat}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-4">
                    {!isAuthenticated ? (
                      <Link to="/signup" className="block">
                        <Button
                          className="w-full bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90"
                          size="lg"
                        >
                          {t("actions.getStarted")}
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </Link>
                    ) : (
                      <Button
                        className="w-full bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90"
                        size="lg"
                        onClick={handleAddToCart}
                      >
                        <ShoppingCart className="mr-2 h-4 w-4" />
                        {t("marketing.pricing.addToCartPerMonth", {
                          amount: isAnnual
                            ? (
                                calculatePrice(selectedUsers, true) / 12
                              ).toFixed(2)
                            : calculatePrice(selectedUsers, false).toFixed(2),
                        })}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Feature Comparison */}
            <div className="mb-16">
              <h2 className="text-3xl font-bold text-center mb-12">
                {t("marketing.pricing.compareFeatures")}
              </h2>
              <div className="text-center mb-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border text-sm">
                  <span className="text-muted-foreground">
                    {t("marketing.pricing.viewingFeaturesFor")}
                  </span>
                  <span className="font-medium">
                    {t(activeCopy.labelKey)}
                  </span>
                </div>
              </div>

              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left p-4 font-semibold">
                          {t("marketing.pricing.featuresColumn")}
                        </th>
                        <th className="text-center p-4 font-semibold">{t("labels.free")}</th>
                        <th className="text-center p-4 font-semibold">{t("labels.proBadge")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {/* Core Platform Features */}
                      <SectionRow label={t("marketing.pricing.section.corePlatform")} />
                      <FeatureRow
                        icon={Briefcase}
                        label={t("marketing.pricing.feature.ats")}
                        free
                        pro
                      />
                      <FeatureRow
                        icon={FileText}
                        label={t("marketing.pricing.feature.jobPostings")}
                        free={
                          persona === USER_ROLES.JOB_SEEKER
                            ? false
                            : t("marketing.pricing.value.unlimited")
                        }
                        pro={
                          persona === USER_ROLES.RECRUITER
                            ? t("marketing.pricing.value.unlimitedExclusive")
                            : persona === USER_ROLES.EMPLOYER
                              ? t("marketing.pricing.value.unlimited")
                              : false
                        }
                      />
                      <FeatureRow
                        icon={Users}
                        label={t("marketing.pricing.feature.teamSize")}
                        free={
                          persona === USER_ROLES.JOB_SEEKER
                            ? "1"
                            : t("marketing.pricing.value.upTo2")
                        }
                        pro={
                          persona === USER_ROLES.JOB_SEEKER
                            ? "1"
                            : t("marketing.pricing.value.unlimited")
                        }
                      />
                      <FeatureRow
                        icon={Users}
                        label={t("marketing.pricing.feature.adminUsers")}
                        free="1"
                        pro={
                          persona === USER_ROLES.JOB_SEEKER
                            ? "1"
                            : t("marketing.pricing.value.unlimited")
                        }
                      />
                      <FeatureRow
                        icon={Users}
                        label={t("marketing.pricing.feature.applicantsContacts")}
                        free={t("marketing.pricing.value.unlimited")}
                        pro={t("marketing.pricing.value.unlimited")}
                      />

                      {/* Browser Extensions */}
                      <SectionRow label={t("marketing.pricing.section.browserExtensions")} />
                      <FeatureRow
                        icon={Chrome}
                        label={t("marketing.pricing.feature.jobSeekerExtension")}
                        free
                        pro
                      />
                      <PersonaGatedRow
                        icon={Chrome}
                        label={t("marketing.pricing.feature.recruiterExtension")}
                        free
                        pro
                        visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
                        currentPersona={persona}
                      />
                      <FeatureRow
                        icon={Target}
                        label={t("marketing.pricing.feature.oneClickJobTracking")}
                        free
                        pro
                      />
                      <FeatureRow
                        icon={Zap}
                        label={t("marketing.pricing.feature.autoDetectJobBanners")}
                        free
                        pro
                      />
                      <FeatureRow
                        icon={Target}
                        label={t("marketing.pricing.feature.matchScoringInExt")}
                        free={t("marketing.pricing.value.includedTokens")}
                        pro={t("marketing.pricing.value.unlimited")}
                      />
                      <FeatureRow
                        icon={Sparkles}
                        label={t("marketing.pricing.feature.tailoringInExt")}
                        free={t("marketing.pricing.value.includedTokens")}
                        pro={t("marketing.pricing.value.unlimited")}
                      />
                      <PersonaGatedRow
                        icon={Users}
                        label={t("marketing.pricing.feature.candidateExtract")}
                        free={t("marketing.pricing.value.includedTokens")}
                        pro={t("marketing.pricing.value.unlimited")}
                        visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
                        currentPersona={persona}
                      />
                      <PersonaGatedRow
                        icon={Building2}
                        label={t("marketing.pricing.feature.companyExtract")}
                        free={t("marketing.pricing.value.includedTokens")}
                        pro={t("marketing.pricing.value.unlimited")}
                        visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
                        currentPersona={persona}
                      />
                      <PersonaGatedRow
                        icon={Mail}
                        label={t("messages.pricing.feature.enrichmentOnCapture")}
                        free
                        pro
                        visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
                        currentPersona={persona}
                      />
                      <PersonaGatedRow
                        icon={ListChecks}
                        label={t("messages.pricing.feature.bulkCapture")}
                        free
                        pro
                        visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
                        currentPersona={persona}
                      />
                      <PersonaGatedRow
                        icon={Phone}
                        label={t("messages.pricing.feature.clickToCall")}
                        free={t("messages.pricing.value.requiresPhoneNumber")}
                        pro={t("messages.pricing.value.callMinutesIncluded")}
                        visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
                        currentPersona={persona}
                      />
                      <PersonaGatedRow
                        icon={Users}
                        label={t("messages.pricing.feature.listsCallQueues")}
                        free
                        pro
                        visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
                        currentPersona={persona}
                      />
                      <PersonaGatedRow
                        icon={Send}
                        label={t("messages.pricing.feature.outreachEnrollment")}
                        free
                        pro
                        visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
                        currentPersona={persona}
                      />
                      <FeatureRow
                        icon={Wand2}
                        label={t("messages.pricing.feature.interactivePicker")}
                        free
                        pro
                      />
                      <FeatureRow
                        icon={FileText}
                        label={t("marketing.pricing.feature.appTracking")}
                        free
                        pro
                      />

                      {/* AI Studio — multi-format (video / comics / games /
                          podcasts / voice / animation). Section header reads
                          from MEDIA_KIND_UI labels via listShippableKindPitches
                          so adding a kind ripples into the per-kind capability
                          rows below automatically. Each row uses the shared
                          <FeatureRow> helper (DRY anchor for the whole
                          comparison table) — adding a feature is one line. */}
                      <SectionRow label={t("headings.pricing.section.aiStudioMulti")} />

                      <FeatureRow
                        icon={Sparkles}
                        label={t("messages.pricing.feature.scriptStoryboard")}
                        free
                        pro
                      />
                      <FeatureRow
                        icon={Sparkles}
                        label={t("messages.pricing.feature.aiDraftsMulti")}
                        free={t("messages.pricing.value.unlimitedTokenGated")}
                        pro={t("marketing.pricing.value.unlimited")}
                      />
                      <FeatureRow
                        icon={Share2}
                        label={t("messages.pricing.feature.publishedProjects")}
                        free={t("marketing.pricing.value.onePublished")}
                        pro={t("marketing.pricing.value.unlimited")}
                      />
                      <FeatureRow
                        icon={LayoutGrid}
                        label={t("messages.pricing.feature.builtinTemplatesMulti")}
                        free={t("messages.pricing.value.basicTemplatesMulti")}
                        pro={TIER_COPY.proCollectionLabel(
                          t("messages.pricing.value.fullLibraryPremium"),
                        )}
                      />

                      {/* Per-kind capability rows — one per shippable
                          mediaKind, driven by `KIND_MARKETING` so adding a
                          7th kind ripples here automatically. The blurb
                          comes from the kind-marketing SoT used by the
                          /studio landing page (single source of truth for
                          "what does this kind do"). */}
                      {listShippableKindPitches().map((pitch) => (
                        <FeatureRow
                          key={pitch.kind}
                          icon={pitch.icon}
                          label={pitch.title}
                          free
                          pro={t("messages.pricing.value.allTemplatesProExport")}
                        />
                      ))}

                      <FeatureRow
                        icon={Zap}
                        label={t("messages.pricing.feature.animatedScenesMulti")}
                        free={t("marketing.pricing.value.minimalOnly")}
                        pro={t("marketing.pricing.value.minimalModerateCinematic")}
                      />
                      <FeatureRow
                        icon={Palette}
                        label={t("marketing.pricing.feature.brandKits")}
                        free={false}
                        pro
                        upgradeId="brand-kit"
                      />
                      <FeatureRow
                        icon={Download}
                        label={t("messages.pricing.feature.export1080video")}
                        free
                        pro
                      />
                      <FeatureRow
                        icon={Download}
                        label={t("messages.pricing.feature.export4kComic")}
                        free={false}
                        pro
                      />
                      <FeatureRow
                        icon={Video}
                        label={t("marketing.pricing.feature.verticalExport")}
                        free={false}
                        pro
                      />
                      <FeatureRow
                        icon={Shield}
                        label={t("marketing.pricing.feature.watermark")}
                        free={t("marketing.pricing.value.brandedWatermark")}
                        pro={t("marketing.pricing.value.watermarkFree")}
                      />
                      <FeatureRow
                        icon={Mic}
                        label={t("marketing.pricing.feature.voiceCloning")}
                        free={false}
                        pro
                        upgradeId="voice-clone"
                      />
                      <FeatureRow
                        icon={Mic}
                        label={t("marketing.pricing.feature.voiceMarketplace")}
                        free={t("marketing.pricing.value.oneFreeVoice")}
                        pro={t("marketing.pricing.value.fullMarketplace")}
                      />
                      <FeatureRow
                        icon={Share2}
                        label={t("messages.pricing.feature.oneClickPublishing")}
                        free={false}
                        pro
                      />
                      <FeatureRow
                        icon={Sparkles}
                        label={t("marketing.pricing.feature.linkedinPostAi")}
                        free={false}
                        pro
                      />
                      <FeatureRow
                        icon={Share2}
                        label={t("marketing.pricing.feature.publicShareLink")}
                        free
                        pro
                      />
                      <FeatureRow
                        icon={BarChart3}
                        label={t("messages.pricing.feature.viewAnalyticsMulti")}
                        free={t("marketing.pricing.value.basicViewsOnly")}
                        pro={t("marketing.pricing.value.advancedAnalytics")}
                      />

                      {/* Reviews & Salary Insights — cross-persona surface
                          that closes the Glassdoor / Indeed-salary parity
                          gap. Every persona sees the same rows: job
                          seekers research employers, employers manage
                          their reputation, recruiters cite real pay
                          bands when sourcing. */}
                      <SectionRow label={t("headings.pricing.section.reviewsSalary")} />
                      <FeatureRow
                        icon={Star}
                        label={t("messages.pricing.feature.browseReviews")}
                        free
                        pro
                      />
                      <FeatureRow
                        icon={Star}
                        label={t("messages.pricing.feature.writeReview")}
                        free={false}
                        pro
                      />
                      <FeatureRow
                        icon={TrendingUp}
                        label={t("messages.pricing.feature.salaryGuidesRole")}
                        free
                        pro
                      />
                      <FeatureRow
                        icon={Globe}
                        label={t("messages.pricing.feature.salaryGuidesCity")}
                        free
                        pro
                      />
                      <FeatureRow
                        icon={TrendingUp}
                        label={t("messages.pricing.feature.salaryNegotiation")}
                        free={false}
                        pro
                      />
                      <FeatureRow
                        icon={FileText}
                        label={t("marketing.pricing.feature.resumeOptimization")}
                        free={t("messages.pricing.value.aiPowered3PerMo")}
                        pro={t("marketing.pricing.value.aiPoweredUnlimited")}
                      />
                      <FeatureRow
                        icon={Download}
                        label={t("marketing.pricing.feature.atsExport")}
                        free
                        pro
                      />

                      {/* AI-Powered Tools */}
                      <SectionRow label={t("marketing.pricing.section.aiTools")} />
                      <FeatureRow
                        icon={Brain}
                        label={t("marketing.pricing.feature.aiAssistance")}
                        free={t("marketing.pricing.value.tokens50k")}
                        pro={t("marketing.pricing.value.tokens1m")}
                        upgradeId="ai-tokens"
                      />
                      <FeatureRow
                        icon={Target}
                        label={t("marketing.pricing.feature.smartJobMatching")}
                        free={t("marketing.pricing.value.basic")}
                        pro={t("marketing.pricing.value.aiEnhanced")}
                      />
                      <FeatureRow
                        icon={MessageCircle}
                        label={t("marketing.pricing.feature.interviewSimulator")}
                        free={t("messages.pricing.value.basic3PerMo")}
                        pro={t("marketing.pricing.value.advanced")}
                      />
                      <FeatureRow
                        icon={BarChart3}
                        label={t("marketing.pricing.feature.resumeScoring")}
                        free={t("messages.pricing.value.basicPreviewOnly")}
                        pro={t("marketing.pricing.value.advancedUnlimited")}
                      />
                      <FeatureRow
                        icon={Clock}
                        label={t("marketing.pricing.feature.salaryCalculator")}
                        free={false}
                        pro
                      />
                      <FeatureRow
                        icon={Sparkles}
                        label={t("marketing.pricing.feature.resumeTailor")}
                        free={t("marketing.pricing.value.variations3PerMo")}
                        pro={t("marketing.pricing.value.unlimited")}
                      />
                      <FeatureRow
                        icon={FileText}
                        label={t("marketing.pricing.feature.resumeConsolidator")}
                        free={false}
                        pro
                      />
                      <FeatureRow
                        icon={Zap}
                        label={t("marketing.pricing.feature.resumeRoast")}
                        free={t("marketing.pricing.value.roasts3PerMo")}
                        pro={t("marketing.pricing.value.unlimited")}
                      />
                      <FeatureRow
                        icon={FileText}
                        label={t("marketing.pricing.feature.resumeSummarizer")}
                        free={t("marketing.pricing.value.summaries5PerMo")}
                        pro={t("marketing.pricing.value.unlimited")}
                      />
                      <FeatureRow
                        icon={Target}
                        label={t("marketing.pricing.feature.valueProp")}
                        free={t("marketing.pricing.value.pitches3PerMo")}
                        pro={t("marketing.pricing.value.unlimited")}
                      />
                      <FeatureRow
                        icon={Brain}
                        label={t("marketing.pricing.feature.sentimentAnalysis")}
                        free={false}
                        pro
                      />
                      <FeatureRow
                        icon={FileText}
                        label={t("marketing.pricing.feature.pdfParser")}
                        free={t("marketing.pricing.value.parses5PerMo")}
                        pro={t("marketing.pricing.value.unlimited")}
                      />
                      <FeatureRow
                        icon={MessageCircle}
                        label={t("marketing.pricing.feature.careerCoachChat")}
                        free={t("marketing.pricing.value.messages20PerMo")}
                        pro={t("marketing.pricing.value.unlimited")}
                      />
                      <FeatureRow
                        icon={Sparkles}
                        label={t("marketing.pricing.feature.nextBestAction")}
                        free={t("marketing.pricing.value.daily")}
                        pro={t("marketing.pricing.value.realtime")}
                      />

                      {/* Sourcing & Talent Pipeline — recruiter / employer */}
                      <SectionRow label={t("marketing.pricing.section.sourcingPipeline")} />
                      <PersonaGatedRow
                        icon={Search}
                        label={t("marketing.pricing.feature.talentPool")}
                        free={t("marketing.pricing.value.unlimited")}
                        pro={t("marketing.pricing.value.unlimited")}
                        visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
                        currentPersona={persona}
                      />
                      <PersonaGatedRow
                        icon={LayoutGrid}
                        label={t("marketing.pricing.feature.kanbanPipeline")}
                        free
                        pro
                        visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
                        currentPersona={persona}
                      />
                      <PersonaGatedRow
                        icon={Target}
                        label={t("marketing.pricing.feature.candidateJobMatch")}
                        free={false}
                        pro
                        visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
                        currentPersona={persona}
                      />
                      <PersonaGatedRow
                        icon={FileText}
                        label={t("marketing.pricing.feature.candidateTags")}
                        free
                        pro
                        visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
                        currentPersona={persona}
                      />
                      <PersonaGatedRow
                        icon={Search}
                        label={t("marketing.pricing.feature.savedSearches")}
                        free={t("marketing.pricing.value.upTo3")}
                        pro={t("marketing.pricing.value.unlimited")}
                        visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
                        currentPersona={persona}
                      />
                      <PersonaGatedRow
                        icon={Send}
                        label={t("marketing.pricing.feature.candidateMessaging")}
                        free={false}
                        pro
                        visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
                        currentPersona={persona}
                      />
                      <PersonaGatedRow
                        icon={Video}
                        label={t("marketing.pricing.feature.transcriptSearch")}
                        free={false}
                        pro
                        visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
                        currentPersona={persona}
                      />
                      <PersonaGatedRow
                        icon={Download}
                        label={t("marketing.pricing.feature.bulkCsv")}
                        free={false}
                        pro
                        visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
                        currentPersona={persona}
                      />
                      <PersonaGatedRow
                        icon={Building2}
                        label={t("marketing.pricing.feature.companyDatabase")}
                        free={t("marketing.pricing.value.upTo50")}
                        pro={t("marketing.pricing.value.unlimited")}
                        visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
                        currentPersona={persona}
                      />

                      {/* Recruitment & CRM */}
                      <SectionRow label={t("marketing.pricing.section.recruitmentCrm")} />
                      <PersonaGatedRow
                        icon={Users}
                        label={t("marketing.pricing.feature.recruitingCrm")}
                        free
                        pro
                        visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
                        currentPersona={persona}
                      />
                      <PersonaGatedRow
                        icon={Handshake}
                        label={t("marketing.pricing.feature.hiringOnboarding")}
                        free={false}
                        pro
                        visibleFor={[USER_ROLES.EMPLOYER]}
                        currentPersona={persona}
                      />
                      <FeatureRow
                        icon={Calendar}
                        label={t("marketing.pricing.feature.interviewScheduling")}
                        free={t("marketing.pricing.value.basic")}
                        pro={t("marketing.pricing.value.advancedAutomation")}
                      />
                      <FeatureRow
                        icon={BarChart3}
                        label={t("marketing.pricing.feature.performanceMgmt")}
                        free={false}
                        pro
                      />

                      {/* Communication & Outreach */}
                      <SectionRow label={t("marketing.pricing.section.commsOutreach")} />
                      <PersonaGatedRow
                        icon={Send}
                        label={t("marketing.pricing.feature.outreachCampaigns")}
                        free={t("marketing.pricing.value.basic")}
                        pro
                        visibleFor={[USER_ROLES.RECRUITER]}
                        currentPersona={persona}
                      />
                      <FeatureRow
                        icon={MessageCircle}
                        label={t("marketing.pricing.feature.messagePersonalization")}
                        free={t("messages.pricing.value.basicTemplateOnly")}
                        pro={t("marketing.pricing.value.advancedUnlimited")}
                      />
                      <FeatureRow
                        icon={Clock}
                        label={t("marketing.pricing.feature.autoFollowups")}
                        free={false}
                        pro
                      />

                      {/* AI Recruiter Agent v2 + Live Screening — the
                          LinkedIn Hiring Assistant / ZipIntro parity
                          rows. PersonaGatedRow keeps the JSX terse vs
                          the older hand-rolled persona conditionals. */}
                      <PersonaGatedRow
                        icon={Brain}
                        label={t("messages.pricing.feature.recruiterAgentIntake")}
                        free={t("messages.pricing.value.oneRunPerMo")}
                        pro={t("marketing.pricing.value.unlimited")}
                        visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
                        currentPersona={persona}
                      />
                      <PersonaGatedRow
                        icon={Send}
                        label={t("messages.pricing.feature.recruiterAgentSourced")}
                        free={t("messages.pricing.value.threeCandidatesPerRun")}
                        pro={t("messages.pricing.value.upTo50PerRun")}
                        visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
                        currentPersona={persona}
                      />
                      <PersonaGatedRow
                        icon={Clock}
                        label={t("messages.pricing.feature.scheduledFollowups")}
                        free={false}
                        pro
                        visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
                        currentPersona={persona}
                      />
                      <PersonaGatedRow
                        icon={Video}
                        label={t("messages.pricing.feature.liveScreeningBlocks")}
                        free={false}
                        pro
                        visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
                        currentPersona={persona}
                      />
                      <PersonaGatedRow
                        icon={Calendar}
                        label={t("messages.pricing.feature.candidateMagicLinks")}
                        free={false}
                        pro
                        visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
                        currentPersona={persona}
                      />
                      <PersonaGatedRow
                        icon={Users}
                        label={t("marketing.pricing.feature.employeeCommunity")}
                        free={false}
                        pro
                        visibleFor={[USER_ROLES.EMPLOYER]}
                        currentPersona={persona}
                      />

                      {/* Career Home & Community */}
                      <SectionRow label={t("marketing.pricing.section.careerHome")} />
                      <FeatureRow
                        icon={TrendingUp}
                        label={t("marketing.pricing.feature.careerHomeDash")}
                        free
                        pro
                      />
                      <FeatureRow
                        icon={MessageCircle}
                        label={t("marketing.pricing.feature.communityFeed")}
                        free
                        pro
                      />
                      <FeatureRow
                        icon={Lock}
                        label={t("marketing.pricing.feature.privacyControls")}
                        free
                        pro
                      />
                      <FeatureRow
                        icon={Users}
                        label={t("marketing.pricing.feature.professionalNetworking")}
                        free={t("marketing.pricing.value.unlimited")}
                        pro={t("marketing.pricing.value.unlimited")}
                      />
                      <FeatureRow
                        icon={TrendingUp}
                        label={t("marketing.pricing.feature.resilienceTools")}
                        free
                        pro
                      />
                      <FeatureRow
                        icon={Sparkles}
                        label={t("marketing.pricing.feature.creatorStudio")}
                        free
                        pro
                      />
                      <FeatureRow
                        icon={Shield}
                        label={t("marketing.pricing.feature.whiteLabel")}
                        free={t("marketing.pricing.value.hiredBranded")}
                        pro={t("marketing.pricing.value.optOutAvailable")}
                      />
                      <PersonaGatedRow
                        icon={Globe}
                        label={t("marketing.pricing.feature.googleForJobs")}
                        free
                        pro
                        visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
                        currentPersona={persona}
                      />

                      {/* Analytics & Reporting */}
                      <SectionRow label={t("marketing.pricing.section.analyticsReporting")} />
                      <FeatureRow
                        icon={Eye}
                        label={t("marketing.pricing.feature.viewTracking")}
                        free={t("marketing.pricing.value.basic")}
                        pro={t("marketing.pricing.value.advancedViewer")}
                      />
                      <PersonaGatedRow
                        icon={LayoutGrid}
                        label={t("marketing.pricing.feature.conversionFunnel")}
                        free={false}
                        pro
                        visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
                        currentPersona={persona}
                      />
                      <FeatureRow
                        icon={Bell}
                        label={t("marketing.pricing.feature.weeklyDigest")}
                        free
                        pro
                      />
                      <PersonaGatedRow
                        icon={Users}
                        label={t("marketing.pricing.feature.teamLeaderboards")}
                        free={false}
                        pro
                        visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
                        currentPersona={persona}
                      />
                      <FeatureRow
                        icon={BarChart3}
                        label={t("marketing.pricing.feature.dashboardAnalytics")}
                        free={t("marketing.pricing.value.basic")}
                        pro={t("marketing.pricing.value.advancedInsights")}
                      />
                      <FeatureRow
                        icon={TrendingUp}
                        label={t("marketing.pricing.feature.careerProgress")}
                        free={false}
                        pro
                      />
                      <PersonaGatedRow
                        icon={BarChart3}
                        label={t("marketing.pricing.feature.hiringMetrics")}
                        free={false}
                        pro
                        visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
                        currentPersona={persona}
                      />
                      <PersonaGatedRow
                        icon={Clock}
                        label={t("marketing.pricing.feature.timeToHire")}
                        free={false}
                        pro
                        visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
                        currentPersona={persona}
                      />

                      {/* Productivity Features */}
                      <SectionRow label={t("marketing.pricing.section.productivity")} />
                      <FeatureRow
                        icon={CheckSquare}
                        label={t("marketing.pricing.feature.taskManagement")}
                        free={t("marketing.pricing.value.basic")}
                        pro={t("marketing.pricing.value.advancedAutomation")}
                      />
                      <FeatureRow
                        icon={Calendar}
                        label={t("marketing.pricing.feature.calendarIntegration")}
                        free={false}
                        pro
                      />
                      <FeatureRow
                        icon={Mail}
                        label={t("messages.pricing.feature.inboxSyncLabel")}
                        free={false}
                        pro={
                          <>
                            {t("messages.pricing.value.mailboxesIncluded", {
                              count: INBOX_SYNC_INCLUDED_ACCOUNTS,
                            })}
                            <div className="text-xs">
                              {t("messages.pricing.value.perExtraMailbox", {
                                price: INBOX_SYNC_EXTRA_ACCOUNT_PRICE,
                              })}
                            </div>
                          </>
                        }
                        upgradeId="inbox-sync"
                      />
                      <FeatureRow
                        icon={Bell}
                        label={t("marketing.pricing.feature.smartNotifications")}
                        free={t("marketing.pricing.value.basic")}
                        pro={t("marketing.pricing.value.aiPrioritized")}
                        upgradeId="smart-notifications"
                      />

                      {/* Engagement, Learning & Discovery — modules that
                          competitors don't ship at all (gamification cashout,
                          SCORM learning paths, built-in AI/RAG/must-have-skills
                          content library, geo-map discovery, per-section
                          profile gating). These ride on the same Pro seat —
                          no per-module upcharge, no separately-licensed
                          LinkedIn-Learning-style SKU. */}
                      <SectionRow label={t("headings.pricing.section.engagementLearning")} />
                      <FeatureRow
                        icon={Trophy}
                        label={t("messages.pricing.feature.gamification")}
                        free
                        pro
                      />
                      <FeatureRow
                        icon={Trophy}
                        label={t("messages.pricing.feature.giftCardCashout")}
                        free={t("messages.pricing.value.earnPointsOnly")}
                        pro={t("messages.pricing.value.fullCashoutRedemption")}
                      />
                      <FeatureRow
                        icon={GraduationCap}
                        label={t("messages.pricing.feature.learningLibrary")}
                        free={t("messages.pricing.value.browseEnroll")}
                        pro={t("messages.pricing.value.browseEnrollAuthoring")}
                      />
                      <FeatureRow
                        icon={GraduationCap}
                        label={t("messages.pricing.feature.learningPaths")}
                        free={t("messages.pricing.value.browseEnroll")}
                        pro={t("messages.pricing.value.authoringAssign")}
                      />
                      <FeatureRow
                        icon={GraduationCap}
                        label={t("messages.pricing.feature.scormXapi")}
                        free
                        pro
                      />
                      <FeatureRow
                        icon={GraduationCap}
                        label={t("messages.pricing.feature.classrooms")}
                        free={t("messages.pricing.value.joinTrackAssigned")}
                        pro={t("messages.pricing.value.createCohortsMonitor")}
                      />
                      <FeatureRow
                        icon={GraduationCap}
                        label={t("messages.pricing.feature.verifiableCerts")}
                        free={false}
                        pro
                      />
                      <FeatureRow
                        icon={MapPin}
                        label={t("messages.pricing.feature.geoSearch")}
                        free
                        pro
                      />
                      <FeatureRow
                        icon={Lock}
                        label={t("messages.pricing.feature.sectionVisibility")}
                        free
                        pro
                      />

                      {/* Support & Security */}
                      <SectionRow label={t("marketing.pricing.section.compliance")} />
                      <FeatureRow
                        icon={Lock}
                        label={t("marketing.pricing.feature.encryption")}
                        free
                        pro
                      />
                      <FeatureRow
                        icon={Shield}
                        label={t("marketing.pricing.feature.gdpr")}
                        free
                        pro
                      />
                      <FeatureRow
                        icon={Shield}
                        label={t("marketing.pricing.feature.soc2")}
                        free={t("marketing.pricing.value.inProgress")}
                        pro={t("marketing.pricing.value.onRoadmap")}
                      />
                      <FeatureRow
                        icon={Globe}
                        label={t("marketing.pricing.feature.dataResidency")}
                        free={false}
                        pro={t("marketing.pricing.value.onRoadmap")}
                      />
                      <FeatureRow
                        icon={Lock}
                        label={t("marketing.pricing.feature.sso")}
                        free={false}
                        pro={t("marketing.pricing.value.onRoadmap")}
                      />
                      <FeatureRow
                        icon={Shield}
                        label={t("marketing.pricing.feature.auditLogs")}
                        free={false}
                        pro
                      />
                      <FeatureRow
                        icon={MessageCircle}
                        label={t("marketing.pricing.feature.customerSupport")}
                        free={t("marketing.pricing.value.email48h")}
                        pro={t("marketing.pricing.value.priorityChat4h")}
                      />
                      <FeatureRow
                        icon={Users}
                        label={t("marketing.pricing.feature.csm")}
                        free={false}
                        pro={t("marketing.pricing.value.onRoadmap")}
                      />
                      <FeatureRow
                        icon={Globe}
                        label={t("marketing.pricing.feature.apiAccess")}
                        free={false}
                        pro
                      />
                      <FeatureRow
                        icon={Zap}
                        label={t("marketing.pricing.feature.customIntegrations")}
                        free={false}
                        pro
                      />
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>

            {/* How Hired.Video compares to LOXO / LinkedIn / Greenhouse /
                Bullhorn / HireVue / VidCruiter. Same component the dedicated
                /vs-competitors page renders — single source of truth so the
                two pages can't drift on vendor pricing or feature claims. */}
            <div className="mb-16">
              <CompetitorComparison
                eyebrow={t("messages.pricing.vsMarketEyebrow")}
                showSectionHeader
              />
            </div>

            {/* FAQ & Support Section — every CTA opens the shared
                <ContactPanel> slide-out so inquiries land in
                marketing_leads + notify every super_admin. DRY anchor:
                no per-card form duplication. */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
              <Card className="text-center p-6 hover:shadow-lg transition-shadow">
                <MessageCircle className="h-12 w-12 mx-auto mb-4 text-primary" />
                <h3 className="font-semibold text-lg mb-2">
                  {t("marketing.pricing.support.infoTitle")}
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {t("marketing.pricing.support.infoBody")}
                </p>
                <Button
                  variant="outline"
                  onClick={() =>
                    openContactPanel({
                      inquiryType: "sales",
                      title: t("messages.pricing.contact.salesTitle"),
                      description: t("messages.pricing.contact.salesDescription"),
                    })
                  }
                >
                  {t("marketing.pricing.support.talkToUs")}
                </Button>
              </Card>

              <Card className="text-center p-6 hover:shadow-lg transition-shadow">
                <Play className="h-12 w-12 mx-auto mb-4 text-primary" />
                <h3 className="font-semibold text-lg mb-2">{t("marketing.pricing.support.demoTitle")}</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {t("marketing.pricing.support.demoBody")}
                </p>
                <Button
                  variant="outline"
                  onClick={() =>
                    openContactPanel({
                      inquiryType: "demo",
                      subjectLocked: true,
                    })
                  }
                >
                  {t("marketing.pricing.support.requestDemo")}
                </Button>
              </Card>

              <Card className="text-center p-6 hover:shadow-lg transition-shadow border-green-200">
                <Heart className="h-12 w-12 mx-auto mb-4 text-green-600" />
                <h3 className="font-semibold text-lg mb-2">
                  {t("marketing.pricing.support.startupTitle")}
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {t("marketing.pricing.support.startupBody")}
                </p>
                <Button
                  variant="outline"
                  className="border-green-200 text-green-700 hover:bg-green-50"
                  onClick={() =>
                    openContactPanel({
                      inquiryType: "nonprofit_discount",
                      subjectLocked: true,
                      prefillMessage: t(
                        "messages.pricing.contact.nonprofitPrefill",
                      ),
                    })
                  }
                >
                  {t("marketing.pricing.support.contactReduced")}
                </Button>
              </Card>
            </div>

            {/* FAQ — generates FAQPage JSON-LD for Google/Bing/AI rich results */}
            <MarketingFAQ
              schemaId="pricing"
              heading={t("marketing.pricing.faqHeading")}
              subheading={t("marketing.pricing.faqSubheading")}
              items={[
                {
                  question: t("faq.pricing.cost.q"),
                  answer: t("faq.pricing.cost.a", {
                    monthly: basePrice,
                    yearly: PRO_YEARLY_PRICE,
                  }),
                },
                {
                  question: t("faq.pricing.freePlan.q"),
                  answer: t("faq.pricing.freePlan.a"),
                },
                {
                  question: t("faq.pricing.tryPro.q"),
                  answer: t("faq.pricing.tryPro.a"),
                },
                {
                  question: t("faq.pricing.tokens.q"),
                  answer: t("faq.pricing.tokens.a"),
                },
                {
                  question: t("faq.pricing.teamPricing.q"),
                  answer: t("faq.pricing.teamPricing.a"),
                },
                {
                  question: t("faq.pricing.peopleOps.q"),
                  answer: t("faq.pricing.peopleOps.a"),
                },
                {
                  question: t("faq.pricing.cancel.q"),
                  answer: t("faq.pricing.cancel.a"),
                },
                {
                  question: t("faq.pricing.annualDiscount.q"),
                  answer: t("faq.pricing.annualDiscount.a", {
                    monthly: basePrice,
                    yearly: PRO_YEARLY_PRICE,
                    monthlyEquivalent: (PRO_YEARLY_PRICE / 12).toFixed(2),
                  }),
                },
              ]}
            />

            {/* Trust Signals */}
            <div className="text-center bg-gradient-to-r from-brand-purple/10 to-brand-blue/10 p-8 rounded-2xl">
              <h3 className="text-2xl font-bold mb-4">
                {t("marketing.pricing.trustHeading")}
              </h3>
              <p className="text-muted-foreground mb-6">
                {t("marketing.pricing.trustBody")}
              </p>
              <div className="flex items-center justify-center gap-8 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  {TRUST_SIGNALS.SECURITY}
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  {TRUST_SIGNALS.SUPPORT}
                </div>
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4" />
                  {TRUST_SIGNALS.RATING}
                </div>
              </div>
            </div>
          </div>
</div>
</AppShell>
  );
}

// ─── Shared feature-row helpers ───────────────────────────────────────────────
//
// The pricing comparison table used to hand-roll a ~20-line `<tr>` block for
// every feature row (icon + label, free cell, pro cell). Per the DRY rule
// (`feedback_extract_on_duplication`), one helper now owns the row shape:
// adding a feature is a single `<FeatureRow …>` declaration. Free/Pro cells
// accept either a string ("Unlimited", "1 published") OR `true` / `false`
// (rendered as a green check / em-dash) so callers don't repeat the
// inline-check JSX. The shared CellValue helper renders both shapes — one
// place owns the visual contract for the whole table.

interface FeatureRowProps {
  icon: ComponentType<{ className?: string }>;
  label: ReactNode;
  free: ReactNode | boolean;
  pro: ReactNode | boolean;
  /** Optional `data-upgrade-id` for `/pricing?upgrade=<slug>` deep links
   *  (gap #810). Matching `UpgradeSlug` values smooth-scroll this row into
   *  view + apply the highlight ring. */
  upgradeId?: UpgradeSlug;
}

function FeatureRow({ icon: Icon, label, free, pro, upgradeId }: FeatureRowProps) {
  return (
    <tr
      data-upgrade-id={upgradeId}
      className={
        upgradeId
          ? "data-[upgrade-active=true]:bg-primary/10 data-[upgrade-active=true]:ring-2 data-[upgrade-active=true]:ring-primary/40 transition-colors"
          : undefined
      }
    >
      <td className="p-4 flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        {label}
      </td>
      <CellValue value={free} />
      <CellValue value={pro} />
    </tr>
  );
}

/** Single source of truth for "what does a feature-cell look like". A boolean
 *  `true` renders the green check; `false` renders the em-dash placeholder
 *  (the visual idiom every row in the table already used hand-rolled). Any
 *  other value renders as muted text. */
function CellValue({ value }: { value: ReactNode | boolean }) {
  if (value === true) {
    return (
      <td className="text-center p-4">
        <Check className="h-5 w-5 text-green-600 mx-auto" />
      </td>
    );
  }
  if (value === false) {
    return (
      <td className="text-center p-4">
        <span className="text-muted-foreground">—</span>
      </td>
    );
  }
  return <td className="text-center p-4 text-sm text-muted-foreground">{value}</td>;
}

/** Persona-gated row. Shows the row but renders the cells as em-dashes
 *  when the active persona isn't in `visibleFor`. DRY anchor for any
 *  recruiter-only / employer-only / job-seeker-only feature row so we
 *  stop hand-rolling the `persona === "recruiter" ? <Check /> : <—/>`
 *  pattern that 8 raw rows in this file still use (gap register entry).
 *  Use this for any new persona-specific feature. */
function PersonaGatedRow({
  icon,
  label,
  free,
  pro,
  visibleFor,
  currentPersona,
}: FeatureRowProps & { visibleFor: string[]; currentPersona: string }) {
  const visible = visibleFor.includes(currentPersona);
  return (
    <FeatureRow
      icon={icon}
      label={label}
      free={visible ? free : false}
      pro={visible ? pro : false}
    />
  );
}

/** Section heading row spanning all three table columns. One helper so the
 *  font / color / spacing of every section header in the comparison table
 *  stays in lockstep. */
function SectionRow({ label }: { label: string }) {
  return (
    <tr className="bg-muted/20">
      <td
        className="p-4 font-semibold text-sm uppercase tracking-wide"
        colSpan={3}
      >
        {label}
      </td>
    </tr>
  );
}
