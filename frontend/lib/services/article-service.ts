import { apiClient } from "@/lib/api-client";

export type ArticleStatus = "draft" | "published" | "unlisted" | "flagged";

export interface Article {
  id: string;
  userId: string;
  slug: string;
  title: string;
  bodyMd: string;
  summary: string | null;
  coverImageUrl: string | null;
  category: string | null;
  tags: string[];
  status: ArticleStatus;
  publishedAt: string | null;
  qualityScore: number | null;
  qualityRationale: string | null;
  qualityCheckedAt: string | null;
  viewCount: number;
  readMinutes: number;
  createdAt: string;
  updatedAt: string;
}

export interface PublicArticleCard {
  id: string;
  type: "article";
  title: string;
  slug: string;
  summary: string | null;
  coverImageUrl: string | null;
  category: string | null;
  tags: string[];
  readMinutes: number;
  viewCount: number;
  publishedAt: string | null;
  author: { id: string; name: string; avatarUrl: string | null; slug: string };
}

export interface CreateArticleInput {
  title: string;
  bodyMd?: string;
  summary?: string;
  coverImageUrl?: string;
  category?: string;
  tags?: string[];
}

export interface UpdateArticleInput extends Partial<CreateArticleInput> {
  slug?: string;
}

export const articleService = {
  async listMine(): Promise<Article[]> {
    const res = await apiClient.get<Article[]>("/api/articles/me");
    return res.data ?? [];
  },

  async getMine(id: string): Promise<Article> {
    const res = await apiClient.get<Article>(`/api/articles/${id}`);
    return res.data;
  },

  async create(input: CreateArticleInput): Promise<Article> {
    const res = await apiClient.post<Article>("/api/articles", input);
    return res.data;
  },

  async update(id: string, input: UpdateArticleInput): Promise<Article> {
    const res = await apiClient.patch<Article>(`/api/articles/${id}`, input);
    return res.data;
  },

  async publish(id: string): Promise<Article> {
    const res = await apiClient.post<Article>(`/api/articles/${id}/publish`, {});
    return res.data;
  },

  async unpublish(id: string): Promise<Article> {
    const res = await apiClient.post<Article>(`/api/articles/${id}/unpublish`, {});
    return res.data;
  },

  async remove(id: string): Promise<void> {
    await apiClient.delete(`/api/articles/${id}`);
  },

  async listPublished(limit = 20): Promise<PublicArticleCard[]> {
    const res = await apiClient.get<PublicArticleCard[]>(`/api/articles/public?limit=${limit}`);
    return res.data ?? [];
  },

  async getPublic(userId: string, slug: string): Promise<{
    id: string;
    title: string;
    slug: string;
    bodyMd: string;
    summary: string | null;
    coverImageUrl: string | null;
    category: string | null;
    tags: string[];
    readMinutes: number;
    viewCount: number;
    publishedAt: string | null;
    author: { id: string; name: string; avatarUrl: string | null; slug: string };
  }> {
    const res = await apiClient.get<any>(`/api/articles/public/${userId}/${slug}`);
    return res.data;
  },
};
