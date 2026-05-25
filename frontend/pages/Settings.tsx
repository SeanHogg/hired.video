import {
  Settings as SettingsIcon,
  User,
  Bell,
  Shield,
  Palette,
  CreditCard,
  Cookie,
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
  Mail,
  Megaphone,
  ToggleLeft,
  ToggleRight,
  Video,
  UserCircle,
  Share2,
  Trophy,
  LayoutDashboard,
} from "lucide-react";
import { PointsHub } from "@/components/points/PointsHub";
import { isPointsEligible } from "@/lib/services/points-service";
import { PasswordRequirementsProvider } from "@/components/auth/PasswordRequirementsProvider";
import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { buildAuthLinkTo } from "@/lib/auth-redirect";
import { ExtensionsSettings } from "@/components/ExtensionsSettings";
import { EmailSettingsTab } from "@/components/email/EmailSettingsTab";
import { AppShell } from "@/components/AppShell";
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
import { useCookiePreferences } from "@/hooks/use-cookie-preferences";
import { useAuth } from "@/lib/auth";
import { getRoleDisplayLabel } from "@/lib/role-utils";
import { useTranslation, Trans } from "react-i18next";
import { applyLocale } from "@/lib/i18n/i18n";
import { PUBLIC_LOCALES, type Locale } from "@shared/i18n";
import { USER_ROLES } from "@shared/user-roles";

import { AccountManagementPanel } from "@/components/account/AccountManagementPanel";
import ContentCreatorSection from "@/components/creator/ContentCreatorSection";
import RecruitSharingSettings from "@/components/recruit/RecruitSharingSettings";
import PromoteWithoutAuthToggle from "@/components/settings/PromoteWithoutAuthToggle";
import ProfileSectionsSettingsCard from "@/components/settings/ProfileSectionsSettingsCard";
import { settingsService, type PrivacySettings, type AccountSettings, type JobPreferences } from "@/lib/services/settings-service";
import { servicesService } from "@/lib/services/services-service";
import { userService } from "@/lib/services/user-service";
import { youtubeService, type YouTubeAccount } from "@/lib/services/youtube-service";
import { useToast } from "@/components/ui/use-toast";
import { useOpenToWorkToggle } from "@/lib/hooks/use-open-to-work";

// Legacy /settings tab remappings — bookmarks + outbound emails still resolve
// after the Account consolidation:
//   • ?tab=payouts / ?tab=leave-creator → creator-profile (earlier merge)
//   • ?tab=team-billing / ?tab=account / ?tab=billing → account-billing
//     (this pass: standalone "Account" + "Team & Billing" sidebar items
//      collapsed into a single "Account & Billing" surface with sub-tabs
//      for billing, usage statement, and account hygiene)
function remapLegacyTab(tab: string): string {
  if (tab === "payouts" || tab === "leave-creator") return "creator-profile";
  if (tab === "team-billing" || tab === "account" || tab === "billing") return "account-billing";
  // `/services/settings` (the legacy agency sharing settings page) now
  // redirects here with ?tab=recruiter-sharing; older bookmarks may still
  // pass the redirect-side keys "services-settings" or "sharing".
  if (tab === "services-settings" || tab === "sharing") return "recruiter-sharing";
  return tab;
}

