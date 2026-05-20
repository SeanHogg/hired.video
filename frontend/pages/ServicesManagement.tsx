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
import { Link, useLocation, useSearchParams } from "react-router-dom";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
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
import { useSidebar } from "@/hooks/use-sidebar";
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
import { recruitService } from "@/lib/services/recruit-service";
import ServicesNav from "@/components/services/ServicesNav";

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  pending:   { label: "Pending",   variant: "secondary" },
  accepted:  { label: "Accepted",  variant: "default" },
  rejected:  { label: "Declined",  variant: "destructive" },
  completed: { label: "Completed", variant: "outline" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, variant: "secondary" as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

function ServiceStatusBadge({ loading, active }: { loading: boolean; active: boolean }) {
  if (loading) return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />;
  if (!active) return null;
  return <Badge variant="default" className="text-[10px] bg-green-600 px-1.5 py-0">Active</Badge>;
}

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function formatPrice(cents: number | null) {
  if (cents === null) return "Contact for pricing";
  return `$${(cents / 100).toFixed(2)}`;
}

type ActiveTab = "dashboard" | "creator" | "inquiries";

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
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
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();
  const { user, isAuthenticated } = useAuth();
  const effectiveRole = useEffectiveRole();
  const [searchParams] = useSearchParams();

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

  // Agency-only tabs (Candidates / Pitch Decks / Settings) appear in the nav
  // when the caller belongs to at least one company.
  const [hasCompanyAccess, setHasCompanyAccess] = useState(false);

  // Check standard service enrollment — re-runs when effective role changes
  // (e.g. impersonation role switch, persona preview toggle)
  useEffect(() => {
    if (!isAuthenticated || !user) return;

    // Reset loading states on role change
    setAffiliateLoading(true);
    setCreatorLoading(true);

    // Recruiting scope — drives visibility of agency tabs
    recruitService
      .getMyScope()
      .then((scope) => setHasCompanyAccess(scope.companies.length > 0))
      .catch(() => setHasCompanyAccess(false));

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
      toast.success("You're now an affiliate! Share your referral link to start earning.");
    } catch {
      toast.error("Failed to join affiliate program. Please try again.");
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
      toast.error("Failed to load services");
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
      toast.error("Failed to load inquiries");
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
      toast.success(`Inquiry ${status}`);
    } catch {
      toast.error("Failed to update inquiry");
    } finally {
      setUpdating(null);
    }
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const pendingCount = incoming.filter((i) => i.inquiry.status === "pending").length;

  // ── Render ──────────────────────────────────────────────────────────────────

  // Marketing page for unauthenticated visitors
  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-brand-purple/5 to-brand-blue/5">
        <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} collapsed={sidebarCollapsed} />
        <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
          <Navigation
            onMenuClick={openSidebar}
            onSidebarToggle={toggleSidebar}
            sidebarCollapsed={sidebarCollapsed}
          />
          <div className="pt-16">
            <div className="max-w-6xl mx-auto px-4 py-16">
              {/* Hero */}
              <div className="text-center mb-16">
                <div className="inline-flex items-center space-x-2 mb-6">
                  <div className="relative">
                    <ShoppingBag className="h-12 w-12 text-primary" />
                    <Sparkles className="h-6 w-6 text-brand-blue absolute -top-1 -right-1" />
                  </div>
                  <span className="text-4xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                    Career Services Marketplace
                  </span>
                </div>
                <h1 className="text-5xl font-bold mb-6">
                  Sell Your Expertise. Hire Top Talent.
                </h1>
                <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
                  List resume reviews, interview coaching, career consulting, and more — or
                  browse trusted professionals offering the help you need to land your next role.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link to="/signup">
                    <Button
                      size="lg"
                      className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8"
                    >
                      Get Started Free
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                  <Link to="/login">
                    <Button size="lg" variant="outline" className="text-lg px-8">
                      Sign In
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Features */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 mb-16">
                <Card className="border-brand-purple/20 hover:border-brand-purple/40 transition-colors">
                  <CardHeader>
                    <Tag className="h-10 w-10 text-brand-purple mb-4" />
                    <CardTitle>List Your Services</CardTitle>
                    <CardDescription>
                      Set your own prices and turnaround times. Showcase your offerings on your
                      profile and start receiving paid inquiries from a global audience.
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="border-brand-blue/20 hover:border-brand-blue/40 transition-colors">
                  <CardHeader>
                    <Inbox className="h-10 w-10 text-brand-blue mb-4" />
                    <CardTitle>Manage Inquiries</CardTitle>
                    <CardDescription>
                      Accept, decline, and complete client requests in one inbox. Get push
                      notifications when new orders arrive so you never miss a lead.
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="border-primary/20 hover:border-primary/40 transition-colors">
                  <CardHeader>
                    <DollarSign className="h-10 w-10 text-primary mb-4" />
                    <CardTitle>Get Paid Securely</CardTitle>
                    <CardDescription>
                      Buyers can pay upfront or submit a custom inquiry. Transparent pricing,
                      built-in messaging, and a creator-friendly revenue split.
                    </CardDescription>
                  </CardHeader>
                </Card>
              </div>

              {/* Who it's for */}
              <div className="mb-16">
                <h2 className="text-3xl font-bold text-center mb-12">
                  Built for Career Professionals
                </h2>
                <div className="grid md:grid-cols-3 gap-8">
                  <Card className="text-center">
                    <CardHeader>
                      <Users className="h-12 w-12 mx-auto text-green-600 mb-4" />
                      <CardTitle>Coaches & Consultants</CardTitle>
                      <CardDescription>
                        Resume writers, career coaches, and interview prep experts can reach
                        candidates actively searching for their next opportunity.
                      </CardDescription>
                    </CardHeader>
                  </Card>

                  <Card className="text-center">
                    <CardHeader>
                      <Briefcase className="h-12 w-12 mx-auto text-blue-600 mb-4" />
                      <CardTitle>Recruiters</CardTitle>
                      <CardDescription>
                        Offer headhunting, lead generation, and placement services to job
                        seekers and hiring managers in one professional marketplace.
                      </CardDescription>
                    </CardHeader>
                  </Card>

                  <Card className="text-center">
                    <CardHeader>
                      <TrendingUp className="h-12 w-12 mx-auto text-purple-600 mb-4" />
                      <CardTitle>Job Seekers</CardTitle>
                      <CardDescription>
                        Browse vetted services to sharpen your resume, ace your interviews,
                        and accelerate your job search with expert help.
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </div>
              </div>

              {/* CTA */}
              <div className="text-center">
                <Card className="inline-block border-brand-purple/30 bg-gradient-to-br from-brand-purple/5 to-brand-blue/5">
                  <CardContent className="py-10 px-12">
                    <h3 className="text-2xl font-bold mb-2">Ready to start?</h3>
                    <p className="text-muted-foreground mb-6">
                      Create your free account and list your first service in minutes.
                    </p>
                    <Link to="/signup">
                      <Button
                        size="lg"
                        className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90"
                      >
                        Sign Up Free
                        <ArrowRight className="ml-2 h-5 w-5" />
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
          <Footer />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} collapsed={sidebarCollapsed} />
      <div className={sidebarCollapsed ? "lg:ml-16" : "lg:ml-80"}>
        <Navigation
          onMenuClick={openSidebar}
          onSidebarToggle={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
        />
        <div className="pt-16">
        <main className="p-4 md:p-8 max-w-4xl mx-auto w-full">

          <ServicesNav hasCompanyAccess={hasCompanyAccess} />

          {/* Header — Add Service + Lead Gen Settings buttons moved into the
              Offerings sub-tab (inside Content Creator) where they belong. */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold">Services</h1>
            <p className="text-muted-foreground mt-1">
              Dashboard, offerings, and incoming leads
            </p>
          </div>

          <Tabs value={activeTab}>

            {/* ── Dashboard ───────────────────────────────────────────────── */}
            <TabsContent value="dashboard" className="space-y-6">

              {/* Consolidated metrics — standard services + creator stats
                  (when active) in a single compact grid. */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MetricCard
                  icon={ShoppingBag}
                  label="Active Services"
                  value={services.filter((s) => s.isActive).length}
                />
                <MetricCard
                  icon={Inbox}
                  label="New Leads"
                  value={pendingCount}
                />
                <MetricCard
                  icon={MessageSquare}
                  label="Total Inquiries"
                  value={incoming.length}
                />
                <MetricCard
                  icon={CheckCircle2}
                  label="Completed"
                  value={incoming.filter((i) => i.inquiry.status === "completed").length}
                />
                {creatorActive && creatorProfile && (
                  <>
                    <MetricCard
                      icon={Video}
                      label="Projects"
                      value={creatorProfile.completedProjectsCount}
                    />
                    <MetricCard
                      icon={DollarSign}
                      label="Earned"
                      value={`$${(creatorProfile.totalEarnedCents / 100).toFixed(2)}`}
                    />
                    <MetricCard
                      icon={Star}
                      label={`Rating (${creatorProfile.ratingCount})`}
                      value={creatorProfile.averageRating?.toFixed(1) ?? "—"}
                    />
                    <MetricCard
                      icon={Users}
                      label="Display Name"
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
                        <h3 className="text-lg font-medium mb-1">No active programs</h3>
                        <p className="text-sm text-muted-foreground max-w-sm">
                          Join a standard service to see metrics here. Start with
                          the Affiliate or Content Creator program.
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
                            <h3 className="font-semibold text-sm">Affiliate</h3>
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
                            Affiliate Program
                            <ArrowRight className="h-3 w-3 ml-1" />
                          </Link>
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Earn 25% commission on every referral's first-month subscription. Unlimited referrals, tiered rewards from Bronze to Platinum.
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
                          Join Affiliate Program
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
                          <h3 className="font-semibold text-sm">Content Creator</h3>
                          <div className="mt-0.5">
                            <ServiceStatusBadge loading={creatorLoading} active={creatorActive} />
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Sell promo videos, portfolio pieces, and creative services. Set your own pricing, track projects, and get reviewed by clients.
                      </p>
                      {!creatorLoading && !creatorActive && (
                        <Button
                          size="sm"
                          className="w-full bg-gradient-to-r from-pink-500 to-orange-400 hover:opacity-90"
                          onClick={() => setWizardOpen(true)}
                        >
                          <Video className="h-4 w-4 mr-1" />
                          Join Creator Program
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
                      Incoming
                      {pendingCount > 0 && (
                        <Badge variant="destructive" className="ml-1 h-5 min-w-5 px-1 text-xs">
                          {pendingCount}
                        </Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="sent" className="flex items-center gap-2">
                      <Send className="h-4 w-4" />
                      My Requests
                    </TabsTrigger>
                  </TabsList>

                  {/* Incoming */}
                  <TabsContent value="incoming">
                    {incoming.length === 0 ? (
                      <Card>
                        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                          <Inbox className="h-12 w-12 text-muted-foreground mb-4" />
                          <h3 className="text-lg font-medium mb-1">No incoming inquiries</h3>
                          <p className="text-muted-foreground text-sm">
                            When someone requests one of your services, it will appear here.
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
                                      {inquiry.orderType === "purchase" ? "Purchase" : "Inquiry"}
                                    </Badge>
                                  </div>
                                  <p className="text-sm text-muted-foreground mb-1">
                                    <span className="font-medium text-foreground">{service.title}</span>
                                    {" · "}
                                    {inquiry.orderType === "purchase" && (
                                      <span className="text-violet-600 font-medium">
                                        {formatPrice(inquiry.paidAmountCents)}
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
                                    {timeAgo(inquiry.createdAt)}
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
                                      Accept
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-destructive border-destructive/30 hover:bg-destructive/10"
                                      disabled={updating === inquiry.id}
                                      onClick={() => handleUpdateStatus(inquiry.id, "rejected")}
                                    >
                                      <X className="h-4 w-4 mr-1" />
                                      Decline
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
                                    Complete
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
                          <h3 className="text-lg font-medium mb-1">No requests yet</h3>
                          <p className="text-muted-foreground text-sm">
                            Browse people's profiles to find and request services.
                          </p>
                          <Link to="/people" className="mt-4">
                            <Button variant="outline">Browse People</Button>
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
                                        {formatPrice(inquiry.paidAmountCents)}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground">Inquiry</span>
                                    )}
                                  </p>
                                  {inquiry.message && (
                                    <p className="text-sm bg-muted rounded-md px-3 py-2 mt-2">
                                      {inquiry.message}
                                    </p>
                                  )}
                                  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {timeAgo(inquiry.createdAt)}
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
        </div>
        <Footer />
      </div>

      <CreatorEnrollmentWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onEnrolled={(p) => handleCreatorProfileChange(p)}
      />
    </div>
  );
}
