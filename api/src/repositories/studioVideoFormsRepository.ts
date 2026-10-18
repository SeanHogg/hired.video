/**
 * In-video lead forms (#140) — the `studio_video_forms` aggregate and its
 * `studio_video_form_submissions` children. Access (who may act on a form's
 * project) is decided by the caller; these are plain typed reads/writes.
 */
import { desc, eq } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const { studioVideoForms, studioVideoFormSubmissions } = schema;

export type StudioVideoFormRow = typeof studioVideoForms.$inferSelect;
export type StudioVideoFormInsert = typeof studioVideoForms.$inferInsert;
export type StudioVideoFormPatch = Partial<Omit<StudioVideoFormInsert, "id" | "userId" | "projectId" | "createdAt">>;
export type StudioVideoFormSubmissionRow = typeof studioVideoFormSubmissions.$inferSelect;
export type StudioVideoFormSubmissionInsert = typeof studioVideoFormSubmissions.$inferInsert;

/** Owner submissions view cap. */
export const FORM_SUBMISSIONS_LIST_LIMIT = 500;

export function createStudioVideoFormsRepository(db: Db) {
  return {
    async listByProject(projectId: string): Promise<StudioVideoFormRow[]> {
      return db
        .select()
        .from(studioVideoForms)
        .where(eq(studioVideoForms.projectId, projectId))
        .orderBy(studioVideoForms.positionSeconds);
    },

    async findById(id: string): Promise<StudioVideoFormRow | null> {
      const [row] = await db.select().from(studioVideoForms).where(eq(studioVideoForms.id, id)).limit(1);
      return row ?? null;
    },

    async insert(values: StudioVideoFormInsert): Promise<StudioVideoFormRow> {
      const [row] = await db.insert(studioVideoForms).values(values).returning();
      return row;
    },

    async update(id: string, patch: StudioVideoFormPatch): Promise<StudioVideoFormRow | null> {
      const [row] = await db
        .update(studioVideoForms)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(studioVideoForms.id, id))
        .returning();
      return row ?? null;
    },

    /** The deleted id, or null when no row matched. */
    async deleteById(id: string): Promise<string | null> {
      const [row] = await db
        .delete(studioVideoForms)
        .where(eq(studioVideoForms.id, id))
        .returning({ id: studioVideoForms.id });
      return row?.id ?? null;
    },

    async insertSubmission(values: StudioVideoFormSubmissionInsert): Promise<StudioVideoFormSubmissionRow> {
      const [row] = await db.insert(studioVideoFormSubmissions).values(values).returning();
      return row;
    },

    async listSubmissions(formId: string): Promise<StudioVideoFormSubmissionRow[]> {
      return db
        .select()
        .from(studioVideoFormSubmissions)
        .where(eq(studioVideoFormSubmissions.formId, formId))
        .orderBy(desc(studioVideoFormSubmissions.createdAt))
        .limit(FORM_SUBMISSIONS_LIST_LIMIT);
    },
  };
}

export type StudioVideoFormsRepository = ReturnType<typeof createStudioVideoFormsRepository>;
