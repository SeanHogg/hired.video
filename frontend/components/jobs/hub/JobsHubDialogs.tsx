// Page-level dialogs for the /jobs hub: delete-alert confirm, job analytics,
// delete-job confirm, QR code and tool-run history. Each mounts once at the
// bottom of the page (Radix portals survive any re-render in the grid).

import { useTranslation } from "react-i18next";
import { publicJobPath } from "@shared/public-paths";
import JobAnalyticsDialog from "@/components/JobAnalyticsDialog";
import QRCodeDialog from "@/components/QRCodeDialog";
import { ToolHistorySheet } from "@/components/ToolHistorySheet";
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
import type { JobOwnerActionsState } from "./hooks/useJobOwnerActions";

interface JobsHubDialogsProps {
  deleteAlertId: string | null;
  onCancelDeleteAlert: () => void;
  onConfirmDeleteAlert: () => void;
  owner: JobOwnerActionsState;
}

export function JobsHubDialogs({
  deleteAlertId,
  onCancelDeleteAlert,
  onConfirmDeleteAlert,
  owner,
}: JobsHubDialogsProps) {
  const { t } = useTranslation();
  const {
    analyticsJob,
    setAnalyticsJob,
    deleteJobDialog,
    setDeleteJobDialog,
    handleConfirmDeleteJob,
    qrJob,
    setQrJob,
    toolHistoryJob,
    setToolHistoryJob,
  } = owner;

  return (
    <>
      {/* Delete Alert Dialog */}
      <AlertDialog open={!!deleteAlertId} onOpenChange={() => onCancelDeleteAlert()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("headings.deleteJobAlert")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("messages.jobs.deleteAlertConfirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmDeleteAlert} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("actions.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* #411 — Job analytics dialog, mounted by JobActionsMenu's
          Analytics entry. */}
      {analyticsJob && (
        <JobAnalyticsDialog
          isOpen={!!analyticsJob}
          onClose={() => setAnalyticsJob(null)}
          jobId={analyticsJob.id}
          jobTitle={analyticsJob.title}
        />
      )}

      {/* Delete Job confirmation — owner-only via the JobActionsMenu Delete entry. */}
      <AlertDialog open={!!deleteJobDialog} onOpenChange={(open) => !open && setDeleteJobDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("headings.jobs.deleteJobTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteJobDialog
                ? t("messages.jobs.deleteJobConfirm", { title: deleteJobDialog.title })
                : t("messages.jobs.actionCannotBeUndone")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteJob}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("actions.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* QR Code dialog — Reuses the resume QR component since it just
          renders any URL. */}
      {qrJob && (
        <QRCodeDialog
          isOpen={!!qrJob}
          onClose={() => setQrJob(null)}
          url={`${window.location.origin}${publicJobPath(qrJob.id)}`}
          title={t("headings.jobs.qrCodeTitle", { title: qrJob.title })}
          filename={`job-${qrJob.id}-qr`}
        />
      )}

      {/* Tool Run History side panel — owner-only on JobActionsMenu.
          Shared sheet works for any entity type (resume / job / company). */}
      {toolHistoryJob && (
        <ToolHistorySheet
          open={!!toolHistoryJob}
          onOpenChange={(open) => !open && setToolHistoryJob(null)}
          source={{ kind: "entity", entityType: "job", entityId: toolHistoryJob.id }}
          entityName={toolHistoryJob.title}
        />
      )}
    </>
  );
}
