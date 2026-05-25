import { apiClient } from "@/lib/api-client";

export type ArticleKind = "article" | "faq" | "guide";

export type ArticleStatus =
  | "draft"
  | "submitted"
  | "published"
  | "rejected"
  | "unlisted"
  | "flagged";

export type ModerationSeverity = "low" | "medium" | "high" | "block";

export interface ModerationFindings {
  profanity: string[];
  racism: string[];
  tosViolations: string[];
  severity: ModerationSeverity;
  rationale?: string | null;
}

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
  sector: string | null;
  audience: string | null;
  kind: ArticleKind;
  status: ArticleStatus;
  submittedForReviewAt: string | null;
  publishedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectedBy: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  qualityScore: number | null;
  qualityRationale: string | null;
  qualityCheckedAt: string | null;
  moderationScore: number | null;
  moderationFindings: ModerationFindings | null;
  moderationScannedAt: string | null;
  moderationScannedBy: string | null;
  viewCount: number;
  readMinutes: number;
  createdAt: string;
  updatedAt: string;
}

export interface PublicArticleCard {
  id: string;
  type: "article";
  kind: ArticleKind;
  title: string;
  slug: string;
  summary: string | null;
  coverImageUrl: string | null;
  category: string | null;
  tags: string[];
  sector: string | null;
  audience: string | null;
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
  kind?: ArticleKind;
  sector?: string;
  audience?: string;
}

export interface UpdateArticleInput extends Partial<CreateArticleInput> {
  slug?: string;
}

export interface AdminQueueEntry {
  article: Article;
  author: {
    id: string;
    name: string | null;
    email: string | null;
    avatarUrl: string | null;
    slug: string;
  };
}

export interface AdminScanResultRow {
  id: string;
  score: number;
  severity: ModerationSeverity;
  recommendation: "approve" | "review" | "reject";
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

  async submitForReview(id: string): Promise<Article> {
    const res = await apiClient.post<Article>(`/api/articles/${id}/submit-for-review`, {});
    return res.data;
  },

  async withdraw(id: string): Promise<Article> {
    const res = await apiClient.post<Article>(`/api/articles/${id}/withdraw`, {});
    return res.data;
  },

  async unpublish(id: string): Promise<Article> {
    const res = await apiClient.post<Article>(`/api/articles/${id}/unpublish`, {});
    return res.data;
  },

  async remove(id: string): Promise<void> {
    await apiClient.delete(`/api/articles/${id}`);
  },

  async listPublished(
    opts: { limit?: number; kind?: ArticleKind; sector?: string; audience?: string } = {},
  ): Promise<PublicArticleCard[]> {
    const params = new URLSearchParams();
    if (opts.limit) params.set("limit", String(opts.limit));
    if (opts.kind) params.set("kind", opts.kind);
    if (opts.sector) params.set("sector", opts.sector);
    if (opts.audience) params.set("audience", opts.audience);
    const qs = params.toString();
    const res = await apiClient.get<PublicArticleCard[]>(
      `/api/articles/public${qs ? `?${qs}` : ""}`,
      undefined,
      { suppressErrorEvent: true },
    );
    return res.data ?? [];
  },

  async listPublishedByUser(userId: string, limit = 50): Promise<PublicArticleCard[]> {
    const res = await apiClient.get<PublicArticleCard[]>(
      `/api/articles/public/by-user/${userId}?limit=${limit}`,
      undefined,
      { suppressErrorEvent: true },
    );
    return res.data ?? [];
  },

  async getPublic(userId: string, slug: string): Promise<{
    id: string;
    kind: ArticleKind;
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

export const adminArticleService = {
  async queue(
    opts: { status?: "submitted" | "rejected" | "published"; kind?: ArticleKind; limit?: number } = {},
  ): Promise<AdminQueueEntry[]> {
    const params = new URLSearchParams();
    if (opts.status) params.set("status", opts.status);
    if (opts.kind) params.set("kind", opts.kind);
    if (opts.limit) params.set("limit", String(opts.limit));
    const qs = params.toString();
    const res = await apiClient.get<AdminQueueEntry[]>(
      `/api/admin/articles/queue${qs ? `?${qs}` : ""}`,
    );
    return res.data ?? [];
  },

  async scan(ids: string[]): Promise<{ scanned: number; results: AdminScanResultRow[] }> {
    const res = await apiClient.post<{ scanned: number; results: AdminScanResultRow[] }>(
      `/api/admin/articles/scan`,
      { ids },
    );
    return res.data;
  },

  async approve(ids: string[]): Promise<{ approved: number; ids: string[] }> {
    const res = await apiClient.post<{ approved: number; ids: string[] }>(
      `/api/admin/articles/approve`,
      { ids },
    );
    return res.data;
  },

  async reject(ids: string[], reason: string): Promise<{ rejected: number; ids: string[] }> {
    const res = await apiClient.post<{ rejected: number; ids: string[] }>(
      `/api/admin/articles/reject`,
      { ids, reason },
    );
    return res.data;
  },
};
