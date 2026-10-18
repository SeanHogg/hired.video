/**
 * `feed_post_tags` — one row per distinct lowercased hashtag of a feed post
 * (migration 0616). The SINGLE writer: every repository write that sets
 * `feed_posts.tags` calls `syncFeedPostHashtags` with the new tags, so the
 * hashtag filter and the trending read never unnest the JSONB.
 */
import { eq } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const { feedPostTags } = schema;

const TAG_MAX = 100;

/** Distinct lowercased Hashtag values from a `feed_posts.tags` array (raw
 *  string entries — community channel markers — and mentions are skipped). */
export function hashtagsOf(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const out = new Set<string>();
  for (const t of tags) {
    if (!t || typeof t !== "object") continue;
    const { tagType, tagValue } = t as { tagType?: unknown; tagValue?: unknown };
    if (tagType !== "Hashtag" || typeof tagValue !== "string") continue;
    const tag = tagValue.trim().toLowerCase().slice(0, TAG_MAX);
    if (tag) out.add(tag);
  }
  return [...out];
}

/** Replace the post's hashtag rows with those in `tags`. Two statements (the
 *  neon-http driver has no interactive transactions): delete, then insert. */
export async function syncFeedPostHashtags(
  db: Db,
  post: { id: string; createdAt: Date },
  tags: unknown,
): Promise<void> {
  await db.delete(feedPostTags).where(eq(feedPostTags.postId, post.id));
  const values = hashtagsOf(tags).map((tag) => ({ postId: post.id, tag, createdAt: post.createdAt }));
  if (values.length > 0) await db.insert(feedPostTags).values(values).onConflictDoNothing();
}
