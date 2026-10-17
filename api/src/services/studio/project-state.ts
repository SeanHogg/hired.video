/**
 * `studio_projects.state` ↔ the per-kind API contract (W3-D1, migration
 * 0610). Every project read that returns runtime state spreads
 * `projectStateDto(row)`; every write of state goes through `stateWrite()`
 * so the `baked_hash` mirror never drifts from `state._meta.bakedHash`.
 * The kind → field map itself lives in shared/studio-project-state.ts.
 */
import { stateToFields, type StudioStateFields } from "../../../../shared/studio-project-state.js";
import { bakedStampOf } from "./baked-stamp.js";

export interface ProjectStateSource {
  mediaKind: string | null;
  state: unknown;
  interactiveComicState?: unknown;
}

export type ProjectStateDto = StudioStateFields & {
  /** Retired (never written; comic projects author via `timelineSpec`). */
  comicState: null;
  interactiveComicState: unknown;
};

/** The per-kind state fields every project DTO / public payload carries. */
export function projectStateDto(row: ProjectStateSource): ProjectStateDto {
  return {
    ...stateToFields(row.mediaKind, row.state),
    comicState: null,
    interactiveComicState: row.interactiveComicState ?? null,
  };
}

/** The column patch for writing `state`: the state plus its render-stamp mirror. */
export function stateWrite(state: unknown): { state: unknown; bakedHash: string | null } {
  return { state: state ?? null, bakedHash: bakedStampOf(state) };
}
