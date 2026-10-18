/**
 * The single résumé auto-apply falls back to when the caller names none.
 *
 * Auto-apply used `findAllForOwner(userId)[0]` — every non-archived résumé
 * row (full JSONB content, video meta, …) shipped over the wire to keep one.
 * This is the same row (first by ascending `updated_at`, archived excluded)
 * as ONE row with only the columns auto-apply reads.
 */
import { and, asc, eq, isNull } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const { resumeInformation } = schema;

export interface AutoApplyResumeRow {
  id: string;
  content: unknown;
}

export async function findAutoApplyResumeForOwner(db: Db, ownerId: string): Promise<AutoApplyResumeRow | null> {
  const [row] = await db
    .select({ id: resumeInformation.id, content: resumeInformation.content })
    .from(resumeInformation)
    .where(and(eq(resumeInformation.userId, ownerId), isNull(resumeInformation.archivedAt)))
    .orderBy(asc(resumeInformation.updatedAt))
    .limit(1);
  return row ?? null;
}
