/**
 * DOM side of the widget frame (#2312): the CSS for a widget's outer box
 * from the same `ResolvedFrame` the export painter applies (frame-canvas.ts).
 * Position stays in % so it survives the stage's zoom transform.
 */
import type { CSSProperties } from "react";
import type { ResolvedFrame } from "./frame";

export function frameToCss(frame: ResolvedFrame): CSSProperties {
  const { input, animate } = frame;
  const css: CSSProperties = {
    left: `${input.x * 100}%`,
    top: `${input.y * 100}%`,
    width: `${input.width * 100}%`,
    height: `${input.height * 100}%`,
    zIndex: input.z,
    transformOrigin: "center",
  };

  // Animate output composes BEFORE the authored rotation — the export's order.
  const transform: string[] = [];
  if (animate.tx !== 0 || animate.ty !== 0) {
    transform.push(`translate(${(animate.tx * 100).toFixed(2)}%, ${(animate.ty * 100).toFixed(2)}%)`);
  }
  if (animate.scale !== 1) transform.push(`scale(${animate.scale.toFixed(4)})`);
  if (input.rotation !== 0) transform.push(`rotate(${input.rotation}deg)`);
  if (transform.length > 0) css.transform = transform.join(" ");

  const alpha = animate.alpha * frame.opacity;
  if (alpha < 1) css.opacity = alpha;
  if (frame.blendMode) css.mixBlendMode = frame.blendMode;
  if (frame.filters.length > 0) {
    css.filter = frame.filters
      .map((f) => (f.kind === "blur" ? `blur(${f.px}px)` : `drop-shadow(0 0 ${f.radius}px rgba(255,255,255,${f.alpha.toFixed(2)}))`))
      .join(" ");
  }

  const chrome = input.chrome;
  if (chrome) {
    if (chrome.backgroundColor) css.backgroundColor = chrome.backgroundColor;
    if (frame.borderWidth > 0) css.border = `${frame.borderWidth}px solid ${chrome.borderColor}`;
    if (chrome.borderRadius) css.borderRadius = chrome.borderRadius;
    if (chrome.padding) css.padding = chrome.padding;
  }
  return css;
}
