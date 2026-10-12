/**
 * The studio format registry: each canvas runtime (format-runtime's
 * `StudioRuntimeKey`) → its family's surface (left tabs, AI generator, host
 * rail tools, inspector, header Preview + history, strip) and its canvas
 * surface for CanvasRouter. Each surface is handed a context with ONLY the
 * runtime(s) it reads; the Timeline ctx is built only for the Timeline
 * family. The per-kind rules (family, `hasInspector`) are read from
 * lib/studio/editor-v2/format-runtime — never re-decided here or in a
 * surface. Adding a format is an entry there plus an entry here, never a
 * branch in StudioEditorV2.
 */
import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import FocusAiTab from "@/components/studio/v2/focus/FocusAiTab";
import type { CanvasRuntimeSurfaces } from "@/components/studio/v2/CanvasRouter";
import type { HeaderPreview } from "@/components/workspace/WorkspaceHeader";
import type { HistoryControls } from "@/lib/workspace/use-undo-shortcuts";
import type { StudioToolFamily } from "@/lib/workspace/studio-tool-slots";
import type { FocusLeftTab } from "@/lib/studio/use-focus-left-panel";
import type { HostRailTools } from "@/lib/studio/editor-v2/use-studio-rail";
import { FORMAT_RUNTIMES, type StudioRuntimeKey } from "@/lib/studio/editor-v2/format-runtime";
import type { StudioFormatCtx, StudioFormatSources, StudioFormatSurface, StudioInspector, TimelineSurfaceCtx } from "./types";
import { sceneImageGenerator } from "./shared";
import { timelineSurface } from "./timeline";
import { timelineCanvas } from "./timeline/timeline-canvas";
import { imageCanvas, imageSurface } from "./image";
import { animationCanvas, animationSurface } from "./animation";
import { gameSurface } from "./game";
import { gameCanvas } from "./game/game-canvas";
import { documentCanvas, documentSurface } from "./document";
import { cad3DCanvas, cadCanvas } from "./cad";
import { interactiveComicCanvas } from "./interactive-comic";

/** CAD and the rest: the AI tab only. */
const OTHER_SURFACE: StudioFormatSurface = { leftTabs: () => [], aiGenerator: sceneImageGenerator };

export interface ComposedStudioFormat {
  /** The shared AI tab, then the format's own tabs. */
  leftTabs: FocusLeftTab[];
  hostTools: HostRailTools;
  inspector: StudioInspector | null;
  preview: HeaderPreview | null;
  history: HistoryControls;
  strip: ReactNode;
  /** The runtime's canvas surface, for CanvasRouter. */
  canvas: CanvasRuntimeSurfaces;
}

/** Everything one bound surface contributes to the frame this render. */
function compose<C extends StudioFormatCtx>(
  family: StudioToolFamily,
  surface: StudioFormatSurface<C>,
  ctx: C,
  hasInspector: boolean,
  canvas: CanvasRuntimeSurfaces,
): ComposedStudioFormat {
  // ───── Left panel tabs (kind-aware contents for the ONE FocusLeftPanel)
  // AI tab generator: the kind's prompt panel (or the 3D world agent) moved
  // here from the right rail. Image keeps its DrawingAiPromptPanel on the right.
  const leftTabs: FocusLeftTab[] = [
    {
      id: "ai",
      label: ctx.t("studio.editorV2.panelAi"),
      icon: Sparkles,
      content: <FocusAiTab active={ctx.leftPanel.tab === "ai"} generate={surface.aiGenerator(ctx)} family={family} />,
    },
    ...surface.leftTabs(ctx),
  ];
  return {
    leftTabs,
    hostTools: surface.hostTools?.(ctx) ?? {},
    inspector: hasInspector ? (surface.inspector?.(ctx) ?? null) : null,
    preview: surface.preview?.(ctx) ?? null,
    history: surface.history?.(ctx) ?? ctx.canvasHistory,
    strip: surface.strip?.(ctx) ?? null,
    canvas,
  };
}

/** CanvasRouter falls back to `timeline` only for Timeline kinds; every
 *  other runtime's kind is routed to its own (always-defined) entry. */
const NO_TIMELINE_CANVAS = null;

type Binding = (
  base: StudioFormatCtx,
  src: StudioFormatSources,
  family: StudioToolFamily,
  hasInspector: boolean,
) => ComposedStudioFormat;

const timelineCtx = (base: StudioFormatCtx, src: StudioFormatSources): TimelineSurfaceCtx => ({
  ...base,
  timeline: src.timeline(),
});

const RUNTIME_SURFACES: Record<StudioRuntimeKey, Binding> = {
  timeline: (base, src, family, hasInspector) => {
    const ctx = timelineCtx(base, src);
    return compose(family, timelineSurface, ctx, hasInspector, { timeline: timelineCanvas(ctx) });
  },
  // Comic+ authors its pages on the Timeline shell, with its own canvas.
  interactive_comic: (base, src, family, hasInspector) =>
    compose(family, timelineSurface, timelineCtx(base, src), hasInspector, {
      timeline: NO_TIMELINE_CANVAS,
      interactive_comic: interactiveComicCanvas({ ...base, interactiveComic: src.runtimes.interactiveComic }),
    }),
  image: (base, src, family, hasInspector) => {
    const ctx = { ...base, image: src.runtimes.image };
    return compose(family, imageSurface, ctx, hasInspector, { timeline: NO_TIMELINE_CANVAS, image: imageCanvas(ctx) });
  },
  animation: (base, src, family, hasInspector) => {
    const ctx = { ...base, image: src.runtimes.image, animation: src.runtimes.animation };
    return compose(family, animationSurface, ctx, hasInspector, {
      timeline: NO_TIMELINE_CANVAS,
      animation: animationCanvas(ctx),
    });
  },
  game: (base, src, family, hasInspector) => {
    const ctx = { ...base, game: src.runtimes.game, gamePlaying: src.gamePlaying, setGamePlaying: src.setGamePlaying };
    return compose(family, gameSurface, ctx, hasInspector, { timeline: NO_TIMELINE_CANVAS, game: gameCanvas(ctx) });
  },
  document: (base, src, family, hasInspector) => {
    const ctx = { ...base, document: src.runtimes.document };
    return compose(family, documentSurface, ctx, hasInspector, {
      timeline: NO_TIMELINE_CANVAS,
      document: documentCanvas(ctx),
    });
  },
  cad: (base, src, family, hasInspector) =>
    compose(family, OTHER_SURFACE, base, hasInspector, {
      timeline: NO_TIMELINE_CANVAS,
      cad: cadCanvas({ ...base, cad: src.runtimes.cad }),
    }),
  cad_3d: (base, src, family, hasInspector) =>
    compose(family, OTHER_SURFACE, base, hasInspector, {
      timeline: NO_TIMELINE_CANVAS,
      cad_3d: cad3DCanvas({ ...base, cad3d: src.runtimes.cad3d }),
    }),
};

/** Everything the runtime's surface contributes to the frame this render. */
export function composeStudioFormat(
  runtimeKey: StudioRuntimeKey,
  base: StudioFormatCtx,
  src: StudioFormatSources,
): ComposedStudioFormat {
  const formatRuntime = FORMAT_RUNTIMES[runtimeKey];
  return RUNTIME_SURFACES[runtimeKey](base, src, formatRuntime.family, formatRuntime.hasInspector(src.runtimes));
}
