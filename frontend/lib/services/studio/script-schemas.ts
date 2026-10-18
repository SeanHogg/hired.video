// VideoScript / Storyboard Zod schemas — split out of studio-service.ts
// (which re-exports everything here under the same names).
import { z } from "zod";
import { STUDIO_PURPOSES } from "@shared/studio-purposes";
import { SCENE_TYPES } from "@shared/scene-types";

export const studioPurposeSchema = z.enum(STUDIO_PURPOSES);

// ─── VideoScript Zod schema (mirrors the TypeScript type) ────────────────────
// Used only for API response validation — the authoritative types live in
// frontend/types/video-script.ts.

const AnimationSpecSchema = z.object({
  type: z.enum(["fadeIn", "slideUp", "slideIn", "scaleIn", "typewriter", "none"]),
  start: z.number(),
  duration: z.number(),
  easing: z.enum(["linear", "easeIn", "easeOut", "easeInOut", "spring"]).optional(),
});

// SceneEffect lives on `SceneScript.effects`. New writes use the
// `{kind, params}` shape (matches the shared effect registry); legacy
// rows used `{type, intensity}` and are migrated on parse so every
// downstream consumer sees the canonical shape. Single source of
// truth for the on-disk shape — every persistence path routes here.
const SceneEffectSchema = z
  .union([
    z.object({ kind: z.string(), params: z.record(z.string(), z.unknown()).default({}) }),
    z.object({
      type: z.enum(["particles", "blur", "glow", "vignette"]),
      intensity: z.number(),
    }),
  ])
  .transform((raw) => {
    if ("kind" in raw) return { kind: raw.kind, params: raw.params ?? {} };
    return { kind: raw.type, params: { intensity: raw.intensity } };
  });

// Free-form scene elements (text/image/video/audio with % positioning)
const ElementBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});

const ElementStyleSchema = z.object({
  backgroundColor: z.string().optional(),
  borderColor: z.string().optional(),
  borderWidth: z.number().optional(),
  borderRadius: z.number().optional(),
  padding: z.number().optional(),
}).optional();

const MotionPhaseSchema = z.object({
  kind: z.enum(["none", "fade", "slide-left", "slide-right", "slide-up", "slide-down", "scale", "pulse"]),
  durationSeconds: z.number(),
  easing: z.enum(["linear", "ease-in", "ease-out", "ease-in-out"]),
});

const BaseElementFields = {
  id: z.string(),
  box: ElementBoxSchema,
  style: ElementStyleSchema,
  z: z.number().optional(),
  rotation: z.number().optional(),
  appearAt: z.number().optional(),
  motion: z.object({ enter: MotionPhaseSchema, exit: MotionPhaseSchema }).optional(),
};

const SceneElementSchema = z.discriminatedUnion("kind", [
  z.object({
    ...BaseElementFields,
    kind: z.literal("text"),
    text: z.string(),
    fontSize: z.number().optional(),
    fontWeight: z.enum(["normal", "bold"]).optional(),
    fontFamily: z.string().optional(),
    color: z.string().optional(),
    align: z.enum(["left", "center", "right"]).optional(),
    verticalAlign: z.enum(["top", "middle", "bottom"]).optional(),
  }),
  z.object({
    ...BaseElementFields,
    kind: z.literal("image"),
    url: z.string(),
    fit: z.enum(["cover", "contain", "fill"]).optional(),
    animation: z.enum(["none", "zoom-in", "zoom-out", "pan-left", "pan-right"]).optional(),
  }),
  z.object({
    ...BaseElementFields,
    kind: z.literal("video"),
    url: z.string(),
    fit: z.enum(["cover", "contain", "fill"]).optional(),
    muted: z.boolean().optional(),
    loop: z.boolean().optional(),
  }),
  z.object({
    ...BaseElementFields,
    kind: z.literal("audio"),
    url: z.string(),
    label: z.string().optional(),
    volume: z.number().optional(),
  }),
  z.object({
    ...BaseElementFields,
    kind: z.literal("chips"),
    chips: z.array(z.string()),
    fontSize: z.number().optional(),
    fontFamily: z.string().optional(),
    chipColor: z.string().optional(),
    textColor: z.string().optional(),
    direction: z.enum(["row", "column"]).optional(),
  }),
]);

