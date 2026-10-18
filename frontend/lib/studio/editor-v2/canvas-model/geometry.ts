/** Widget rotation / geometry math. Part of the canvas-state model;
 *  re-exported by `../canvas-state`. */

// Fold rotation into [-180, 180) so the input stays readable after many
// spins and a user can type -45 directly without snapping to 315. Shared
// by the inspector's degrees field and the canvas rotation-drag handle.
export function normalizeRotationDegrees(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}
