/**
 * Speech-bubble plugin (#939): the body outline per `shape`, a tail toward
 * the speaker (`tail` anchor in canvas fractions), and the line text bold +
 * centred inside the bubble (italic for thought).
 */
import type { SpeechBubbleWidgetParams, WidgetParams } from "@/lib/studio/editor-v2/canvas-state";
import { numberOr, stringOr, type Box } from "../frame";
import { registerPlugin } from "../plugin";
import type { DrawEnv, DrawOp } from "../draw-ops";
import type { TextStyle } from "../text-layout";
import { bubbleBodyOps, bubbleTailOps, freePuffOps } from "./comic-geometry";
import { oneOf, optionalString, textBlockOps, when } from "./shared";

type BubbleParams = Extract<WidgetParams, { data: SpeechBubbleWidgetParams }>;

const SHAPES = ["speech", "thought", "shout", "whisper"] as const;

export function speechBubbleOps(data: SpeechBubbleWidgetParams, content: Box, env: DrawEnv): DrawOp[] {
  const stroke = { color: data.strokeColor, width: data.strokeWidth };
  const tail = data.tail
    ? bubbleTailOps(data.shape, content, { x: data.tail.anchorX * env.canvas.width, y: data.tail.anchorY * env.canvas.height }, data.bgColor, stroke)
    : { under: [], over: data.shape === "thought" ? freePuffOps(content, data.bgColor, stroke) : [] };
  const style: TextStyle = {
    fontPx: data.fontPx,
    fontWeight: "bold",
    fontFamily: data.fontFamily || env.render.fontFamily,
    italic: data.shape === "thought",
  };
  // The text sits in the box inscribed in the outline.
  const area: Box = { x: content.x + content.w * 0.14, y: content.y + content.h * 0.16, w: content.w * 0.72, h: content.h * 0.62 };
  return [
    ...tail.under,
    ...bubbleBodyOps(data.shape, content, data.bgColor, stroke),
    ...tail.over,
    ...textBlockOps(data.text, style, area, env, data.color, "center", 1.2),
  ];
}

export const speechBubblePlugin = registerPlugin<BubbleParams>({
  effectKind: "canvas-v2:speech-bubble",
  widgetKinds: ["speech-bubble"],
  meta: {
    labelKey: "studio.effects.kind.speechBubble",
    category: "title",
    defaults: {
      x: 0.5, y: 0.2, width: 0.35, height: 0.18,
      bgColor: "#ffffff", strokeColor: "#0f172a", strokeWidth: 3, color: "#0f172a",
      text: "Hello!", fontPx: 24, fontFamily: "", shape: "speech", tailAnchorX: 0.55, tailAnchorY: 0.42,
    },
    paramHints: { bgColor: { type: "color" }, strokeColor: { type: "color" }, color: { type: "color" } },
  },
  emit: (p) => ({
    text: p.data.text,
    fontPx: p.data.fontPx,
    fontFamily: p.data.fontFamily ?? "",
    color: p.data.color,
    bgColor: p.data.bgColor,
    strokeColor: p.data.strokeColor,
    strokeWidth: p.data.strokeWidth,
    shape: p.data.shape,
    ...(p.data.tail ? { tailAnchorX: p.data.tail.anchorX, tailAnchorY: p.data.tail.anchorY } : {}),
  }),
  parse: (raw) => ({
    kind: "speech-bubble",
    data: {
      text: stringOr(raw.text, ""),
      fontPx: numberOr(raw.fontPx, 22),
      ...when("fontFamily", optionalString(raw.fontFamily)),
      color: stringOr(raw.color, "#0a0a0a"),
      bgColor: stringOr(raw.bgColor, "#ffffff"),
      strokeColor: stringOr(raw.strokeColor, "#0a0a0a"),
      strokeWidth: numberOr(raw.strokeWidth, 3),
      shape: oneOf(raw.shape, SHAPES, "speech"),
      tail:
        typeof raw.tailAnchorX === "number" && typeof raw.tailAnchorY === "number" && Number.isFinite(raw.tailAnchorX) && Number.isFinite(raw.tailAnchorY)
          ? { anchorX: raw.tailAnchorX, anchorY: raw.tailAnchorY }
          : null,
    },
  }),
  draw: ({ data }, content, env) => speechBubbleOps(data, content, env),
});
