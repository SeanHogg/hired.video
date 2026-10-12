import { apiClient } from "@/lib/api-client";
import { CARD_FIELDS_BY_KIND, serializeListFields } from "@shared/projection";

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
  // Tiptap (ProseMirror) JSON doc kept in lockstep with bodyMd. Nullable
  // for legacy rows authored before the WYSIWYG editor was wired through.
  bodyJson: unknown | null;
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
  author: { id: string; name: string; avatarUrl: string | null; slug: string; isSystem?: boolean };
}

export interface CreateArticleInput {
  title: string;
  bodyMd?: string;
  bodyJson?: unknown;
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
    opts: { limit?: number; kind?: ArticleKind; sector?: string; audience?: string; fields?: readonly string[] } = {},
  ): Promise<PublicArticleCard[]> {
    const params = new URLSearchParams();
    if (opts.limit) params.set("limit", String(opts.limit));
    if (opts.kind) params.set("kind", opts.kind);
    if (opts.sector) params.set("sector", opts.sector);
    if (opts.audience) params.set("audience", opts.audience);
    // `?fields=` projection (gap #1444) — article `body` markdown stays
    // server-side until the detail view asks for it.
    const fields = serializeListFields(
      "articles",
      opts.fields ?? CARD_FIELDS_BY_KIND.articles,
    );
    if (fields) params.set("fields", fields);
    const qs = params.toString();
    const res = await apiClient.get<PublicArticleCard[]>(
      `/api/articles/public${qs ? `?${qs}` : ""}`,
      undefined,
      { suppressErrorEvent: true },
    );
    return res.data ?? [];
  },

  async listPublishedByUser(userId: string, limit = 50, options: { fields?: readonly string[] } = {}): Promise<PublicArticleCard[]> {
    const params = new URLSearchParams({ limit: String(limit) });
    const fields = serializeListFields(
      "articles",
      options.fields ?? CARD_FIELDS_BY_KIND.articles,
    );
    if (fields) params.set("fields", fields);
    const res = await apiClient.get<PublicArticleCard[]>(
      `/api/articles/public/by-user/${userId}?${params.toString()}`,
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

  /** The public page path of a published article by id (`/articles/<author>/<slug>`),
   *  or null when it isn't publicly readable. Backs the by-id resolver route
   *  a studio linked-content card links to (#2312). */
  async getPublicPath(id: string): Promise<string | null> {
    try {
      const res = await apiClient.get<{ path: string }>(
        `/api/articles/public/id/${encodeURIComponent(id)}`,
        undefined,
        { suppressErrorEvent: true },
      );
      return res.data?.path ?? null;
    } catch {
      return null;
    }
  },

  // View-count beacon (#858). The public slug read is edge-cached, so the
  // view bump is a separate fire-and-forget call made on article mount.
  async recordView(id: string): Promise<void> {
    await apiClient.post(`/api/articles/${id}/view`, {}).catch(() => undefined);
  },

  // Engagement beacon (#1577). `scroll` = visual reading, `narrator` =
  // read-aloud listening. Fire-and-forget; failures never surface to the reader.
  async recordReadProgress(
    id: string,
    seconds: number,
    source: "scroll" | "narrator" = "scroll",
  ): Promise<void> {
    if (!(seconds >= 1)) return;
    await apiClient
      .post(`/api/articles/${id}/read-progress`, {
        seconds: Math.min(600, Math.round(seconds)),
        source,
      })
      .catch(() => undefined);
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
