/** Widget-kind entries: speech-bubble, caption-box, sfx-burst.
 *
 *  Comic-native widgets — V1 has no SceneElement equivalent for bubbles /
 *  captions / SFX bursts. The v1 emit path is video-only and the comic
 *  kind never compiles down to V1, so they drop from it; the V2
 *  timeline-emit path carries them.
 *
 *  Text: comic dialogue + caption + SFX text — the spoken / narrated
 *  string is extracted so the AI rewriter can act on the comic the same
 *  way it acts on any other widget's text. SFX bursts are short ("POW!")
 *  but still count as authored content. */
import type { WidgetKindEntry } from "./types";
import { noScriptElement, widgetOf } from "./shared";

export const speechBubbleEntry: WidgetKindEntry<"speech-bubble"> = {
  create: (id) =>
    widgetOf(id, "speech-bubble", { x: 0.55, y: 0.1, width: 0.4, height: 0.22, z: 5, rotation: 0 }, {
      kind: "speech-bubble",
      data: {
        text: "I knew this case would catch up with me.",
        fontPx: 22,
        color: "#0a0a0a",
        bgColor: "#ffffff",
        strokeColor: "#0a0a0a",
        strokeWidth: 3,
        shape: "speech",
        // Default anchor sits below the bubble pointing down-left
        // at a typical character spot. The user drags the dot in
        // the inspector to retarget.
        tail: { anchorX: 0.4, anchorY: 0.55 },
      },
    }),
  toText: (data) => data.text.trim(),
  toScriptElement: noScriptElement,
};

export const captionBoxEntry: WidgetKindEntry<"caption-box"> = {
  create: (id) =>
    widgetOf(id, "caption-box", { x: 0.05, y: 0.05, width: 0.9, height: 0.1, z: 4, rotation: 0 }, {
      kind: "caption-box",
      data: {
        text: "MEANWHILE, ACROSS TOWN…",
        fontPx: 18,
        color: "#1c1917",
        bgColor: "#fef3c7",
        strokeColor: "#1c1917",
        strokeWidth: 2,
        italic: false,
      },
    }),
  toText: (data) => data.text.trim(),
  toScriptElement: noScriptElement,
};

export const sfxBurstEntry: WidgetKindEntry<"sfx-burst"> = {
  create: (id) =>
    widgetOf(id, "sfx-burst", { x: 0.35, y: 0.3, width: 0.25, height: 0.25, z: 6, rotation: -12 }, {
      kind: "sfx-burst",
      data: {
        text: "POW!",
        fontPx: 48,
        color: "#0a0a0a",
        bgColor: "#facc15",
        strokeColor: "#0a0a0a",
        strokeWidth: 4,
        shape: "star",
      },
    }),
  toText: (data) => data.text.trim(),
  toScriptElement: noScriptElement,
};
