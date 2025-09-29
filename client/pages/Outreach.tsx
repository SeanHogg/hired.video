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
  UserPlus,
  MessageCircle,
  Loader2,
  Plus,
  Edit,
  Trash2,
  FileText,
  ExternalLink,
} from "lucide-react";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";
import { communicationService } from "@/lib/services/communication-service";
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
    "dashboard" | "templates" | "campaigns" | "tracking" | "contacts"
  >("dashboard");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        ] = await Promise.all([
          communicationService.getEmailTemplates(),
          communicationService.getEmailCampaigns(),
          communicationService.getCommunicationTracking(),
          communicationService.getExternalContacts(),
          communicationService.getCommunicationStats().catch(() => null),
          communicationService.getTeamMembers().catch(() => []),
        ]);

        setEmailTemplates(templatesData);
        setEmailCampaigns(campaignsData);
        setCommunicationTracking(trackingData);
        setExternalContacts(contactsData);
        setCommunicationStats(statsData);
        setTeamMembers(teamData);
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
              <div className="grid md:grid-cols-3 gap-8 mb-16">
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
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-foreground">
                  Outreach & Communication
                </h1>
                <p className="text-muted-foreground mt-1">
                  Manage your networking campaigns and follow-ups
                </p>
              </div>
              <div className="flex items-center gap-4">
                <Badge variant="secondary" className="capitalize">
                  {user.role?.replace("_", " ")}
                </Badge>
                <Button onClick={() => setShowTemplateDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  New Template
                </Button>
              </div>
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
                      value as
                        | "dashboard"
                        | "templates"
                        | "campaigns"
                        | "tracking"
                        | "contacts",
                    )
                  }
                >
                  <TabsList className="grid w-full grid-cols-5">
                    <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
                    <TabsTrigger value="templates">Templates</TabsTrigger>
                    <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
                    <TabsTrigger value="tracking">Tracking</TabsTrigger>
                    <TabsTrigger value="contacts">Contacts</TabsTrigger>
                  </TabsList>

                  {/* Dashboard Tab */}
                  <TabsContent value="dashboard" className="space-y-6">
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

                  {/* Templates Tab */}
                  <TabsContent value="templates" className="space-y-6">
                    <div className="flex items-center justify-between">
                      <h2 className="text-2xl font-bold">Email Templates</h2>
                      <Button onClick={() => setShowTemplateDialog(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        New Template
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {emailTemplates.map((template) => (
                        <Card key={template.id}>
                          <CardHeader>
                            <div className="flex items-start justify-between">
                              <div>
                                <CardTitle className="text-lg">
                                  {template.name}
                                </CardTitle>
                                <CardDescription>
                                  {template.description}
                                </CardDescription>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
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
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                {!template.isSystemTemplate && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      handleDeleteTemplate(template.id)
                                    }
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-2">
                              <Badge variant="secondary">
                                {EmailTemplateCategory[template.category]}
                              </Badge>
                              <Badge variant="outline">
                                {EmailTemplateTargetRole[template.targetRole]}
                              </Badge>
                              <p className="text-sm text-muted-foreground">
                                Used {template.usageCount} times
                              </p>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>

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
                      <h2 className="text-2xl font-bold">Email Campaigns</h2>
                      <Button disabled>
                        <Plus className="h-4 w-4 mr-2" />
                        New Campaign (Coming Soon)
                      </Button>
                    </div>

                    <div className="space-y-4">
                      {emailCampaigns.map((campaign) => (
                        <Card key={campaign.id}>
                          <CardHeader>
                            <div className="flex items-start justify-between">
                              <div>
                                <CardTitle>{campaign.name}</CardTitle>
                                <CardDescription>
                                  {campaign.description}
                                </CardDescription>
                              </div>
                              <Badge
                                variant={
                                  campaign.status === EmailCampaignStatus.Sent
                                    ? "default"
                                    : "secondary"
                                }
                              >
                                {EmailCampaignStatus[campaign.status]}
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                              <div>
                                <p className="text-muted-foreground">
                                  Recipients
                                </p>
                                <p className="font-medium">
                                  {campaign.totalRecipients}
                                </p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Sent</p>
                                <p className="font-medium">
                                  {campaign.emailsSent}
                                </p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Opened</p>
                                <p className="font-medium">
                                  {campaign.emailsOpened}
                                </p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Replies</p>
                                <p className="font-medium">
                                  {campaign.repliesReceived}
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>

                    {emailCampaigns.length === 0 && (
                      <div className="text-center py-12">
                        <Mail className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        <h3 className="text-lg font-medium mb-2">
                          No campaigns yet
                        </h3>
                        <p className="text-muted-foreground mb-4">
                          Create your first email campaign to start outreach
                        </p>
                        <Button disabled>
                          <Plus className="h-4 w-4 mr-2" />
                          Create Campaign (Coming Soon)
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

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {externalContacts.map((contact) => (
                        <Card key={contact.id}>
                          <CardHeader>
                            <div className="flex items-start justify-between">
                              <div>
                                <CardTitle className="text-lg">
                                  {contact.firstName} {contact.lastName}
                                </CardTitle>
                                <CardDescription>
                                  {contact.jobTitle}
                                </CardDescription>
                                <CardDescription>
                                  {contact.companyName}
                                </CardDescription>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
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
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    handleDeleteContact(contact.id)
                                  }
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-2 text-sm">
                              <p className="text-muted-foreground">
                                {contact.email}
                              </p>
                              {contact.phone && (
                                <p className="text-muted-foreground">
                                  {contact.phone}
                                </p>
                              )}
                              {contact.location && (
                                <p className="text-muted-foreground">
                                  {contact.location}
                                </p>
                              )}
                              {contact.linkedInUrl && (
                                <a
                                  href={contact.linkedInUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:underline flex items-center gap-1"
                                >
                                  LinkedIn <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>

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
                </Tabs>
              </>
            )}
          </div>
        </div>
        <Footer />
      </div>

      {/* Email Template Dialog */}
      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate
                ? "Edit Email Template"
                : "Create Email Template"}
            </DialogTitle>
            <DialogDescription>
              Create reusable email templates for your outreach campaigns
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
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

          <DialogFooter>
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
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
    </div>
  );
}
