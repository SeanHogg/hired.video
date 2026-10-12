import {
  RefreshCw,
  ArrowRight,
  Youtube,
  CheckCircle,
  XCircle,
  Loader2,
  ToggleLeft,
  ToggleRight,
  Video,
  Share2,
} from "lucide-react";
import { PointsHub } from "@/components/points/PointsHub";
import { isPointsEligible } from "@/lib/services/points-service";
import { PasswordRequirementsProvider } from "@/components/auth/PasswordRequirementsProvider";
import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { InboxSyncPitch, SettingsPitch } from "@/components/settings/SettingsMarketing";
import SettingsTabNav from "@/components/settings/SettingsTabNav";
import { VideoPersonalizationCard } from "@/components/settings/video-personalization/VideoPersonalizationCard";
import PageHeader from "@/components/PageHeader";
import { APP_PAGE_COLUMN } from "@/lib/ui/page-layout";
import { ExtensionsSettings } from "@/components/ExtensionsSettings";
import { EmailSettingsTab } from "@/components/email/EmailSettingsTab";
import { EmailPreferencesPanel } from "@/components/email/EmailPreferencesPanel";
import { PushDeviceToggle } from "@/components/settings/PushDeviceToggle";
import { WorkforceSettings } from "@/components/workforce/WorkforceSettings";
import { SocialConnectionsList } from "@/components/social/SocialConnectionsList";
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
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useCookiePreferences } from "@/hooks/use-cookie-preferences";
import { useAuth } from "@/lib/auth";
import { getRoleDisplayLabel, roleUtils } from "@/lib/role-utils";
import { useTranslation, Trans } from "react-i18next";
import { applyLocale } from "@/lib/i18n/i18n";
import { NATIVE_LABELS } from "@/lib/i18n/locale-labels";
import { PUBLIC_LOCALES, type Locale } from "@shared/i18n";
import { USER_ROLES } from "@shared/user-roles";
import { isDeveloperViewer } from "@/lib/auth-claims";

