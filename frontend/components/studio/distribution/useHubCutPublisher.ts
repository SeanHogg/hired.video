/**
 * useHubCutPublisher — fitted cuts (#2045) for the Distribution Hub, which
 * has no editor open. A cut only needs the project's canvas: the saved
 * project is loaded through the normal project read, opened to the canvas
 * the editor would show (projectCanvasState), and handed to the same
 * `ensureVariant` the editor's Post dock uses (a stored cut is reused; a
 * new one renders in the browser and is hosted), with the master's
 * branding and campaign.
 *
 * Self-gating fallback: a non-video project, one with nothing on its
 * canvas, or one whose hosted master is stale (edited since its last
 * render — a cut must show what the master shows) gets no cut renderer, so
 * useFittedCuts bakes nothing and every network keeps its "doesn't fit"
 * note and is sent the master.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { studioService, type StudioProject } from "@/lib/services/studio-service";
import { useSubscription } from "@/lib/hooks/useSubscription";
import { useRemoveBrandingFlag } from "@/lib/studio/use-remove-branding-flag";
import { shouldShowBranding } from "@/lib/studio/branding-policy";
import { isProjectBakedFresh } from "@/lib/studio/baked-freshness";
import { useProjectCampaign } from "@/lib/campaigns/use-project-campaign";
import { ensureVariant, type VariantSource } from "@/lib/studio/publish-variants";
import { hasRenderableCanvas, projectCanvasState } from "@/lib/studio/editor-v2/project-canvas-state";
import type { CutPublisher } from "@/components/studio/v2/focus/useFittedCuts";

/**
 * Pure: what a cut of this saved project renders from, or null when the
 * Hub must post the master (not a video, nothing on the canvas, the hosted
 * master is stale, or the saved shape can't be opened).
 */
export function hubVariantSource(
  project: StudioProject | null,
  opts: { includeBranding: boolean; campaign?: VariantSource["campaign"] },
): VariantSource | null {
  if (!project || (project.mediaKind ?? "video") !== "video") return null;
  if (!isProjectBakedFresh(project)) return null;
  const canvas = safeCanvas(project);
  if (!hasRenderableCanvas(canvas)) return null;
  return { state: canvas, includeBranding: opts.includeBranding, campaign: opts.campaign };
}

export function useHubCutPublisher(projectId: string | null): { publisher: CutPublisher; canBakeCuts: boolean } {
  const { isPro } = useSubscription();
  const { removeBranding } = useRemoveBrandingFlag();
  const campaign = useProjectCampaign(projectId);
  const projectQuery = useQuery({
    queryKey: ["studio", "project", projectId],
    queryFn: async () => (await studioService.getProject(projectId!)).data,
    enabled: !!projectId,
    staleTime: 60_000,
  });
  const full: StudioProject | null = projectQuery.data ?? null;

  return useMemo(() => {
    const fresh = !!full && isProjectBakedFresh(full);
    const source = hubVariantSource(full, {
      includeBranding: shouldShowBranding({ isPro, removeBrandingFlag: removeBranding }),
      campaign,
    });
    const publisher: CutPublisher = {
      core: {
        ensureVariant: source
          ? (project, spec, onProgress) => ensureVariant({ projectId: project.id, title: full!.title, source, spec, onProgress })
          : undefined,
        // The Hub never renders the master: it posts the hosted render as is.
        ensureRendered: async () => (fresh ? full : null),
      },
    };
    return { publisher, canBakeCuts: source !== null };
  }, [full, isPro, removeBranding, campaign]);
}

/** A canvas that can't be rebuilt (unknown shape) falls back to the master. */
function safeCanvas(project: StudioProject) {
  try {
    return projectCanvasState(project);
  } catch {
    return null;
  }
}
