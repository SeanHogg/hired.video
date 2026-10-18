// Edit-alert sheet state for the /jobs hub Alerts tab.

import { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/lib/api-client";
import { parseSearchCriteria, type JobAlert } from "../jobs-hub-model";

export function useJobAlertEditor(onSaved: () => void) {
  const { t } = useTranslation();
  const [editAlert, setEditAlert] = useState<JobAlert | null>(null);
  const [alertSheetOpen, setAlertSheetOpen] = useState(false);
  const [alertName, setAlertName] = useState("");
  const [alertKeywords, setAlertKeywords] = useState("");
  const [alertLocation, setAlertLocation] = useState("");
  const [alertFrequency, setAlertFrequency] = useState("daily");
  const [isSubmittingAlert, setIsSubmittingAlert] = useState(false);

  const handleEditAlert = (alert: JobAlert) => {
    setEditAlert(alert);
    setAlertName(alert.name);

    const { keywords, location } = parseSearchCriteria(alert.searchCriteria);
    setAlertKeywords(keywords);
    setAlertLocation(location ?? "");

    setAlertFrequency(alert.alertFrequency);
    setAlertSheetOpen(true);
  };

  const handleSubmitAlert = async () => {
    if (!editAlert) return;

    if (!alertName.trim()) {
      toast.error(t("messages.pleaseProvideAlertName"));
      return;
    }

    setIsSubmittingAlert(true);
    try {
      await apiClient.put(`/api/jobs/alerts/${editAlert.id}`, {
        name: alertName.trim(),
        keywords: alertKeywords.trim() || undefined,
        location: alertLocation.trim() || undefined,
        frequency: alertFrequency,
      });
      toast.success(t("messages.jobAlertUpdated"));
      setAlertSheetOpen(false);
      setEditAlert(null);
      onSaved();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : t("messages.failedToUpdateJobAlert");
      toast.error(errorMessage);
    } finally {
      setIsSubmittingAlert(false);
    }
  };

  return {
    alertSheetOpen,
    setAlertSheetOpen,
    alertName,
    setAlertName,
    alertKeywords,
    setAlertKeywords,
    alertLocation,
    setAlertLocation,
    alertFrequency,
    setAlertFrequency,
    isSubmittingAlert,
    handleEditAlert,
    handleSubmitAlert,
  };
}

export type JobAlertEditorState = ReturnType<typeof useJobAlertEditor>;
