/**
 * Strip geometry — how many seconds one pixel is worth under a strip
 * handle, read from the box the handle lives in (zoom included).
 */

/** Seconds per pixel of the nearest `selector` box spanning `seconds`. */
export function secondsPerPxOf(selector: string, seconds: number) {
  return (el: HTMLElement): number | null => {
    const box = el.closest(selector);
    if (!box) return null;
    return seconds / Math.max(1, box.getBoundingClientRect().width);
  };
}

/** A strip track cell (TrackCell) spanning one scene's `seconds`. */
export const TRACK_CELL_SELECTOR = "[data-track-cell]";
/** A scene block on the scene row (VideoTimeline) spanning its `seconds`. */
export const SCENE_BLOCK_SELECTOR = "[data-scene-block]";
/** The music row's full-length lane (MusicTrack) spanning the video. */
export const MUSIC_LANE_SELECTOR = "[data-music-lane]";
