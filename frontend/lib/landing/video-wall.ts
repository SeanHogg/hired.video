/**
 * The home page's video wall, as pure data: which public videos show, how a
 * person is named on a card, and where the "Your video goes here" card sits.
 * Rendering lives in components/landing/home/*.
 */
import { VIDEO_GOALS, type VideoGoal } from "@shared/video-targeting";
import { publicProfilePath } from "@shared/public-paths";
import type { PublicVideo } from "@/lib/services/studio-service";

/** How many videos the wall shows (the feed returns up to 20). */
export const WALL_VIDEO_COUNT = 9;
/** The "Your video goes here" card takes this slot (0-based), as on the board. */
export const WALL_CTA_INDEX = 2;
/** How many recent videos the hero's "Just posted" stack fans out. */
export const HERO_STACK_COUNT = 3;

export type WallItem = { kind: "video"; video: PublicVideo } | { kind: "cta" };

/** First name + last initial ("Sean Hogg" → "Sean H."), so the wall names a
 *  person without printing their full name on the home page. */
export function shortName(full: string | null | undefined): string {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/** The wall's cards: up to WALL_VIDEO_COUNT videos with the invite card at
 *  WALL_CTA_INDEX (or last, when there are fewer videos than that). */
export function wallItems(videos: readonly PublicVideo[]): WallItem[] {
  const items: WallItem[] = videos.slice(0, WALL_VIDEO_COUNT).map((video) => ({ kind: "video", video }));
  items.splice(Math.min(WALL_CTA_INDEX, items.length), 0, { kind: "cta" });
  return items;
}

/** Hover preview source: only a hosted file plays inline (a YouTube link
 *  would need an embed, so its card keeps the still). */
export function inlinePreviewUrl(video: PublicVideo): string | null {
  if (!video.videoUrl || video.youtubeUrl) return null;
  return video.videoUrl;
}

/** The person's public profile, where their résumé and videos live. */
export function videoOwnerPath(video: PublicVideo): string | null {
  return video.ownerId ? publicProfilePath(video.ownerId) : null;
}

/** Wall filters: "all", a goal ("contract"…), or "season" (videos wearing a
 *  theme in season right now). Only filters some video matches are offered. */
export type WallFilter = "all" | "season" | VideoGoal;

export function wallFilters(videos: readonly PublicVideo[], seasonThemes: ReadonlySet<string>): WallFilter[] {
  const goals = VIDEO_GOALS.filter((g) => videos.some((v) => v.goal === g));
  const season = videos.some((v) => v.themeId && seasonThemes.has(v.themeId));
  return goals.length === 0 && !season ? [] : ["all", ...goals, ...(season ? (["season"] as const) : [])];
}

export function filterVideos(videos: readonly PublicVideo[], filter: WallFilter, seasonThemes: ReadonlySet<string>): PublicVideo[] {
  if (filter === "all") return [...videos];
  if (filter === "season") return videos.filter((v) => v.themeId && seasonThemes.has(v.themeId));
  return videos.filter((v) => v.goal === filter);
}
