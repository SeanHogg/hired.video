/**
 * Where the kit video's elements sit, per shape (Angle board: 16:9 for
 * YouTube/LinkedIn, 9:16 for Shorts/TikTok/Reels, 1:1 for feeds). Boxes are
 * % of the canvas; `font` scales the 16:9 type sizes (canvas px) to the
 * shape's width. 16:9 is the original design, unchanged.
 */
import type { VideoAspect } from "@shared/video-targeting";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface VideoLayout {
  aspect: VideoAspect;
  /** Canvas size in px (script-to-canvas ASPECT_TO_WH). */
  width: number;
  height: number;
  /** Type scale relative to the 16:9 design. */
  font: number;
  /** Left edge of the text column (%). */
  margin: number;
  decor: Box;
  kicker: { y: number; h: number; maxW: number };
  avatar: Box;
  heading: Box;
  bar: { y: number; w: number };
  body: { y: number; step: number; w: number; h: number };
  skills: { y: number; rowStep: number; h: number; xMax: number };
  caption: Box;
  proof: {
    heading: Box;
    barY: number;
    body: { y: number; step: number; w: number; h: number };
    /** The résumé page beside (or under) the proof; null where there's no room. */
    page: Box | null;
  };
}

export const VIDEO_LAYOUTS: Record<VideoAspect, VideoLayout> = {
  "16:9": {
    aspect: "16:9",
    width: 1920,
    height: 1080,
    font: 1,
    margin: 7,
    decor: { x: 0, y: 62, w: 20, h: 36 },
    kicker: { y: 18, h: 6, maxW: 44 },
    // Square on the 16:9 canvas (11% × 1920 ≈ 19.55% × 1080).
    avatar: { x: 83, y: 7, w: 11, h: 19.55 },
    heading: { x: 7, y: 27, w: 72, h: 30 },
    bar: { y: 57.5, w: 12 },
    body: { y: 60, step: 8.5, w: 76, h: 8 },
    skills: { y: 58, rowStep: 10, h: 7.5, xMax: 93 },
    caption: { x: 7, y: 86, w: 86, h: 8.5 },
    proof: {
      heading: { x: 7, y: 27, w: 42, h: 24 },
      barY: 52,
      body: { y: 55, step: 11, w: 42, h: 10.5 },
      page: { x: 54, y: 7, w: 38, h: 86 },
    },
  },
  "9:16": {
    aspect: "9:16",
    width: 1080,
    height: 1920,
    font: 0.82,
    margin: 8,
    decor: { x: 0, y: 72, w: 46, h: 26 },
    kicker: { y: 12, h: 3.4, maxW: 84 },
    // Square: 26% × 1080 = 14.625% × 1920.
    avatar: { x: 66, y: 4.5, w: 26, h: 14.625 },
    heading: { x: 8, y: 24, w: 84, h: 22 },
    bar: { y: 47, w: 22 },
    body: { y: 50, step: 6, w: 84, h: 5.5 },
    skills: { y: 50, rowStep: 6.2, h: 4.6, xMax: 92 },
    caption: { x: 8, y: 84, w: 84, h: 6.5 },
    proof: {
      heading: { x: 8, y: 12, w: 84, h: 14 },
      barY: 27,
      body: { y: 29, step: 6.2, w: 84, h: 5.8 },
      page: { x: 8, y: 48, w: 84, h: 46 },
    },
  },
  "1:1": {
    aspect: "1:1",
    width: 1080,
    height: 1080,
    font: 0.62,
    margin: 7,
    decor: { x: 0, y: 62, w: 30, h: 36 },
    kicker: { y: 12, h: 6, maxW: 70 },
    avatar: { x: 77, y: 6, w: 17, h: 17 },
    heading: { x: 7, y: 24, w: 80, h: 30 },
    bar: { y: 55, w: 18 },
    body: { y: 58, step: 8.5, w: 84, h: 8 },
    skills: { y: 58, rowStep: 10, h: 7.5, xMax: 93 },
    caption: { x: 7, y: 86, w: 86, h: 8.5 },
    proof: {
      heading: { x: 7, y: 20, w: 86, h: 16 },
      barY: 37,
      body: { y: 40, step: 8, w: 86, h: 7.5 },
      page: null,
    },
  },
};
