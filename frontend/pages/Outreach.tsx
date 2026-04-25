import {
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
  MessageCircle,
  Loader2,
  Plus,
  Megaphone,
} from "lucide-react";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import { usePagination } from "@/components/Pagination";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSidebar } from "@/hooks/use-sidebar";
import { useCommHub } from "@/hooks/use-comm-hub";
import { AdvertiseTab } from "@/components/outreach/tabs/AdvertiseTab";
import { CampaignsTab } from "@/components/outreach/tabs/CampaignsTab";
import { ContactsTab } from "@/components/outreach/tabs/ContactsTab";
import { ContentTab } from "@/components/outreach/tabs/ContentTab";
import { DashboardTab } from "@/components/outreach/tabs/DashboardTab";
import { InboxTab } from "@/components/outreach/tabs/InboxTab";
import { JobBoardsTab } from "@/components/outreach/tabs/JobBoardsTab";
import { PerformanceTab } from "@/components/outreach/tabs/PerformanceTab";
import { TemplatesTab } from "@/components/outreach/tabs/TemplatesTab";
import { TrackingTab } from "@/components/outreach/tabs/TrackingTab";
import { useAuth } from "@/lib/auth";
import { toast } from "@/hooks/use-toast";
import { communicationService } from "@/lib/services/communication-service";
import { jobBoardService, JobBoardDTO, JobBoardPostingDTO, JobBoardStatsDTO } from "@/lib/services/job-board-service";
import { jobService, type JobSummary } from "@/lib/services/job-service";
import { advertisingService, type JobBoost, type AdvertisingStats } from "@/lib/services/advertising-service";
import { studioService, type StudioProject, StudioProjectStatus, type VideoCampaign } from "@/lib/services/studio-service";

