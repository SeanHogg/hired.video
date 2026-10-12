// Records one AI Tool run in /api/tool-runs and refreshes every history
// view the new row can appear in — the ONE writer for a finished run, used
// by the tool pages (useToolRunRecorder) and by the kit's run log
// (use-tool-runs.ts). Saving never blocks the result on screen: a failure
// is logged and resolves null.

import type { QueryClient } from "@tanstack/react-query";
import { toolRunsService, type CreateToolRunInput, type ToolRun } from "@/lib/services/tool-runs-service";

export async function saveToolRun(queryClient: QueryClient, input: CreateToolRunInput): Promise<ToolRun | null> {
  try {
    const saved = await toolRunsService.create(input);
    // The "mine" views (per-tool + global) and each anchor's own history.
    queryClient.invalidateQueries({ queryKey: ["tool-runs", "mine", input.toolId] });
    queryClient.invalidateQueries({ queryKey: ["tool-runs", "mine", "*"] });
    const anchors: Array<[string, string | undefined]> = [
      ["resume", input.resumeId],
      ["job", input.jobId],
      ["video", input.videoId],
      ["template", input.templateId],
      ["company", input.companyId],
      ["project", input.studioProjectId],
    ];
    for (const [entityType, entityId] of anchors) {
      if (entityId) queryClient.invalidateQueries({ queryKey: ["tool-runs", "entity", entityType, entityId] });
    }
    return saved;
  } catch (err) {
    // The run is already on screen; failing to record is a history gap,
    // not a user-facing error.
    // eslint-disable-next-line no-console
    console.warn(`[saveToolRun] failed to persist ${input.toolId}:`, err);
    return null;
  }
}
