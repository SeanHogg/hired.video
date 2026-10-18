import { UserCheck } from "lucide-react";
import { useEffect } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import PeopleCard from "@/components/PeopleCard";
import PeopleMarketing from "@/components/people/PeopleMarketing";
import DiscoverPeopleGrid from "@/components/DiscoverPeopleGrid";
import { Button } from "@/components/ui/button";
import ListsButton from "@/components/lists/ListsButton";
import { AppShell } from "@/components/AppShell";
import { APP_PAGE_COLUMN } from "@/lib/ui/page-layout";
import HeaderSearch from "@/components/HeaderSearch";
import PageHeader from "@/components/PageHeader";
import { usePeopleTabs } from "@/hooks/use-people-tabs";
import { writeEntityHubActiveTab } from "@/components/EntityHubTabStrip";
import ViewModeToggle, { BROWSE_VIEW_MODES } from "@/components/ViewModeToggle";
import { useViewMode } from "@/lib/hooks/useViewMode";
import { useAuth } from "@/lib/auth";
import { createRolePermissions } from "@/lib/role-utils";
import { toFeaturedPerson } from "@/components/people/people-helpers";
import { usePeopleSearchFilters } from "@/components/people/hooks/usePeopleSearchFilters";
import { usePeopleDirectory } from "@/components/people/hooks/usePeopleDirectory";
import { useMyConnections } from "@/components/people/hooks/useMyConnections";
import { useTalentPool } from "@/components/people/hooks/useTalentPool";
import { useEditCandidate } from "@/components/people/hooks/useEditCandidate";
import { useLogInteraction } from "@/components/people/hooks/useLogInteraction";
import { useSubmissions } from "@/components/people/hooks/useSubmissions";
import PeopleConnectionsTab from "@/components/people/PeopleConnectionsTab";
import TalentPoolTab from "@/components/people/TalentPoolTab";
import SubmissionsTab from "@/components/people/SubmissionsTab";
import EditCandidateSheet from "@/components/people/EditCandidateSheet";
import LogInteractionSheet from "@/components/people/LogInteractionSheet";
import { RemoveCandidateDialog, SubmitToJobDialog } from "@/components/people/TalentPoolDialogs";

/**
 * /people — container. State lives in components/people/hooks/*, the tab
 * bodies / sheets / dialogs in components/people/*.
 */
