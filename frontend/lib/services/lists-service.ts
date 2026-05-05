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
] as const;
export type ListEntityType = (typeof LIST_ENTITY_TYPES)[number];

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
};
