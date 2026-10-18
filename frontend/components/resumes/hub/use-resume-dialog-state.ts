import { useState } from "react";
import type { ResumeSectionMeta, ResumeWithOwnership } from "@/types/resume";

/** `{ open, target }` dialog state shared by delete / rename / QR / analytics. */
export interface TargetDialogState {
  open: boolean;
  target: ResumeWithOwnership | null;
}

export const CLOSED_TARGET_DIALOG: TargetDialogState = { open: false, target: null };

export interface VariationDialogState {
  isOpen: boolean;
  masterResumeId: string;
  masterResumeName: string;
}

export const CLOSED_VARIATION_DIALOG: VariationDialogState = {
  isOpen: false,
  masterResumeId: "",
  masterResumeName: "",
};

export interface DetachConfirmState {
  open: boolean;
  target: ResumeWithOwnership | null;
  parentName: string;
}

export const CLOSED_DETACH_CONFIRM: DetachConfirmState = { open: false, target: null, parentName: "" };

export interface MergeDialogState {
  isOpen: boolean;
  targetResumeId: string | null;
  preselectedSourceId?: string | null;
}

export const CLOSED_MERGE_DIALOG: MergeDialogState = {
  isOpen: false,
  targetResumeId: null,
  preselectedSourceId: null,
};

export interface ToolHistoryState {
  open: boolean;
  resumeId?: string;
  resumeName?: string;
  initialToolId?: string | readonly string[];
}

export interface MetadataModalState {
  open: boolean;
  resumeId: string | null;
  initialMetadata: ResumeSectionMeta[];
}

/**
 * Every dialog / sheet the /resumes hub can open, as plain state. One
 * instance of each dialog is mounted for the whole list (Radix portals).
 */
export function useResumeDialogState() {
  const [uploadSheetOpen, setUploadSheetOpen] = useState(false);
  // Master Resume System state — surfaces only on the My Resumes tab,
  // which the EntityHubShell descriptor gates to job_seeker.
  const [variationDialog, setVariationDialog] = useState<VariationDialogState>(CLOSED_VARIATION_DIALOG);
  // Confirmation shown when the user asks to create a variation from a
  // resume that is itself already a variant. The one-level hierarchy means
  // we must detach it from its current parent first.
  const [detachConfirm, setDetachConfirm] = useState<DetachConfirmState>(CLOSED_DETACH_CONFIRM);
  const [deleteDialog, setDeleteDialog] = useState<TargetDialogState>(CLOSED_TARGET_DIALOG);
  const [mergeDialog, setMergeDialog] = useState<MergeDialogState>(CLOSED_MERGE_DIALOG);
  // Tool-history side panel — opened from the "..." menu *or* from a
  // clicked score chip on the card. `initialToolId` is set when the open
  // is triggered by a chip click so the panel pre-expands that tool.
  const [toolHistory, setToolHistory] = useState<ToolHistoryState>({ open: false });
  const openToolHistory = (
    resume: { id: string; title: string },
    initialToolId?: string | readonly string[],
  ) => setToolHistory({ open: true, resumeId: resume.id, resumeName: resume.title, initialToolId });
  const [metadataModal, setMetadataModal] = useState<MetadataModalState>({
    open: false,
    resumeId: null,
    initialMetadata: [],
  });
  /** #155 — version-history dialog state. Single dialog reused for the
   *  whole list. */
  const [versionHistoryFor, setVersionHistoryFor] = useState<{ id: string; title: string } | null>(null);
  const [renameDialog, setRenameDialog] = useState<TargetDialogState>(CLOSED_TARGET_DIALOG);
  const [qrDialog, setQrDialog] = useState<TargetDialogState>(CLOSED_TARGET_DIALOG);
  const [analyticsDialog, setAnalyticsDialog] = useState<TargetDialogState>(CLOSED_TARGET_DIALOG);

  return {
    uploadSheetOpen,
    setUploadSheetOpen,
    variationDialog,
    setVariationDialog,
    detachConfirm,
    setDetachConfirm,
    deleteDialog,
    setDeleteDialog,
    mergeDialog,
    setMergeDialog,
    toolHistory,
    setToolHistory,
    openToolHistory,
    metadataModal,
    setMetadataModal,
    versionHistoryFor,
    setVersionHistoryFor,
    renameDialog,
    setRenameDialog,
    qrDialog,
    setQrDialog,
    analyticsDialog,
    setAnalyticsDialog,
  };
}

export type ResumeDialogState = ReturnType<typeof useResumeDialogState>;
