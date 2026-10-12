/**
 * The widget plugin contract (#2312). One plugin per widget kind owns
 * everything kind-specific:
 *
 *   emit    widget data → flat `canvas-v2:*` clip params   (save + export)
 *   parse   clip params → widget data                       (load)
 *   draw    widget data → a renderer-neutral drawing (draw-ops.ts) inside
 *           the frame's content box — rendered by the DOM stage
 *           (components/studio/widgets/WidgetDrawingView) AND painted by
 *           the export (`paint`, built here from `draw`)
 *   interactions (optional) clip params → what a viewer can DO with the
 *           widget during playback (open a CTA link, fill a form, …). Pure
 *           data; the watch-page overlay derives every clickable zone from
 *           it (interactions.ts), never from a list of effect kinds
 *
 * The frame (box, chrome, motion, effects) is NOT a plugin concern:
 * frame.ts resolves it once for both renderers.
 *
 * React-free: the export pipeline imports this.
 */
import type { EffectDefinition } from "@/lib/timeline/effects/registry";
import type { EngagementAssetKind } from "@/lib/studio/editor-v2/engagement-assets";
import type { WidgetKind, WidgetParams } from "@/lib/studio/editor-v2/canvas-state";
import type { LinkedContentKind } from "@/lib/studio/editor-v2/linked-content";
import type { Box, EffectEntry } from "./frame";
import type { Ctx2D } from "./frame-canvas";
import type { DrawEnv, DrawOp } from "./draw-ops";
import { paintOps, type PaintMedia } from "./paint-ops";

/** Who a drawing is for:
 *   • interactive — the editor stage, the watch page and any preview: a
 *                   viewer can click (the playback overlay adds the zones)
 *   • export      — a downloaded or posted file: nothing is clickable, so a
 *                   plugin may add a visible fallback (the CTA's link + QR)
 *  The export stamps it on every widget clip (`withExportTarget`). */
export type RenderTarget = "interactive" | "export";

/** Values both renderers need that come from the project, not the widget.
 *  The DOM stage passes them live; the export reads them off the clip. */
export interface RenderContext {
  /** CSS font-family stack for the project font (`fontFamilyFor`). */
  fontFamily: string;
  target: RenderTarget;
}

/** What the export must load before its first frame paints. */
export interface WidgetAssets {
  images?: string[];
  videos?: string[];
  linkedContent?: Array<{ kind: LinkedContentKind; id: string }>;
  /** Payloads drawn as QR codes when exporting — the export loads the QR
   *  encoder only when some widget declares one (`withExportTarget`). */
  qrCodes?: string[];
}

/** What a viewer can do with a widget during playback (#2312). The zone is
 *  the widget's own painted box and visible window.
 *   • cta         — opens `url` in a new tab; counted by the cta-click tracker
 *   • engagement  — the bound form / chapter / thumbnail / review pin
 *                   (components/video/EngagementZonesOverlay) */
export type WidgetInteraction =
  | { kind: "cta"; url: string }
  | { kind: "engagement"; assetKind: EngagementAssetKind; assetId: string };

export interface WidgetPlugin<P extends WidgetParams> {
  /** The clip effect kind it emits and paints, e.g. `canvas-v2:text`. */
  effectKind: string;
  /** Widget kinds it owns (text + heading share one plugin). */
  widgetKinds: ReadonlyArray<P["kind"]>;
  /** Effect-registry metadata for the export painter. */
  meta: Pick<EffectDefinition, "labelKey" | "category" | "defaults" | "paramHints">;
  /** Shows a playing video — a still export seeks it first. */
  playsVideo?: boolean;
  emit(params: P): Record<string, unknown>;
  parse(raw: Record<string, unknown>): P;
  /** The drawing inside `content` (canvas px). Pure. `env.render.target`
   *  says whether a viewer can click it: an interactive widget whose
   *  action an exported file can't carry draws its own fallback for
   *  `"export"` (the CTA's readable link + QR). */
  draw(params: P, content: Box, env: DrawEnv): DrawOp[];
  /** Media / entity data the export preloads. */
  assets?(params: P): WidgetAssets;
  /** Pixel-pass effects implied by the widget's own data (chroma key). */
  pixelEffects?(params: P): EffectEntry[];
  /** Playback interactions, read off the EMITTED clip params — the same
   *  params the saved Timeline carries and the API reads — so a watch page
   *  needs no parse. Omit for a kind a viewer can't interact with. */
  interactions?(clip: Record<string, unknown>): WidgetInteraction[];
}

/** A plugin callable with any WidgetParams: `owns` is the runtime guard,
 *  and the typed methods reject params of a kind the plugin doesn't own.
 *  Lets plugins of different kinds share one registry. */
export interface RegisteredWidgetPlugin<P extends WidgetParams = WidgetParams> {
  effectKind: string;
  widgetKinds: ReadonlyArray<WidgetKind>;
  meta: WidgetPlugin<WidgetParams>["meta"];
  playsVideo: boolean;
  owns(params: WidgetParams): params is P;
  emit(params: WidgetParams): Record<string, unknown>;
  parse(raw: Record<string, unknown>): WidgetParams;
  draw(params: WidgetParams, content: Box, env: DrawEnv): DrawOp[];
  /** Canvas2D render: the frame is already applied to `ctx`. */
  paint(ctx: Ctx2D, content: Box, params: WidgetParams, env: DrawEnv, media: PaintMedia): void;
  assets(params: WidgetParams): WidgetAssets;
  pixelEffects(params: WidgetParams): EffectEntry[];
  /** True when the plugin declares `interactions` — lets a Timeline walk
   *  skip every other effect without calling it. */
  interactive: boolean;
  interactions(clip: Record<string, unknown>): WidgetInteraction[];
}

export function registerPlugin<P extends WidgetParams>(plugin: WidgetPlugin<P>): RegisteredWidgetPlugin<P> {
  const kinds: ReadonlyArray<string> = plugin.widgetKinds;
  const owns = (params: WidgetParams): params is P => kinds.includes(params.kind);
  const expect = (params: WidgetParams): P => {
    if (!owns(params)) throw new Error(`${plugin.effectKind} does not own widget kind "${params.kind}"`);
    return params;
  };
  const draw = (params: WidgetParams, content: Box, env: DrawEnv) => plugin.draw(expect(params), content, env);
  return {
    effectKind: plugin.effectKind,
    widgetKinds: plugin.widgetKinds,
    meta: plugin.meta,
    playsVideo: plugin.playsVideo ?? false,
    owns,
    emit: (params) => plugin.emit(expect(params)),
    parse: (raw) => plugin.parse(raw),
    draw,
    paint: (ctx, content, params, env, media) => paintOps(ctx, draw(params, content, env), media),
    assets: (params) => plugin.assets?.(expect(params)) ?? {},
    pixelEffects: (params) => plugin.pixelEffects?.(expect(params)) ?? [],
    interactive: !!plugin.interactions,
    interactions: (clip) => plugin.interactions?.(clip) ?? [],
  };
}
