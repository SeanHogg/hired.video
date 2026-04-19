// Headless hook — persists a tool run to /api/tool-runs and invalidates
// every history cache the new row could appear in. Every full-page tool
// under /tools/* uses this after a successful run, so the admin
// tool-usage page, the user's own "View History" sheet, and any entity
// history panel all update consistently.
//
// Pair with <ToolHistoryButton /> (which handles the slide-out UI) to
// cover the end-to-end pattern in two lines per tool page.

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  toolRunsService,
  type CreateToolRunInput,
} from "@/lib/services/tool-runs-service";

export interface RecordToolRunArgs
  extends Omit<CreateToolRunInput, "toolId"> {
  /** Overrides the toolId captured by the hook — rarely needed. */
  toolIdOverride?: string;
}

export function useToolRunRecorder(toolId: string) {
  const queryClient = useQueryClient();

  const recordRun = useCallback(
    async (args: RecordToolRunArgs): Promise<void> => {
      const { toolIdOverride, ...payload } = args;
      const effectiveToolId = toolIdOverride ?? toolId;

      try {
        await toolRunsService.create({ ...payload, toolId: effectiveToolId });

        // Invalidate every history view the new row could show up in.
        // The "mine" views (per-tool + global) are the most common
        // consumers, entity views only exist when the caller attached
        // the run to a resume/job/etc.
        queryClient.invalidateQueries({
          queryKey: ["tool-runs", "mine", effectiveToolId],
        });
        queryClient.invalidateQueries({
          queryKey: ["tool-runs", "mine", "*"],
        });

        const entityPairs: Array<[string, string | undefined]> = [
          ["resume", payload.resumeId],
          ["job", payload.jobId],
          ["video", payload.videoId],
          ["template", payload.templateId],
          ["company", payload.companyId],
        ];
        for (const [entityType, entityId] of entityPairs) {
          if (!entityId) continue;
          queryClient.invalidateQueries({
            queryKey: ["tool-runs", "entity", entityType, entityId],
          });
        }
      } catch (err) {
        // Persisting must never block the user from seeing their result.
        // The run is already on screen; failing to record is a telemetry
        // gap, not a user-facing error.
        // eslint-disable-next-line no-console
        console.warn(`[useToolRunRecorder] failed to persist ${effectiveToolId}:`, err);
      }
    },
    [toolId, queryClient],
  );

  return { recordRun };
}
