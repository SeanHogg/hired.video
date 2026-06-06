// lists-service.ts — client for /api/lists. Polymorphic Lists across
// People / Jobs / Resumes / Companies. See API at api/src/routes/lists.ts.

import { apiClient } from "../api-client";

export const LIST_ENTITY_TYPES = [
  "person",
  "job",
  "resume",
  "company",
  // A pipeline entry — a candidate-on-a-job kanban row. Lets recruiters
  // bookmark sourced candidates from the kanban without losing job context.
  "pipeline_entry",
  // A published course — backs the marketplace wishlist heart.
  "course",
] as const;
export type ListEntityType = (typeof LIST_ENTITY_TYPES)[number];

// The PublicCourseCard shape returned by /api/lists/wishlist/courses. Mirrors
// the marketplace feed card so the My-Wishlist page reuses the same card.
export interface WishlistCourseCard {
  id: string;
  type: "course";
  title: string;
  slug: string;
  summary: string | null;
  coverImageUrl: string | null;
  category: string | null;
  tags: string[];
  difficulty: "beginner" | "intermediate" | "advanced" | null;
  estimatedMinutes: number | null;
  priceCents: number | null;
  issuesCertificate: boolean;
  enrollmentCount: number;
  averageRating: number | null;
  ratingCount: number;
  publishedAt: string | null;
  author: { id: string; name: string; avatarUrl: string | null; slug: string };
}

export interface List {
  id: string;
  ownerUserId: string;
  companyId: string | null;
  title: string;
  isPrivate: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ListWithMeta extends List {
  /** Item count, optionally filtered to a single entityType when fetched that way. */
  itemCount: number;
  /** True if the caller can rename / delete / add items. */
  canMutate: boolean;
}

export interface ListItem {
  id: string;
  listId: string;
  entityType: ListEntityType;
  entityId: string;
  addedByUserId: string;
  notes: string | null;
  addedAt: string;
}

export interface ListCompany {
  id: string;
  name: string;
}

export interface CreateListInput {
  title: string;
  /** Default true. Ignored when companyId is null (always private). */
  isPrivate?: boolean;
  /** Null/undefined = personal list. */
  companyId?: string | null;
}

export interface UpdateListInput {
  title?: string;
  isPrivate?: boolean;
}

export const listsService = {
  /**
   * Returns the user's visible lists + the companies they can scope new lists
   * to. Empty `companies` = personal-only (job seeker). UI uses this to
   * decide whether to render the "Private" toggle in the create dialog.
   */
  async list(
    entityType?: ListEntityType,
  ): Promise<{ lists: ListWithMeta[]; companies: ListCompany[] }> {
    const qs = entityType ? `?entityType=${entityType}` : "";
    const response = await apiClient.get<{
      lists: ListWithMeta[];
      companies: ListCompany[];
    }>(`/api/lists${qs}`);
    const data = response.data;
    return { lists: data?.lists ?? [], companies: data?.companies ?? [] };
  },

  async create(input: CreateListInput): Promise<List> {
    const response = await apiClient.post<List>("/api/lists", input);
    if (!response.data) throw new Error("Failed to create list");
    return response.data;
  },

  async update(id: string, input: UpdateListInput): Promise<List> {
    const response = await apiClient.patch<List>(`/api/lists/${id}`, input);
    if (!response.data) throw new Error("Failed to update list");
    return response.data;
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete(`/api/lists/${id}`);
  },

  async getItems(
    listId: string,
    entityType?: ListEntityType,
  ): Promise<{ list: List; items: ListItem[] }> {
    const qs = entityType ? `?entityType=${entityType}` : "";
    const response = await apiClient.get<{ list: List; items: ListItem[] }>(
      `/api/lists/${listId}/items${qs}`,
    );
    if (!response.data) throw new Error("Failed to load items");
    return response.data;
  },

  async addItem(
    listId: string,
    entityType: ListEntityType,
    entityId: string,
    notes?: string,
  ): Promise<{ item: ListItem; alreadyPresent: boolean }> {
    const response = await apiClient.post<{ item: ListItem; alreadyPresent: boolean }>(
      `/api/lists/${listId}/items`,
      { entityType, entityId, notes },
    );
    if (!response.data) throw new Error("Failed to add item");
    return response.data;
  },

  async removeItem(
    listId: string,
    entityType: ListEntityType,
    entityId: string,
  ): Promise<void> {
    await apiClient.delete(
      `/api/lists/${listId}/items?entityType=${entityType}&entityId=${entityId}`,
    );
  },

  // ── Wishlist (the one canonical per-user heart list) ─────────────────────

  /** Toggle an entity in the caller's wishlist. Returns the new state. */
  async toggleWishlist(
    entityType: ListEntityType,
    entityId: string,
  ): Promise<boolean> {
    const res = await apiClient.post<{ wishlisted: boolean }>(
      "/api/lists/wishlist/toggle",
      { entityType, entityId },
    );
    return res.data?.wishlisted ?? false;
  },

  /** The set of wishlisted entity ids for one type — hydrates hearts across
   *  a whole grid in one round-trip. */
  async wishlistIds(entityType: ListEntityType): Promise<string[]> {
    const res = await apiClient.get<{ ids: string[] }>(
      `/api/lists/wishlist/ids?entityType=${entityType}`,
      undefined,
      { suppressErrorEvent: true },
    );
    return res.data?.ids ?? [];
  },

  /** Wishlisted courses, enriched into marketplace card shape. */
  async wishlistCourses(): Promise<WishlistCourseCard[]> {
    const res = await apiClient.get<WishlistCourseCard[]>(
      "/api/lists/wishlist/courses",
      undefined,
      { suppressErrorEvent: true },
    );
    return res.data ?? [];
  },
};