import {
  EmailTemplateDTO,
  EmailCampaignDTO,
  CommunicationTrackingDTO,
  ExternalContactDTO,
  CommunicationStats,
  EmailTemplateCategory,
  EmailTemplateTargetRole,
  CreateEmailTemplateRequest,
  CreateExternalContactRequest,
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

  // Published content state
  const [publishedProjects, setPublishedProjects] = useState<StudioProject[]>([]);
  const [videoCampaigns, setVideoCampaigns] = useState<VideoCampaign[]>([]);
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
                  <div className="w-full overflow-x-auto">
                    <TabsList className="inline-flex w-max gap-1 lg:grid lg:w-full lg:grid-cols-10 lg:gap-0">
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
                  </div>

                  {/* Dashboard Tab — see DashboardTab component. */}
                  <TabsContent value="dashboard" className="space-y-6">
                    <DashboardTab
                      commHub={commHub}
                      communicationStats={communicationStats}
                      communicationTracking={communicationTracking}
                      jobBoardStats={jobBoardStats}
                      onGoToInbox={() => setActiveTab("inbox")}
                      onOpenTemplateDialog={() => setShowTemplateDialog(true)}
                      onOpenContactDialog={() => setShowContactDialog(true)}
                      onOpenJobBoardDialog={() => setShowJobBoardDialog(true)}
                    />
                  </TabsContent>

                  {/* Inbox Tab — unified messages, notifications, connection requests.
                      Same InboxPanel surface the header overlay uses; we pass the
                      shared `commHub` so both tabs read from a single data source. */}
                  <TabsContent value="inbox" className="space-y-6">
                    <InboxTab hub={commHub} />
                  </TabsContent>

                  {/* My Content Tab — published videos & artifacts */}
                  <TabsContent value="content" className="space-y-6">
                    <ContentTab publishedProjects={publishedProjects} />
                  </TabsContent>

                  {/* Templates Tab */}
                  <TabsContent value="templates" className="space-y-6">
                    <TemplatesTab
                      emailTemplates={emailTemplates}
                      filteredTemplates={filteredTemplates}
                      paginatedTemplates={paginatedTemplates}
                      search={templatesSearch}
                      onSearchChange={setTemplatesSearch}
                      viewMode={templatesViewMode}
                      onViewModeChange={setTemplatesViewMode}
                      pagination={templatesPagination}
                      onCreate={() => setShowTemplateDialog(true)}
                      onEdit={(template) => {
                        setEditingTemplate(template);
                        setTemplateForm({
                          name: template.name,
                          description: template.description || "",
                          subject: template.subject,
                          body: template.body,
                          category: template.category,
                          targetRole: template.targetRole,
                        });
                        setShowTemplateDialog(true);
                      }}
                      onDelete={handleDeleteTemplate}
                    />
                  </TabsContent>

                  {/* Campaigns Tab — Campaign Manager hierarchy + Video/Email lists. */}
                  <TabsContent value="campaigns" className="space-y-6">
                    <CampaignsTab
                      videoCampaigns={videoCampaigns}
                      emailCampaigns={emailCampaigns}
                      filteredCampaigns={filteredCampaigns}
                      totalCampaigns={totalCampaigns}
                      search={campaignsSearch}
                      onSearchChange={setCampaignsSearch}
                      viewMode={campaignsViewMode}
                      onViewModeChange={setCampaignsViewMode}
                      pagination={campaignsPagination}
                      onCreateVideoCampaign={() => {
                        setCampaignForm({ name: "", description: "", utmSource: "", utmMedium: "", utmCampaign: "" });
                        setCampaignVideoSelect([]);
                        setShowCampaignDialog(true);
                      }}
                      onDeleteVideoCampaign={async (id) => {
                        await studioService.deleteCampaign(id);
                        setVideoCampaigns((prev) => prev.filter((c) => c.id !== id));
                      }}
                      onNavigateTo={(tab) => setActiveTab(tab)}
                    />
                  </TabsContent>


                  {/* Tracking Tab */}
                  <TabsContent value="tracking" className="space-y-6">
                    <TrackingTab communicationTracking={communicationTracking} />
                  </TabsContent>

                  {/* Contacts Tab */}
                  <TabsContent value="contacts" className="space-y-6">
                    <ContactsTab
                      externalContacts={externalContacts}
                      filteredContacts={filteredContacts}
                      paginatedContacts={paginatedContacts}
                      search={contactsSearch}
                      onSearchChange={setContactsSearch}
                      viewMode={contactsViewMode}
                      onViewModeChange={setContactsViewMode}
                      pagination={contactsPagination}
                      onCreate={() => setShowContactDialog(true)}
                      onEdit={(contact) => {
                        setEditingContact(contact);
                        setContactForm({
                          email: contact.email,
                          firstName: contact.firstName || "",
                          lastName: contact.lastName || "",
                          jobTitle: contact.jobTitle || "",
                          companyName: contact.companyName || "",
                          phone: contact.phone || "",
                          linkedInUrl: contact.linkedInUrl || "",
                          location: contact.location || "",
                          notes: contact.notes || "",
                        });
                        setShowContactDialog(true);
                      }}
                      onDelete={handleDeleteContact}
                    />
                  </TabsContent>

                  {/* Job Boards Tab — see JobBoardsTab component. */}
                  <TabsContent value="job-boards" className="space-y-6">
                    <JobBoardsTab
                      jobBoards={jobBoards}
                      jobBoardPostings={jobBoardPostings}
                      jobBoardStats={jobBoardStats}
                      userJobs={userJobs}
                      postingFilters={postingFilters}
                      onPostingFiltersChange={setPostingFilters}
                      onOpenPostDialog={() => setShowJobBoardDialog(true)}
                      onRemovePosting={async (id) => {
                        await jobBoardService.removeJobBoardPosting(id);
                        setJobBoardPostings((prev) => prev.filter((p) => p.id !== id));
                      }}
                    />
                  </TabsContent>

                  {/* Advertise Tab — see AdvertiseTab component. */}
                  <TabsContent value="advertise" className="space-y-6">
                    <AdvertiseTab
                      adStats={adStats}
                      activeBoosts={activeBoosts}
                      featuredProfileInterest={featuredProfileInterest}
                      onOpenBoostDialog={() => setShowBoostDialog(true)}
                      onRequestFeaturedProfile={handleFeaturedProfileInterest}
                      onPauseBoost={async (id) => {
                        const updated = await advertisingService.pauseBoost(id);
                        setActiveBoosts((prev) => prev.map((b) => (b.id === id ? updated : b)));
                      }}
                      onResumeBoost={async (id) => {
                        const updated = await advertisingService.resumeBoost(id);
                        setActiveBoosts((prev) => prev.map((b) => (b.id === id ? updated : b)));
                      }}
                      onCancelBoost={async (id) => {
                        await advertisingService.cancelBoost(id);
                        setActiveBoosts((prev) => prev.filter((b) => b.id !== id));
                      }}
                    />
                  </TabsContent>

                  {/* Performance Tab — cross-placement ad analytics +
                      cross-channel comms context. See PerformanceTab. */}
                  <TabsContent value="performance" className="space-y-6">
                    <PerformanceTab
                      adStats={adStats}
                      activeBoosts={activeBoosts}
                      communicationStats={communicationStats}
                      onGoToAdvertise={() => setActiveTab("advertise")}
                    />
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