import { AccountManagementPanel } from "@/components/account/AccountManagementPanel";
import ContentCreatorSection from "@/components/creator/ContentCreatorSection";
import RecruitSharingSettings from "@/components/recruit/RecruitSharingSettings";
import PromoteWithoutAuthToggle from "@/components/settings/PromoteWithoutAuthToggle";
import ConfidentialModeToggle from "@/components/settings/ConfidentialModeToggle";
import ProfileSectionsSettingsCard from "@/components/settings/ProfileSectionsSettingsCard";
import ConnectedPlatformsCard from "@/components/settings/ConnectedPlatformsCard";
import PartnerAccessCard from "@/components/settings/PartnerAccessCard";
import VendorIntegrationsCard from "@/components/settings/VendorIntegrationsCard";
import { AccountAuditLogPanel } from "@/components/settings/AccountAuditLogPanel";
import { settingsService, type PrivacySettings, type AccountSettings, type JobPreferences } from "@/lib/services/settings-service";
import { useThemePreference, type ThemeChoice } from "@/lib/theme/use-theme-preference";
import { servicesService } from "@/lib/services/services-service";
import { userService } from "@/lib/services/user-service";
import { youtubeService, type YouTubeAccount } from "@/lib/services/youtube-service";
import { beginIntegrationOAuth, integrationOAuthErrorKey } from "@/lib/studio/integration-oauth";
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
  // Theme is applied + persisted through the shared seam (same one the nav
  // toggle uses); `currentTheme` reflects the live choice incl. "system".
  const { theme: currentTheme, select: selectTheme } = useThemePreference();
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

  // Sync active tab from ?tab= query param (e.g. /settings?tab=lead-generation)
  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab) setActiveTab(remapLegacyTab(tab));
    // run once on mount; subsequent tab changes are user-driven
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle YouTube OAuth callback query params
  useEffect(() => {
    const youtubeSuccess = searchParams.get("youtube_success");
    const youtubeError = searchParams.get("youtube_error");

    if (youtubeSuccess === "true") {
      toast({ title: t("messages.youtubeConnected") });
      setActiveTab("integrations");
      searchParams.delete("youtube_success");
      setSearchParams(searchParams, { replace: true });
    } else if (youtubeError) {
      toast({
        title: t("messages.youtubeConnectFailed"),
        description: t(integrationOAuthErrorKey(youtubeError)),
        variant: "destructive"
      });
      setActiveTab("integrations");
      searchParams.delete("youtube_error");
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

  // Lazy-load the YouTube account when the integrations tab is active
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

  const isSuperAdmin = isDeveloperViewer({ isSuperAdmin: user?.role === USER_ROLES.SUPER_ADMIN, email: user?.email });

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

  // Workforce tab visibility — gated on `roleUtils.canManageWorkforce`,
  // the same SSoT that the <WorkforceSettings/> component reads
  // internally. Trigger + content stay in sync; no two-place gate
  // drift (DRY rule).
  const showWorkforceTab = roleUtils.canManageWorkforce(user?.role);

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
        window.location.href = beginIntegrationOAuth("youtube", response.data.authUrl, "/settings");
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
      return <InboxSyncPitch currentPathWithSearch={currentPathWithSearch} />;
    }
    return <SettingsPitch />;
  }

  return (
    <AppShell bgClassName="bg-background">
      <div className={APP_PAGE_COLUMN}>
          <div className="space-y-6">
            <PageHeader
              className="mb-0"
              title={t("headings.settings")}
              description={t("messages.manageAccountSettings")}
              actions={
                !isSuperAdmin ? (
                  <Badge variant="secondary">{getRoleDisplayLabel(user.role)}</Badge>
                ) : undefined
              }
            />

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
                <SettingsTabNav
                  showWorkforceTab={showWorkforceTab}
                  showPointsTab={showPointsTab}
                  hasRecruiterSurface={hasRecruiterSurface}
                />

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
                    <PushDeviceToggle />
                    {/* Granular marketing opt-out lives in its own card below
                        (the authoritative email-keyed consent ledger the send
                        path actually honors). The old coarse `marketing`
                        toggle was superseded — see gap register. */}
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

                <Card>
                  <CardHeader>
                    <CardTitle>{t("headings.marketingEmailPreferences")}</CardTitle>
                    <CardDescription>
                      {t("messages.marketingEmailPreferencesDesc")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <EmailPreferencesPanel />
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
                    <ConfidentialModeToggle asCard={false} />
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

                {/* Third-party partner platforms the user has connected to
                    their account — manage/revoke access here. */}
                <ConnectedPlatformsCard />

                {/* Self-service partner platform access — request access, then
                    self-issue API keys once approved. */}
                <PartnerAccessCard />
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
                      <Select value={currentTheme} onValueChange={(value) => {
                        // Applies the theme live + persists to the server via the
                        // shared hook; keep the local mirror in sync for the form.
                        const theme = value as ThemeChoice;
                        setAppearance({ ...appearance, theme });
                        selectTheme(theme);
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
                              {/* Native-script name (Español, Français…) — the
                                  universal picker convention, shared with
                                  LocaleSwitcher via NATIVE_LABELS (DRY). */}
                              {NATIVE_LABELS[loc]}
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
                {/* Generic self-serve API-key vendor registry (#261). Admin
                    only — the card self-hides (returns null) on a 403. */}
                <VendorIntegrationsCard />

                {/* Social publishing connections (PRD §5.0, Lane B). The
                    connectable platforms render inline here via the shared
                    <SocialConnectionsList> (same surface as
                    /settings/connections) so members can connect an account
                    without clicking through. */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Share2 className="h-5 w-5" />
                      {t("headings.socialPublishing")}
                    </CardTitle>
                    <CardDescription>
                      {t("messages.socialPublishingDesc")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <SocialConnectionsList />
                  </CardContent>
                </Card>

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
                    <div className="flex items-center gap-4 p-4 bg-brand-green/10 rounded-xl border border-brand-green/30">
                      <CheckCircle className="h-6 w-6 text-brand-green-text" />
                      <div className="flex-1">
                        <h4 className="font-medium text-foreground">{t("headings.videoHostingActive")}</h4>
                        <p className="text-sm text-brand-green-text">
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
                        <div className="flex items-center gap-4 p-4 bg-brand-green/10 rounded-xl border border-brand-green/30">
                          <CheckCircle className="h-6 w-6 text-brand-green-text" />
                          <div className="flex-1">
                            <h4 className="font-medium text-foreground">YouTube Connected</h4>
                            <p className="text-sm text-brand-green-text">
                              You can now upload videos directly to your YouTube channel
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
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
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
                {/* Unified audit log — every login, password / email change,
                    account lock, impersonation event, and admin action in
                    one chronological stream. Mounts at the top of the
                    Security tab so the most security-relevant context is
                    the first thing the user sees. */}
                <AccountAuditLogPanel />
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
                                  {provider === "google" && <span className="text-primary">G</span>}
                                  {provider === "linkedin" && <span className="text-primary">in</span>}
                                  {provider === "github" && <span>⌬</span>}
                                  {provider === "microsoft" && <span className="text-primary">⊞</span>}
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
              {/* Self-contained: reads + saves its own data (gap #2350). */}
              <TabsContent value="video-personalization" className="space-y-6">
                <VideoPersonalizationCard />
              </TabsContent>

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

                        <div className="flex items-center justify-between rounded-md border border-brand-green/30 bg-brand-green/10 p-3">
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
                              <ToggleRight className="h-5 w-5 text-sky-600" />
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

              {/* Workforce (#1349) — employer-only back-office surface.
                  <WorkforceSettings/> self-gates on canManageWorkforce so
                  consumers can mount it unconditionally; we still gate the
                  trigger via showWorkforceTab so non-employers don't see
                  an empty Tabs slot in the sidebar. */}
              <TabsContent value="workforce" className="space-y-6">
                <WorkforceSettings />
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
