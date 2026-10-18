// Owner-side per-job actions on the /jobs hub: dialog targets (QR, tool
// history, analytics, delete) + delete/archive mutations. Every JobCard mount
// on the page shares `menuHandlersFor` so the wiring lives in one place.

import { useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { jobService, type JobSummary } from "@/lib/services/job-service";
import type { JobDialogTarget, SavedJob } from "../jobs-hub-model";

export function useJobOwnerActions(
  setJobs: Dispatch<SetStateAction<JobSummary[]>>,
  setSavedJobs: Dispatch<SetStateAction<SavedJob[]>>,
) {
  const { t } = useTranslation();
  // Each dialog renders once at the bottom of the page (Radix portals so
  // they survive any re-render in the grid).
  const [deleteJobDialog, setDeleteJobDialog] = useState<JobDialogTarget | null>(null);
  const [qrJob, setQrJob] = useState<JobDialogTarget | null>(null);
  const [toolHistoryJob, setToolHistoryJob] = useState<JobDialogTarget | null>(null);
  // #411 — Job analytics dialog mount target. Set by JobActionsMenu's
  // Analytics entry; cleared on close.
  const [analyticsJob, setAnalyticsJob] = useState<JobDialogTarget | null>(null);

  // Confirmation dialog calls jobService.deleteJob and removes the row from
  // the visible grid optimistically.
  const handleConfirmDeleteJob = async () => {
    if (!deleteJobDialog) return;
    const { id, title } = deleteJobDialog;
    try {
      await jobService.deleteJob(id);
      setJobs((prev) => prev.filter((j) => j.id !== id));
      setSavedJobs((prev) => prev.filter((j) => j.id !== id));
      toast.success(t("messages.entityDeleted", { name: title }));
    } catch (err) {
      toast.error(t("messages.failedToDeleteJob"));
      console.error("Failed to delete job", err);
    } finally {
      setDeleteJobDialog(null);
    }
  };

  // #1493 — Archive a job from the list. Archived jobs drop out of the
  // default (public) listing, so we optimistically remove the row. Restore
  // is reachable from the job's own detail page (still loadable by URL).
  const handleArchiveJob = async (id: string, title: string) => {
    try {
      await jobService.archiveJob(id);
      setJobs((prev) => prev.filter((j) => j.id !== id));
      toast.success(t("messages.jobs.archived", { title }));
    } catch (err) {
      toast.error(t("messages.jobs.archiveFailed"));
      console.error("Failed to archive job", err);
    }
  };

  // Owner-only items collapse to undefined when the viewer can't manage
  // jobs, so JobActionsMenu hides them automatically (self-gating).
  const menuHandlersFor = (job: JobDialogTarget, canManageJobs: boolean) => ({
    onShowQR: () => setQrJob({ id: job.id, title: job.title }),
    onViewToolHistory: canManageJobs
      ? () => setToolHistoryJob({ id: job.id, title: job.title })
      : undefined,
    onViewAnalytics: canManageJobs
      ? () => setAnalyticsJob({ id: job.id, title: job.title })
      : undefined,
    onArchive: canManageJobs
      ? () => handleArchiveJob(job.id, job.title)
      : undefined,
    onDelete: canManageJobs
      ? () => setDeleteJobDialog({ id: job.id, title: job.title })
      : undefined,
  });

  return {
    deleteJobDialog,
    setDeleteJobDialog,
    qrJob,
    setQrJob,
    toolHistoryJob,
    setToolHistoryJob,
    analyticsJob,
    setAnalyticsJob,
    handleConfirmDeleteJob,
    menuHandlersFor,
  };
}

export type JobOwnerActionsState = ReturnType<typeof useJobOwnerActions>;
export type JobMenuHandlers = ReturnType<JobOwnerActionsState["menuHandlersFor"]>;
