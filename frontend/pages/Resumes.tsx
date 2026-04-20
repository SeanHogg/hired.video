import {
  FileText,
  Video,
  Sparkles,
  ArrowRight,
  Star,
  Upload,
  Eye,
  BarChart3,
  Zap,
  CheckCircle2,
  Play,
  TrendingUp,
  Users,
  Plus,
  Search,
  Filter,
  Grid,
  List,
  Copy,
  ChevronDown,
  ChevronRight,
  Calendar,
  Globe,
  Lock,
  Target,
  Power,
} from "lucide-react";
import { useState, useEffect } from "react";
import { Link, useParams, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useSEO, useBreadcrumbs } from "@/lib/seo";
import Footer from "@/components/Footer";
import Navigation from "@/components/Navigation";
import MarketingFAQ from "@/components/MarketingFAQ";
import ResumeBuilder from "@/components/ResumeBuilder";
import ResumeUploadSheet from "@/components/ResumeUploadSheet";
import Sidebar from "@/components/Sidebar";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ResumeActionsMenu } from "@/components/ResumeActionsMenu";
import { ToolDialog } from "@/components/ToolDialog";
import { ToolHistorySheet } from "@/components/ToolHistorySheet";
import ResumeViewer from "@/components/ResumeViewer";
import ResumeCard from "@/components/ResumeCard";
import CreateVariationDialog from "@/components/CreateVariationDialog";
import MergeResumeDialog from "@/components/MergeResumeDialog";
import MetadataModal from "@/components/MetadataModal";
import RenameResumeDialog from "@/components/RenameResumeDialog";
import QRCodeDialog from "@/components/QRCodeDialog";
import ResumeAnalyticsDialog from "@/components/ResumeAnalyticsDialog";
import type { SearchFilters } from "@/components/SearchBar";
import SearchBar from "@/components/SearchBar";
import { useHeaderFilters } from "@/lib/header-filters";
import Pagination, { usePagination } from "@/components/Pagination";
import { resumeService } from "@/lib/services/resume-service";
import { downloadResume } from "@/lib/resume-download";
import { useSidebar } from "@/hooks/use-sidebar";
import { useAuth, USER_ROLES } from "@/lib/auth";
import { usePermissions } from "@/hooks/use-permissions";
import { generateResumeId, formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type {
  Resume,
  CreateResumeRequest,
  UpdateResumeRequest,
  ResumeUploadResponse,
  ResumeWithOwnership,
} from "@/types/resume";
import type { MasterResumeGroup } from "@/lib/services/resume-service";
import { useOptimisticResumes } from "@/hooks/useOptimisticResumes";
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

/**
 * Tell the hired.video Chrome extension's side panel that the resume
 * list has changed, so its Resume Manager re-fetches and doesn't show
 * stale rows after a delete/create/update done on the web. auth-bridge.js
 * (injected on hired.video by the extension) listens for this event and
 * forwards it through the service worker to the side panel.
 *
 * No-op when the extension isn't installed.
 */
function notifyExtensionOfResumeChange() {
  try {
    window.dispatchEvent(
      new CustomEvent("hired.video:notify-extension", {
        detail: { type: "resume-changed" },
      }),
    );
  } catch {
    // Some browsers restrict CustomEvent construction from user code —
    // soft-fail; the extension will reconcile on its next fetch.
  }
}

export default function Resumes() {
  const location = useLocation();
  const {
    sidebarOpen,
    sidebarCollapsed,
    openSidebar,
    closeSidebar,
    toggleSidebar,
  } = useSidebar();

  // SEO for resumes page
  useSEO(location.pathname);
  useBreadcrumbs([{ name: "Resumes", url: "/resumes" }]);
  const { isAuthenticated, user } = useAuth();
  const { effectiveRole, isJobSeeker: isEffectiveJobSeeker, isRecruiter: isEffectiveRecruiter, isEmployer: isEffectiveEmployer } = usePermissions();
  const { toast } = useToast();
  const { id } = useParams();
  const navigate = useNavigate();

  // State management
  const [view, setView] = useState<"list" | "builder" | "viewer">("list");
  const [uploadSheetOpen, setUploadSheetOpen] = useState(false);
  const [selectedResume, setSelectedResume] = useState<Resume | null>(null);
  const [resumes, setResumes] = useState<ResumeWithOwnership[]>([]);
  const [masterResumeGroups, setMasterResumeGroups] = useState<MasterResumeGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Optimistic updates
  const [optimisticState, optimisticActions] = useOptimisticResumes(resumes, masterResumeGroups);

  // Use optimistic state for rendering
  const displayResumes = optimisticState.resumes;
  const displayMasterGroups = optimisticState.masterGroups;

  // Master Resume System state - only applicable to Job Seekers
  const isJobSeeker = isEffectiveJobSeeker;
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
  const urlQuery = searchParams.get("q") ?? "";
  const urlPrivacy = searchParams.get("privacy") ?? "";
  const urlIsMaster = searchParams.get("isMaster") ?? "";

  useHeaderFilters([
    {
      key: "privacy",
      label: "Privacy",
      type: "select",
      options: [
        { value: "private", label: "Private" },
        { value: "recruiter_only", label: "Recruiter only" },
        { value: "public", label: "Public" },
      ],
    },
    {
      key: "isMaster",
      label: "Type",
      type: "select",
      options: [
        { value: "true", label: "Master" },
        { value: "false", label: "Variation" },
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
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [expandedMasters, setExpandedMasters] = useState<Set<string>>(
    new Set(),
  );

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

  // Run-Tool dialog state (opened from the resume "..." menu "Run Tool" submenu)
  const [toolDialog, setToolDialog] = useState<{ open: boolean; toolId: string | null; resumeId?: string; resumeName?: string }>({
    open: false,
    toolId: null,
  });
  const openRunTool = (toolId: string, resume: { id: string; title: string }) =>
    setToolDialog({ open: true, toolId, resumeId: resume.id, resumeName: resume.title });

  // Tool-history side panel — opened from the "..." menu.
  const [toolHistory, setToolHistory] = useState<{ open: boolean; resumeId?: string; resumeName?: string }>({ open: false });
  const openToolHistory = (resume: { id: string; title: string }) =>
    setToolHistory({ open: true, resumeId: resume.id, resumeName: resume.title });

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

  // Consolidated fetch
  const getResumesForDisplay = async (): Promise<ResumeWithOwnership[]> => {
    try {
      return await resumeService.getResumesForDisplay();
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
  }, [id, isAuthenticated]);

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
    if (opts?.notifyExtension) notifyExtensionOfResumeChange();
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
      setError("Failed to load resumes. Please try again.");
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
    // Navigate directly to edit mode after upload
    navigate(`/resumes/edit/${response.id}`);
  };

  const handleCreateResume = async (request: CreateResumeRequest) => {
    try {
      // Create via service; include slug if provided
      const created = await resumeService.createResume({
        name: request.title,
        data: request.content as any,
        privacy: request.privacy,
        isMaster: request.isMaster,
        isActive: request.isActive,
      });

      // If a slug was provided, update it using the edit flow to apply slug post-create
      if (request.slug && created?.id) {
        await resumeService.updateResumeData(created.id, { data: request.content as any, slug: request.slug });
      }

      setSuccessMessage("Resume created successfully!");
      setView("list");
      loadResumes({ notifyExtension: true });
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (e) {
      console.error("Failed to create resume", e);
      setSuccessMessage("Failed to create resume");
      setTimeout(() => setSuccessMessage(null), 5000);
    }
  };

  const handleUpdateResume = (request: UpdateResumeRequest) => {
    setSuccessMessage("Resume updated successfully!");
    setTimeout(() => setSuccessMessage(null), 5000);
  };

  const handleResumeView = (resumeId: string) => {
    navigate(`/resumes/${resumeId}`);
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
        parentName: parent?.title ?? "its parent",
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
        title: "Detach failed",
        description: (e as Error)?.message ?? "Could not detach variant from its parent.",
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

  // Master Resume System handlers
  const handleSetMasterResume = async (resumeId: string) => {
    try {
      await resumeService.setMasterResume(resumeId);
      toast({
        title: "Success",
        description: "Master resume set successfully!",
      });
      loadResumes();
    } catch (error) {
      console.error("Error setting master resume:", error);
      toast({
        title: "Error",
        description: "Failed to set master resume. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleSetActiveResume = async (resumeId: string) => {
    // Optimistic update
    optimisticActions.setActiveOptimistic(resumeId);

    try {
      await resumeService.setActiveResume(resumeId);
      toast({
        title: "Success",
        description: "Active resume set successfully!",
      });
      // Refresh data to ensure consistency
      loadResumes();
    } catch (error) {
      console.error("Error setting active resume:", error);
      // Revert optimistic update on error
      optimisticActions.revertOptimistic();
      toast({
        title: "Error",
        description: "Failed to set active resume. Please try again.",
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
      if (!ok) throw new Error("Server rejected privacy change");

      toast({
        title: "Privacy updated",
        description: demotedCandidates.length > 0
          ? `${demotedCandidates.length} resume${demotedCandidates.length === 1 ? "" : "s"} set to Private due to exclusivity.`
          : `Visibility set to ${privacy.replace("_", " ")}.`,
      });

      // Refresh from server to ensure consistency with backend rules
      await loadResumes({ notifyExtension: true });
    } catch (error) {
      console.error("Failed to update privacy", error);
      optimisticActions.revertOptimistic();
      toast({
        title: "Failed to update privacy",
        description: (error as Error)?.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleShare = (item: ResumeWithOwnership) => {
    const shareUrl = `${window.location.origin}/resumes/${item.id}`;
    navigator.clipboard.writeText(shareUrl);
    setSuccessMessage("Resume link copied to clipboard!");
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleCopyLink = async (item: ResumeWithOwnership) => {
    const shareUrl = `${window.location.origin}/resumes/${item.id}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast({ title: "Link copied", description: shareUrl });
    } catch {
      toast({ title: "Could not copy", description: "Clipboard access denied.", variant: "destructive" });
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

  const handleEdit = (item: ResumeWithOwnership) => {
    navigate(`/resumes/${item.id}`);
  };

  const handleDownload = async (item: ResumeWithOwnership, format: "pdf" | "word" | "json" | "text") => {
    try {
      await downloadResume({ id: item.id, format });
    } catch (error) {
      console.error("Failed to download resume:", error);
      toast({
        title: "Download failed",
        description: "Could not load resume content.",
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
      toast({ title: "Deleted", description: "Resume deleted successfully." });

      // If we deleted a master in collections view, reload groups from server
      await loadResumes({ notifyExtension: true });
    } catch (err) {
      console.error("Failed to delete resume", err);
      // Rollback optimistic change
      setResumes(prevResumes);
      optimisticActions.updateState({ resumes: prevResumes, masterGroups: prevGroups });

      // Friendly error message
      toast({
        title: "Delete failed",
        description:
          (err as Error)?.message ||
          "Could not delete resume. If this is a master with variations, delete variations first.",
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
            title: "Success",
            description: "Resume removed from tracking list!",
          });
        } else {
          await resumeService.watchResume(item.id);
          toast({
            title: "Success",
            description: "Resume added to tracking list!",
          });
        }
      } catch (error) {
        console.error("Failed to toggle resume tracking:", error);
        toast({
          title: "Error",
          description: "Failed to update tracking status",
          variant: "destructive",
        });
      }
      // Refresh the resume list
      const refreshed = await resumeService.getResumesForDisplay();
      setResumes(refreshed);
    }
  };

  const handleSetActive = (resumeId: string) => {
    // Set the selected resume as active and all others as inactive
    const updatedResumes = resumes.map((resume) => ({
      ...resume,
      isActive: resume.id === resumeId,
    }));
    setResumes(updatedResumes);
    setSuccessMessage("Resume set as active!");
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handlePromoteToMaster = async (resumeId: string) => {
    try {
      const ok = await resumeService.promoteVariantToMaster(resumeId);
      if (ok) {
        toast({ title: "Promoted", description: "Variant promoted to master." });
        await loadResumes({ notifyExtension: true });
      } else {
        toast({ title: "Promote failed", description: "Could not promote variant to master.", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Promote failed", description: (e as Error)?.message ?? "Unexpected error", variant: "destructive" });
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
        title: "Error",
        description: "Failed to load resume data",
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
        title: "Error",
        description: "Failed to load resume data",
        variant: "destructive",
      });
    }
  };

  const handleSaveMetadata = async (metadata: any[]) => {
    if (!metadataModal.resumeId) return;

    try {
      await resumeService.updateResumeMetadata(metadataModal.resumeId, metadata);
      toast({
        title: "Success",
        description: "Resume media updated successfully!",
      });
      // Refresh the resume list
      await loadResumes({ notifyExtension: true });
    } catch (error) {
      console.error("Failed to save metadata:", error);
      toast({
        title: "Error",
        description: "Failed to save resume media",
        variant: "destructive",
      });
      throw error; // Re-throw to prevent modal from closing
    }
  };

  const getActiveResume = () => {
    // First check in the regular resumes array
    const activeFromResumes = resumes.find(
      (resume) => resume.isActive && resume.ownership === "owned",
    );

    if (activeFromResumes) {
      return activeFromResumes;
    }

    // Also check in master resume groups
    for (const group of masterResumeGroups) {
      if (group.masterResume.isActive) {
        // Convert the master resume to the expected format
        return {
          id: group.masterResume.id || "",
          title: group.masterResume.title || "",
          isActive: group.masterResume.isActive || false,
          ownership: "owned" as const,
        };
      }

      // Check variations too
      const activeVariation = group.variations.find(v => v.isActive);
      if (activeVariation) {
        return {
          id: activeVariation.id || "",
          title: activeVariation.title || "",
          isActive: activeVariation.isActive || false,
          ownership: "owned" as const,
        };
      }
    }

    return undefined;
  };

  const handleSearch = (query: string) => {
    setSearchFilters((prev) => ({ ...prev, search: query }));
  };

  const handleFilterChange = (filters: SearchFilters) => {
    setSearchFilters(filters);
  };

  const handleClearFilters = () => {
    setSearchFilters({});
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
    return true;
  });

  // Group resumes by master/child relationship for tree view
  const getResumeTree = () => {
    const masterResumes = filteredResumes.filter(
      (resume) => resume.isMaster || !resume.parentId,
    );
    const variations = filteredResumes.filter(
      (resume) => !resume.isMaster && resume.parentId,
    );

    return masterResumes.map((master) => ({
      ...master,
      children: variations.filter(
        (variation) => variation.parentId === master.id,
      ),
    }));
  };

  const ownedResumes = filteredResumes.filter((r) => r.ownership === "owned");
  const trackedResumes = filteredResumes.filter(
    (r) => r.ownership === "tracked",
  );

  const resumeTree = getResumeTree();

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

  // Get paginated resume tree for list view
  const paginatedResumeTree = resumeTree.slice(startIndex, endIndex);

  const toggleMasterExpansion = (masterId: string) => {
    const newExpanded = new Set(expandedMasters);
    if (newExpanded.has(masterId)) {
      newExpanded.delete(masterId);
    } else {
      newExpanded.add(masterId);
    }
    setExpandedMasters(newExpanded);
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
                    <FileText className="h-12 w-12 text-primary" />
                    <Video className="h-6 w-6 text-brand-blue absolute -top-1 -right-1" />
                  </div>
                  <span className="text-4xl font-bold bg-gradient-to-r from-brand-purple to-brand-blue bg-clip-text text-transparent">
                    Video Resumes
                  </span>
                </div>
                <h1 className="text-5xl font-bold mb-6">
                  Transform Your Resume into a Powerful Video Story
                </h1>
                <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
                  Stand out from the crowd with AI-powered video resumes that
                  showcase your personality, skills, and experience in ways
                  traditional resumes never could.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  {isAuthenticated ? (
                    <Link to="/resumes/upload/video">
                      <Button
                        size="lg"
                        className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8"
                      >
                        Create Your Video Resume
                        <ArrowRight className="ml-2 h-5 w-5" />
                      </Button>
                    </Link>
                  ) : (
                    <Link to="/signup">
                      <Button
                        size="lg"
                        className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90 text-lg px-8"
                      >
                        Create Your Video Resume
                        <ArrowRight className="ml-2 h-5 w-5" />
                      </Button>
                    </Link>
                  )}
                  <Button size="lg" variant="outline" className="text-lg px-8">
                    <Play className="mr-2 h-5 w-5" />
                    Watch Demo
                  </Button>
                </div>
              </div>

              {/* Stats Section */}
              <div className="grid md:grid-cols-4 gap-6 mb-16">
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">3x</div>
                  <p className="text-sm text-muted-foreground">
                    More likely to get interviews
                  </p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">
                    85%
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Higher response rate
                  </p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">
                    2 min
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Average creation time
                  </p>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary mb-2">
                    500K+
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Video resumes created
                  </p>
                </div>
              </div>

              {/* Features Grid */}
              <div className="mb-16">
                <h2 className="text-3xl font-bold text-center mb-12">
                  Everything You Need to Succeed
                </h2>
                <div className="grid md:grid-cols-3 gap-8">
                  <Card className="border-brand-purple/20 hover:border-brand-purple/40 transition-colors">
                    <CardHeader>
                      <Zap className="h-10 w-10 text-brand-purple mb-4" />
                      <CardTitle>AI-Powered Creation</CardTitle>
                      <CardDescription>
                        Our AI analyzes your resume and creates compelling video
                        scripts tailored to your industry and experience level.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Smart script generation
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Industry-specific templates
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Personal branding tips
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-brand-blue/20 hover:border-brand-blue/40 transition-colors">
                    <CardHeader>
                      <BarChart3 className="h-10 w-10 text-brand-blue mb-4" />
                      <CardTitle>Performance Analytics</CardTitle>
                      <CardDescription>
                        Track how your video resume performs with detailed
                        analytics on views, engagement, and recruiter interest.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          View tracking & heatmaps
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Engagement metrics
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Recruiter insights
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-primary/20 hover:border-primary/40 transition-colors">
                    <CardHeader>
                      <Users className="h-10 w-10 text-primary mb-4" />
                      <CardTitle>Professional Network</CardTitle>
                      <CardDescription>
                        Connect directly with hiring managers and recruiters who
                        are actively looking for candidates like you.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Direct recruiter access
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Smart job matching
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          Interview scheduling
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* How It Works */}
              <div className="mb-16">
                <h2 className="text-3xl font-bold text-center mb-12">
                  How It Works
                </h2>
                <div className="grid md:grid-cols-4 gap-8">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Upload className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="font-semibold mb-2">1. Upload Resume</h3>
                    <p className="text-sm text-muted-foreground">
                      Upload your resume or select your existing Master Resume
                    </p>
                  </div>
                  <div className="text-center">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Sparkles className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="font-semibold mb-2">2. AI Magic</h3>
                    <p className="text-sm text-muted-foreground">
                      Our AI generates a compelling video script tailored to you
                    </p>
                  </div>
                  <div className="text-center">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Eye className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="font-semibold mb-2">3. Review Video</h3>
                    <p className="text-sm text-muted-foreground">
                      Preview and refine your video before sharing
                    </p>
                  </div>
                  <div className="text-center">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <TrendingUp className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="font-semibold mb-2">4. Get Hired</h3>
                    <p className="text-sm text-muted-foreground">
                      Share with employers and track your success
                    </p>
                  </div>
                </div>
              </div>

              {/* Success Stories */}
              <div className="mb-16">
                <h2 className="text-3xl font-bold text-center mb-12">
                  Success Stories
                </h2>
                <div className="grid md:grid-cols-3 gap-8">
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center mb-4">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className="h-4 w-4 fill-yellow-400 text-yellow-400"
                          />
                        ))}
                      </div>
                      <p className="text-sm mb-4">
                        "I got 5 interview requests within a week of posting my
                        video resume. The AI script was spot-on and helped me
                        highlight my strengths perfectly."
                      </p>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-r from-brand-purple to-brand-blue rounded-full" />
                        <div>
                          <p className="font-medium text-sm">Sarah Chen</p>
                          <p className="text-xs text-muted-foreground">
                            Software Engineer
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center mb-4">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className="h-4 w-4 fill-yellow-400 text-yellow-400"
                          />
                        ))}
                      </div>
                      <p className="text-sm mb-4">
                        "As a career changer, I struggled to explain my
                        transition. The video resume helped me tell my story in
                        a way that resonated with employers."
                      </p>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-r from-brand-blue to-brand-purple rounded-full" />
                        <div>
                          <p className="font-medium text-sm">
                            Michael Rodriguez
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Marketing Manager
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center mb-4">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className="h-4 w-4 fill-yellow-400 text-yellow-400"
                          />
                        ))}
                      </div>
                      <p className="text-sm mb-4">
                        "Landed my dream job at a Fortune 500 company! The video
                        resume made me stand out from hundreds of other
                        applicants."
                      </p>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-r from-brand-purple to-brand-blue rounded-full" />
                        <div>
                          <p className="font-medium text-sm">Emma Johnson</p>
                          <p className="text-xs text-muted-foreground">
                            Product Designer
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

            </div>

            {/* FAQ */}
            <MarketingFAQ
              schemaId="resumes"
              subheading="Everything people ask before building their first video resume on hired.video."
              items={[
                {
                  question: "What is a video resume?",
                  answer:
                    "A video resume is a short 30–90 second video in which you introduce yourself, explain your experience, and make a case for why you're a great fit. On hired.video, AI can generate a polished video resume directly from your existing written resume — you don't need a camera or editing skills.",
                },
                {
                  question: "Do I still need a traditional resume?",
                  answer:
                    "Yes. Most applications still require a text resume (for ATS parsing), so hired.video lets you build both: an ATS-friendly written resume and an AI-generated video resume that pairs with it. Many members share the video via a link on their written resume and LinkedIn profile.",
                },
                {
                  question: "How long should my video resume be?",
                  answer:
                    "We recommend 30–90 seconds. Long enough to make a real impression, short enough that recruiters actually watch it all the way through. Our AI scripts are tuned to this length by default.",
                },
                {
                  question: "Can I edit my video resume after creating it?",
                  answer:
                    "Yes. You can edit the script, swap scenes, change the theme, re-record any section, or regenerate the whole video with a new angle. Every video is saved as a project you can come back to any time.",
                },
                {
                  question: "Is my video resume private?",
                  answer:
                    "Every video is private by default. You choose when to publish it, and you can pick public (indexed, shareable link), unlisted (link only), or private (just you). You can revoke a share link any time.",
                },
                {
                  question: "How do recruiters find my video resume?",
                  answer:
                    "If you publish your video publicly, it appears in the hired.video resume gallery and can be surfaced by our AI matching engine when recruiters search for candidates. You can also share your personal link directly on LinkedIn, email signatures, and written resumes.",
                },
                {
                  question: "Does hired.video work with ATS systems?",
                  answer:
                    "Yes. Written resumes built on hired.video export to clean, ATS-parseable PDFs (or .docx) that work with Workday, Greenhouse, Lever, Taleo, iCIMS, and most other ATS platforms. Our resume optimizer also flags wording or structure issues that commonly break ATS parsing.",
                },
                {
                  question: "What does a video resume cost?",
                  answer:
                    "Your first video resume is free. Paid plans unlock unlimited video generations, advanced themes, voiceover cloning, video analytics, and removing the hired.video watermark. See the pricing page for current tiers.",
                },
              ]}
            />

            {/* Final CTA */}
            <div className="max-w-4xl mx-auto px-4 pb-16">
              <div className="text-center bg-gradient-to-r from-brand-purple/10 to-brand-blue/10 p-10 rounded-2xl">
                <h3 className="text-3xl font-bold mb-4">
                  Ready to Create Your Video Resume?
                </h3>
                <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
                  Join thousands of professionals who have transformed their
                  careers with video resumes. Free to start.
                </p>
                {isAuthenticated ? (
                  <Link to="/resumes/upload/video">
                    <Button
                      size="lg"
                      className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90"
                    >
                      Get Started Today
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                ) : (
                  <Link to="/signup">
                    <Button
                      size="lg"
                      className="bg-gradient-to-r from-brand-purple to-brand-blue hover:opacity-90"
                    >
                      Get Started Today
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                )}
              </div>
            </div>
            <Footer />
          </div>
        </div>
      </div>
    );
  }

  // Authenticated user resume management interface
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
          <div className="max-w-7xl mx-auto">
            {/* Success Message */}
            {successMessage && (
              <Alert className="mb-6">
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>{successMessage}</AlertDescription>
              </Alert>
            )}

            {/* Builder View */}
            {view === "builder" && (
              <div className="space-y-4 sm:space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <h1 className="text-2xl sm:text-3xl font-bold">Create Resume</h1>
                  <Button variant="outline" onClick={() => setView("list")} className="w-full sm:w-auto min-h-[44px]">
                    Back to Resumes
                  </Button>
                </div>
                <ResumeBuilder
                  onSave={handleCreateResume}
                  onCancel={() => setView("list")}
                />
              </div>
            )}

            {/* Viewer View */}
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
                    ← Back to Resumes
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

            {/* List View */}
            {view === "list" && (
              <div className="space-y-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <h1 className="text-3xl font-bold">Your Resumes</h1>
                    <div className="flex items-center gap-2">
                      <p className="text-muted-foreground">
                        Manage and track your resumes.
                      </p>
                      {getActiveResume() && (
                        <Badge
                          variant="secondary"
                          className="bg-green-100 text-green-800"
                        >
                          <Target className="w-3 h-3 mr-1" />
                          Active: {getActiveResume()?.title}
                        </Badge>
                      )}
                      {!loading && !getActiveResume() && isJobSeeker && (
                        <Badge
                          variant="outline"
                          className="text-orange-600 border-orange-200"
                        >
                          No active resume
                        </Badge>
                      )}
                      {(isEffectiveRecruiter || isEffectiveEmployer) && (
                        <Badge
                          variant="outline"
                          className="text-blue-600 border-blue-200"
                        >
                          {isEffectiveRecruiter
                            ? "recruiter"
                            : "employer"}{" "}
                          • Tracking{" "}
                          {
                            resumes.filter((r) => r.ownership === "tracked")
                              .length
                          }{" "}
                          resumes
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => setUploadSheetOpen(true)}
                      variant="outline"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Resume
                    </Button>
                    <Button
                      onClick={() => {
                        const newId = generateResumeId();
                        navigate(`/resumes/create/${newId}`);
                      }}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Create Resume
                    </Button>

                    {/* Grid/List toggle lives alongside the primary actions so
                        it's always visible at the top right, not hidden in the
                        search strip. */}
                    <div className="flex items-center border rounded-md ml-1">
                      <Button
                        variant={viewMode === "grid" ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setViewMode("grid")}
                        className="rounded-r-none"
                      >
                        <Grid className="h-4 w-4" />
                      </Button>
                      <Button
                        variant={viewMode === "list" ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setViewMode("list")}
                        className="rounded-l-none"
                      >
                        <List className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Search/Filter strip — view toggle now lives in the header
                    action row alongside Create Resume. */}
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <SearchBar
                      context="resumes"
                      value={searchFilters.search}
                      filters={searchFilters}
                      onSearch={handleSearch}
                      onFilterChange={handleFilterChange}
                      onClearFilters={handleClearFilters}
                      hideSearchInput
                      hideFilters
                    />
                  </div>
                </div>

                {loading ? (
                  <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
                    <p className="text-muted-foreground mt-4">
                      Loading resumes...
                    </p>
                  </div>
                ) : filteredResumes.length > 0 ? (
                  <>
                  <div className="space-y-8">
                    {/* My Resumes Section. Masters, standalone resumes, and
                        variants all render side-by-side as ResumeCard items.
                        Parent cards embed a variant slider inside. */}
                    {filteredResumes.filter(r => r.ownership === "owned").length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <h2 className="text-xl font-semibold">My Resumes</h2>
                          <div className="text-sm text-muted-foreground">
                            {filteredResumes.filter(r => r.ownership === "owned").length} resume{filteredResumes.filter(r => r.ownership === "owned").length !== 1 ? 's' : ''}
                          </div>
                        </div>

                        <div
                          className={
                            viewMode === "grid"
                              ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6"
                              : "space-y-4"
                          }
                        >
                          {paginatedResumes.filter(r => r.ownership === "owned").map((resume) => (
                            <ResumeCard
                              key={resume.id}
                              id={resume.id}
                              slug={resume.slug}
                              name={resume.title}
                              title={resume.title}
                              summary={resume.summary}
                              createdAt={resume.createdAt}
                              views={resume.viewCount}
                              privacy={resume.privacy}
                              isMaster={resume.isMaster}
                              isActive={resume.isActive}
                              parentId={resume.parentId}
                              parentName={resume.parentId ? resumeNameById.get(resume.parentId) : undefined}
                              diffPercent={resume.diffPercent}
                              variations={childrenByParentId.get(resume.id)}
                              ownership={resume.ownership}
                              onView={() => handleResumeView(resume.id)}
                              onEdit={() => navigate(`/resumes/edit/${resume.id}`)}
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
                              onRunTool={(toolId) => openRunTool(toolId, { id: resume.id, title: resume.title })}
                              onViewToolHistory={() => openToolHistory({ id: resume.id, title: resume.title })}
                              onViewAnalytics={() => setAnalyticsDialog({ open: true, target: resume })}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Tracked Resumes Section */}
                    {filteredResumes.filter(r => r.ownership === "tracked").length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <h2 className="text-xl font-semibold">Tracked Resumes</h2>
                          <div className="text-sm text-muted-foreground">
                            {filteredResumes.filter(r => r.ownership === "tracked").length} resume{filteredResumes.filter(r => r.ownership === "tracked").length !== 1 ? 's' : ''}
                          </div>
                        </div>

                        <div
                          className={
                            viewMode === "grid"
                              ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6"
                              : "space-y-4"
                          }
                        >
                          {paginatedResumes.filter(r => r.ownership === "tracked").map((resume) => (
                            <ResumeCard
                              key={resume.id}
                              id={resume.id}
                              slug={resume.slug}
                              name={resume.title}
                              title={resume.title}
                              summary={resume.summary}
                              createdAt={resume.createdAt}
                              views={resume.viewCount}
                              privacy={resume.privacy}
                              isMaster={resume.isMaster}
                              isActive={resume.isActive}
                              parentId={resume.parentId}
                              parentName={resume.parentId ? resumeNameById.get(resume.parentId) : undefined}
                              diffPercent={resume.diffPercent}
                              ownership={resume.ownership}
                              onView={() => handleResumeView(resume.id)}
                              onShare={() => handleShare(resume)}
                              onCopyLink={() => handleCopyLink(resume)}
                              onShowQR={() => setQrDialog({ open: true, target: resume })}
                              onTrack={() => handleTrack(resume)}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Pagination */}
                  <Pagination
                    currentPage={currentPage}
                    totalItems={filteredResumes.length}
                    itemsPerPage={itemsPerPage}
                    onPageChange={setCurrentPage}
                    onItemsPerPageChange={handleItemsPerPageChange}
                  />
                  </>
                ) : (
                  <Card>
                    <CardContent className="p-12 text-center">
                      <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="text-lg font-semibold mb-2">
                        {searchFilters.search ||
                        Object.keys(searchFilters).length > 0
                          ? "No matching resumes"
                          : "No resumes yet"}
                      </h3>
                      <p className="text-muted-foreground mb-6">
                        {searchFilters.search ||
                        Object.keys(searchFilters).length > 0
                          ? "Try adjusting your search criteria or filters"
                          : "Create your first resume to get started"}
                      </p>
                      <div className="flex gap-2 justify-center">
                        <Button
                          onClick={() => setUploadSheetOpen(true)}
                          variant="outline"
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          Upload Resume
                        </Button>
                        <Button
                          onClick={() => {
                            const newId = generateResumeId();
                            navigate(`/resumes/create/${newId}`);
                          }}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Create Resume
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        </div>
        <Footer />
      </div>

      {/* ActionsModal removed — all views now use consistent ResumeActionsMenu dropdown */}

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => {
        if (!open) setDeleteDialog({ open: false, target: null });
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete resume?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteDialog.target ? `Are you sure you want to delete “${deleteDialog.target.title}”? This action cannot be undone.` : "This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteDialog({ open: false, target: null })}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={async () => {
                if (deleteDialog.target) {
                  await handleDelete(deleteDialog.target);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Promote to Master Confirmation */}
      <AlertDialog open={promoteDialog.open} onOpenChange={(open) => {
        if (!open && !promoteDialog.submitting) setPromoteDialog({ open: false, target: null, submitting: false });
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Promote to Master?</AlertDialogTitle>
            <AlertDialogDescription>
              {promoteDialog.target ? `This will convert “${promoteDialog.target.title}” into a new, independent Master Resume. The original group will remain unchanged. Proceed?` : "Proceed to promote this variant to a new Master Resume?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={promoteDialog.submitting} onClick={() => setPromoteDialog({ open: false, target: null, submitting: false })}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!promoteDialog.target) return;
                const id = promoteDialog.target.id;
                // Close dialog immediately to avoid any lingering overlays blocking the UI
                setPromoteDialog({ open: false, target: null, submitting: false });
                (async () => {
                  try {
                    const ok = await resumeService.promoteVariantToMaster(id);
                    if (ok) {
                      toast({ title: "Promoted", description: "Variation promoted to a new Master Resume." });
                      await loadResumes({ notifyExtension: true });
                    } else {
                      toast({ title: "Promote failed", description: "Could not promote variant to master.", variant: "destructive" });
                    }
                  } catch (e) {
                    toast({ title: "Promote failed", description: (e as Error)?.message ?? "Unexpected error", variant: "destructive" });
                  }
                })();
              }}
            >
              Promote
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
          one-level hierarchy when the user asks to create a variation from a
          resume that is itself already a variant. */}
      <AlertDialog
        open={detachConfirm.open}
        onOpenChange={(open) => !open && setDetachConfirm({ open: false, target: null, parentName: "" })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Detach from parent to create variation?</AlertDialogTitle>
            <AlertDialogDescription>
              {detachConfirm.target?.title ?? "This resume"} is currently a variation of {detachConfirm.parentName}.
              Resumes can only be nested one level deep, so we'll detach it from its parent first — then create a new variation under it. Its existing content stays intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDetachAndCreateVariation}>
              Detach and continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Metadata Modal */}
      <MetadataModal
        open={metadataModal.open}
        onOpenChange={(open) => setMetadataModal(prev => ({ ...prev, open }))}
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

      {/* Run-Tool dialog — opened from a resume's "..." context menu */}
      <ToolDialog
        open={toolDialog.open}
        onOpenChange={(open) => setToolDialog((prev) => ({ ...prev, open }))}
        toolId={toolDialog.toolId}
        anchor={toolDialog.resumeId
          ? { type: "resume", id: toolDialog.resumeId, name: toolDialog.resumeName }
          : undefined}
      />

      {/* Tool Run History side panel — opened from a resume's "..." menu */}
      {toolHistory.resumeId && (
        <ToolHistorySheet
          open={toolHistory.open}
          onOpenChange={(open) => setToolHistory((prev) => ({ ...prev, open }))}
          source={{ kind: "entity", entityType: "resume", entityId: toolHistory.resumeId }}
          entityName={toolHistory.resumeName}
          onRunTool={(toolId) => openRunTool(toolId, { id: toolHistory.resumeId!, title: toolHistory.resumeName ?? "" })}
        />
      )}

      {renameDialog.target && (
        <RenameResumeDialog
          isOpen={renameDialog.open}
          onClose={() => setRenameDialog({ open: false, target: null })}
          resumeId={renameDialog.target.id}
          currentName={renameDialog.target.title}
          onRenamed={(newName) => {
            setResumes((prev) => prev.map((r) => (r.id === renameDialog.target!.id ? { ...r, name: newName } : r)));
          }}
        />
      )}

      {qrDialog.target && (
        <QRCodeDialog
          isOpen={qrDialog.open}
          onClose={() => setQrDialog({ open: false, target: null })}
          url={`${window.location.origin}/resumes/${qrDialog.target.id}`}
          title={`QR Code — ${qrDialog.target.title}`}
          filename={`resume-${qrDialog.target.id}-qr`}
        />
      )}

      {analyticsDialog.target && (
        <ResumeAnalyticsDialog
          isOpen={analyticsDialog.open}
          onClose={() => setAnalyticsDialog({ open: false, target: null })}
          resumeName={analyticsDialog.target.title}
          views={analyticsDialog.target.viewCount ?? 0}
        />
      )}
    </div>
  );
}
