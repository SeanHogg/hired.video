/** Mint a short random id with a kind prefix (`w_…`, `scene_…`, `audio_…`).
 *  Single id source for the canvas-state model. */
export function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}
