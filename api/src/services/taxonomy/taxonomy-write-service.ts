/**
 * Write side of the workspace taxonomies (Tags / Job Types / Sources —
 * #231, #232, #238). Every write that changes a cached list invalidates it
 * (see taxonomy-read-service.ts).
 */

import { getDb } from "../../db/index.js";
import type { WorkspaceTag } from "../../db/schema/taxonomies.js";
import { DomainError } from "../../domains/errors.js";
import {
  TaxonomyRepository,
  type TagAssignmentInput,
  type TaxonomyKind,
} from "../../repositories/taxonomyRepository.js";
import { invalidateTaxonomyCache, type TagAxis } from "./taxonomy-read-service.js";

function repo(): TaxonomyRepository {
  return new TaxonomyRepository(getDb());
}

export async function createTag(input: {
  axis: TagAxis;
  name: string;
  colorHex?: string;
  orderIndex?: number;
}): Promise<WorkspaceTag> {
  const row = await repo().insertTag({
    axis: input.axis,
    name: input.name,
    colorHex: input.colorHex ?? "#94a3b8",
    orderIndex: input.orderIndex ?? 0,
  });
  invalidateTaxonomyCache("tags");
  return row;
}

export function assignTag(input: TagAssignmentInput): Promise<void> {
  return repo().assignTag(input);
}

export function unassignTag(input: TagAssignmentInput): Promise<void> {
  return repo().unassignTag(input.tagId, input.entityId);
}

/** Delete one taxonomy row. #237 — rows carrying `is_built_in = true` are
 *  owned by the platform (seeded via migration) and MUST NOT be deletable by
 *  any caller: the frontend hides the Delete affordance on built-ins; this is
 *  the backend backstop so a curl against the DELETE endpoint still 409s
 *  with a clear reason. */
export async function deleteTaxonomyRow(kind: TaxonomyKind, id: string): Promise<void> {
  const taxonomies = repo();
  const isBuiltIn = await taxonomies.findBuiltInFlag(kind, id);
  if (isBuiltIn === null) {
    throw new DomainError(404, "NOT_FOUND", "Taxonomy row not found");
  }
  if (isBuiltIn) {
    throw new DomainError(
      409,
      "BUILT_IN_LOCKED",
      "This row was seeded by the platform and can't be deleted. Hide it by setting orderIndex out of view if you don't want to use it.",
    );
  }
  await taxonomies.deleteRow(kind, id);
  invalidateTaxonomyCache(kind);
}
