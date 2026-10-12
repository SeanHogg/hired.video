/**
 * contentAudiencesService — owner-scoped audience tagging from authoring
 * forms (#1644). Mirrors locationsService.{getForEntity,setForEntity} so
 * content forms tag audiences the same way they tag locations.
 *
 * Backed by /api/content-audiences/:kind/:entityId (owner-only). Both
 * calls are best-effort from the caller's perspective: a tag-write
 * failure shouldn't block the primary content save.
 */
import { apiClient } from "@/lib/api-client";
import type { AudienceKey } from "@shared/audiences";
import type { ContentAudienceKind } from "@shared/content-audiences";

interface ResolvedAudienceRow {
  audienceKey: AudienceKey;
  audienceTaxonomy: string;
}

export const contentAudiencesService = {
  /** Current audience-tag keys for an entity the caller owns. */
  async getForEntity(kind: ContentAudienceKind, entityId: string): Promise<AudienceKey[]> {
    const res = await apiClient.get<{ audiences?: ResolvedAudienceRow[] }>(
      `/api/content-audiences/${kind}/${entityId}`,
      undefined,
      { suppressErrorEvent: true },
    );
    return (res.data?.audiences ?? []).map((r) => r.audienceKey);
  },

  /** Replace the full audience-tag set for an entity (set semantics).
   *  Callers wrap this in try/catch — it's best-effort relative to the
   *  primary content save (the content already persisted). */
  async setForEntity(kind: ContentAudienceKind, entityId: string, keys: AudienceKey[]): Promise<void> {
    await apiClient.put(
      `/api/content-audiences/${kind}/${entityId}`,
      { audiences: keys.map((audienceKey) => ({ audienceKey })) },
    );
  },
};
