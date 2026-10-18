/**
 * TaxonomyRepository — workspace taxonomies (Tags + tag assignments / Job
 * Types / Sources — #231, #232, #238). One repository because the three
 * lists share one read/write shape and one settings surface
 * (routes/taxonomies.ts); the cached read side is
 * services/taxonomy/taxonomy-read-service.ts.
 */

import { asc, and, eq } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";
import type { WorkspaceJobType, WorkspaceSource, WorkspaceTag } from "../db/schema/taxonomies.js";

const { workspaceTags, tagAssignments, workspaceJobTypes, workspaceSources } = schema;

export type TaxonomyKind = "tags" | "job-types" | "sources";

export interface NewTagInput {
  axis: string;
  name: string;
  colorHex: string;
  orderIndex: number;
}

export interface TagAssignmentInput {
  tagId: string;
  axis: string;
  entityId: string;
}

export interface ITaxonomyRepository {
  listTags(axis: string | null): Promise<WorkspaceTag[]>;
  listJobTypes(): Promise<WorkspaceJobType[]>;
  listSources(): Promise<WorkspaceSource[]>;
  insertTag(input: NewTagInput): Promise<WorkspaceTag>;
  /** Idempotent on (tag, entity). */
  assignTag(input: TagAssignmentInput): Promise<void>;
  unassignTag(tagId: string, entityId: string): Promise<void>;
  /** `is_built_in` of one row, or null when the row doesn't exist. */
  findBuiltInFlag(kind: TaxonomyKind, id: string): Promise<boolean | null>;
  deleteRow(kind: TaxonomyKind, id: string): Promise<void>;
}

export class TaxonomyRepository implements ITaxonomyRepository {
  constructor(private readonly db: Db) {}

  async listTags(axis: string | null): Promise<WorkspaceTag[]> {
    const baseQuery = this.db.select().from(workspaceTags);
    return (axis ? baseQuery.where(eq(workspaceTags.axis, axis)) : baseQuery).orderBy(
      asc(workspaceTags.axis),
      asc(workspaceTags.orderIndex),
      asc(workspaceTags.name),
    );
  }

  async listJobTypes(): Promise<WorkspaceJobType[]> {
    return this.db
      .select()
      .from(workspaceJobTypes)
      .orderBy(asc(workspaceJobTypes.orderIndex), asc(workspaceJobTypes.label));
  }

  async listSources(): Promise<WorkspaceSource[]> {
    return this.db
      .select()
      .from(workspaceSources)
      .orderBy(asc(workspaceSources.orderIndex), asc(workspaceSources.label));
  }

  async insertTag(input: NewTagInput): Promise<WorkspaceTag> {
    const [row] = await this.db
      .insert(workspaceTags)
      .values({ ...input, isBuiltIn: false })
      .returning();
    return row;
  }

  async assignTag(input: TagAssignmentInput): Promise<void> {
    await this.db.insert(tagAssignments).values(input).onConflictDoNothing();
  }

  async unassignTag(tagId: string, entityId: string): Promise<void> {
    await this.db
      .delete(tagAssignments)
      .where(and(eq(tagAssignments.tagId, tagId), eq(tagAssignments.entityId, entityId)));
  }

  async findBuiltInFlag(kind: TaxonomyKind, id: string): Promise<boolean | null> {
    // One branch per table keeps each query fully typed (a union table in
    // `.from()` doesn't type-check).
    const rows: Array<{ isBuiltIn: boolean }> =
      kind === "tags"
        ? await this.db.select({ isBuiltIn: workspaceTags.isBuiltIn }).from(workspaceTags).where(eq(workspaceTags.id, id)).limit(1)
        : kind === "job-types"
          ? await this.db.select({ isBuiltIn: workspaceJobTypes.isBuiltIn }).from(workspaceJobTypes).where(eq(workspaceJobTypes.id, id)).limit(1)
          : await this.db.select({ isBuiltIn: workspaceSources.isBuiltIn }).from(workspaceSources).where(eq(workspaceSources.id, id)).limit(1);
    return rows[0] ? rows[0].isBuiltIn : null;
  }

  async deleteRow(kind: TaxonomyKind, id: string): Promise<void> {
    if (kind === "tags") await this.db.delete(workspaceTags).where(eq(workspaceTags.id, id));
    else if (kind === "job-types") await this.db.delete(workspaceJobTypes).where(eq(workspaceJobTypes.id, id));
    else await this.db.delete(workspaceSources).where(eq(workspaceSources.id, id));
  }
}