function SettingsContent() {
  const { user, isAuthenticated } = useAuth();
  const openToWorkToggle = useOpenToWorkToggle();
  const cookiePrefs = useCookiePreferences();
  const { toast } = useToast();
  const { t } = useTranslation();
  // The W-language is a debug locale only super_admins should see in
  // the picker — normal users get the public set (en, es).
  const availableLocales: readonly Locale[] = user?.role === USER_ROLES.SUPER_ADMIN
    ? ([...PUBLIC_LOCALES, "w"] as const)
    : PUBLIC_LOCALES;
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
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
  });
  const [jobPrefs, setJobPrefs] = useState<JobPreferences | null>(null);
  const [savingJobPrefs, setSavingJobPrefs] = useState(false);
  const [savingPrivacy, setSavingPrivacy] = useState(false);
  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    // ?tab= wins so a deep-link / OAuth callback (?tab=email&connected=…)
    // activates the right tab on the very first render — without this,
    // the useEffect-based sync below leaves a flash of the default tab
    // (and prerendered HTML kept the default visible until hydration).
    const explicit = params.get("tab");
    if (explicit) return remapLegacyTab(explicit);
    // If billing_setup=1 is present (e.g. from /settings/billing?billing_setup=1),
    // auto-select the consolidated Account & Billing tab so users land on
    // payment setup directly.
    if (params.get("billing_setup") === "1") return "account-billing";
    return "account-billing"; // default
  });

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

  // YouTube integration state
  const [youtubeAccount, setYoutubeAccount] = useState<YouTubeAccount | null>(null);
  const [youtubeLoading, setYoutubeLoading] = useState(false);
  const [youtubeConnecting, setYoutubeConnecting] = useState(false);
  const [companyYoutubeConfigured, setCompanyYoutubeConfigured] = useState(false);
  const [companyYoutubeLoading, setCompanyYoutubeLoading] = useState(false);

  // Sync active tab from ?tab= query param (e.g. /settings?tab=lead-generation)
  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab) setActiveTab(remapLegacyTab(tab));
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
      toast({ title: t("messages.youtubeConnected") });
      setActiveTab("integrations");
      searchParams.delete("youtube_success");
      setSearchParams(searchParams, { replace: true });
    } else if (youtubeError) {
      toast({
        title: t("messages.youtubeConnectFailed"),
        description: youtubeError === "callback_failed" ? t("messages.youtubeAuthFailed") : youtubeError,
        variant: "destructive"
      });
      setActiveTab("integrations");
      searchParams.delete("youtube_error");
      setSearchParams(searchParams, { replace: true });
    }

    // Handle company YouTube callback
    if (companySuccess === "true") {
      toast({ title: t("messages.companyYouTubeConnectedToast") });
      setCompanyYoutubeConfigured(true);
      setActiveTab("integrations");
      searchParams.delete("youtube_company_success");
      setSearchParams(searchParams, { replace: true });
    } else if (companyError) {
      toast({
        title: t("messages.companyYouTubeConnectFailed"),
        description: companyError,
        variant: "destructive"
      });
      setActiveTab("integrations");
      searchParams.delete("youtube_company_error");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, toast, t]);

  useEffect(() => {
    if (!isAuthenticated) return;

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
        const profile = await userService.getCurrentUser();
        setProvidesServices(profile.providesServices ?? false);
      } catch {
        // ignore — verification gate or transient failure
      } finally {
        setProvidesServicesLoading(false);
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
          ? t("messages.leadGenEnabled")
          : t("messages.leadGenDisabled"),
      });
    } catch {
      toast({ title: t("errors.updateSettingFailed"), variant: "destructive" });
    } finally {
      setProvidesServicesSaving(false);
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
      toast({ title: t("errors.savePrivacyFailed"), variant: "destructive" });
    } finally {
      setSavingPrivacy(false);
    }
  };

  // Check if user is superadmin (seanhogg@gmail.com)
  const isSuperAdmin = user?.email === "seanhogg@gmail.com" || user?.role === "super_admin";

  // Show the agency-only "Sharing & Branding" tab to roles that can post or
  // share candidates with hiring clients. SuperAdmin sees everything; the
  // RecruitSharingSettings panel itself self-gates (renders an "available
  // once you've joined a company" stub when scope is empty) so we don't
  // need a second data-load just to decide visibility.
  const hasRecruiterSurface =
    user?.role === USER_ROLES.RECRUITER ||
    user?.role === USER_ROLES.EMPLOYER ||
    user?.role === USER_ROLES.ADMIN ||
    user?.role === USER_ROLES.SUPER_ADMIN;

  // Points & Rewards tab visibility — uses the SSoT helper that backs
  // the sidebar pill, so the tab + pill always agree.
  const showPointsTab = isPointsEligible(user);




  const saveJobPatch = async (patch: Partial<JobPreferences>) => {
    try {
      setSavingJobPrefs(true);
      const updated = await settingsService.updateJobPreferences(patch);
      setJobPrefs(updated);
    } catch (error) {
      console.error("Failed to save job preferences", error);
      toast({ title: t("errors.saveJobPreferencesFailed"), variant: "destructive" });
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
        toast({ title: t("messages.youtubeAuthUrlFailed"), variant: "destructive" });
      }
    } catch (error) {
      console.error("Failed to connect YouTube", error);
      toast({ title: t("messages.youtubeConnectionFailed"), variant: "destructive" });
    } finally {
      setYoutubeConnecting(false);
    }
  };

  const handleDisconnectYouTube = async () => {
    try {
      setYoutubeLoading(true);
      await youtubeService.disconnect();
      setYoutubeAccount(null);
      toast({ title: t("messages.youtubeDisconnected") });
    } catch (error) {
      console.error("Failed to disconnect YouTube", error);
      toast({ title: t("messages.youtubeDisconnectFailed"), variant: "destructive" });
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
      const providerLabel = `${provider.charAt(0).toUpperCase()}${provider.slice(1)}`;
      toast({ title: t("messages.providerDisconnected", { provider: providerLabel }) });
    } catch (err: any) {
      toast({ title: t("errors.disconnectAccountFailed"), description: err?.message ?? t("messages.pleaseTryAgain"), variant: "destructive" });
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
        toast({ title: t("messages.companyYouTubeAuthUrlFailed"), variant: "destructive" });
      }
    } catch (error) {
      console.error("Failed to connect company YouTube", error);
      toast({ title: t("messages.companyYouTubeChannelFailed"), variant: "destructive" });
    } finally {
      setCompanyYoutubeLoading(false);
    }
  };

  // If user is not authenticated, show marketing page.
  // The /tools "Inbox Sync" tile deep-links unauthenticated visitors to
  // /settings?tab=email — for that entry the generic "Customize Your
  // Experience" pitch is the wrong message, so render a focused Inbox
  // Sync hero with the same CTAs.
  if (!isAuthenticated || !user) {
    if (searchParams.get("tab") === "email") {
      // gap #762: this hero is reached via deep link from /tools "Inbox Sync"
      // (unauthenticated). Carry the current `/settings?tab=email` path
      // through signup/login so the user lands back here after auth instead
      // of the default post-login redirect.
      const currentPathWithSearch = `${location.pathname}${location.search}`;
      return (
        <AppShell>
          <div className="max-w-4xl mx-auto px-4 py-16">
            <div className="text-center mb-12">
              <div className="inline-flex items-center justify-center mb-6 bg-emerald-100 rounded-2xl p-4">
                <Mail className="h-12 w-12 text-emerald-600" />
              </div>
              <Badge variant="secondary" className="mb-4">{t("headings.inboxSync")}</Badge>
              <h1 className="text-4xl sm:text-5xl font-bold mb-6">
                {t("headings.connectYourInbox")}
              </h1>
              <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
                {t("messages.inboxSyncIntro")}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to={buildAuthLinkTo("/signup", currentPathWithSearch)}>
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-emerald-600 to-emerald-700 hover:opacity-90 text-lg px-8"
                  >
                    {t("actions.signUpToConnect")}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Link to={buildAuthLinkTo("/login", currentPathWithSearch)}>
                  <Button size="lg" variant="outline" className="text-lg px-8">
                    {t("actions.signIn")}
                  </Button>
                </Link>
              </div>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CheckCircle className="h-8 w-8 text-emerald-600 mb-2" />
                  <CardTitle className="text-base">
                    {t("headings.inboxSyncFeature1")}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <CheckCircle className="h-8 w-8 text-emerald-600 mb-2" />
                  <CardTitle className="text-base">
                    {t("headings.inboxSyncFeature2")}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <CheckCircle className="h-8 w-8 text-emerald-600 mb-2" />
                  <CardTitle className="text-base">
                    {t("headings.inboxSyncFeature3")}
                  </CardTitle>
                </CardHeader>
              </Card>
            </div>
          </div>
        </AppShell>
      );
    }
    return (
      <AppShell>
        <div>
            <div className="max-w-6xl mx-auto px-4 py-16">
              {/* Hero Section */}
              <div className="text-center mb-16">
                <div className="inline-flex items-center space-x-2 mb-6">
                  <div className="relative">
                    <SettingsIcon className="h-12 w-12 text-primary" />
                    <Sparkles className="h-6 w-6 text-brand-blue absolute -top-1 -right-1" />
                  </div>
                  <span className="text-4xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                    {t("messages.smartSettings")}
                  </span>
                </div>
                <h1 className="text-5xl font-bold mb-6">
                  {t("headings.customizeYourExperience")}
                </h1>
                <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
                  {t("messages.customizeIntro")}
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link to="/signup">
                    <Button
                      size="lg"
                      className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8"
                    >
                      {t("actions.startCustomizing")}
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
              <div className="grid md:grid-cols-3 gap-8 mb-16">
                <Card className="border-brand-purple/20 hover:border-brand-purple/40 transition-colors">
                  <CardHeader>
                    <User className="h-10 w-10 text-brand-purple mb-4" />
                    <CardTitle>{t("headings.profileManagement")}</CardTitle>
                    <CardDescription>
                      {t("messages.profileManagementDesc")}
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="border-brand-blue/20 hover:border-brand-blue/40 transition-colors">
                  <CardHeader>
                    <Shield className="h-10 w-10 text-brand-blue mb-4" />
                    <CardTitle>{t("headings.privacyAndSecurity")}</CardTitle>
                    <CardDescription>
                      {t("messages.privacyAndSecurityDesc")}
                    </CardDescription>
                  </CardHeader>
                </Card>

                <Card className="border-brand-purple/20 hover:border-brand-purple/40 transition-colors">
                  <CardHeader>
                    <Bell className="h-10 w-10 text-brand-purple mb-4" />
                    <CardTitle>{t("headings.smartNotifications")}</CardTitle>
                    <CardDescription>
                      {t("messages.smartNotificationsDesc")}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </div>

              {/* Benefits Section */}
              <div className="bg-white/50 rounded-2xl p-8 mb-16">
                <h2 className="text-3xl font-bold text-center mb-12">
                  {t("headings.whyOurSettingsMatter")}
                </h2>
                <div className="grid md:grid-cols-2 gap-8">
                  <div className="flex items-start space-x-4">
                    <div className="bg-brand-purple/10 p-3 rounded-lg">
                      <Sliders className="h-6 w-6 text-brand-purple" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-2">{t("headings.granularControl")}</h3>
                      <p className="text-muted-foreground">
                        {t("messages.granularControlDesc")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-4">
                    <div className="bg-brand-blue/10 p-3 rounded-lg">
                      <Lock className="h-6 w-6 text-brand-blue" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-2">{t("headings.privacyFirst")}</h3>
                      <p className="text-muted-foreground">
                        {t("messages.privacyFirstDesc")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-4">
                    <div className="bg-brand-purple/10 p-3 rounded-lg">
                      <Zap className="h-6 w-6 text-brand-purple" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-2">{t("headings.instantUpdates")}</h3>
                      <p className="text-muted-foreground">
                        {t("messages.instantUpdatesDesc")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-4">
                    <div className="bg-brand-blue/10 p-3 rounded-lg">
                      <Target className="h-6 w-6 text-brand-blue" />
                    </div>
                    <div>
                      <h3 className="font-semibold mb-2">{t("headings.smartDefaults")}</h3>
                      <p className="text-muted-foreground">
                        {t("messages.smartDefaultsDesc")}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Settings Categories Preview */}
              <div className="mb-12 sm:mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold text-center mb-8 sm:mb-12">
                  {t("headings.comprehensiveSettings")}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                  <Card className="text-center p-4 sm:p-6">
                    <User className="h-6 w-6 sm:h-8 sm:w-8 text-brand-purple mx-auto mb-3" />
                    <h3 className="text-sm sm:text-base font-semibold mb-2">{t("headings.profile")}</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      {t("messages.profileCategoryDesc")}
                    </p>
                  </Card>
                  <Card className="text-center p-4 sm:p-6">
                    <Bell className="h-6 w-6 sm:h-8 sm:w-8 text-brand-blue mx-auto mb-3" />
                    <h3 className="text-sm sm:text-base font-semibold mb-2">{t("headings.notifications")}</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      {t("messages.notificationsCategoryDesc")}
                    </p>
                  </Card>
                  <Card className="text-center p-4 sm:p-6">
                    <Shield className="h-8 w-8 text-brand-purple mx-auto mb-3" />
                    <h3 className="font-semibold mb-2">{t("headings.privacy")}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t("messages.privacyCategoryDesc")}
                    </p>
                  </Card>
                  <Card className="text-center p-6">
                    <Palette className="h-8 w-8 text-brand-blue mx-auto mb-3" />
                    <h3 className="font-semibold mb-2">{t("headings.appearance")}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t("messages.appearanceCategoryDesc")}
                    </p>
                  </Card>
                  <Card className="text-center p-4 sm:p-6">
                    <Mail className="h-6 w-6 sm:h-8 sm:w-8 text-emerald-600 mx-auto mb-3" />
                    <h3 className="text-sm sm:text-base font-semibold mb-2">{t("headings.inboxSync")}</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      {t("messages.inboxSyncCategoryDesc")}
                    </p>
                  </Card>
                </div>
              </div>

              {/* CTA Section */}
              <div className="text-center">
                <h2 className="text-3xl font-bold mb-6">
                  {t("headings.readyToTakeControl")}
                </h2>
                <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
                  {t("messages.readyToTakeControlBody")}
                </p>
                <Link to="/signup">
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8"
                  >
                    {t("actions.getStartedFree")}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
              </div>
            </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell bgClassName="bg-background">
      <div className="p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-foreground">{t("headings.settings")}</h1>
                <p className="text-muted-foreground mt-1">
                  {t("messages.manageAccountSettings")}
                </p>
              </div>

              {!isSuperAdmin && (
                <Badge variant="secondary">
                  {getRoleDisplayLabel(user.role)}
                </Badge>
              )}
            </div>

            {/* Page-level verification banner moved to <AppShell> so every
                page (not just Settings) prompts unverified users to verify.
                The Account-tab status detail below still consumes
                `verification` for its richer "Verified / Not verified" badge. */}

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
                      <TabsTrigger value="account-billing" className="flex items-center gap-2 text-sm whitespace-nowrap px-4">
                        <CreditCard className="h-4 w-4" />
                        <span>{t("tabs.accountBilling")}</span>
                      </TabsTrigger>
                      {showPointsTab && (
                        <TabsTrigger value="points" className="flex items-center gap-2 text-sm whitespace-nowrap px-4">
                          <Trophy className="h-4 w-4" />
                          <span>Points &amp; Rewards</span>
                        </TabsTrigger>
                      )}
                      <TabsTrigger value="creator-profile" className="flex items-center gap-2 text-sm whitespace-nowrap px-4">
                        <UserCircle className="h-4 w-4" />
                        <span>Creator Account</span>
                      </TabsTrigger>
                      <TabsTrigger value="notifications" className="flex items-center gap-2 text-sm whitespace-nowrap px-4">
                        <Bell className="h-4 w-4" />
                        <span>{t("tabs.notifications")}</span>
                      </TabsTrigger>
                      <TabsTrigger value="appearance" className="flex items-center gap-2 text-sm whitespace-nowrap px-4">
                        <Palette className="h-4 w-4" />
                        <span>{t("tabs.appearance")}</span>
                      </TabsTrigger>
                      <TabsTrigger value="privacy" className="flex items-center gap-2 text-sm whitespace-nowrap px-4">
                        <Shield className="h-4 w-4" />
                        <span>{t("tabs.privacy")}</span>
                      </TabsTrigger>
                      <TabsTrigger value="profile-sections" className="flex items-center gap-2 text-sm whitespace-nowrap px-4">
                        <LayoutDashboard className="h-4 w-4" />
                        <span>Profile Sections</span>
                      </TabsTrigger>
                      <TabsTrigger value="cookies" className="flex items-center gap-2 text-sm whitespace-nowrap px-4">
                        <Cookie className="h-4 w-4" />
                        <span>{t("tabs.cookies")}</span>
                      </TabsTrigger>
                      <TabsTrigger value="security" className="flex items-center gap-2 text-sm whitespace-nowrap px-4">
                        <Lock className="h-4 w-4" />
                        <span>{t("tabs.security")}</span>
                      </TabsTrigger>
                      <TabsTrigger value="job-preferences" className="flex items-center gap-2 text-sm whitespace-nowrap px-4">
                        <Target className="h-4 w-4" />
                        <span>{t("tabs.jobPreferences")}</span>
                      </TabsTrigger>
                      <TabsTrigger value="lead-generation" className="flex items-center gap-2 text-sm whitespace-nowrap px-4">
                        <Megaphone className="h-4 w-4" />
                        <span>{t("tabs.leadGeneration")}</span>
                      </TabsTrigger>
                      {hasRecruiterSurface && (
                        <TabsTrigger value="recruiter-sharing" className="flex items-center gap-2 text-sm whitespace-nowrap px-4">
                          <Share2 className="h-4 w-4" />
                          <span>Sharing &amp; Branding</span>
                        </TabsTrigger>
                      )}
                      <TabsTrigger value="email" className="flex items-center gap-2 text-sm whitespace-nowrap px-4">
                        <Mail className="h-4 w-4" />
                        <span>Email</span>
                      </TabsTrigger>
                      <TabsTrigger value="integrations" className="flex items-center gap-2 text-sm whitespace-nowrap px-4">
                        <Youtube className="h-4 w-4" />
                        <span>{t("tabs.integrations")}</span>
                      </TabsTrigger>
                      <TabsTrigger value="extensions" className="flex items-center gap-2 text-sm whitespace-nowrap px-4">
                        <Puzzle className="h-4 w-4" />
                        <span>{t("tabs.chromeExtensions")}</span>
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  {/* Desktop: vertical grouped sidebar */}
                  <nav className="hidden lg:block sticky top-20">
                    <TabsList className="flex flex-col h-auto w-full bg-transparent p-0 gap-0.5 items-stretch">
                      <div className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t("labels.tabGroupAccount")}
                      </div>
                      <TabsTrigger
                        value="account-billing"
                        className="justify-start gap-3 px-3 py-2 w-full data-[state=active]:bg-muted data-[state=active]:shadow-none"
                      >
                        <CreditCard className="h-4 w-4" />
                        <span>{t("tabs.accountBilling")}</span>
                      </TabsTrigger>
                      {showPointsTab && (
                        <TabsTrigger
                          value="points"
                          className="justify-start gap-3 px-3 py-2 w-full data-[state=active]:bg-muted data-[state=active]:shadow-none"
                        >
                          <Trophy className="h-4 w-4" />
                          <span>Points &amp; Rewards</span>
                        </TabsTrigger>
                      )}

                      <div className="px-3 pt-4 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <Video className="h-3 w-3" />
                        Content Creator
                      </div>
                      <TabsTrigger
                        value="creator-profile"
                        className="justify-start gap-3 px-3 py-2 w-full data-[state=active]:bg-muted data-[state=active]:shadow-none"
                      >
                        <UserCircle className="h-4 w-4" />
                        <span>Account</span>
                      </TabsTrigger>

                      <div className="px-3 pt-4 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t("labels.tabGroupGeneral")}
                      </div>
                      <TabsTrigger
                        value="notifications"
                        className="justify-start gap-3 px-3 py-2 w-full data-[state=active]:bg-muted data-[state=active]:shadow-none"
                      >
                        <Bell className="h-4 w-4" />
                        <span>{t("tabs.notifications")}</span>
                      </TabsTrigger>
                      <TabsTrigger
                        value="appearance"
                        className="justify-start gap-3 px-3 py-2 w-full data-[state=active]:bg-muted data-[state=active]:shadow-none"
                      >
                        <Palette className="h-4 w-4" />
                        <span>{t("tabs.appearance")}</span>
                      </TabsTrigger>

                      <div className="px-3 pt-4 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t("labels.tabGroupPrivacySecurity")}
                      </div>
                      <TabsTrigger
                        value="privacy"
                        className="justify-start gap-3 px-3 py-2 w-full data-[state=active]:bg-muted data-[state=active]:shadow-none"
                      >
                        <Shield className="h-4 w-4" />
                        <span>{t("tabs.privacy")}</span>
                      </TabsTrigger>
                      <TabsTrigger
                        value="profile-sections"
                        className="justify-start gap-3 px-3 py-2 w-full data-[state=active]:bg-muted data-[state=active]:shadow-none"
                      >
                        <LayoutDashboard className="h-4 w-4" />
                        <span>Profile Sections</span>
                      </TabsTrigger>
                      <TabsTrigger
                        value="cookies"
                        className="justify-start gap-3 px-3 py-2 w-full data-[state=active]:bg-muted data-[state=active]:shadow-none"
                      >
                        <Cookie className="h-4 w-4" />
                        <span>{t("tabs.cookies")}</span>
                      </TabsTrigger>
                      <TabsTrigger
                        value="security"
                        className="justify-start gap-3 px-3 py-2 w-full data-[state=active]:bg-muted data-[state=active]:shadow-none"
                      >
                        <Lock className="h-4 w-4" />
                        <span>{t("tabs.security")}</span>
                      </TabsTrigger>

                      <div className="px-3 pt-4 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t("labels.tabGroupCareer")}
                      </div>
                      <TabsTrigger
                        value="job-preferences"
                        className="justify-start gap-3 px-3 py-2 w-full data-[state=active]:bg-muted data-[state=active]:shadow-none"
                      >
                        <Target className="h-4 w-4" />
                        <span>{t("tabs.jobPreferences")}</span>
                      </TabsTrigger>
                      <TabsTrigger
                        value="lead-generation"
                        className="justify-start gap-3 px-3 py-2 w-full data-[state=active]:bg-muted data-[state=active]:shadow-none"
                      >
                        <Megaphone className="h-4 w-4" />
                        <span>{t("tabs.leadGeneration")}</span>
                      </TabsTrigger>

                      {hasRecruiterSurface && (
                        <>
                          <div className="px-3 pt-4 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                            <Share2 className="h-3 w-3" />
                            Recruiter
                          </div>
                          <TabsTrigger
                            value="recruiter-sharing"
                            className="justify-start gap-3 px-3 py-2 w-full data-[state=active]:bg-muted data-[state=active]:shadow-none"
                          >
                            <Share2 className="h-4 w-4" />
                            <span>Sharing &amp; Branding</span>
                          </TabsTrigger>
                        </>
                      )}

                      <div className="px-3 pt-4 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t("labels.tabGroupConnections")}
                      </div>
                      <TabsTrigger
                        value="email"
                        className="justify-start gap-3 px-3 py-2 w-full data-[state=active]:bg-muted data-[state=active]:shadow-none"
                      >
                        <Mail className="h-4 w-4" />
                        <span>Email</span>
                      </TabsTrigger>
                      <TabsTrigger
                        value="integrations"
                        className="justify-start gap-3 px-3 py-2 w-full data-[state=active]:bg-muted data-[state=active]:shadow-none"
                      >
                        <Youtube className="h-4 w-4" />
                        <span>{t("tabs.integrations")}</span>
                      </TabsTrigger>
                      <TabsTrigger
                        value="extensions"
                        className="justify-start gap-3 px-3 py-2 w-full data-[state=active]:bg-muted data-[state=active]:shadow-none"
                      >
                        <Puzzle className="h-4 w-4" />
                        <span>{t("tabs.chromeExtensions")}</span>
                      </TabsTrigger>
                    </TabsList>
                  </nav>
                </aside>

                <div className="flex-1 min-w-0 space-y-6">

              {/* Notifications Tab */}
              <TabsContent value="notifications" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>{t("headings.notificationPreferences")}</CardTitle>
                    <CardDescription>
                      {t("messages.notificationPreferencesDesc")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label className="text-sm font-medium">
                          {t("settings.notifications.emailLabel")}
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          {t("settings.notifications.emailDesc")}
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
                          {t("settings.notifications.pushLabel")}
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          {t("settings.notifications.pushDesc")}
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
                          {t("settings.notifications.marketingLabel")}
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          {t("settings.notifications.marketingDesc")}
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
                          {t("settings.notifications.weeklyLabel")}
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          {t("settings.notifications.weeklyDesc")}
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
                    <CardTitle>{t("headings.privacySettings")}</CardTitle>
                    <CardDescription>
                      {t("messages.privacySettingsDesc")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label className="text-sm font-medium">
                          {t("settings.privacy.publicProfileLabel")}
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          {t("settings.privacy.publicProfileDesc")}
                        </p>
                      </div>
                      <Switch
                        checked={privacy.profileVisible}
                        disabled={savingPrivacy}
                        onCheckedChange={(checked) => savePrivacyPatch({ profileVisible: checked })}
                      />
                    </div>
                    <Separator />
                    <PromoteWithoutAuthToggle />
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label className="text-sm font-medium">
                          {t("settings.privacy.showEmailLabel")}
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          {t("settings.privacy.showEmailDesc")}
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
                          {t("settings.privacy.showPhoneLabel")}
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          {t("settings.privacy.showPhoneDesc")}
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
                          {t("settings.privacy.showLocationLabel")}
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          {t("settings.privacy.showLocationDesc")}
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
                          {t("settings.privacy.indexableLabel")}
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          {t("settings.privacy.indexableDesc")}
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

              {/* Profile Sections Tab — role-defaulted visibility for /people/[id] sections */}
              <TabsContent value="profile-sections" className="space-y-6">
                <ProfileSectionsSettingsCard />
              </TabsContent>

              {/* Cookies Tab */}
              <TabsContent value="cookies" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>{t("headings.cookiePreferences")}</CardTitle>
                    <CardDescription>
                      <Trans
                        i18nKey="messages.cookiePreferencesDesc"
                        components={{
                          link: <Link to="/cookies" className="text-primary hover:underline" />,
                        }}
                      />
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label className="text-sm font-medium flex items-center gap-2">
                          {t("settings.cookies.essentialLabel")}
                          <Badge variant="secondary" className="text-xs">
                            {t("labels.required")}
                          </Badge>
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          {t("settings.cookies.essentialDesc")}
                        </p>
                      </div>
                      <Switch checked disabled />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label className="text-sm font-medium">
                          {t("settings.cookies.analyticsLabel")}
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          {t("settings.cookies.analyticsDesc")}
                        </p>
                      </div>
                      <Switch
                        checked={cookiePrefs.preferences.analytics}
                        disabled={cookiePrefs.loading}
                        onCheckedChange={(checked) =>
                          void cookiePrefs.setCategory("analytics", checked)
                        }
                      />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label className="text-sm font-medium">
                          {t("settings.cookies.marketingLabel")}
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          {t("settings.cookies.marketingDesc")}
                        </p>
                      </div>
                      <Switch
                        checked={cookiePrefs.preferences.marketing}
                        disabled={cookiePrefs.loading}
                        onCheckedChange={(checked) =>
                          void cookiePrefs.setCategory("marketing", checked)
                        }
                      />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <Label className="text-sm font-medium">
                          {t("settings.cookies.personalizationLabel")}
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          {t("settings.cookies.personalizationDesc")}
                        </p>
                      </div>
                      <Switch
                        checked={cookiePrefs.preferences.personalization}
                        disabled={cookiePrefs.loading}
                        onCheckedChange={(checked) =>
                          void cookiePrefs.setCategory("personalization", checked)
                        }
                      />
                    </div>
                    <Separator />
                    <div className="flex flex-col sm:flex-row gap-3">
                      <Button
                        onClick={() => void cookiePrefs.acceptAll()}
                        disabled={cookiePrefs.loading}
                        className="flex-1"
                      >
                        {t("actions.acceptAll")}
                      </Button>
                      <Button
                        onClick={() => void cookiePrefs.rejectOptional()}
                        disabled={cookiePrefs.loading}
                        variant="outline"
                        className="flex-1"
                      >
                        {t("actions.rejectOptional")}
                      </Button>
                    </div>
                    {cookiePrefs.preferences.consentedAt && (
                      <p className="text-xs text-muted-foreground">
                        {t("messages.lastUpdatedAt", { date: new Date(cookiePrefs.preferences.consentedAt).toLocaleString() })}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Appearance Tab */}
              <TabsContent value="appearance" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>{t("headings.appearanceSettings")}</CardTitle>
                    <CardDescription>
                      {t("messages.appearanceSettingsDesc")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>{t("settings.appearance.themeLabel")}</Label>
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
                          <SelectItem value="light">{t("settings.appearance.themeOption.light")}</SelectItem>
                          <SelectItem value="dark">{t("settings.appearance.themeOption.dark")}</SelectItem>
                          <SelectItem value="system">{t("settings.appearance.themeOption.system")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{t("settings.appearance.languageLabel")}</Label>
                      <Select value={appearance.language} onValueChange={async (value) => {
                        setAppearance({ ...appearance, language: value });
                        // Switch the live UI immediately so the user sees
                        // the change before the round-trip resolves.
                        applyLocale(value);
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
                          {availableLocales.map((loc) => (
                            <SelectItem key={loc} value={loc}>
                              {t(`settings.appearance.languageOption.${loc}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{t("settings.appearance.timezoneLabel")}</Label>
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
                          <SelectItem value="UTC">{t("settings.appearance.timezoneOption.utc")}</SelectItem>
                          <SelectItem value="America/Los_Angeles">{t("settings.appearance.timezoneOption.losAngeles")}</SelectItem>
                          <SelectItem value="America/Denver">{t("settings.appearance.timezoneOption.denver")}</SelectItem>
                          <SelectItem value="America/Chicago">{t("settings.appearance.timezoneOption.chicago")}</SelectItem>
                          <SelectItem value="America/New_York">{t("settings.appearance.timezoneOption.newYork")}</SelectItem>
                          <SelectItem value="America/Sao_Paulo">{t("settings.appearance.timezoneOption.saoPaulo")}</SelectItem>
                          <SelectItem value="Europe/London">{t("settings.appearance.timezoneOption.london")}</SelectItem>
                          <SelectItem value="Europe/Paris">{t("settings.appearance.timezoneOption.paris")}</SelectItem>
                          <SelectItem value="Europe/Athens">{t("settings.appearance.timezoneOption.athens")}</SelectItem>
                          <SelectItem value="Africa/Johannesburg">{t("settings.appearance.timezoneOption.johannesburg")}</SelectItem>
                          <SelectItem value="Asia/Dubai">{t("settings.appearance.timezoneOption.dubai")}</SelectItem>
                          <SelectItem value="Asia/Kolkata">{t("settings.appearance.timezoneOption.kolkata")}</SelectItem>
                          <SelectItem value="Asia/Singapore">{t("settings.appearance.timezoneOption.singapore")}</SelectItem>
                          <SelectItem value="Asia/Tokyo">{t("settings.appearance.timezoneOption.tokyo")}</SelectItem>
                          <SelectItem value="Australia/Sydney">{t("settings.appearance.timezoneOption.sydney")}</SelectItem>
                          <SelectItem value="Pacific/Auckland">{t("settings.appearance.timezoneOption.auckland")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Integrations Tab */}
              <TabsContent value="email" className="space-y-6">
                <EmailSettingsTab />
              </TabsContent>

              <TabsContent value="integrations" className="space-y-6">
                {/* SuperAdmin: Company YouTube Channel Configuration */}
                {isSuperAdmin && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Youtube className="h-5 w-5 text-red-600" />
                        {t("headings.companyYouTubeChannel")}
                        <Badge variant="secondary" className="ml-2">{t("labels.adminOnly")}</Badge>
                      </CardTitle>
                      <CardDescription>
                        {t("messages.companyYouTubeDesc")}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {companyYoutubeConfigured ? (
                        <div className="flex items-center gap-4 p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                          <CheckCircle className="h-6 w-6 text-green-600" />
                          <div className="flex-1">
                            <h4 className="font-medium text-green-800 dark:text-green-200">{t("headings.companyYouTubeConnected")}</h4>
                            <p className="text-sm text-green-600 dark:text-green-400">
                              {t("messages.companyYouTubeConnectedDesc")}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="flex items-center gap-4 p-4 bg-amber-50 dark:bg-amber-950 rounded-lg border border-amber-200 dark:border-amber-800">
                            <XCircle className="h-6 w-6 text-amber-600" />
                            <div className="flex-1">
                              <h4 className="font-medium text-amber-800 dark:text-amber-200">{t("headings.companyYouTubeNotConnected")}</h4>
                              <p className="text-sm text-amber-600 dark:text-amber-400">
                                {t("messages.companyYouTubeNotConnectedDesc")}
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
                                {t("status.connecting")}
                              </>
                            ) : (
                              <>
                                <Youtube className="h-4 w-4 mr-2" />
                                {t("actions.connectCompanyYouTube")}
                              </>
                            )}
                          </Button>
                        </div>
                      )}

                      <div className="space-y-2">
                        <h4 className="text-sm font-medium">{t("headings.howItWorks")}</h4>
                        <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                          <li>{t("messages.companyYouTubeStep1")}</li>
                          <li>{t("messages.companyYouTubeStep2")}</li>
                          <li>{t("messages.companyYouTubeStep3")}</li>
                          <li>{t("messages.companyYouTubeStep4")}</li>
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
                      {t("headings.videoStorage")}
                    </CardTitle>
                    <CardDescription>
                      {t("messages.videoStorageDesc")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="flex items-center gap-4 p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                      <CheckCircle className="h-6 w-6 text-green-600" />
                      <div className="flex-1">
                        <h4 className="font-medium text-green-800 dark:text-green-200">{t("headings.videoHostingActive")}</h4>
                        <p className="text-sm text-green-600 dark:text-green-400">
                          {t("messages.videoHostingActiveDesc")}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">{t("headings.howItWorks")}</h4>
                      <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                        <li>{t("messages.videoHostingStep1")}</li>
                        <li>{t("messages.videoHostingStep2")}</li>
                        <li>{t("messages.videoHostingStep3")}</li>
                        <li>{t("messages.videoHostingStep4")}</li>
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
                    <CardTitle>{t("headings.connectedAccounts")}</CardTitle>
                    <CardDescription>
                      {t("messages.connectedAccountsDesc")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {securityLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> {t("status.loading")}
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
                                    <p className="text-xs text-muted-foreground">{linked.displayName ?? linked.email ?? t("labels.connected")}</p>
                                  ) : (
                                    <p className="text-xs text-muted-foreground">{t("labels.notConnected")}</p>
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
                                  {unlinkingProvider === provider ? <Loader2 className="h-3 w-3 animate-spin" /> : t("actions.disconnect")}
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
                                  {t("actions.connect")}
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
                    <CardTitle>{t("headings.password")}</CardTitle>
                    <CardDescription>
                      {security?.hasPassword
                        ? t("messages.passwordChangeDesc")
                        : t("messages.passwordSetDesc")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button variant="outline" className="gap-2" asChild>
                      <Link to="/forgot-password">
                        <RefreshCw className="h-4 w-4" />
                        {security?.hasPassword ? t("actions.changePassword") : t("actions.setPassword")}
                      </Link>
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>{t("headings.twoFactorAuth")}</CardTitle>
                    <CardDescription>{t("messages.twoFactorAuthDesc")}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">
                          {security?.twoFactorEnabled ? t("labels.enabled") : t("labels.disabled")}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {security?.twoFactorEnabled
                            ? t("messages.twoFactorEnabledDesc")
                            : t("messages.twoFactorDisabledDesc")}
                        </p>
                      </div>
                      <Badge variant={security?.twoFactorEnabled ? "default" : "secondary"}>
                        {security?.twoFactorEnabled ? t("labels.on") : t("labels.off")}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Job Preferences Tab */}
              <TabsContent value="job-preferences" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>{t("headings.jobPreferences")}</CardTitle>
                    <CardDescription>
                      {t("messages.jobPreferencesDesc")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {!jobPrefs ? (
                      <p className="text-sm text-muted-foreground">{t("status.loadingJobPreferences")}</p>
                    ) : (
                      <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>{t("fields.preferredRoles.label")}</Label>
                            <Input
                              value={(jobPrefs.preferredJobTypes || []).join(", ")}
                              placeholder={t("fields.preferredRoles.placeholder")}
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
                            <p className="text-xs text-muted-foreground">{t("messages.separateWithCommas")}</p>
                          </div>
                          <div className="space-y-2">
                            <Label>{t("fields.preferredIndustries.label")}</Label>
                            <Input
                              value={(jobPrefs.preferredIndustries || []).join(", ")}
                              placeholder={t("fields.preferredIndustries.placeholder")}
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
                          <Label>{t("fields.preferredLocations.label")}</Label>
                          <Input
                            value={(jobPrefs.preferredLocations || []).join(", ")}
                            placeholder={t("fields.preferredLocations.placeholder")}
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
                            <Label>{t("fields.minSalary.label")}</Label>
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
                            <Label>{t("fields.maxSalary.label")}</Label>
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
                            <Label>{t("fields.currency.label")}</Label>
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
                            <Label>{t("fields.salaryPeriod.label")}</Label>
                            <Select
                              value={jobPrefs.salaryPeriod || "yearly"}
                              onValueChange={(v) => saveJobPatch({ salaryPeriod: v })}
                              disabled={savingJobPrefs}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="yearly">{t("labels.salaryPeriod.yearly")}</SelectItem>
                                <SelectItem value="monthly">{t("labels.salaryPeriod.monthly")}</SelectItem>
                                <SelectItem value="hourly">{t("labels.salaryPeriod.hourly")}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="flex items-center justify-between rounded-md border border-green-500/30 bg-green-500/5 p-3">
                          <div>
                            <Label>{t("settings.jobPreferences.openToWorkLabel")}</Label>
                            <p className="text-xs text-muted-foreground">{t("settings.jobPreferences.openToWorkDesc")}</p>
                          </div>
                          <Switch
                            checked={openToWorkToggle.openToWork}
                            onCheckedChange={(checked) => openToWorkToggle.setOpenToWork(checked)}
                            disabled={openToWorkToggle.busy}
                          />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <Label>{t("settings.jobPreferences.remoteOnlyLabel")}</Label>
                              <p className="text-xs text-muted-foreground">{t("settings.jobPreferences.remoteOnlyDesc")}</p>
                            </div>
                            <Switch
                              checked={!!jobPrefs.remoteOnly}
                              onCheckedChange={(checked) => saveJobPatch({ remoteOnly: checked })}
                              disabled={savingJobPrefs}
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <div>
                              <Label>{t("settings.jobPreferences.willingToRelocateLabel")}</Label>
                              <p className="text-xs text-muted-foreground">{t("settings.jobPreferences.willingToRelocateDesc")}</p>
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
                    <CardTitle>{t("headings.leadGeneration")}</CardTitle>
                    <CardDescription>
                      {t("messages.leadGenerationDesc")}
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
                              <p className="font-medium">{t("settings.leadGeneration.provideServicesLabel")}</p>
                              <p className="text-sm text-muted-foreground">
                                {providesServices
                                  ? t("settings.leadGeneration.servicesPublicDesc")
                                  : t("settings.leadGeneration.servicesHiddenDesc")}
                              </p>
                            </div>
                          </div>
                          <Switch
                            checked={providesServices}
                            onCheckedChange={handleToggleProvider}
                            disabled={providesServicesSaving}
                          />
                        </div>

                        <div className="border-t pt-4">
                          <Link to="/services">
                            <Button variant="outline" className="gap-2">
                              <ArrowRight className="h-4 w-4" />
                              {t("actions.manageServiceOfferings")}
                            </Button>
                          </Link>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Account & Billing — consolidated surface. AccountManagementPanel
                  owns the sub-tabs (Account Billing & Subscription / Usage
                  Statement / Account / Team Members / Invitation Analytics /
                  Analytics). The old standalone "Account" sidebar item was
                  folded in as the Account sub-tab; legacy ?tab=team-billing,
                  ?tab=account, and ?tab=billing all remap here. */}
              <TabsContent value="account-billing" className="space-y-6">
                <AccountManagementPanel />
              </TabsContent>

              {/* Points & Rewards — same hub as the /points route; this is
                  where users cash out their balance + see their badge wall
                  alongside their billing controls. Self-gates on role via
                  isPointsEligible(user). */}
              <TabsContent value="points" className="space-y-6">
                <PointsHub showHeader />
              </TabsContent>

              {/* Content Creator → Account. Mirrors the /services dashboard
                  Content Creator section — heading + Profile/Payouts/Portfolio/
                  Account tabs + template earnings. Inner forms self-gate on
                  enrollment, so non-creators get the enrollment CTA inline. */}
              <TabsContent value="creator-profile" className="space-y-6">
                <ContentCreatorSection />
              </TabsContent>

              {/* Recruiter → Sharing & Branding. Folded in from the now-deleted
                  /services/settings page so brand kits + redaction profiles
                  live in the same Account settings hub as everything else.
                  The panel self-gates when scope has no companies. */}
              <TabsContent value="recruiter-sharing" className="space-y-6">
                <RecruitSharingSettings />
              </TabsContent>

                </div>
              </div>
            </Tabs>
          </div>
      </div>
    </AppShell>
);
}

export default function Settings() {
  return (
    <PasswordRequirementsProvider>
      <SettingsContent />
    </PasswordRequirementsProvider>
  );
}
