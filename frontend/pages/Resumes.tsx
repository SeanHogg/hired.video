import { CheckCircle2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import ResumesMarketing from "@/components/resumes/ResumesMarketing";
import { Alert, AlertDescription } from "@/components/ui/alert";
import EntityHubShell, { type EntityHubTab } from "@/components/EntityHubShell";
import HeaderSearch from "@/components/HeaderSearch";
import CandidatesPanel, {
  CandidatesHeaderActions,
} from "@/components/recruit/CandidatesPanel";
import AvailableResumesPanel from "@/components/resumes/AvailableResumesPanel";
import { useCurrentCompanyScope } from "@/hooks/use-current-company-scope";
import { RESUMES_HUB_DEFAULT_TAB, RESUMES_HUB_TABS } from "@/hooks/use-resumes-tabs";
import { usePagination } from "@/components/Pagination";
import { useAuth } from "@/lib/auth";
import { useResumesData } from "@/components/resumes/hub/use-resumes-data";
import { useResumeFilters } from "@/components/resumes/hub/use-resume-filters";
import { useResumeDialogState } from "@/components/resumes/hub/use-resume-dialog-state";
import { useResumeActions } from "@/components/resumes/hub/use-resume-actions";
import { buildChildrenByParentId, filterResumes } from "@/components/resumes/hub/resume-list-helpers";
import ResumesDialogs from "@/components/resumes/hub/ResumesDialogs";
import ResumesMineBody, { CREATE_RESUME_PATH } from "@/components/resumes/hub/ResumesMineBody";
import ResumesMineActions from "@/components/resumes/hub/ResumesMineActions";
import ResumesViewerView from "@/components/resumes/hub/ResumesViewerView";

export default function Resumes() {
  const { t } = useTranslation();
  const location = useLocation();
  // SEO for resumes page
  useSEO(location.pathname);
  useBreadcrumbs([{ name: t("labels.resumes"), url: "/resumes" }]);
  const { isAuthenticated, user } = useAuth();
  // role-aware tab visibility lives entirely inside EntityHubShell now —
  // the page itself doesn't need to inspect the viewer's role.
  const { id } = useParams();
  const navigate = useNavigate();

  const data = useResumesData(id, isAuthenticated);
  const { view, setView, selectedResume, loading, displayResumes, includeArchived, setIncludeArchived } = data;

  // Sourced tab — lifted scope so the company picker + import buttons can
  // live in the EntityHubShell page header (next to the tab strip) while
  // CandidatesPanel below it reads the same companyId. The nonce kicks
  // the panel to refetch after the lifted import controls add a row.
  // Declared with the rest of the page-level hooks so the unauthenticated
  // early-return below doesn't make this conditional.
  const {
    scope: sourcedScope,
    companyId: sourcedCompanyId,
    setCompanyId: setSourcedCompanyId,
  } = useCurrentCompanyScope();
  const [sourcedRefreshNonce, setSourcedRefreshNonce] = useState(0);

  const { searchFilters, viewMode, setViewMode, listMembership } = useResumeFilters();
  const dialogs = useResumeDialogState();
  const actions = useResumeActions(data, dialogs);

  const filteredResumes = filterResumes(displayResumes, searchFilters, listMembership);

  // The `GET /api/resumes?owner=me&include=ownership` backend never emits
  // ownership: "tracked" for resumes (only `owned`) — see gap #400.
  const ownedResumes = filteredResumes.filter((r) => r.ownership === "owned");

  // Built from the unfiltered displayResumes so a search filter on the
  // parent doesn't hide its variants inside the card.
  const childrenByParentId = buildChildrenByParentId(displayResumes);

  // id → name lookup so variant cards can label the parent they belong to
  // without every card re-searching the full list.
  const resumeNameById = new Map(displayResumes.map((r) => [r.id, r.title]));

  // Pagination logic
  const {
    currentPage,
    itemsPerPage,
    startIndex,
    endIndex,
    setCurrentPage,
    handleItemsPerPageChange,
    handleTotalItemsChange,
  } = usePagination(filteredResumes.length, 12);

  // Update pagination when filtered resumes change
  useEffect(() => {
    handleTotalItemsChange(filteredResumes.length);
  }, [filteredResumes.length, handleTotalItemsChange]);

  // Get paginated resumes for grid view
  const paginatedResumes = filteredResumes.slice(startIndex, endIndex);

  // If user is not authenticated, show marketing page
  if (!isAuthenticated || !user) {
    return <ResumesMarketing />;
  }

  // Authenticated user resume management interface — driven by EntityHubShell
  // with three tab descriptors:
  //   - mine      (job_seeker)        — owned resumes with master/variations
  //   - available (recruiter/employer/admin) — public-resume discovery feed
  //   - sourced   (recruiter/employer/admin) — agency-owned candidate_resumes
  // SA gets the union via the SA-bypass in `visibleTo` (see persona.ts).

  const ownedCount = ownedResumes.length;
  const paginatedOwnedResumes = paginatedResumes.filter((r) => r.ownership === "owned");
  const openCreateResume = () => navigate(CREATE_RESUME_PATH);

  const successAlert = actions.successMessage ? (
    <Alert className="mb-6">
      <CheckCircle2 className="h-4 w-4" />
      <AlertDescription>{actions.successMessage}</AlertDescription>
    </Alert>
  ) : null;

  const renderMineBody = () => (
    <ResumesMineBody
      successAlert={successAlert}
      loading={loading}
      ownedCount={ownedCount}
      viewMode={viewMode}
      resumes={paginatedOwnedResumes}
      childrenByParentId={childrenByParentId}
      resumeNameById={resumeNameById}
      searchFilters={searchFilters}
      pagination={{ currentPage, itemsPerPage, setCurrentPage, handleItemsPerPageChange }}
      actions={actions}
      dialogs={dialogs}
      onCreateResume={openCreateResume}
    />
  );

  const mineActions = () => (
    <ResumesMineActions
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      includeArchived={includeArchived}
      onToggleArchived={() => setIncludeArchived((v) => !v)}
      onUpload={() => dialogs.setUploadSheetOpen(true)}
      onCreate={openCreateResume}
    />
  );

  // Per-tab body / actions / meta — joined onto the shared tab metadata
  // (RESUMES_HUB_TABS, the SSoT for key / label / icon / roles / route)
  // below. Keeping the join keyed by `key` means the strip on detail /
  // edit pages and the hub list page can never diverge on labels.
  const resumeTabBodies: Record<string, Omit<EntityHubTab, "key" | "label" | "icon" | "roles"> | undefined> = {
    mine: {
      search: <HeaderSearch />,
      title: t("headings.yourResumes"),
      description: t("messages.resumes.mineDescription"),
      headerActions: mineActions,
      body: renderMineBody,
    },
    available: {
      search: <HeaderSearch />,
      title: t("headings.resumes.availableTab"),
      description: t("messages.resumes.availableDescription"),
      body: <AvailableResumesPanel />,
    },
    sourced: {
      search: <HeaderSearch />,
      title: t("headings.resumes.sourcedTab"),
      description: t("messages.resumes.sourcedDescription"),
      headerActions: (
        <CandidatesHeaderActions
          scope={sourcedScope}
          companyId={sourcedCompanyId}
          onCompanyChange={setSourcedCompanyId}
          onImported={() => setSourcedRefreshNonce((n) => n + 1)}
        />
      ),
      body: (
        <CandidatesPanel
          hideHeaderControls
          scopeOverride={sourcedScope}
          companyIdOverride={sourcedCompanyId}
          refreshNonce={sourcedRefreshNonce}
        />
      ),
    },
  };
  const resumeTabs: EntityHubTab[] = RESUMES_HUB_TABS.map((meta) => {
    const body = resumeTabBodies[meta.key];
    if (!body) throw new Error(`Missing body for resume tab "${meta.key}"`);
    return { key: meta.key, label: meta.label, icon: meta.icon, roles: meta.roles, ...body };
  });

  const dialogsNode = (
    <ResumesDialogs dialogs={dialogs} actions={actions} displayResumes={displayResumes} />
  );

  if (view === "viewer") {
    return (
      <ResumesViewerView
        selectedResume={selectedResume}
        successAlert={successAlert}
        dialogs={dialogsNode}
        onBack={() => {
          setView("list");
          navigate("/resumes");
        }}
        onUpdate={actions.handleUpdateResume}
        onCreateVariation={actions.handleCreateVariation}
      />
    );
  }

  return (
    <>
      <EntityHubShell entity="resume" tabs={resumeTabs} defaultTab={RESUMES_HUB_DEFAULT_TAB} />
      {dialogsNode}
    </>
  );
}
