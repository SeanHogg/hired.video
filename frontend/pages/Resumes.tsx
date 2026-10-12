import { TABLE_SURFACE, TABLE_HEAD } from "@/lib/ui/table-surface";
import { publicResumePath } from "@shared/public-paths";
import {
  Star,
  Upload,
  Eye,
  CheckCircle2,
  Plus,
  Copy,
  Globe,
  Lock,
  Power,
  Pencil,
  Trash2,
} from "lucide-react";
import { Fragment, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import { AppShell } from "@/components/AppShell";
import MarketingFAQ from "@/components/MarketingFAQ";
import ResumesMarketing from "@/components/resumes/ResumesMarketing";
import { APP_PAGE_COLUMN } from "@/lib/ui/page-layout";
import ResumeEmptyDropzone from "@/components/ResumeEmptyDropzone";
import ResumeUploadSheet from "@/components/ResumeUploadSheet";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { ResumeActionsMenu } from "@/components/ResumeActionsMenu";
import { ToolHistorySheet } from "@/components/ToolHistorySheet";
import ResumeViewer from "@/components/ResumeViewer";
import ResumeCard from "@/components/ResumeCard";
import EntityHubShell, { type EntityHubTab } from "@/components/EntityHubShell";
import HeaderSearch from "@/components/HeaderSearch";
import EntityHubTabStrip from "@/components/EntityHubTabStrip";
import CandidatesPanel, {
  CandidatesHeaderActions,
} from "@/components/recruit/CandidatesPanel";
import AvailableResumesPanel from "@/components/resumes/AvailableResumesPanel";
import { useCurrentCompanyScope } from "@/hooks/use-current-company-scope";
import { RESUMES_HUB_DEFAULT_TAB, RESUMES_HUB_TABS } from "@/hooks/use-resumes-tabs";
import { useSearchQueryParam } from "@/hooks/use-search-query-param";
import ListsButton from "@/components/lists/ListsButton";
import AddToListMenu from "@/components/lists/AddToListMenu";
import { listsService } from "@/lib/services/lists-service";
import CreateVariationDialog from "@/components/CreateVariationDialog";
import MergeResumeDialog from "@/components/MergeResumeDialog";
import MetadataModal from "@/components/MetadataModal";
import RenameResumeDialog from "@/components/RenameResumeDialog";
import QRCodeDialog from "@/components/QRCodeDialog";
import ResumeAnalyticsDialog from "@/components/ResumeAnalyticsDialog";
import EntityVersionHistoryDialog from "@/components/EntityVersionHistoryDialog";
import type { SearchFilters } from "@/components/SearchBar";
import { useHeaderFilters } from "@/lib/header-filters";
import ViewModeToggle, { BROWSE_VIEW_MODES } from "@/components/ViewModeToggle";
import { useViewMode } from "@/lib/hooks/useViewMode";
import { HorizontalScroller } from "@/components/HorizontalScroller";
import Pagination, { usePagination } from "@/components/Pagination";
import { resumeService } from "@/lib/services/resume-service";
import { resumeEditorPath } from "@/lib/studio/resume-editor-link";
import { downloadResume } from "@/lib/resume-download";
import { useAuth } from "@/lib/auth";

import { formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type {
  Resume,
  UpdateResumeRequest,
  ResumeUploadResponse,
  ResumeWithOwnership,
} from "@/types/resume";
import type { MasterResumeGroup } from "@/lib/services/resume-service";
import { useOptimisticResumes } from "@/hooks/useOptimisticResumes";
import { notifyExtension } from "@/hooks/use-extension-bridge";
import {
  ResumePrivacy,
} from "@/types/resume";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Resumes() {
  const { t } = useTranslation();
  const location = useLocation();
  // SEO for resumes page
  useSEO(location.pathname);
  useBreadcrumbs([{ name: t("labels.resumes"), url: "/resumes" }]);
  const { isAuthenticated, user } = useAuth();
  // role-aware tab visibility lives entirely inside EntityHubShell now —
  // the page itself doesn't need to inspect the viewer's role.
  const { toast } = useToast();
  const { id } = useParams();
  const navigate = useNavigate();

  // State management
  const [view, setView] = useState<"list" | "viewer">("list");
  const [uploadSheetOpen, setUploadSheetOpen] = useState(false);
  const [selectedResume, setSelectedResume] = useState<Resume | null>(null);
  const [resumes, setResumes] = useState<ResumeWithOwnership[]>([]);
  const [masterResumeGroups, setMasterResumeGroups] = useState<MasterResumeGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // Optimistic updates
  const [optimisticState, optimisticActions] = useOptimisticResumes(resumes, masterResumeGroups);

  // Use optimistic state for rendering
  const displayResumes = optimisticState.resumes;

  // Master Resume System state — surfaces only on the My Resumes tab,
  // which the EntityHubShell descriptor gates to job_seeker.
  const [variationDialog, setVariationDialog] = useState<{
    isOpen: boolean;
    masterResumeId: string;
    masterResumeName: string;
  }>({
    isOpen: false,
    masterResumeId: "",
    masterResumeName: "",
  });

  // Confirmation shown when the user asks to create a variation from a
  // resume that is itself already a variant. The one-level hierarchy means
  // we must detach it from its current parent first.
  const [detachConfirm, setDetachConfirm] = useState<{
    open: boolean;
    target: ResumeWithOwnership | null;
    parentName: string;
  }>({ open: false, target: null, parentName: "" });
  const [searchParams] = useSearchParams();
  // 2-char threshold via the shared hook so single-keystroke ?q=A
  // doesn't fire /api/resumes/public. Header search owns the visible
  // input — this page only consumes the resolved filter.
  const { effective: urlQuery } = useSearchQueryParam();
  const urlPrivacy = searchParams.get("privacy") ?? "";
  const urlIsMaster = searchParams.get("isMaster") ?? "";

  useHeaderFilters([
    {
      key: "privacy",
      label: t("headings.privacy"),
      type: "select",
      options: [
        { value: "private", label: t("labels.privacy.private") },
        { value: "recruiter_only", label: t("labels.recruiterOnly") },
        { value: "public", label: t("labels.privacy.public") },
      ],
    },
    {
      key: "isMaster",
      label: t("labels.transactionType"),
      type: "select",
      options: [
        { value: "true", label: t("labels.master") },
        { value: "false", label: t("search.bar.resumeType.variation") },
      ],
    },
  ]);

  const [searchFilters, setSearchFilters] = useState<SearchFilters>(() => {
    const initial: SearchFilters = {};
    if (urlQuery) initial.search = urlQuery;
    if (urlPrivacy) initial.privacy = urlPrivacy;
    if (urlIsMaster) initial.isMaster = urlIsMaster === "true";
    return initial;
  });
  useEffect(() => {
    setSearchFilters((prev) => {
      const next: SearchFilters = { ...prev };
      next.search = urlQuery;
      next.privacy = urlPrivacy || undefined;
      next.isMaster = urlIsMaster ? urlIsMaster === "true" : undefined;
      return next;
    });
  }, [urlQuery, urlPrivacy, urlIsMaster]);
  const [viewMode, setViewMode] = useViewMode(
    "resumes.mine",
    "grid",
    BROWSE_VIEW_MODES,
  );
  // Lists filter — same pattern as People/Jobs.
  const listIdFromUrl = searchParams.get("list_id");
  const [listMembership, setListMembership] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (!listIdFromUrl) {
      setListMembership(null);
      return;
    }
    let cancelled = false;
    listsService
      .getItems(listIdFromUrl, "resume")
      .then((res) => {
        if (cancelled) return;
        setListMembership(new Set(res.items.map((i) => i.entityId)));
      })
      .catch(() => {
        if (cancelled) return;
        setListMembership(null);
      });
    return () => {
      cancelled = true;
    };
  }, [listIdFromUrl]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Delete confirmation dialog state
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; target: ResumeWithOwnership | null }>({
    open: false,
    target: null,
  });

  // Promote to Master confirmation dialog state
  const [promoteDialog, setPromoteDialog] = useState<{ open: boolean; target: ResumeWithOwnership | null; submitting: boolean }>({
    open: false,
    target: null,
    submitting: false,
  });

  // Merge dialog state
  const [mergeDialog, setMergeDialog] = useState<{
    isOpen: boolean;
    targetResumeId: string | null;
    preselectedSourceId?: string | null;
  }>({
    isOpen: false,
    targetResumeId: null,
    preselectedSourceId: null,
  });

  // Tool-history side panel — opened from the "..." menu *or* from a
  // clicked score chip on the card. The submenu itself routes the user
  // to each tool's full page so there is no in-page run dialog state to
  // track. `initialToolId` is set when the open is triggered by a chip
  // click so the panel pre-expands the relevant tool's accordion.
  const [toolHistory, setToolHistory] = useState<{
    open: boolean;
    resumeId?: string;
    resumeName?: string;
    initialToolId?: string | readonly string[];
  }>({ open: false });
  const openToolHistory = (
    resume: { id: string; title: string },
    initialToolId?: string | readonly string[],
  ) => setToolHistory({ open: true, resumeId: resume.id, resumeName: resume.title, initialToolId });

  // (ActionsModal removed — all views now use consistent ResumeActionsMenu dropdown)

  // Metadata modal state
  const [metadataModal, setMetadataModal] = useState<{
    open: boolean;
    resumeId: string | null;
    initialMetadata: any[];
  }>({
    open: false,
    resumeId: null,
    initialMetadata: [],
  });

  /** #154 — toggle to include archived rows. Persisted in URL search
   *  params so a refresh keeps the filter. */
  const [includeArchived, setIncludeArchived] = useState(false);

  /** #155 — version-history dialog state. Single dialog reused for the
   *  whole list. */
  const [versionHistoryFor, setVersionHistoryFor] = useState<{
    id: string;
    title: string;
  } | null>(null);

  // Consolidated fetch
  const getResumesForDisplay = async (): Promise<ResumeWithOwnership[]> => {
    try {
      return await resumeService.getResumesForDisplay({ includeArchived });
    } catch (error) {
      console.error("Error fetching resumes:", error);
      return [];
    }
  };

  useEffect(() => {
    if (id) {
      loadResumeById(id);
      return;
    }
    if (isAuthenticated) {
      loadResumes();
    }
    // includeArchived is in the dep list so toggling it re-fetches with
    // the new filter without a router-level navigation.
  }, [id, isAuthenticated, includeArchived]);

  // The Chrome extension's side panel can upload resumes into the same
  // account while this page is open. The extension's auth-bridge content
  // script forwards a window-level CustomEvent on successful upload —
  // listen for it here and re-fetch so the new row appears without the
  // user having to hit F5. No-op when the extension isn't installed.
  useEffect(() => {
    if (!isAuthenticated || id) return;
    const onExtensionEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.type === 'resume-changed') loadResumes();
    };
    window.addEventListener('hired.video:extension-event', onExtensionEvent);
    return () => window.removeEventListener('hired.video:extension-event', onExtensionEvent);
  }, [isAuthenticated, id]);

  const loadResumes = async (opts?: { notifyExtension?: boolean }) => {
    setLoading(true);
    setError(null);
    if (opts?.notifyExtension) notifyExtension("resume-changed");
    try {
      const [masterGroups, finalResumes] = await Promise.all([
        resumeService.getMasterResumeGroups(),
        getResumesForDisplay(),
      ]);

      setResumes(finalResumes);
      setMasterResumeGroups(masterGroups);

      // Update optimistic state with fresh data
      optimisticActions.updateState({
        resumes: finalResumes,
        masterGroups,
      });
    } catch (error) {
      console.error("Failed to load resumes:", error);
      setError(t("errors.resumes.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  const loadResumeById = async (resumeId: string) => {
    setLoading(true);
    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 500));
      // Fetch the full resume via the canonical endpoint rather than
      // fabricating a mock from summary metadata. The backend already
      // returns the clean Resume shape; the earlier fallback-mock here
      // predated the refactor and was lying about several fields.
      const fullResume = await resumeService.getResumeById(resumeId);
      setSelectedResume(fullResume);
      setView("viewer");
    } catch (error) {
      console.error("Failed to load resume:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadSuccess = (response: ResumeUploadResponse) => {
    // Open the uploaded resume in the kit workspace.
    navigate(resumeEditorPath(response.id));
  };

  const handleUpdateResume = (request: UpdateResumeRequest) => {
    setSuccessMessage(t("messages.resumeUpdatedSuccess"));
    setTimeout(() => setSuccessMessage(null), 5000);
  };

  const handleResumeView = (resumeId: string) => {
    navigate(publicResumePath(resumeId));
  };

  // Opens the create-variation flow for any resume. If the target is itself
  // a variant (parentId set) we first confirm detaching it from its current
  // parent, since the one-level hierarchy forbids grandchildren.
  const handleCreateVariation = (resumeId: string) => {
    const resume = displayResumes.find(r => r.id === resumeId);
    if (!resume) return;
    if (resume.parentId) {
      const parent = displayResumes.find(r => r.id === resume.parentId);
      setDetachConfirm({
        open: true,
        target: resume,
        parentName: parent?.title ?? t("labels.resumes.itsParent"),
      });
      return;
    }
    setVariationDialog({
      isOpen: true,
      masterResumeId: resumeId,
      masterResumeName: resume.title,
    });
  };

  // Confirm-path: detach the child, then open the variation dialog against it.
  const handleConfirmDetachAndCreateVariation = async () => {
    const target = detachConfirm.target;
    if (!target) return;
    try {
      await resumeService.detachFromParent(target.id);
      await loadResumes({ notifyExtension: true });
      setDetachConfirm({ open: false, target: null, parentName: "" });
      setVariationDialog({
        isOpen: true,
        masterResumeId: target.id,
        masterResumeName: target.title,
      });
    } catch (e) {
      toast({
        title: t("errors.detachFailedTitle"),
        description: (e as Error)?.message ?? t("errors.resumes.detachVariantFailed"),
        variant: "destructive",
      });
    }
  };

  // "Copy to Master" opens the merge dialog pre-filled so the user can push
  // content from a child variant back up into its parent.
  const handleCopyToMaster = (variant: ResumeWithOwnership) => {
    if (!variant.parentId) return;
    setMergeDialog({
      isOpen: true,
      targetResumeId: variant.parentId,
      preselectedSourceId: variant.id,
    });
  };

  const handleSetActiveResume = async (resumeId: string) => {
    // Optimistic update
    optimisticActions.setActiveOptimistic(resumeId);

    try {
      await resumeService.setActiveResume(resumeId);
      toast({
        title: t("labels.success"),
        description: t("messages.activeSetDescription"),
      });
      // Refresh data to ensure consistency
      loadResumes();
    } catch (error) {
      console.error("Error setting active resume:", error);
      // Revert optimistic update on error
      optimisticActions.revertOptimistic();
      toast({
        title: t("labels.error"),
        description: t("errors.resumes.setActiveFailed"),
        variant: "destructive",
      });
    }
  };

  const handleVariationCreated = () => {
    loadResumes();
  };

  const handleCloseVariationDialog = () => {
    setVariationDialog({
      isOpen: false,
      masterResumeId: "",
      masterResumeName: "",
    });
  };

  const handleChangePrivacy = async (resumeId: string, privacy: ResumePrivacy) => {
    if (!resumeId) return;

    // Pre-compute which owned resumes will be demoted due to exclusivity (Public, Recruiter Only, Connections)
    const demotedCandidates = displayResumes.filter(r => r.ownership === "owned" && r.id !== resumeId && (
      (privacy === "public" && r.privacy === "public") ||
      (privacy === "recruiter_only" && r.privacy === "recruiter_only") ||
      (privacy === "connections" && r.privacy === "connections")
    ));

    // Optimistic update
    optimisticActions.setPrivacyOptimistic(resumeId, privacy);

    try {
      const ok = await resumeService.setResumePrivacy(resumeId, privacy);
      if (!ok) throw new Error(t("errors.resumes.serverRejectedPrivacy"));

      toast({
        title: t("messages.privacyUpdated"),
        description: demotedCandidates.length > 0
          ? t("messages.resumes.demotedToPrivate", { count: demotedCandidates.length })
          : t("messages.visibilitySetTo", { privacy: privacy.replace("_", " ") }),
      });

      // Refresh from server to ensure consistency with backend rules
      await loadResumes({ notifyExtension: true });
    } catch (error) {
      console.error("Failed to update privacy", error);
      optimisticActions.revertOptimistic();
      toast({
        title: t("errors.privacyUpdateFailedTitle"),
        description: (error as Error)?.message || t("messages.pleaseTryAgain"),
        variant: "destructive",
      });
    }
  };

  const handleShare = (item: ResumeWithOwnership) => {
    const shareUrl = `${window.location.origin}${publicResumePath(item.id)}`;
    navigator.clipboard.writeText(shareUrl);
    setSuccessMessage(t("messages.resumeLinkCopied"));
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleCopyLink = async (item: ResumeWithOwnership) => {
    const shareUrl = `${window.location.origin}${publicResumePath(item.id)}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast({ title: t("messages.linkCopiedTitle"), description: shareUrl });
    } catch {
      toast({ title: t("errors.couldNotCopyTitle"), description: t("errors.couldNotCopyDesc"), variant: "destructive" });
    }
  };

  const [renameDialog, setRenameDialog] = useState<{ open: boolean; target: ResumeWithOwnership | null }>({
    open: false,
    target: null,
  });
  const [qrDialog, setQrDialog] = useState<{ open: boolean; target: ResumeWithOwnership | null }>({
    open: false,
    target: null,
  });
  const [analyticsDialog, setAnalyticsDialog] = useState<{ open: boolean; target: ResumeWithOwnership | null }>({
    open: false,
    target: null,
  });

  const handleDownload = async (item: ResumeWithOwnership, format: "pdf" | "word" | "json" | "text") => {
    try {
      await downloadResume({ id: item.id, format });
    } catch (error) {
      console.error("Failed to download resume:", error);
      toast({
        title: t("errors.downloadFailedTitle"),
        description: t("errors.downloadFailedDescription"),
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (item: ResumeWithOwnership) => {
    // Optimistic update: remove from UI immediately
    const prevResumes = [...resumes];
    const prevGroups = [...masterResumeGroups];
    const nextResumes = prevResumes.filter((r) => r.id !== item.id);

    // Update master groups: if a master was deleted, unparent its variations
    // (promote them to standalone groups) instead of dropping them.
    const nextGroups: typeof prevGroups = [];
    for (const g of prevGroups) {
      if (g.masterResume.id === item.id) {
        // Master deleted — each variation becomes its own standalone group
        for (const v of g.variations) {
          nextGroups.push({ masterResume: { ...v, isMaster: false, parentId: null }, variations: [] });
        }
      } else {
        // Not the deleted master — just filter the variation out if it was a variation delete
        nextGroups.push({
          ...g,
          variations: g.variations.filter((v) => v.id !== item.id),
        });
      }
    }

    setResumes(nextResumes);
    optimisticActions.updateState({ resumes: nextResumes, masterGroups: nextGroups });

    try {
      await resumeService.deleteResume(item.id);
      toast({ title: t("messages.deletedConfirmTitle"), description: t("messages.deletedConfirmDescription") });

      // If we deleted a master in collections view, reload groups from server
      await loadResumes({ notifyExtension: true });
    } catch (err) {
      console.error("Failed to delete resume", err);
      // Rollback optimistic change
      setResumes(prevResumes);
      optimisticActions.updateState({ resumes: prevResumes, masterGroups: prevGroups });

      // Friendly error message
      toast({
        title: t("errors.deleteFailedTitle"),
        description:
          (err as Error)?.message ||
          t("errors.resumes.deleteMasterWithVariations"),
        variant: "destructive",
      });
    }
  };

  const handleTrack = async (item: ResumeWithOwnership) => {
    if (user?.id && item.id) {
      try {
        // Check if resume is currently being watched (simplified check)
        const isWatched = (item as any).isWatched || false;

        if (isWatched) {
          await resumeService.unwatchResume(item.id);
          toast({
            title: t("labels.success"),
            description: t("messages.resumeRemovedTracking"),
          });
        } else {
          await resumeService.watchResume(item.id);
          toast({
            title: t("labels.success"),
            description: t("messages.resumeAddedTracking"),
          });
        }
      } catch (error) {
        console.error("Failed to toggle resume tracking:", error);
        toast({
          title: t("labels.error"),
          description: t("errors.failedToggleTracking"),
          variant: "destructive",
        });
      }
      // Refresh the resume list
      const refreshed = await resumeService.getResumesForDisplay();
      setResumes(refreshed);
    }
  };

  const handlePromoteToMaster = async (resumeId: string) => {
    try {
      const ok = await resumeService.promoteVariantToMaster(resumeId);
      if (ok) {
        toast({ title: t("messages.promotedTitle"), description: t("messages.promotedDescription") });
        await loadResumes({ notifyExtension: true });
      } else {
        toast({ title: t("errors.promoteFailedTitle"), description: t("errors.promoteFailedDescription"), variant: "destructive" });
      }
    } catch (e) {
      toast({ title: t("errors.promoteFailedTitle"), description: (e as Error)?.message ?? t("errors.unexpectedError"), variant: "destructive" });
    }
  };

  const handleAddMedia = async (resume: ResumeWithOwnership) => {
    try {
      // Get the full resume data to access metadata
      const fullResume = await resumeService.getResumeById(resume.id);
      setMetadataModal({
        open: true,
        resumeId: resume.id,
        initialMetadata: fullResume.content?.metaData || [],
      });
    } catch (error) {
      console.error("Failed to load resume metadata:", error);
      toast({
        title: t("labels.error"),
        description: t("errors.failedLoadResumeMetadata"),
        variant: "destructive",
      });
    }
  };

  const handleAddMediaById = async (resumeId: string) => {
    try {
      // Get the full resume data to access metadata
      const fullResume = await resumeService.getResumeById(resumeId);
      setMetadataModal({
        open: true,
        resumeId: resumeId,
        initialMetadata: fullResume.content?.metaData || [],
      });
    } catch (error) {
      console.error("Failed to load resume metadata:", error);
      toast({
        title: t("labels.error"),
        description: t("errors.failedLoadResumeMetadata"),
        variant: "destructive",
      });
    }
  };

  const handleSaveMetadata = async (metadata: any[]) => {
    if (!metadataModal.resumeId) return;

    try {
      await resumeService.updateResumeMetadata(metadataModal.resumeId, metadata);
      toast({
        title: t("labels.success"),
        description: t("messages.resumeMediaUpdated"),
      });
      // Refresh the resume list
      await loadResumes({ notifyExtension: true });
    } catch (error) {
      console.error("Failed to save metadata:", error);
      toast({
        title: t("labels.error"),
        description: t("errors.failedSaveMetadata"),
        variant: "destructive",
      });
      throw error; // Re-throw to prevent modal from closing
    }
  };

  const filteredResumes = displayResumes.filter((resume) => {
    const searchTerm = searchFilters.search || "";
    if (
      searchTerm &&
      !resume.title.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !resume.summary.toLowerCase().includes(searchTerm.toLowerCase())
    ) {
      return false;
    }
    if (searchFilters.privacy && resume.privacy !== searchFilters.privacy) {
      return false;
    }
    if (
      searchFilters.isMaster !== undefined &&
      resume.isMaster !== searchFilters.isMaster
    ) {
      return false;
    }
    // Apply the Lists filter on top of search/filter. Resumes not in the
    // selected list (?list_id=…) drop out — counts, sections, and pagination
    // all see the filtered set.
    if (listMembership && !listMembership.has(resume.id)) return false;
    return true;
  });

  // The `/api/resumes/withownership` backend never emits ownership: "tracked"
  // for resumes (only `owned`). The previous "Candidates" tab on /resumes that
  // filtered for tracked rows was permanently empty dead UI — removed in
  // favour of the new Sourced / Available tabs (gap #400 in README).
  // The legacy resume-tree grouping helper was only used by the dropped tree
  // view; variant relationships now flow through `childrenByParentId` below.
  const ownedResumes = filteredResumes.filter((r) => r.ownership === "owned");

  // Parent → children map used by each ResumeCard to render its variant
  // slider. We build it from the unfiltered displayResumes so a search
  // filter on the parent doesn't hide its variants inside the card.
  const childrenByParentId = (() => {
    const map = new Map<string, ResumeWithOwnership[]>();
    for (const r of displayResumes) {
      if (!r.parentId) continue;
      const list = map.get(r.parentId);
      if (list) list.push(r);
      else map.set(r.parentId, [r]);
    }
    return map;
  })();

  // id → name lookup so variant cards can label the parent they belong to
  // without every card re-searching the full list.
  const resumeNameById = new Map(displayResumes.map((r) => [r.id, r.title]));

  // Pagination logic
  const {
    currentPage,
    itemsPerPage,
    totalPages,
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

  const successAlert = successMessage ? (
    <Alert className="mb-6">
      <CheckCircle2 className="h-4 w-4" />
      <AlertDescription>{successMessage}</AlertDescription>
    </Alert>
  ) : null;

  // One card definition shared by the Scroll and Grid views so the full
  // handler wiring lives in a single place (Table renders its own dense
  // rows below).
  const renderResumeCard = (resume: (typeof paginatedOwnedResumes)[number]) => (
    <ResumeCard
      key={resume.id}
      id={resume.id}
      slug={resume.slug}
      userId={resume.userId}
      name={resume.title}
      title={resume.title}
      summary={resume.summary}
      createdAt={resume.createdAt}
      views={resume.viewCount}
      scores={resume.scores}
      sentimentScore={resume.sentimentScore}
      privacy={resume.privacy}
      isMaster={resume.isMaster}
      isActive={resume.isActive}
      parentId={resume.parentId}
      parentName={resume.parentId ? resumeNameById.get(resume.parentId) : undefined}
      diffPercent={resume.diffPercent}
      variations={childrenByParentId.get(resume.id)}
      ownership={resume.ownership}
      onView={() => handleResumeView(resume.id)}
      onEdit={() => navigate(resumeEditorPath(resume.id))}
      onRename={() => setRenameDialog({ open: true, target: resume })}
      onAddMedia={() => handleAddMedia(resume)}
      onCreateVariation={() => handleCreateVariation(resume.id)}
      onSetActive={() => handleSetActiveResume(resume.id)}
      onShare={() => handleShare(resume)}
      onCopyLink={() => handleCopyLink(resume)}
      onShowQR={() => setQrDialog({ open: true, target: resume })}
      onDownload={(format) => handleDownload(resume, format)}
      onChangePrivacy={(p) => handleChangePrivacy(resume.id, p)}
      onPromoteToMaster={() => handlePromoteToMaster(resume.id)}
      onCopyToMaster={resume.parentId ? () => handleCopyToMaster(resume) : undefined}
      onDelete={() => setTimeout(() => setDeleteDialog({ open: true, target: resume }), 0)}
      isArchived={!!resume.archivedAt}
      onArchive={async () => {
        await resumeService.archiveResume(resume.id);
        await loadResumes({ notifyExtension: true });
      }}
      onUnarchive={async () => {
        await resumeService.unarchiveResume(resume.id);
        await loadResumes({ notifyExtension: true });
      }}
      onViewVersionHistory={() => setVersionHistoryFor({ id: resume.id, title: resume.title })}
      onViewToolHistory={() => openToolHistory({ id: resume.id, title: resume.title })}
      onScoreClick={(toolIds) => openToolHistory({ id: resume.id, title: resume.title }, toolIds)}
      onViewAnalytics={() => setAnalyticsDialog({ open: true, target: resume })}
      extraMenuItems={
        <AddToListMenu
          entityType="resume"
          entityId={resume.id}
          entityLabel={resume.title}
        />
      }
    />
  );

  const renderMineBody = () => (
    <div className="space-y-6">
      {successAlert}

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
          <p className="text-muted-foreground mt-4">{t("messages.resumes.loading")}</p>
        </div>
      ) : ownedCount > 0 ? (
        <>
          <div className="space-y-8">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm text-muted-foreground">
                  {t("labels.resumes.count", { count: ownedCount })}
                </div>
              </div>
              {viewMode === "table" ? (
                <ResumeOwnedTable
                  resumes={paginatedOwnedResumes}
                  onView={(id) => handleResumeView(id)}
                  onEdit={(id) => navigate(resumeEditorPath(id))}
                  onDelete={(resume) =>
                    setTimeout(
                      () => setDeleteDialog({ open: true, target: resume }),
                      0,
                    )
                  }
                />
              ) : viewMode === "scroll" ? (
                <HorizontalScroller itemCount={paginatedOwnedResumes.length}>
                  {paginatedOwnedResumes.map((resume) => (
                    <Fragment key={resume.id}>
                      {renderResumeCard(resume)}
                    </Fragment>
                  ))}
                </HorizontalScroller>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                  {paginatedOwnedResumes.map((resume) => renderResumeCard(resume))}
                </div>
              )}
            </div>
          </div>
          <Pagination
            currentPage={currentPage}
            totalItems={ownedCount}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
            onItemsPerPageChange={handleItemsPerPageChange}
          />
        </>
      ) : (
        <ResumeEmptyDropzone
          title={
            searchFilters.search || Object.keys(searchFilters).length > 0
              ? t("headings.resumes.noMatching")
              : t("headings.resumes.noneYet")
          }
          description={
            searchFilters.search || Object.keys(searchFilters).length > 0
              ? t("messages.resumes.noMatchingDesc")
              : t("messages.resumes.emptyDropzoneDesc")
          }
          onUploadSuccess={handleUploadSuccess}
          onCreateResume={() => {
            // Resume creation now happens in the Studio document canvas
            // (#1912/#1915) — seed a resume document and open the editor.
            navigate("/studio?contentTemplate=resume-doc");
          }}
        />
      )}
    </div>
  );

  const mineActions = () => (
    <>
      <Button onClick={() => setUploadSheetOpen(true)} variant="outline">
        <Upload className="h-4 w-4 mr-2" />
        {t("actions.uploadResumeAction")}
      </Button>
      <Button onClick={() => navigate("/studio?contentTemplate=resume-doc")}>
        <Plus className="h-4 w-4 mr-2" />
        {t("headings.createResumeHeading")}
      </Button>
      <ViewModeToggle
        value={viewMode}
        onChange={setViewMode}
        modes={BROWSE_VIEW_MODES}
      />
      <ListsButton entityType="resume" />
      {/* #154 — Include archived. Off by default. Toggling refetches via
          the includeArchived useEffect dep. */}
      <Button
        variant={includeArchived ? "secondary" : "outline"}
        size="sm"
        onClick={() => setIncludeArchived((v) => !v)}
        title={t("messages.resumes.showArchivedTooltip")}
      >
        {includeArchived ? t("actions.resumes.hidingNone") : t("actions.resumes.includeArchived")}
      </Button>
    </>
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

  // Dialogs JSX — bound to a local so list-mode and builder/viewer mode
  // share a single render path. Radix dialogs are portal-rendered so
  // mounting them as siblings of the page chrome is fine.
  const dialogs = (
    <>
      {/* Delete Confirmation */}
      <AlertDialog
        open={deleteDialog.open}
        onOpenChange={(open) => {
          if (!open) setDeleteDialog({ open: false, target: null });
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("headings.resumes.deleteResumeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteDialog.target
                ? t("messages.resumes.deleteResumeConfirm", { name: deleteDialog.target.title })
                : t("messages.resumes.actionCannotBeUndone")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteDialog({ open: false, target: null })}>
              {t("actions.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={async () => {
                if (deleteDialog.target) {
                  await handleDelete(deleteDialog.target);
                }
              }}
            >
              {t("actions.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Promote to Master Confirmation */}
      <AlertDialog
        open={promoteDialog.open}
        onOpenChange={(open) => {
          if (!open && !promoteDialog.submitting)
            setPromoteDialog({ open: false, target: null, submitting: false });
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("headings.resumes.promoteToMasterTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {promoteDialog.target
                ? t("messages.resumes.promoteToMasterConfirm", { name: promoteDialog.target.title })
                : t("messages.resumes.promoteToMasterConfirmGeneric")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={promoteDialog.submitting}
              onClick={() => setPromoteDialog({ open: false, target: null, submitting: false })}
            >
              {t("actions.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!promoteDialog.target) return;
                const id = promoteDialog.target.id;
                setPromoteDialog({ open: false, target: null, submitting: false });
                (async () => {
                  try {
                    const ok = await resumeService.promoteVariantToMaster(id);
                    if (ok) {
                      toast({ title: t("messages.promotedTitle"), description: t("messages.resumes.variationPromotedNew") });
                      await loadResumes({ notifyExtension: true });
                    } else {
                      toast({ title: t("errors.promoteFailedTitle"), description: t("errors.promoteFailedDescription"), variant: "destructive" });
                    }
                  } catch (e) {
                    toast({ title: t("errors.promoteFailedTitle"), description: (e as Error)?.message ?? t("errors.unexpectedError"), variant: "destructive" });
                  }
                })();
              }}
            >
              {t("actions.promote")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Variation Dialog */}
      <CreateVariationDialog
        isOpen={variationDialog.isOpen}
        onClose={handleCloseVariationDialog}
        masterResumeId={variationDialog.masterResumeId}
        masterResumeName={variationDialog.masterResumeName}
        onVariationCreated={handleVariationCreated}
      />

      {/* Merge Resume Dialog */}
      <MergeResumeDialog
        isOpen={mergeDialog.isOpen}
        onClose={() => setMergeDialog({ isOpen: false, targetResumeId: null, preselectedSourceId: null })}
        resumes={displayResumes}
        preselectedTargetId={mergeDialog.targetResumeId}
        preselectedSourceId={mergeDialog.preselectedSourceId}
        onMergeComplete={async () => {
          const updated = await getResumesForDisplay();
          setResumes(updated);
          try {
            const groups = await resumeService.getMasterResumeGroups();
            setMasterResumeGroups(groups);
          } catch {}
        }}
      />

      {/* Detach confirmation — only variants trigger this, to enforce the
          one-level hierarchy when the user asks to create a variation from
          a resume that is itself already a variant. */}
      <AlertDialog
        open={detachConfirm.open}
        onOpenChange={(open) =>
          !open && setDetachConfirm({ open: false, target: null, parentName: "" })
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("headings.resumes.detachTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("messages.resumes.detachConfirm", {
                name: detachConfirm.target?.title ?? t("labels.resumes.thisResume"),
                parent: detachConfirm.parentName,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDetachAndCreateVariation}>
              {t("actions.resumes.detachAndContinue")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Metadata Modal */}
      <MetadataModal
        open={metadataModal.open}
        onOpenChange={(open) => setMetadataModal((prev) => ({ ...prev, open }))}
        resumeId={metadataModal.resumeId || ""}
        initialMetadata={metadataModal.initialMetadata}
        onSave={handleSaveMetadata}
      />

      {/* Upload Sheet — slide-out panel, replaces the standalone /resumes/upload page */}
      <ResumeUploadSheet
        open={uploadSheetOpen}
        onOpenChange={setUploadSheetOpen}
        onSuccess={handleUploadSuccess}
      />

      {/* Tool Run History side panel — opened from a resume's "..." menu. */}
      {toolHistory.resumeId && (
        <ToolHistorySheet
          open={toolHistory.open}
          onOpenChange={(open) => setToolHistory((prev) => ({ ...prev, open }))}
          source={{ kind: "entity", entityType: "resume", entityId: toolHistory.resumeId }}
          entityName={toolHistory.resumeName}
          initialToolId={toolHistory.initialToolId}
        />
      )}

      {renameDialog.target && (
        <RenameResumeDialog
          isOpen={renameDialog.open}
          onClose={() => setRenameDialog({ open: false, target: null })}
          resumeId={renameDialog.target.id}
          currentName={renameDialog.target.title}
          onRenamed={(newName) => {
            const targetId = renameDialog.target!.id;
            const nextResumes = resumes.map((r) => (r.id === targetId ? { ...r, title: newName } : r));
            const nextGroups = masterResumeGroups.map((g) => ({
              ...g,
              masterResume: g.masterResume?.id === targetId ? { ...g.masterResume, title: newName } : g.masterResume,
              variations: g.variations.map((v) => (v.id === targetId ? { ...v, title: newName } : v)),
            }));
            setResumes(nextResumes);
            setMasterResumeGroups(nextGroups);
            optimisticActions.updateState({ resumes: nextResumes, masterGroups: nextGroups });
          }}
        />
      )}

      {qrDialog.target && (
        <QRCodeDialog
          isOpen={qrDialog.open}
          onClose={() => setQrDialog({ open: false, target: null })}
          url={`${window.location.origin}${publicResumePath(qrDialog.target.id)}`}
          title={t("labels.resumes.qrCodeTitle", { name: qrDialog.target.title })}
          filename={`resume-${qrDialog.target.id}-qr`}
        />
      )}

      {analyticsDialog.target && (
        <ResumeAnalyticsDialog
          isOpen={analyticsDialog.open}
          onClose={() => setAnalyticsDialog({ open: false, target: null })}
          resumeId={analyticsDialog.target.id}
          resumeName={analyticsDialog.target.title}
        />
      )}

      {/* #155 — Version history. Single instance reused across rows so we
          don't carry one Dialog per card. Adapter wraps the REST endpoints
          defined in api/src/routes/resumes.ts and exposed via
          resumeService.{listVersions, createVersion, restoreVersion}. */}
      {versionHistoryFor && (
        <EntityVersionHistoryDialog
          open
          onOpenChange={(open) => {
            if (!open) setVersionHistoryFor(null);
          }}
          entityLabel={t("labels.resume")}
          canSnapshot
          adapter={{
            list: () => resumeService.listVersions(versionHistoryFor.id),
            snapshot: () => resumeService.createVersion(versionHistoryFor.id, {
              label: t("studio.versionHistory.manualSnapshot"),
              isAutosave: false,
            }),
            restore: async (vid) => {
              await resumeService.restoreVersion(versionHistoryFor.id, vid);
              await loadResumes({ notifyExtension: true });
            },
          }}
        />
      )}
    </>
  );

  // Viewer mode takes over the page; the list flips into shell mode. The
  // legacy in-page "builder" was removed — resume create/edit live in the
  // Studio document canvas now (#1915).
  if (view === "viewer") {
    return (
      <AppShell bgClassName="bg-background">
        <div className={APP_PAGE_COLUMN}>
          <div>
            {/* Keep the hub-level tab strip visible in viewer mode — the user
                is still "inside" the Resumes section. */}
            <EntityHubTabStrip entity="resume" />
            {successAlert}
            {view === "viewer" && selectedResume && (
              <div className="space-y-4 sm:space-y-6">
                <div className="flex items-center justify-between">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setView("list");
                      navigate("/resumes");
                    }}
                    className="min-h-[44px]"
                  >
                    {t("actions.backToResumesArrow")}
                  </Button>
                </div>
                <ResumeViewer
                  resume={selectedResume}
                  onUpdate={handleUpdateResume}
                  onCreateVariation={handleCreateVariation}
                  canEdit
                />
              </div>
            )}
          </div>
        </div>
        {dialogs}
      </AppShell>
    );
  }

  return (
    <>
      <EntityHubShell entity="resume" tabs={resumeTabs} defaultTab={RESUMES_HUB_DEFAULT_TAB} />
      {dialogs}
    </>
  );
}

/**
 * Dense Table view of the owner's resumes — the third browse layout
 * alongside Scroll and Grid. One row per resume with status badges,
 * privacy, view count, created date and View / Edit / Delete actions.
 * Pagination is owned by the parent (shared `<Pagination>` below), so
 * this renders exactly the rows it's handed.
 */
function ResumeOwnedTable({
  resumes,
  onView,
  onEdit,
  onDelete,
}: {
  resumes: ResumeWithOwnership[];
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (resume: ResumeWithOwnership) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={TABLE_SURFACE}>
      <table className="w-full text-left text-sm">
        <thead className={TABLE_HEAD}>
          <tr>
            <th className="px-3 py-2 font-medium">{t("labels.name", "Name")}</th>
            <th className="px-3 py-2 font-medium">{t("labels.status", "Status")}</th>
            <th className="px-3 py-2 font-medium">{t("labels.privacy", "Privacy")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("labels.views", "Views")}</th>
            <th className="px-3 py-2 font-medium">{t("labels.created", "Created")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("labels.actions", "Actions")}</th>
          </tr>
        </thead>
        <tbody>
          {resumes.map((resume) => {
            const isPublic = resume.privacy === "public";
            return (
              <tr
                key={resume.id}
                className="border-b border-border last:border-0 hover:bg-muted/30"
              >
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => onView(resume.id)}
                    className="font-medium hover:text-brand-primary"
                  >
                    {resume.title}
                  </button>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap items-center gap-1">
                    {resume.isMaster && (
                      <Badge variant="secondary" className="gap-1">
                        <Star className="h-3 w-3" />
                        {t("labels.resumes.master", "Master")}
                      </Badge>
                    )}
                    {resume.isActive && (
                      <Badge variant="outline" className="gap-1">
                        <Power className="h-3 w-3" />
                        {t("labels.resumes.active", "Active")}
                      </Badge>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    {isPublic ? (
                      <Globe className="h-3.5 w-3.5" />
                    ) : (
                      <Lock className="h-3.5 w-3.5" />
                    )}
                    {isPublic
                      ? t("labels.public", "Public")
                      : t("labels.private", "Private")}
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-muted-foreground">
                  {resume.viewCount ?? 0}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {formatDate(resume.createdAt)}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => onView(resume.id)}>
                      <Eye className="mr-1 h-3.5 w-3.5" />
                      {t("actions.view", "View")}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onEdit(resume.id)}>
                      <Pencil className="mr-1 h-3.5 w-3.5" />
                      {t("actions.edit", "Edit")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(resume)}
                      aria-label={t("actions.resumes.deleteNamed", { name: resume.title })}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
