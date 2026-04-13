import {
  Plus,
  Pencil,
  Trash2,
  DollarSign,
  Eye,
  EyeOff,
  Clock,
  Tag,
  Loader2,
  CheckCircle,
  AlertCircle,
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
  Settings as SettingsIcon,
  Link2,
  Video,
  ChevronDown,
  ChevronUp,
  Star,
} from "lucide-react";
import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Sidebar from "@/components/Sidebar";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";
import {
  servicesService,
  type ServiceOffering,
  type CreateServiceInput,
  type InquiryWithDetails,
  type MyRequestWithDetails,
} from "@/lib/services/services-service";
import {
  isPushSupported,
  requestPushPermission,
  subscribeToPush,
} from "@/lib/push-notifications";
import { toast } from "sonner";
import { USER_ROLES } from "@shared/user-roles";
import affiliateService from "@/lib/services/affiliate-service";
import { AffiliateDashboardContent } from "./AffiliateDashboard";

// ─── Constants ────────────────────────────────────────────────────────────────

const SERVICE_CATEGORIES = [
  "Resume Review",
  "LinkedIn Optimization",
  "Interview Coaching",
  "Career Coaching",
  "Cover Letter Writing",
  "Job Search Strategy",
  "Salary Negotiation",
  "Personal Branding",
  "Headhunting / Lead Generation",
  "Recruitment Services",
  "Other",
];

