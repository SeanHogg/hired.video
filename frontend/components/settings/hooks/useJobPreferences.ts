import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/ui/use-toast";
import { settingsService, type JobPreferences, type JobPreferencesPatch } from "@/lib/services/settings-service";

/** Job preferences — lazy-loaded only when the job-preferences tab is active. */
export function useJobPreferences(isAuthenticated: boolean, activeTab: string) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [jobPrefs, setJobPrefs] = useState<JobPreferences | null>(null);
  const [savingJobPrefs, setSavingJobPrefs] = useState(false);

  // Lazy-load job preferences only when the job-preferences tab is active
  useEffect(() => {
    if (!isAuthenticated || activeTab !== "job-preferences" || jobPrefs !== null) return;

    settingsService
      .getJobPreferences()
      .then(setJobPrefs)
      .catch((err) => {
        console.error("Failed to load job preferences", err);
      });
  }, [isAuthenticated, activeTab, jobPrefs]);

  const saveJobPatch = async (patch: JobPreferencesPatch) => {
    try {
      setSavingJobPrefs(true);
      const updated = await settingsService.updateJobPreferences(patch);
      setJobPrefs(updated);
    } catch (error) {
      console.error("Failed to save job preferences", error);
      toast({ title: t("errors.saveJobPreferencesFailed"), variant: "destructive" });
    } finally {
      setSavingJobPrefs(false);
    }
  };

  return { jobPrefs, savingJobPrefs, saveJobPatch };
}
