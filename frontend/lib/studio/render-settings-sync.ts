// render-settings-sync.ts — keep the editor's StudioProjectState fields that
// affect rendering (aspectRatio, resolution, codec, container, audioCodec)
// in lock-step with the equivalent fields on script.video that the compiler
// + exporter read. Without this mirror the picker appears to accept the
// user's choice but the preview canvas / saved row keeps the old value.

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
 *
 * Per the user's "settings live on the project" rule, `codec`, `container`,
 * and `audioCodec` mirror onto script.video too, so saveDraft persists the
 * encode preset alongside resolution/aspect.
 */
export function applyStateWithRenderSync(
  prev: StudioProjectState,
  patch: Partial<StudioProjectState>,
): RenderSettingsSyncResult {
  const next: StudioProjectState = { ...prev, ...patch };

  const aspectChanged      = patch.aspectRatio !== undefined && patch.aspectRatio !== prev.aspectRatio;
  const resolutionChanged  = patch.resolution  !== undefined && patch.resolution  !== prev.resolution;
  const codecChanged       = patch.codec       !== undefined && patch.codec       !== prev.codec;
  const containerChanged   = patch.container   !== undefined && patch.container   !== prev.container;
  const audioCodecChanged  = patch.audioCodec  !== undefined && patch.audioCodec  !== prev.audioCodec;

  const anyRenderFieldChanged =
    aspectChanged || resolutionChanged || codecChanged || containerChanged || audioCodecChanged;

  if (!anyRenderFieldChanged || !next.script) {
    return { next, shouldRecompile: false };
  }

  const updatedScript: VideoScript = {
    ...next.script,
    video: {
      ...next.script.video,
      ...(aspectChanged     ? { aspect:     patch.aspectRatio! } : {}),
      ...(resolutionChanged ? { resolution: patch.resolution!  } : {}),
      ...(codecChanged      ? { codec:      patch.codec!       } : {}),
      ...(containerChanged  ? { container:  patch.container!   } : {}),
      ...(audioCodecChanged ? { audioCodec: patch.audioCodec!  } : {}),
    },
  };

  // Codec / container / audioCodec changes don't affect the canvas
  // size, so we only ask for a recompile when an actually-visual
  // field changed. The exporter reads codec at export time.
  const shouldRecompile = aspectChanged || resolutionChanged;
  return {
    next: { ...next, script: updatedScript },
    shouldRecompile,
  };
}
