/**
 * Studio script shapes shared by the generation use cases and the project
 * DTO: the legacy Storyboard (old DB rows) and the VideoScript the
 * storyboard/edit-script routes produce (mirrors
 * frontend/types/video-script.ts). Split out of routes/studio.ts (W2-3a).
 */
import { z } from "zod";
import { SCENE_TYPES, type SceneType } from "../../../../shared/scene-types.js";
import { STUDIO_PURPOSES } from "../../../../shared/studio-purposes.js";

// Studio purpose enum lives in shared/studio-purposes.ts so the frontend
// response validators can't drift from the server's accepted set (gap #491).
export const studioPurposeSchema = z.enum(STUDIO_PURPOSES);
export type StudioPurpose = (typeof STUDIO_PURPOSES)[number];
export type Motion = "minimal" | "moderate" | "cinematic";

const StoryboardSceneSchema = z.object({
  duration: z.number(),
  type: z.enum(SCENE_TYPES),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  text: z.string().optional(),
  skills: z.array(z.string()).optional(),
  visual: z.string(),
  camera: z.string(),
  // Advertising extras
  ctaUrl: z.string().optional(),
  ctaText: z.string().optional(),
  logoUrl: z.string().optional(),
});

export const StoryboardSchema = z.object({
  style: z.object({
    theme: z.string(),
    color_palette: z.array(z.string()),
    font_style: z.string(),
  }),
  scenes: z.array(StoryboardSceneSchema),
});
export type Storyboard = z.infer<typeof StoryboardSchema>;

/** Parse a stored storyboard, converting the pre-VideoScript row shape. */
export function normalizeStoryboard(input: unknown): Storyboard | null {
  const parsed = StoryboardSchema.safeParse(input);
  if (parsed.success) return parsed.data;

  const old = input as { scenes?: Array<{ title?: string; narration?: string; visuals?: string; duration?: number }> } | null;
  if (!old?.scenes?.length) return null;

  const converted = {
    style: {
      theme: "professional",
      color_palette: ["#0f172a", "#2563eb", "#14b8a6"],
      font_style: "Inter",
    },
    scenes: old.scenes.slice(0, 4).map((s, idx) => ({
      duration: s.duration ?? 8,
      type: (idx === 0 ? "intro" : idx === old.scenes!.length - 1 ? "closing" : idx % 2 === 0 ? "skills" : "achievement") as SceneType,
      title: s.title,
      text: s.narration,
      visual: s.visuals ?? "Professional office background",
      camera: "medium",
    })),
  };

  return StoryboardSchema.parse(converted);
}

export const VideoScriptSchema = z.object({
  video: z.object({
    duration: z.number(),
    fps: z.number().default(30),
    resolution: z.enum(["720p", "1080p"]).default("720p"),
    aspect: z.enum(["16:9", "9:16", "1:1"]).default("16:9"),
    theme: z.object({
      colorPalette: z.array(z.string()),
      fontFamily: z.string(),
      motion: z.enum(["minimal", "moderate", "cinematic"]).default("moderate"),
      transition: z.enum(["cut", "fade", "slide", "cinematic-fade"]).default("fade"),
      background: z.enum(["gradient", "dark-tech-grid", "particles", "solid"]).default("gradient"),
    }).passthrough(),
    // Preserve music selection and any other video-level fields
    audio: z.object({ track: z.string(), label: z.string(), volume: z.number() }).optional(),
    // Brand kit / advertising overlays
    logoUrl: z.string().optional(),
    logoPosition: z.enum(["top-left", "top-right", "bottom-left", "bottom-right"]).optional(),
    // Purpose label stored in the script so renderers can optimise for ad vs. resume
    purpose: studioPurposeSchema.optional(),
  }).passthrough(),
  scenes: z.array(z.object({
    id: z.string(),
    start: z.number(),
    duration: z.number(),
    type: z.enum(SCENE_TYPES),
    title: z.string().optional(),
    subtitle: z.string().optional(),
    text: z.union([z.string(), z.array(z.string())]).optional(),
    items: z.array(z.string()).optional(),
    skills: z.array(z.string()).optional(),
    highlight: z.boolean().optional(),
    // Advertising fields
    ctaUrl: z.string().optional(),
    ctaText: z.string().optional(),
    ctaQrCode: z.boolean().optional(),   // generate QR from ctaUrl
    logoUrl: z.string().optional(),
    // Preserve all user-set per-scene customisations
    accentColor: z.string().optional(),
    backgroundImage: z.string().optional(),
    backgroundImagePosition: z.string().optional(),
    imageAnimation: z.string().optional(),
    sceneAudio: z.string().optional(),
    sceneAudioLabel: z.string().optional(),
    textAlign: z.string().optional(),
    contentPosition: z.string().optional(),
  }).passthrough()),
}).passthrough();

export type VideoScript = z.infer<typeof VideoScriptSchema>;
