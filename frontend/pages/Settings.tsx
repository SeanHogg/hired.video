import { PointsHub } from "@/components/points/PointsHub";
import { isPointsEligible } from "@/lib/services/points-service";
import { PasswordRequirementsProvider } from "@/components/auth/PasswordRequirementsProvider";
import { useLocation } from "react-router-dom";
import { InboxSyncPitch, SettingsPitch } from "@/components/settings/SettingsMarketing";
import SettingsTabNav from "@/components/settings/SettingsTabNav";
import { VideoPersonalizationCard } from "@/components/settings/video-personalization/VideoPersonalizationCard";
import PageHeader from "@/components/PageHeader";
import { APP_PAGE_COLUMN } from "@/lib/ui/page-layout";
import { ExtensionsSettings } from "@/components/ExtensionsSettings";
import { EmailSettingsTab } from "@/components/email/EmailSettingsTab";
import { WorkforceSettings } from "@/components/workforce/WorkforceSettings";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useCookiePreferences } from "@/hooks/use-cookie-preferences";
import { useAuth } from "@/lib/auth";
import { getRoleDisplayLabel, roleUtils } from "@/lib/role-utils";
import { useTranslation } from "react-i18next";
import { PUBLIC_LOCALES, type Locale } from "@shared/i18n";
import { USER_ROLES } from "@shared/user-roles";
import { isDeveloperViewer } from "@/lib/auth-claims";

import { AccountManagementPanel } from "@/components/account/AccountManagementPanel";
import ContentCreatorSection from "@/components/creator/ContentCreatorSection";
import RecruitSharingSettings from "@/components/recruit/RecruitSharingSettings";
import ProfileSectionsSettingsCard from "@/components/settings/ProfileSectionsSettingsCard";
import { useThemePreference, type ThemeChoice } from "@/lib/theme/use-theme-preference";
import { useOpenToWorkToggle } from "@/lib/hooks/use-open-to-work";

import { useSettingsActiveTab } from "@/components/settings/hooks/useSettingsActiveTab";
import { useAccountPreferences } from "@/components/settings/hooks/useAccountPreferences";
import { useJobPreferences } from "@/components/settings/hooks/useJobPreferences";
import { useYouTubeIntegration } from "@/components/settings/hooks/useYouTubeIntegration";
import { useLeadGeneration } from "@/components/settings/hooks/useLeadGeneration";
import { useSecuritySettings } from "@/components/settings/hooks/useSecuritySettings";
import { NotificationsSettingsTab } from "@/components/settings/tabs/NotificationsSettingsTab";
import { PrivacySettingsTab } from "@/components/settings/tabs/PrivacySettingsTab";
import { CookiesSettingsTab } from "@/components/settings/tabs/CookiesSettingsTab";
import { AppearanceSettingsTab } from "@/components/settings/tabs/AppearanceSettingsTab";
import { IntegrationsSettingsTab } from "@/components/settings/tabs/IntegrationsSettingsTab";
import { SecuritySettingsTab } from "@/components/settings/tabs/SecuritySettingsTab";
import { JobPreferencesSettingsTab } from "@/components/settings/tabs/JobPreferencesSettingsTab";
import { LeadGenerationSettingsTab } from "@/components/settings/tabs/LeadGenerationSettingsTab";

