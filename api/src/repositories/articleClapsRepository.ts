/**
 * ArticleClapsRepository — per-(user, article) clap totals. Since W3-A they
 * are `reactions` rows (subject_type 'article', reaction_type 'clap', `count`
 * = the running total, capped app-side). One row per (user, article) — the
 * uq_reactions_subject_user key.
 */
import { CLAP_REACTION_TYPE } from "../../../shared/engagement-subjects.js";
import { schema, type Db } from "../db/index.js";
import { reactionBy } from "./engagementSubjectFilters.js";

const { reactions } = schema;

/** The user's clap total on the article (0 when they never clapped). */
export async function findClapTotal(db: Db, articleId: string, userId: string): Promise<number> {
  const [row] = await db
    .select({ count: reactions.count })
    .from(reactions)
    .where(reactionBy("article", articleId, userId))
    .limit(1);
  return row?.count ?? 0;
}

/** Set the user's clap total on the article (insert or overwrite). */
export async function upsertClapTotal(
  db: Db,
  articleId: string,
  userId: string,
  total: number,
): Promise<void> {
  await db
    .insert(reactions)
    .values({
      subjectType: "article",
      subjectId: articleId,
      userId,
      reactionType: CLAP_REACTION_TYPE,
      count: total,
    })
    .onConflictDoUpdate({
      target: [reactions.subjectType, reactions.subjectId, reactions.userId],
      set: { count: total, updatedAt: new Date() },
    });
}