export default function People() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "browse";
  const location = useLocation();
  // SEO for people page
  useSEO(location.pathname);
  useBreadcrumbs([{ name: t("labels.people"), url: "/people" }]);
  const { isAuthenticated, user } = useAuth();
  // Shared tab strip — also rendered by /people/pitch-decks, /people/hiring,
  // /people/scorecards so one nav definition drives every People surface.
  const peopleTabs = usePeopleTabs();
  // Remember the user's current tab so the strip on /people/:id and the
  // other deep /people/* surfaces keeps it highlighted.
  useEffect(() => {
    writeEntityHubActiveTab("person", activeTab);
  }, [activeTab]);

  const { searchFilters, setSearchFilters } = usePeopleSearchFilters();
  const [viewMode, setViewMode] = useViewMode("people.browse", "grid", BROWSE_VIEW_MODES);
  const directory = usePeopleDirectory({
    searchFilters,
    listIdFromUrl: searchParams.get("list_id"),
    hasUser: !!user,
  });
  const connections = useMyConnections(user);
  const pool = useTalentPool({ activeTab, isAuthenticated, user });
  const subs = useSubmissions({ activeTab, isAuthenticated, user });
  const editor = useEditCandidate(pool.loadTalentPool);
  const interaction = useLogInteraction(pool.loadTalentPool);

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value });
  };

  // If user is not authenticated, show marketing page
  if (!isAuthenticated || !user) {
    return (
      <PeopleMarketing
        featured={directory.people.slice(0, 3).map((person) => (
          <PeopleCard key={person.id} person={toFeaturedPerson(person, t)} />
        ))}
      />
    );
  }

  const rolePermissions = createRolePermissions(user.role);
  // Consolidated hiring-side check — fold admin / SA in via the canonical
  // canManageJobs permission (drops the inline drift called out by gap #360).
  const isRecruiterOrEmployer = rolePermissions.canManageJobs;
  const showsPeopleGrid = activeTab === "browse" || activeTab === "connections";

  const handleCardActions = (personId: string) => {
    const candidate = pool.talentPool.find((c) => c.candidateUserId === personId);
    if (candidate) {
      // If in talent pool, open the edit sheet
      editor.handleEditCandidate(candidate);
    } else if (rolePermissions.isRecruiter) {
      // If not in talent pool but user is a recruiter, add to talent pool
      pool.handleAddToTalentPool(personId);
    }
  };

  // Shared Discover grid node — the recruiter arm's `browse` tab and the
  // non-recruiter arm's only view (#334).
  const discoverGrid = (
    <DiscoverPeopleGrid
      people={directory.displayedPeople}
      isLoading={directory.isLoading}
      error={directory.error}
      viewMode={viewMode}
      isFilteredByList={directory.isFilteredByList}
      currentPage={directory.currentPage}
      totalPeople={directory.totalPeople}
      itemsPerPage={directory.itemsPerPage}
      onPageChange={directory.setCurrentPage}
      onItemsPerPageChange={directory.handleItemsPerPageChange}
      onConnect={directory.handleConnect}
      onMessage={directory.handleMessage}
      onAcceptConnection={directory.handleAcceptConnection}
      onRejectConnection={directory.handleRejectConnection}
      onAddToTalentPool={pool.handleAddToTalentPool}
      onCardActions={handleCardActions}
      onClearFilters={() => setSearchFilters({})}
      onRetry={directory.fetchPeople}
    />
  );

  return (
    <AppShell bgClassName="bg-background">
      <div className={APP_PAGE_COLUMN}>
        <div>
          <PageHeader
            tabs={peopleTabs}
            activeTabKey={activeTab}
            search={<HeaderSearch />}
            actions={
              <>
                <Button asChild variant="outline" className="min-h-[44px]">
                  <Link to="/profile">
                    <UserCheck className="h-4 w-4 mr-2" />
                    {t("actions.myProfile")}
                  </Link>
                </Button>
                {showsPeopleGrid && (
                  <ViewModeToggle value={viewMode} onChange={setViewMode} modes={BROWSE_VIEW_MODES} />
                )}
                {showsPeopleGrid && isRecruiterOrEmployer && <ListsButton entityType="person" />}
              </>
            }
          />

          {activeTab === "connections" && (
            <PeopleConnectionsTab
              tracked={connections.tracked}
              viewMode={viewMode}
              getConnectionStatus={connections.getConnectionStatus}
              onTrack={connections.handleTrackPerson}
              onUntrack={connections.handleUntrackPerson}
              onConnect={directory.handleConnect}
              onMessage={directory.handleMessage}
              onAcceptConnection={directory.handleAcceptConnection}
              onRejectConnection={directory.handleRejectConnection}
              onCardActions={handleCardActions}
            />
          )}

          {activeTab !== "connections" &&
            (rolePermissions.isRecruiter ? (
              <div className="space-y-6">
                {/* #333 — Tracked / Following lives under the Connections tab. */}
                {activeTab === "browse" && <div className="space-y-6">{discoverGrid}</div>}

                {activeTab === "talent-pool" && (
                  <TalentPoolTab
                    talentPool={pool.talentPool}
                    isLoading={pool.talentPoolLoading}
                    onBrowse={() => handleTabChange("browse")}
                    onSubmitToJob={subs.handleSubmitToJob}
                    onLogInteraction={interaction.handleAddInteraction}
                    onEdit={editor.handleEditCandidate}
                    onRemove={pool.requestRemove}
                  />
                )}

                {activeTab === "submissions" && (
                  <SubmissionsTab
                    submissions={subs.submissions}
                    isLoading={subs.submissionsLoading}
                    onGoToTalentPool={() => handleTabChange("talent-pool")}
                  />
                )}
              </div>
            ) : (
              /* Non-recruiter view — same Discover grid, no Talent Pool / Submissions. */
              <div className="space-y-6">{discoverGrid}</div>
            ))}

          <EditCandidateSheet
            open={editor.editSheetOpen}
            onOpenChange={editor.setEditSheetOpen}
            form={editor.editForm}
            onFormChange={editor.setEditForm}
            tagInput={editor.tagInput}
            onTagInputChange={editor.setTagInput}
            onAddTag={editor.handleAddTag}
            onRemoveTag={editor.handleRemoveTag}
            onSave={editor.handleSaveEdit}
          />

          <LogInteractionSheet
            open={interaction.interactionSheetOpen}
            onOpenChange={interaction.setInteractionSheetOpen}
            form={interaction.interactionForm}
            onFormChange={interaction.setInteractionForm}
            onSave={interaction.handleSaveInteraction}
          />

          <RemoveCandidateDialog
            open={pool.deleteDialogOpen}
            onOpenChange={pool.setDeleteDialogOpen}
            onConfirm={pool.handleDeleteCandidate}
          />

          <SubmitToJobDialog
            open={subs.submitDialogOpen}
            onOpenChange={subs.setSubmitDialogOpen}
            candidateName={subs.candidateToSubmit?.candidateName}
            form={subs.submitForm}
            onFormChange={subs.setSubmitForm}
            availableJobs={subs.availableJobs}
            submitting={subs.submitting}
            onSubmit={subs.handleSubmitCandidate}
          />
        </div>
      </div>
    </AppShell>
  );
}