function SettingsContent() {
  const { user, isAuthenticated } = useAuth();
  const openToWorkToggle = useOpenToWorkToggle();
  const cookiePrefs = useCookiePreferences();
  const { t } = useTranslation();
  // Theme is applied + persisted through the shared seam (same one the nav
  // toggle uses); `currentTheme` reflects the live choice incl. "system".
  const { theme: currentTheme, select: selectTheme } = useThemePreference();
  // The W-language is a debug locale only super_admins should see in
  // the picker — normal users get the public set (en, es).
  const availableLocales: readonly Locale[] = user?.role === USER_ROLES.SUPER_ADMIN
    ? ([...PUBLIC_LOCALES, "w"] as const)
    : PUBLIC_LOCALES;
  const location = useLocation();

  // Active tab — seeded from ?tab= / ?billing_setup=1 (legacy keys remapped)
  // and the YouTube OAuth callback params.
  const { activeTab, setActiveTab, searchParams, setSearchParams } = useSettingsActiveTab();

  const prefs = useAccountPreferences(isAuthenticated);
  const job = useJobPreferences(isAuthenticated, activeTab);
  // Per-user YouTube connection — UI hidden (kept for future use); the
  // account still lazy-loads when the integrations tab is active.
  useYouTubeIntegration(isAuthenticated, activeTab);
  const leadGen = useLeadGeneration(isAuthenticated, activeTab);
  const sec = useSecuritySettings(isAuthenticated, activeTab, setActiveTab, searchParams, setSearchParams);

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
                page (not just Settings) prompts unverified users to verify. */}

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

              <TabsContent value="notifications" className="space-y-6">
                <NotificationsSettingsTab
                  notifications={prefs.notifications}
                  onChannelChange={prefs.setNotificationChannel}
                />
              </TabsContent>

              <TabsContent value="privacy" className="space-y-6">
                <PrivacySettingsTab
                  privacy={prefs.privacy}
                  savingPrivacy={prefs.savingPrivacy}
                  onSavePatch={prefs.savePrivacyPatch}
                  onLocalFlagChange={prefs.setLocalPrivacyFlag}
                />
              </TabsContent>

              {/* Profile Sections Tab — role-defaulted visibility for /people/[id] sections */}
              <TabsContent value="profile-sections" className="space-y-6">
                <ProfileSectionsSettingsCard />
              </TabsContent>

              <TabsContent value="cookies" className="space-y-6">
                <CookiesSettingsTab cookiePrefs={cookiePrefs} />
              </TabsContent>

              <TabsContent value="appearance" className="space-y-6">
                <AppearanceSettingsTab
                  currentTheme={currentTheme}
                  onThemeChange={(theme: ThemeChoice) => {
                    // Applies the theme live + persists to the server via the
                    // shared hook; keep the local mirror in sync for the form.
                    prefs.setAppearanceTheme(theme);
                    selectTheme(theme);
                  }}
                  appearance={prefs.appearance}
                  availableLocales={availableLocales}
                  onLanguageChange={prefs.setLanguage}
                  onTimezoneChange={prefs.setTimezone}
                />
              </TabsContent>

              <TabsContent value="email" className="space-y-6">
                <EmailSettingsTab />
              </TabsContent>

              <TabsContent value="integrations" className="space-y-6">
                <IntegrationsSettingsTab />
              </TabsContent>

              {/* Chrome Extensions Tab */}
              <TabsContent value="extensions" className="space-y-6">
                <ExtensionsSettings />
              </TabsContent>

              <TabsContent value="security" className="space-y-6">
                <SecuritySettingsTab
                  security={sec.security}
                  securityLoading={sec.securityLoading}
                  unlinkingProvider={sec.unlinkingProvider}
                  onUnlinkProvider={sec.handleUnlinkProvider}
                />
              </TabsContent>

              {/* Self-contained: reads + saves its own data (gap #2350). */}
              <TabsContent value="video-personalization" className="space-y-6">
                <VideoPersonalizationCard />
              </TabsContent>

              <TabsContent value="job-preferences" className="space-y-6">
                <JobPreferencesSettingsTab
                  jobPrefs={job.jobPrefs}
                  saving={job.savingJobPrefs}
                  onSavePatch={job.saveJobPatch}
                  openToWorkToggle={openToWorkToggle}
                />
              </TabsContent>

              <TabsContent value="lead-generation" className="space-y-6">
                <LeadGenerationSettingsTab
                  providesServices={leadGen.providesServices}
                  loading={leadGen.providesServicesLoading}
                  saving={leadGen.providesServicesSaving}
                  onToggle={leadGen.handleToggleProvider}
                />
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
