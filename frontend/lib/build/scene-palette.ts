/**
 * A kit video scene's colours — the ONE resolver: the scene's own look when
 * the owner picked one, else the video's theme (their pick, Settings choice
 * or the theme calendar's pick for the date), else the scene's default look.
 * Hex: the video renders to pixels, not CSS tokens.
 */
import type { VideoLookId, VideoPlan, VideoSceneId } from "@shared/video-plan";
import { VIDEO_THEMES, type VideoThemeId } from "@shared/video-themes";

export interface SceneLook {
  /** Gradient start (also the solid fallback colour). */
  from: string;
  to: string;
  /** Kicker / first body line / avatar ring. */
  accent: string;
}

/** The looks a scene can take. Every ground keeps white text at a readable
 *  contrast, and `to` stays dark enough to read on the white résumé page. */
export const SCENE_LOOKS: Record<VideoLookId, SceneLook> = {
  violet: { from: "#6D28D9", to: "#DB2777", accent: "#FDE047" },
  ocean: { from: "#0369A1", to: "#1D4ED8", accent: "#FDE68A" },
  ember: { from: "#C2410C", to: "#B91C1C", accent: "#FEF3C7" },
  forest: { from: "#047857", to: "#0F766E", accent: "#D9F99D" },
  midnight: { from: "#1E293B", to: "#4338CA", accent: "#A5B4FC" },
  rose: { from: "#BE185D", to: "#6D28D9", accent: "#FDE047" },
};

export const DEFAULT_SCENE_LOOKS: Record<VideoSceneId, VideoLookId> = {
  hook: "violet",
  who: "ocean",
  proof: "ember",
  skills: "forest",
  next: "rose",
};

export function themePalette(themeId: VideoThemeId): SceneLook {
  const { from, to, accent } = VIDEO_THEMES[themeId];
  return { from, to, accent };
}

/** The colours a scene wears: its look (else the theme, else its default),
 *  with any colours the owner set by hand (Palette & fonts) laid over. */
export function resolveScenePalette(plan: VideoPlan, id: VideoSceneId, themeId: VideoThemeId | null): SceneLook {
  const scene = plan.scenes?.[id];
  const own = scene?.look;
  const base = own ? SCENE_LOOKS[own] : themeId ? themePalette(themeId) : SCENE_LOOKS[DEFAULT_SCENE_LOOKS[id]];
  const hand = scene?.palette;
  return hand ? { from: hand.from ?? base.from, to: hand.to ?? base.to, accent: hand.accent ?? base.accent } : base;
}
