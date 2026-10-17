/**
 * Studio project runtime state — which media kind owns which state shape.
 *
 * `studio_projects.state` (migration 0610, W3-D1) is ONE jsonb column; the
 * project's `mediaKind` decides its shape. The API contract keeps the
 * historical per-kind field names (`timelineSpec`, `gameState`, …) on the
 * project DTO and the save-draft body, so this registry is the single map
 * between the two: the API reads `state` into the owning field (every other
 * field null) and writes the owning field of a save into `state`.
 *
 * `interactiveComicState` is NOT in this map: a Comic+ project carries BOTH
 * its page CanvasState (Timeline JSON → `state`) and the branch graph
 * (its own `interactive_comic_state` column). `comicState` is retired — comic
 * projects author via CanvasState (Timeline JSON) and nothing ever wrote it.
 */
import { isMediaKind, type MediaKind } from "./media-kinds.js";

export const STUDIO_STATE_FIELDS = [
  "timelineSpec",
  "gameState",
  "imageState",
  "animationState",
  "cadState",
  "cad3dState",
  "documentState",
] as const;

export type StudioStateField = (typeof STUDIO_STATE_FIELDS)[number];

/** Media kind → the DTO / save-body field its `state` travels under. */
export const MEDIA_KIND_STATE_FIELD: Record<MediaKind, StudioStateField> = {
  video: "timelineSpec",
  podcast: "timelineSpec",
  voice: "timelineSpec",
  comic: "timelineSpec",
  interactive_comic: "timelineSpec",
  animation: "animationState",
  game: "gameState",
  image: "imageState",
  cad: "cadState",
  cad_3d: "cad3dState",
  document: "documentState",
};

/** The field that owns `state` for `mediaKind` (unknown / null → video). */
export function stateFieldFor(mediaKind: unknown): StudioStateField {
  return MEDIA_KIND_STATE_FIELD[isMediaKind(mediaKind) ? mediaKind : "video"];
}

export type StudioStateFields = Record<StudioStateField, unknown>;

/** `state` spread into the per-kind fields: the owning one carries it, the
 *  rest are null (the DTO shape every reader returned before 0610). */
export function stateToFields(mediaKind: unknown, state: unknown): StudioStateFields {
  const out = {} as StudioStateFields;
  for (const field of STUDIO_STATE_FIELDS) out[field] = null;
  out[stateFieldFor(mediaKind)] = state ?? null;
  return out;
}

/**
 * The state a write carries, picked from per-kind fields: the field that
 * owns `mediaKind`; when the kind is unknown (a create that names none), the
 * first field present. A field another kind owns is ignored — it would put
 * the wrong shape in `state`. `undefined` = the write does not touch state.
 */
export function stateFromFields(
  mediaKind: unknown,
  fields: Partial<Record<StudioStateField, unknown>>,
): unknown {
  if (isMediaKind(mediaKind)) return fields[MEDIA_KIND_STATE_FIELD[mediaKind]];
  for (const field of STUDIO_STATE_FIELDS) {
    if (fields[field] !== undefined) return fields[field];
  }
  return undefined;
}
