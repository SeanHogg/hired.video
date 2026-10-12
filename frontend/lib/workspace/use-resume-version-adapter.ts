/**
 * useResumeVersionAdapter — a résumé's version history for the shared
 * EntityVersionHistoryDialog (⋯ › Versions): list, snapshot now, restore. A
 * restore re-reads the résumé and hands its content to `onRestored` (a kit
 * commits it as one Undo step; the studio's document canvas rebinds). Null
 * until there is a saved résumé.
 */
import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { ResumeContent } from "@shared/resume";
import { resumeService } from "@/lib/services/resume-service";
import { useToast } from "@/hooks/use-toast";

export function useResumeVersionAdapter(resumeId: string | null, onRestored: (content: ResumeContent) => void) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const restoredRef = useRef(onRestored);
  restoredRef.current = onRestored;

  return useMemo(() => {
    if (!resumeId) return null;
    return {
      list: () => resumeService.listVersions(resumeId),
      snapshot: () =>
        resumeService.createVersion(resumeId, {
          label: t("studio.versionHistory.manualSnapshot"),
          isAutosave: false,
        }),
      restore: async (versionId: string) => {
        await resumeService.restoreVersion(resumeId, versionId);
        const resume = await resumeService.getResumeById(resumeId);
        restoredRef.current(resume.content);
        toast({ title: t("messages.versionRestoredTitle") });
      },
    };
  }, [resumeId, t, toast]);
}
