/** Widget-kind entries: linked-content, engagement-asset, avatar, brand-kit.
 *  All V2-native — none has a v1 `SceneElement` equivalent, so each drops
 *  from the v1 emit; the V2 timeline-emit path renders them. */
import { makeEngagementAssetWidget, makeLinkedContentWidget } from "../canvas-model/bound-widgets";
import type { WidgetKindEntry } from "./types";
import { noScriptElement, noText, widgetOf } from "./shared";

export const linkedContentEntry: WidgetKindEntry<"linked-content"> = {
  create: () => makeLinkedContentWidget({ entityKind: "resume", entityId: "" }),
  // Entity body is fetched at render time, not authored here, so we
  // don't include it. The widget's presence still counts via the entity
  // kind label — useful for ATS readers who want to know "Resume
  // embedded here".
  toText: (data) => `[${data.entityKind} embedded]`,
  // v1's SceneElement union has no entity-card equivalent; the canvas +
  // render-side v2 applier is the source of truth for how it paints.
  toScriptElement: noScriptElement,
};

export const engagementAssetEntry: WidgetKindEntry<"engagement-asset"> = {
  create: () => makeEngagementAssetWidget({ assetKind: "video-form", assetId: "" }),
  toText: noText,
  toScriptElement: noScriptElement,
};

export const avatarEntry: WidgetKindEntry<"avatar"> = {
  create: (id) =>
    widgetOf(id, "avatar", { x: 0.6, y: 0.1, width: 0.35, height: 0.8, z: 5, rotation: 0 }, {
      kind: "avatar",
      data: {
        presenterId: "presenter-amber",
        script: "",
        engine: "web-speech",
        voiceId: "",
        speed: 1,
      },
    }),
  // The presenter's script IS its authored content — the AI rewriter,
  // captions extractor, and dubbing pipeline all consume it the same way
  // they consume a `text` widget's body.
  toText: (data) => data.script.trim(),
  // AI presenter avatar (#1557) renders via canvas-v2:avatar.
  toScriptElement: noScriptElement,
};

export const brandKitEntry: WidgetKindEntry<"brand-kit"> = {
  create: (id, position) =>
    widgetOf(id, "brand-kit", { ...position, x: 0.84, y: 0.84, width: 0.12, height: 0.12 }, {
      kind: "brand-kit",
      data: { brandKitId: "", logoUrl: "", opacity: 1 },
    }),
  toText: noText,
  // Brand kit (#577) is V2-native (`canvas-v2:brand`) — V1 has no
  // watermark SceneElement.
  toScriptElement: noScriptElement,
};
