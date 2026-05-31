/**
 * `PageVideoSpec` (server scaffolder output) → `CanvasState` (editor input).
 *
 * The scaffolder decides the WORDS + which image goes where + the beat
 * structure; this adapter decides the VISUAL LAYOUT — one deterministic
 * arrangement per scene kind so an AI-built draft looks like a polished
 * template the moment it opens, and the operator only has to tweak.
 *
 * Single consumer: the `generate_video_from_page` tool's commit step
 * (registry.ts), which calls `POST /api/studio/generate-from-page`, runs
 * the returned spec through this function, then mints a video project.
 *
 * Mirrors `comic-spec-to-canvas.ts` (spec → CanvasState adapter pattern).
 */

import {
  pageVideoDimensions,
  type PageVideoPalette,
  type PageVideoScene,
  type PageVideoSpec,
} from "@shared/page-video-spec";
import {
  defaultWidget,
  emptyCanvasState,
  emptyScene,
  type CanvasState,
  type Scene,
  type Widget,
  type WidgetPosition,
} from "./canvas-state";

function pos(
  x: number,
  y: number,
  width: number,
  height: number,
  z = 1,
): WidgetPosition {
  return { x, y, width, height, z, rotation: 0 };
}

function text(
  body: string,
  position: WidgetPosition,
  opts: {
    fontPx: number;
    color: string;
    align?: "left" | "center" | "right";
    bold?: boolean;
    heading?: boolean;
  },
): Widget {
  const base = defaultWidget(opts.heading ? "heading" : "text");
  return {
    ...base,
    position,
    params: {
      kind: opts.heading ? "heading" : "text",
      data: {
        text: body,
        fontPx: opts.fontPx,
        color: opts.color,
        fontWeight: opts.bold ? "bold" : "normal",
        align: opts.align ?? "center",
        background: null,
      },
    },
  } as Widget;
}

function image(url: string, alt: string, position: WidgetPosition): Widget {
  const base = defaultWidget("image");
  return {
    ...base,
    position,
    params: {
      kind: "image",
      data: { source: { kind: "url", url }, fit: "cover", altText: alt || undefined },
    },
  } as Widget;
}

function ctaWidget(
  scene: PageVideoScene,
  palette: PageVideoPalette,
  position: WidgetPosition,
): Widget {
  const base = defaultWidget("cta");
  return {
    ...base,
    position,
    params: {
      kind: "cta",
      data: {
        headline: scene.headline,
        subheadline: scene.subhead || undefined,
        ctaText: scene.ctaText || "Learn more",
        ctaUrl: scene.ctaUrl || "",
        bgColor: palette.background,
        textColor: palette.text,
        accentColor: palette.accent,
        accentTextColor: palette.background,
        cardFontPx: 52,
        ctaFontPx: 30,
      },
    },
  } as Widget;
}

/** Build one scene's worth of widgets, laid out for its kind. Font sizes
 *  are tuned for portrait (1080w); the renderer scales to other aspects. */
function buildScene(scene: PageVideoScene, palette: PageVideoPalette): Scene {
  const widgets: Widget[] = [];
  const gradientHook = `gradient:${palette.background}:#1e293b`;
  let backgroundEffect: string | null = null;

  switch (scene.kind) {
    case "hook": {
      backgroundEffect = gradientHook;
      if (scene.imageUrl) {
        widgets.push(image(scene.imageUrl, scene.headline, pos(0.08, 0.1, 0.84, 0.44, 1)));
        widgets.push(
          text(scene.headline, pos(0.08, 0.6, 0.84, 0.2, 2), {
            fontPx: 84,
            color: palette.text,
            bold: true,
          }),
        );
        if (scene.subhead) {
          widgets.push(
            text(scene.subhead, pos(0.08, 0.81, 0.84, 0.12, 2), {
              fontPx: 40,
              color: palette.muted,
            }),
          );
        }
      } else {
        widgets.push(
          text(scene.headline, pos(0.1, 0.34, 0.8, 0.24, 2), {
            fontPx: 96,
            color: palette.text,
            bold: true,
          }),
        );
        if (scene.subhead) {
          widgets.push(
            text(scene.subhead, pos(0.1, 0.6, 0.8, 0.14, 2), {
              fontPx: 42,
              color: palette.muted,
            }),
          );
        }
      }
      break;
    }

    case "stat": {
      backgroundEffect = gradientHook;
      if (scene.headline) {
        widgets.push(
          text(scene.headline, pos(0.1, 0.16, 0.8, 0.1, 2), {
            fontPx: 44,
            color: palette.muted,
          }),
        );
      }
      widgets.push(
        text(scene.stat || scene.headline, pos(0.06, 0.34, 0.88, 0.24, 3), {
          fontPx: 180,
          color: palette.accent,
          bold: true,
        }),
      );
      if (scene.statCaption) {
        widgets.push(
          text(scene.statCaption, pos(0.1, 0.6, 0.8, 0.14, 2), {
            fontPx: 44,
            color: palette.text,
          }),
        );
      }
      break;
    }

    case "cta": {
      backgroundEffect = gradientHook;
      widgets.push(ctaWidget(scene, palette, pos(0.1, 0.3, 0.8, 0.4, 10)));
      break;
    }

    case "point":
    default: {
      widgets.push(
        text(scene.headline, pos(0.08, 0.1, 0.84, 0.14, 2), {
          fontPx: 64,
          color: palette.text,
          align: "left",
          bold: true,
        }),
      );
      const bulletsY = scene.imageUrl ? 0.62 : 0.3;
      if (scene.imageUrl) {
        widgets.push(image(scene.imageUrl, scene.headline, pos(0.08, 0.26, 0.84, 0.32, 1)));
      }
      const bulletBody =
        scene.bullets.length > 0
          ? scene.bullets.map((b) => `•  ${b}`).join("\n")
          : scene.subhead;
      if (bulletBody) {
        widgets.push(
          text(bulletBody, pos(0.08, bulletsY, 0.84, 0.3, 2), {
            fontPx: 46,
            color: palette.text,
            align: "left",
          }),
        );
      }
      break;
    }
  }

  return {
    ...emptyScene(scene.label),
    durationSeconds: scene.durationSeconds,
    backgroundColor: palette.background,
    backgroundEffect,
    widgets,
  };
}

export function pageVideoSpecToCanvas(spec: PageVideoSpec): CanvasState {
  const { width, height } = pageVideoDimensions(spec.aspect);
  return {
    ...emptyCanvasState({ width, height, fps: 30 }),
    // 4-slot theme [primary, accent, surface, contrast] so the editor's
    // palette swatches match the generated video.
    colorPalette: [
      spec.palette.background,
      spec.palette.accent,
      "#1e293b",
      spec.palette.text,
    ],
    scenes: spec.scenes.map((scene) => buildScene(scene, spec.palette)),
  };
}
