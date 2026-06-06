/**
 * usePublications — fetches "where has this project been published" (#1896)
 * and exposes a `refresh()` the editor calls after each successful publish.
 *
 * ONE fetch shared by every surface (Save menu + Details drawer) per the DRY
 * rule — the editor owns the hook once and threads `publications` + `refresh`
 * down, so the two surfaces never issue duplicate reads or drift on state.
 * The underlying GET is served through the api read-through cache (invalidated
 * on every publish write), so `refresh()` after a publish returns fresh data.
 */
import { useCallback, useEffect, useState } from "react";
import {
  studioService,
  type StudioPublication,
} from "@/lib/services/studio-service";

export interface UsePublications {
  publications: StudioPublication[];
  loading: boolean;
  /** Re-read the list — call after a successful publish. */
  refresh: () => Promise<void>;
}

export function usePublications(projectId: string | null): UsePublications {
  const [publications, setPublications] = useState<StudioPublication[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setPublications([]);
      return;
    }
    setLoading(true);
    try {
      const res = await studioService.getPublications(projectId);
      setPublications(res.data ?? []);
    } catch {
      // Non-fatal — a failed read just leaves the list empty/stale. The
      // toast surface is reserved for user-initiated actions.
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { publications, loading, refresh };
}
