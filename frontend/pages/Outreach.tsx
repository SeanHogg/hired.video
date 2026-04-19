import {
  Bell,
  Send,
  Video,
  Sparkles,
  ArrowRight,
  Star,
  MessageSquare,
  Mail,
  Phone,
  Users,
  Target,
  Zap,
  BarChart3,
  Clock,
  Network,
  UserPlus,
  MessageCircle,
  Loader2,
  Plus,
  Edit,
  Trash2,
  FileText,
  ExternalLink,
  TrendingUp,
  DollarSign,
  Eye,
  MousePointer,
  Megaphone,
  Layers,
  Share2,
  Play,
  Globe,
  Lock,
  ChevronDown,
  ChevronRight,
  Link2,
  Grid,
  List,
  Search,
} from "lucide-react";
import { useState, useEffect, lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import Pagination, { usePagination } from "@/components/Pagination";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSidebar } from "@/hooks/use-sidebar";
import { useCommHub } from "@/hooks/use-comm-hub";
import { InboxPanel } from "@/components/communication/InboxPanel";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { toast } from "@/hooks/use-toast";
import { communicationService } from "@/lib/services/communication-service";
import { jobBoardService, JobBoardDTO, JobBoardPostingDTO, JobBoardStatsDTO } from "@/lib/services/job-board-service";
import { jobService, type JobSummary } from "@/lib/services/job-service";
import { advertisingService, type JobBoost, type AdvertisingStats } from "@/lib/services/advertising-service";
import { studioService, type StudioProject, StudioProjectStatus, type VideoCampaign, type CampaignStats } from "@/lib/services/studio-service";

const VideoAnalyticsDashboard = lazy(() => import("@/components/studio/VideoAnalyticsDashboard"));

import {
  EmailTemplateDTO,
  EmailCampaignDTO,
  CommunicationTrackingDTO,
  ExternalContactDTO,
  CommunicationStats,
  EmailTemplateCategory,
  EmailTemplateTargetRole,
  EmailCampaignStatus,
  CreateEmailTemplateRequest,
  CreateExternalContactRequest,
  CommunicationChannel,
  CommunicationTrackingStatus,
} from "@/types/communication";

