import {
  Loader2,
  Inbox,
  Send,
  Check,
  X,
  CheckCircle2,
  MessageSquare,
  ArrowRight,
  Sparkles,
  ShoppingBag,
  Users,
  Briefcase,
  TrendingUp,
  DollarSign,
  Tag,
  Clock,
  Link2,
  Video,
  Star,
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import ProgramSignupForm, { type ProgramSignupFields } from "@/components/auth/ProgramSignupForm";
import { USER_ROLES } from "@shared/user-roles";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import {
  servicesService,
  type ServiceOffering,
  type InquiryWithDetails,
  type MyRequestWithDetails,
} from "@/lib/services/services-service";
import { toast } from "sonner";
import { useEffectiveRole } from "@/hooks/use-effective-role";
import affiliateService from "@/lib/services/affiliate-service";
import { AffiliateDashboardContent } from "./AffiliateDashboard";
import ReferralLinkBox from "@/components/affiliate/ReferralLinkBox";
import CreatorEnrollmentWizard from "@/components/creator/CreatorEnrollmentWizard";
import ContentCreatorSection from "@/components/creator/ContentCreatorSection";
import { creatorService, type CreatorProfile } from "@/lib/services/creator-service";
import ServicesNav from "@/components/services/ServicesNav";

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  string,
  { labelKey: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  pending:   { labelKey: "labels.inquiryStatus.pending",   variant: "secondary" },
  accepted:  { labelKey: "labels.inquiryStatus.accepted",  variant: "default" },
  rejected:  { labelKey: "labels.inquiryStatus.declined",  variant: "destructive" },
  completed: { labelKey: "labels.inquiryStatus.completed", variant: "outline" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const cfg = STATUS_CONFIG[status];
  return <Badge variant={cfg?.variant ?? "secondary"}>{cfg ? t(cfg.labelKey) : status}</Badge>;
}

function ServiceStatusBadge({ loading, active }: { loading: boolean; active: boolean }) {
  const { t } = useTranslation();
  if (loading) return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />;
  if (!active) return null;
  return <Badge variant="default" className="text-[10px] bg-green-600 px-1.5 py-0">{t("status.active")}</Badge>;
}

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function formatPrice(cents: number | null): string | null {
  if (cents === null) return null;
  return `$${(cents / 100).toFixed(2)}`;
}

type ActiveTab = "dashboard" | "creator" | "inquiries";

function timeAgo(dateStr: string, t: (key: string, opts?: Record<string, unknown>) => string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return t("labels.minutesAgo", { count: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t("labels.hoursAgo", { count: hrs });
  return t("labels.daysAgo", { count: Math.floor(hrs / 24) });
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ShoppingBag;
  label: string;
  value: string | number;
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span className="text-[10px] font-medium uppercase tracking-wide truncate">{label}</span>
        </div>
        <p className="text-lg font-bold truncate">{value}</p>
      </CardContent>
    </Card>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ServicesManagement() {
  const { t } = useTranslation();
  const { user, isAuthenticated, signup, isLoading: authLoading } = useAuth();
  const effectiveRole = useEffectiveRole();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Public create-account handlers (logged-out branch). Register the visitor
  // AS a creator (role=creator); attribution + locale flow through signup()
  // from the shared first-touch store.
  const registerCreator = (fields: ProgramSignupFields, token: string) =>
    signup(fields.email, fields.password, fields.firstName, fields.lastName, USER_ROLES.CREATOR, undefined, undefined, token);

  const goToSignupSuccess = (fields: ProgramSignupFields) =>
    setTimeout(() => navigate(`/signup-success?email=${encodeURIComponent(fields.email)}&firstName=${encodeURIComponent(fields.firstName)}`), 1000);

  // Top-level tab is driven by the URL path so each section is deep-linkable
  // and the back button works. /services → dashboard, /services/creator →
  // creator (with Offerings as the default sub-tab), /services/inquiries →
  // inquiries. The legacy `/services/offerings` URL also lands on the creator
  // tab (Offerings sub-tab is its first/default child). The legacy ?tab=
  // query param is still honored for inbound links from older emails / docs.
  const location = useLocation();
  const tabParam = searchParams.get("tab");
  const activeTab = useMemo<ActiveTab>(() => {
    if (location.pathname.startsWith("/services/creator")) return "creator";
    if (location.pathname.startsWith("/services/offerings")) return "creator";
    if (location.pathname.startsWith("/services/inquiries")) return "inquiries";
    if (tabParam === "services") return "creator";
    if (tabParam === "inquiries") return "inquiries";
    return "dashboard";
  }, [location.pathname, tabParam]);

  // ── Standard services state ────────────────────────────────────────────────
  const [affiliateActive, setAffiliateActive] = useState(false);
  const [affiliateLoading, setAffiliateLoading] = useState(true);
  const [affiliateEnrolling, setAffiliateEnrolling] = useState(false);

  const [creatorActive, setCreatorActive] = useState(false);
  const [creatorLoading, setCreatorLoading] = useState(true);
  const [creatorProfile, setCreatorProfile] = useState<CreatorProfile | null>(null);
  const [wizardOpen, setWizardOpen] = useState(searchParams.get("wizard") === "open");

  // Check standard service enrollment — re-runs when effective role changes
  // (e.g. impersonation role switch, persona preview toggle)
  useEffect(() => {
    if (!isAuthenticated || !user) return;

    // Reset loading states on role change
    setAffiliateLoading(true);
    setCreatorLoading(true);

    // Affiliate check — always service-based (affiliate is a service, not a role)
    affiliateService.getProfile()
      .then(() => setAffiliateActive(true))
      .catch(() => setAffiliateActive(false))
      .finally(() => setAffiliateLoading(false));

    // Creator check (active enrollment row only)
    creatorService.getMine()
      .then((profile) => {
        if (profile) {
          setCreatorActive(true);
          setCreatorProfile(profile);
        } else {
          setCreatorActive(false);
          setCreatorProfile(null);
        }
      })
      .catch(() => { setCreatorActive(false); setCreatorProfile(null); })
      .finally(() => setCreatorLoading(false));
  }, [isAuthenticated, user, effectiveRole]);

  const handleCreatorProfileChange = (next: CreatorProfile | null) => {
    setCreatorProfile(next);
    setCreatorActive(next !== null);
  };

  async function handleAffiliateOptIn() {
    setAffiliateEnrolling(true);
    try {
      await affiliateService.getProfile(); // auto-creates profile
      setAffiliateActive(true);
      toast.success(t("messages.services.affiliateJoined"));
    } catch {
      toast.error(t("errors.services.affiliateJoinFailed"));
    } finally {
      setAffiliateEnrolling(false);
    }
  }

  // ── Services state ──────────────────────────────────────────────────────────
  // Owned here so the dashboard's "Active Services" metric stays in sync.
  // OfferingsPanel (inside Content Creator) consumes + mutates via setServices.
  const [services, setServices] = useState<ServiceOffering[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Inquiries state ─────────────────────────────────────────────────────────
  const [incoming, setIncoming] = useState<InquiryWithDetails[]>([]);
  const [myRequests, setMyRequests] = useState<MyRequestWithDetails[]>([]);
  const [inquiriesLoading, setInquiriesLoading] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);

  // ── Load on mount ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    loadServices();
    loadInquiries(); // load eagerly so dashboard metrics are populated
  }, [isAuthenticated, user]);

  // Scroll a hashed anchor (e.g. `/services/offerings#my-services`) into
  // view after the services list has mounted. React Router doesn't trigger
  // the browser's native hash-jump on client-side navigation.
  useEffect(() => {
    if (!location.hash || loading) return;
    const el = document.getElementById(location.hash.slice(1));
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [location.hash, loading]);

  async function loadServices() {
    setLoading(true);
    try {
      const data = await servicesService.listMyServices();
      setServices(data);
    } catch {
      toast.error(t("errors.loadServicesFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function loadInquiries() {
    setInquiriesLoading(true);
    try {
      const [incomingData, requestsData] = await Promise.all([
        servicesService.listInquiries(),
        servicesService.listMyRequests(),
      ]);
      setIncoming(incomingData);
      setMyRequests(requestsData);
    } catch {
      toast.error(t("errors.loadInquiriesFailed"));
    } finally {
      setInquiriesLoading(false);
    }
  }

  // ── Inquiry handlers ────────────────────────────────────────────────────────

  async function handleUpdateStatus(id: string, status: "accepted" | "rejected" | "completed") {
    setUpdating(id);
    try {
      const updated = await servicesService.updateInquiryStatus(id, status);
      setIncoming((prev) =>
        prev.map((item) => item.inquiry.id === id ? { ...item, inquiry: updated } : item),
      );
      toast.success(t("messages.services.inquiryStatusUpdated", { status: t(`labels.inquiryStatus.${status === "rejected" ? "declined" : status}`) }));
    } catch {
      toast.error(t("errors.updateInquiryFailed"));
    } finally {
      setUpdating(null);
    }
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const pendingCount = incoming.filter((i) => i.inquiry.status === "pending").length;

  // ── Render ──────────────────────────────────────────────────────────────────

  // Public create-account page for logged-out visitors — modelled on the
  // affiliate-program landing (shared <ProgramSignupForm>): the /services
  // public face IS the "Become a Creator" signup, registering the new
  // account as role=creator so it surfaces under /people as a Creator and
  // counts as a Creator in growth/SaaS reports (GROUP BY users.role).
  if (!isAuthenticated || !user) {
    return (
      <AppShell bgClassName="bg-background">
        <main>
          {/* Hero + signup */}
          <section className="px-6 py-10">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
              <div className="space-y-6">
                <div className="inline-flex items-center gap-2">
                  <div className="relative">
                    <Sparkles className="h-7 w-7 text-brand-purple" />
                  </div>
                  <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("creator.landing.eyebrow")}
                  </span>
                </div>
                <h1 className="text-4xl font-bold tracking-tight">{t("creator.landing.heroTitle")}</h1>
                <p className="text-muted-foreground text-lg">{t("creator.landing.heroSubtitle")}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-start space-x-3">
                    <Video className="h-6 w-6 text-pink-600 mt-0.5" />
                    <div>
                      <p className="font-medium">{t("creator.landing.feature1Title")}</p>
                      <p className="text-sm text-muted-foreground">{t("creator.landing.feature1Desc")}</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <DollarSign className="h-6 w-6 text-green-600 mt-0.5" />
                    <div>
                      <p className="font-medium">{t("creator.landing.feature2Title")}</p>
                      <p className="text-sm text-muted-foreground">{t("creator.landing.feature2Desc")}</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <Users className="h-6 w-6 text-purple-600 mt-0.5" />
                    <div>
                      <p className="font-medium">{t("creator.landing.feature3Title")}</p>
                      <p className="text-sm text-muted-foreground">{t("creator.landing.feature3Desc")}</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <Tag className="h-6 w-6 text-amber-600 mt-0.5" />
                    <div>
                      <p className="font-medium">{t("creator.landing.feature4Title")}</p>
                      <p className="text-sm text-muted-foreground">{t("creator.landing.feature4Desc")}</p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    size="lg"
                    onClick={() => document.getElementById("creator-signup")?.scrollIntoView({ behavior: "smooth" })}
                  >
                    {t("creator.landing.joinCta")}
                  </Button>
                  <Link to="/login" className="text-sm text-muted-foreground hover:underline">
                    {t("actions.signIn")}
                  </Link>
                </div>
              </div>

              <ProgramSignupForm
                id="creator-signup"
                title={t("creator.landing.signupTitle")}
                description={t("creator.landing.signupDesc")}
                submitLabel={t("creator.landing.createAccount")}
                successMessage={t("creator.landing.registrationSuccess")}
                register={registerCreator}
                onSuccess={goToSignupSuccess}
                isLoading={authLoading}
              />
            </div>
          </section>

          {/* What you get */}
          <section className="px-6 py-6">
            <h2 className="text-3xl font-bold text-center mb-10">{t("services.marketplaceLabel")}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card className="border-brand-purple/20 hover:border-brand-purple/40 transition-colors">
                <CardHeader>
                  <Tag className="h-10 w-10 text-brand-purple mb-4" />
                  <CardTitle>{t("services.listServicesTitle")}</CardTitle>
                  <CardDescription>{t("services.listServicesDesc")}</CardDescription>
                </CardHeader>
              </Card>
              <Card className="border-brand-blue/20 hover:border-brand-blue/40 transition-colors">
                <CardHeader>
                  <Inbox className="h-10 w-10 text-brand-blue mb-4" />
                  <CardTitle>{t("services.manageInquiriesTitle")}</CardTitle>
                  <CardDescription>{t("services.manageInquiriesDesc")}</CardDescription>
                </CardHeader>
              </Card>
              <Card className="border-primary/20 hover:border-primary/40 transition-colors">
                <CardHeader>
                  <DollarSign className="h-10 w-10 text-primary mb-4" />
                  <CardTitle>{t("services.getPaidTitle")}</CardTitle>
                  <CardDescription>{t("services.getPaidDesc")}</CardDescription>
                </CardHeader>
              </Card>
            </div>
          </section>

          {/* Who it's for — the original services-marketplace audience material.
              Kept alongside the creator create-account hero so we don't lose
              the coaches / recruiters / job-seekers positioning. */}
          <section className="px-6 py-8">
            <h2 className="text-3xl font-bold text-center mb-10">{t("services.audienceTitle")}</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <Card className="text-center">
                <CardHeader>
                  <Users className="h-12 w-12 mx-auto text-green-600 mb-4" />
                  <CardTitle>{t("services.coachesTitle")}</CardTitle>
                  <CardDescription>{t("services.coachesDesc")}</CardDescription>
                </CardHeader>
              </Card>
              <Card className="text-center">
                <CardHeader>
                  <Briefcase className="h-12 w-12 mx-auto text-blue-600 mb-4" />
                  <CardTitle>{t("services.recruitersTitle")}</CardTitle>
                  <CardDescription>{t("services.recruitersDesc")}</CardDescription>
                </CardHeader>
              </Card>
              <Card className="text-center">
                <CardHeader>
                  <TrendingUp className="h-12 w-12 mx-auto text-purple-600 mb-4" />
                  <CardTitle>{t("services.jobSeekersTitle")}</CardTitle>
                  <CardDescription>{t("services.jobSeekersDesc")}</CardDescription>
                </CardHeader>
              </Card>
            </div>
          </section>

          {/* Final CTA */}
          <section className="px-6 py-10">
            <div className="flex flex-col items-center text-center space-y-4">
              <h2 className="text-2xl font-semibold">{t("creator.landing.ctaTitle")}</h2>
              <p className="text-muted-foreground max-w-2xl">{t("creator.landing.ctaBody")}</p>
              <Button
                size="lg"
                onClick={() => document.getElementById("creator-signup")?.scrollIntoView({ behavior: "smooth" })}
              >
                {t("creator.landing.joinCta")}
              </Button>
            </div>
          </section>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell bgClassName="bg-background">
      <main className="p-4 md:p-8 w-full">

          <ServicesNav />

          {/* Header — Add Service + Lead Gen Settings buttons moved into the
              Offerings sub-tab (inside Content Creator) where they belong.
              Hidden on /services/creator since the Content Creator section
              renders its own heading + program panel. */}
          {activeTab !== "creator" && (
            <div className="mb-6">
              <h1 className="text-2xl font-bold">{t("headings.services")}</h1>
              <p className="text-muted-foreground mt-1">
                {t("services.servicesIntro")}
              </p>
            </div>
          )}

          <Tabs value={activeTab}>

            {/* ── Dashboard ───────────────────────────────────────────────── */}
            <TabsContent value="dashboard" className="space-y-6">

              {/* Consolidated metrics — standard services + creator stats
                  (when active) in a single compact grid. */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MetricCard
                  icon={ShoppingBag}
                  label={t("labels.services.activeServices")}
                  value={services.filter((s) => s.isActive).length}
                />
                <MetricCard
                  icon={Inbox}
                  label={t("labels.services.newLeads")}
                  value={pendingCount}
                />
                <MetricCard
                  icon={MessageSquare}
                  label={t("labels.services.totalInquiries")}
                  value={incoming.length}
                />
                <MetricCard
                  icon={CheckCircle2}
                  label={t("labels.completed")}
                  value={incoming.filter((i) => i.inquiry.status === "completed").length}
                />
                {creatorActive && creatorProfile && (
                  <>
                    <MetricCard
                      icon={Video}
                      label={t("labels.projects")}
                      value={creatorProfile.completedProjectsCount}
                    />
                    <MetricCard
                      icon={DollarSign}
                      label={t("labels.earned")}
                      value={`$${(creatorProfile.totalEarnedCents / 100).toFixed(2)}`}
                    />
                    <MetricCard
                      icon={Star}
                      label={t("labels.ratingWithCount", { count: creatorProfile.ratingCount })}
                      value={creatorProfile.averageRating?.toFixed(1) ?? "—"}
                    />
                    <MetricCard
                      icon={Users}
                      label={t("labels.displayName")}
                      value={creatorProfile.displayName ?? "—"}
                    />
                  </>
                )}
              </div>

              {/* Main content: widgets left, CTA cards right */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Left column — active service widgets */}
                <div className="lg:col-span-2 space-y-6">

                  {/* Affiliate widget — only when active */}
                  {affiliateActive && (
                    <AffiliateDashboardContent />
                  )}

                  {/* Empty state when no standard services active */}
                  {!affiliateLoading && !creatorLoading && !affiliateActive && !creatorActive && (
                    <Card className="border-dashed">
                      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                        <TrendingUp className="h-10 w-10 text-muted-foreground mb-3" />
                        <h3 className="text-lg font-medium mb-1">{t("services.noActivePrograms")}</h3>
                        <p className="text-sm text-muted-foreground max-w-sm">
                          {t("services.noActiveProgramsDesc")}
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* Right column — CTA cards for standard services */}
                <div className="space-y-4">

                  {/* Affiliate CTA */}
                  <Card className={affiliateActive ? "border-green-300/50" : "border-brand-purple/20"}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-brand-purple to-brand-blue flex items-center justify-center shrink-0">
                            <Link2 className="h-4 w-4 text-white" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-semibold text-sm">{t("services.affiliate")}</h3>
                            <div className="mt-0.5">
                              <ServiceStatusBadge loading={affiliateLoading} active={affiliateActive} />
                            </div>
                          </div>
                        </div>
                        <Button
                          asChild
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs shrink-0 -mt-1 -mr-1"
                        >
                          <Link to="/affiliate-program">
                            {t("labels.affiliateProgram")}
                            <ArrowRight className="h-3 w-3 ml-1" />
                          </Link>
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t("services.affiliateDesc")}
                      </p>
                      {affiliateActive && <ReferralLinkBox variant="compact" />}
                      {!affiliateLoading && !affiliateActive && (
                        <Button
                          size="sm"
                          onClick={handleAffiliateOptIn}
                          disabled={affiliateEnrolling}
                          className="w-full bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90"
                        >
                          {affiliateEnrolling ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          ) : (
                            <Link2 className="h-4 w-4 mr-1" />
                          )}
                          {t("actions.joinAffiliateProgram")}
                        </Button>
                      )}
                    </CardContent>
                  </Card>

                  {/* Content Creator CTA */}
                  <Card className={creatorActive ? "border-green-300/50" : "border-pink-300/20"}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-pink-500 to-orange-400 flex items-center justify-center shrink-0">
                          <Video className="h-4 w-4 text-white" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-semibold text-sm">{t("services.contentCreator")}</h3>
                          <div className="mt-0.5">
                            <ServiceStatusBadge loading={creatorLoading} active={creatorActive} />
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t("services.creatorDesc")}
                      </p>
                      {!creatorLoading && !creatorActive && (
                        <Button
                          size="sm"
                          className="w-full bg-gradient-to-r from-pink-500 to-orange-400 hover:opacity-90"
                          onClick={() => setWizardOpen(true)}
                        >
                          <Video className="h-4 w-4 mr-1" />
                          {t("actions.joinCreatorProgram")}
                        </Button>
                      )}
                    </CardContent>
                  </Card>

                </div>
              </div>
            </TabsContent>

            {/* ── Content Creator ─────────────────────────────────────────── */}
            <TabsContent value="creator" className="space-y-4">
              <ContentCreatorSection
                profile={creatorProfile}
                services={services}
                servicesLoading={loading}
                setServices={setServices}
                onProfileChange={handleCreatorProfileChange}
                basePath="/services/creator"
              />
            </TabsContent>

            {/* ── Inquiries ────────────────────────────────────────────────── */}
            <TabsContent value="inquiries">
              {inquiriesLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Tabs defaultValue="incoming">
                  <TabsList className="mb-4">
                    <TabsTrigger value="incoming" className="flex items-center gap-2">
                      <Inbox className="h-4 w-4" />
                      {t("tabs.incoming")}
                      {pendingCount > 0 && (
                        <Badge variant="destructive" className="ml-1 h-5 min-w-5 px-1 text-xs">
                          {pendingCount}
                        </Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="sent" className="flex items-center gap-2">
                      <Send className="h-4 w-4" />
                      {t("tabs.myRequests")}
                    </TabsTrigger>
                  </TabsList>

                  {/* Incoming */}
                  <TabsContent value="incoming">
                    {incoming.length === 0 ? (
                      <Card>
                        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                          <Inbox className="h-12 w-12 text-muted-foreground mb-4" />
                          <h3 className="text-lg font-medium mb-1">{t("messages.noIncomingInquiries")}</h3>
                          <p className="text-muted-foreground text-sm">
                            {t("messages.incomingInquiriesHint")}
                          </p>
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="space-y-3">
                        {incoming.map(({ inquiry, service, buyer }) => (
                          <Card key={inquiry.id}>
                            <CardContent className="p-4">
                              <div className="flex items-start gap-4">
                                <Avatar className="h-10 w-10 shrink-0">
                                  <AvatarFallback>{initials(buyer.name)}</AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-wrap items-center gap-2 mb-1">
                                    <span className="font-semibold">{buyer.name}</span>
                                    <StatusBadge status={inquiry.status} />
                                    <Badge variant="outline" className="text-xs text-muted-foreground">
                                      {inquiry.orderType === "purchase" ? t("labels.orderType.purchase") : t("labels.orderType.inquiry")}
                                    </Badge>
                                  </div>
                                  <p className="text-sm text-muted-foreground mb-1">
                                    <span className="font-medium text-foreground">{service.title}</span>
                                    {" · "}
                                    {inquiry.orderType === "purchase" && (
                                      <span className="text-violet-600 font-medium">
                                        {formatPrice(inquiry.paidAmountCents) ?? t("labels.contactForPricing")}
                                      </span>
                                    )}
                                  </p>
                                  {inquiry.message && (
                                    <p className="text-sm bg-muted rounded-md px-3 py-2 mt-2">
                                      <MessageSquare className="h-3.5 w-3.5 inline mr-1.5 text-muted-foreground" />
                                      {inquiry.message}
                                    </p>
                                  )}
                                  <p className="text-xs text-muted-foreground mt-2">
                                    {timeAgo(inquiry.createdAt, t)}
                                  </p>
                                </div>

                                {inquiry.status === "pending" && (
                                  <div className="flex items-center gap-1 shrink-0">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-green-600 border-green-300 hover:bg-green-50"
                                      disabled={updating === inquiry.id}
                                      onClick={() => handleUpdateStatus(inquiry.id, "accepted")}
                                    >
                                      {updating === inquiry.id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Check className="h-4 w-4 mr-1" />
                                      )}
                                      {t("actions.accept")}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-destructive border-destructive/30 hover:bg-destructive/10"
                                      disabled={updating === inquiry.id}
                                      onClick={() => handleUpdateStatus(inquiry.id, "rejected")}
                                    >
                                      <X className="h-4 w-4 mr-1" />
                                      {t("actions.decline")}
                                    </Button>
                                  </div>
                                )}
                                {inquiry.status === "accepted" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="shrink-0"
                                    disabled={updating === inquiry.id}
                                    onClick={() => handleUpdateStatus(inquiry.id, "completed")}
                                  >
                                    <CheckCircle2 className="h-4 w-4 mr-1" />
                                    {t("actions.complete")}
                                  </Button>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  {/* My Requests */}
                  <TabsContent value="sent">
                    {myRequests.length === 0 ? (
                      <Card>
                        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                          <Send className="h-12 w-12 text-muted-foreground mb-4" />
                          <h3 className="text-lg font-medium mb-1">{t("messages.noRequestsYet")}</h3>
                          <p className="text-muted-foreground text-sm">
                            {t("messages.browsePeopleHint")}
                          </p>
                          <Link to="/people" className="mt-4">
                            <Button variant="outline">{t("actions.browsePeople")}</Button>
                          </Link>
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="space-y-3">
                        {myRequests.map(({ inquiry, service, provider }) => (
                          <Card key={inquiry.id}>
                            <CardContent className="p-4">
                              <div className="flex items-start gap-4">
                                <Avatar className="h-10 w-10 shrink-0">
                                  <AvatarFallback>{initials(provider.name)}</AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-wrap items-center gap-2 mb-1">
                                    <span className="font-semibold">{provider.name}</span>
                                    <StatusBadge status={inquiry.status} />
                                  </div>
                                  <p className="text-sm text-muted-foreground mb-1">
                                    <span className="font-medium text-foreground">{service.title}</span>
                                    {" · "}
                                    {inquiry.orderType === "purchase" ? (
                                      <span className="text-violet-600 font-medium">
                                        {formatPrice(inquiry.paidAmountCents) ?? t("labels.contactForPricing")}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground">{t("labels.orderType.inquiry")}</span>
                                    )}
                                  </p>
                                  {inquiry.message && (
                                    <p className="text-sm bg-muted rounded-md px-3 py-2 mt-2">
                                      {inquiry.message}
                                    </p>
                                  )}
                                  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {timeAgo(inquiry.createdAt, t)}
                                  </p>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              )}
            </TabsContent>

          </Tabs>
      </main>

      <CreatorEnrollmentWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onEnrolled={(p) => handleCreatorProfileChange(p)}
      />
    </AppShell>
  );
}
