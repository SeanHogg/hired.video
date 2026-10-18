/**
 * What more than one article sub-router uses (#2312 split of
 * routes/articles.ts): the moderation classifier gate, the request
 * schemas and the public-card mapper. (Enrollment + read-time live in
 * services/articles/authoring.ts.)
 */
import { z } from "zod";
import { ARTICLE_KINDS, type PublicArticleCardRow } from "../../repositories/articlesRepository.js";
import { createLLMClient } from "../../services/adapters/llm-client.js";
import { classifyArticle, gateForSeverity } from "../../services/articles/moderation-classifier.js";

/**
 * Run the article moderation/quality classifier (#175) and compute the
 * severity → status/eligibility gate. Shared by `POST /:id/classify`
 * (author-triggered preview) and `submit-for-review` (auto-gate, #1512) so
 * quality_score + partner_program_eligible are derived exactly one way.
 */
export async function runArticleClassifier(
  c: any,
  art: { title: string; bodyMd: string | null; bodyJson?: unknown },
) {
  const env = (c.env as any) ?? {};
  const llm = createLLMClient(env, c.var.user ?? null);
  const result = await classifyArticle({
    llm,
    title: art.title,
    body: (art.bodyMd ?? "") || JSON.stringify(art.bodyJson ?? {}),
  });
  return { result, gate: gateForSeverity(result.findings.severity) };
}

export const KindSchema = z.enum(ARTICLE_KINDS);

export const CreateArticleSchema = z.object({
  title: z.string().min(1).max(255),
  bodyMd: z.string().default(""),
  // Tiptap (ProseMirror) JSON doc kept in lockstep with bodyMd. Optional
  // for legacy clients + ATS exports that only know the markdown shape.
  // See [[ArticleEditor]] for the serializer that produces it.
  bodyJson: z.unknown().optional(),
  summary: z.string().max(1000).optional(),
  coverImageUrl: z.string().url().optional(),
  category: z.string().max(100).optional(),
  tags: z.array(z.string().max(60)).max(20).optional(),
  kind: KindSchema.default("article").optional(),
  sector: z.string().max(64).optional(),
  audience: z.string().max(32).optional(),
});

export const UpdateArticleSchema = CreateArticleSchema.partial().extend({
  slug: z.string().regex(/^[a-z0-9-]+$/).max(80).optional(),
});

// ---------------------------------------------------------------------------
// Shared row → public card mapper (used by /public + /public/by-user).
// ---------------------------------------------------------------------------
export function toPublicCard(r: PublicArticleCardRow) {
  return {
    id: r.article.id,
    type: "article" as const,
    kind: r.article.kind,
    title: r.article.title,
    slug: r.article.slug,
    summary: r.article.summary,
    coverImageUrl: r.article.coverImageUrl,
    category: r.article.category,
    tags: r.article.tags,
    sector: r.article.sector,
    audience: r.article.audience,
    readMinutes: r.article.readMinutes,
    viewCount: r.article.viewCount,
    publishedAt: r.article.publishedAt,
    author: {
      id: r.author.id,
      name: r.author.name,
      avatarUrl: r.authorProfile?.avatarUrl ?? null,
      slug: r.authorProfile?.customUrlSlug ?? r.author.id,
      isSystem: r.author.isSystem,
    },
  };
}
