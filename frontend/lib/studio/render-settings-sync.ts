// render-settings-sync.ts — keep the editor's StudioProjectState fields that
// affect rendering (aspectRatio, resolution) in lock-step with the equivalent
// fields on script.video that the compiler reads. Without this mirror the
// dropdown in the Video sidebar appears to accept the user's choice but the
// preview canvas keeps its old size and a save persists the old value.

import type { StudioProjectState } from "@/types/studio";
import type { VideoScript } from "@/types/video-script";

export interface RenderSettingsSyncResult {
  /** Editor state with the patch applied AND the mirrored script.video fields. */
  next: StudioProjectState;
  /** True when at least one render-affecting field actually changed and a recompile is needed. */
  shouldRecompile: boolean;
}

/**
 * Apply a patch to StudioProjectState and, when the patch flips a render-
 * affecting field, mirror it onto the embedded script. The script object is
 * returned by reference inside `next.script` so the caller can hand it
 * straight to `compile()` without any further wiring.
 */
export function applyStateWithRenderSync(
  prev: StudioProjectState,
  patch: Partial<StudioProjectState>,
): RenderSettingsSyncResult {
  const next: StudioProjectState = { ...prev, ...patch };

  const aspectChanged     = patch.aspectRatio !== undefined && patch.aspectRatio !== prev.aspectRatio;
  const resolutionChanged = patch.resolution  !== undefined && patch.resolution  !== prev.resolution;

  if (!(aspectChanged || resolutionChanged) || !next.script) {
    return { next, shouldRecompile: false };
  }

  const updatedScript: VideoScript = {
    ...next.script,
    video: {
      ...next.script.video,
      ...(aspectChanged     ? { aspect:     patch.aspectRatio! } : {}),
      ...(resolutionChanged ? { resolution: patch.resolution!  } : {}),
    },
  };

  return {
    next: { ...next, script: updatedScript },
    shouldRecompile: true,
  };
}
