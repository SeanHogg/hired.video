import { useTranslation } from "react-i18next";
import { ToolHistorySheet } from "@/components/ToolHistorySheet";
import ResumeUploadSheet from "@/components/ResumeUploadSheet";
import CreateVariationDialog from "@/components/CreateVariationDialog";
import MergeResumeDialog from "@/components/MergeResumeDialog";
import MetadataModal from "@/components/MetadataModal";
import RenameResumeDialog from "@/components/RenameResumeDialog";
import QRCodeDialog from "@/components/QRCodeDialog";
import ResumeAnalyticsDialog from "@/components/ResumeAnalyticsDialog";
import EntityVersionHistoryDialog from "@/components/EntityVersionHistoryDialog";
import type { ResumeWithOwnership } from "@/types/resume";
import ResumeConfirmDialog from "./ResumeConfirmDialog";
import { resumeShareUrl } from "./resume-list-helpers";
import type { ResumeActions } from "./use-resume-actions";
import {
  CLOSED_DETACH_CONFIRM,
  CLOSED_MERGE_DIALOG,
  CLOSED_TARGET_DIALOG,
  CLOSED_VARIATION_DIALOG,
  type ResumeDialogState,
} from "./use-resume-dialog-state";

interface ResumesDialogsProps {
  dialogs: ResumeDialogState;
  actions: ResumeActions;
  displayResumes: ResumeWithOwnership[];
}

/**
 * Every dialog / sheet of the /resumes hub — bound once so list-mode and
 * viewer mode share a single render path. Radix dialogs are
 * portal-rendered so mounting them as siblings of the page chrome is fine.
 */
export default function ResumesDialogs({ dialogs, actions, displayResumes }: ResumesDialogsProps) {
  const { t } = useTranslation();
  const {
    deleteDialog,
    setDeleteDialog,
    variationDialog,
    setVariationDialog,
    mergeDialog,
    setMergeDialog,
    detachConfirm,
    setDetachConfirm,
    metadataModal,
    setMetadataModal,
    uploadSheetOpen,
    setUploadSheetOpen,
    toolHistory,
    setToolHistory,
    renameDialog,
    setRenameDialog,
    qrDialog,
    setQrDialog,
    analyticsDialog,
    setAnalyticsDialog,
    versionHistoryFor,
    setVersionHistoryFor,
  } = dialogs;

  return (
    <>
      {/* Delete Confirmation */}
      <ResumeConfirmDialog
        open={deleteDialog.open}
        onOpenChange={(open) => {
          if (!open) setDeleteDialog(CLOSED_TARGET_DIALOG);
        }}
        title={t("headings.resumes.deleteResumeTitle")}
        description={
          deleteDialog.target
            ? t("messages.resumes.deleteResumeConfirm", { name: deleteDialog.target.title })
            : t("messages.resumes.actionCannotBeUndone")
        }
        onCancel={() => setDeleteDialog(CLOSED_TARGET_DIALOG)}
        confirmLabel={t("actions.delete")}
        confirmClassName="bg-destructive hover:bg-destructive/90"
        onConfirm={async () => {
          if (deleteDialog.target) {
            await actions.handleDelete(deleteDialog.target);
          }
        }}
      />

      {/* Create Variation Dialog */}
      <CreateVariationDialog
        isOpen={variationDialog.isOpen}
        onClose={() => setVariationDialog(CLOSED_VARIATION_DIALOG)}
        masterResumeId={variationDialog.masterResumeId}
        masterResumeName={variationDialog.masterResumeName}
        onVariationCreated={actions.handleVariationCreated}
      />

      {/* Merge Resume Dialog */}
      <MergeResumeDialog
        isOpen={mergeDialog.isOpen}
        onClose={() => setMergeDialog(CLOSED_MERGE_DIALOG)}
        resumes={displayResumes}
        preselectedTargetId={mergeDialog.targetResumeId}
        preselectedSourceId={mergeDialog.preselectedSourceId}
        onMergeComplete={actions.handleMergeComplete}
      />

      {/* Detach confirmation — only variants trigger this, to enforce the
          one-level hierarchy when the user asks to create a variation from
          a resume that is itself already a variant. */}
      <ResumeConfirmDialog
        open={detachConfirm.open}
        onOpenChange={(open) => {
          if (!open) setDetachConfirm(CLOSED_DETACH_CONFIRM);
        }}
        title={t("headings.resumes.detachTitle")}
        description={t("messages.resumes.detachConfirm", {
          name: detachConfirm.target?.title ?? t("labels.resumes.thisResume"),
          parent: detachConfirm.parentName,
        })}
        confirmLabel={t("actions.resumes.detachAndContinue")}
        onConfirm={actions.handleConfirmDetachAndCreateVariation}
      />

      {/* Metadata Modal */}
      <MetadataModal
        open={metadataModal.open}
        onOpenChange={(open) => setMetadataModal((prev) => ({ ...prev, open }))}
        resumeId={metadataModal.resumeId || ""}
        initialMetadata={metadataModal.initialMetadata}
        onSave={actions.handleSaveMetadata}
      />

      {/* Upload Sheet — slide-out panel, replaces the standalone /resumes/upload page */}
      <ResumeUploadSheet
        open={uploadSheetOpen}
        onOpenChange={setUploadSheetOpen}
        onSuccess={actions.handleUploadSuccess}
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
          onClose={() => setRenameDialog(CLOSED_TARGET_DIALOG)}
          resumeId={renameDialog.target.id}
          currentName={renameDialog.target.title}
          onRenamed={(newName) => actions.handleRenamed(renameDialog.target!.id, newName)}
        />
      )}

      {qrDialog.target && (
        <QRCodeDialog
          isOpen={qrDialog.open}
          onClose={() => setQrDialog(CLOSED_TARGET_DIALOG)}
          url={resumeShareUrl(qrDialog.target.id)}
          title={t("labels.resumes.qrCodeTitle", { name: qrDialog.target.title })}
          filename={`resume-${qrDialog.target.id}-qr`}
        />
      )}

      {analyticsDialog.target && (
        <ResumeAnalyticsDialog
          isOpen={analyticsDialog.open}
          onClose={() => setAnalyticsDialog(CLOSED_TARGET_DIALOG)}
          resumeId={analyticsDialog.target.id}
          resumeName={analyticsDialog.target.title}
        />
      )}

      {/* #155 — Version history. Single instance reused across rows so we
          don't carry one Dialog per card. */}
      {versionHistoryFor && (
        <EntityVersionHistoryDialog
          open
          onOpenChange={(open) => {
            if (!open) setVersionHistoryFor(null);
          }}
          entityLabel={t("labels.resume")}
          canSnapshot
          adapter={actions.buildVersionAdapter(versionHistoryFor.id)}
        />
      )}
    </>
  );
}
