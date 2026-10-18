/**
 * Reusable `studio_projects` column projections (SSoT for every project
 * read/`RETURNING` in the repository layer).
 *
 * `select()` on studio_projects drags the eight FROZEN legacy per-kind JSONB
 * columns (timeline_spec … document_state, migration 0610) — no code reads
 * them, yet on pre-0610 rows they still hold a full copy of the project state,
 * doubling transfer + JSON-parse CPU on every read. The columns stay declared
 * in the schema (owner approval pending before they can be dropped); reads
 * simply never project them.
 */
import { getTableColumns } from "drizzle-orm";
import { schema } from "../db/index.js";

const { studioProjects } = schema;

const {
  legacyTimelineSpec: _legacyTimelineSpec,
  legacyGameState: _legacyGameState,
  legacyComicState: _legacyComicState,
  legacyImageState: _legacyImageState,
  legacyAnimationState: _legacyAnimationState,
  legacyCadState: _legacyCadState,
  legacyCad3dState: _legacyCad3dState,
  legacyDocumentState: _legacyDocumentState,
  ...liveColumns
} = getTableColumns(studioProjects);

/** Every LIVE studio_projects column — the shape the project DTO
 *  (services/studio/project-dto.ts) and the project use cases consume. */
export const studioProjectColumns = liveColumns;

/** The row every project read returns (no frozen legacy columns). */
export type StudioProjectRow = Omit<
  typeof studioProjects.$inferSelect,
  | "legacyTimelineSpec"
  | "legacyGameState"
  | "legacyComicState"
  | "legacyImageState"
  | "legacyAnimationState"
  | "legacyCadState"
  | "legacyCad3dState"
  | "legacyDocumentState"
>;

/** Hard cap for list reads that previously had no LIMIT. */
export const STUDIO_PROJECT_LIST_MAX = 500;
