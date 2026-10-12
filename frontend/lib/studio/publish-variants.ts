/**
 * Fitted cuts for posting (#2045) — the ONE implementation behind "this
 * network needs a different cut": ask the API for the cut of THIS content
 * first (a stored cut is never rendered twice), else render it in the
 * browser through the export facade (`renderVariant`) and host it.
 *
 * The content revision is the master content's timeline hash — the same one
 * `hostRenderedVideo` stamps the master with (baked-freshness) — plus the
 * branding decision, so an unchanged project reuses its cut and a promotion
 * queued with a cut can tell, server side, whether the cut is still current.
 *
 * Pure of React; the Post dock owns progress state.
 */
import type { CampaignUtm } from "@shared/campaign-utm";
import { variantRevision, type VariantSpec } from "@shared/publish-presets";
import type { CanvasState } from "@/lib/studio/editor-v2/canvas-state";
import { canvasStateToTimeline } from "@/lib/studio/editor-v2/timeline-emit";
import { computeTimelineSpecHash } from "@/lib/studio/baked-freshness";
import { renderVariantService, type RenderVariant } from "@/lib/services/render-variant-service";

/** What a cut is rendered from — supplied by the surface holding the canvas. */
export interface VariantSource {
  state: CanvasState;
  /** Resolved branding decision (`shouldShowBranding`) — the master's. */
  includeBranding: boolean;
  campaign?: CampaignUtm | null;
}

/** The cut `spec` of `projectId`'s current content: the stored one, or a fresh
 *  render + upload. Null when there is nothing to render. Throws when the
 *  render or upload fails — the caller falls back to the master. */
export async function ensureVariant(args: {
  projectId: string;
  title: string;
  source: VariantSource;
  spec: VariantSpec;
  onProgress?: (progress: number) => void;
}): Promise<RenderVariant | null> {
  const { projectId, source, spec } = args;
  if (source.state.scenes.length === 0) return null;
  const revision = variantRevision(
    computeTimelineSpecHash(canvasStateToTimeline(source.state)),
    source.includeBranding,
  );
  const stored = await renderVariantService.find(projectId, spec.key, revision);
  if (stored) return stored;

  const { renderVariant } = await import("@/lib/studio/editor-v2/export-facade");
  const blob = await renderVariant({
    state: source.state,
    aspect: spec.aspect,
    trimToSec: spec.trimToSec,
    startSec: spec.startSec ?? null,
    includeBranding: source.includeBranding,
    projectId,
    campaign: source.campaign,
    onProgress: args.onProgress,
  });
  if (!blob) return null;
  return renderVariantService.upload(projectId, spec.key, {
    blob,
    contentRevision: revision,
    branded: source.includeBranding,
    title: args.title,
  });
}
