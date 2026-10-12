/**
 * useFittedCuts — the Post dock's fitted cuts (#2045). A network whose preset
 * the master doesn't fit (useChannelFit `variantFor`) is posted its own cut,
 * reframed and/or trimmed; networks with the same needs share one cut, which
 * is reused when already stored and rendered once otherwise
 * (publisher.core.ensureVariant → lib/studio/publish-variants).
 *
 * Self-gating: a surface whose publisher can't render cuts bakes nothing and
 * every network keeps the "doesn't fit" note. A cut that fails to render is
 * remembered — its networks post the master and show that note again (the
 * fallback) — until the master's frame or length changes (`shapeKey`), when
 * every cut is tried afresh.
 */
import { useCallback, useState } from "react";
import type { VariantSpec } from "@shared/publish-presets";
import type { PromotionPlatform } from "@shared/promotions";
import type { StudioProject } from "@/lib/services/studio-service";
import type { ShareChannelId } from "@/lib/studio/share-channels";
import type { PublishHandlers } from "@/lib/studio/use-publish-handlers";
import type { ChannelCuts, CutProgress } from "./usePostRun";
import { cutLabel } from "./useChannelFit";

const NONE: ReadonlySet<ShareChannelId> = new Set();

/** What cuts need from a publisher: render a cut (absent = this surface
 *  can't) and make sure the master is rendered. The editor's
 *  PublishHandlers is one; the Distribution Hub builds its own from the
 *  saved canvas. */
export interface CutPublisher {
  core: Pick<PublishHandlers["core"], "ensureVariant" | "ensureRendered">;
}

export function useFittedCuts(
  publisher: CutPublisher,
  variantFor: (channel: ShareChannelId) => VariantSpec | null,
  /** useChannelFit `shapeKey` — a new master shape clears remembered failures. */
  shapeKey: string,
) {
  const { ensureVariant, ensureRendered } = publisher.core;
  // Failures are stored with the shape they happened on; a different shape reads as none.
  const [failures, setFailures] = useState<{ shape: string; channels: ReadonlySet<ShareChannelId> }>({
    shape: shapeKey,
    channels: NONE,
  });
  const failed = failures.shape === shapeKey ? failures.channels : NONE;

  /** This network will be posted its own cut. */
  const bakes = useCallback(
    (channel: ShareChannelId): boolean => !!ensureVariant && !failed.has(channel) && variantFor(channel) !== null,
    [ensureVariant, failed, variantFor],
  );

  /** Make (or reuse) each distinct cut `channels` need, one at a time. Never throws. */
  const bakeCuts = useCallback(
    async (
      project: StudioProject,
      channels: readonly ShareChannelId[],
      report?: (cut: CutProgress | null) => void,
    ): Promise<ChannelCuts> => {
      if (!ensureVariant) return {};
      const groups = new Map<string, { spec: VariantSpec; channels: ShareChannelId[] }>();
      for (const channel of channels) {
        const spec = bakes(channel) ? variantFor(channel) : null;
        if (!spec) continue;
        const group = groups.get(spec.key);
        if (group) group.channels.push(channel);
        else groups.set(spec.key, { spec, channels: [channel] });
      }
      const cuts: ChannelCuts = {};
      const lost: ShareChannelId[] = [];
      for (const { spec, channels: group } of groups.values()) {
        const label = cutLabel(spec);
        report?.({ label, channels: group, progress: null });
        try {
          const cut = await ensureVariant(project, spec, (progress) => report?.({ label, channels: group, progress }));
          if (cut) for (const channel of group) cuts[channel] = cut.videoId;
          else lost.push(...group);
        } catch {
          lost.push(...group);
        }
      }
      report?.(null);
      if (lost.length > 0) setFailures({ shape: shapeKey, channels: new Set([...failed, ...lost]) });
      return cuts;
    },
    [bakes, ensureVariant, failed, shapeKey, variantFor],
  );

  /** Lane A: the cut to submit for a brand-channel platform (undefined = the
   *  master). Renders the master first when it is missing or stale, so the
   *  cut and the master show the same content. */
  const promotionCut = useCallback(
    async (platform: PromotionPlatform, report?: (cut: CutProgress | null) => void): Promise<string | undefined> => {
      if (!bakes(platform)) return undefined;
      const project = await ensureRendered();
      if (!project) return undefined;
      return (await bakeCuts(project, [platform], report))[platform];
    },
    [bakeCuts, bakes, ensureRendered],
  );

  return { bakes, bakeCuts, promotionCut };
}