const defaultForm: CreateServiceInput = {
  title: "",
  description: "",
  category: "",
  priceCents: 0,
  priceVisible: true,
  deliveryDays: undefined,
};

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

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function formatPrice(cents: number | null) {
  if (cents === null) return "Contact for pricing";
  return `$${(cents / 100).toFixed(2)}`;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ServicesManagement() {
  const { sidebarOpen, sidebarCollapsed, openSidebar, closeSidebar, toggleSidebar } = useSidebar();
  const { user, isAuthenticated } = useAuth();
  const [searchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState<"offerings" | "inquiries">("offerings");

  // ── Standard services state ────────────────────────────────────────────────
  // Each standard service tracks: enrolled?, loading?, expanded?, enrolling?
  const expandParam = searchParams.get("expand"); // e.g. ?expand=affiliate

  const [affiliateActive, setAffiliateActive] = useState(false);
  const [affiliateLoading, setAffiliateLoading] = useState(true);
  const [affiliateEnrolling, setAffiliateEnrolling] = useState(false);
  const [affiliateExpanded, setAffiliateExpanded] = useState(expandParam === "affiliate");

  const [creatorActive, setCreatorActive] = useState(false);
  const [creatorLoading, setCreatorLoading] = useState(true);
  const [creatorExpanded, setCreatorExpanded] = useState(expandParam === "creator");
  const [creatorProfile, setCreatorProfile] = useState<{
    completedProjectsCount: number;
    totalEarnedCents: number;
    averageRating: number | null;
    ratingCount: number;
    displayName: string | null;
  } | null>(null);

  // Check standard service enrollment on mount
  useEffect(() => {
    if (!isAuthenticated || !user) return;

    // Affiliate check
    if (user.role === USER_ROLES.AFFILIATE) {
      setAffiliateActive(true);
      setAffiliateLoading(false);
    } else {
      affiliateService.getProfile()
        .then(() => setAffiliateActive(true))
        .catch(() => setAffiliateActive(false))
        .finally(() => setAffiliateLoading(false));
    }

    // Creator check
    import("@/lib/api-client").then(({ apiClient }) => {
      apiClient.get<any>("/api/creators/me")
        .then((res: any) => {
          const profile = res?.data;
          if (profile) {
            setCreatorActive(true);
            setCreatorProfile({
              completedProjectsCount: profile.completedProjectsCount ?? 0,
              totalEarnedCents: profile.totalEarnedCents ?? 0,
              averageRating: profile.averageRating ?? null,
              ratingCount: profile.ratingCount ?? 0,
              displayName: profile.displayName ?? null,
            });
          }
        })
        .catch(() => setCreatorActive(false))
        .finally(() => setCreatorLoading(false));
    });
  }, [isAuthenticated, user]);

  async function handleAffiliateOptIn() {
    setAffiliateEnrolling(true);
    try {
      await affiliateService.getProfile(); // auto-creates profile
      setAffiliateActive(true);
      setAffiliateExpanded(true);
      toast.success("You're now an affiliate! Share your referral link to start earning.");
    } catch {
      toast.error("Failed to join affiliate program. Please try again.");
    } finally {
      setAffiliateEnrolling(false);
    }
  }

  // ── Services state ──────────────────────────────────────────────────────────
  const [providesServices, setProviderServices] = useState(false);
  const [services, setServices] = useState<ServiceOffering[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CreateServiceInput>(defaultForm);

  // ── Inquiries state ─────────────────────────────────────────────────────────
  const [incoming, setIncoming] = useState<InquiryWithDetails[]>([]);
  const [myRequests, setMyRequests] = useState<MyRequestWithDetails[]>([]);
  const [inquiriesLoading, setInquiriesLoading] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);

  // ── Load on mount ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    loadServices();
  }, [isAuthenticated, user]);

  useEffect(() => {
    if (activeTab === "inquiries" && incoming.length === 0 && myRequests.length === 0 && !inquiriesLoading) {
      loadInquiries();
    }
  }, [activeTab]);

  async function loadServices() {
    setLoading(true);
    try {
      const data = await servicesService.listMyServices();
      setServices(data);
      try {
        const { apiClient } = await import("@/lib/api-client");
        const res = await apiClient.get<any>("/api/users/me");
        const profile = (res as any)?.data?.profile ?? (res as any)?.data;
        setProviderServices(profile?.providesServices ?? false);
      } catch {
        // ignore — toggle still works
      }
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

  // ── Service handlers ────────────────────────────────────────────────────────

  async function openCreate() {
    // First-time opt-in: clicking "Add Service" opts the user into providing
    // services and (best-effort) push notifications. After they've created
    // their first service, both can be managed in /settings → Lead Generation.
    if (!providesServices) {
      setSaving(true);
      try {
        await servicesService.toggleProvideServices(true);
        setProviderServices(true);
        toast.success("Lead generation enabled — your services will appear on your profile.");
      } catch {
        toast.error("Failed to enable lead generation");
        setSaving(false);
        return;
      } finally {
        setSaving(false);
      }

      // Best-effort push subscribe so they get notified about new inquiries
      if (isPushSupported()) {
        try {
          const granted = await requestPushPermission();
          if (granted) {
            const sub = await subscribeToPush();
            if (sub) toast.success("Push notifications enabled");
          }
        } catch {
          // ignore — opting in is best-effort
        }
      }
    }

    setEditingId(null);
    setForm(defaultForm);
    setDialogOpen(true);
  }

  function openEdit(s: ServiceOffering) {
    setEditingId(s.id);
    setForm({
      title:        s.title,
      description:  s.description ?? "",
      category:     s.category ?? "",
      priceCents:   s.priceCents ?? 0,
      priceVisible: s.priceVisible,
      deliveryDays: s.deliveryDays ?? undefined,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    try {
      if (editingId) {
        const updated = await servicesService.updateService(editingId, form);
        setServices((prev) => prev.map((s) => (s.id === editingId ? updated : s)));
        toast.success("Service updated");
      } else {
        const created = await servicesService.createService(form);
        setServices((prev) => [created, ...prev]);
        toast.success("Service created");
      }
      setDialogOpen(false);
    } catch {
      toast.error("Failed to save service");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(s: ServiceOffering) {
    try {
      const updated = await servicesService.updateService(s.id, { isActive: !s.isActive });
      setServices((prev) => prev.map((item) => (item.id === s.id ? updated : item)));
    } catch {
      toast.error("Failed to update service");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this service?")) return;
    try {
      await servicesService.deleteService(id);
      setServices((prev) => prev.filter((s) => s.id !== id));
      toast.success("Service deleted");
    } catch {
      toast.error("Failed to delete service");
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

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold">Services</h1>
              <p className="text-muted-foreground mt-1">
                Manage your offerings and respond to incoming leads
              </p>
            </div>
            {activeTab === "offerings" && (
              <div className="flex items-center gap-2">
                <Link to="/settings?tab=lead-generation">
                  <Button variant="outline">
                    <SettingsIcon className="h-4 w-4 mr-2" />
                    Lead Gen Settings
                  </Button>
                </Link>
                <Button onClick={openCreate} disabled={saving}>
                  {saving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4 mr-2" />
                  )}
                  Add Service
                </Button>
              </div>
            )}
          </div>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
            <TabsList className="mb-6">
              <TabsTrigger value="offerings">My Services</TabsTrigger>
              <TabsTrigger value="inquiries" className="flex items-center gap-2">
                Inquiries
                {pendingCount > 0 && (
                  <Badge variant="destructive" className="h-5 min-w-5 px-1 text-xs">
                    {pendingCount}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* ── My Services ─────────────────────────────────────────────── */}
            <TabsContent value="offerings" className="space-y-6">

              {/* ── Standard Services ─────────────────────────────────────── */}
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Standard Services
                </h2>

                {/* Affiliate */}
                <Card className={`transition-colors ${affiliateActive ? "border-green-300/50" : "border-dashed"}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-brand-purple to-brand-blue flex items-center justify-center shrink-0">
                          <Link2 className="h-5 w-5 text-white" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">Affiliate</h3>
                            {affiliateLoading ? (
                              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                            ) : affiliateActive ? (
                              <Badge variant="default" className="text-xs bg-green-600">Active</Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs">Available</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Earn 25% commission on every referral's first-month subscription
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {!affiliateLoading && !affiliateActive && (
                          <Button
                            size="sm"
                            onClick={handleAffiliateOptIn}
                            disabled={affiliateEnrolling}
                            className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90"
                          >
                            {affiliateEnrolling ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-1" />
                            ) : null}
                            Join
                          </Button>
                        )}
                        {affiliateActive && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setAffiliateExpanded(!affiliateExpanded)}
                          >
                            {affiliateExpanded ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                  {affiliateActive && affiliateExpanded && (
                    <div className="border-t px-4 pb-4 pt-4">
                      <AffiliateDashboardContent />
                    </div>
                  )}
                </Card>

                {/* Content Creator */}
                <Card className={`transition-colors ${creatorActive ? "border-green-300/50" : "border-dashed"}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-pink-500 to-orange-400 flex items-center justify-center shrink-0">
                          <Video className="h-5 w-5 text-white" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">Content Creator</h3>
                            {creatorLoading ? (
                              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                            ) : creatorActive ? (
                              <Badge variant="default" className="text-xs bg-green-600">Active</Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs">Available</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Sell promo videos, portfolio pieces, and creative services
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {!creatorLoading && !creatorActive && (
                          <Link to="/creator/onboarding">
                            <Button
                              size="sm"
                              className="bg-gradient-to-r from-pink-500 to-orange-400 hover:opacity-90"
                            >
                              Join
                            </Button>
                          </Link>
                        )}
                        {creatorActive && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setCreatorExpanded(!creatorExpanded)}
                          >
                            {creatorExpanded ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                  {creatorActive && creatorExpanded && creatorProfile && (
                    <div className="border-t px-4 pb-4 pt-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <Card>
                          <CardContent className="p-4 text-center">
                            <p className="text-2xl font-bold">{creatorProfile.completedProjectsCount}</p>
                            <p className="text-xs text-muted-foreground mt-1">Projects Completed</p>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="p-4 text-center">
                            <p className="text-2xl font-bold">
                              ${(creatorProfile.totalEarnedCents / 100).toFixed(2)}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">Total Earned</p>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="p-4 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                              <p className="text-2xl font-bold">
                                {creatorProfile.averageRating?.toFixed(1) ?? "—"}
                              </p>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              Avg Rating ({creatorProfile.ratingCount} reviews)
                            </p>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="p-4 text-center">
                            <p className="text-2xl font-bold">{creatorProfile.displayName ?? "—"}</p>
                            <p className="text-xs text-muted-foreground mt-1">Display Name</p>
                          </CardContent>
                        </Card>
                      </div>
                    </div>
                  )}
                </Card>
              </div>

              {/* ── Custom Offerings ──────────────────────────────────────── */}
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Custom Offerings
                </h2>

              {/* Service list */}
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : services.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    You haven't added any services yet.{" "}
                    <button className="underline font-medium" onClick={openCreate}>
                      Add your first service
                    </button>{" "}
                    to start receiving leads.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-3">
                  {services.map((s) => (
                    <Card key={s.id} className={!s.isActive ? "opacity-60" : undefined}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold truncate">{s.title}</h3>
                              {s.category && (
                                <Badge variant="secondary" className="text-xs">
                                  <Tag className="h-3 w-3 mr-1" />
                                  {s.category}
                                </Badge>
                              )}
                              {!s.isActive && (
                                <Badge variant="outline" className="text-xs text-muted-foreground">
                                  Inactive
                                </Badge>
                              )}
                            </div>
                            {s.description && (
                              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                {s.description}
                              </p>
                            )}
                            <div className="flex items-center gap-4 mt-2 text-sm">
                              <span className="flex items-center gap-1 font-medium text-violet-600">
                                <DollarSign className="h-3.5 w-3.5" />
                                {formatPrice(s.priceCents)}
                              </span>
                              <span className="flex items-center gap-1 text-muted-foreground">
                                {s.priceVisible ? (
                                  <><Eye className="h-3.5 w-3.5" /> Price visible</>
                                ) : (
                                  <><EyeOff className="h-3.5 w-3.5" /> Price on inquiry</>
                                )}
                              </span>
                              {s.deliveryDays && (
                                <span className="flex items-center gap-1 text-muted-foreground">
                                  <Clock className="h-3.5 w-3.5" />
                                  {s.deliveryDays}d delivery
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title={s.isActive ? "Deactivate" : "Activate"}
                              onClick={() => handleToggleActive(s)}
                            >
                              {s.isActive ? (
                                <CheckCircle className="h-4 w-4 text-green-600" />
                              ) : (
                                <AlertCircle className="h-4 w-4 text-muted-foreground" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEdit(s)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => handleDelete(s.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
              </div>
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

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Service" : "Add Service"}</DialogTitle>
            <DialogDescription>
              Define what you offer. Set a price and choose whether to show it publicly or
              only after an inquiry.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label htmlFor="svc-title">Title *</Label>
              <Input
                id="svc-title"
                placeholder="e.g. Resume Review & Feedback"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="svc-desc">Description</Label>
              <Textarea
                id="svc-desc"
                rows={3}
                placeholder="What's included, turnaround time, what you need from the client..."
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="svc-category">Category</Label>
                <Select
                  value={form.category || ""}
                  onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
                >
                  <SelectTrigger id="svc-category">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="svc-delivery">Delivery (days)</Label>
                <Input
                  id="svc-delivery"
                  type="number"
                  min={1}
                  placeholder="e.g. 3"
                  value={form.deliveryDays ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      deliveryDays: e.target.value ? parseInt(e.target.value) : undefined,
                    }))
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="svc-price">Price (USD)</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="svc-price"
                    type="number"
                    min={0}
                    step={0.01}
                    className="pl-8"
                    placeholder="0.00"
                    value={form.priceCents ? (form.priceCents / 100).toFixed(2) : ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        priceCents: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : 0,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Price Visibility</Label>
                <div className="flex items-center gap-3 h-10">
                  <Switch
                    checked={form.priceVisible}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, priceVisible: v }))}
                  />
                  <span className="text-sm text-muted-foreground">
                    {form.priceVisible ? (
                      <span className="flex items-center gap-1">
                        <Eye className="h-3.5 w-3.5" /> Publicly visible
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <EyeOff className="h-3.5 w-3.5" /> Inquiry only
                      </span>
                    )}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {editingId ? "Save Changes" : "Create Service"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
