/**
 * usePitchProject — Video Pitch Lab's link to the studio (#1237).
 *
 * "A pitch is just a pitch in the studio": each take is recorded into an
 * ordinary studio project with `purpose: "pitch"` (created through the
 * standard save-draft endpoint; WebcamRecorderWithUpload links the upload to
 * it via `projectId`). "Set as my pitch" then moves the per-user current-pitch
 * pointer, which every recruiter/visitor surface reads.
 *
 * Retaking while this session's project IS the live pitch forks a fresh
 * project, so a practice retake never silently replaces what recruiters see.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PITCH_PURPOSE, type PitchSummary } from "@shared/pitch";
import { studioService } from "@/lib/services/studio-service";
import { getCurrentPitch, setCurrentPitch } from "@/lib/services/video-pitch-service";

export const CURRENT_PITCH_QUERY_KEY = ["video-pitch", "current"] as const;

export function usePitchProject(opts: { enabled: boolean; projectName: string }) {
  const queryClient = useQueryClient();
  const { data: currentPitch = null } = useQuery<PitchSummary | null>({
    queryKey: CURRENT_PITCH_QUERY_KEY,
    queryFn: getCurrentPitch,
    enabled: opts.enabled,
  });
  const [projectId, setProjectId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isCurrent = !!projectId && currentPitch?.projectId === projectId;

  /** The project the next take records into — reuses this session's draft
   *  unless it is the live pitch (then forks a new one). */
  async function prepareTake(script: string): Promise<string> {
    if (projectId && !isCurrent) return projectId;
    const res = await studioService.saveDraft({
      name: opts.projectName,
      resumeText: script,
      purpose: PITCH_PURPOSE,
      mediaKind: "video",
    });
    setProjectId(res.data.id);
    return res.data.id;
  }

  async function applyCurrent(next: string | null): Promise<void> {
    setSaving(true);
    try {
      const pitch = await setCurrentPitch(next);
      queryClient.setQueryData(CURRENT_PITCH_QUERY_KEY, pitch);
    } finally {
      setSaving(false);
    }
  }

  return {
    currentPitch,
    projectId,
    isCurrent,
    saving,
    prepareTake,
    /** "Set as my pitch" for this session's project. */
    makeCurrent: () => (projectId ? applyCurrent(projectId) : Promise.resolve()),
    /** Remove the pitch from the profile (keeps the project in the studio). */
    removeCurrent: () => applyCurrent(null),
  };
}
