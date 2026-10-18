/**
 * The public page path of a published article, by id (#2312). A studio
 * linked-content card stores only the article id, but the public page is
 * `/articles/<author ref>/<slug>`; the frontend's by-id resolver page asks
 * here and redirects. Same visibility rules as the public read-by-slug:
 * published, verified author, creator visible.
 *
 * Cached in the ISOLATE (one key per article id — an unbounded keyspace, so
 * a KV write per miss would burn the Workers Free quota) for a short TTL
 * rather than invalidated on write: a slug
 * change or unpublish is rare, and a stale answer only lands the viewer on
 * the article page's own not-found state for at most the TTL.
 */
import { and, eq } from "drizzle-orm";
import { publicArticlePath } from "../../../../shared/public-paths.js";
import { schema, type Db } from "../../db/index.js";
import { getOrSetIsolateCached } from "../../utils/isolate-cache.js";
import { isCreatorVisible } from "../creators/visibility.js";

const { articles, users, userProfiles } = schema;

export const PUBLIC_ARTICLE_PATH_TTL_SECONDS = 300;

export function publicArticlePathCacheKey(id: string): string {
  return `article:public-path:${id}`;
}

/** Whether an author's content may show publicly (injectable for tests). */
export type CreatorVisibility = (userId: string) => Promise<boolean>;

async function loadPublicArticlePath(db: Db, id: string, isVisible: CreatorVisibility): Promise<string | null> {
  const [row] = await db
    .select({ slug: articles.slug, authorId: users.id, customUrlSlug: userProfiles.customUrlSlug })
    .from(articles)
    .innerJoin(users, eq(articles.userId, users.id))
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(and(eq(articles.id, id), eq(articles.status, "published"), eq(users.emailVerified, true)))
    .limit(1);
  if (!row?.slug || !(await isVisible(row.authorId))) return null;
  return publicArticlePath(row.customUrlSlug ?? row.authorId, row.slug);
}

/** The article's public path, or null when it isn't publicly readable. */
export function publicArticlePathById(
  db: Db,
  id: string,
  isVisible: CreatorVisibility = isCreatorVisible,
): Promise<string | null> {
  return getOrSetIsolateCached({
    key: publicArticlePathCacheKey(id),
    ttlSeconds: PUBLIC_ARTICLE_PATH_TTL_SECONDS,
    loader: () => loadPublicArticlePath(db, id, isVisible),
  });
}
