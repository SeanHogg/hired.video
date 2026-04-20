import {
  Settings as SettingsIcon,
  User,
  Bell,
  BellOff,
  Shield,
  Palette,
  CreditCard,
  Download,
  Trash2,
  RefreshCw,
  ArrowRight,
  Sparkles,
  Lock,
  Zap,
  Target,
  Sliders,
  Youtube,
  Puzzle,
  ExternalLink,
  CheckCircle,
  XCircle,
  Loader2,
  Megaphone,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { PasswordRequirementsProvider } from "@/components/auth/PasswordRequirementsProvider";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ExtensionsSettings } from "@/components/ExtensionsSettings";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth } from "@/lib/auth";
import { getRoleDisplayLabel } from "@/lib/role-utils";

import { DeleteAccountDialog } from "@/components/account/DeleteAccountDialog";
import { AccountManagementPanel } from "@/components/account/AccountManagementPanel";
import { settingsService, type PrivacySettings, type AccountSettings, type JobPreferences } from "@/lib/services/settings-service";
import { servicesService } from "@/lib/services/services-service";
import {
  isPushSupported,
  requestPushPermission,
  subscribeToPush,
  unsubscribeFromPush,
  getCurrentPushSubscription,
} from "@/lib/push-notifications";
import { youtubeService, type YouTubeAccount } from "@/lib/services/youtube-service";
import { useToast } from "@/components/ui/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";

