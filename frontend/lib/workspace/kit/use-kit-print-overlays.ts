/**
 * usePrintOverlays — the résumé print page's free elements (`?kit=<id>` on
 * the print URL, set by the kit's Download PDF): the kit project's résumé
 * elements, rasterized one PNG per page on the résumé's paper (Letter / A4). `ready` gates the
 * print dialog so the PDF never misses them; no project → ready at once
 * with nothing to lay over. A failed read prints the résumé alone.
 */
import { useEffect, useState } from "react";
import type { PageSize } from "@/lib/studio/editor-v2/document-state";
import { studioService } from "@/lib/services/studio-service";
import { normalizeKitDocument } from "./kit-document";
import { kitPrintOverlays } from "./kit-print-overlays";

export function usePrintOverlays(projectId: string | null, paper: PageSize = "letter"): { ready: boolean; pages: Array<string | null> } {
  const [result, setResult] = useState<{ for: string; pages: Array<string | null> } | null>(null);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    const done = (pages: Array<string | null>) => {
      if (!cancelled) setResult({ for: projectId, pages });
    };
    studioService
      .getProject(projectId)
      .then((res) => kitPrintOverlays(normalizeKitDocument(res.data?.documentState, null), "resume", paper, 1, projectId))
      .then(done, () => done([]));
    return () => {
      cancelled = true;
    };
  }, [projectId, paper]);

  if (!projectId) return { ready: true, pages: [] };
  return result?.for === projectId ? { ready: true, pages: result.pages } : { ready: false, pages: [] };
}
