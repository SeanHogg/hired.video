// /jobs hub container. State lives in components/jobs/hub/hooks/*, pure
// helpers in components/jobs/hub/jobs-hub-model.ts and each tab body in its
// own presentational component under components/jobs/hub/.
import { useState, useEffect } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import JobsMarketing from "@/components/jobs/JobsMarketing";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import { type UserRole } from "@shared/user-roles";
import { canPostJobs } from "@/lib/persona";
import AdSlot from "@/components/ads/AdSlot";
import CandidatesPanel from "@/components/recruit/CandidatesPanel";
import { useCurrentCompanyScope } from "@/hooks/use-current-company-scope";
import { AppShell } from "@/components/AppShell";
import { APP_PAGE_COLUMN } from "@/lib/ui/page-layout";
import HeaderSearch from "@/components/HeaderSearch";
import PageHeader from "@/components/PageHeader";
import { writeEntityHubActiveTab } from "@/components/EntityHubTabStrip";
import { useJobsTabs } from "@/hooks/use-jobs-tabs";
import {
  effectiveJobsHubTab,
  resolveJobsHubTab,
} from "@/components/jobs/hub/jobs-hub-model";
import { useJobsHeaderFilters } from "@/components/jobs/hub/hooks/useJobsHeaderFilters";
import { useJobsBrowse } from "@/components/jobs/hub/hooks/useJobsBrowse";
import {
  useJobAlerts,
  useJobApplications,
  useSavedJobs,
} from "@/components/jobs/hub/hooks/useJobsHubCollections";
import { useJobAlertEditor } from "@/components/jobs/hub/hooks/useJobAlertEditor";
import { useJobOwnerActions } from "@/components/jobs/hub/hooks/useJobOwnerActions";
import { useCandidateCount } from "@/components/jobs/hub/hooks/useCandidateCount";
import { JobsHubHeaderActions } from "@/components/jobs/hub/JobsHubHeaderActions";
import { JobsBrowseTab } from "@/components/jobs/hub/JobsBrowseTab";
import { PostedJobsPanel } from "@/components/jobs/hub/PostedJobsPanel";
import { SavedJobsTab } from "@/components/jobs/hub/SavedJobsTab";
import { JobApplicationsTab } from "@/components/jobs/hub/JobApplicationsTab";
import { JobAlertsTab } from "@/components/jobs/hub/JobAlertsTab";
import { EditJobAlertSheet } from "@/components/jobs/hub/EditJobAlertSheet";
import { JobsHubDialogs } from "@/components/jobs/hub/JobsHubDialogs";

