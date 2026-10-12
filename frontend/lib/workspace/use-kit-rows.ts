/**
 * useKitRows — the studio home's kits: the viewer's résumés matched to their
 * kit videos (buildKitRows, in memory over the home's project list), and the
 * ids of the videos those rows show — the home's "My content" leaves only
 * THOSE out, so an older duplicate or a video whose résumé is gone stays
 * listed (and deletable) there. Null while signed out or loading.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { resumeService } from "@/lib/services/resume-service";
import type { StudioProject } from "@/lib/services/studio-service";
import { buildKitRows, type KitRow } from "./kits";

type ResumeList = Awaited<ReturnType<typeof resumeService.getUserResumes>>;

export function useKitRows(projects: readonly StudioProject[] | null) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [resumes, setResumes] = useState<ResumeList | null>(null);

  useEffect(() => {
    if (!user) {
      setResumes(null);
      return;
    }
    let cancelled = false;
    resumeService
      .getUserResumes()
      .then((list) => !cancelled && setResumes(list))
      .catch(() => !cancelled && setResumes([]));
    return () => {
      cancelled = true;
    };
  }, [user]);

  return useMemo(() => {
    const rows: KitRow[] | null = resumes ? buildKitRows(resumes, projects ?? [], t("build.untitledResume")) : null;
    const shownVideoIds = new Set((rows ?? []).flatMap((row) => (row.video ? [row.video.projectId] : [])));
    return { rows, shownVideoIds };
  }, [resumes, projects, t]);
}
