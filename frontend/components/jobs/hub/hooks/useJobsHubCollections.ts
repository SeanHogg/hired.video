// Per-tab collections on the authed /jobs hub: saved jobs, applications and
// job alerts — each with its loader + row mutations.

import { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { apiClient } from "@/lib/api-client";
import { jobService } from "@/lib/services/job-service";
import {
  JobAlertSchema,
  JobApplicationSchema,
  type JobAlert,
  type JobApplication,
  type SavedJob,
} from "../jobs-hub-model";

export function useSavedJobs() {
  const { t } = useTranslation();
  const [savedJobs, setSavedJobs] = useState<SavedJob[]>([]);
  const [savedJobsLoading, setSavedJobsLoading] = useState(false);

  const loadSavedJobs = async () => {
    try {
      setSavedJobsLoading(true);
      const jobs = await jobService.getSavedJobs();
      setSavedJobs(jobs);
    } catch {
      toast.error(t("messages.failedToLoadSavedJobs"));
    } finally {
      setSavedJobsLoading(false);
    }
  };

  const handleUnsaveJob = async (jobId: string) => {
    try {
      await jobService.unsaveJob(jobId);
      setSavedJobs((prev) => prev.filter((job) => job.id !== jobId));
      toast.success(t("messages.jobRemovedFromSaved"));
    } catch {
      toast.error(t("messages.failedToRemoveJob"));
    }
  };

  return { savedJobs, setSavedJobs, savedJobsLoading, loadSavedJobs, handleUnsaveJob };
}

export function useJobApplications() {
  const { t } = useTranslation();
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [applicationsLoading, setApplicationsLoading] = useState(false);

  const loadApplications = async () => {
    try {
      setApplicationsLoading(true);
      const response = await apiClient.get<JobApplication[]>(
        "/api/jobs/applications",
        z.array(JobApplicationSchema)
      );
      setApplications(response.data);
    } catch {
      toast.error(t("messages.failedToLoadApplications"));
    } finally {
      setApplicationsLoading(false);
    }
  };

  return { applications, applicationsLoading, loadApplications };
}

export function useJobAlerts() {
  const { t } = useTranslation();
  const [alerts, setAlerts] = useState<JobAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [deleteAlertId, setDeleteAlertId] = useState<string | null>(null);

  const loadAlerts = async () => {
    try {
      setAlertsLoading(true);
      const response = await apiClient.get<JobAlert[]>(
        "/api/jobs/alerts",
        z.array(JobAlertSchema)
      );
      setAlerts(response.data);
    } catch {
      toast.error(t("messages.failedToLoadJobAlerts"));
    } finally {
      setAlertsLoading(false);
    }
  };

  const handleToggleActive = async (alertId: string, currentStatus: boolean) => {
    try {
      await apiClient.patch(`/api/jobs/alerts/${alertId}/toggle`, {
        isActive: !currentStatus,
      });
      setAlerts((prev) =>
        prev.map((alert) =>
          alert.id === alertId ? { ...alert, isActive: !currentStatus } : alert
        )
      );
      toast.success(t(!currentStatus ? "messages.alertActivated" : "messages.alertDeactivated"));
    } catch {
      toast.error(t("messages.failedToUpdateAlertStatus"));
    }
  };

  const handleDeleteAlert = async () => {
    if (!deleteAlertId) return;

    try {
      await apiClient.delete(`/api/jobs/alerts/${deleteAlertId}`);
      setAlerts((prev) => prev.filter((alert) => alert.id !== deleteAlertId));
      toast.success(t("messages.jobAlertDeleted"));
    } catch {
      toast.error(t("messages.failedToDeleteAlert"));
    } finally {
      setDeleteAlertId(null);
    }
  };

  return {
    alerts,
    alertsLoading,
    loadAlerts,
    handleToggleActive,
    deleteAlertId,
    setDeleteAlertId,
    handleDeleteAlert,
  };
}
