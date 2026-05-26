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
  LayoutDashboard,
  Inbox,
  FileText,
  Activity,
  Briefcase,
  Rocket,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/AppShell";
import PageHeader, { type PageHeaderTab } from "@/components/PageHeader";
import { usePagination } from "@/components/Pagination";
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
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useSharedCommHub } from "@/providers/CommHubProvider";
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
  const { t } = useTranslation();
  const { isAuthenticated, user } = useAuth();

  // Tab state lives in the URL so deep-links / refresh / back-button work
  // and the breadcrumb tabs in the page header stay coherent with what the
  // user sees. Default surface is the Dashboard.
  type OutreachTab =
    | "dashboard" | "inbox" | "content" | "templates" | "campaigns"
    | "tracking" | "contacts" | "job-boards" | "advertise" | "performance";
  const VALID_TABS: ReadonlySet<OutreachTab> = new Set([
    "dashboard", "inbox", "content", "templates", "campaigns",
    "tracking", "contacts", "job-boards", "advertise", "performance",
  ]);
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: OutreachTab = (tabParam && VALID_TABS.has(tabParam as OutreachTab))
    ? (tabParam as OutreachTab)
    : "dashboard";
  const setActiveTab = useCallback((next: OutreachTab) => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", next);
    setSearchParams(params, { replace: false });
  }, [searchParams, setSearchParams]);

  // Reads from the app-wide CommHubProvider — the same instance the header
  // bell + global SignalR subscription use. Polling/fetching for the
  // unfiltered aggregate happens once for the whole app, not per consumer.
  const commHub = useSharedCommHub();

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
      title: t("messages.featuredOnList"),
      description: t("messages.featuredEmailWhenAvailable"),
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
          err instanceof Error ? err.message : t("errors.failedLoadOutreachData"),
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
        err instanceof Error ? err.message : t("errors.failedCreateTemplate"),
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
        prev.map((tmpl) => (tmpl.id === updatedTemplate.id ? updatedTemplate : tmpl)),
      );
      setShowTemplateDialog(false);
      resetTemplateForm();
      setEditingTemplate(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("errors.failedUpdateTemplate"),
      );
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    try {
      await communicationService.deleteEmailTemplate(templateId);
      setEmailTemplates((prev) => prev.filter((tmpl) => tmpl.id !== templateId));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("errors.failedDeleteTemplate"),
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
      setError(err instanceof Error ? err.message : t("errors.failedCreateContact"));
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
      setError(err instanceof Error ? err.message : t("errors.failedUpdateContact"));
    }
  };

  const handleDeleteContact = async (contactId: string) => {
    try {
      await communicationService.deleteExternalContact(contactId);
      setExternalContacts((prev) => prev.filter((c) => c.id !== contactId));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.failedDeleteContact"));
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
      <AppShell>
        <div className="px-4 py-16">
              {/* Hero Section */}
              <div className="text-center mb-16">
                <div className="inline-flex items-center space-x-2 mb-6">
                  <div className="relative">
                    <Send className="h-12 w-12 text-primary" />
                    <Sparkles className="h-6 w-6 text-brand-blue absolute -top-1 -right-1" />
                  </div>
                  <span className="text-4xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                    {t("labels.smartOutreach")}
                  </span>
                </div>
                <h1 className="text-5xl font-bold mb-6">
                  {t("messages.connectEngageFollowUp")}
                </h1>
                <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
                  {t("messages.outreachValueProp")}
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link to="/signup">
                    <Button
                      size="lg"
                      className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8"
                    >
                      {t("actions.startNetworkingToday")}
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                  <Link to="/login">
                    <Button
                      size="lg"
                      variant="outline"
                      className="text-lg px-8"
                    >
                      {t("actions.signIn")}
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Features Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 mb-12 sm:mb-16">
                <Card className="border-brand-purple/20 hover:border-brand-purple/40 transition-colors">
                  <CardHeader>
                    <MessageSquare className="h-10 w-10 text-brand-purple mb-4" />
                    <CardTitle>{t("headings.smartMessaging")}</CardTitle>
                    <CardDescription>
                      {t("messages.smartMessagingDesc")}
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="border-brand-blue/20 hover:border-brand-blue/40 transition-colors">
                  <CardHeader>
                    <BarChart3 className="h-10 w-10 text-brand-blue mb-4" />
                    <CardTitle>{t("headings.engagementTracking")}</CardTitle>
                    <CardDescription>
                      {t("messages.engagementTrackingDesc")}
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="border-primary/20 hover:border-primary/40 transition-colors">
                  <CardHeader>
                    <Clock className="h-10 w-10 text-primary mb-4" />
                    <CardTitle>{t("headings.followUpAutomation")}</CardTitle>
                    <CardDescription>
                      {t("messages.followUpAutomationDesc")}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </div>

              {/* Persona-specific Benefits */}
              <div className="mb-16">
                <h2 className="text-3xl font-bold text-center mb-12">
                  {t("headings.outreachForEveryProfessional")}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <Card className="text-center">
                    <CardHeader>
                      <Users className="h-12 w-12 mx-auto text-green-600 mb-4" />
                      <CardTitle>{t("labels.jobSeekers")}</CardTitle>
                      <CardDescription>
                        {t("messages.jobSeekersOutreachDesc")}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm text-left">
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-yellow-500" />
                          {t("labels.outreachLinkedinConnReq")}
                        </div>
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-yellow-500" />
                          {t("labels.outreachInformationalInterview")}
                        </div>
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-yellow-500" />
                          {t("labels.outreachThankYouFollowUp")}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="text-center">
                    <CardHeader>
                      <Target className="h-12 w-12 mx-auto text-blue-600 mb-4" />
                      <CardTitle>{t("labels.recruiters")}</CardTitle>
                      <CardDescription>
                        {t("messages.recruitersOutreachDesc")}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm text-left">
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-yellow-500" />
                          {t("labels.outreachCandidateSourcingMsg")}
                        </div>
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-yellow-500" />
                          {t("labels.outreachInterviewInvitation")}
                        </div>
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-yellow-500" />
                          {t("labels.outreachTalentPipeline")}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="text-center">
                    <CardHeader>
                      <Network className="h-12 w-12 mx-auto text-purple-600 mb-4" />
                      <CardTitle>{t("labels.employers")}</CardTitle>
                      <CardDescription>
                        {t("messages.employersOutreachDesc")}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm text-left">
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-yellow-500" />
                          {t("labels.outreachPartnershipProposals")}
                        </div>
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-yellow-500" />
                          {t("labels.outreachVendorOutreach")}
                        </div>
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-yellow-500" />
                          {t("labels.outreachClientRelationship")}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Communication Channels */}
              <div className="mb-16">
                <h2 className="text-3xl font-bold text-center mb-12">
                  {t("headings.multiChannelCommunication")}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <Card className="text-center">
                    <CardHeader>
                      <Mail className="h-8 w-8 mx-auto text-blue-600 mb-2" />
                      <CardTitle className="text-lg">{t("fields.email.label")}</CardTitle>
                      <CardDescription className="text-sm">
                        {t("labels.commsEmailChannelDesc")}
                      </CardDescription>
                    </CardHeader>
                  </Card>

                  <Card className="text-center">
                    <CardHeader>
                      <MessageCircle className="h-8 w-8 mx-auto text-green-600 mb-2" />
                      <CardTitle className="text-lg">{t("labels.commsLinkedinChannel")}</CardTitle>
                      <CardDescription className="text-sm">
                        {t("labels.commsLinkedinChannelDesc")}
                      </CardDescription>
                    </CardHeader>
                  </Card>

                  <Card className="text-center">
                    <CardHeader>
                      <Phone className="h-8 w-8 mx-auto text-purple-600 mb-2" />
                      <CardTitle className="text-lg">{t("fields.phone.label")}</CardTitle>
                      <CardDescription className="text-sm">
                        {t("labels.commsPhoneChannelDesc")}
                      </CardDescription>
                    </CardHeader>
                  </Card>

                  <Card className="text-center">
                    <CardHeader>
                      <Video className="h-8 w-8 mx-auto text-red-600 mb-2" />
                      <CardTitle className="text-lg">{t("labels.commsVideoChannel")}</CardTitle>
                      <CardDescription className="text-sm">
                        {t("labels.commsVideoChannelDesc")}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </div>
              </div>

              {/* Final CTA */}
              <div className="text-center bg-gradient-to-r from-brand-purple/10 to-brand-blue/10 p-8 rounded-2xl">
                <h3 className="text-2xl font-bold mb-4">
                  {t("messages.outreachClosingPrompt")}
                </h3>
                <p className="text-muted-foreground mb-6">
                  {t("messages.outreachClosingDesc")}
                </p>
                <Link to="/signup">
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90"
                  >
                    {t("actions.startOutreachCampaign")}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
              </div>
            </div>
      </AppShell>
    );
  }

  // Authenticated user view - Outreach dashboard
  const outreachTabs: PageHeaderTab[] = [
    { key: "dashboard", label: t("tabs.dashboard"), icon: LayoutDashboard, to: "/outreach" },
    {
      key: "inbox",
      label: t("tabs.inbox"),
      icon: Inbox,
      to: "/outreach?tab=inbox",
      badge: commHub.unreadCount > 0
        ? (commHub.unreadCount > 99 ? "99+" : commHub.unreadCount)
        : undefined,
    },
    { key: "content", label: t("tabs.myContent"), icon: Video, to: "/outreach?tab=content" },
    { key: "campaigns", label: t("tabs.campaigns"), icon: Rocket, to: "/outreach?tab=campaigns" },
    { key: "templates", label: t("tabs.templates"), icon: FileText, to: "/outreach?tab=templates" },
    { key: "tracking", label: t("tabs.trackingTab"), icon: Activity, to: "/outreach?tab=tracking" },
    { key: "contacts", label: t("tabs.contacts"), icon: Users, to: "/outreach?tab=contacts" },
    { key: "job-boards", label: t("tabs.jobBoards"), icon: Briefcase, to: "/outreach?tab=job-boards" },
    { key: "advertise", label: t("tabs.advertise"), icon: Megaphone, to: "/outreach?tab=advertise" },
    { key: "performance", label: t("tabs.performance"), icon: BarChart3, to: "/outreach?tab=performance" },
  ];

  return (
    <AppShell bgClassName="bg-background">
      <div className="p-4 md:p-6">
          <div className="space-y-6">
            <PageHeader
              tabs={outreachTabs}
              activeTabKey={activeTab}
            />

            {/* Loading State */}
            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin mr-2" />
                <span>{t("status.loadingOutreachData")}</span>
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
                <Tabs value={activeTab}>
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

                  {/* Inbox Tab — unified messages, notifications, connection
                      requests. The tab owns a filter-aware hub so its chips
                      don't affect the unfiltered bell badge; both surfaces
                      share the same SignalR push channel underneath. */}
                  <TabsContent value="inbox" className="space-y-6">
                    <InboxTab />
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

      {/* Video Campaign Dialog */}
      <Dialog open={showCampaignDialog} onOpenChange={setShowCampaignDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("actions.createVideoCampaign")}</DialogTitle>
            <DialogDescription>
              {t("messages.groupVideosCampaign")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="campaign-name">{t("fields.campaignName.label")}</Label>
              <Input id="campaign-name" placeholder={t("fields.campaignName.placeholder")} value={campaignForm.name} onChange={(e) => setCampaignForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="campaign-desc">{t("fields.taskDescription.label")}</Label>
              <Textarea id="campaign-desc" placeholder={t("fields.campaignDesc.placeholder")} value={campaignForm.description} onChange={(e) => setCampaignForm((f) => ({ ...f, description: e.target.value }))} rows={2} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="utm-source" className="text-xs">{t("fields.utmSource.label")}</Label>
                <Input id="utm-source" placeholder={t("fields.utmSource.placeholder")} className="h-8 text-xs" value={campaignForm.utmSource} onChange={(e) => setCampaignForm((f) => ({ ...f, utmSource: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="utm-medium" className="text-xs">{t("fields.utmMedium.label")}</Label>
                <Input id="utm-medium" placeholder={t("fields.utmMedium.placeholder")} className="h-8 text-xs" value={campaignForm.utmMedium} onChange={(e) => setCampaignForm((f) => ({ ...f, utmMedium: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="utm-campaign" className="text-xs">{t("fields.utmCampaign.label")}</Label>
                <Input id="utm-campaign" placeholder={t("fields.utmCampaign.placeholder")} className="h-8 text-xs" value={campaignForm.utmCampaign} onChange={(e) => setCampaignForm((f) => ({ ...f, utmCampaign: e.target.value }))} />
              </div>
            </div>
            {/* Select videos to include */}
            {publishedProjects.length > 0 && (
              <div>
                <Label className="text-xs mb-1.5 block">{t("fields.includeVideos.label")}</Label>
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
            <Button variant="outline" onClick={() => setShowCampaignDialog(false)}>{t("actions.cancel")}</Button>
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
                    projectIds: campaignVideoSelect,
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
              {t("actions.createCampaign")}
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
                ? t("actions.editEmailTemplate")
                : t("actions.createEmailTemplate")}
            </SheetTitle>
            <SheetDescription>
              {t("messages.outreachCampaignReusable")}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="template-name">{t("fields.templateName.label")}</Label>
              <Input
                id="template-name"
                value={templateForm.name}
                onChange={(e) =>
                  setTemplateForm({ ...templateForm, name: e.target.value })
                }
                placeholder={t("fields.templateName.placeholder")}
              />
            </div>

            <div>
              <Label htmlFor="template-description">{t("fields.taskDescription.label")}</Label>
              <Input
                id="template-description"
                value={templateForm.description}
                onChange={(e) =>
                  setTemplateForm({
                    ...templateForm,
                    description: e.target.value,
                  })
                }
                placeholder={t("fields.templateDescription.placeholder")}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="template-category">{t("fields.templateCategory.label")}</Label>
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
                <Label htmlFor="template-target-role">{t("fields.templateTargetRole.label")}</Label>
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
              <Label htmlFor="template-subject">{t("fields.templateSubject.label")}</Label>
              <Input
                id="template-subject"
                value={templateForm.subject}
                onChange={(e) =>
                  setTemplateForm({ ...templateForm, subject: e.target.value })
                }
                placeholder={t("fields.templateSubject.placeholder")}
              />
            </div>

            <div>
              <Label htmlFor="template-body">{t("fields.templateBody.label")}</Label>
              <Textarea
                id="template-body"
                value={templateForm.body}
                onChange={(e) =>
                  setTemplateForm({ ...templateForm, body: e.target.value })
                }
                placeholder={t("fields.templateBody.placeholder")}
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
              {t("actions.cancel")}
            </Button>
            <Button
              onClick={
                editingTemplate ? handleUpdateTemplate : handleCreateTemplate
              }
            >
              {editingTemplate ? t("actions.updateTemplate") : t("actions.createTemplate")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* External Contact Dialog */}
      <Dialog open={showContactDialog} onOpenChange={setShowContactDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingContact ? t("actions.editContactAction") : t("actions.addExternalContact")}
            </DialogTitle>
            <DialogDescription>
              {t("messages.contactsForCampaigns")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="contact-first-name">{t("fields.firstName.label")}</Label>
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
                <Label htmlFor="contact-last-name">{t("fields.lastName.label")}</Label>
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
              <Label htmlFor="contact-email">{t("fields.contactEmail.label")}</Label>
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
                <Label htmlFor="contact-job-title">{t("fields.contactJobTitleField.label")}</Label>
                <Input
                  id="contact-job-title"
                  value={contactForm.jobTitle}
                  onChange={(e) =>
                    setContactForm({ ...contactForm, jobTitle: e.target.value })
                  }
                />
              </div>
              <div>
                <Label htmlFor="contact-company">{t("fields.companyNameField.label")}</Label>
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
                <Label htmlFor="contact-phone">{t("fields.phone.label")}</Label>
                <Input
                  id="contact-phone"
                  value={contactForm.phone}
                  onChange={(e) =>
                    setContactForm({ ...contactForm, phone: e.target.value })
                  }
                />
              </div>
              <div>
                <Label htmlFor="contact-location">{t("fields.location.label")}</Label>
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
              <Label htmlFor="contact-linkedin">{t("fields.linkedinUrl.label")}</Label>
              <Input
                id="contact-linkedin"
                value={contactForm.linkedInUrl}
                onChange={(e) =>
                  setContactForm({
                    ...contactForm,
                    linkedInUrl: e.target.value,
                  })
                }
                placeholder={t("fields.linkedinUrl.placeholder")}
              />
            </div>

            <div>
              <Label htmlFor="contact-notes">{t("fields.notes.label")}</Label>
              <Textarea
                id="contact-notes"
                value={contactForm.notes}
                onChange={(e) =>
                  setContactForm({ ...contactForm, notes: e.target.value })
                }
                placeholder={t("fields.contactNotes.placeholder")}
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
              {t("actions.cancel")}
            </Button>
            <Button
              onClick={
                editingContact ? handleUpdateContact : handleCreateContact
              }
            >
              {editingContact ? t("actions.updateContact") : t("actions.addContact")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Job Board Posting Dialog */}
      <Dialog open={showJobBoardDialog} onOpenChange={setShowJobBoardDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("actions.postJobToBoards")}</DialogTitle>
            <DialogDescription>
              {t("messages.distributeJobToMore")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="job-select">{t("fields.selectJob.label")}</Label>
              <Select value={selectedJobId} onValueChange={setSelectedJobId}>
                <SelectTrigger id="job-select">
                  <SelectValue placeholder={t("fields.selectJob.placeholder")} />
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
                      {t("messages.noJobsAvailable")}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="expiration-date">{t("fields.expirationDate.label")}</Label>
              <Input
                id="expiration-date"
                type="date"
                value={expirationDate}
                onChange={(e) => setExpirationDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
              />
            </div>

            <div>
              <Label>{t("fields.selectJobBoards.label")}</Label>
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
                <p>{t("messages.noJobBoardsAvailable")}</p>
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
              {t("actions.cancel")}
            </Button>
            <Button
              onClick={async () => {
                if (!selectedJobId || selectedBoardIds.length === 0) {
                  alert(t("errors.selectJobBoard"));
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
                  alert(t("errors.postToBoardsFailed"));
                }
              }}
              disabled={!selectedJobId || selectedBoardIds.length === 0}
            >
              {t("actions.postToCount", { count: selectedBoardIds.length })}
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
              {t("actions.boostJobListing")}
            </DialogTitle>
            <DialogDescription>
              {t("messages.boostDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t("fields.jobToBoost.label")}</Label>
              <Select value={boostJobId} onValueChange={setBoostJobId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("fields.jobToBoost.placeholder")} />
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
                      {t("labels.noJobPostingsFound")}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("fields.placement.label")}</Label>
              <Select value={boostPlacementType} onValueChange={(v) => setBoostPlacementType(v as typeof boostPlacementType)}>
                <SelectTrigger>
                  <SelectValue placeholder={t("fields.placement.placeholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="search_top">{t("labels.searchTopDescription")}</SelectItem>
                  <SelectItem value="discovery_feed">{t("labels.discoveryFeedDescription")}</SelectItem>
                  <SelectItem value="both">{t("labels.bothPlacementsDescription")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("fields.pricingModel.label")}</Label>
              <Select value={boostPricingModel} onValueChange={(v) => setBoostPricingModel(v as typeof boostPricingModel)}>
                <SelectTrigger>
                  <SelectValue placeholder={t("fields.pricingModel.placeholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cpm">{t("labels.cpmDescription")}</SelectItem>
                  <SelectItem value="cpc">{t("labels.cpcDescription")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("fields.totalBudget.label")}</Label>
                <Input
                  type="number"
                  min="10"
                  step="5"
                  placeholder={t("fields.totalBudget.placeholder")}
                  value={boostBudget}
                  onChange={(e) => setBoostBudget(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">{t("labels.minimumTen")}</p>
              </div>
              <div className="space-y-2">
                <Label>{t("fields.duration.label")}</Label>
                <Select value={boostDuration} onValueChange={setBoostDuration}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("fields.duration.placeholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">{t("labels.daysSeven")}</SelectItem>
                    <SelectItem value="14">{t("labels.daysFourteen")}</SelectItem>
                    <SelectItem value="30">{t("labels.daysThirty")}</SelectItem>
                    <SelectItem value="60">{t("labels.daysSixty")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {boostBudget && boostDuration && parseFloat(boostBudget) >= 10 && (
              <div className="bg-muted/40 rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("labels.dailyBudget")}</span>
                  <span className="font-medium">
                    {t("labels.dailyBudgetValue", { amount: (parseFloat(boostBudget) / parseInt(boostDuration)).toFixed(2) })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("labels.totalCharge")}</span>
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
              {t("actions.cancel")}
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
              {t("actions.launchBoost")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