export default function Outreach() {
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();
  const { isAuthenticated, user } = useAuth();

  // State management
  const [activeTab, setActiveTab] = useState<
    "dashboard" | "inbox" | "content" | "templates" | "campaigns" | "tracking" | "contacts" | "job-boards" | "advertise" | "performance"
  >("dashboard");

  // Shared comm hub — used by both the Inbox tab and the Dashboard metric cards
  // so we fetch once per page mount, not per consumer.
  const commHub = useCommHub();

  // Local opt-in flag for the Featured Company Profile waitlist. Persisted in
  // localStorage so the CTA becomes a confirmation after first click and we
  // don't pester the user. Replace with a server call once the endpoint ships.
  const FEATURED_PROFILE_INTEREST_KEY = "outreach.featuredProfile.interest";
  const [featuredProfileInterest, setFeaturedProfileInterest] = useState(false);
  useEffect(() => {
    try {
      setFeaturedProfileInterest(
        localStorage.getItem(FEATURED_PROFILE_INTEREST_KEY) === "1",
      );
    } catch {
      /* SSR / privacy-mode — treat as not opted in */
    }
  }, []);
  const handleFeaturedProfileInterest = () => {
    try {
      localStorage.setItem(FEATURED_PROFILE_INTEREST_KEY, "1");
    } catch {
      /* best-effort */
    }
    setFeaturedProfileInterest(true);
    toast({
      title: "You're on the list",
      description:
        "We'll email you when Featured Company Profiles are available.",
    });
  };
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search, view mode, and pagination for content tabs
  const [templatesSearch, setTemplatesSearch] = useState("");
  const [templatesViewMode, setTemplatesViewMode] = useState<"grid" | "list">("grid");
  const [campaignsSearch, setCampaignsSearch] = useState("");
  const [campaignsViewMode, setCampaignsViewMode] = useState<"grid" | "list">("grid");
  const [contactsSearch, setContactsSearch] = useState("");
  const [contactsViewMode, setContactsViewMode] = useState<"grid" | "list">("grid");

  // Data state
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplateDTO[]>([]);
  const [emailCampaigns, setEmailCampaigns] = useState<EmailCampaignDTO[]>([]);
  const [communicationTracking, setCommunicationTracking] = useState<
    CommunicationTrackingDTO[]
  >([]);
  const [externalContacts, setExternalContacts] = useState<
    ExternalContactDTO[]
  >([]);
  const [communicationStats, setCommunicationStats] =
    useState<CommunicationStats | null>(null);

  const [_teamMembers, setTeamMembers] = useState<
    {
      id: string;
      userProfile?: {
        id: string;
        firstName: string;
        lastName: string;
        role?: string;
      };
    }[]
  >([]);

  // Job Board state
  const [jobBoards, setJobBoards] = useState<JobBoardDTO[]>([]);
  const [jobBoardPostings, setJobBoardPostings] = useState<JobBoardPostingDTO[]>([]);
  const [jobBoardStats, setJobBoardStats] = useState<JobBoardStatsDTO | null>(null);
  const [showJobBoardDialog, setShowJobBoardDialog] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [selectedBoardIds, setSelectedBoardIds] = useState<string[]>([]);
  const [userJobs, setUserJobs] = useState<JobSummary[]>([]);
  const [expirationDate, setExpirationDate] = useState<string>("");
  const [postingFilters, setPostingFilters] = useState({
    jobId: "all",
    boardId: "all",
    status: "all",
  });

  // Advertising state
  const [adStats, setAdStats] = useState<AdvertisingStats | null>(null);
  const [activeBoosts, setActiveBoosts] = useState<JobBoost[]>([]);
  const [boostActionLoading, setBoostActionLoading] = useState<string | null>(null);

  // Published content state
  const [publishedProjects, setPublishedProjects] = useState<StudioProject[]>([]);
  const [videoCampaigns, setVideoCampaigns] = useState<VideoCampaign[]>([]);
  const [expandedVideoId, setExpandedVideoId] = useState<string | null>(null);
  const [showCampaignDialog, setShowCampaignDialog] = useState(false);
  const [campaignForm, setCampaignForm] = useState({ name: "", description: "", utmSource: "", utmMedium: "", utmCampaign: "" });
  const [campaignVideoSelect, setCampaignVideoSelect] = useState<string[]>([]);
  const [campaignSubmitting, setCampaignSubmitting] = useState(false);

  // Boost dialog state
  const [showBoostDialog, setShowBoostDialog] = useState(false);
  const [boostJobId, setBoostJobId] = useState("");
  const [boostPlacementType, setBoostPlacementType] = useState<"search_top" | "discovery_feed" | "both" | "">("");
  const [boostPricingModel, setBoostPricingModel] = useState<"cpm" | "cpc" | "">("");
  const [boostBudget, setBoostBudget] = useState("");
  const [boostDuration, setBoostDuration] = useState("");
  const [boostSubmitting, setBoostSubmitting] = useState(false);

  // Dialog states
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [showContactDialog, setShowContactDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] =
    useState<EmailTemplateDTO | null>(null);
  const [editingContact, setEditingContact] =
    useState<ExternalContactDTO | null>(null);

  // Form states
  const [templateForm, setTemplateForm] = useState<CreateEmailTemplateRequest>({
    name: "",
    description: "",
    subject: "",
    body: "",
    category: EmailTemplateCategory.General,
    targetRole: EmailTemplateTargetRole.All,
  });

  const [contactForm, setContactForm] = useState<CreateExternalContactRequest>({
    email: "",
    firstName: "",
    lastName: "",
    jobTitle: "",
    companyName: "",
    phone: "",
    linkedInUrl: "",
    location: "",
    notes: "",
  });

  // Filtered data for search
  const filteredTemplates = emailTemplates.filter((t) =>
    !templatesSearch || t.name.toLowerCase().includes(templatesSearch.toLowerCase()) ||
    (t.description && t.description.toLowerCase().includes(templatesSearch.toLowerCase())) ||
    t.subject.toLowerCase().includes(templatesSearch.toLowerCase())
  );

  const filteredCampaigns = {
    video: videoCampaigns.filter((vc) =>
      !campaignsSearch || vc.name.toLowerCase().includes(campaignsSearch.toLowerCase()) ||
      (vc.description && vc.description.toLowerCase().includes(campaignsSearch.toLowerCase()))
    ),
    email: emailCampaigns.filter((ec) =>
      !campaignsSearch || ec.name.toLowerCase().includes(campaignsSearch.toLowerCase()) ||
      (ec.description && ec.description.toLowerCase().includes(campaignsSearch.toLowerCase()))
    ),
  };
  const totalCampaigns = filteredCampaigns.video.length + filteredCampaigns.email.length;

  const filteredContacts = externalContacts.filter((c) =>
    !contactsSearch ||
    `${c.firstName} ${c.lastName}`.toLowerCase().includes(contactsSearch.toLowerCase()) ||
    c.email.toLowerCase().includes(contactsSearch.toLowerCase()) ||
    (c.companyName && c.companyName.toLowerCase().includes(contactsSearch.toLowerCase())) ||
    (c.jobTitle && c.jobTitle.toLowerCase().includes(contactsSearch.toLowerCase()))
  );

  // Pagination hooks
  const templatesPagination = usePagination(filteredTemplates.length, 12);
  const campaignsPagination = usePagination(totalCampaigns, 12);
  const contactsPagination = usePagination(filteredContacts.length, 12);

  const paginatedTemplates = filteredTemplates.slice(templatesPagination.startIndex, templatesPagination.endIndex);
  const paginatedContacts = filteredContacts.slice(contactsPagination.startIndex, contactsPagination.endIndex);

  // Load data on component mount
  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const loadData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const [
          templatesData,
          campaignsData,
          trackingData,
          contactsData,
          statsData,
          teamData,
          jobBoardsData,
          jobBoardPostingsData,
          jobBoardStatsData,
          userJobsData,
          adStatsData,
          boostsData,
          studioProjectsData,
          videoCampaignsData,
        ] = await Promise.all([
          communicationService.getEmailTemplates(),
          communicationService.getEmailCampaigns(),
          communicationService.getCommunicationTracking(),
          communicationService.getExternalContacts(),
          communicationService.getCommunicationStats().catch(() => null),
          communicationService.getTeamMembers().catch(() => []),
          jobBoardService.getAvailableJobBoards().catch(() => []),
          jobBoardService.getJobBoardPostings().catch(() => []),
          jobBoardService.getJobBoardStats().catch(() => null),
          jobService.getUserJobs().catch(() => []),
          advertisingService.getStats().catch(() => null),
          advertisingService.getBoosts().catch(() => []),
          studioService.getProjects().then((r) => r.data ?? []).catch(() => [] as StudioProject[]),
          studioService.getCampaigns().then((r) => r.data ?? []).catch(() => [] as VideoCampaign[]),
        ]);

        setEmailTemplates(templatesData);
        setEmailCampaigns(campaignsData);
        setCommunicationTracking(trackingData);
        setExternalContacts(contactsData);
        setCommunicationStats(statsData);
        setTeamMembers(teamData);
        setJobBoards(jobBoardsData);
        setJobBoardPostings(jobBoardPostingsData);
        setJobBoardStats(jobBoardStatsData);
        setUserJobs(userJobsData);
        setAdStats(adStatsData);
        setActiveBoosts(boostsData);
        setPublishedProjects(studioProjectsData.filter(
          (p: StudioProject) => p.status === StudioProjectStatus.Published || p.status === StudioProjectStatus.Exported || p.status === StudioProjectStatus.Completed,
        ));
        setVideoCampaigns(videoCampaignsData);
      } catch (err) {
        console.error("Failed to load outreach data:", err);
        setError(
          err instanceof Error ? err.message : "Failed to load outreach data",
        );
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [isAuthenticated, user]);

  // Template management functions
  const handleCreateTemplate = async () => {
    try {
      const newTemplate =
        await communicationService.createEmailTemplate(templateForm);
      setEmailTemplates((prev) => [...prev, newTemplate]);
      setShowTemplateDialog(false);
      resetTemplateForm();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create template",
      );
    }
  };

  const handleUpdateTemplate = async () => {
    if (!editingTemplate) return;

    try {
      const updatedTemplate = await communicationService.updateEmailTemplate({
        ...templateForm,
        id: editingTemplate.id,
      });
      setEmailTemplates((prev) =>
        prev.map((t) => (t.id === updatedTemplate.id ? updatedTemplate : t)),
      );
      setShowTemplateDialog(false);
      resetTemplateForm();
      setEditingTemplate(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update template",
      );
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    try {
      await communicationService.deleteEmailTemplate(templateId);
      setEmailTemplates((prev) => prev.filter((t) => t.id !== templateId));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete template",
      );
    }
  };

  const resetTemplateForm = () => {
    setTemplateForm({
      name: "",
      description: "",
      subject: "",
      body: "",
      category: EmailTemplateCategory.General,
      targetRole: EmailTemplateTargetRole.All,
    });
  };

  // Contact management functions
  const handleCreateContact = async () => {
    try {
      const newContact =
        await communicationService.createExternalContact(contactForm);
      setExternalContacts((prev) => [...prev, newContact]);
      setShowContactDialog(false);
      resetContactForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create contact");
    }
  };

  const handleUpdateContact = async () => {
    if (!editingContact) return;

    try {
      const updatedContact = await communicationService.updateExternalContact({
        ...contactForm,
        id: editingContact.id,
      });
      setExternalContacts((prev) =>
        prev.map((c) => (c.id === updatedContact.id ? updatedContact : c)),
      );
      setShowContactDialog(false);
      resetContactForm();
      setEditingContact(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update contact");
    }
  };

  const handleDeleteContact = async (contactId: string) => {
    try {
      await communicationService.deleteExternalContact(contactId);
      setExternalContacts((prev) => prev.filter((c) => c.id !== contactId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete contact");
    }
  };

  const resetContactForm = () => {
    setContactForm({
      email: "",
      firstName: "",
      lastName: "",
      jobTitle: "",
      companyName: "",
      phone: "",
      linkedInUrl: "",
      location: "",
      notes: "",
    });
  };

  // If user is not authenticated, show marketing page
  if (!isAuthenticated || !user) {
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
                <div className="inline-flex items-center space-x-2 mb-6">
                  <div className="relative">
                    <Send className="h-12 w-12 text-primary" />
                    <Sparkles className="h-6 w-6 text-brand-blue absolute -top-1 -right-1" />
                  </div>
                  <span className="text-4xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                    Smart Outreach
                  </span>
                </div>
                <h1 className="text-5xl font-bold mb-6">
                  Connect, Engage, and Follow Up
                </h1>
                <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
                  Streamline your networking and communication with AI-powered
                  outreach tools. Send personalized messages, track engagement,
                  and automate follow-ups to accelerate your career.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link to="/signup">
                    <Button
                      size="lg"
                      className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8"
                    >
                      Start Networking Today
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                  <Link to="/login">
                    <Button
                      size="lg"
                      variant="outline"
                      className="text-lg px-8"
                    >
                      Sign In
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Features Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 mb-12 sm:mb-16">
                <Card className="border-brand-purple/20 hover:border-brand-purple/40 transition-colors">
                  <CardHeader>
                    <MessageSquare className="h-10 w-10 text-brand-purple mb-4" />
                    <CardTitle>Smart Messaging</CardTitle>
                    <CardDescription>
                      AI-powered message templates and personalization to help
                      you craft compelling outreach that gets responses.
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="border-brand-blue/20 hover:border-brand-blue/40 transition-colors">
                  <CardHeader>
                    <BarChart3 className="h-10 w-10 text-brand-blue mb-4" />
                    <CardTitle>Engagement Tracking</CardTitle>
                    <CardDescription>
                      Monitor response rates, track conversations, and analyze
                      which outreach strategies work best for your career goals.
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="border-primary/20 hover:border-primary/40 transition-colors">
                  <CardHeader>
                    <Clock className="h-10 w-10 text-primary mb-4" />
                    <CardTitle>Follow-up Automation</CardTitle>
                    <CardDescription>
                      Never miss a follow-up opportunity with automated
                      reminders and sequence scheduling tailored to your
                      networking strategy.
                    </CardDescription>
                  </CardHeader>
                </Card>
              </div>

              {/* Persona-specific Benefits */}
              <div className="mb-16">
                <h2 className="text-3xl font-bold text-center mb-12">
                  Outreach for Every Professional
                </h2>
                <div className="grid md:grid-cols-3 gap-8">
                  <Card className="text-center">
                    <CardHeader>
                      <Users className="h-12 w-12 mx-auto text-green-600 mb-4" />
                      <CardTitle>Job Seekers</CardTitle>
                      <CardDescription>
                        Reach out to hiring managers, request informational
                        interviews, and build relationships that lead to
                        opportunities.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm text-left">
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-yellow-500" />
                          LinkedIn connection requests
                        </div>
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-yellow-500" />
                          Informational interview requests
                        </div>
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-yellow-500" />
                          Thank you and follow-up messages
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="text-center">
                    <CardHeader>
                      <Target className="h-12 w-12 mx-auto text-blue-600 mb-4" />
                      <CardTitle>Recruiters</CardTitle>
                      <CardDescription>
                        Engage top talent, nurture candidate relationships, and
                        maintain a pipeline of qualified professionals.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm text-left">
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-yellow-500" />
                          Candidate sourcing messages
                        </div>
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-yellow-500" />
                          Interview invitation templates
                        </div>
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-yellow-500" />
                          Talent pipeline management
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="text-center">
                    <CardHeader>
                      <Network className="h-12 w-12 mx-auto text-purple-600 mb-4" />
                      <CardTitle>Employers</CardTitle>
                      <CardDescription>
                        Build partnerships, connect with vendors, and maintain
                        professional relationships that drive growth.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm text-left">
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-yellow-500" />
                          Partnership proposals
                        </div>
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-yellow-500" />
                          Vendor outreach campaigns
                        </div>
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-yellow-500" />
                          Client relationship management
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Communication Channels */}
              <div className="mb-16">
                <h2 className="text-3xl font-bold text-center mb-12">
                  Multi-Channel Communication
                </h2>
                <div className="grid md:grid-cols-4 gap-6">
                  <Card className="text-center">
                    <CardHeader>
                      <Mail className="h-8 w-8 mx-auto text-blue-600 mb-2" />
                      <CardTitle className="text-lg">Email</CardTitle>
                      <CardDescription className="text-sm">
                        Professional email templates and automation
                      </CardDescription>
                    </CardHeader>
                  </Card>

                  <Card className="text-center">
                    <CardHeader>
                      <MessageCircle className="h-8 w-8 mx-auto text-green-600 mb-2" />
                      <CardTitle className="text-lg">LinkedIn</CardTitle>
                      <CardDescription className="text-sm">
                        Social networking and connection requests
                      </CardDescription>
                    </CardHeader>
                  </Card>

                  <Card className="text-center">
                    <CardHeader>
                      <Phone className="h-8 w-8 mx-auto text-purple-600 mb-2" />
                      <CardTitle className="text-lg">Phone</CardTitle>
                      <CardDescription className="text-sm">
                        Call scheduling and follow-up reminders
                      </CardDescription>
                    </CardHeader>
                  </Card>

                  <Card className="text-center">
                    <CardHeader>
                      <Video className="h-8 w-8 mx-auto text-red-600 mb-2" />
                      <CardTitle className="text-lg">Video</CardTitle>
                      <CardDescription className="text-sm">
                        Personalized video messages and calls
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </div>
              </div>

              {/* Final CTA */}
              <div className="text-center bg-gradient-to-r from-brand-purple/10 to-brand-blue/10 p-8 rounded-2xl">
                <h3 className="text-2xl font-bold mb-4">
                  Ready to Supercharge Your Networking?
                </h3>
                <p className="text-muted-foreground mb-6">
                  Join thousands of professionals who are building meaningful
                  connections and accelerating their careers with smart
                  outreach.
                </p>
                <Link to="/signup">
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90"
                  >
                    Start Your Outreach Campaign
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
              </div>
            </div>
            <Footer />
          </div>
        </div>
      </div>
    );
  }

  // Authenticated user view - Outreach dashboard
  return (
    <div className="min-h-screen bg-background">
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

        <div className="pt-16 p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Header — primary actions live inside each tab, not here,
                so the CTA always matches the active surface. */}
            <div>
              <h1 className="text-3xl font-bold text-foreground">
                Outreach & Communication
              </h1>
              <p className="text-muted-foreground mt-1">
                Manage your networking campaigns and follow-ups
              </p>
            </div>

            {/* Loading State */}
            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin mr-2" />
                <span>Loading outreach data...</span>
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center">
                  <MessageCircle className="h-5 w-5 text-red-500 mr-2" />
                  <span className="text-red-700">{error}</span>
                </div>
              </div>
            )}

            {/* Main Content */}
            {!isLoading && !error && (
              <>
                {/* Tabs Navigation */}
                <Tabs
                  value={activeTab}
                  onValueChange={(value) =>
                    setActiveTab(
                      value as typeof activeTab,
                    )
                  }
                >
                  <TabsList className="grid w-full grid-cols-10">
                    <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
                    <TabsTrigger value="inbox" className="flex items-center gap-1">
                      Inbox
                      {commHub.unreadCount > 0 && (
                        <Badge
                          variant="destructive"
                          className="h-4 min-w-[16px] px-1 text-[10px] flex items-center justify-center"
                        >
                          {commHub.unreadCount > 99 ? "99+" : commHub.unreadCount}
                        </Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="content" className="flex items-center gap-1">
                      <Video className="h-3.5 w-3.5" />
                      My Content
                    </TabsTrigger>
                    <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
                    <TabsTrigger value="templates">Templates</TabsTrigger>
                    <TabsTrigger value="tracking">Tracking</TabsTrigger>
                    <TabsTrigger value="contacts">Contacts</TabsTrigger>
                    <TabsTrigger value="job-boards">Job Boards</TabsTrigger>
                    <TabsTrigger value="advertise" className="flex items-center gap-1">
                      <Megaphone className="h-3.5 w-3.5" />
                      Advertise
                    </TabsTrigger>
                    <TabsTrigger value="performance" className="flex items-center gap-1">
                      <BarChart3 className="h-3.5 w-3.5" />
                      Performance
                    </TabsTrigger>
                  </TabsList>

                  {/* Dashboard Tab */}
                  <TabsContent value="dashboard" className="space-y-6">
                    {/* Inbox Snapshot — pending communications at a glance. Cards
                        jump to the Inbox tab so users always have one path to
                        act on requests/messages. */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <Card
                        role="button"
                        tabIndex={0}
                        onClick={() => setActiveTab("inbox")}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setActiveTab("inbox");
                          }
                        }}
                        className="cursor-pointer hover:border-primary/50 hover:shadow-sm transition"
                      >
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <CardTitle className="text-sm font-medium text-muted-foreground">
                            Pending Requests
                          </CardTitle>
                          <UserPlus className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">
                            {commHub.items.filter((i) => i.kind === "request").length}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Awaiting your response
                          </div>
                        </CardContent>
                      </Card>

                      <Card
                        role="button"
                        tabIndex={0}
                        onClick={() => setActiveTab("inbox")}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setActiveTab("inbox");
                          }
                        }}
                        className="cursor-pointer hover:border-primary/50 hover:shadow-sm transition"
                      >
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <CardTitle className="text-sm font-medium text-muted-foreground">
                            Unread Messages
                          </CardTitle>
                          <MessageCircle className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">
                            {commHub.items.filter((i) => i.kind === "message" && !i.isRead).length}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Direct messages
                          </div>
                        </CardContent>
                      </Card>

                      <Card
                        role="button"
                        tabIndex={0}
                        onClick={() => setActiveTab("inbox")}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setActiveTab("inbox");
                          }
                        }}
                        className="cursor-pointer hover:border-primary/50 hover:shadow-sm transition"
                      >
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <CardTitle className="text-sm font-medium text-muted-foreground">
                            New Notifications
                          </CardTitle>
                          <Bell className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">
                            {commHub.items.filter((i) => i.kind === "notification" && !i.isRead).length}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            System updates
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Quick Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                      <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <CardTitle className="text-sm font-medium text-muted-foreground">
                            Messages Sent
                          </CardTitle>
                          <Send className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">
                            {communicationStats?.totalMessages || 0}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Total messages sent
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <CardTitle className="text-sm font-medium text-muted-foreground">
                            Response Rate
                          </CardTitle>
                          <BarChart3 className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">
                            {communicationStats?.responseRate
                              ? `${Math.round(communicationStats.responseRate * 100)}%`
                              : "0%"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Average response rate
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <CardTitle className="text-sm font-medium text-muted-foreground">
                            Active Conversations
                          </CardTitle>
                          <MessageSquare className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">
                            {communicationStats?.activeConversations || 0}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Ongoing conversations
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <CardTitle className="text-sm font-medium text-muted-foreground">
                            Pending Follow-ups
                          </CardTitle>
                          <Clock className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">
                            {communicationStats?.pendingFollowUps || 0}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Require attention
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Job Board Analytics */}
                    {jobBoardStats && jobBoardStats.totalPostings > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Target className="h-5 w-5" />
                            Job Board Distribution
                          </CardTitle>
                          <CardDescription>
                            Performance metrics across all job boards
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
                            <div className="text-center">
                              <div className="text-2xl font-bold">
                                {jobBoardStats.totalPostings}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Total Postings
                              </div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold">
                                {jobBoardStats.activePostings}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Active Postings
                              </div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold">
                                {jobBoardStats.totalViews}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Total Views
                              </div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold">
                                {jobBoardStats.totalApplications}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Applications
                              </div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold">
                                ${jobBoardStats.totalCost.toFixed(2)}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Total Cost
                              </div>
                            </div>
                          </div>

                          {/* Board Performance Table */}
                          {jobBoardStats.boardPerformance.length > 0 && (
                            <div>
                              <h4 className="text-sm font-medium mb-3">
                                Board Performance Comparison
                              </h4>
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Board</TableHead>
                                    <TableHead className="text-right">Postings</TableHead>
                                    <TableHead className="text-right">Views</TableHead>
                                    <TableHead className="text-right">Applications</TableHead>
                                    <TableHead className="text-right">Cost</TableHead>
                                    <TableHead className="text-right">Cost/App</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {jobBoardStats.boardPerformance.map((board) => (
                                    <TableRow key={board.jobBoardId}>
                                      <TableCell className="font-medium">
                                        {board.jobBoardName}
                                      </TableCell>
                                      <TableCell className="text-right">
                                        {board.totalPostings}
                                      </TableCell>
                                      <TableCell className="text-right">
                                        {board.totalViews}
                                      </TableCell>
                                      <TableCell className="text-right">
                                        {board.totalApplications}
                                      </TableCell>
                                      <TableCell className="text-right">
                                        ${board.totalCost.toFixed(2)}
                                      </TableCell>
                                      <TableCell className="text-right">
                                        {board.averageCostPerApplication > 0
                                          ? `$${board.averageCostPerApplication.toFixed(2)}`
                                          : "-"}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )}

                    {/* Quick Actions */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Zap className="h-5 w-5" />
                            Quick Actions
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <Button
                            className="w-full justify-start gap-3"
                            variant="outline"
                            onClick={() => setShowTemplateDialog(true)}
                          >
                            <FileText className="h-4 w-4" />
                            Create Email Template
                          </Button>
                          <Button
                            className="w-full justify-start gap-3"
                            variant="outline"
                            disabled
                          >
                            <Mail className="h-4 w-4" />
                            Start Email Campaign (Coming Soon)
                          </Button>
                          <Button
                            className="w-full justify-start gap-3"
                            variant="outline"
                            onClick={() => setShowContactDialog(true)}
                          >
                            <UserPlus className="h-4 w-4" />
                            Add External Contact
                          </Button>
                          <Button
                            className="w-full justify-start gap-3"
                            variant="outline"
                            onClick={() => setShowJobBoardDialog(true)}
                          >
                            <Target className="h-4 w-4" />
                            Post Job to Boards
                          </Button>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Clock className="h-5 w-5" />
                            Recent Activity
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {communicationTracking.slice(0, 3).map((tracking) => (
                            <div
                              key={tracking.id}
                              className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg"
                            >
                              <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0" />
                              <div className="flex-1">
                                <p className="text-sm font-medium">
                                  {tracking.subject || "Communication"}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {tracking.externalName ||
                                    tracking.targetUser?.firstName +
                                      " " +
                                      tracking.targetUser?.lastName}
                                </p>
                              </div>
                            </div>
                          ))}
                          {communicationTracking.length === 0 && (
                            <p className="text-sm text-muted-foreground text-center py-4">
                              No recent activity
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  </TabsContent>

                  {/* Inbox Tab — unified messages, notifications, connection requests.
                      Same InboxPanel surface the header overlay uses; we pass the
                      shared `commHub` so both tabs read from a single data source. */}
                  <TabsContent value="inbox" className="space-y-6">
                    <Card className="overflow-hidden">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <MessageCircle className="h-5 w-5" />
                          Inbox
                        </CardTitle>
                        <CardDescription>
                          Messages, notifications, and pending connection requests.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="p-0">
                        <InboxPanel
                          hub={commHub}
                          hideHeader
                          heightClassName="min-h-[32rem] max-h-[70vh]"
                        />
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* My Content Tab — published videos & artifacts */}
                  <TabsContent value="content" className="space-y-6">
                    <div className="flex items-center justify-between">
                      <h2 className="text-2xl font-bold">My Published Content</h2>
                      <Link to="/studio">
                        <Button>
                          <Plus className="h-4 w-4 mr-2" />
                          Create Video
                        </Button>
                      </Link>
                    </div>

                    {publishedProjects.length > 0 ? (
                      <div className="space-y-4">
                        {publishedProjects.map((project) => {
                          const isExpanded = expandedVideoId === project.id;
                          const videoId = project.youtubeVideoId ?? project.id;
                          const publicUrl = `https://hired.video/v/${videoId}`;
                          return (
                            <Card key={project.id}>
                              <CardHeader className="pb-3">
                                <div className="flex items-start justify-between gap-4">
                                  <div className="flex items-start gap-4 min-w-0">
                                    {/* Thumbnail */}
                                    <div className="shrink-0 w-32 h-20 rounded-md overflow-hidden bg-muted flex items-center justify-center">
                                      {project.thumbnailUrl ? (
                                        <img src={project.thumbnailUrl} alt={project.title} className="w-full h-full object-cover" />
                                      ) : (
                                        <Play className="h-6 w-6 text-muted-foreground" />
                                      )}
                                    </div>
                                    <div className="min-w-0">
                                      <CardTitle className="text-base truncate">{project.title}</CardTitle>
                                      <div className="flex items-center gap-2 mt-1">
                                        <Badge variant={project.status === StudioProjectStatus.Published ? "default" : "secondary"}>
                                          {project.status}
                                        </Badge>
                                        {project.isPublic ? (
                                          <span className="flex items-center gap-1 text-[11px] text-emerald-500"><Globe className="w-3 h-3" /> Public</span>
                                        ) : (
                                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><Lock className="w-3 h-3" /> Unlisted</span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                        <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {project.viewCount ?? 0} views</span>
                                        <span className="flex items-center gap-1"><MousePointer className="w-3 h-3" /> {project.ctaClickCount ?? 0} clicks</span>
                                        <span>{new Date(project.creationDateTime).toLocaleDateString()}</span>
                                      </div>
                                    </div>
                                  </div>
                                  {/* Actions */}
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs"
                                      onClick={() => {
                                        navigator.clipboard.writeText(publicUrl);
                                      }}
                                    >
                                      <Link2 className="w-3 h-3 mr-1" /> Copy Link
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs"
                                      asChild
                                    >
                                      <a
                                        href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(publicUrl)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                      >
                                        <Share2 className="w-3 h-3 mr-1" /> Share
                                      </a>
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 text-xs"
                                      onClick={() => setExpandedVideoId(isExpanded ? null : project.id)}
                                    >
                                      <BarChart3 className="w-3 h-3 mr-1" />
                                      Analytics
                                      {isExpanded ? <ChevronDown className="w-3 h-3 ml-1" /> : <ChevronRight className="w-3 h-3 ml-1" />}
                                    </Button>
                                  </div>
                                </div>
                              </CardHeader>
                              {/* Inline analytics */}
                              {isExpanded && (
                                <CardContent className="pt-0 border-t">
                                  <Suspense fallback={<div className="flex items-center justify-center py-8 text-muted-foreground text-sm"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading analytics…</div>}>
                                    <VideoAnalyticsDashboard
                                      videoId={videoId}
                                      videoDurationSec={project.script?.video?.duration}
                                    />
                                  </Suspense>
                                </CardContent>
                              )}
                            </Card>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-12">
                        <Video className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        <h3 className="text-lg font-medium mb-2">No published content yet</h3>
                        <p className="text-muted-foreground mb-4">
                          Create and publish videos in the Studio to promote them here
                        </p>
                        <Link to="/studio">
                          <Button>
                            <Plus className="h-4 w-4 mr-2" />
                            Go to Studio
                          </Button>
                        </Link>
                      </div>
                    )}
                  </TabsContent>

                  {/* Templates Tab */}
                  <TabsContent value="templates" className="space-y-6">
                    <div className="flex items-center justify-between">
                      <h2 className="text-2xl font-bold">Email Templates</h2>
                      <Button onClick={() => setShowTemplateDialog(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        New Template
                      </Button>
                    </div>

                    {/* Search and View Toggle */}
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                        <Input
                          placeholder="Search templates..."
                          value={templatesSearch}
                          onChange={(e) => { setTemplatesSearch(e.target.value); templatesPagination.setCurrentPage(1); }}
                          className="pl-10 min-h-[44px]"
                        />
                      </div>
                      <div className="flex items-center border rounded-md">
                        <Button variant={templatesViewMode === "grid" ? "default" : "ghost"} size="sm" onClick={() => setTemplatesViewMode("grid")} className="rounded-r-none">
                          <Grid className="h-4 w-4" />
                        </Button>
                        <Button variant={templatesViewMode === "list" ? "default" : "ghost"} size="sm" onClick={() => setTemplatesViewMode("list")} className="rounded-l-none">
                          <List className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className={templatesViewMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" : "flex flex-col gap-4"}>
                      {paginatedTemplates.map((template) => (
                        <Card key={template.id} className={templatesViewMode === "list" ? "flex flex-row items-center" : ""}>
                          {templatesViewMode === "list" ? (
                            <>
                              <div className="flex-1 flex items-center gap-4 p-4 min-w-0">
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold truncate">{template.name}</p>
                                  <p className="text-sm text-muted-foreground truncate">{template.description}</p>
                                </div>
                                <div className="hidden md:flex items-center gap-2 flex-shrink-0">
                                  <Badge variant="secondary">{EmailTemplateCategory[template.category]}</Badge>
                                  <Badge variant="outline">{EmailTemplateTargetRole[template.targetRole]}</Badge>
                                </div>
                                <span className="text-sm text-muted-foreground flex-shrink-0">Used {template.usageCount}x</span>
                              </div>
                              <div className="flex gap-2 p-2 flex-shrink-0">
                                <Button size="sm" variant="outline" onClick={() => { setEditingTemplate(template); setTemplateForm({ name: template.name, description: template.description || "", subject: template.subject, body: template.body, category: template.category, targetRole: template.targetRole }); setShowTemplateDialog(true); }}>
                                  <Edit className="h-4 w-4" />
                                </Button>
                                {!template.isSystemTemplate && (
                                  <Button size="sm" variant="outline" onClick={() => handleDeleteTemplate(template.id)}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </>
                          ) : (
                            <>
                              <CardHeader>
                                <div className="flex items-start justify-between">
                                  <div>
                                    <CardTitle className="text-lg">{template.name}</CardTitle>
                                    <CardDescription>{template.description}</CardDescription>
                                  </div>
                                  <div className="flex gap-2">
                                    <Button size="sm" variant="outline" onClick={() => { setEditingTemplate(template); setTemplateForm({ name: template.name, description: template.description || "", subject: template.subject, body: template.body, category: template.category, targetRole: template.targetRole }); setShowTemplateDialog(true); }}>
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                    {!template.isSystemTemplate && (
                                      <Button size="sm" variant="outline" onClick={() => handleDeleteTemplate(template.id)}>
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              </CardHeader>
                              <CardContent>
                                <div className="space-y-2">
                                  <Badge variant="secondary">{EmailTemplateCategory[template.category]}</Badge>
                                  <Badge variant="outline">{EmailTemplateTargetRole[template.targetRole]}</Badge>
                                  <p className="text-sm text-muted-foreground">Used {template.usageCount} times</p>
                                </div>
                              </CardContent>
                            </>
                          )}
                        </Card>
                      ))}
                    </div>

                    {filteredTemplates.length > 0 && (
                      <Pagination
                        currentPage={templatesPagination.currentPage}
                        totalItems={filteredTemplates.length}
                        itemsPerPage={templatesPagination.itemsPerPage}
                        onPageChange={templatesPagination.setCurrentPage}
                        onItemsPerPageChange={templatesPagination.handleItemsPerPageChange}
                      />
                    )}

                    {emailTemplates.length === 0 && (
                      <div className="text-center py-12">
                        <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        <h3 className="text-lg font-medium mb-2">
                          No templates yet
                        </h3>
                        <p className="text-muted-foreground mb-4">
                          Create your first email template to get started
                        </p>
                        <Button onClick={() => setShowTemplateDialog(true)}>
                          <Plus className="h-4 w-4 mr-2" />
                          Create Template
                        </Button>
                      </div>
                    )}
                  </TabsContent>

                  {/* Campaigns Tab */}
                  <TabsContent value="campaigns" className="space-y-6">
                    <div className="flex items-center justify-between">
                      <h2 className="text-2xl font-bold">Campaigns</h2>
                      <Button onClick={() => { setCampaignForm({ name: "", description: "", utmSource: "", utmMedium: "", utmCampaign: "" }); setCampaignVideoSelect([]); setShowCampaignDialog(true); }}>
                        <Plus className="h-4 w-4 mr-2" />
                        New Video Campaign
                      </Button>
                    </div>

                    {/* Campaign Manager — hierarchy context + quick pivots to the
                        surfaces that already implement each level. Campaign is
                        the roadmap wrapper (awareness/traffic/applications);
                        Ad Set ≈ current Job Boost; Ad ≈ creative variant; Analytics
                        lives on the Performance tab. */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Layers className="h-5 w-5 text-primary" />
                          Campaign Manager
                        </CardTitle>
                        <CardDescription>
                          Campaign → Ad Set → Ad. Coordinate targeting, creative, and budget across every placement.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                          <div className="bg-gradient-to-br from-brand-purple/10 to-brand-purple/5 border border-brand-purple/20 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-xs font-semibold text-brand-purple uppercase tracking-wide">Level 1</div>
                              <Badge variant="outline" className="text-[10px]">Planned</Badge>
                            </div>
                            <div className="font-bold mb-1">Campaign</div>
                            <div className="text-xs text-muted-foreground">
                              Strategic objective: Awareness, Traffic, Applications, or Employer Brand.
                            </div>
                          </div>
                          <div className="bg-gradient-to-br from-brand-blue/10 to-brand-blue/5 border border-brand-blue/20 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-xs font-semibold text-brand-blue uppercase tracking-wide">Level 2</div>
                              <Badge className="text-[10px] bg-green-500/10 text-green-700 border-green-200" variant="outline">
                                Live
                              </Badge>
                            </div>
                            <div className="font-bold mb-1">Ad Set</div>
                            <div className="text-xs text-muted-foreground mb-2">
                              Targeting, budget, schedule, bid — today delivered via Job Boosts.
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() => setActiveTab("advertise")}
                            >
                              Manage Boosts →
                            </Button>
                          </div>
                          <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-xs font-semibold text-primary uppercase tracking-wide">Level 3</div>
                              <Badge className="text-[10px] bg-green-500/10 text-green-700 border-green-200" variant="outline">
                                Live
                              </Badge>
                            </div>
                            <div className="font-bold mb-1">Ad</div>
                            <div className="text-xs text-muted-foreground mb-2">
                              Video creatives from Studio, attached via Video Campaigns below.
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() => setActiveTab("content")}
                            >
                              Manage Content →
                            </Button>
                          </div>
                          <div className="bg-gradient-to-br from-muted/50 to-muted/20 border border-muted rounded-lg p-4">
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Analytics</div>
                              <Badge className="text-[10px] bg-green-500/10 text-green-700 border-green-200" variant="outline">
                                Live
                              </Badge>
                            </div>
                            <div className="font-bold mb-1">ROAS Dashboard</div>
                            <div className="text-xs text-muted-foreground mb-2">
                              Funnel, cost-per-outcome, cross-channel performance.
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() => setActiveTab("performance")}
                            >
                              View Performance →
                            </Button>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                          <div className="flex items-start gap-3">
                            <Target className="h-4 w-4 text-brand-purple mt-0.5 shrink-0" />
                            <div>
                              <div className="font-medium">Audience Targeting</div>
                              <div className="text-muted-foreground text-xs mt-0.5">
                                Target by role, skills, experience, location, and open-to-work status. Exclude existing applicants.
                              </div>
                            </div>
                          </div>
                          <div className="flex items-start gap-3">
                            <BarChart3 className="h-4 w-4 text-brand-blue mt-0.5 shrink-0" />
                            <div>
                              <div className="font-medium">Bid Strategies</div>
                              <div className="text-muted-foreground text-xs mt-0.5">
                                Manual CPM / CPC or auto-bid to maximise clicks and applications within budget.
                              </div>
                            </div>
                          </div>
                          <div className="flex items-start gap-3">
                            <Mail className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                            <div>
                              <div className="font-medium">Cross-Channel</div>
                              <div className="text-muted-foreground text-xs mt-0.5">
                                Coordinate paid placements with email outreach sequences in a single unified campaign.
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Search and View Toggle */}
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                        <Input
                          placeholder="Search campaigns..."
                          value={campaignsSearch}
                          onChange={(e) => { setCampaignsSearch(e.target.value); campaignsPagination.setCurrentPage(1); }}
                          className="pl-10 min-h-[44px]"
                        />
                      </div>
                      <div className="flex items-center border rounded-md">
                        <Button variant={campaignsViewMode === "grid" ? "default" : "ghost"} size="sm" onClick={() => setCampaignsViewMode("grid")} className="rounded-r-none">
                          <Grid className="h-4 w-4" />
                        </Button>
                        <Button variant={campaignsViewMode === "list" ? "default" : "ghost"} size="sm" onClick={() => setCampaignsViewMode("list")} className="rounded-l-none">
                          <List className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Video Campaigns */}
                    {filteredCampaigns.video.length > 0 && (
                      <>
                        <h3 className="text-lg font-semibold flex items-center gap-2"><Video className="h-4 w-4" /> Video Campaigns</h3>
                        <div className={campaignsViewMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" : "flex flex-col gap-4"}>
                          {filteredCampaigns.video.map((vc) => (
                            <Card key={vc.id} className={campaignsViewMode === "list" ? "flex flex-row items-center" : ""}>
                              {campaignsViewMode === "list" ? (
                                <>
                                  <div className="flex-1 flex items-center gap-4 p-4 min-w-0">
                                    <div className="flex-1 min-w-0">
                                      <p className="font-semibold truncate">{vc.name}</p>
                                      <p className="text-sm text-muted-foreground truncate">{vc.description || "No description"}</p>
                                    </div>
                                    <div className="hidden md:flex items-center gap-3 text-sm text-muted-foreground flex-shrink-0">
                                      <span>{vc.videoIds.length} videos</span>
                                      <span>{new Date(vc.createdAt).toLocaleDateString()}</span>
                                    </div>
                                    <Badge variant={vc.status === "active" ? "default" : "secondary"} className="flex-shrink-0">{vc.status}</Badge>
                                  </div>
                                  <div className="flex-shrink-0 p-2">
                                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={async () => { await studioService.deleteCampaign(vc.id); setVideoCampaigns((prev) => prev.filter((c) => c.id !== vc.id)); }}>
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <CardHeader>
                                    <div className="flex items-start justify-between">
                                      <div>
                                        <CardTitle>{vc.name}</CardTitle>
                                        <CardDescription>{vc.description || "No description"}</CardDescription>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <Badge variant={vc.status === "active" ? "default" : "secondary"}>{vc.status}</Badge>
                                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={async () => { await studioService.deleteCampaign(vc.id); setVideoCampaigns((prev) => prev.filter((c) => c.id !== vc.id)); }}>
                                          <Trash2 className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    </div>
                                  </CardHeader>
                                  <CardContent>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                      <div>
                                        <p className="text-muted-foreground">Videos</p>
                                        <p className="font-medium">{vc.videoIds.length}</p>
                                      </div>
                                      <div>
                                        <p className="text-muted-foreground">UTM Source</p>
                                        <p className="font-medium">{vc.utmSource || "—"}</p>
                                      </div>
                                      <div>
                                        <p className="text-muted-foreground">UTM Medium</p>
                                        <p className="font-medium">{vc.utmMedium || "—"}</p>
                                      </div>
                                      <div>
                                        <p className="text-muted-foreground">Created</p>
                                        <p className="font-medium">{new Date(vc.createdAt).toLocaleDateString()}</p>
                                      </div>
                                    </div>
                                  </CardContent>
                                </>
                              )}
                            </Card>
                          ))}
                        </div>
                      </>
                    )}

                    {/* Email Campaigns */}
                    {filteredCampaigns.email.length > 0 && (
                      <>
                        <h3 className="text-lg font-semibold flex items-center gap-2 mt-6"><Mail className="h-4 w-4" /> Email Campaigns</h3>
                        <div className={campaignsViewMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" : "flex flex-col gap-4"}>
                          {filteredCampaigns.email.map((campaign) => (
                            <Card key={campaign.id} className={campaignsViewMode === "list" ? "flex flex-row items-center" : ""}>
                              {campaignsViewMode === "list" ? (
                                <div className="flex-1 flex items-center gap-4 p-4 min-w-0">
                                  <div className="flex-1 min-w-0">
                                    <p className="font-semibold truncate">{campaign.name}</p>
                                    <p className="text-sm text-muted-foreground truncate">{campaign.description}</p>
                                  </div>
                                  <div className="hidden md:flex items-center gap-3 text-sm text-muted-foreground flex-shrink-0">
                                    <span>{campaign.totalRecipients} recipients</span>
                                    <span>{campaign.emailsSent} sent</span>
                                    <span>{campaign.emailsOpened} opened</span>
                                  </div>
                                  <Badge variant={campaign.status === EmailCampaignStatus.Sent ? "default" : "secondary"} className="flex-shrink-0">
                                    {EmailCampaignStatus[campaign.status]}
                                  </Badge>
                                </div>
                              ) : (
                                <>
                                  <CardHeader>
                                    <div className="flex items-start justify-between">
                                      <div>
                                        <CardTitle>{campaign.name}</CardTitle>
                                        <CardDescription>{campaign.description}</CardDescription>
                                      </div>
                                      <Badge variant={campaign.status === EmailCampaignStatus.Sent ? "default" : "secondary"}>
                                        {EmailCampaignStatus[campaign.status]}
                                      </Badge>
                                    </div>
                                  </CardHeader>
                                  <CardContent>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                      <div><p className="text-muted-foreground">Recipients</p><p className="font-medium">{campaign.totalRecipients}</p></div>
                                      <div><p className="text-muted-foreground">Sent</p><p className="font-medium">{campaign.emailsSent}</p></div>
                                      <div><p className="text-muted-foreground">Opened</p><p className="font-medium">{campaign.emailsOpened}</p></div>
                                      <div><p className="text-muted-foreground">Replies</p><p className="font-medium">{campaign.repliesReceived}</p></div>
                                    </div>
                                  </CardContent>
                                </>
                              )}
                            </Card>
                          ))}
                        </div>
                      </>
                    )}

                    {totalCampaigns > 0 && (
                      <Pagination
                        currentPage={campaignsPagination.currentPage}
                        totalItems={totalCampaigns}
                        itemsPerPage={campaignsPagination.itemsPerPage}
                        onPageChange={campaignsPagination.setCurrentPage}
                        onItemsPerPageChange={campaignsPagination.handleItemsPerPageChange}
                      />
                    )}

                    {emailCampaigns.length === 0 && videoCampaigns.length === 0 && (
                      <div className="text-center py-12">
                        <Layers className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        <h3 className="text-lg font-medium mb-2">No campaigns yet</h3>
                        <p className="text-muted-foreground mb-4">
                          Create a video campaign to group and track your published content
                        </p>
                        <Button onClick={() => { setCampaignForm({ name: "", description: "", utmSource: "", utmMedium: "", utmCampaign: "" }); setCampaignVideoSelect([]); setShowCampaignDialog(true); }}>
                          <Plus className="h-4 w-4 mr-2" />
                          Create Campaign
                        </Button>
                      </div>
                    )}
                  </TabsContent>

                  {/* Tracking Tab */}
                  <TabsContent value="tracking" className="space-y-6">
                    <h2 className="text-2xl font-bold">
                      Communication Tracking
                    </h2>

                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Contact</TableHead>
                          <TableHead>Subject</TableHead>
                          <TableHead>Channel</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {communicationTracking.map((tracking) => (
                          <TableRow key={tracking.id}>
                            <TableCell>
                              {tracking.externalName ||
                                (tracking.targetUser
                                  ? `${tracking.targetUser.firstName} ${tracking.targetUser.lastName}`
                                  : "Unknown")}
                            </TableCell>
                            <TableCell>
                              {tracking.subject || "No subject"}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {CommunicationChannel[tracking.channel]}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  tracking.status ===
                                  CommunicationTrackingStatus.Replied
                                    ? "default"
                                    : "secondary"
                                }
                              >
                                {CommunicationTrackingStatus[tracking.status]}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {tracking.creationDateTime
                                ? new Date(
                                    tracking.creationDateTime,
                                  ).toLocaleDateString()
                                : "Unknown"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>

                    {communicationTracking.length === 0 && (
                      <div className="text-center py-12">
                        <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        <h3 className="text-lg font-medium mb-2">
                          No communications tracked
                        </h3>
                        <p className="text-muted-foreground">
                          Start sending messages to see tracking data here
                        </p>
                      </div>
                    )}
                  </TabsContent>

                  {/* Contacts Tab */}
                  <TabsContent value="contacts" className="space-y-6">
                    <div className="flex items-center justify-between">
                      <h2 className="text-2xl font-bold">External Contacts</h2>
                      <Button onClick={() => setShowContactDialog(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Contact
                      </Button>
                    </div>

                    {/* Search and View Toggle */}
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                        <Input
                          placeholder="Search contacts..."
                          value={contactsSearch}
                          onChange={(e) => { setContactsSearch(e.target.value); contactsPagination.setCurrentPage(1); }}
                          className="pl-10 min-h-[44px]"
                        />
                      </div>
                      <div className="flex items-center border rounded-md">
                        <Button variant={contactsViewMode === "grid" ? "default" : "ghost"} size="sm" onClick={() => setContactsViewMode("grid")} className="rounded-r-none">
                          <Grid className="h-4 w-4" />
                        </Button>
                        <Button variant={contactsViewMode === "list" ? "default" : "ghost"} size="sm" onClick={() => setContactsViewMode("list")} className="rounded-l-none">
                          <List className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className={contactsViewMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" : "flex flex-col gap-4"}>
                      {paginatedContacts.map((contact) => (
                        <Card key={contact.id} className={contactsViewMode === "list" ? "flex flex-row items-center" : ""}>
                          {contactsViewMode === "list" ? (
                            <>
                              <div className="flex-1 flex items-center gap-4 p-4 min-w-0">
                                <div className="flex-1 min-w-0">
                                  <p className="font-semibold truncate">{contact.firstName} {contact.lastName}</p>
                                  <p className="text-sm text-muted-foreground truncate">{contact.jobTitle}{contact.companyName ? ` at ${contact.companyName}` : ""}</p>
                                </div>
                                <div className="hidden md:flex items-center gap-4 text-sm text-muted-foreground flex-shrink-0">
                                  <span>{contact.email}</span>
                                  {contact.location && <span>{contact.location}</span>}
                                </div>
                              </div>
                              <div className="flex gap-2 p-2 flex-shrink-0">
                                <Button size="sm" variant="outline" onClick={() => { setEditingContact(contact); setContactForm({ email: contact.email, firstName: contact.firstName || "", lastName: contact.lastName || "", jobTitle: contact.jobTitle || "", companyName: contact.companyName || "", phone: contact.phone || "", linkedInUrl: contact.linkedInUrl || "", location: contact.location || "", notes: contact.notes || "" }); setShowContactDialog(true); }}>
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => handleDeleteContact(contact.id)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </>
                          ) : (
                            <>
                              <CardHeader>
                                <div className="flex items-start justify-between">
                                  <div>
                                    <CardTitle className="text-lg">
                                      {contact.firstName} {contact.lastName}
                                    </CardTitle>
                                    <CardDescription>{contact.jobTitle}</CardDescription>
                                    <CardDescription>{contact.companyName}</CardDescription>
                                  </div>
                                  <div className="flex gap-2">
                                    <Button size="sm" variant="outline" onClick={() => { setEditingContact(contact); setContactForm({ email: contact.email, firstName: contact.firstName || "", lastName: contact.lastName || "", jobTitle: contact.jobTitle || "", companyName: contact.companyName || "", phone: contact.phone || "", linkedInUrl: contact.linkedInUrl || "", location: contact.location || "", notes: contact.notes || "" }); setShowContactDialog(true); }}>
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => handleDeleteContact(contact.id)}>
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              </CardHeader>
                              <CardContent>
                                <div className="space-y-2 text-sm">
                                  <p className="text-muted-foreground">{contact.email}</p>
                                  {contact.phone && <p className="text-muted-foreground">{contact.phone}</p>}
                                  {contact.location && <p className="text-muted-foreground">{contact.location}</p>}
                                  {contact.linkedInUrl && (
                                    <a href={contact.linkedInUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                                      LinkedIn <ExternalLink className="h-3 w-3" />
                                    </a>
                                  )}
                                </div>
                              </CardContent>
                            </>
                          )}
                        </Card>
                      ))}
                    </div>

                    {filteredContacts.length > 0 && (
                      <Pagination
                        currentPage={contactsPagination.currentPage}
                        totalItems={filteredContacts.length}
                        itemsPerPage={contactsPagination.itemsPerPage}
                        onPageChange={contactsPagination.setCurrentPage}
                        onItemsPerPageChange={contactsPagination.handleItemsPerPageChange}
                      />
                    )}

                    {externalContacts.length === 0 && (
                      <div className="text-center py-12">
                        <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        <h3 className="text-lg font-medium mb-2">
                          No contacts yet
                        </h3>
                        <p className="text-muted-foreground mb-4">
                          Add external contacts to manage your outreach
                        </p>
                        <Button onClick={() => setShowContactDialog(true)}>
                          <Plus className="h-4 w-4 mr-2" />
                          Add Contact
                        </Button>
                      </div>
                    )}
                  </TabsContent>

                  {/* Job Boards Tab */}
                  <TabsContent value="job-boards" className="space-y-6">
                    <div className="flex items-center justify-between">
                      <h2 className="text-2xl font-bold">Job Board Distribution</h2>
                      <Button onClick={() => setShowJobBoardDialog(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Post to Boards
                      </Button>
                    </div>

                    {/* Job Board Stats */}
                    {jobBoardStats && (
                      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                        <Card>
                          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                              Total Postings
                            </CardTitle>
                            <Target className="h-4 w-4 text-muted-foreground" />
                          </CardHeader>
                          <CardContent>
                            <div className="text-2xl font-bold">
                              {jobBoardStats.totalPostings}
                            </div>
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                              Active Postings
                            </CardTitle>
                            <Zap className="h-4 w-4 text-muted-foreground" />
                          </CardHeader>
                          <CardContent>
                            <div className="text-2xl font-bold">
                              {jobBoardStats.activePostings}
                            </div>
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                              Total Views
                            </CardTitle>
                            <BarChart3 className="h-4 w-4 text-muted-foreground" />
                          </CardHeader>
                          <CardContent>
                            <div className="text-2xl font-bold">
                              {jobBoardStats.totalViews}
                            </div>
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                              Applications
                            </CardTitle>
                            <Users className="h-4 w-4 text-muted-foreground" />
                          </CardHeader>
                          <CardContent>
                            <div className="text-2xl font-bold">
                              {jobBoardStats.totalApplications}
                            </div>
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                              Total Cost
                            </CardTitle>
                            <Target className="h-4 w-4 text-muted-foreground" />
                          </CardHeader>
                          <CardContent>
                            <div className="text-2xl font-bold">
                              ${jobBoardStats.totalCost.toFixed(2)}
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    )}

                    {/* Job Board Postings List */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Active Postings</CardTitle>
                        <CardDescription>
                          Manage your job postings across multiple boards
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {/* Filters */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                          <div>
                            <Label htmlFor="filter-job">Filter by Job</Label>
                            <Select
                              value={postingFilters.jobId}
                              onValueChange={(value) =>
                                setPostingFilters({ ...postingFilters, jobId: value })
                              }
                            >
                              <SelectTrigger id="filter-job">
                                <SelectValue placeholder="All Jobs" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Jobs</SelectItem>
                                {userJobs.map((job) => (
                                  <SelectItem key={job.id} value={job.id}>
                                    {job.title}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <Label htmlFor="filter-board">Filter by Board</Label>
                            <Select
                              value={postingFilters.boardId}
                              onValueChange={(value) =>
                                setPostingFilters({ ...postingFilters, boardId: value })
                              }
                            >
                              <SelectTrigger id="filter-board">
                                <SelectValue placeholder="All Boards" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Boards</SelectItem>
                                {jobBoards.map((board) => (
                                  <SelectItem key={board.id} value={board.id}>
                                    {board.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <Label htmlFor="filter-status">Filter by Status</Label>
                            <Select
                              value={postingFilters.status}
                              onValueChange={(value) =>
                                setPostingFilters({ ...postingFilters, status: value })
                              }
                            >
                              <SelectTrigger id="filter-status">
                                <SelectValue placeholder="All Statuses" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Statuses</SelectItem>
                                <SelectItem value="Pending">Pending</SelectItem>
                                <SelectItem value="Posted">Posted</SelectItem>
                                <SelectItem value="Active">Active</SelectItem>
                                <SelectItem value="Expired">Expired</SelectItem>
                                <SelectItem value="Failed">Failed</SelectItem>
                                <SelectItem value="Removed">Removed</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {/* Clear Filters Button */}
                        {(postingFilters.jobId !== "all" || postingFilters.boardId !== "all" || postingFilters.status !== "all") && (
                          <div className="mb-4">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setPostingFilters({ jobId: "all", boardId: "all", status: "all" })
                              }
                            >
                              Clear Filters
                            </Button>
                          </div>
                        )}
                      </CardContent>
                      <CardContent>
                        {jobBoardPostings.length > 0 ? (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Job Title</TableHead>
                                <TableHead>Board</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Posted</TableHead>
                                <TableHead>Views</TableHead>
                                <TableHead>Applications</TableHead>
                                <TableHead>Cost</TableHead>
                                <TableHead>Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {jobBoardPostings
                                .filter((posting) => {
                                  if (postingFilters.jobId !== "all" && posting.jobId !== postingFilters.jobId) {
                                    return false;
                                  }
                                  if (postingFilters.boardId !== "all" && posting.jobBoardId !== postingFilters.boardId) {
                                    return false;
                                  }
                                  if (postingFilters.status !== "all" && posting.status !== postingFilters.status) {
                                    return false;
                                  }
                                  return true;
                                })
                                .map((posting) => (
                                <TableRow key={posting.id}>
                                  <TableCell className="font-medium">
                                    {posting.jobTitle}
                                  </TableCell>
                                  <TableCell>{posting.jobBoardName}</TableCell>
                                  <TableCell>
                                    <Badge
                                      variant={
                                        posting.status === "Active"
                                          ? "default"
                                          : posting.status === "Pending"
                                          ? "secondary"
                                          : posting.status === "Expired"
                                          ? "outline"
                                          : "destructive"
                                      }
                                    >
                                      {posting.status}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    {new Date(posting.postedAt).toLocaleDateString()}
                                  </TableCell>
                                  <TableCell>{posting.views}</TableCell>
                                  <TableCell>{posting.applications}</TableCell>
                                  <TableCell>
                                    {posting.cost ? `$${posting.cost.toFixed(2)}` : "-"}
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex gap-2">
                                      {posting.externalUrl && (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() =>
                                            window.open(posting.externalUrl!, "_blank")
                                          }
                                        >
                                          <ExternalLink className="h-4 w-4" />
                                        </Button>
                                      )}
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={async () => {
                                          if (
                                            confirm(
                                              "Are you sure you want to remove this posting?"
                                            )
                                          ) {
                                            await jobBoardService.removeJobBoardPosting(
                                              posting.id
                                            );
                                            setJobBoardPostings(
                                              jobBoardPostings.filter(
                                                (p) => p.id !== posting.id
                                              )
                                            );
                                          }
                                        }}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        ) : (
                          <div className="text-center py-12">
                            <Target className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                            <h3 className="text-lg font-medium mb-2">
                              No job board postings yet
                            </h3>
                            <p className="text-muted-foreground mb-4">
                              Post your jobs to multiple boards to reach more candidates
                            </p>
                            <Button onClick={() => setShowJobBoardDialog(true)}>
                              <Plus className="h-4 w-4 mr-2" />
                              Post to Boards
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Advertise Tab */}
                  <TabsContent value="advertise" className="space-y-6">

                    {/* KPI Overview */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                      <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <CardTitle className="text-sm font-medium text-muted-foreground">Total Ad Spend</CardTitle>
                          <DollarSign className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">${(adStats?.totalSpentDollars ?? 0).toFixed(2)}</div>
                          <div className="text-xs text-muted-foreground">{adStats?.activeBoosts ?? 0} active boost{(adStats?.activeBoosts ?? 0) !== 1 ? "s" : ""}</div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <CardTitle className="text-sm font-medium text-muted-foreground">Impressions</CardTitle>
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">{(adStats?.totalImpressions ?? 0).toLocaleString()}</div>
                          <div className="text-xs text-muted-foreground">Total ad impressions</div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <CardTitle className="text-sm font-medium text-muted-foreground">Clicks</CardTitle>
                          <MousePointer className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">{(adStats?.totalClicks ?? 0).toLocaleString()}</div>
                          <div className="text-xs text-muted-foreground">{(adStats?.ctr ?? 0).toFixed(2)}% CTR</div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <CardTitle className="text-sm font-medium text-muted-foreground">Cost per Application</CardTitle>
                          <TrendingUp className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">
                            {adStats?.costPerApplication != null ? `$${adStats.costPerApplication.toFixed(2)}` : "—"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {adStats?.totalApplications ? `${adStats.totalApplications} attributed` : "No applications attributed yet"}
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Sponsored Job Listings */}
                    <Card>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="flex items-center gap-2">
                              <Zap className="h-5 w-5 text-brand-purple" />
                              Sponsored Job Listings
                            </CardTitle>
                            <CardDescription>
                              Boost jobs to the top of search results and the talent discovery feed
                            </CardDescription>
                          </div>
                          <Button
                            onClick={() => setShowBoostDialog(true)}
                            className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90"
                          >
                            <Zap className="h-4 w-4 mr-2" />
                            Boost a Job
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {activeBoosts.length > 0 ? (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Job</TableHead>
                                <TableHead>Placement</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Budget</TableHead>
                                <TableHead className="text-right">Spent</TableHead>
                                <TableHead className="text-right">Impressions</TableHead>
                                <TableHead className="text-right">Clicks</TableHead>
                                <TableHead className="text-right">CTR</TableHead>
                                <TableHead></TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {activeBoosts.map((boost) => (
                                <TableRow key={boost.id}>
                                  <TableCell className="font-medium">{boost.jobTitle ?? boost.jobId.slice(0, 8)}</TableCell>
                                  <TableCell>
                                    <Badge variant="outline" className="capitalize text-xs">
                                      {boost.placementType.replace(/_/g, " ")}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    <Badge
                                      variant={boost.status === "active" ? "default" : "secondary"}
                                      className={`text-xs ${boost.status === "active" ? "bg-green-500/10 text-green-600" : ""}`}
                                    >
                                      {boost.status}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-right">${boost.budgetDollars.toFixed(2)}</TableCell>
                                  <TableCell className="text-right">${boost.spentDollars.toFixed(2)}</TableCell>
                                  <TableCell className="text-right">{boost.impressions.toLocaleString()}</TableCell>
                                  <TableCell className="text-right">{boost.clicks.toLocaleString()}</TableCell>
                                  <TableCell className="text-right">{boost.ctr.toFixed(2)}%</TableCell>
                                  <TableCell>
                                    <div className="flex gap-1 justify-end">
                                      {boost.status === "active" && (
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          disabled={boostActionLoading === boost.id}
                                          onClick={async () => {
                                            setBoostActionLoading(boost.id);
                                            try {
                                              const updated = await advertisingService.pauseBoost(boost.id);
                                              setActiveBoosts((prev) => prev.map((b) => b.id === boost.id ? updated : b));
                                            } catch (err) {
                                              console.error("Failed to pause boost:", err);
                                            } finally {
                                              setBoostActionLoading(null);
                                            }
                                          }}
                                        >
                                          Pause
                                        </Button>
                                      )}
                                      {boost.status === "paused" && (
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          disabled={boostActionLoading === boost.id}
                                          onClick={async () => {
                                            setBoostActionLoading(boost.id);
                                            try {
                                              const updated = await advertisingService.resumeBoost(boost.id);
                                              setActiveBoosts((prev) => prev.map((b) => b.id === boost.id ? updated : b));
                                            } catch (err) {
                                              console.error("Failed to resume boost:", err);
                                            } finally {
                                              setBoostActionLoading(null);
                                            }
                                          }}
                                        >
                                          Resume
                                        </Button>
                                      )}
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="text-destructive hover:text-destructive"
                                        disabled={boostActionLoading === boost.id}
                                        onClick={async () => {
                                          if (!confirm("Cancel this boost?")) return;
                                          setBoostActionLoading(boost.id);
                                          try {
                                            await advertisingService.cancelBoost(boost.id);
                                            setActiveBoosts((prev) => prev.filter((b) => b.id !== boost.id));
                                          } catch (err) {
                                            console.error("Failed to cancel boost:", err);
                                          } finally {
                                            setBoostActionLoading(null);
                                          }
                                        }}
                                      >
                                        Cancel
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        ) : (
                          <div className="text-center py-12 text-muted-foreground">
                            <Megaphone className="h-12 w-12 mx-auto mb-4 opacity-30" />
                            <p className="text-lg font-medium mb-2">No sponsored listings yet</p>
                            <p className="text-sm mb-6">
                              Boost a job to reach qualified candidates faster and cut time-to-hire.
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-xl mx-auto text-left mb-8">
                              <div className="bg-muted/40 rounded-lg p-4">
                                <div className="font-semibold text-sm mb-1">Search Top</div>
                                <div className="text-xs text-muted-foreground">First result in keyword search — highest intent traffic</div>
                              </div>
                              <div className="bg-muted/40 rounded-lg p-4">
                                <div className="font-semibold text-sm mb-1">Discovery Feed</div>
                                <div className="text-xs text-muted-foreground">Featured card in the TikTok-style talent discovery feed</div>
                              </div>
                              <div className="bg-muted/40 rounded-lg p-4">
                                <div className="font-semibold text-sm mb-1">Both Placements</div>
                                <div className="text-xs text-muted-foreground">Maximum reach — search + feed simultaneously</div>
                              </div>
                            </div>
                            <Button onClick={() => setShowBoostDialog(true)} variant="outline">
                              <Zap className="h-4 w-4 mr-2" />
                              Create Your First Boost
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Company Profile Boost — backend isn't wired yet, so the
                        action is a lightweight waitlist opt-in persisted
                        client-side. Swap for a server call when the endpoint
                        ships. */}
                    <Card>
                      <CardHeader>
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <CardTitle className="flex items-center gap-2">
                              <Star className="h-5 w-5 text-brand-blue" />
                              Featured Company Profile
                            </CardTitle>
                            <CardDescription>
                              Promote your employer brand in company search, candidate dashboards, and the talent discovery feed
                            </CardDescription>
                          </div>
                          {featuredProfileInterest ? (
                            <Badge variant="outline" className="gap-1 text-green-700 border-green-200 bg-green-50">
                              <Star className="h-3 w-3" />
                              You're on the list
                            </Badge>
                          ) : (
                            <Button
                              variant="outline"
                              onClick={handleFeaturedProfileInterest}
                            >
                              Request Early Access
                            </Button>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div className="border border-dashed border-muted-foreground/30 rounded-lg p-4 text-center">
                            <Network className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                            <div className="font-medium text-sm mb-1">Company Directory</div>
                            <div className="text-xs text-muted-foreground">Featured slot in employer search results</div>
                          </div>
                          <div className="border border-dashed border-muted-foreground/30 rounded-lg p-4 text-center">
                            <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                            <div className="font-medium text-sm mb-1">Candidate Dashboard</div>
                            <div className="text-xs text-muted-foreground">Spotlight card shown to active job seekers</div>
                          </div>
                          <div className="border border-dashed border-muted-foreground/30 rounded-lg p-4 text-center">
                            <TrendingUp className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                            <div className="font-medium text-sm mb-1">Discovery Feed</div>
                            <div className="text-xs text-muted-foreground">Branded employer card in the talent feed</div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                  </TabsContent>

                  {/* Performance Tab — real ad analytics pulled from adStats.
                      This is the home for cross-placement ROAS, funnel, and
                      cost-per-outcome metrics. Cost-per-hire is shown as "—"
                      until hire attribution lands. */}
                  <TabsContent value="performance" className="space-y-6">
                    {/* Cost-per-outcome KPIs */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                      <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <CardTitle className="text-sm font-medium text-muted-foreground">
                            Cost per Click
                          </CardTitle>
                          <MousePointer className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">
                            {adStats?.costPerClick != null
                              ? `$${adStats.costPerClick.toFixed(2)}`
                              : "—"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {(adStats?.totalClicks ?? 0).toLocaleString()} clicks
                          </div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <CardTitle className="text-sm font-medium text-muted-foreground">
                            Cost per Application
                          </CardTitle>
                          <TrendingUp className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">
                            {adStats?.costPerApplication != null
                              ? `$${adStats.costPerApplication.toFixed(2)}`
                              : "—"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {adStats?.totalApplications ?? 0} attributed
                          </div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <CardTitle className="text-sm font-medium text-muted-foreground">
                            Cost per Hire
                          </CardTitle>
                          <DollarSign className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">—</div>
                          <div className="text-xs text-muted-foreground">
                            Hire attribution in progress
                          </div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <CardTitle className="text-sm font-medium text-muted-foreground">
                            CTR
                          </CardTitle>
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold">
                            {(adStats?.ctr ?? 0).toFixed(2)}%
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Impression → Click
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Conversion funnel — Impressions → Clicks → Applications.
                        Rates derive purely from adStats so they stay in sync. */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <BarChart3 className="h-5 w-5" />
                          Conversion Funnel
                        </CardTitle>
                        <CardDescription>
                          How paid traffic flows from impression to application across all placements.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {(() => {
                          const impressions = adStats?.totalImpressions ?? 0;
                          const clicks = adStats?.totalClicks ?? 0;
                          const apps = adStats?.totalApplications ?? 0;
                          const clickRate = impressions > 0 ? (clicks / impressions) * 100 : 0;
                          const applyRate = clicks > 0 ? (apps / clicks) * 100 : 0;
                          const stages = [
                            { label: "Impressions", value: impressions, rate: null as number | null, color: "bg-brand-purple/80" },
                            { label: "Clicks", value: clicks, rate: clickRate, color: "bg-brand-blue/80" },
                            { label: "Applications", value: apps, rate: applyRate, color: "bg-primary/80" },
                          ];
                          const max = Math.max(impressions, 1);
                          return (
                            <div className="space-y-3">
                              {stages.map((s) => (
                                <div key={s.label}>
                                  <div className="flex items-center justify-between text-sm mb-1">
                                    <span className="font-medium">{s.label}</span>
                                    <span className="text-muted-foreground">
                                      {s.value.toLocaleString()}
                                      {s.rate != null && (
                                        <span className="ml-2 text-xs">
                                          ({s.rate.toFixed(1)}% from prev)
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                                    <div
                                      className={cn("h-full transition-all", s.color)}
                                      style={{ width: `${(s.value / max) * 100}%` }}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </CardContent>
                    </Card>

                    {/* Spend & pacing */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <DollarSign className="h-5 w-5" />
                            Spend Summary
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Total spent</span>
                            <span className="font-semibold">
                              ${(adStats?.totalSpentDollars ?? 0).toFixed(2)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Active boosts</span>
                            <span className="font-semibold">{adStats?.activeBoosts ?? 0}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Active campaigns</span>
                            <span className="font-semibold">{adStats?.activeCampaigns ?? 0}</span>
                          </div>
                          <div className="flex items-center justify-between pt-2 border-t">
                            <span className="text-sm text-muted-foreground">
                              Avg spend / active boost
                            </span>
                            <span className="font-semibold">
                              {adStats && adStats.activeBoosts > 0
                                ? `$${(adStats.totalSpentDollars / adStats.activeBoosts).toFixed(2)}`
                                : "—"}
                            </span>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Mail className="h-5 w-5" />
                            Email Outreach Performance
                          </CardTitle>
                          <CardDescription>
                            Cross-channel context — how direct outreach compares to paid.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Messages sent</span>
                            <span className="font-semibold">
                              {communicationStats?.totalMessages ?? 0}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Response rate</span>
                            <span className="font-semibold">
                              {communicationStats?.responseRate != null
                                ? `${Math.round(communicationStats.responseRate * 100)}%`
                                : "—"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Active conversations</span>
                            <span className="font-semibold">
                              {communicationStats?.activeConversations ?? 0}
                            </span>
                          </div>
                          <div className="flex items-center justify-between pt-2 border-t">
                            <span className="text-sm text-muted-foreground">Pending follow-ups</span>
                            <span className="font-semibold">
                              {communicationStats?.pendingFollowUps ?? 0}
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Per-boost performance table (same rows as Advertise tab
                        but framed for analysis, not management). Empty state
                        points to the Advertise tab where boosts are created. */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Target className="h-5 w-5" />
                          Per-Boost Performance
                        </CardTitle>
                        <CardDescription>
                          Compare placements and CTR across all active and past boosts.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {activeBoosts.length > 0 ? (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Job</TableHead>
                                <TableHead>Placement</TableHead>
                                <TableHead className="text-right">Spent</TableHead>
                                <TableHead className="text-right">Impressions</TableHead>
                                <TableHead className="text-right">Clicks</TableHead>
                                <TableHead className="text-right">CTR</TableHead>
                                <TableHead className="text-right">CPC</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {activeBoosts.map((boost) => {
                                const cpc = boost.clicks > 0 ? boost.spentDollars / boost.clicks : null;
                                return (
                                  <TableRow key={boost.id}>
                                    <TableCell className="font-medium">
                                      {boost.jobTitle ?? boost.jobId.slice(0, 8)}
                                    </TableCell>
                                    <TableCell>
                                      <Badge variant="outline" className="capitalize text-xs">
                                        {boost.placementType.replace(/_/g, " ")}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                      ${boost.spentDollars.toFixed(2)}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      {boost.impressions.toLocaleString()}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      {boost.clicks.toLocaleString()}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      {boost.ctr.toFixed(2)}%
                                    </TableCell>
                                    <TableCell className="text-right">
                                      {cpc != null ? `$${cpc.toFixed(2)}` : "—"}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        ) : (
                          <div className="text-center py-12 text-muted-foreground">
                            <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-30" />
                            <p className="text-sm mb-4">
                              No boosts yet — create one on the Advertise tab to start collecting performance data.
                            </p>
                            <Button variant="outline" onClick={() => setActiveTab("advertise")}>
                              Go to Advertise
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </>
            )}
          </div>
        </div>
        <Footer />
      </div>

      {/* Video Campaign Dialog */}
      <Dialog open={showCampaignDialog} onOpenChange={setShowCampaignDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Video Campaign</DialogTitle>
            <DialogDescription>
              Group your published videos into a campaign with UTM tracking to measure promotion effectiveness.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="campaign-name">Campaign Name *</Label>
              <Input id="campaign-name" placeholder="e.g. Q2 Job Search" value={campaignForm.name} onChange={(e) => setCampaignForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="campaign-desc">Description</Label>
              <Textarea id="campaign-desc" placeholder="What is this campaign for?" value={campaignForm.description} onChange={(e) => setCampaignForm((f) => ({ ...f, description: e.target.value }))} rows={2} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="utm-source" className="text-xs">UTM Source</Label>
                <Input id="utm-source" placeholder="linkedin" className="h-8 text-xs" value={campaignForm.utmSource} onChange={(e) => setCampaignForm((f) => ({ ...f, utmSource: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="utm-medium" className="text-xs">UTM Medium</Label>
                <Input id="utm-medium" placeholder="video" className="h-8 text-xs" value={campaignForm.utmMedium} onChange={(e) => setCampaignForm((f) => ({ ...f, utmMedium: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="utm-campaign" className="text-xs">UTM Campaign</Label>
                <Input id="utm-campaign" placeholder="spring-2026" className="h-8 text-xs" value={campaignForm.utmCampaign} onChange={(e) => setCampaignForm((f) => ({ ...f, utmCampaign: e.target.value }))} />
              </div>
            </div>
            {/* Select videos to include */}
            {publishedProjects.length > 0 && (
              <div>
                <Label className="text-xs mb-1.5 block">Include Videos</Label>
                <div className="border rounded-md max-h-40 overflow-y-auto p-2 space-y-1">
                  {publishedProjects.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={campaignVideoSelect.includes(p.id)}
                        onChange={(e) => {
                          setCampaignVideoSelect((prev) =>
                            e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id),
                          );
                        }}
                        className="rounded"
                      />
                      <span className="truncate">{p.title}</span>
                      <Badge variant="outline" className="text-[10px] ml-auto shrink-0">{p.status}</Badge>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCampaignDialog(false)}>Cancel</Button>
            <Button
              disabled={!campaignForm.name.trim() || campaignSubmitting}
              onClick={async () => {
                setCampaignSubmitting(true);
                try {
                  const res = await studioService.createCampaign({
                    name: campaignForm.name.trim(),
                    description: campaignForm.description || undefined,
                    utmSource: campaignForm.utmSource || undefined,
                    utmMedium: campaignForm.utmMedium || undefined,
                    utmCampaign: campaignForm.utmCampaign || undefined,
                    videoIds: campaignVideoSelect,
                  });
                  if (res.data) {
                    setVideoCampaigns((prev) => [res.data!, ...prev]);
                  }
                  setShowCampaignDialog(false);
                } catch {
                  // toast would go here
                } finally {
                  setCampaignSubmitting(false);
                }
              }}
            >
              {campaignSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Create Campaign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Template Sheet (Slide-out Panel) */}
      <Sheet open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <SheetContent side="right" className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {editingTemplate
                ? "Edit Email Template"
                : "Create Email Template"}
            </SheetTitle>
            <SheetDescription>
              Create reusable email templates for your outreach campaigns
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="template-name">Template Name</Label>
              <Input
                id="template-name"
                value={templateForm.name}
                onChange={(e) =>
                  setTemplateForm({ ...templateForm, name: e.target.value })
                }
                placeholder="e.g., Job Application Follow-up"
              />
            </div>

            <div>
              <Label htmlFor="template-description">Description</Label>
              <Input
                id="template-description"
                value={templateForm.description}
                onChange={(e) =>
                  setTemplateForm({
                    ...templateForm,
                    description: e.target.value,
                  })
                }
                placeholder="Brief description of when to use this template"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="template-category">Category</Label>
                <Select
                  value={templateForm.category.toString()}
                  onValueChange={(value) =>
                    setTemplateForm({
                      ...templateForm,
                      category: parseInt(value) as EmailTemplateCategory,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(EmailTemplateCategory)
                      .filter(([key]) => isNaN(Number(key)))
                      .map(([key, value]) => (
                        <SelectItem key={value} value={value.toString()}>
                          {key}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="template-target-role">Target Role</Label>
                <Select
                  value={templateForm.targetRole.toString()}
                  onValueChange={(value) =>
                    setTemplateForm({
                      ...templateForm,
                      targetRole: parseInt(value) as EmailTemplateTargetRole,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(EmailTemplateTargetRole)
                      .filter(([key]) => isNaN(Number(key)))
                      .map(([key, value]) => (
                        <SelectItem key={value} value={value.toString()}>
                          {key}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="template-subject">Subject Line</Label>
              <Input
                id="template-subject"
                value={templateForm.subject}
                onChange={(e) =>
                  setTemplateForm({ ...templateForm, subject: e.target.value })
                }
                placeholder="e.g., Following up on our conversation about {{position}}"
              />
            </div>

            <div>
              <Label htmlFor="template-body">Email Body</Label>
              <Textarea
                id="template-body"
                value={templateForm.body}
                onChange={(e) =>
                  setTemplateForm({ ...templateForm, body: e.target.value })
                }
                placeholder="Write your email template here. Use {{variable}} for personalization."
                rows={8}
              />
            </div>
          </div>

          <SheetFooter className="flex gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setShowTemplateDialog(false);
                setEditingTemplate(null);
                resetTemplateForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={
                editingTemplate ? handleUpdateTemplate : handleCreateTemplate
              }
            >
              {editingTemplate ? "Update Template" : "Create Template"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* External Contact Dialog */}
      <Dialog open={showContactDialog} onOpenChange={setShowContactDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingContact ? "Edit Contact" : "Add External Contact"}
            </DialogTitle>
            <DialogDescription>
              Add contacts for your outreach campaigns
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="contact-first-name">First Name</Label>
                <Input
                  id="contact-first-name"
                  value={contactForm.firstName}
                  onChange={(e) =>
                    setContactForm({
                      ...contactForm,
                      firstName: e.target.value,
                    })
                  }
                />
              </div>
              <div>
                <Label htmlFor="contact-last-name">Last Name</Label>
                <Input
                  id="contact-last-name"
                  value={contactForm.lastName}
                  onChange={(e) =>
                    setContactForm({ ...contactForm, lastName: e.target.value })
                  }
                />
              </div>
            </div>

            <div>
              <Label htmlFor="contact-email">Email *</Label>
              <Input
                id="contact-email"
                type="email"
                value={contactForm.email}
                onChange={(e) =>
                  setContactForm({ ...contactForm, email: e.target.value })
                }
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="contact-job-title">Job Title</Label>
                <Input
                  id="contact-job-title"
                  value={contactForm.jobTitle}
                  onChange={(e) =>
                    setContactForm({ ...contactForm, jobTitle: e.target.value })
                  }
                />
              </div>
              <div>
                <Label htmlFor="contact-company">Company</Label>
                <Input
                  id="contact-company"
                  value={contactForm.companyName}
                  onChange={(e) =>
                    setContactForm({
                      ...contactForm,
                      companyName: e.target.value,
                    })
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="contact-phone">Phone</Label>
                <Input
                  id="contact-phone"
                  value={contactForm.phone}
                  onChange={(e) =>
                    setContactForm({ ...contactForm, phone: e.target.value })
                  }
                />
              </div>
              <div>
                <Label htmlFor="contact-location">Location</Label>
                <Input
                  id="contact-location"
                  value={contactForm.location}
                  onChange={(e) =>
                    setContactForm({ ...contactForm, location: e.target.value })
                  }
                />
              </div>
            </div>

            <div>
              <Label htmlFor="contact-linkedin">LinkedIn URL</Label>
              <Input
                id="contact-linkedin"
                value={contactForm.linkedInUrl}
                onChange={(e) =>
                  setContactForm({
                    ...contactForm,
                    linkedInUrl: e.target.value,
                  })
                }
                placeholder="https://linkedin.com/in/username"
              />
            </div>

            <div>
              <Label htmlFor="contact-notes">Notes</Label>
              <Textarea
                id="contact-notes"
                value={contactForm.notes}
                onChange={(e) =>
                  setContactForm({ ...contactForm, notes: e.target.value })
                }
                placeholder="Any additional notes about this contact"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowContactDialog(false);
                setEditingContact(null);
                resetContactForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={
                editingContact ? handleUpdateContact : handleCreateContact
              }
            >
              {editingContact ? "Update Contact" : "Add Contact"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Job Board Posting Dialog */}
      <Dialog open={showJobBoardDialog} onOpenChange={setShowJobBoardDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Post Job to Boards</DialogTitle>
            <DialogDescription>
              Distribute your job posting to multiple job boards to reach more candidates
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="job-select">Select Job</Label>
              <Select value={selectedJobId} onValueChange={setSelectedJobId}>
                <SelectTrigger id="job-select">
                  <SelectValue placeholder="Select a job to post" />
                </SelectTrigger>
                <SelectContent>
                  {userJobs.length > 0 ? (
                    userJobs.map((job) => (
                      <SelectItem key={job.id} value={job.id}>
                        {job.title}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="no-jobs" disabled>
                      No jobs available
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="expiration-date">Expiration Date (Optional)</Label>
              <Input
                id="expiration-date"
                type="date"
                value={expirationDate}
                onChange={(e) => setExpirationDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
              />
            </div>

            <div>
              <Label>Select Job Boards</Label>
              <div className="grid grid-cols-2 gap-4 mt-2">
                {jobBoards.map((board) => (
                  <div key={board.id} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={`board-${board.id}`}
                      checked={selectedBoardIds.includes(board.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedBoardIds([...selectedBoardIds, board.id]);
                        } else {
                          setSelectedBoardIds(
                            selectedBoardIds.filter((id) => id !== board.id)
                          );
                        }
                      }}
                      className="rounded border-gray-300"
                    />
                    <label
                      htmlFor={`board-${board.id}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      {board.name}
                      {board.costPerPosting && (
                        <span className="text-muted-foreground ml-2">
                          (${board.costPerPosting})
                        </span>
                      )}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {jobBoards.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <p>No job boards available. Please contact support to enable job board integrations.</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowJobBoardDialog(false);
                setSelectedJobId("");
                setSelectedBoardIds([]);
                setExpirationDate("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!selectedJobId || selectedBoardIds.length === 0) {
                  alert("Please select a job and at least one job board");
                  return;
                }

                try {
                  const newPostings = await jobBoardService.postJobToBoards({
                    jobId: selectedJobId,
                    boardIds: selectedBoardIds,
                    expirationDate: expirationDate || null,
                  });

                  setJobBoardPostings([...jobBoardPostings, ...newPostings]);
                  setShowJobBoardDialog(false);
                  setSelectedJobId("");
                  setSelectedBoardIds([]);
                  setExpirationDate("");

                  // Refresh stats
                  const stats = await jobBoardService.getJobBoardStats();
                  setJobBoardStats(stats);
                } catch (err) {
                  console.error("Failed to post job to boards:", err);
                  alert("Failed to post job to boards. Please try again.");
                }
              }}
              disabled={!selectedJobId || selectedBoardIds.length === 0}
            >
              Post to {selectedBoardIds.length} Board{selectedBoardIds.length !== 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Boost Job Dialog */}
      <Dialog open={showBoostDialog} onOpenChange={setShowBoostDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-brand-purple" />
              Boost a Job Listing
            </DialogTitle>
            <DialogDescription>
              Sponsor a job to appear at the top of search results and the talent discovery feed. You are only charged when your budget is spent.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Job to Boost</Label>
              <Select value={boostJobId} onValueChange={setBoostJobId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a job posting" />
                </SelectTrigger>
                <SelectContent>
                  {userJobs.length > 0 ? (
                    userJobs.map((job) => (
                      <SelectItem key={job.id} value={job.id}>
                        {job.title}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="none" disabled>
                      No job postings found
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Placement</Label>
              <Select value={boostPlacementType} onValueChange={(v) => setBoostPlacementType(v as typeof boostPlacementType)}>
                <SelectTrigger>
                  <SelectValue placeholder="Where should this job appear?" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="search_top">Search Top — first result in keyword search</SelectItem>
                  <SelectItem value="discovery_feed">Discovery Feed — featured in talent discovery</SelectItem>
                  <SelectItem value="both">Both Placements — maximum reach</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Pricing Model</Label>
              <Select value={boostPricingModel} onValueChange={(v) => setBoostPricingModel(v as typeof boostPricingModel)}>
                <SelectTrigger>
                  <SelectValue placeholder="How do you want to be charged?" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cpm">CPM — pay per 1,000 impressions</SelectItem>
                  <SelectItem value="cpc">CPC — pay per click only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Total Budget (USD)</Label>
                <Input
                  type="number"
                  min="10"
                  step="5"
                  placeholder="e.g. 100"
                  value={boostBudget}
                  onChange={(e) => setBoostBudget(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Minimum $10.00</p>
              </div>
              <div className="space-y-2">
                <Label>Duration</Label>
                <Select value={boostDuration} onValueChange={setBoostDuration}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select duration" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="14">14 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="60">60 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {boostBudget && boostDuration && parseFloat(boostBudget) >= 10 && (
              <div className="bg-muted/40 rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Daily budget</span>
                  <span className="font-medium">
                    ${(parseFloat(boostBudget) / parseInt(boostDuration)).toFixed(2)}/day
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total charge</span>
                  <span className="font-bold">${parseFloat(boostBudget).toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowBoostDialog(false);
                setBoostJobId("");
                setBoostPlacementType("");
                setBoostPricingModel("");
                setBoostBudget("");
                setBoostDuration("");
              }}
            >
              Cancel
            </Button>
            <Button
              className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90"
              disabled={
                boostSubmitting ||
                !boostJobId ||
                !boostPlacementType ||
                !boostPricingModel ||
                !boostBudget ||
                parseFloat(boostBudget) < 10 ||
                !boostDuration
              }
              onClick={async () => {
                if (!boostPlacementType || !boostPricingModel) return;
                setBoostSubmitting(true);
                try {
                  const newBoost = await advertisingService.createBoost({
                    jobId: boostJobId,
                    placementType: boostPlacementType as "search_top" | "discovery_feed" | "both",
                    pricingModel: boostPricingModel as "cpm" | "cpc",
                    budgetCents: Math.round(parseFloat(boostBudget) * 100),
                    durationDays: parseInt(boostDuration),
                  });
                  setActiveBoosts((prev) => [newBoost, ...prev]);
                  setAdStats((prev) => prev ? { ...prev, activeBoosts: prev.activeBoosts + 1 } : prev);
                  setShowBoostDialog(false);
                  setBoostJobId("");
                  setBoostPlacementType("");
                  setBoostPricingModel("");
                  setBoostBudget("");
                  setBoostDuration("");
                } catch (err) {
                  console.error("Failed to create boost:", err);
                } finally {
                  setBoostSubmitting(false);
                }
              }}
            >
              {boostSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
              Launch Boost
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
