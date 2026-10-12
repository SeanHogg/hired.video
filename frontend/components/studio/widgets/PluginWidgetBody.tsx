/**
 * The DOM body of EVERY widget kind (#2312): look the kind's plugin up, let
 * it draw into the frame's content box with live text metrics, and render
 * the drawing. Embed ops mount the entity's live component — the linked
 * entity's own renderer, the engagement card that fetches its asset.
 */
import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { WidgetParams } from "@/lib/studio/editor-v2/canvas-state";
import { NO_LOOKUPS, type DrawEnv, type DrawLookups, type DrawOp } from "@/lib/studio/widgets/draw-ops";
import type { Box } from "@/lib/studio/widgets/frame";
import type { RenderContext } from "@/lib/studio/widgets/plugin";
import { pluginForWidgetKind } from "@/lib/studio/widgets/registry";
import { measurerFor, type Measure } from "@/lib/studio/widgets/text-layout";
import { useFontsVersion } from "@/hooks/use-fonts-version";
import EngagementAssetBody from "@/components/studio/v2/EngagementAssetBody";
import LinkedContentBody from "@/components/studio/v2/LinkedContentBody";
import WidgetDrawingView from "./WidgetDrawingView";

export interface PluginWidgetBodyProps {
  params: WidgetParams;
  /** The frame's content box in canvas px (`resolveFrame(...).content`). */
  content: Box;
  canvas: { width: number; height: number };
  render: RenderContext;
  clipTimeSec: number;
  clipDurationSec: number;
  isPlayback: boolean;
  /** Engagement-asset cards fetch their bound artifact from the project. */
  projectId: string | null;
  /** Text metrics; defaults to the browser's canvas metrics. */
  measure?: DrawEnv["measure"];
  /** Preloaded project data for embed fallbacks (live embeds fetch). */
  lookups?: DrawLookups;
  /** Draw embeds' fallback cards instead of mounting live components. */
  staticEmbeds?: boolean;
}

type EmbedOp = Extract<DrawOp, { op: "embed" }>;

/** The live component behind each embed op (a Record: a new embed kind
 *  without a view fails to compile). */
const EMBED_VIEWS: Record<EmbedOp["embed"], (params: WidgetParams, projectId: string | null) => ReactNode> = {
  "linked-content": (p) => (p.kind === "linked-content" ? <LinkedContentBody data={p.data} /> : null),
  "engagement-asset": (p, projectId) =>
    p.kind === "engagement-asset" ? <EngagementAssetBody data={p.data} projectId={projectId} /> : null,
};

/** Rough metrics where no 2D canvas exists (SSR, jsdom). */
function approximateMeasure(font: string): Measure {
  const px = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 16);
  return (s) => s.length * px * 0.55;
}

const browserMeasure: DrawEnv["measure"] = (font) => measurerFor(font) ?? approximateMeasure(font);

export default function PluginWidgetBody({
  params,
  content,
  canvas,
  render,
  clipTimeSec,
  clipDurationSec,
  isPlayback,
  projectId,
  measure = browserMeasure,
  lookups = NO_LOOKUPS,
  staticEmbeds = false,
}: PluginWidgetBodyProps) {
  const { t } = useTranslation();
  // Re-measure once web fonts finish loading.
  const fontsVersion = useFontsVersion();
  const { x, y, w, h } = content;
  const ops = useMemo(() => {
    const env: DrawEnv = {
      render,
      canvas,
      clipTimeSec,
      clipDurationSec,
      measure,
      t: (key, vars) => String(vars ? t(key, vars) : t(key)),
      lookups,
    };
    return pluginForWidgetKind(params.kind).draw(params, { x, y, w, h }, env);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, x, y, w, h, canvas.width, canvas.height, render, clipTimeSec, clipDurationSec, measure, lookups, t, fontsVersion]);

  const renderEmbed = (op: EmbedOp) => (staticEmbeds ? null : EMBED_VIEWS[op.embed](params, projectId));

  return <WidgetDrawingView ops={ops} content={content} playhead={{ clipTimeSec, isPlayback }} renderEmbed={renderEmbed} />;
}