function SettingsContent() {
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();
  const { user, isAuthenticated, resendEmailVerification, getVerificationStatus } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [notifications, setNotifications] = useState({
    email: true,
    push: true,
    marketing: false,
    weekly: true,
  });

  const [privacy, setPrivacy] = useState<PrivacySettings>({
    profileVisible: true,
    showEmail: false,
    showPhone: false,
    showLocation: false,
    indexable: true,
    allowMessages: true,
    showActivity: true,
  });
  const [appearance, setAppearance] = useState<AccountSettings>({
    theme: "system",
    language: "en",
    timezone: "UTC",
    dateFormat: "MM/dd/yyyy",
  });
  const [jobPrefs, setJobPrefs] = useState<JobPreferences | null>(null);
  const [savingJobPrefs, setSavingJobPrefs] = useState(false);
  const [savingPrivacy, setSavingPrivacy] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [verification, setVerification] = useState<{ email?: string; emailConfirmed: boolean; sentAt?: string; sendCount?: number } | null>(null);
  const [resendCooldown, setResendCooldown] = useState<number>(0);
  const [activeTab, setActiveTab] = useState("notifications");

  const [security, setSecurity] = useState<{
    twoFactorEnabled: boolean;
    hasPassword: boolean;
    linkedAccounts: Array<{ id: string; provider: string; email: string | null; displayName: string | null; createdAt: string }>;
  } | null>(null);
  const [securityLoading, setSecurityLoading] = useState(false);
  const [unlinkingProvider, setUnlinkingProvider] = useState<string | null>(null);

  // Lead Generation state
  const [providesServices, setProvidesServices] = useState(false);
  const [providesServicesLoading, setProvidesServicesLoading] = useState(false);
  const [providesServicesSaving, setProvidesServicesSaving] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  // YouTube integration state
  const [youtubeAccount, setYoutubeAccount] = useState<YouTubeAccount | null>(null);
  const [youtubeLoading, setYoutubeLoading] = useState(false);
  const [youtubeConnecting, setYoutubeConnecting] = useState(false);
  const [companyYoutubeConfigured, setCompanyYoutubeConfigured] = useState(false);
  const [companyYoutubeLoading, setCompanyYoutubeLoading] = useState(false);

  // Sync active tab from ?tab= query param (e.g. /settings?tab=lead-generation)
  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab) setActiveTab(tab);
    // run once on mount; subsequent tab changes are user-driven
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle YouTube OAuth callback query params (both user and company)
  useEffect(() => {
    const youtubeSuccess = searchParams.get("youtube_success");
    const youtubeError = searchParams.get("youtube_error");
    const companySuccess = searchParams.get("youtube_company_success");
    const companyError = searchParams.get("youtube_company_error");

    if (youtubeSuccess === "true") {
      toast({ title: "YouTube account connected successfully!" });
      setActiveTab("integrations");
      searchParams.delete("youtube_success");
      setSearchParams(searchParams, { replace: true });
    } else if (youtubeError) {
      toast({
        title: "Failed to connect YouTube",
        description: youtubeError === "callback_failed" ? "Something went wrong during authorization" : youtubeError,
        variant: "destructive"
      });
      setActiveTab("integrations");
      searchParams.delete("youtube_error");
      setSearchParams(searchParams, { replace: true });
    }

    // Handle company YouTube callback
    if (companySuccess === "true") {
      toast({ title: "Company YouTube channel connected successfully!" });
      setCompanyYoutubeConfigured(true);
      setActiveTab("integrations");
      searchParams.delete("youtube_company_success");
      setSearchParams(searchParams, { replace: true });
    } else if (companyError) {
      toast({
        title: "Failed to connect company YouTube",
        description: companyError,
        variant: "destructive"
      });
      setActiveTab("integrations");
      searchParams.delete("youtube_company_error");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, toast]);

  useEffect(() => {
    if (!isAuthenticated) return;
    // Load verification status for banner
    getVerificationStatus().then(setVerification).catch(() => setVerification(null));



    // Load privacy settings from API
    settingsService
      .getPrivacySettings()
      .then((p) => {
        setPrivacy((prev) => ({
          ...prev,
          profileVisible: p.profileVisible,
          indexable: p.indexable,
          allowMessages: p.allowMessages ?? prev.allowMessages,
          showActivity: p.showActivity ?? prev.showActivity,
          showEmail: p.showEmail ?? prev.showEmail,
          showPhone: p.showPhone ?? prev.showPhone,
          showLocation: p.showLocation ?? prev.showLocation,
        }));
      })
      .catch((err) => {
        console.error("Failed to load privacy settings", err);
      });

    // Load notification settings from API
    settingsService
      .getNotificationSettings()
      .then((n) => setNotifications({
        email: n.email,
        push: n.push,
        marketing: n.marketing,
        weekly: n.weekly,
      }))
      .catch((err) => {
        console.error("Failed to load notification settings", err);
      });

    // Load account (appearance) settings from API
    settingsService
      .getAccountSettings()
      .then((a) => setAppearance((prev) => ({
        ...prev,
        theme: a.theme ?? prev.theme,
        language: a.language ?? prev.language,
        timezone: a.timezone ?? prev.timezone,
        dateFormat: a.dateFormat ?? prev.dateFormat,
      })))
      .catch((err) => {
        console.error("Failed to load account settings", err);
      });


  }, [isAuthenticated]);

  // Lazy-load job preferences only when the job-preferences tab is active
  useEffect(() => {
    if (!isAuthenticated || activeTab !== "job-preferences" || jobPrefs !== null) return;

    settingsService
      .getJobPreferences()
      .then(setJobPrefs)
      .catch((err) => {
        console.error("Failed to load job preferences", err);
      });
  }, [isAuthenticated, activeTab, jobPrefs]);

  // Lazy-load YouTube account and company status when integrations tab is active
  useEffect(() => {
    if (!isAuthenticated || activeTab !== "integrations") return;

    setYoutubeLoading(true);
    youtubeService
      .getAccount()
      .then((response) => {
        setYoutubeAccount(response.data);
      })
      .catch((err) => {
        console.error("Failed to load YouTube account", err);
        setYoutubeAccount(null);
      })
      .finally(() => {
        setYoutubeLoading(false);
      });

    // Check company YouTube status (for SuperAdmin)
    youtubeService
      .getCompanyStatus()
      .then((response) => {
        setCompanyYoutubeConfigured(response.data ?? false);
      })
      .catch((err) => {
        console.error("Failed to check company YouTube status", err);
      });
  }, [isAuthenticated, activeTab]);

  // Lazy-load Lead Generation status when its tab is active
  useEffect(() => {
    if (!isAuthenticated || activeTab !== "lead-generation") return;

    setProvidesServicesLoading(true);
    (async () => {
      try {
        const { apiClient } = await import("@/lib/api-client");
        const res = await apiClient.get<any>("/api/users/me");
        const profile = (res as any)?.data?.profile ?? (res as any)?.data;
        setProvidesServices(profile?.providesServices ?? false);
      } catch {
        // ignore
      } finally {
        setProvidesServicesLoading(false);
      }

      if (isPushSupported()) {
        setPushSupported(true);
        const sub = await getCurrentPushSubscription();
        setPushSubscribed(!!sub);
      }
    })();
  }, [isAuthenticated, activeTab]);

  async function handleToggleProvider(checked: boolean) {
    setProvidesServicesSaving(true);
    try {
      await servicesService.toggleProvideServices(checked);
      setProvidesServices(checked);
      toast({
        title: checked
          ? "Lead generation enabled. Your services will appear on your profile."
          : "Lead generation disabled.",
      });
    } catch {
      toast({ title: "Failed to update setting", variant: "destructive" });
    } finally {
      setProvidesServicesSaving(false);
    }
  }

  async function handleTogglePush() {
    setPushLoading(true);
    try {
      if (pushSubscribed) {
        await unsubscribeFromPush();
        setPushSubscribed(false);
        toast({ title: "Push notifications disabled" });
      } else {
        const granted = await requestPushPermission();
        if (!granted) {
          toast({
            title: "Permission denied",
            description: "Please allow notifications in your browser settings.",
            variant: "destructive",
          });
          return;
        }
        const sub = await subscribeToPush();
        setPushSubscribed(!!sub);
        if (sub) toast({ title: "Push notifications enabled" });
      }
    } catch {
      toast({ title: "Failed to update push notifications", variant: "destructive" });
    } finally {
      setPushLoading(false);
    }
  }

  // Lazy-load security settings when security tab is active
  useEffect(() => {
    if (!isAuthenticated || activeTab !== "security" || security !== null) return;
    setSecurityLoading(true);
    settingsService
      .getLinkedSecuritySettings()
      .then(setSecurity)
      .catch((err) => console.error("Failed to load security settings", err))
      .finally(() => setSecurityLoading(false));
  }, [isAuthenticated, activeTab, security]);

  // After returning from an OAuth connect flow, reload security data and clear the param
  useEffect(() => {
    if (!searchParams.get("connected") || !isAuthenticated) return;
    setActiveTab("security");
    setSecurity(null); // force reload
    setSearchParams((p) => { p.delete("connected"); return p; }, { replace: true });
  }, [searchParams, isAuthenticated]);

  // Cooldown timer for resend button
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => setResendCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  const savePrivacyPatch = async (patch: Partial<PrivacySettings>) => {
    try {
      setSavingPrivacy(true);
      // Merge patch into local state first for responsive UI
      const merged: PrivacySettings = { ...privacy, ...patch };
      setPrivacy(merged);

      // Persist only the fields supported by backend
      const updated = await settingsService.updatePrivacySettings({
        profileVisible: merged.profileVisible,
        indexable: merged.indexable,


        allowMessages: merged.allowMessages,
        showActivity: merged.showActivity,
      });

      // Reflect backend-confirmed values; keep other local-only flags
      setPrivacy((prev) => ({ ...prev, ...updated }));
    } catch (error) {
      console.error("Failed to save privacy settings", error);
      toast({ title: "Failed to save privacy settings", variant: "destructive" });
    } finally {
      setSavingPrivacy(false);
    }
  };

  // Check if user is superadmin (seanhogg@gmail.com)
  const isSuperAdmin = user?.email === "seanhogg@gmail.com" || user?.role === "super_admin";




  const saveJobPatch = async (patch: Partial<JobPreferences>) => {
    try {
      setSavingJobPrefs(true);
      const updated = await settingsService.updateJobPreferences(patch);
      setJobPrefs(updated);
    } catch (error) {
      console.error("Failed to save job preferences", error);
      toast({ title: "Failed to save job preferences", variant: "destructive" });
    } finally {
      setSavingJobPrefs(false);
    }
  };

  // YouTube integration handlers (kept for future per-user YouTube connection)
  const handleConnectYouTube = async () => {
    try {
      setYoutubeConnecting(true);
      const response = await youtubeService.getAuthUrl();
      if (response.data?.authUrl) {
        window.location.href = response.data.authUrl;
      } else {
        toast({ title: "Failed to get YouTube authorization URL", variant: "destructive" });
      }
    } catch (error) {
      console.error("Failed to connect YouTube", error);
      toast({ title: "Failed to connect to YouTube", variant: "destructive" });
    } finally {
      setYoutubeConnecting(false);
    }
  };

  const handleDisconnectYouTube = async () => {
    try {
      setYoutubeLoading(true);
      await youtubeService.disconnect();
      setYoutubeAccount(null);
      toast({ title: "YouTube account disconnected successfully" });
    } catch (error) {
      console.error("Failed to disconnect YouTube", error);
      toast({ title: "Failed to disconnect YouTube account", variant: "destructive" });
    } finally {
      setYoutubeLoading(false);
    }
  };

  const handleUnlinkProvider = async (provider: string) => {
    setUnlinkingProvider(provider);
    try {
      await settingsService.unlinkOAuthProvider(provider);
      setSecurity((prev) =>
        prev ? { ...prev, linkedAccounts: prev.linkedAccounts.filter((a) => a.provider !== provider) } : null,
      );
      toast({ title: `${provider.charAt(0).toUpperCase() + provider.slice(1)} account disconnected` });
    } catch (err: any) {
      toast({ title: "Failed to disconnect account", description: err?.message ?? "Please try again", variant: "destructive" });
    } finally {
      setUnlinkingProvider(null);
    }
  };

  // Company YouTube connection handler (SuperAdmin only)
  const handleConnectCompanyYouTube = async () => {
    try {
      setCompanyYoutubeLoading(true);
      const response = await youtubeService.getCompanyAuthUrl();
      if (response.data?.authUrl) {
        window.location.href = response.data.authUrl;
      } else {
        toast({ title: "Failed to get company YouTube authorization URL", variant: "destructive" });
      }
    } catch (error) {
      console.error("Failed to connect company YouTube", error);
      toast({ title: "Failed to connect company YouTube channel", variant: "destructive" });
    } finally {
      setCompanyYoutubeLoading(false);
    }
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
                    <SettingsIcon className="h-12 w-12 text-primary" />
                    <Sparkles className="h-6 w-6 text-brand-blue absolute -top-1 -right-1" />
                  </div>
                  <span className="text-4xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                    Smart Settings
                  </span>
                </div>
                <h1 className="text-5xl font-bold mb-6">
                  Customize Your Experience
                </h1>
                <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
                  Take control of your profile, privacy, notifications, and
                  preferences with our comprehensive settings dashboard.
                  Personalize every aspect of your experience to match your
                  workflow.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link to="/signup">
                    <Button
                      size="lg"
                      className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8"
                    >
                      Start Customizing
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
                    <User className="h-10 w-10 text-brand-purple mb-4" />
                    <CardTitle>Profile Management</CardTitle>
                    <CardDescription>
                      Customize your profile, update personal information, and
                      manage your professional presence across the platform.
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="border-brand-blue/20 hover:border-brand-blue/40 transition-colors">
                  <CardHeader>
                    <Shield className="h-10 w-10 text-brand-blue mb-4" />
                    <CardTitle>Privacy & Security</CardTitle>
                    <CardDescription>
                      Control your privacy settings, manage data visibility, and
                      configure security preferences for maximum protection.
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="border-brand-purple/20 hover:border-brand-purple/40 transition-colors">
                  <CardHeader>
                    <Bell className="h-10 w-10 text-brand-purple mb-4" />
                    <CardTitle>Smart Notifications</CardTitle>
                    <CardDescription>
                      Fine-tune your notification preferences to stay informed
                      about what matters most without overwhelming your inbox.
                    </CardDescription>
                  </CardHeader>
                </Card>
              </div>

              {/* Benefits Section */}
              <div className="bg-white/50 rounded-2xl p-8 mb-16">
                <h2 className="text-3xl font-bold text-center mb-12">
                  Why Our Settings Matter
                </h2>
                <div className="grid md:grid-cols-2 gap-8">
                  <div className="flex items-start space-x-4">
                    <div className="bg-brand-purple/10 p-3 rounded-lg">
                      <Sliders className="h-6 w-6 text-brand-purple" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-2">Granular Control</h3>
                      <p className="text-muted-foreground">
                        Fine-tune every aspect of your experience with detailed
                        settings and customization options.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-4">
                    <div className="bg-brand-blue/10 p-3 rounded-lg">
                      <Lock className="h-6 w-6 text-brand-blue" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-2">Privacy First</h3>
                      <p className="text-muted-foreground">
                        Your data is yours. Control what's shared, with whom,
                        and how your information is used.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-4">
                    <div className="bg-brand-purple/10 p-3 rounded-lg">
                      <Zap className="h-6 w-6 text-brand-purple" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-2">Instant Updates</h3>
                      <p className="text-muted-foreground">
                        Changes take effect immediately, so you can see and feel
                        the difference right away.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-4">
                    <div className="bg-brand-blue/10 p-3 rounded-lg">
                      <Target className="h-6 w-6 text-brand-blue" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-2">Smart Defaults</h3>
                      <p className="text-muted-foreground">
                        Intelligent default settings that learn from your
                        behavior and adapt to your preferences over time.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Settings Categories Preview */}
              <div className="mb-12 sm:mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold text-center mb-8 sm:mb-12">
                  Comprehensive Settings Categories
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                  <Card className="text-center p-4 sm:p-6">
                    <User className="h-6 w-6 sm:h-8 sm:w-8 text-brand-purple mx-auto mb-3" />
                    <h3 className="text-sm sm:text-base font-semibold mb-2">Profile</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      Personal info, bio, and professional details
                    </p>
                  </Card>
                  <Card className="text-center p-4 sm:p-6">
                    <Bell className="h-6 w-6 sm:h-8 sm:w-8 text-brand-blue mx-auto mb-3" />
                    <h3 className="text-sm sm:text-base font-semibold mb-2">Notifications</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      Email, push, and in-app notification preferences
                    </p>
                  </Card>
                  <Card className="text-center p-4 sm:p-6">
                    <Shield className="h-8 w-8 text-brand-purple mx-auto mb-3" />
                    <h3 className="font-semibold mb-2">Privacy</h3>
                    <p className="text-sm text-muted-foreground">
                      Data visibility and sharing controls
                    </p>
                  </Card>
                  <Card className="text-center p-6">
                    <Palette className="h-8 w-8 text-brand-blue mx-auto mb-3" />
                    <h3 className="font-semibold mb-2">Appearance</h3>
                    <p className="text-sm text-muted-foreground">
                      Theme, layout, and display preferences
                    </p>
                  </Card>
                </div>
              </div>

              {/* CTA Section */}
              <div className="text-center">
                <h2 className="text-3xl font-bold mb-6">
                  Ready to Take Control?
                </h2>
                <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
                  Join thousands of users who have already customized their
                  experience to match their unique needs and preferences.
                </p>
                <Link to="/signup">
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8"
                  >
                    Get Started Free
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
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
                <h1 className="text-3xl font-bold text-foreground">Settings</h1>
                <p className="text-muted-foreground mt-1">
                  Manage your account settings and preferences
                </p>
              </div>

              {!isSuperAdmin && (
                <Badge variant="secondary">
                  {getRoleDisplayLabel(user.role)}
                </Badge>
              )}
            </div>

            {/* Verification Banner */}
            {verification && !verification.emailConfirmed && (
              <Alert>
                <AlertDescription>
                  ⚠️ Your email is not verified. You won't appear in public search results until verified.
                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={async () => {
                        const ok = await resendEmailVerification();
                        if (ok) setResendCooldown(60);
                      }}
                      disabled={resendCooldown > 0}
                    >
                      {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend Verification Email"}
                    </Button>
                    <Link to="/verify-email" className="text-primary underline">Verify now</Link>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Settings Tabs — vertical grouped sidebar on desktop, scrollable horizontal on mobile */}
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              orientation="vertical"
              className="space-y-4 sm:space-y-6 lg:space-y-0"
            >
              <div className="flex flex-col lg:flex-row lg:gap-8">
                <aside className="lg:w-60 lg:shrink-0">
                  {/* Mobile: scrollable horizontal list */}
                  <div className="lg:hidden w-full overflow-x-auto -mx-6 px-6">
                    <TabsList className="inline-flex h-auto w-auto gap-1 min-w-max bg-muted p-1">
                      <TabsTrigger value="notifications" className="flex items-center gap-2 text-sm whitespace-nowrap px-4">
                        <Bell className="h-4 w-4" />
                        <span>Notifications</span>
                      </TabsTrigger>
                      <TabsTrigger value="appearance" className="flex items-center gap-2 text-sm whitespace-nowrap px-4">
                        <Palette className="h-4 w-4" />
                        <span>Appearance</span>
                      </TabsTrigger>
                      <TabsTrigger value="privacy" className="flex items-center gap-2 text-sm whitespace-nowrap px-4">
                        <Shield className="h-4 w-4" />
                        <span>Privacy</span>
                      </TabsTrigger>
                      <TabsTrigger value="security" className="flex items-center gap-2 text-sm whitespace-nowrap px-4">
                        <Lock className="h-4 w-4" />
                        <span>Security</span>
                      </TabsTrigger>
                      <TabsTrigger value="job-preferences" className="flex items-center gap-2 text-sm whitespace-nowrap px-4">
                        <Target className="h-4 w-4" />
                        <span>Job Preferences</span>
                      </TabsTrigger>
                      <TabsTrigger value="lead-generation" className="flex items-center gap-2 text-sm whitespace-nowrap px-4">
                        <Megaphone className="h-4 w-4" />
                        <span>Lead Generation</span>
                      </TabsTrigger>
                      <TabsTrigger value="integrations" className="flex items-center gap-2 text-sm whitespace-nowrap px-4">
                        <Youtube className="h-4 w-4" />
                        <span>Integrations</span>
                      </TabsTrigger>
                      <TabsTrigger value="extensions" className="flex items-center gap-2 text-sm whitespace-nowrap px-4">
                        <Puzzle className="h-4 w-4" />
                        <span>Chrome Extensions</span>
                      </TabsTrigger>
                      <TabsTrigger value="team-billing" className="flex items-center gap-2 text-sm whitespace-nowrap px-4">
                        <CreditCard className="h-4 w-4" />
                        <span>Team & Billing</span>
                      </TabsTrigger>
                      <TabsTrigger value="account" className="flex items-center gap-2 text-sm whitespace-nowrap px-4">
                        <SettingsIcon className="h-4 w-4" />
                        <span>Account</span>
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  {/* Desktop: vertical grouped sidebar */}
                  <nav className="hidden lg:block sticky top-20">
                    <TabsList className="flex flex-col h-auto w-full bg-transparent p-0 gap-0.5 items-stretch">
                      <div className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        General
                      </div>
                      <TabsTrigger
                        value="notifications"
                        className="justify-start gap-3 px-3 py-2 w-full data-[state=active]:bg-muted data-[state=active]:shadow-none"
                      >
                        <Bell className="h-4 w-4" />
                        <span>Notifications</span>
                      </TabsTrigger>
                      <TabsTrigger
                        value="appearance"
                        className="justify-start gap-3 px-3 py-2 w-full data-[state=active]:bg-muted data-[state=active]:shadow-none"
                      >
                        <Palette className="h-4 w-4" />
                        <span>Appearance</span>
                      </TabsTrigger>

                      <div className="px-3 pt-4 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Privacy & Security
                      </div>
                      <TabsTrigger
                        value="privacy"
                        className="justify-start gap-3 px-3 py-2 w-full data-[state=active]:bg-muted data-[state=active]:shadow-none"
                      >
                        <Shield className="h-4 w-4" />
                        <span>Privacy</span>
                      </TabsTrigger>
                      <TabsTrigger
                        value="security"
                        className="justify-start gap-3 px-3 py-2 w-full data-[state=active]:bg-muted data-[state=active]:shadow-none"
                      >
                        <Lock className="h-4 w-4" />
                        <span>Security</span>
                      </TabsTrigger>

                      <div className="px-3 pt-4 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Career
                      </div>
                      <TabsTrigger
                        value="job-preferences"
                        className="justify-start gap-3 px-3 py-2 w-full data-[state=active]:bg-muted data-[state=active]:shadow-none"
                      >
                        <Target className="h-4 w-4" />
                        <span>Job Preferences</span>
                      </TabsTrigger>
                      <TabsTrigger
                        value="lead-generation"
                        className="justify-start gap-3 px-3 py-2 w-full data-[state=active]:bg-muted data-[state=active]:shadow-none"
                      >
                        <Megaphone className="h-4 w-4" />
                        <span>Lead Generation</span>
                      </TabsTrigger>

                      <div className="px-3 pt-4 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Connections
                      </div>
                      <TabsTrigger
                        value="integrations"
                        className="justify-start gap-3 px-3 py-2 w-full data-[state=active]:bg-muted data-[state=active]:shadow-none"
                      >
                        <Youtube className="h-4 w-4" />
                        <span>Integrations</span>
                      </TabsTrigger>
                      <TabsTrigger
                        value="extensions"
                        className="justify-start gap-3 px-3 py-2 w-full data-[state=active]:bg-muted data-[state=active]:shadow-none"
                      >
                        <Puzzle className="h-4 w-4" />
                        <span>Chrome Extensions</span>
                      </TabsTrigger>

                      <div className="px-3 pt-4 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Account
                      </div>
                      <TabsTrigger
                        value="team-billing"
                        className="justify-start gap-3 px-3 py-2 w-full data-[state=active]:bg-muted data-[state=active]:shadow-none"
                      >
                        <CreditCard className="h-4 w-4" />
                        <span>Team & Billing</span>
                      </TabsTrigger>
                      <TabsTrigger
                        value="account"
                        className="justify-start gap-3 px-3 py-2 w-full data-[state=active]:bg-muted data-[state=active]:shadow-none"
                      >
                        <SettingsIcon className="h-4 w-4" />
                        <span>Account</span>
                      </TabsTrigger>
                    </TabsList>
                  </nav>
                </aside>

                <div className="flex-1 min-w-0 space-y-6">

              {/* Notifications Tab */}
              <TabsContent value="notifications" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Notification Preferences</CardTitle>
                    <CardDescription>
                      Choose how you want to be notified about updates and
                      activities.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label className="text-sm font-medium">
                          Email Notifications
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Receive notifications via email
                        </p>
                      </div>
                      <Switch
                        checked={notifications.email}
                        onCheckedChange={async (checked) => {
                          setNotifications({ ...notifications, email: checked });
                          try {
                            await settingsService.updateNotificationSettings({ email: checked });
                          } catch (e) {
                            console.error("Failed to save notifications (email)", e);
                          }
                        }}
                      />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label className="text-sm font-medium">
                          Push Notifications
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Receive browser push notifications
                        </p>
                      </div>
                      <Switch
                        checked={notifications.push}
                        onCheckedChange={async (checked) => {
                          setNotifications({ ...notifications, push: checked });
                          try {
                            await settingsService.updateNotificationSettings({ push: checked });
                          } catch (e) {
                            console.error("Failed to save notifications (push)", e);
                          }
                        }}
                      />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label className="text-sm font-medium">
                          Marketing Communications
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Receive updates about new features and tips
                        </p>
                      </div>
                      <Switch
                        checked={notifications.marketing}
                        onCheckedChange={async (checked) => {
                          setNotifications({ ...notifications, marketing: checked });
                          try {
                            await settingsService.updateNotificationSettings({ marketing: checked });
                          } catch (e) {
                            console.error("Failed to save notifications (marketing)", e);
                          }
                        }}
                      />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label className="text-sm font-medium">
                          Weekly Summary
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Get a weekly summary of your activity
                        </p>
                      </div>
                      <Switch
                        checked={notifications.weekly}
                        onCheckedChange={async (checked) => {
                          setNotifications({ ...notifications, weekly: checked });
                          try {
                            await settingsService.updateNotificationSettings({ weekly: checked });
                          } catch (e) {
                            console.error("Failed to save notifications (weekly)", e);
                          }
                        }}
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Privacy Tab */}
              <TabsContent value="privacy" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Privacy Settings</CardTitle>
                    <CardDescription>
                      Control who can see your information and how it's used.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label className="text-sm font-medium">
                          Public Profile
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Make your profile visible to other users
                        </p>
                      </div>
                      <Switch
                        checked={privacy.profileVisible}
                        disabled={savingPrivacy}
                        onCheckedChange={(checked) => savePrivacyPatch({ profileVisible: checked })}
                      />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label className="text-sm font-medium">
                          Show Email Address
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Display email on your public profile
                        </p>
                      </div>
                      <Switch
                        checked={privacy.showEmail}
                        disabled={savingPrivacy}
                        onCheckedChange={async (checked) => {
                          setPrivacy({ ...privacy, showEmail: checked });
                          try {
                            await settingsService.updatePrivacySettings({ showEmail: checked });
                          } catch (e) {
                            console.error("Failed to save privacy (show email)", e);
                          }
                        }}
                      />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label className="text-sm font-medium">
                          Show Phone Number
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Display phone number on your public profile
                        </p>
                      </div>
                      <Switch
                        checked={privacy.showPhone}
                        disabled={savingPrivacy}
                        onCheckedChange={async (checked) => {
                          setPrivacy({ ...privacy, showPhone: checked });
                          try {
                            await settingsService.updatePrivacySettings({ showPhone: checked });
                          } catch (e) {
                            console.error("Failed to save privacy (show phone)", e);
                          }
                        }}
                      />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label className="text-sm font-medium">
                          Show Location
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Display location on your public profile
                        </p>
                      </div>
                      <Switch
                        checked={privacy.showLocation}
                        disabled={savingPrivacy}
                        onCheckedChange={async (checked) => {
                          setPrivacy({ ...privacy, showLocation: checked });
                          try {
                            await settingsService.updatePrivacySettings({ showLocation: checked });
                          } catch (e) {
                            console.error("Failed to save privacy (show location)", e);
                          }
                        }}
                      />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label className="text-sm font-medium">
                          Search Engine Indexing
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Allow search engines to index your profile
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Switch
                          checked={privacy.indexable}
                          disabled={savingPrivacy}
                          onCheckedChange={(checked) => savePrivacyPatch({ indexable: checked })}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Appearance Tab */}
              <TabsContent value="appearance" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Appearance Settings</CardTitle>
                    <CardDescription>
                      Customize the look and feel of your experience.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Theme</Label>
                      <Select value={appearance.theme} onValueChange={async (value) => {
                        setAppearance({ ...appearance, theme: value as AccountSettings["theme"] });
                        try {
                          await settingsService.updateAccountSettings({ theme: value as AccountSettings["theme"] });
                        } catch (e) {
                          console.error("Failed to save appearance (theme)", e);
                        }
                      }}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="light">Light</SelectItem>
                          <SelectItem value="dark">Dark</SelectItem>
                          <SelectItem value="system">System</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Language</Label>
                      <Select value={appearance.language} onValueChange={async (value) => {
                        setAppearance({ ...appearance, language: value });
                        try {
                          await settingsService.updateAccountSettings({ language: value });
                        } catch (e) {
                          console.error("Failed to save appearance (language)", e);
                        }
                      }}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="en">English</SelectItem>
                          <SelectItem value="es">Spanish</SelectItem>
                          <SelectItem value="fr">French</SelectItem>
                          <SelectItem value="de">German</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Timezone</Label>
                      <Select value={appearance.timezone} onValueChange={async (value) => {
                        setAppearance({ ...appearance, timezone: value });
                        try {
                          await settingsService.updateAccountSettings({ timezone: value });
                        } catch (e) {
                          console.error("Failed to save appearance (timezone)", e);
                        }
                      }}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        {/* IANA timezone names — these are what Intl.DateTimeFormat
                            and lib/hooks/use-user-timezone.ts expect. Do not use
                            bare UTC±N labels; they aren't valid timezone IDs. */}
                        <SelectContent>
                          <SelectItem value="UTC">UTC</SelectItem>
                          <SelectItem value="America/Los_Angeles">Pacific Time (Los Angeles)</SelectItem>
                          <SelectItem value="America/Denver">Mountain Time (Denver)</SelectItem>
                          <SelectItem value="America/Chicago">Central Time (Chicago)</SelectItem>
                          <SelectItem value="America/New_York">Eastern Time (New York)</SelectItem>
                          <SelectItem value="America/Sao_Paulo">São Paulo</SelectItem>
                          <SelectItem value="Europe/London">London (GMT / BST)</SelectItem>
                          <SelectItem value="Europe/Paris">Paris / Berlin / Madrid</SelectItem>
                          <SelectItem value="Europe/Athens">Athens / Helsinki</SelectItem>
                          <SelectItem value="Africa/Johannesburg">Johannesburg</SelectItem>
                          <SelectItem value="Asia/Dubai">Dubai</SelectItem>
                          <SelectItem value="Asia/Kolkata">India (Kolkata)</SelectItem>
                          <SelectItem value="Asia/Singapore">Singapore</SelectItem>
                          <SelectItem value="Asia/Tokyo">Tokyo</SelectItem>
                          <SelectItem value="Australia/Sydney">Sydney</SelectItem>
                          <SelectItem value="Pacific/Auckland">Auckland</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Integrations Tab */}
              <TabsContent value="integrations" className="space-y-6">
                {/* SuperAdmin: Company YouTube Channel Configuration */}
                {isSuperAdmin && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Youtube className="h-5 w-5 text-red-600" />
                        Company YouTube Channel
                        <Badge variant="secondary" className="ml-2">Admin Only</Badge>
                      </CardTitle>
                      <CardDescription>
                        Configure the company YouTube channel for hosting all user video uploads.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {companyYoutubeConfigured ? (
                        <div className="flex items-center gap-4 p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                          <CheckCircle className="h-6 w-6 text-green-600" />
                          <div className="flex-1">
                            <h4 className="font-medium text-green-800 dark:text-green-200">Company YouTube Connected</h4>
                            <p className="text-sm text-green-600 dark:text-green-400">
                              The company YouTube channel is configured. All user videos will be uploaded here.
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="flex items-center gap-4 p-4 bg-amber-50 dark:bg-amber-950 rounded-lg border border-amber-200 dark:border-amber-800">
                            <XCircle className="h-6 w-6 text-amber-600" />
                            <div className="flex-1">
                              <h4 className="font-medium text-amber-800 dark:text-amber-200">Company YouTube Not Connected</h4>
                              <p className="text-sm text-amber-600 dark:text-amber-400">
                                Connect the company YouTube channel to enable video uploads for all users.
                              </p>
                            </div>
                          </div>

                          <Button
                            onClick={handleConnectCompanyYouTube}
                            disabled={companyYoutubeLoading}
                            className="bg-red-600 hover:bg-red-700 text-white"
                          >
                            {companyYoutubeLoading ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Connecting...
                              </>
                            ) : (
                              <>
                                <Youtube className="h-4 w-4 mr-2" />
                                Connect Company YouTube Channel
                              </>
                            )}
                          </Button>
                        </div>
                      )}

                      <div className="space-y-2">
                        <h4 className="text-sm font-medium">How it works:</h4>
                        <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                          <li>Connect the company YouTube channel (one-time setup)</li>
                          <li>All user videos are uploaded to this channel as unlisted</li>
                          <li>Videos are accessible via direct link only</li>
                          <li>Users don't need to connect their own YouTube accounts</li>
                        </ul>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Regular users: Video hosting info */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Youtube className="h-5 w-5 text-red-600" />
                      Video Storage
                    </CardTitle>
                    <CardDescription>
                      Your video resumes are automatically stored and hosted for you.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center gap-4 p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                      <CheckCircle className="h-6 w-6 text-green-600" />
                      <div className="flex-1">
                        <h4 className="font-medium text-green-800 dark:text-green-200">Video Hosting Active</h4>
                        <p className="text-sm text-green-600 dark:text-green-400">
                          Videos you record in the mobile app are automatically uploaded and hosted.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">How it works:</h4>
                      <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                        <li>Record videos in the hired.video mobile app</li>
                        <li>Videos are automatically uploaded and processed</li>
                        <li>Your videos appear in your profile and the public feed</li>
                        <li>No setup required - it just works!</li>
                      </ul>
                    </div>
                  </CardContent>
                </Card>

                {/* Hidden: Per-user YouTube connection (kept for future use)
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Youtube className="h-5 w-5 text-red-600" />
                      YouTube Integration
                    </CardTitle>
                    <CardDescription>
                      Connect your YouTube account to publish video resumes directly to your channel.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {youtubeLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      </div>
                    ) : youtubeAccount ? (
                      <div className="space-y-4">
                        <div className="flex items-center gap-4 p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                          <CheckCircle className="h-6 w-6 text-green-600" />
                          <div className="flex-1">
                            <h4 className="font-medium text-green-800 dark:text-green-200">YouTube Connected</h4>
                            <p className="text-sm text-green-600 dark:text-green-400">
                              You can now upload videos directly to your YouTube channel
                            </p>
                            <p className="text-xs text-green-600/70 dark:text-green-400/70 mt-1">
                              Connected {new Date(youtubeAccount.connectedAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>

                        <Separator />

                        <div>
                          <h4 className="text-sm font-medium mb-2 text-destructive">Disconnect Account</h4>
                          <p className="text-sm text-muted-foreground mb-4">
                            Disconnecting will remove the ability to publish videos to YouTube. Your existing videos will not be affected.
                          </p>
                          <Button
                            variant="destructive"
                            onClick={handleDisconnectYouTube}
                            disabled={youtubeLoading}
                          >
                            <XCircle className="h-4 w-4 mr-2" />
                            Disconnect YouTube
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
                          <Youtube className="h-10 w-10 text-red-600" />
                          <div className="flex-1">
                            <h4 className="font-medium">Connect Your YouTube Account</h4>
                            <p className="text-sm text-muted-foreground">
                              Link your YouTube account to upload video resumes directly to your channel.
                            </p>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <h4 className="text-sm font-medium">What you can do:</h4>
                          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                            <li>Upload video resumes directly to your YouTube channel</li>
                            <li>Choose privacy settings (public, unlisted, or private)</li>
                            <li>Automatic video optimization for YouTube</li>
                            <li>Track views and engagement from your dashboard</li>
                          </ul>
                        </div>

                        <Button
                          onClick={handleConnectYouTube}
                          disabled={youtubeConnecting}
                          className="bg-red-600 hover:bg-red-700 text-white"
                        >
                          {youtubeConnecting ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Connecting...
                            </>
                          ) : (
                            <>
                              <Youtube className="h-4 w-4 mr-2" />
                              Connect YouTube Account
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
                */}
              </TabsContent>

              {/* Chrome Extensions Tab */}
              <TabsContent value="extensions" className="space-y-6">
                <ExtensionsSettings />
              </TabsContent>

              {/* Security Tab */}
              <TabsContent value="security" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Connected Accounts</CardTitle>
                    <CardDescription>
                      Sign in faster with your existing accounts. Connect multiple providers to your account.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {securityLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading...
                      </div>
                    ) : (
                      <>
                        {(["google", "linkedin", "github", "microsoft"] as const).map((provider) => {
                          const linked = security?.linkedAccounts.find((a) => a.provider === provider);
                          const providerLabel = { google: "Google", linkedin: "LinkedIn", github: "GitHub", microsoft: "Microsoft" }[provider];
                          const apiBase = (import.meta as any).env?.VITE_API_URL ?? "/api";
                          return (
                            <div key={provider} className="flex items-center justify-between p-3 border rounded-lg">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded bg-muted flex items-center justify-center text-sm font-bold">
                                  {provider === "google" && <span className="text-blue-500">G</span>}
                                  {provider === "linkedin" && <span className="text-blue-700">in</span>}
                                  {provider === "github" && <span>⌬</span>}
                                  {provider === "microsoft" && <span className="text-blue-500">⊞</span>}
                                </div>
                                <div>
                                  <p className="text-sm font-medium">{providerLabel}</p>
                                  {linked ? (
                                    <p className="text-xs text-muted-foreground">{linked.displayName ?? linked.email ?? "Connected"}</p>
                                  ) : (
                                    <p className="text-xs text-muted-foreground">Not connected</p>
                                  )}
                                </div>
                              </div>
                              {linked ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={unlinkingProvider === provider}
                                  onClick={() => handleUnlinkProvider(provider)}
                                >
                                  {unlinkingProvider === provider ? <Loader2 className="h-3 w-3 animate-spin" /> : "Disconnect"}
                                </Button>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    const token = localStorage.getItem("auth_token") ?? "";
                                    window.location.href = `${apiBase}/api/auth/oauth/${provider}?redirect=/settings&link_token=${encodeURIComponent(token)}`;
                                  }}
                                >
                                  Connect
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Password</CardTitle>
                    <CardDescription>
                      {security?.hasPassword
                        ? "Update your password to keep your account secure."
                        : "Your account uses social login. Add a password to also sign in with email."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button variant="outline" className="gap-2" asChild>
                      <Link to="/forgot-password">
                        <RefreshCw className="h-4 w-4" />
                        {security?.hasPassword ? "Change Password" : "Set Password"}
                      </Link>
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Two-Factor Authentication</CardTitle>
                    <CardDescription>Add an extra layer of security to your account.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">
                          {security?.twoFactorEnabled ? "Enabled" : "Disabled"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {security?.twoFactorEnabled
                            ? "Your account is protected with 2FA."
                            : "Enable 2FA to get a code by email when you sign in."}
                        </p>
                      </div>
                      <Badge variant={security?.twoFactorEnabled ? "default" : "secondary"}>
                        {security?.twoFactorEnabled ? "On" : "Off"}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Job Preferences Tab */}
              <TabsContent value="job-preferences" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Job Preferences</CardTitle>
                    <CardDescription>
                      Tell us what kinds of roles you want and how you like to work.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {!jobPrefs ? (
                      <p className="text-sm text-muted-foreground">Loading job preferences...</p>
                    ) : (
                      <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Preferred Roles</Label>
                            <Input
                              value={(jobPrefs.preferredJobTypes || []).join(", ")}
                              placeholder="e.g. Senior Developer, Tech Lead"
                              onChange={(e) =>
                                saveJobPatch({
                                  preferredJobTypes: e.target.value
                                    .split(",")
                                    .map((s) => s.trim())
                                    .filter(Boolean),
                                })
                              }
                              disabled={savingJobPrefs}
                            />
                            <p className="text-xs text-muted-foreground">Separate with commas</p>
                          </div>
                          <div className="space-y-2">
                            <Label>Preferred Industries</Label>
                            <Input
                              value={(jobPrefs.preferredIndustries || []).join(", ")}
                              placeholder="e.g. FinTech, HealthTech"
                              onChange={(e) =>
                                saveJobPatch({
                                  preferredIndustries: e.target.value
                                    .split(",")
                                    .map((s) => s.trim())
                                    .filter(Boolean),
                                })
                              }
                              disabled={savingJobPrefs}
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label>Preferred Locations</Label>
                          <Input
                            value={(jobPrefs.preferredLocations || []).join(", ")}
                            placeholder="e.g. Remote, New York, London"
                            onChange={(e) =>
                              saveJobPatch({
                                preferredLocations: e.target.value
                                  .split(",")
                                  .map((s) => s.trim())
                                  .filter(Boolean),
                              })
                            }
                            disabled={savingJobPrefs}
                          />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Minimum Salary</Label>
                            <Input
                              type="number"
                              value={jobPrefs.minSalaryExpectation ?? ""}
                              onChange={(e) =>
                                saveJobPatch({
                                  minSalaryExpectation: e.target.value
                                    ? Number(e.target.value)
                                    : null,
                                })
                              }
                              disabled={savingJobPrefs}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Maximum Salary</Label>
                            <Input
                              type="number"
                              value={jobPrefs.maxSalaryExpectation ?? ""}
                              onChange={(e) =>
                                saveJobPatch({
                                  maxSalaryExpectation: e.target.value
                                    ? Number(e.target.value)
                                    : null,
                                })
                              }
                              disabled={savingJobPrefs}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Currency</Label>
                            <Select
                              value={jobPrefs.salaryCurrency || "USD"}
                              onValueChange={(v) => saveJobPatch({ salaryCurrency: v })}
                              disabled={savingJobPrefs}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="USD">USD</SelectItem>
                                <SelectItem value="EUR">EUR</SelectItem>
                                <SelectItem value="GBP">GBP</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Salary Period</Label>
                            <Select
                              value={jobPrefs.salaryPeriod || "yearly"}
                              onValueChange={(v) => saveJobPatch({ salaryPeriod: v })}
                              disabled={savingJobPrefs}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="yearly">Yearly</SelectItem>
                                <SelectItem value="monthly">Monthly</SelectItem>
                                <SelectItem value="hourly">Hourly</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <Label>Remote Only</Label>
                              <p className="text-xs text-muted-foreground">Only show remote roles</p>
                            </div>
                            <Switch
                              checked={!!jobPrefs.remoteOnly}
                              onCheckedChange={(checked) => saveJobPatch({ remoteOnly: checked })}
                              disabled={savingJobPrefs}
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <div>
                              <Label>Willing to Relocate</Label>
                              <p className="text-xs text-muted-foreground">Open to relocation</p>
                            </div>
                            <Switch
                              checked={!!jobPrefs.willingToRelocate}
                              onCheckedChange={(checked) => saveJobPatch({ willingToRelocate: checked })}
                              disabled={savingJobPrefs}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>


              {/* Lead Generation Tab */}
              <TabsContent value="lead-generation" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Lead Generation</CardTitle>
                    <CardDescription>
                      Enable this to list your services publicly on your profile. Other users
                      can browse and purchase them directly or submit an inquiry.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {providesServicesLoading ? (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {providesServices ? (
                              <ToggleRight className="h-5 w-5 text-violet-600" />
                            ) : (
                              <ToggleLeft className="h-5 w-5 text-muted-foreground" />
                            )}
                            <div>
                              <p className="font-medium">Provide Services</p>
                              <p className="text-sm text-muted-foreground">
                                {providesServices
                                  ? "Your services are publicly visible on your profile"
                                  : "Your services are hidden from your profile"}
                              </p>
                            </div>
                          </div>
                          <Switch
                            checked={providesServices}
                            onCheckedChange={handleToggleProvider}
                            disabled={providesServicesSaving}
                          />
                        </div>

                        {pushSupported && (
                          <div className="flex items-center justify-between border-t pt-4">
                            <div className="flex items-center gap-3">
                              {pushSubscribed ? (
                                <Bell className="h-5 w-5 text-violet-600" />
                              ) : (
                                <BellOff className="h-5 w-5 text-muted-foreground" />
                              )}
                              <div>
                                <p className="font-medium">Push Notifications</p>
                                <p className="text-sm text-muted-foreground">
                                  Get notified on this device when someone messages you or requests a service
                                </p>
                              </div>
                            </div>
                            <Button
                              variant={pushSubscribed ? "outline" : "default"}
                              size="sm"
                              onClick={handleTogglePush}
                              disabled={pushLoading}
                            >
                              {pushLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : pushSubscribed ? (
                                "Disable"
                              ) : (
                                "Enable"
                              )}
                            </Button>
                          </div>
                        )}

                        <div className="border-t pt-4">
                          <Link to="/services">
                            <Button variant="outline" className="gap-2">
                              <ArrowRight className="h-4 w-4" />
                              Manage your service offerings
                            </Button>
                          </Link>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Team & Billing Tab */}
              <TabsContent value="team-billing" className="space-y-6">
                <AccountManagementPanel />
              </TabsContent>

              {/* Account Tab */}
              <TabsContent value="account" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Account Management</CardTitle>
                    <CardDescription>
                      Manage your subscription, data, and account settings.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Email Verification Section */}
                    <div className="rounded-md border p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-medium mb-1">Email Verification</h4>
                          <p className="text-sm text-muted-foreground">
                            {verification?.email}
                          </p>
                        </div>
                        <Badge variant={verification?.emailConfirmed ? "default" : "destructive"}>
                          {verification?.emailConfirmed ? "Verified ✅" : "Not Verified ❌"}
                        </Badge>
                      </div>
                      {!verification?.emailConfirmed ? (
                        <div className="mt-3 flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={async () => {
                              const ok = await resendEmailVerification();
                              if (ok) setResendCooldown(60);
                            }}
                            disabled={resendCooldown > 0}
                          >
                            {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend Verification Email"}
                          </Button>
                          <Link to="/verify-email" className="text-primary underline text-sm">Go to verification page</Link>
                        </div>
                      ) : null}
                    </div>
                    <div>
                      <h4 className="text-sm font-medium mb-2">Data Export</h4>
                      <p className="text-sm text-muted-foreground mb-4">
                        Download a copy of your data including profile, resumes,
                        and activity.
                      </p>
                      <Button variant="outline" className="gap-2">
                        <Download className="h-4 w-4" />
                        Download Data
                      </Button>
                    </div>
                    <Separator />
                    <div>
                      <h4 className="text-sm font-medium mb-2">Password</h4>
                      <p className="text-sm text-muted-foreground mb-4">
                        Change your password to keep your account secure.
                      </p>
                      <Button variant="outline" className="gap-2" onClick={() => window.open('https://hired.video/forgot-password', '_blank')}>
                        <RefreshCw className="h-4 w-4" />
                        Change Password
                      </Button>
                    </div>
                    <Separator />
                    <div>
                      <h4 className="text-sm font-medium mb-2 text-destructive">
                        Delete Account
                      </h4>
                      <p className="text-sm text-muted-foreground mb-4">
                        Permanently delete your account and all associated data.
                        This action cannot be undone.
                      </p>
                      <Button
                        variant="destructive"
                        className="gap-2"
                        onClick={() => setDeleteDialogOpen(true)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete Account
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
                </div>
              </div>
            </Tabs>
          </div>
        </div>
        <Footer />
      </div>

      {/* Delete Account Dialog */}
      <DeleteAccountDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      />
    </div>
);
}

export default function Settings() {
  return (
    <PasswordRequirementsProvider>
      <SettingsContent />
    </PasswordRequirementsProvider>
  );
}
