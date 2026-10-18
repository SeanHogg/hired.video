import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { publicResumePath } from "@shared/public-paths";
import { resumeService } from "@/lib/services/resume-service";
import { resumeEditorPath } from "@/lib/studio/resume-editor-link";
import { downloadResume } from "@/lib/resume-download";
import { useToast } from "@/hooks/use-toast";
import type { VersionHistoryAdapter } from "@/components/EntityVersionHistoryDialog";
import type {
  ResumePrivacy,
  ResumeSectionMeta,
  ResumeUploadResponse,
  ResumeWithOwnership,
} from "@/types/resume";
import type { ResumeDownloadFormat } from "@/components/resumes/card/types";
import {
  findDemotedByPrivacy,
  removeFromMasterGroups,
  renameInState,
  resumeShareUrl,
} from "./resume-list-helpers";
import type { ResumesData } from "./use-resumes-data";
import { CLOSED_DETACH_CONFIRM, type ResumeDialogState } from "./use-resume-dialog-state";

/**
 * Every mutation / navigation handler of the /resumes hub. Reads data +
 * dialog state from the sibling hooks and owns the transient success
 * banner message.
 */
export function useResumeActions(data: ResumesData, dialogs: ResumeDialogState) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const {
    resumes,
    setResumes,
    masterResumeGroups,
    setMasterResumeGroups,
    displayResumes,
    optimisticActions,
    loadResumes,
    getResumesForDisplay,
  } = data;
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const flashSuccess = (message: string, ms: number) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), ms);
  };
  const reloadAndNotify = () => loadResumes({ notifyExtension: true });

  // Open the uploaded resume in the kit workspace.
  const handleUploadSuccess = (response: ResumeUploadResponse) => navigate(resumeEditorPath(response.id));
  const handleUpdateResume = () => flashSuccess(t("messages.resumeUpdatedSuccess"), 5000);
  const handleResumeView = (resumeId: string) => navigate(publicResumePath(resumeId));
  const handleEdit = (resumeId: string) => navigate(resumeEditorPath(resumeId));

  // Opens the create-variation flow for any resume. If the target is itself
  // a variant (parentId set) we first confirm detaching it from its current
  // parent, since the one-level hierarchy forbids grandchildren.
  const handleCreateVariation = (resumeId: string) => {
    const resume = displayResumes.find(r => r.id === resumeId);
    if (!resume) return;
    if (resume.parentId) {
      const parent = displayResumes.find(r => r.id === resume.parentId);
      dialogs.setDetachConfirm({
        open: true,
        target: resume,
        parentName: parent?.title ?? t("labels.resumes.itsParent"),
      });
      return;
    }
    dialogs.setVariationDialog({ isOpen: true, masterResumeId: resumeId, masterResumeName: resume.title });
  };

  // Confirm-path: detach the child, then open the variation dialog against it.
  const handleConfirmDetachAndCreateVariation = async () => {
    const target = dialogs.detachConfirm.target;
    if (!target) return;
    try {
      await resumeService.detachFromParent(target.id);
      await reloadAndNotify();
      dialogs.setDetachConfirm(CLOSED_DETACH_CONFIRM);
      dialogs.setVariationDialog({ isOpen: true, masterResumeId: target.id, masterResumeName: target.title });
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
    dialogs.setMergeDialog({ isOpen: true, targetResumeId: variant.parentId, preselectedSourceId: variant.id });
  };

  const handleSetActiveResume = async (resumeId: string) => {
    optimisticActions.setActiveOptimistic(resumeId);
    try {
      await resumeService.setActiveResume(resumeId);
      toast({ title: t("labels.success"), description: t("messages.activeSetDescription") });
      // Refresh data to ensure consistency
      loadResumes();
    } catch (error) {
      console.error("Error setting active resume:", error);
      optimisticActions.revertOptimistic();
      toast({ title: t("labels.error"), description: t("errors.resumes.setActiveFailed"), variant: "destructive" });
    }
  };

  const handleChangePrivacy = async (resumeId: string, privacy: ResumePrivacy) => {
    if (!resumeId) return;
    // Pre-compute which owned resumes will be demoted due to exclusivity.
    const demotedCandidates = findDemotedByPrivacy(displayResumes, resumeId, privacy);
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
      await reloadAndNotify();
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
    navigator.clipboard.writeText(resumeShareUrl(item.id));
    flashSuccess(t("messages.resumeLinkCopied"), 3000);
  };

  const handleCopyLink = async (item: ResumeWithOwnership) => {
    const shareUrl = resumeShareUrl(item.id);
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast({ title: t("messages.linkCopiedTitle"), description: shareUrl });
    } catch {
      toast({ title: t("errors.couldNotCopyTitle"), description: t("errors.couldNotCopyDesc"), variant: "destructive" });
    }
  };

  const handleDownload = async (item: ResumeWithOwnership, format: ResumeDownloadFormat) => {
    try {
      await downloadResume({ id: item.id, format });
    } catch (error) {
      console.error("Failed to download resume:", error);
      toast({ title: t("errors.downloadFailedTitle"), description: t("errors.downloadFailedDescription"), variant: "destructive" });
    }
  };

  const handleDelete = async (item: ResumeWithOwnership) => {
    // Optimistic update: remove from UI immediately
    const prevResumes = [...resumes];
    const prevGroups = [...masterResumeGroups];
    const nextResumes = prevResumes.filter((r) => r.id !== item.id);
    const nextGroups = removeFromMasterGroups(prevGroups, item.id);
    setResumes(nextResumes);
    optimisticActions.updateState({ resumes: nextResumes, masterGroups: nextGroups });
    try {
      await resumeService.deleteResume(item.id);
      toast({ title: t("messages.deletedConfirmTitle"), description: t("messages.deletedConfirmDescription") });
      await reloadAndNotify();
    } catch (err) {
      console.error("Failed to delete resume", err);
      // Rollback optimistic change
      setResumes(prevResumes);
      optimisticActions.updateState({ resumes: prevResumes, masterGroups: prevGroups });
      toast({
        title: t("errors.deleteFailedTitle"),
        description: (err as Error)?.message || t("errors.resumes.deleteMasterWithVariations"),
        variant: "destructive",
      });
    }
  };

  const handlePromoteToMaster = async (resumeId: string) => {
    try {
      const ok = await resumeService.promoteVariantToMaster(resumeId);
      if (ok) {
        toast({ title: t("messages.promotedTitle"), description: t("messages.promotedDescription") });
        await reloadAndNotify();
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
      dialogs.setMetadataModal({ open: true, resumeId: resume.id, initialMetadata: fullResume.content?.metaData || [] });
    } catch (error) {
      console.error("Failed to load resume metadata:", error);
      toast({ title: t("labels.error"), description: t("errors.failedLoadResumeMetadata"), variant: "destructive" });
    }
  };

  const handleSaveMetadata = async (metadata: ResumeSectionMeta[]) => {
    if (!dialogs.metadataModal.resumeId) return;
    try {
      await resumeService.updateResumeMetadata(dialogs.metadataModal.resumeId, metadata);
      toast({ title: t("labels.success"), description: t("messages.resumeMediaUpdated") });
      await reloadAndNotify();
    } catch (error) {
      console.error("Failed to save metadata:", error);
      toast({ title: t("labels.error"), description: t("errors.failedSaveMetadata"), variant: "destructive" });
      throw error; // Re-throw to prevent modal from closing
    }
  };

  const handleArchive = async (resumeId: string) => {
    await resumeService.archiveResume(resumeId);
    await reloadAndNotify();
  };

  const handleUnarchive = async (resumeId: string) => {
    await resumeService.unarchiveResume(resumeId);
    await reloadAndNotify();
  };

  const handleVariationCreated = () => {
    loadResumes();
  };

  const handleMergeComplete = async () => {
    // One groups request feeds both the display fallback and the groups state.
    const groupsRequest = resumeService.getMasterResumeGroups();
    const updated = await getResumesForDisplay(groupsRequest);
    setResumes(updated);
    try {
      setMasterResumeGroups(await groupsRequest);
    } catch {}
  };

  const handleRenamed = (targetId: string, newName: string) => {
    const next = renameInState(resumes, masterResumeGroups, targetId, newName);
    setResumes(next.resumes);
    setMasterResumeGroups(next.groups);
    optimisticActions.updateState({ resumes: next.resumes, masterGroups: next.groups });
  };

  // #155 — adapter wrapping the resume version REST endpoints exposed via
  // resumeService.{listVersions, createVersion, restoreVersion}.
  const buildVersionAdapter = (resumeId: string): VersionHistoryAdapter => ({
    list: () => resumeService.listVersions(resumeId),
    snapshot: () => resumeService.createVersion(resumeId, {
      label: t("studio.versionHistory.manualSnapshot"),
      isAutosave: false,
    }),
    restore: async (vid) => {
      await resumeService.restoreVersion(resumeId, vid);
      await reloadAndNotify();
    },
  });

  // Deferred a tick so the dropdown menu that triggered it can close first.
  const requestDelete = (resume: ResumeWithOwnership) =>
    setTimeout(() => dialogs.setDeleteDialog({ open: true, target: resume }), 0);

  return {
    successMessage,
    reloadAndNotify,
    handleUploadSuccess,
    handleUpdateResume,
    handleResumeView,
    handleEdit,
    handleCreateVariation,
    handleConfirmDetachAndCreateVariation,
    handleCopyToMaster,
    handleSetActiveResume,
    handleChangePrivacy,
    handleShare,
    handleCopyLink,
    handleDownload,
    handleDelete,
    handlePromoteToMaster,
    handleAddMedia,
    handleSaveMetadata,
    handleArchive,
    handleUnarchive,
    handleVariationCreated,
    handleMergeComplete,
    handleRenamed,
    requestDelete,
    buildVersionAdapter,
  };
}

export type ResumeActions = ReturnType<typeof useResumeActions>;
