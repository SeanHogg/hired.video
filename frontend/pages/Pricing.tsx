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
} from "lucide-react";
import {
  PRO_MONTHLY_PRICE as PRO_MONTHLY_PRICE_DEFAULT,
  PRO_YEARLY_PRICE as PRO_YEARLY_PRICE_DEFAULT,
} from "@shared/pricing";
import { TIER_COPY } from "@shared/tier-copy";
import { pricingConfigService } from "@/lib/services/pricing-config-service";
import { TRUST_SIGNALS } from "@/lib/constants";

import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useSEO, useBreadcrumbs, generatePricingSchema } from "@/lib/seo";
import MarketingFAQ from "@/components/MarketingFAQ";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
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
import { useSidebar } from "@/hooks/use-sidebar";
import type { UserRole } from "@/lib/auth";
import { useAuth, USER_ROLES } from "@/lib/auth";
import { useCart } from "@/lib/cart-context";

export default function Pricing() {
  const location = useLocation();
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();

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
        description: "Free career tools — AI resume scorer, video resume, job matching, and more.",
        monthlyPrice: 0,
      },
      {
        name: "Pro",
        description: "Full access to hired.video — 1M AI tokens/mo, 1080p video, voice cloning, brand kits, unlimited published videos.",
        monthlyPrice: basePrice,
        annualPrice: PRO_YEARLY_PRICE,
      },
    ]),
  });
  useBreadcrumbs([{ name: "Pricing", url: "/pricing" }]);
  const { isAuthenticated } = useAuth();
  const { addItem, openCart } = useCart();

  // Pricing state
  const [isAnnual, setIsAnnual] = useState(false);
  // Persona state
  const [persona, setPersona] = useState<UserRole>(USER_ROLES.JOB_SEEKER);

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
        "Get started with AI video resumes, the Chrome extension, and your career home.",
      proDescription:
        "Unlock 1M monthly AI tokens, voice cloning, Pro studio features, and priority matching.",
      freeFeatures: [
        "1 published AI video resume (unlimited drafts)",
        "ATS-friendly resume builder",
        "Chrome extension — job tracking & match scoring",
        "AI assistance (10/mo) — token-metered",
        "Career Home dashboard & community feed",
        "Unlimited networking — connections & followers",
        "Apply to jobs with video intros",
        "AI Studio — 1080p export (with watermark)",
        "AI interview practice (limited)",
        "Public profile hosting (hired.video branded)",
      ],
      proFeatures: [
        "Unlimited AI video resumes",
        "AI Studio — Brand Kits, 4K, watermark-free",
        "Voice cloning & full TTS voice marketplace",
        "YouTube publishing + LinkedIn post AI",
        "AI Assistance available (all tools)",
        "Resume Tailor — per-job variations",
        "AI interview practice",
        "Priority job matching & salary insights",
        "Video & profile analytics",
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
        "Applicant Tracking System (ATS)",
        "Unlimited job postings (Google for Jobs indexed)",
        "Recruiter Chrome extension — profile & company extraction",
        "Unlimited searchable talent pool",
        "Visual Kanban hiring pipeline",
        "Basic interview scheduling",
        "Up to 2 team members",
        "AI assistance (10/mo) — token-metered",
      ],
      proFeatures: [
        "Unlimited talent pool & candidate imports",
        "AI candidate ↔ job match scoring",
        "Smart outreach campaigns & follow-ups",
        "AI message personalization",
        "Bulk resume scoring & screening",
        "Video resume screening & transcript search",
        "Performance dashboards & team leaderboards",
        "Unlimited seats & team collaboration",
        "Exclusive job boards + bidding",
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
        "ATS + unlimited job postings",
        "Google for Jobs structured-data indexing",
        "Recruiting & Sales CRM",
        "Video resume screening",
        "Recruiter Chrome extension",
        "1 admin user",
        "Up to 2 employees",
        "AI assistance (10/mo)",
      ],
      proFeatures: [
        "Employee community (Engage / Inform / Inspire)",
        "Hiring & Onboarding (offers, contracts)",
        "Performance management",
        "Company video promos via AI Studio",
        "Brand kits & company-wide templates",
        "Calendar & smart notifications",
        "Advanced analytics, time-to-hire, API access",
        "GDPR data-residency & SOC 2 (on the roadmap)",
        "Unlimited users",
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        collapsed={sidebarCollapsed}
      />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation
          onMenuClick={openSidebar}
          onSidebarToggle={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
        />

        <div className="pt-16">
          <div className="max-w-6xl mx-auto px-4 py-16">
            {/* Hero Section */}
            <div className="text-center mb-16">
              <h1 className="text-5xl font-bold mb-6">
                Simple, Transparent Pricing
              </h1>
              <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
                All-in-one HR platform with employment-focused social media,
                referral network, ATS, Recruitment CRM, crowdsourcing, and
                recruitment marketing — build a true talent pipeline with our
                flexible pricing plans.
              </p>
              <div className="flex items-center justify-center gap-4 mb-8">
                <Badge variant="outline" className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  No hidden fees
                </Badge>
                <Badge variant="outline" className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Cancel anytime
                </Badge>
              </div>
            </div>

            {/* Billing Toggle */}
            <div className="flex items-center justify-center gap-4 mb-8">
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

            {/* Personas Segmented Control - New Row with Center Alignment */}
            <div className="w-full flex justify-center mb-10">
              <div className="text-center">
                <div className="flex items-center justify-center mb-2">
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
                          className="rounded-full px-4 py-2 data-[state=on]:bg-gradient-to-r data-[state=on]:from-brand-purple data-[state=on]:to-brand-blue data-[state=on]:text-white"
                        >
                          <Users className="h-4 w-4 mr-2" /> Job Seeker
                        </ToggleGroupItem>
                        <ToggleGroupItem
                          value={USER_ROLES.RECRUITER}
                          className="rounded-full px-4 py-2 data-[state=on]:bg-gradient-to-r data-[state=on]:from-brand-purple data-[state=on]:to-brand-blue data-[state=on]:text-white"
                        >
                          <Briefcase className="h-4 w-4 mr-2" /> Recruiter
                        </ToggleGroupItem>
                        <ToggleGroupItem
                          value={USER_ROLES.EMPLOYER}
                          className="rounded-full px-4 py-2 data-[state=on]:bg-gradient-to-r data-[state=on]:from-brand-purple data-[state=on]:to-brand-blue data-[state=on]:text-white"
                        >
                          <Building2 className="h-4 w-4 mr-2" /> Employer
                        </ToggleGroupItem>
                      </ToggleGroup>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Plans tailored for {personaCopy[persona].label}
                </p>
              </div>
            </div>

            {/* Pricing Cards */}
            <div className="grid md:grid-cols-2 gap-8 mb-16 max-w-4xl mx-auto">
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
                          Limited
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

                      {/* AI Video Studio */}
                      <tr className="bg-muted/20">
                        <td
                          className="p-4 font-semibold text-sm uppercase tracking-wide"
                          colSpan={3}
                        >
                          AI Video Studio
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Video className="h-4 w-4 text-muted-foreground" />
                          AI Video Script Generation (4-scene)
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
                          <Video className="h-4 w-4 text-muted-foreground" />
                          AI-generated video resume drafts
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
                          <Share2 className="h-4 w-4 text-muted-foreground" />
                          Published / downloadable video resumes
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          1 published
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          Unlimited
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Video className="h-4 w-4 text-muted-foreground" />
                          Video resume templates & themes
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          Basic (5)
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          {TIER_COPY.proCollectionLabel("50+")}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Zap className="h-4 w-4 text-muted-foreground" />
                          Animated scenes & motion presets
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          Minimal only
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          Minimal / Moderate / Cinematic
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Palette className="h-4 w-4 text-muted-foreground" />
                          Brand Kits — colors, logo, fonts
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
                          <Download className="h-4 w-4 text-muted-foreground" />
                          720p MP4 export
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
                          <Download className="h-4 w-4 text-muted-foreground" />
                          1080p MP4 export
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
                          <Download className="h-4 w-4 text-muted-foreground" />
                          4K MP4 export
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
                          <Video className="h-4 w-4 text-muted-foreground" />
                          Vertical 9:16 export (TikTok, Reels, LinkedIn)
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
                          <Shield className="h-4 w-4 text-muted-foreground" />
                          Watermark
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          hired.video watermark
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          Watermark-free
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Mic className="h-4 w-4 text-muted-foreground" />
                          AI voice cloning (your own voice)
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
                          <Mic className="h-4 w-4 text-muted-foreground" />
                          Voice Marketplace (Kokoro, Piper, VibeVoice)
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          1 free voice (Web Speech)
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          Full marketplace + creator revenue share
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <Share2 className="h-4 w-4 text-muted-foreground" />
                          One-click YouTube publishing
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
                          LinkedIn Post AI (hook, caption, hashtags)
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
                          <Share2 className="h-4 w-4 text-muted-foreground" />
                          Public share link, embed code & QR code
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
                          <BarChart3 className="h-4 w-4 text-muted-foreground" />
                          Video view analytics & engagement
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          Basic (views only)
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          Advanced (heatmaps, CTA clicks, campaigns)
                        </td>
                      </tr>
                      <tr>
                        <td className="p-4 flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          Resume Optimization
                        </td>
                        <td className="text-center p-4 text-sm text-muted-foreground">
                          AI-Powered (Limited)
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
                      <tr>
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
                          Basic (Limited)
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
                          Basic (Limited)
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
                          Basic (Limited)
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
                      <tr>
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

            {/* FAQ & Support Section */}
            <div className="grid md:grid-cols-3 gap-8 mb-16">
              <Card className="text-center p-6 hover:shadow-lg transition-shadow">
                <MessageCircle className="h-12 w-12 mx-auto mb-4 text-primary" />
                <h3 className="font-semibold text-lg mb-2">
                  Need more information?
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Our team is here to help you choose the right plan
                </p>
                <Button variant="outline">Talk to us</Button>
              </Card>

              <Card className="text-center p-6 hover:shadow-lg transition-shadow">
                <Play className="h-12 w-12 mx-auto mb-4 text-primary" />
                <h3 className="font-semibold text-lg mb-2">Not sure yet?</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  See hired.video in action with a personalized demo
                </p>
                <Button variant="outline">Request a demo</Button>
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
                  answer: `hired.video is free to start with generous limits — AI resume scoring, one published video resume, and 50K AI tokens per month. The Pro plan is $${basePrice}/month (or $${PRO_YEARLY_PRICE}/year with a 20% annual discount) and includes 1M AI tokens/month, 1080p video export, voice cloning, brand kits, and unlimited published videos. You can cancel anytime.`,
                },
                {
                  question: "What's included in the free plan?",
                  answer: "The free plan includes AI resume scoring, one published video resume, job-resume matching (5/month), 10 job applications/month, 50K AI tokens for tools like the resume optimizer and salary calculator, and access to the full tool suite. No credit card required.",
                },
                {
                  question: "Can I try Pro features before committing?",
                  answer: "Yes — all AI tools are available on the free tier with a monthly token budget. You can score resumes, generate video resumes, and use every tool to see the quality before upgrading. Pro unlocks higher limits, 1080p export, voice cloning, and brand kits.",
                },
                {
                  question: "What are AI tokens and how do they work?",
                  answer: "AI tokens are the currency that powers all AI features — resume scoring, video script generation, job matching, and more. Free users get 50K tokens/month; Pro users get 1M tokens/month. If you need more, top-up token packs start at $3.99 for 500K tokens.",
                },
                {
                  question: "Do you offer team or recruiter pricing?",
                  answer: "Yes — Pro supports multi-seat teams with per-seat pricing. Recruiters get access to AI candidate sourcing, match scoring, and a visual hiring pipeline. Contact us for volume discounts on 10+ seats.",
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
          <Footer />
        </div>
      </div>
    </div>
  );
}
