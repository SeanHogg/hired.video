/**
 * `resume_information.video_theme_id` / `video_goal` (migration 0615) are a
 * denormalized copy of the résumé's video plan (`content.meta.video.themeId`
 * and `content.meta.video.targeting.goal`) for the public video feed. Every
 * repository write that sets `content` spreads `videoMetaColumns(content)` so
 * the columns never drift from the JSON. Only valid ids are stored (null
 * otherwise), so readers need no re-validation.
 */
import { isVideoThemeId } from "../../../shared/video-themes.js";
import { VIDEO_GOALS } from "../../../shared/video-targeting.js";

function objectAt(value: unknown, key: string): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const child = (value as Record<string, unknown>)[key];
  return child && typeof child === "object" && !Array.isArray(child) ? (child as Record<string, unknown>) : null;
}

export function videoMetaColumns(content: unknown): { videoThemeId: string | null; videoGoal: string | null } {
  const video = objectAt(objectAt(content, "meta"), "video");
  const themeId = video?.themeId;
  const goal = objectAt(video, "targeting")?.goal;
  return {
    videoThemeId: isVideoThemeId(themeId) ? themeId : null,
    videoGoal: typeof goal === "string" && (VIDEO_GOALS as readonly string[]).includes(goal) ? goal : null,
  };
}

/** `values` plus the video-meta columns when it writes `content`. */
export function withVideoMetaColumns<T extends { content?: unknown }>(values: T): T {
  return values.content === undefined ? values : { ...values, ...videoMetaColumns(values.content) };
}
