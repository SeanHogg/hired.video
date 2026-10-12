// Headless hook — persists a tool run to /api/tool-runs and invalidates
// every history cache the new row could appear in. Every full-page tool
// under /tools/* uses this after a successful run, so the admin
// tool-usage page, the user's own "View History" sheet, and any entity
// history panel all update consistently.
//
// Pair with <ToolHistoryButton /> (which handles the slide-out UI) to
// cover the end-to-end pattern in two lines per tool page.
//
// Embedded in a host page (tool-embed.tsx — the kit slide-out), the run
// is saved on the host's résumé and studio session, then reported to the
// host (with its saved id), so it shows in the host's chat and stage status
// like a run started there — and comes back when the session reopens.

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { CreateToolRunInput } from "@/lib/services/tool-runs-service";
import { saveToolRun } from "@/lib/tools/save-tool-run";
import { useToolEmbed } from "@/lib/tools/tool-embed";

export interface RecordToolRunArgs
  extends Omit<CreateToolRunInput, "toolId"> {
  /** Overrides the toolId captured by the hook — rarely needed. */
  toolIdOverride?: string;
}

export function useToolRunRecorder(toolId: string) {
  const queryClient = useQueryClient();
  const embed = useToolEmbed();

  const recordRun = useCallback(
    async (args: RecordToolRunArgs): Promise<void> => {
      const { toolIdOverride, ...payload } = args;
      const effectiveToolId = toolIdOverride ?? toolId;
      // Embedded, the run belongs to the host's résumé and session too.
      const saved = await saveToolRun(queryClient, {
        ...payload,
        toolId: effectiveToolId,
        resumeId: payload.resumeId ?? embed?.resumeId,
        studioProjectId: payload.studioProjectId ?? embed?.projectId ?? undefined,
      });
      embed?.report(effectiveToolId, payload.result, saved?.id ?? null);
    },
    [toolId, queryClient, embed],
  );

  return { recordRun };
}
