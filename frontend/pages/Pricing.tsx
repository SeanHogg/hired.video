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
  const inboxSyncFeature = (perUserSuffix = ""): string =>
    `Inbox Sync — Gmail / Outlook (${INBOX_SYNC_INCLUDED_ACCOUNTS} mailboxes${perUserSuffix}, +$${INBOX_SYNC_EXTRA_ACCOUNT_PRICE}/mo each)`;

  const personaCopy: Partial<Record<
    UserRole,
    {
      label: string;
      freeDescription: string;
      proDescription: string;
      freeFeatures: string[];
      proFeatures: string[];
      unitLabel: string; // e.g., per seat / month
      userCountLabel: string; // label for the user count selector
    }
  >> = {
    [USER_ROLES.JOB_SEEKER]: {
      label: "Job Seeker",
      freeDescription:
        "Get started with the AI Studio (video / comic / game / podcast), the Chrome extension, and your career home.",
      proDescription:
        "Unlock 1M monthly AI tokens, voice cloning, every Pro export format (4K video, PDF / CBZ comics, motion-comic MP4), and priority matching.",
      freeFeatures: [
        "1 published pitch — video, comic, game, or podcast (unlimited drafts)",
        "ATS-friendly resume builder + AI scoring + Resume Roast viral share",
        "Chrome extension — job tracking & match scoring",
        "Profile Sync — one master resume to LinkedIn / Indeed / Glassdoor / ZipRecruiter / Monster / Wellfound / Dice / GitHub (extension auto-fills Headline + Summary on 7)",
        "50K AI tokens / mo",
        "Career Home dashboard & community feed",
        "Unlimited networking — connections, followers, warm intros through mutuals, coffee meetups & free DMs to any user (no InMail credits)",
        "Apply to jobs with video / comic intros + 1-click Auto-Apply (Pro-gated for bulk)",
        "AI Studio — 1080p video, PNG-strip comic export (with watermark)",
        "AI interview practice (limited) + AI Coach / Career360 gap analysis",
        "Public profile + per-section visibility controls (10 gateable sections)",
        "Gamification — points, streaks, badges (cashout requires Pro)",
        "Map + globe discovery (jobs, events, people, articles)",
      ],
      proFeatures: [
        "Unlimited published projects across every format",
        "1M AI tokens / mo + pay-as-you-go top-up packs ($3.99–$199.99)",
        "AI Studio — Brand Kits, 4K video, PDF / CBZ comic, motion-comic MP4, watermark-free",
        "Voice cloning + earn 95/5 on voice marketplace sales",
        "Stock media library (Unsplash + Pexels + Pixabay) with dedup",
        "One-click publishing — YouTube, Webtoon, itch.io, LinkedIn post AI",
        "Resume Tailor (per-job JSON-preserving variations) + ATS package generator",
        "Unlimited AI interview practice + async interview recorder",
        "Learning Pathways — SCORM 1.2, xAPI, HMAC-verified certificates",
        "Priority job matching, salary insights, hiring-pipeline analytics",
        "Project + profile analytics, per-second engagement heatmap, AI thumbnails, hook optimizer",
        "Gift-card cashout (Tremendous) + AI-credit & premium-month redemption",
        inboxSyncFeature(),
      ],
      unitLabel: "per month",
      userCountLabel: "",
    },
    [USER_ROLES.RECRUITER]: {
      label: "recruiter",
      freeDescription:
        "Essential ATS, Chrome sourcing, and visual pipeline for individual recruiters.",
      proDescription:
        "Scale your team with AI candidate matching, automation, and analytics.",
      freeFeatures: [
        "Applicant Tracking System (ATS) + visual Kanban pipeline",
        "Unlimited job postings (Google for Jobs structured-data indexed)",
        "Recruiter Chrome extension — Loxo-Boost-parity capture with personal email + phone + LinkedIn/GitHub/X/website enrichment, bulk capture from search-result pages, lists + call queues, outreach sequences, click-to-call (recorded VoIP), and the interactive 🪄 picker",
        "Unlimited searchable talent pool + Boolean operators (AND/OR/NOT/quoted)",
        "Basic interview scheduling (1-way calendar)",
        "Up to 2 team members",
        "50K AI tokens / mo",
        "Map + globe discovery (geo-tagged talent feed)",
        "Real-time chat with presence + typing indicators",
      ],
      proFeatures: [
        "Unlimited talent pool & candidate imports",
        "AI candidate ↔ job match scoring + bulk resume scoring & screening",
        "Smart outreach campaigns, follow-up sequences, AI message personalization",
        "Two-way calendar sync (Google + Outlook) with interview-slot generator",
        "Video resume screening + transcript search",
        "Structured scorecards + interview kits + competency framework with leveled rubrics",
        "Calibration sessions — re-score past candidates blind, see per-attribute deltas vs. real decisions",
        "Blind / anonymous review mode — hide candidate identity + peer scorecards from evaluators until they submit",
        "Bias linter — inline LLM flags coded-language ('culture fit', gendered descriptors) while scorecards are written",
        "Take-home assignments — candidate magic-link delivery + reviewer scorecard binding",
        "Scorecard SLAs + interviewer reliability tracking (on-time %, avg lag, overdue count)",
        "AI question generator — calibrated to competency + level (closes rubric/question coverage gaps)",
        "Validated AI hiring assessments — Big Five (IPIP), cognitive, SJT, EQ, DISC",
        "Async interview recorder + reviewer (Frame.io-style time-coded comments)",
        "Exclusive job boards + bidding marketplace (recruiter auction)",
        "ATS connectors — Greenhouse, Lever, Workday (HMAC-verified webhooks)",
        "Performance dashboards, time-to-hire benchmarks, audit log",
        "Public API + OpenAPI 3.1 spec (SHA-256 hashed API keys)",
        "Unlimited seats & team collaboration · gamification leaderboards + cashout",
        inboxSyncFeature(" per seat"),
      ],
      unitLabel: "per seat / month",
      userCountLabel: "Seats",
    },
    [USER_ROLES.EMPLOYER]: {
      label: "employer",
      freeDescription:
        "Core HR tools to start hiring with a video-first candidate experience.",
      proDescription:
        "All-in-one HR suite with engagement, onboarding, and advanced analytics.",
      freeFeatures: [
        "ATS + unlimited job postings (Google for Jobs structured-data indexed)",
        "Recruiting & Sales CRM",
        "Video resume screening",
        "Recruiter Chrome extension",
        "1 admin user · up to 2 employees",
        "50K AI tokens / mo",
        "Employer-branded company profile + follow system",
      ],
      proFeatures: [
        "Unlimited users + multi-tenant org structure",
        "Employee community (Engage / Inform / Inspire) + company-wide feed",
        "People Operations (CHRO) — roster & org chart, 1:1s with action items, team health",
        "Embeddable — render your roster, 1:1s & hiring surfaces inside your own app (segment-isolated)",
        "Hiring & onboarding — offer letters via Dropbox Sign, onboarding checklists",
        "Performance management — OKRs, review cycles, employee sign-off",
        "Company video promos via AI Studio + Brand Kits + company-wide templates",
        "In-video lead-capture forms (Wistia Turnstile equivalent) → unified inbox",
        "Async interview tool — record once, share to many candidates",
        "Learning Pathways — author SCORM 1.2 / xAPI / verifiable certificates for employees",
        "Classrooms — group employees into cohorts, assign required training with due dates, monitor completion + overdue live",
        "Two-way calendar + smart notifications (priority-ranked)",
        "ATS connectors (Greenhouse, Lever, Workday) + OpenAPI 3.1 public API",
        inboxSyncFeature(" per user"),
        "White-label tenant — subdomain, custom branding, dedicated portal",
        "Advanced analytics — time-to-hire, DEI funnel, source mix, account audit log",
        "GDPR / CCPA compliance + data-residency policy (SOC 2 on the roadmap)",
        "Affiliate program for talent referrals (tiered 10–25% commission)",
      ],
      unitLabel: "per user / month",
      userCountLabel: "Users",
    },


    [USER_ROLES.ADMIN]: {
      label: "admin",
      freeDescription: "Administrative access to manage the platform.",
      proDescription:
        "Full administrative control with advanced management features.",
      freeFeatures: [
        "User management",
        "Basic analytics",
        "System configuration",
        "Support access",
      ],
      proFeatures: [
        "Advanced user management",
        "Full system analytics",
        "API access",
        "Priority support",
        "Custom integrations",
      ],
      unitLabel: "per admin / month",
      userCountLabel: "Admins",
    },


  };

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
      name: "Pro Plan",
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
                Simple, Transparent Pricing
              </h1>
              <p className="text-sm text-muted-foreground">
                All-in-one HR platform — social, referrals, ATS, CRM,
                crowdsourcing, and recruitment marketing.
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
                      <Users className="h-4 w-4 mr-2" /> Job Seeker
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value={USER_ROLES.RECRUITER}
                      className="rounded-full px-3 py-1.5 text-sm data-[state=on]:bg-gradient-to-r data-[state=on]:from-brand-purple data-[state=on]:to-brand-blue data-[state=on]:text-white"
                    >
                      <Briefcase className="h-4 w-4 mr-2" /> Recruiter
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value={USER_ROLES.EMPLOYER}
                      className="rounded-full px-3 py-1.5 text-sm data-[state=on]:bg-gradient-to-r data-[state=on]:from-brand-purple data-[state=on]:to-brand-blue data-[state=on]:text-white"
                    >
                      <Building2 className="h-4 w-4 mr-2" /> Employer
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Label
                  htmlFor="billing-toggle"
                  className={!isAnnual ? "font-semibold" : ""}
                >
                  Monthly
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
                  Annual
                  <Badge variant="secondary" className="ml-2">
                    Save 20%
                  </Badge>
                </Label>
              </div>

              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Shield className="h-3.5 w-3.5" />
                  No hidden fees
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  Cancel anytime
                </span>
              </div>
            </div>

            {/* Pricing Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
              {/* Free Plan */}
              <Card className="relative border-2 border-border hover:border-primary/20 transition-colors">
                <CardHeader className="text-center pb-8">
                  <CardTitle className="text-2xl">Free</CardTitle>
                  <div className="mt-4">
                    <span className="text-5xl font-bold">$0.00</span>
                  </div>
                  <CardDescription className="text-lg mt-4">
                    {personaCopy[persona].freeDescription}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <h4 className="font-semibold text-lg">What's included:</h4>
                    <div className="space-y-3">
                      {personaCopy[persona].freeFeatures.map((feat) => (
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
                          Get Started
                        </Button>
                      </Link>
                    ) : (
                      <Button className="w-full" variant="outline" size="lg">
                        Current Plan
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Pro Plan */}
              <Card className="relative border-2 border-primary shadow-lg">
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <Badge className="bg-gradient-to-r from-brand-purple to-brand-blue text-white px-4 py-1">
                    Most Popular
                  </Badge>
                </div>
                <CardHeader className="text-center pb-8">
                  <CardTitle className="text-2xl">Pro</CardTitle>

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
                        / {personaCopy[persona].unitLabel}
                        {isAnnual ? " (billed annually)" : ""}
                      </span>
                      {isAnnual && (
                        <div className="text-sm text-green-600 mt-2">
                          Save $
                          {(
                            calculatePrice(selectedUsers, false) * 12 -
                            calculatePrice(selectedUsers, true)
                          ).toFixed(2)}{" "}
                          per year!
                        </div>
                      )}
                    </div>

                    {/* Seats selector only for recruiter/employer */}
                    {persona !== USER_ROLES.JOB_SEEKER && (
                      <div className="flex items-center justify-center gap-4">
                        <Label htmlFor="user-select">
                          {personaCopy[persona].userCountLabel ||
                            "Number of users"}
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
                    {personaCopy[persona].proDescription}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <h4 className="font-semibold text-lg">
                      All FREE features plus:
                    </h4>
                    <div className="space-y-3">
                      {personaCopy[persona].proFeatures.map((feat) => (
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
                          Get Started
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
                        Add to Cart - $
                        {isAnnual
                          ? (calculatePrice(selectedUsers, true) / 12).toFixed(
                              2,
                            )
                          : calculatePrice(selectedUsers, false).toFixed(2)}
                        /month
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Feature Comparison */}
            <div className="mb-16">
              <h2 className="text-3xl font-bold text-center mb-12">
                Compare Features
              </h2>
              <div className="text-center mb-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border text-sm">
                  <span className="text-muted-foreground">
                    Viewing features for
                  </span>
                  <span className="font-medium">
                    {personaCopy[persona].label}
                  </span>
                </div>
              </div>

              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left p-4 font-semibold">
                          Features
                        </th>
                        <th className="text-center p-4 font-semibold">Free</th>
                        <th className="text-center p-4 font-semibold">Pro</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {/* Core Platform Features */}
                      <tr className="bg-muted/20">
                        <td
                          className="p-4 font-semibold text-sm uppercase tracking-wide"
                          colSpan={3}
                        >
                          Core Platform
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Briefcase className="h-4 w-4 text-muted-foreground" />
                          Applicant Tracking System (ATS)
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          Job Postings
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          {persona === USER_ROLES.JOB_SEEKER
                            ? "—"
                            : "Unlimited"}
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          {persona === USER_ROLES.RECRUITER
                            ? "Unlimited + Exclusive"
                            : persona === USER_ROLES.EMPLOYER
                              ? "Unlimited"
                              : "—"}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          Team Size
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          {persona === USER_ROLES.JOB_SEEKER
                            ? "1"
                            : persona === USER_ROLES.RECRUITER
                              ? "Up to 2"
                              : "Up to 2"}
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          {persona === USER_ROLES.JOB_SEEKER
                            ? "1"
                            : "Unlimited"}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          Admin Users
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          {persona === USER_ROLES.JOB_SEEKER ? "1" : "1"}
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          {persona === USER_ROLES.JOB_SEEKER
                            ? "1"
                            : "Unlimited"}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          Applicants & Contacts
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          Unlimited
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          Unlimited
                        </td>
                      </tr>

                      {/* Browser Extensions */}
                      <tr className="bg-muted/20">
                        <td
                          className="p-4 font-semibold text-sm uppercase tracking-wide"
                          colSpan={3}
                        >
                          Browser Extensions (Chrome / Edge / Brave)
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Chrome className="h-4 w-4 text-muted-foreground" />
                          Job Seeker Chrome Extension
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Chrome className="h-4 w-4 text-muted-foreground" />
                          Recruiter Chrome Extension
                        </td>
                        <td className="text-center p-4">
                          {persona === USER_ROLES.JOB_SEEKER ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <Check className="h-5 w-5 text-green-600 mx-auto" />
                          )}
                        </td>
                        <td className="text-center p-4">
                          {persona === USER_ROLES.JOB_SEEKER ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <Check className="h-5 w-5 text-green-600 mx-auto" />
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Target className="h-4 w-4 text-muted-foreground" />
                          One-click job tracking from 16+ boards
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Zap className="h-4 w-4 text-muted-foreground" />
                          Auto-detect job banners
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Target className="h-4 w-4 text-muted-foreground" />
                          AI resume ↔ job match scoring (in-extension)
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          Included · uses AI tokens
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          Unlimited
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-muted-foreground" />
                          AI resume tailoring per job (in-extension)
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          Included · uses AI tokens
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          Unlimited
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          Candidate profile extraction (LinkedIn, Indeed)
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          {persona === USER_ROLES.JOB_SEEKER
                            ? "—"
                            : "Included · uses AI tokens"}
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          {persona === USER_ROLES.JOB_SEEKER
                            ? "—"
                            : "Unlimited"}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          Company page extraction (LinkedIn, Glassdoor)
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          {persona === USER_ROLES.JOB_SEEKER
                            ? "—"
                            : "Included · uses AI tokens"}
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          {persona === USER_ROLES.JOB_SEEKER
                            ? "—"
                            : "Unlimited"}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          Personal email + phone + social URL enrichment on capture
                        </td>
                        <td className="text-center p-4">
                          {persona === USER_ROLES.JOB_SEEKER ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <Check className="h-5 w-5 text-green-600 mx-auto" />
                          )}
                        </td>
                        <td className="text-center p-4">
                          {persona === USER_ROLES.JOB_SEEKER ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <Check className="h-5 w-5 text-green-600 mx-auto" />
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <ListChecks className="h-4 w-4 text-muted-foreground" />
                          Bulk capture from LinkedIn / Indeed / GitHub search results (up to 25/click)
                        </td>
                        <td className="text-center p-4">
                          {persona === USER_ROLES.JOB_SEEKER ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <Check className="h-5 w-5 text-green-600 mx-auto" />
                          )}
                        </td>
                        <td className="text-center p-4">
                          {persona === USER_ROLES.JOB_SEEKER ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <Check className="h-5 w-5 text-green-600 mx-auto" />
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          Click-to-call (recorded VoIP via SignalWire)
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          {persona === USER_ROLES.JOB_SEEKER
                            ? "—"
                            : "Requires phone number"}
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          {persona === USER_ROLES.JOB_SEEKER
                            ? "—"
                            : "100 min/mo included"}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          Lists + Call Queues (add from extension picker)
                        </td>
                        <td className="text-center p-4">
                          {persona === USER_ROLES.JOB_SEEKER ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <Check className="h-5 w-5 text-green-600 mx-auto" />
                          )}
                        </td>
                        <td className="text-center p-4">
                          {persona === USER_ROLES.JOB_SEEKER ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <Check className="h-5 w-5 text-green-600 mx-auto" />
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Send className="h-4 w-4 text-muted-foreground" />
                          Outreach sequence enrollment from extension
                        </td>
                        <td className="text-center p-4">
                          {persona === USER_ROLES.JOB_SEEKER ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <Check className="h-5 w-5 text-green-600 mx-auto" />
                          )}
                        </td>
                        <td className="text-center p-4">
                          {persona === USER_ROLES.JOB_SEEKER ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <Check className="h-5 w-5 text-green-600 mx-auto" />
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Wand2 className="h-4 w-4 text-muted-foreground" />
                          Interactive 🪄 picker (job / profile / company modes with replay)
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          Application tracking — which resume went where
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                      </tr>

                      {/* AI Studio — multi-format (video / comics / games /
                          podcasts / voice / animation). Section header reads
                          from MEDIA_KIND_UI labels via listShippableKindPitches
                          so adding a kind ripples into the per-kind capability
                          rows below automatically. Each row uses the shared
                          <FeatureRow> helper (DRY anchor for the whole
                          comparison table) — adding a feature is one line. */}
                      <SectionRow label="AI Studio (Video, Comics, Games, Podcasts)" />

                      <FeatureRow
                        icon={Sparkles}
                        label="AI script & storyboard generation (every format)"
                        free
                        pro
                      />
                      <FeatureRow
                        icon={Sparkles}
                        label="AI-generated drafts (videos, comics, games, podcasts)"
                        free="Unlimited (token budget gated)"
                        pro="Unlimited"
                      />
                      <FeatureRow
                        icon={Share2}
                        label="Published / downloadable projects"
                        free="1 published"
                        pro="Unlimited"
                      />
                      <FeatureRow
                        icon={LayoutGrid}
                        label="Built-in templates & themes (every format)"
                        free="Basic (3 video + starter comic / game / podcast)"
                        pro={TIER_COPY.proCollectionLabel("Full library + premium")}
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
                          pro="All templates + Pro export options"
                        />
                      ))}

                      <FeatureRow
                        icon={Zap}
                        label="Animated scenes & motion presets (video / animation)"
                        free="Minimal only"
                        pro="Minimal / Moderate / Cinematic"
                      />
                      <FeatureRow
                        icon={Palette}
                        label="Brand Kits — colors, logo, fonts"
                        free={false}
                        pro
                        upgradeId="brand-kit"
                      />
                      <FeatureRow icon={Download} label="720p video export" free pro />
                      <FeatureRow icon={Download} label="1080p video export" free pro />
                      <FeatureRow
                        icon={Download}
                        label="4K video + PDF / CBZ comic export"
                        free={false}
                        pro
                      />
                      <FeatureRow
                        icon={Video}
                        label="Vertical 9:16 export (TikTok, Reels, LinkedIn)"
                        free={false}
                        pro
                      />
                      <FeatureRow
                        icon={Shield}
                        label="Watermark"
                        free="hired.video watermark"
                        pro="Watermark-free"
                      />
                      <FeatureRow
                        icon={Mic}
                        label="AI voice cloning (your own voice)"
                        free={false}
                        pro
                        upgradeId="voice-clone"
                      />
                      <FeatureRow
                        icon={Mic}
                        label="Voice Marketplace (Kokoro, Piper, VibeVoice)"
                        free="1 free voice (Web Speech)"
                        pro="Full marketplace + creator revenue share"
                      />
                      <FeatureRow
                        icon={Share2}
                        label="One-click publishing — YouTube, Webtoon, itch.io"
                        free={false}
                        pro
                      />
                      <FeatureRow
                        icon={Sparkles}
                        label="LinkedIn Post AI (hook, caption, hashtags)"
                        free={false}
                        pro
                      />
                      <FeatureRow
                        icon={Share2}
                        label="Public share link, embed code & QR code"
                        free
                        pro
                      />
                      <FeatureRow
                        icon={BarChart3}
                        label="View analytics & engagement (every format)"
                        free="Basic (views only)"
                        pro="Advanced (heatmaps, CTA clicks, campaigns)"
                      />

                      {/* Reviews & Salary Insights — cross-persona surface
                          that closes the Glassdoor / Indeed-salary parity
                          gap. Every persona sees the same rows: job
                          seekers research employers, employers manage
                          their reputation, recruiters cite real pay
                          bands when sourcing. */}
                      <SectionRow label="Company Reviews & Salary Insights" />
                      <FeatureRow
                        icon={Star}
                        label="Browse company reviews (multi-axis ratings)"
                        free
                        pro
                      />
                      <FeatureRow
                        icon={Star}
                        label="Write a verified employee review"
                        free={false}
                        pro
                      />
                      <FeatureRow
                        icon={TrendingUp}
                        label="Salary guides by role"
                        free
                        pro
                      />
                      <FeatureRow
                        icon={Globe}
                        label="Salary guides by role × city (e.g. SF software engineer)"
                        free
                        pro
                      />
                      <FeatureRow
                        icon={TrendingUp}
                        label="AI salary negotiation script (your offer vs market)"
                        free={false}
                        pro
                      />
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          Resume Optimization
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          AI-Powered (3/mo)
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          AI-Powered (Unlimited)
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Download className="h-4 w-4 text-muted-foreground" />
                          ATS-friendly PDF & Word (.docx) export
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                      </tr>

                      {/* AI-Powered Tools */}
                      <tr className="bg-muted/20">
                        <td
                          className="p-4 font-semibold text-sm uppercase tracking-wide"
                          colSpan={3}
                        >
                          AI-Powered Tools
                        </td>
                      </tr>
                      <tr
                        data-upgrade-id="ai-tokens"
                        className="data-[upgrade-active=true]:bg-primary/10 data-[upgrade-active=true]:ring-2 data-[upgrade-active=true]:ring-primary/40 transition-colors"
                      >
                        <td className="p-4 flex items-center gap-2">
                          <Brain className="h-4 w-4 text-muted-foreground" />
                          AI Assistance
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          50K tokens / mo
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          1M tokens / mo
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Target className="h-4 w-4 text-muted-foreground" />
                          Smart Job Matching
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          Basic
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          AI-Enhanced
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <MessageCircle className="h-4 w-4 text-muted-foreground" />
                          AI Interview Simulator
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          Basic (3/mo)
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          Advanced
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <BarChart3 className="h-4 w-4 text-muted-foreground" />
                          AI Resume Scoring & Feedback
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          Basic (preview only)
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          Advanced (Unlimited)
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          Salary Calculator
                        </td>
                        <td className="text-center p-4">
                          <span className="text-muted-foreground">—</span>
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-muted-foreground" />
                          AI Resume Tailor — per-job variations
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          3 variations / mo
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          Unlimited
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          AI Resume Consolidator — merge multiple resumes
                        </td>
                        <td className="text-center p-4">
                          <span className="text-muted-foreground">—</span>
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Zap className="h-4 w-4 text-muted-foreground" />
                          AI Resume Roast — brutally honest feedback
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          3 roasts / mo
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          Unlimited
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          AI Resume Summarizer
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          5 summaries / mo
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          Unlimited
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Target className="h-4 w-4 text-muted-foreground" />
                          AI Value Proposition Builder
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          3 pitches / mo
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          Unlimited
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Brain className="h-4 w-4 text-muted-foreground" />
                          AI Sentiment & Tone Analysis
                        </td>
                        <td className="text-center p-4">
                          <span className="text-muted-foreground">—</span>
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          PDF → JSON resume parser
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          5 parses / mo
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          Unlimited
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <MessageCircle className="h-4 w-4 text-muted-foreground" />
                          24/7 AI Career Coach (chat)
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          20 messages / mo
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          Unlimited
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-muted-foreground" />
                          AI Next-Best-Action recommendations
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          Daily
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          Real-time
                        </td>
                      </tr>

                      {/* Sourcing & Talent Pipeline — recruiter / employer */}
                      <tr className="bg-muted/20">
                        <td
                          className="p-4 font-semibold text-sm uppercase tracking-wide"
                          colSpan={3}
                        >
                          Sourcing & Talent Pipeline
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Search className="h-4 w-4 text-muted-foreground" />
                          Searchable talent pool
                        </td>
                        <td className="text-center p-4">
                          {persona === USER_ROLES.JOB_SEEKER ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              Unlimited
                            </span>
                          )}
                        </td>
                        <td className="text-center p-4">
                          {persona === USER_ROLES.JOB_SEEKER ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              Unlimited
                            </span>
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <LayoutGrid className="h-4 w-4 text-muted-foreground" />
                          Visual Kanban hiring pipeline (6 stages)
                        </td>
                        <td className="text-center p-4">
                          {persona === USER_ROLES.JOB_SEEKER ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <Check className="h-5 w-5 text-green-600 mx-auto" />
                          )}
                        </td>
                        <td className="text-center p-4">
                          {persona === USER_ROLES.JOB_SEEKER ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <Check className="h-5 w-5 text-green-600 mx-auto" />
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Target className="h-4 w-4 text-muted-foreground" />
                          AI candidate ↔ job match scoring
                        </td>
                        <td className="text-center p-4">
                          <span className="text-muted-foreground">—</span>
                        </td>
                        <td className="text-center p-4">
                          {persona === USER_ROLES.JOB_SEEKER ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <Check className="h-5 w-5 text-green-600 mx-auto" />
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          Candidate tags, notes & custom fields
                        </td>
                        <td className="text-center p-4">
                          {persona === USER_ROLES.JOB_SEEKER ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <Check className="h-5 w-5 text-green-600 mx-auto" />
                          )}
                        </td>
                        <td className="text-center p-4">
                          {persona === USER_ROLES.JOB_SEEKER ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <Check className="h-5 w-5 text-green-600 mx-auto" />
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Search className="h-4 w-4 text-muted-foreground" />
                          Saved searches & talent lists
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          {persona === USER_ROLES.JOB_SEEKER
                            ? "—"
                            : "Up to 3"}
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          {persona === USER_ROLES.JOB_SEEKER
                            ? "—"
                            : "Unlimited"}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Send className="h-4 w-4 text-muted-foreground" />
                          In-app candidate messaging & outreach log
                        </td>
                        <td className="text-center p-4">
                          <span className="text-muted-foreground">—</span>
                        </td>
                        <td className="text-center p-4">
                          {persona === USER_ROLES.JOB_SEEKER ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <Check className="h-5 w-5 text-green-600 mx-auto" />
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Video className="h-4 w-4 text-muted-foreground" />
                          Video resume transcript search
                        </td>
                        <td className="text-center p-4">
                          <span className="text-muted-foreground">—</span>
                        </td>
                        <td className="text-center p-4">
                          {persona === USER_ROLES.JOB_SEEKER ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <Check className="h-5 w-5 text-green-600 mx-auto" />
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Download className="h-4 w-4 text-muted-foreground" />
                          Bulk CSV import / export to ATS
                        </td>
                        <td className="text-center p-4">
                          <span className="text-muted-foreground">—</span>
                        </td>
                        <td className="text-center p-4">
                          {persona === USER_ROLES.JOB_SEEKER ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <Check className="h-5 w-5 text-green-600 mx-auto" />
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          Company database (extracted + manual)
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          {persona === USER_ROLES.JOB_SEEKER
                            ? "—"
                            : "Up to 50"}
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          {persona === USER_ROLES.JOB_SEEKER
                            ? "—"
                            : "Unlimited"}
                        </td>
                      </tr>

                      {/* Recruitment & CRM */}
                      <tr className="bg-muted/20">
                        <td
                          className="p-4 font-semibold text-sm uppercase tracking-wide"
                          colSpan={3}
                        >
                          Recruitment & CRM
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          Recruiting & Sales CRM
                        </td>
                        <td className="text-center p-4">
                          {persona === USER_ROLES.JOB_SEEKER ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <Check className="h-5 w-5 text-green-600 mx-auto" />
                          )}
                        </td>
                        <td className="text-center p-4">
                          {persona === USER_ROLES.JOB_SEEKER ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <Check className="h-5 w-5 text-green-600 mx-auto" />
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Handshake className="h-4 w-4 text-muted-foreground" />
                          Hiring & Onboarding
                        </td>
                        <td className="text-center p-4">
                          {persona === "job_seeker" ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="text-center p-4">
                          {persona === "employer" ? (
                            <Check className="h-5 w-5 text-green-600 mx-auto" />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          Interview Scheduling
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          Basic
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          Advanced + Automation
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <BarChart3 className="h-4 w-4 text-muted-foreground" />
                          Performance Management
                        </td>
                        <td className="text-center p-4">
                          <span className="text-muted-foreground">—</span>
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                      </tr>

                      {/* Communication & Outreach */}
                      <tr className="bg-muted/20">
                        <td
                          className="p-4 font-semibold text-sm uppercase tracking-wide"
                          colSpan={3}
                        >
                          Communication & Outreach
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Send className="h-4 w-4 text-muted-foreground" />
                          Smart Outreach Campaigns
                        </td>
                        <td className="text-center p-4">
                          {persona === "recruiter" ? (
                            <span className="text-muted-foreground">Basic</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="text-center p-4">
                          {persona === "recruiter" ? (
                            <Check className="h-5 w-5 text-green-600 mx-auto" />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <MessageCircle className="h-4 w-4 text-muted-foreground" />
                          AI Message Personalization
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          Basic (template only)
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          Advanced (Unlimited)
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          Automated Follow-ups
                        </td>
                        <td className="text-center p-4">
                          <span className="text-muted-foreground">—</span>
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                      </tr>

                      {/* AI Recruiter Agent v2 + Live Screening — the
                          LinkedIn Hiring Assistant / ZipIntro parity
                          rows. PersonaGatedRow keeps the JSX terse vs
                          the older hand-rolled persona conditionals. */}
                      <PersonaGatedRow
                        icon={Brain}
                        label="AI Recruiter Agent — brief intake (plain-English → search criteria)"
                        free="1 run / mo"
                        pro="Unlimited"
                        visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
                        currentPersona={persona}
                      />
                      <PersonaGatedRow
                        icon={Send}
                        label="AI Recruiter Agent — sourced candidates + scored outreach drafts"
                        free="3 candidates / run"
                        pro="Up to 50 / run"
                        visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
                        currentPersona={persona}
                      />
                      <PersonaGatedRow
                        icon={Clock}
                        label="Scheduled follow-up sequences (3d / 7d / 14d default)"
                        free={false}
                        pro
                        visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
                        currentPersona={persona}
                      />
                      <PersonaGatedRow
                        icon={Video}
                        label="Live screening blocks — back-to-back video slots (ZipIntro-style)"
                        free={false}
                        pro
                        visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
                        currentPersona={persona}
                      />
                      <PersonaGatedRow
                        icon={Calendar}
                        label="Candidate accept / decline magic links (no candidate login required)"
                        free={false}
                        pro
                        visibleFor={[USER_ROLES.RECRUITER, USER_ROLES.EMPLOYER]}
                        currentPersona={persona}
                      />
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          Employee Community
                        </td>
                        <td className="text-center p-4">
                          {persona === "employer" ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="text-center p-4">
                          {persona === "employer" ? (
                            <Check className="h-5 w-5 text-green-600 mx-auto" />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>

                      {/* Career Home & Community */}
                      <tr className="bg-muted/20">
                        <td
                          className="p-4 font-semibold text-sm uppercase tracking-wide"
                          colSpan={3}
                        >
                          Career Home & Community
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-muted-foreground" />
                          Career Home unified dashboard
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <MessageCircle className="h-4 w-4 text-muted-foreground" />
                          Community feed (text, video, article posts)
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Lock className="h-4 w-4 text-muted-foreground" />
                          Per-post privacy controls (public / connections / private)
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          Professional networking (connections, followers)
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          Unlimited
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          Unlimited
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-muted-foreground" />
                          Career resilience tools
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-muted-foreground" />
                          Personal brand / creator studio
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Shield className="h-4 w-4 text-muted-foreground" />
                          White-label marketing — remove hired.video branding
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          hired.video branded
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          Opt-out available
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Globe className="h-4 w-4 text-muted-foreground" />
                          Google for Jobs structured-data publishing
                        </td>
                        <td className="text-center p-4">
                          {persona === USER_ROLES.JOB_SEEKER ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <Check className="h-5 w-5 text-green-600 mx-auto" />
                          )}
                        </td>
                        <td className="text-center p-4">
                          {persona === USER_ROLES.JOB_SEEKER ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <Check className="h-5 w-5 text-green-600 mx-auto" />
                          )}
                        </td>
                      </tr>

                      {/* Analytics & Reporting */}
                      <tr className="bg-muted/20">
                        <td
                          className="p-4 font-semibold text-sm uppercase tracking-wide"
                          colSpan={3}
                        >
                          Analytics & Reporting
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Eye className="h-4 w-4 text-muted-foreground" />
                          Resume & profile view tracking
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          Basic
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          Advanced (viewer identity, time on page)
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <LayoutGrid className="h-4 w-4 text-muted-foreground" />
                          Pipeline conversion funnel
                        </td>
                        <td className="text-center p-4">
                          <span className="text-muted-foreground">—</span>
                        </td>
                        <td className="text-center p-4">
                          {persona === USER_ROLES.JOB_SEEKER ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <Check className="h-5 w-5 text-green-600 mx-auto" />
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Bell className="h-4 w-4 text-muted-foreground" />
                          Weekly digest emails
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          Team activity leaderboards
                        </td>
                        <td className="text-center p-4">
                          <span className="text-muted-foreground">—</span>
                        </td>
                        <td className="text-center p-4">
                          {persona === USER_ROLES.JOB_SEEKER ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <Check className="h-5 w-5 text-green-600 mx-auto" />
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <BarChart3 className="h-4 w-4 text-muted-foreground" />
                          Dashboard Analytics
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          Basic
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          Advanced + Insights
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-muted-foreground" />
                          Career Progress Tracking
                        </td>
                        <td className="text-center p-4">
                          <span className="text-muted-foreground">—</span>
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <BarChart3 className="h-4 w-4 text-muted-foreground" />
                          Hiring Success Metrics
                        </td>
                        <td className="text-center p-4">
                          {persona === "employer" || persona === "recruiter" ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="text-center p-4">
                          {persona === "employer" || persona === "recruiter" ? (
                            <Check className="h-5 w-5 text-green-600 mx-auto" />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          Time-to-hire Analytics
                        </td>
                        <td className="text-center p-4">
                          {persona === "employer" || persona === "recruiter" ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="text-center p-4">
                          {persona === "employer" || persona === "recruiter" ? (
                            <Check className="h-5 w-5 text-green-600 mx-auto" />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>

                      {/* Productivity Features */}
                      <tr className="bg-muted/20">
                        <td
                          className="p-4 font-semibold text-sm uppercase tracking-wide"
                          colSpan={3}
                        >
                          Productivity & Organization
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <CheckSquare className="h-4 w-4 text-muted-foreground" />
                          Task Management
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          Basic
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          Advanced + Automation
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          Calendar Integration
                        </td>
                        <td className="text-center p-4">
                          <span className="text-muted-foreground">—</span>
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                      </tr>
                      <tr
                        data-upgrade-id="inbox-sync"
                        className="data-[upgrade-active=true]:bg-primary/10 data-[upgrade-active=true]:ring-2 data-[upgrade-active=true]:ring-primary/40 transition-colors"
                      >
                        <td className="p-4 flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          Inbox Sync (Gmail / Outlook)
                        </td>
                        <td className="text-center p-4">
                          <span className="text-muted-foreground">—</span>
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          {INBOX_SYNC_INCLUDED_ACCOUNTS} mailboxes included
                          <div className="text-xs">
                            +${INBOX_SYNC_EXTRA_ACCOUNT_PRICE}/mo per extra
                          </div>
                        </td>
                      </tr>
                      <tr
                        data-upgrade-id="smart-notifications"
                        className="data-[upgrade-active=true]:bg-primary/10 data-[upgrade-active=true]:ring-2 data-[upgrade-active=true]:ring-primary/40 transition-colors"
                      >
                        <td className="p-4 flex items-center gap-2">
                          <Bell className="h-4 w-4 text-muted-foreground" />
                          Smart Notifications
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          Basic
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          AI-Powered + Prioritized
                        </td>
                      </tr>

                      {/* Engagement, Learning & Discovery — modules that
                          competitors don't ship at all (gamification cashout,
                          SCORM learning paths, built-in AI/RAG/must-have-skills
                          content library, geo-map discovery, per-section
                          profile gating). These ride on the same Pro seat —
                          no per-module upcharge, no separately-licensed
                          LinkedIn-Learning-style SKU. */}
                      <SectionRow label="Engagement, Learning & Discovery" />
                      <FeatureRow
                        icon={Trophy}
                        label="Gamification — points, streaks, badges"
                        free
                        pro
                      />
                      <FeatureRow
                        icon={Trophy}
                        label="Gift-card cashout (Tremendous) + AI-credit / premium-month redemption"
                        free="Earn points only"
                        pro="Full cashout + redemption"
                      />
                      <FeatureRow
                        icon={GraduationCap}
                        label="Built-in Learning Content Library — AI, RAG, prompt engineering, must-have skills (LinkedIn Learning is ~$379/seat/yr, separately licensed)"
                        free="Browse + enroll"
                        pro="Browse + enroll + employer authoring"
                      />
                      <FeatureRow
                        icon={GraduationCap}
                        label="Learning Paths — DAG-structured courses with prerequisites"
                        free="Browse + enroll"
                        pro="Authoring + assign to team"
                      />
                      <FeatureRow
                        icon={GraduationCap}
                        label="SCORM 1.2 player + xAPI LRS"
                        free
                        pro
                      />
                      <FeatureRow
                        icon={GraduationCap}
                        label="Classrooms — cohorts, assigned/required training + due dates, live per-student progress monitoring"
                        free="Join + track assigned"
                        pro="Create cohorts + assign + monitor"
                      />
                      <FeatureRow
                        icon={GraduationCap}
                        label="HMAC-signed verifiable certificates"
                        free={false}
                        pro
                      />
                      <FeatureRow
                        icon={MapPin}
                        label="Geo-tagged search + /map discovery (jobs, events, members)"
                        free
                        pro
                      />
                      <FeatureRow
                        icon={Lock}
                        label="Per-section profile visibility (10 gateable sections on /people/[id])"
                        free
                        pro
                      />

                      {/* Support & Security */}
                      <tr className="bg-muted/20">
                        <td
                          className="p-4 font-semibold text-sm uppercase tracking-wide"
                          colSpan={3}
                        >
                          Compliance, Security & Support
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Lock className="h-4 w-4 text-muted-foreground" />
                          Encryption at rest & in transit
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Shield className="h-4 w-4 text-muted-foreground" />
                          GDPR compliance (data export & right-to-delete)
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Shield className="h-4 w-4 text-muted-foreground" />
                          SOC 2 Type II certification
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          In progress
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          On the roadmap
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Globe className="h-4 w-4 text-muted-foreground" />
                          Regional data residency
                        </td>
                        <td className="text-center p-4">
                          <span className="text-muted-foreground">—</span>
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          On the roadmap
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Lock className="h-4 w-4 text-muted-foreground" />
                          SSO (SAML / OIDC)
                        </td>
                        <td className="text-center p-4">
                          <span className="text-muted-foreground">—</span>
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          On the roadmap
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Shield className="h-4 w-4 text-muted-foreground" />
                          Audit logs
                        </td>
                        <td className="text-center p-4">
                          <span className="text-muted-foreground">—</span>
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <MessageCircle className="h-4 w-4 text-muted-foreground" />
                          Customer Support
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          Email (48h)
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          Priority + Live Chat (4h)
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          Dedicated customer success manager
                        </td>
                        <td className="text-center p-4">
                          <span className="text-muted-foreground">—</span>
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          On the roadmap
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Globe className="h-4 w-4 text-muted-foreground" />
                          API Access
                        </td>
                        <td className="text-center p-4">
                          <span className="text-muted-foreground">—</span>
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Zap className="h-4 w-4 text-muted-foreground" />
                          Custom integrations
                        </td>
                        <td className="text-center p-4">
                          <span className="text-muted-foreground">—</span>
                        </td>
                        <td className="text-center p-4">
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        </td>
                      </tr>
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
                eyebrow="vs. the market"
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
                  Need more information?
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Our team is here to help you choose the right plan
                </p>
                <Button
                  variant="outline"
                  onClick={() =>
                    openContactPanel({
                      inquiryType: "sales",
                      title: "Talk to our team",
                      description:
                        "Tell us what you're solving for and we'll help you choose the right plan.",
                    })
                  }
                >
                  Talk to us
                </Button>
              </Card>

              <Card className="text-center p-6 hover:shadow-lg transition-shadow">
                <Play className="h-12 w-12 mx-auto mb-4 text-primary" />
                <h3 className="font-semibold text-lg mb-2">Not sure yet?</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  See hired.video in action with a personalized demo
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
                  Request a demo
                </Button>
              </Card>

              <Card className="text-center p-6 hover:shadow-lg transition-shadow border-green-200">
                <Heart className="h-12 w-12 mx-auto mb-4 text-green-600" />
                <h3 className="font-semibold text-lg mb-2">
                  Start-up or non-profit?
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  We offer special pricing for qualifying organizations
                </p>
                <Button
                  variant="outline"
                  className="border-green-200 text-green-700 hover:bg-green-50"
                  onClick={() =>
                    openContactPanel({
                      inquiryType: "nonprofit_discount",
                      subjectLocked: true,
                      prefillMessage:
                        "Hi — we're a start-up / non-profit interested in reduced pricing. Here's a bit about us: ",
                    })
                  }
                >
                  Contact us for reduced pricing
                </Button>
              </Card>
            </div>

            {/* FAQ — generates FAQPage JSON-LD for Google/Bing/AI rich results */}
            <MarketingFAQ
              schemaId="pricing"
              heading="Pricing FAQ"
              subheading="Everything you need to know about hired.video plans"
              items={[
                {
                  question: "How much does hired.video cost?",
                  answer: `hired.video is free to start with generous limits — AI resume scoring, one published Studio project (video, comic, game, or podcast), and 50K AI tokens per month. The Pro plan is $${basePrice}/month (or $${PRO_YEARLY_PRICE}/year with a 20% annual discount) and includes 1M AI tokens/month, 1080p + 4K video export, PDF / CBZ comic export, voice cloning, brand kits, and unlimited published projects across every format. You can cancel anytime.`,
                },
                {
                  question: "What's included in the free plan?",
                  answer: "The free plan includes AI resume scoring, one published Studio project (video, comic, game, or podcast), job-resume matching (5/month), 10 job applications/month, 50K AI tokens for tools like the resume optimizer and salary calculator, and access to the full tool suite. No credit card required.",
                },
                {
                  question: "Can I try Pro features before committing?",
                  answer: "Yes — all AI tools are available on the free tier with a monthly token budget. You can generate videos, comics, games, and podcasts to see the quality before upgrading. Pro unlocks higher limits, 4K video export, PDF / CBZ comic export, voice cloning, and brand kits.",
                },
                {
                  question: "What are AI tokens and how do they work?",
                  answer: "AI tokens are the currency that powers every AI feature — resume scoring, Studio script generation (video / comic / game / podcast), job matching, and more. Free users get 50K tokens/month; Pro users get 1M tokens/month. If you need more, top-up token packs start at $3.99 for 500K tokens.",
                },
                {
                  question: "Do you offer team or recruiter pricing?",
                  answer: "Yes — Pro supports multi-seat teams with per-seat pricing. Recruiters get access to AI candidate sourcing, match scoring, and a visual hiring pipeline. Contact us for volume discounts on 10+ seats.",
                },
                {
                  question: "What is People Operations, and can I embed it?",
                  answer: "People Operations is the CHRO suite for employers — roster & org chart, 1:1s with shared agendas and action items, performance, goals, and team health, on top of the video-first hiring you already use. It's a paid employer feature, multi-tenant and segment-isolated per company. You can also embed your hired.video surfaces (roster, 1:1s, hiring) directly into your own app with a copyable JavaScript snippet — turn it on under your company's Embed settings and inject the embed key from an environment variable (never hardcode it).",
                },
                {
                  question: "Can I cancel my subscription anytime?",
                  answer: "Absolutely. There are no contracts or cancellation fees. Cancel from your account settings at any time and you'll keep access through the end of your billing period. Your data stays safe and you can re-subscribe whenever you want.",
                },
                {
                  question: "Is there a discount for annual billing?",
                  answer: `Yes — the annual plan saves 20%. Instead of $${basePrice}/month, you pay $${PRO_YEARLY_PRICE}/year (about $${(PRO_YEARLY_PRICE / 12).toFixed(2)}/month).`,
                },
              ]}
            />

            {/* Trust Signals */}
            <div className="text-center bg-gradient-to-r from-brand-purple/10 to-brand-blue/10 p-8 rounded-2xl">
              <h3 className="text-2xl font-bold mb-4">
                Trusted by thousands of companies
              </h3>
              <p className="text-muted-foreground mb-6">
                Join the growing community of employers revolutionizing their
                talent management with our comprehensive HR platform
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
