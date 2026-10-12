/** The empty-state card image / video / webcam widgets show before they
 *  have media. `editorOnly` hides it from playback and the export (the
 *  webcam keeps its card in the export so the layout reads). */
import type { Box } from "../frame";
import type { DrawEnv, DrawOp } from "../draw-ops";
import { fontShorthand, type TextStyle } from "../text-layout";
import { fitOneLine } from "./shared";

export const PLACEHOLDER_FILL = "rgba(20,20,28,0.6)";
export const PLACEHOLDER_TEXT = "#94a3b8";

export function mediaPlaceholderOps(content: Box, env: DrawEnv, labelKey: string, editorOnly: boolean): DrawOp[] {
  const fontPx = Math.max(10, Math.min(18, Math.round(content.h * 0.08)));
  const font: TextStyle = { fontPx, fontWeight: "normal", fontFamily: env.render.fontFamily };
  const label = fitOneLine(env.t(labelKey), Math.max(0, content.w - 16), env.measure(fontShorthand(font)));
  const flag = editorOnly ? { editorOnly: true } : {};
  return [
    { op: "rect", box: content, fill: PLACEHOLDER_FILL, ...flag },
    { op: "text", text: label, x: content.x + content.w / 2, y: content.y + content.h / 2, font, color: PLACEHOLDER_TEXT, align: "center", ...flag },
  ];
}
