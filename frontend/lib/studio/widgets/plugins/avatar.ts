/**
 * AI presenter avatar plugin (#1557). The presenter is painted by
 * `paintPresenter` on both sides (a raster op). The viseme comes from the
 * script indexed by clip-local time (~3 words/s × speed), so the watch page
 * lip-syncs like the export; the edit canvas shows the start pose.
 */
import type { AvatarWidgetParams, WidgetParams } from "@/lib/studio/editor-v2/canvas-state";
import { estimateVisemesForText, getPresenter, type Viseme } from "@/lib/studio/avatar/presenters";
import { paintPresenter } from "@/lib/studio/avatar/paint";
import type { TtsEngineId } from "@/lib/services/tts-engines";
import { numberOr, stringOr } from "../frame";
import { registerPlugin } from "../plugin";
import { optionalString, when } from "./shared";

type AvatarParams = Extract<WidgetParams, { data: AvatarWidgetParams }>;

/** The viseme a script shows at `clipTimeSec`; rest past the last word. */
export function visemeAt(script: string, speed: number, clipTimeSec: number): Viseme {
  if (!script) return "rest";
  const visemes = estimateVisemesForText(script);
  const wordIdx = Math.floor(clipTimeSec * 3 * Math.max(0.5, speed));
  return visemes[wordIdx] ?? "rest";
}

export const avatarPlugin = registerPlugin<AvatarParams>({
  effectKind: "canvas-v2:avatar",
  widgetKinds: ["avatar"],
  meta: {
    labelKey: "studio.effects.kind.aiPresenterAvatar",
    category: "transform",
    defaults: { x: 0.6, y: 0.1, width: 0.35, height: 0.8, presenterId: "presenter-amber", script: "", speed: 1 },
  },
  emit: (p) => ({
    presenterId: p.data.presenterId,
    script: p.data.script,
    engine: p.data.engine ?? "web-speech",
    voiceId: p.data.voiceId ?? "",
    speed: p.data.speed ?? 1,
    ...when("accentColor", p.data.accentColor),
    ...when("portraitSourceId", p.data.portraitSourceId),
    ...when("portraitFaceBbox", p.data.portraitFaceBbox),
    ...when("portraitMouthRegion", p.data.portraitMouthRegion),
  }),
  parse: (raw) => ({
    kind: "avatar",
    data: {
      presenterId: stringOr(raw.presenterId, "presenter-amber"),
      script: stringOr(raw.script, ""),
      engine: stringOr(raw.engine, "web-speech") as TtsEngineId,
      voiceId: stringOr(raw.voiceId, ""),
      speed: numberOr(raw.speed, 1),
      ...when("accentColor", optionalString(raw.accentColor)),
      ...when("portraitSourceId", optionalString(raw.portraitSourceId)),
      ...when("portraitFaceBbox", parseBbox(raw.portraitFaceBbox)),
      ...when("portraitMouthRegion", parsePoints(raw.portraitMouthRegion)),
    },
  }),
  draw({ data }, content, env) {
    const viseme = visemeAt(data.script, data.speed ?? 1, env.clipTimeSec);
    return [
      {
        op: "raster",
        box: content,
        key: `${data.presenterId}:${viseme}`,
        paint: (ctx, box) => paintPresenter(ctx, getPresenter(data.presenterId), viseme, box),
      },
    ];
  },
});

function parseBbox(v: unknown): AvatarWidgetParams["portraitFaceBbox"] {
  if (!v || typeof v !== "object") return undefined;
  const b = v as Record<string, unknown>;
  const n = (k: string) => (typeof b[k] === "number" ? (b[k] as number) : NaN);
  const box = { x: n("x"), y: n("y"), width: n("width"), height: n("height") };
  return Object.values(box).every(Number.isFinite) ? box : undefined;
}

function parsePoints(v: unknown): AvatarWidgetParams["portraitMouthRegion"] {
  if (!Array.isArray(v)) return undefined;
  const pts = v.filter(
    (p): p is { x: number; y: number } =>
      !!p && typeof p === "object" && typeof (p as { x?: unknown }).x === "number" && typeof (p as { y?: unknown }).y === "number",
  );
  return pts.length > 0 ? pts.map(({ x, y }) => ({ x, y })) : undefined;
}
