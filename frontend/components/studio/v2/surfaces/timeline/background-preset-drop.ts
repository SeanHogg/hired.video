/**
 * A background preset dropped onto a scene (the canvas or a ScenesRail tile,
 * #589): re-skin THAT scene through the one BG_PRESETS →
 * scenePatchFromBgPreset seam, then confirm with a toast.
 */
import { BG_PRESETS, scenePatchFromBgPreset } from "@/lib/studio/visual-themes";
import type { TimelineSurfaceCtx } from "../types";

export function dropBackgroundPreset(ctx: TimelineSurfaceCtx, sceneId: string, bgValue: string): void {
  const preset = BG_PRESETS.find((p) => p.value === bgValue);
  if (!preset) return;
  ctx.timeline.mutators.updateScene(sceneId, scenePatchFromBgPreset(preset));
  ctx.toast({ title: ctx.t("studio.editor.backgroundToast", { label: preset.label }) });
}
