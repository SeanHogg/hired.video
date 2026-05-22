/**
 * The single comic-page → CanvasState.Scene assembler.
 *
 * Two callers fan into this primitive — the static template seed
 * (`comicSeedFor()` in `template-seeds.ts`) and the AI-generated spec
 * hydrator (`comicSpecToCanvas()` in `comic-spec-to-canvas.ts`). Both
 * pass the same `ComicPageContent` shape and get back an identical
 * widget layout. This is the DRY / SOLID anchor for the comic
 * authoring path:
 *
 *   - Single source of truth for HOW a comic page lays out on the
 *     canvas (the widget mix + z-order + which slot reads which asset).
 *   - Single source of truth for the per-widget defaults (fonts,
 *     stroke widths, panel-frame radius, caption font size).
 *
 * If a comic page needs a new widget kind tomorrow, it's added here
 * and BOTH paths pick it up. Never branch on "is this an AI page or a
 * seed page" inside callers — they shouldn't know the difference.
 */

import type { ComicSpecLayout } from "@shared/comic-spec";
import type { ComicPalette } from "@shared/comic-genres";
import {
  defaultWidget,
  emptyScene,
  type Scene,
  type Widget,
} from "./canvas-state";

/** Content slot for one comic page. Same shape whether it came from a
 *  template seed or an LLM response — the assembler doesn't care. */
export interface ComicPageContent {
  /** Display label shown on the page rail. */
  label: string;
  /** Caption-box text (top narration ribbon). Empty string = no caption. */
  caption: string;
  /** Primary speaker's line. Empty string = no bubble. */
  protagonistLine: string;
  /** Whether the primary bubble reads as spoken or internal voice. */
  protagonistMode: "speech" | "thought";
  /** Second speaker's line. Empty string = single-speaker page. */
  otherLine: string;
  /** Loud SFX word (POW! / DOKI / DRIP). Empty string = no SFX. */
  sfx: string;
  /** Pre-resolved stock asset URLs. Null = skip the corresponding slot. */
  backgroundUrl: string | null;
  characterUrl: string | null;
  propUrl: string | null;
  /** Per-page page-length in seconds — repurposed as the dwell time when
   *  the comic is exported as a motion comic. Both paths pass 4 today. */
  durationSeconds?: number;
}

/** Assemble a CanvasState scene for one comic page. The widget mix +
 *  z-order is identical across all comic authoring paths.
 *
 *  Sole assembly point — `comicSeedFor()` and `comicSpecToCanvas()` are
 *  thin adapters that translate their respective inputs into
 *  `ComicPageContent` and call this. */
export function buildComicPage(
  content: ComicPageContent,
  palette: ComicPalette,
  layout: ComicSpecLayout,
): Scene {
  const widgets: Widget[] = [];

  // Per-slot `fit` policy — single SoT for "how does an asset fill its
  // slot in a comic page". Background fills its panel full-bleed so a
  // landscape SVG paints corner to corner; character + prop are
  // silhouettes whose proportions must be preserved (cropping cuts off
  // a hero's cape, a compass needle, etc.). Picking `contain` for
  // foreground assets fixed the user-reported "graphics don't render
  // correctly" bug — they were inheriting the previous `"cover"` default
  // and getting cropped to the slot's aspect ratio.
  if (content.backgroundUrl) {
    widgets.push(makeImageWidget(content.backgroundUrl, layout.bg, 0, "cover"));
  }
  widgets.push(makePanelFrameWidget(layout.panelFrame, palette.ink, 1));

  if (content.caption) {
    widgets.push(makeCaptionWidget(content.caption, layout.caption, palette, 4));
  }
  if (content.characterUrl) {
    widgets.push(makeImageWidget(content.characterUrl, layout.character, 3, "contain"));
  }
  if (content.propUrl) {
    widgets.push(makeImageWidget(content.propUrl, layout.prop, 3, "contain"));
  }
  if (content.protagonistLine) {
    widgets.push(
      makeSpeechBubbleWidget(
        content.protagonistLine,
        layout.bubble,
        palette,
        5,
        content.protagonistMode,
      ),
    );
  }
  if (content.otherLine) {
    widgets.push(
      makeSpeechBubbleWidget(
        content.otherLine,
        layout.otherBubble,
        palette,
        5,
        "speech",
      ),
    );
  }
  if (content.sfx) {
    widgets.push(makeSfxWidget(content.sfx, layout.sfx, palette, 6));
  }

  return {
    ...emptyScene(content.label),
    backgroundColor: palette.paper,
    durationSeconds: content.durationSeconds ?? 4,
    widgets,
  };
}