export const SceneScriptSchema = z.object({
  id: z.string(),
  start: z.number(),
  duration: z.number(),
  type: z.enum(SCENE_TYPES),
  label: z.string().optional(),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  text: z.union([z.string(), z.array(z.string())]).optional(),
  items: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  ctaText: z.string().optional(),
  highlight: z.boolean().optional(),
  animation: z.object({
    titleEnter: AnimationSpecSchema.optional(),
    subtitleEnter: AnimationSpecSchema.optional(),
    textEnter: AnimationSpecSchema.optional(),
  }).optional(),
  effects: z.array(SceneEffectSchema).optional(),
  accentColor: z.string().optional(),
  backgroundEffect: z.string().optional(),
  textColor: z.string().optional(),
  cardBackgroundColor: z.string().optional(),
  cardBorderColor: z.string().optional(),
  backgroundImage: z.string().optional(),
  backgroundMediaType: z.enum(["image", "video"]).optional(),
  backgroundImagePosition: z.enum(["full","half-left","half-right","small-left","small-right","corner-tl","corner-tr","corner-bl","corner-br"]).optional(),
  overlayMediaUrl: z.string().optional(),
  overlayMediaType: z.enum(["image", "video"]).optional(),
  overlayMediaPosition: z.enum(["full","half-left","half-right","small-left","small-right","corner-tl","corner-tr","corner-bl","corner-br"]).optional(),
  overlayMediaAnimation: z.enum(["none","zoom-in","zoom-out","pan-left","pan-right"]).optional(),
  imageAnimation: z.enum(["none","zoom-in","zoom-out","pan-left","pan-right"]).optional(),
  sceneAudio: z.string().optional(),
  sceneAudioLabel: z.string().optional(),
  textAlign: z.enum(["left","center","right"]).optional(),
  contentPosition: z.enum(["top","center","bottom"]).optional(),
  sceneElements: z.array(SceneElementSchema).optional(),
});

export const VideoScriptSchema = z.object({
  video: z.object({
    duration: z.number(),
    fps: z.number().default(30),
    resolution: z.enum(["720p", "1080p", "4k"]),
    aspect: z.enum(["16:9", "9:16", "1:1", "4:3"]),
    purpose: studioPurposeSchema.optional(),
    // Render preset (Slice C). Optional with sensible defaults — older
    // rows that don't carry these fields still parse and render via
    // the WebCodecs h264/aac fast path.
    codec: z.enum(["h264", "h265", "prores", "dnxhd", "vp9"]).optional(),
    container: z.enum(["mp4", "mov", "webm"]).optional(),
    audioCodec: z.enum(["aac", "pcm", "opus"]).optional(),
    videoBitrate: z.number().optional(),
    audioBitrate: z.number().optional(),
    theme: z.object({
      colorPalette: z.array(z.string()),
      fontFamily: z.string(),
      motion: z.enum(["minimal", "moderate", "cinematic"]),
      transition: z.enum(["cut", "fade", "slide", "cinematic-fade"]),
      background: z.enum(["gradient", "dark-tech-grid", "particles", "solid"]),
      customBackground: z.string().optional(),
      customBackgroundType: z.enum(["image", "video"]).optional(),
    }),
    audio: z.object({
      track: z.string(),
      label: z.string(),
      volume: z.number(),
    }).optional(),
  }),
  scenes: z.array(SceneScriptSchema),
  _meta: z.object({ model: z.string().optional() }).optional(),
});

export const StoryboardSceneSchema = z.object({
  duration: z.number(),
  type: z.enum(SCENE_TYPES),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  text: z.string().optional(),
  skills: z.array(z.string()).optional(),
  visual: z.string(),
  camera: z.string(),
});

export type StoryboardScene = z.infer<typeof StoryboardSceneSchema>;

export const StoryboardSchema = z.object({
  style: z.object({
    theme: z.string(),
    color_palette: z.array(z.string()),
    font_style: z.string(),
  }),
  scenes: z.array(StoryboardSceneSchema),
});

export type Storyboard = z.infer<typeof StoryboardSchema>;
