/**
 * Feed Features Service — client for the SuperAdmin-curated dashboard feed.
 *
 *   getForRole()  — the authenticated dashboard read (cards for the viewer's
 *                   role, or a SA-previewed role).
 *   admin*        — SuperAdmin curation CRUD, used by the curation page.
 *
 * Wire shape + enums come from @shared/feed-features so this can't drift
 * from the backend.
 */
import { apiClient } from "../api-client";
import type {
  FeedFeatureCard,
  FeedFeatureKind,
} from "@shared/feed-features";
import type { UserRole } from "@shared/user-roles";

export interface FeedFeatureAdminItem {
  id: string;
  entityKind: FeedFeatureKind;
  entityId: string;
  roles: string[];
  title: string;
  embedPayload: Record<string, unknown>;
  rank: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFeedFeaturePayload {
  entityKind: FeedFeatureKind;
  entityId: string;
  roles: string[];
  title: string;
  rank?: number;
  isActive?: boolean;
  embedPayload: Record<string, unknown>;
}

export interface UpdateFeedFeaturePayload {
  roles?: string[];
  title?: string;
  rank?: number;
  isActive?: boolean;
  embedPayload?: Record<string, unknown>;
}

class FeedFeaturesService {
  /** Render-ready cards for the viewer's dashboard. `role` is a SA-only
   *  preview override; non-SA callers always get their own role. */
  async getForRole(role?: UserRole | string): Promise<FeedFeatureCard[]> {
    try {
      const qs = role ? `?role=${encodeURIComponent(role)}` : "";
      const res = await apiClient.get<{ role: string; cards: FeedFeatureCard[] }>(
        `/api/feed-features${qs}`,
        undefined,
        { suppressErrorEvent: true },
      );
      return res.data?.cards ?? [];
    } catch {
      // Best-effort — an empty curated feed should never break the dashboard.
      return [];
    }
  }

  async adminList(): Promise<FeedFeatureAdminItem[]> {
    const res = await apiClient.get<FeedFeatureAdminItem[]>(
      "/api/admin/feed-features",
    );
    return res.data ?? [];
  }

  async adminCreate(payload: CreateFeedFeaturePayload): Promise<FeedFeatureAdminItem> {
    const res = await apiClient.post<FeedFeatureAdminItem>(
      "/api/admin/feed-features",
      payload,
    );
    return res.data;
  }

  async adminUpdate(
    id: string,
    patch: UpdateFeedFeaturePayload,
  ): Promise<FeedFeatureAdminItem> {
    const res = await apiClient.patch<FeedFeatureAdminItem>(
      `/api/admin/feed-features/${id}`,
      patch,
    );
    return res.data;
  }

  async adminDelete(id: string): Promise<void> {
    await apiClient.delete(`/api/admin/feed-features/${id}`);
  }
}

export const feedFeaturesService = new FeedFeaturesService();
