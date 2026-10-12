/**
 * useStudioProjectRow — the studio project row a workspace is (a kit's
 * project), read once per id, for the ⋯ rows that act on the project
 * (Details, templates, clone / delete, embed). `setProject` keeps it in step
 * after those edit it. Null until there is a project and it loaded.
 */
import { useEffect, useState } from "react";
import { studioService, type StudioProject } from "@/lib/services/studio-service";

export function useStudioProjectRow(projectId: string | null) {
  const [project, setProject] = useState<StudioProject | null>(null);

  useEffect(() => {
    if (!projectId) {
      setProject(null);
      return;
    }
    let cancelled = false;
    studioService
      .getProject(projectId)
      .then((res) => {
        if (!cancelled) setProject(res.data ?? null);
      })
      .catch(() => {
        if (!cancelled) setProject(null);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return { project, setProject };
}
