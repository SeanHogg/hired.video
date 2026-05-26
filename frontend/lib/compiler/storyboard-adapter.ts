// storyboard-adapter.ts — backward-compat shim that converts the legacy
// Storyboard format (stored in DB) into the new VideoScript DSL so that
// old projects continue to render correctly.

import type { VideoScript, SceneScript, SceneType } from "../../types/video-script";
import type { Storyboard } from "../services/studio-service";
import { SCENE_TYPES } from "@shared/scene-types";

export function storyboardToVideoScript(sb: Storyboard): VideoScript {
  const palette: string[] = sb.style?.color_palette?.length
    ? sb.style.color_palette
    : ["#7c3aed", "#2563eb", "#e2e8f0"];

  const fontFamily = sb.style?.font_style ?? "Inter, sans-serif";
  const sceneList = sb.scenes ?? [];
  const totalDuration = sceneList.reduce((sum, s) => sum + (s.duration ?? 7), 0);

  let cursor = 0;
  const scenes: SceneScript[] = sceneList.map((s, i) => {
    const duration = s.duration ?? 7;
    const start = cursor;
    cursor += duration;

    const textValue: string | string[] | undefined = s.text
      ? s.text
      : undefined;

    const type: SceneType =
      (SCENE_TYPES as readonly string[]).includes(s.type)
        ? (s.type as SceneType)
        : "intro";

    return {
      id: `legacy-${i}`,
      start,
      duration,
      type,
      title: s.title,
      subtitle: s.subtitle,
      text: textValue,
      skills: s.skills,
      animation: {
        titleEnter:    { type: "slideUp",  start: 0,   duration: 0.5, easing: "easeOut" },
        subtitleEnter: { type: "fadeIn",   start: 0.3, duration: 0.5, easing: "easeOut" },
        textEnter:     { type: "slideUp",  start: 0.5, duration: 0.5, easing: "easeOut" },
      },
    };
  });

  return {
    video: {
      duration: totalDuration || 28,
      fps: 30,
      resolution: "720p",
      aspect: "16:9",
      theme: {
        colorPalette: palette,
        fontFamily,
        motion: "moderate",
        transition: "fade",
        background: "gradient",
      },
    },
    scenes,
  };
}
