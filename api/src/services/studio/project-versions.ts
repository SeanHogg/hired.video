/**
 * Studio project version history (gap #131) — production wiring for the
 * `entity_versions` repository (subject_type 'studio_project', mig 0640).
 * Keeps `getDb()` out of routes/studio-features/versions.ts.
 */
import { getDb } from "../../db/index.js";
import { EntityVersionRepository } from "../../repositories/entityVersionRepository.js";

/** The entity-versions repository bound to the live request DB. */
export function liveEntityVersions(): EntityVersionRepository {
  return new EntityVersionRepository(getDb());
}