export default function Jobs() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = resolveJobsHubTab(searchParams.get("tab") ?? searchParams.get("section"));
  const location = useLocation();
  // SEO for jobs page
  useSEO(location.pathname);
  useBreadcrumbs([{ name: t("labels.jobs"), url: "/jobs" }]);
  const { isAuthenticated, user } = useAuth();
  useJobsHeaderFilters();

  const browse = useJobsBrowse(searchParams, setSearchParams);
  const [candidateCount, setCandidateCount] = useCandidateCount(isAuthenticated, user);
  // Candidates tab — lifted scope so the company picker + import buttons
  // can sit in the PageHeader actions slot (next to "Post Job") while the
  // CandidatesPanel body reads the same companyId. The nonce kicks the
  // panel to refetch after the lifted import controls add a row.
  const candidates = useCurrentCompanyScope();
  const [candidatesRefreshNonce, setCandidatesRefreshNonce] = useState(0);
  // Hub tab strip — must call unconditionally (rules of hooks). Returns
  // [] for unauthenticated viewers, who never reach the authed branch.
  const topTabs = useJobsTabs({ totalJobs: browse.totalJobs, candidateCount });
  // Remember the user's current tab so the strip on /jobs/:id /
  // (retired) /jobs/edit/:id / /jobs/create surfaces kept it highlighted.
  useEffect(() => {
    writeEntityHubActiveTab("job", activeTab);
  }, [activeTab]);

  const saved = useSavedJobs();
  const applications = useJobApplications();
  const alerts = useJobAlerts();
  const alertEditor = useJobAlertEditor(alerts.loadAlerts);
  const owner = useJobOwnerActions(browse.setJobs, saved.setSavedJobs);

  // Load data based on active tab
  useEffect(() => {
    if (!isAuthenticated) return;

    if (activeTab === "saved") {
      saved.loadSavedJobs();
    } else if (activeTab === "applications") {
      applications.loadApplications();
    } else if (activeTab === "alerts") {
      alerts.loadAlerts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isAuthenticated]);

  // #676: Track/untrack is handled inside JobCard via `useTrackedJobs` +
  // jobService.saveJob/unsaveJob (optimistic, with extension event fire).
  // Letting the card own it means a failed save rolls back the bookmark
  // icon naturally.

  const handleTabChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", value);
    setSearchParams(next);
  };

  // If user is not authenticated, show marketing page
  if (!isAuthenticated || !user) return <JobsMarketing jobs={browse.jobs} />;

  // Capability lives in persona.ts (single SA-bypass rule). canPostJobs
  // covers recruiter / employer / admin and SA bypasses; ALSO used to
  // gate the Post-a-Job button and Candidates / Posted tabs.
  const canManageJobs = canPostJobs(user.role as UserRole);
  const effectiveTab = effectiveJobsHubTab(activeTab, canManageJobs);
  const menuHandlersFor = (job: { id: string; title: string }) =>
    owner.menuHandlersFor(job, canManageJobs);

  return (
    <AppShell bgClassName="bg-background">
      <div className={APP_PAGE_COLUMN}>
        <div>
          {/* Ad banner — free tier only. AdSlot self-centers and returns
              null for Pro users, so no wrapper / no spacing eats the
              layout for non-ad audiences. */}
          <AdSlot slot="jobs-banner" size="banner" className="mb-4" />
          <PageHeader
            tabs={topTabs}
            activeTabKey={effectiveTab}
            search={<HeaderSearch />}
            actions={
              <JobsHubHeaderActions
                effectiveTab={effectiveTab}
                canManageJobs={canManageJobs}
                candidates={candidates}
                onCandidatesImported={() => setCandidatesRefreshNonce((n) => n + 1)}
                browse={browse}
              />
            }
          />

          {effectiveTab === "candidates" && canManageJobs ? (
            <CandidatesPanel
              onCountChange={setCandidateCount}
              hideHeaderControls
              scopeOverride={candidates.scope}
              companyIdOverride={candidates.companyId}
              refreshNonce={candidatesRefreshNonce}
            />
          ) : effectiveTab === "posted" && canManageJobs ? (
            <PostedJobsPanel
              jobs={browse.displayedJobs}
              userId={user.id}
              menuHandlersFor={menuHandlersFor}
            />
          ) : (
            <Tabs value={effectiveTab} className="space-y-4 sm:space-y-6">
              {/* Jobs (browse) Tab */}
              <TabsContent value="jobs" className="space-y-6">
                <JobsBrowseTab browse={browse} menuHandlersFor={menuHandlersFor} />
              </TabsContent>

              {/* Saved Jobs Tab */}
              <TabsContent value="saved" className="space-y-4">
                <SavedJobsTab
                  savedJobs={saved.savedJobs}
                  loading={saved.savedJobsLoading}
                  onUnsave={saved.handleUnsaveJob}
                  onBrowseJobs={() => handleTabChange("jobs")}
                />
              </TabsContent>

              {/* Applications Tab */}
              <TabsContent value="applications" className="space-y-4">
                <JobApplicationsTab
                  applications={applications.applications}
                  loading={applications.applicationsLoading}
                  onBrowseJobs={() => handleTabChange("jobs")}
                />
              </TabsContent>

              {/* Alerts Tab */}
              <TabsContent value="alerts" className="space-y-4">
                <JobAlertsTab
                  alerts={alerts.alerts}
                  loading={alerts.alertsLoading}
                  onReload={alerts.loadAlerts}
                  onToggleActive={alerts.handleToggleActive}
                  onEdit={alertEditor.handleEditAlert}
                  onDelete={alerts.setDeleteAlertId}
                />
              </TabsContent>
            </Tabs>
          )}

          {/* Edit Alert Sheet */}
          <EditJobAlertSheet editor={alertEditor} />

          <JobsHubDialogs
            deleteAlertId={alerts.deleteAlertId}
            onCancelDeleteAlert={() => alerts.setDeleteAlertId(null)}
            onConfirmDeleteAlert={alerts.handleDeleteAlert}
            owner={owner}
          />
        </div>
      </div>
    </AppShell>
  );
}
