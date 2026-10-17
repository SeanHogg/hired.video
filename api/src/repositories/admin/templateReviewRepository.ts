/**
 * TemplateReviewRepository — the template submission queue (#188). Every
 * creator template (résumé ones included) is a `studio_templates` row; the
 * legacy "job" review kind resolves to the same table (no job_templates
 * table exists).
 */
import { eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";

const { studioTemplates } = schema;

type DbHandle = ReturnType<typeof getDb>;
export type TemplateDecision = "approved" | "rejected";

export class TemplateReviewRepository {
  constructor(private readonly db: DbHandle) {}

  static create(): TemplateReviewRepository {
    return new TemplateReviewRepository(getDb());
  }

  listPending(limit = 100) {
    return this.db.select().from(studioTemplates).where(eq(studioTemplates.listingStatus, "pending_review")).limit(limit);
  }

  /** Records the review decision + note. Returns the updated row, or null when absent. */
  async decide(id: string, decision: TemplateDecision, notes: string | null) {
    const now = new Date();
    const [row] = await this.db
      .update(studioTemplates)
      .set({
        listingStatus: decision,
        reviewNotes: notes,
        ...(decision === "approved" ? { approvedAt: now } : { rejectedAt: now }),
        updatedAt: now,
      })
      .where(eq(studioTemplates.id, id))
      .returning();
    return row ?? null;
  }
}
