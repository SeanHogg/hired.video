/**
 * Pixel-parity harness (#2312) — test-only, never built or routed. For each
 * case it renders ONE Timeline frame both ways, side by side:
 *   • `data-renderer="dom"`    the playback stage the watch page mounts
 *                              (`CanvasStage mode="playback"`)
 *   • `data-renderer="canvas"` the export compositor (`renderTimelineFrame`)
 * from the same CanvasState → `canvasStateToTimeline`. The Playwright spec
 * (widget-parity.pw.ts) screenshots both and diffs the pixels.
 *
 * `window.__parityReady` turns true once every canvas has painted.
 */
import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import "@/global.css";
import "@/lib/i18n/i18n";
import CanvasStage from "@/components/studio/v2/CanvasStage";
import { defaultWidget, emptyCanvasState, type CanvasState, type Widget, type WidgetKind } from "@/lib/studio/editor-v2/canvas-state";
import { canvasStateToTimeline } from "@/lib/studio/editor-v2/timeline-emit";
import { createRendererState, disposeRendererState, preloadSources, renderTimelineFrame } from "@/lib/timeline/frame-renderer";

const PARITY_WIDTH = 640;
const PARITY_HEIGHT = 360;
const FPS = 30;
/** The frame both renderers draw (0.5 s into the scene). */
const FRAME = 15;

interface ParityCase {
  id: string;
  kind: WidgetKind;
  /** Mutates the default widget into the case's shape. */
  shape?: (w: Widget) => void;
}

/** Self-contained kinds: no network media, no live entity embeds. */
const PARITY_CASES: ParityCase[] = [
  { id: "heading", kind: "heading" },
  { id: "shape-rect", kind: "shape-rect" },
  { id: "shape-circle", kind: "shape-circle" },
  { id: "divider", kind: "divider" },
  {
    id: "chips",
    kind: "chips",
    shape: (w) => {
      if (w.params.kind === "chips") w.params.data.chips = ["Figma", "Design systems", "Research"];
    },
  },
  {
    id: "cta",
    kind: "cta",
    shape: (w) => {
      if (w.params.kind === "cta") w.params.data.ctaUrl = "https://hired.video/people/maria-alvarez";
    },
  },
  { id: "speech-bubble", kind: "speech-bubble" },
  { id: "caption-box", kind: "caption-box" },
  { id: "sfx-burst", kind: "sfx-burst" },
];

function caseState(c: ParityCase): CanvasState {
  const state = emptyCanvasState({ width: PARITY_WIDTH, height: PARITY_HEIGHT, fps: FPS });
  const widget = defaultWidget(c.kind);
  widget.position = { x: 0.15, y: 0.15, width: 0.7, height: 0.7, z: 1, rotation: 0 };
  widget.visibleFrom = null;
  widget.visibleTo = null;
  widget.motion = null;
  c.shape?.(widget);
  state.scenes[0].widgets = [widget];
  return state;
}

// flexShrink 0: a row wider than the viewport must not shrink a box — a
// squeezed <canvas> is scaled down by CSS, so its glyphs come out narrower
// than the DOM's (that, not the renderers, was the "text drift").
const BOX = { width: PARITY_WIDTH, height: PARITY_HEIGHT, position: "relative" as const, overflow: "hidden" as const, flexShrink: 0 };

function ParityRow({ c, onPainted }: { c: ParityCase; onPainted: () => void }) {
  const state = useRef(caseState(c)).current;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scene = state.scenes[0];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const timeline = canvasStateToTimeline(state);
    const rs = createRendererState({});
    let cancelled = false;
    void (async () => {
      await preloadSources(timeline, rs);
      if (cancelled) return;
      await renderTimelineFrame(canvas, timeline, rs, FRAME);
      onPainted();
    })().finally(() => disposeRendererState(rs));
    return () => {
      cancelled = true;
    };
  }, [state, onPainted]);

  return (
    <div style={{ display: "flex", gap: 16, padding: 8 }}>
      <div data-case={c.id} data-renderer="dom" style={BOX}>
        <CanvasStage
          scene={scene}
          canvasWidth={state.width}
          canvasHeight={state.height}
          zoom={1}
          mode="playback"
          currentTimeSec={FRAME / FPS}
          selection={{ kind: "scene", sceneId: scene.id }}
          defaultFontId={state.fontFamily}
        />
      </div>
      <canvas data-case={c.id} data-renderer="canvas" ref={canvasRef} width={state.width} height={state.height} style={{ ...BOX, display: "block" }} />
    </div>
  );
}

declare global {
  interface Window {
    __parityReady?: boolean;
  }
}

let painted = 0;
const onPainted = () => {
  painted += 1;
  if (painted === PARITY_CASES.length) {
    void document.fonts.ready.then(() => {
      window.__parityReady = true;
    });
  }
};

createRoot(document.getElementById("root") as HTMLElement).render(
  <div>
    {PARITY_CASES.map((c) => (
      <ParityRow key={c.id} c={c} onPainted={onPainted} />
    ))}
  </div>,
);
