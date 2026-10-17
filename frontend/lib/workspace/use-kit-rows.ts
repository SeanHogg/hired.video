/**
 * useKitRows — the studio home's kits: the viewer's résumés matched to their
 * kit videos (buildKitRows, in memory over the home's project list), and the
 * ids of the videos those rows show — the home's "My content" leaves only
 * THOSE out, so an older duplicate or a video whose résumé is gone stays
 * listed (and deletable) there. Null while signed out or loading.
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useUserResumes } from "@/hooks/queries/use-resumes";
import type { StudioProject } from "@/lib/services/studio-service";
import { buildKitRows, type KitRow } from "./kits";

const NO_RESUMES: never[] = [];

export function useKitRows(projects: readonly StudioProject[] | null) {
  const { t } = useTranslation();
  const query = useUserResumes();
  // Null while signed out or loading; a failed read shows no kits.
  const resumes = query.isError ? NO_RESUMES : (query.data ?? null);

  return useMemo(() => {
    const rows: KitRow[] | null = resumes ? buildKitRows(resumes, projects ?? [], t("build.untitledResume")) : null;
    const shownVideoIds = new Set((rows ?? []).flatMap((row) => (row.video ? [row.video.projectId] : [])));
    return { rows, shownVideoIds };
  }, [resumes, projects, t]);
}