// ─── Canonical widget builders ──────────────────────────────────────────────
// One place owns "what does a comic image widget look like by default?",
// "what's the stroke width on the panel frame?", "what colour is a
// caption box?". Both the seed path and the AI-spec path call these —
// no second copy lives anywhere else in the codebase.

export function makeImageWidget(
  url: string,
  rect: { x: number; y: number; width: number; height: number },
  z: number,
  /** Object-fit for the slot. Defaults to "cover" (the historical
   *  behaviour). Comic foreground slots (character / prop) pass
   *  "contain" so silhouettes don't crop to the slot's aspect ratio.
   *  Backgrounds keep "cover" so a landscape SVG paints corner to
   *  corner with no letterbox bars. Single SoT — `buildComicPage`
   *  decides which slot gets which value; this helper just honours it. */
  fit: "cover" | "contain" | "stretch" = "cover",
): Widget {
  const w = defaultWidget("image");
  if (w.params.kind !== "image") throw new Error("unreachable");
  w.position = { ...rect, z, rotation: 0 };
  w.params.data.source = { kind: "url", url };
  w.params.data.fit = fit;
  return w;
}

export function makePanelFrameWidget(
  rect: { x: number; y: number; width: number; height: number },
  inkColor: string,
  z: number,
): Widget {
  // Thick black border around the panel — `shape-rect` with no fill +
  // a heavy stroke. The single place "what does a comic panel frame
  // look like" is decided. Adding a new genre that needs an unusual
  // frame (rounded? double-line?) is a tweak HERE, not in two places.
  const w = defaultWidget("shape-rect");
  if (w.params.kind !== "shape-rect") throw new Error("unreachable");
  w.position = { ...rect, z, rotation: 0 };
  w.params.data.fill = "transparent";
  w.params.data.strokeColor = inkColor;
  w.params.data.strokeWidth = 6;
  w.params.data.cornerRadius = 4;
  return w;
}

export function makeCaptionWidget(
  text: string,
  rect: { x: number; y: number; width: number; height: number },
  palette: ComicPalette,
  z: number,
  options: { italic?: boolean; fontPx?: number } = {},
): Widget {
  const w = defaultWidget("caption-box");
  if (w.params.kind !== "caption-box") throw new Error("unreachable");
  w.position = { ...rect, z, rotation: 0 };
  w.params.data.text = text;
  w.params.data.bgColor = palette.accent;
  w.params.data.color = palette.ink;
  w.params.data.strokeColor = palette.ink;
  w.params.data.italic = options.italic ?? false;
  w.params.data.fontPx = options.fontPx ?? 18;
  return w;
}

export function makeSpeechBubbleWidget(
  text: string,
  rect: { x: number; y: number; width: number; height: number },
  palette: ComicPalette,
  z: number,
  mode: "speech" | "thought",
  options: { fontPx?: number; tailAnchor?: { x: number; y: number } | null } = {},
): Widget {
  const w = defaultWidget("speech-bubble");
  if (w.params.kind !== "speech-bubble") throw new Error("unreachable");
  w.position = { ...rect, z, rotation: 0 };
  w.params.data.text = text;
  w.params.data.shape = mode;
  w.params.data.bgColor = palette.paper;
  w.params.data.color = palette.ink;
  w.params.data.strokeColor = palette.ink;
  w.params.data.fontPx = options.fontPx ?? 18;
  if (options.tailAnchor === undefined) {
    // Default tail points at the slot to the left of the bubble (where
    // the character image lives in `ComicSpecLayout`). Pass `null`
    // explicitly to render a tail-less floating bubble.
    w.params.data.tail = {
      anchorX: Math.max(0, rect.x - 0.05),
      anchorY: rect.y + rect.height,
    };
  } else if (options.tailAnchor === null) {
    w.params.data.tail = null;
  } else {
    w.params.data.tail = {
      anchorX: options.tailAnchor.x,
      anchorY: options.tailAnchor.y,
    };
  }
  return w;
}

export function makeSfxWidget(
  text: string,
  rect: { x: number; y: number; width: number; height: number; rotation?: number },
  palette: ComicPalette,
  z: number,
  options: { fontPx?: number; shape?: "star" | "jagged" | "circle-jagged" | "lightning" } = {},
): Widget {
  const w = defaultWidget("sfx-burst");
  if (w.params.kind !== "sfx-burst") throw new Error("unreachable");
  w.position = {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    z,
    rotation: rect.rotation ?? -12,
  };
  w.params.data.text = text;
  w.params.data.shape = options.shape ?? "star";
  w.params.data.bgColor = palette.accent;
  w.params.data.color = palette.ink;
  w.params.data.strokeColor = palette.ink;
  w.params.data.fontPx = options.fontPx ?? 36;
  return w;
}
