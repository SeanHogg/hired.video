/**
 * Public (no-auth) article reads behind routes/articles/public.ts: the
 * published list, an author's list (UUID or vanity-slug ref), the by-id
 * public path and the read-by-slug. Only published articles by verified,
 * visible creators are returned. SQL lives in repositories/articlesRepository.ts.
 */
import { getDb } from "../../db/index.js";
import {
  findPublishedArticleBySlug,
  listPublishedArticleCards,
  type PublicArticleCardRow,
} from "../../repositories/articlesRepository.js";
import { filterVisibleCreators, isCreatorVisible } from "../creators/visibility.js";
import { resolveUserRef } from "../user/resolveUserRef.js";
import { publicArticlePathById } from "./public-article-path.js";

/** Published articles (optionally filtered), visible creators only. */
export async function listPublicArticles(filters: {
  kind?: string;
  sector?: string;
  audience?: string;
  limit: number;
}): Promise<PublicArticleCardRow[]> {
  const rows = await listPublishedArticleCards(getDb(), filters);
  const visible = await filterVisibleCreators(rows.map((r) => r.author.id));
  return rows.filter((r) => visible.has(r.author.id));
}

/** Resolve a public author ref (UUID or customUrlSlug) to a user id. */
export async function resolvePublicAuthor(ref: string): Promise<string | null> {
  return resolveUserRef(getDb(), ref);
}

/** Published articles by one author (already resolved + visibility-checked by the caller). */
export async function listPublicArticlesByAuthor(userId: string, limit: number): Promise<PublicArticleCardRow[]> {
  return listPublishedArticleCards(getDb(), { userId, limit });
}

export async function publicArticlePath(id: string): Promise<string | null> {
  return publicArticlePathById(getDb(), id);
}

/** One published article by author ref + slug; null when absent or the creator is hidden. */
export async function findPublicArticleBySlug(authorRef: string, slug: string) {
  const db = getDb();
  const authorUserId = await resolveUserRef(db, authorRef);
  if (!authorUserId) return null;
  const row = await findPublishedArticleBySlug(db, authorUserId, slug);
  if (!row) return null;
  if (!(await isCreatorVisible(row.author.id))) return null;
  return row;
}
