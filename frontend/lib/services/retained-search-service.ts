/**
 * retainedSearchService (#1675) — read the public retained-search firm
 * directory. Best-effort: returns [] on transport failure so the page
 * degrades to an empty state.
 */
import { apiClient } from "@/lib/api-client";

export interface RetainedSearchFirm {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  website: string | null;
  contactUrl: string | null;
  logoUrl: string | null;
  tier: string;
  specialties: string[] | null;
  regions: string[] | null;
}

export const retainedSearchService = {
  async listFirms(opts: { region?: string; specialty?: string } = {}): Promise<RetainedSearchFirm[]> {
    const params = new URLSearchParams();
    if (opts.region) params.set("region", opts.region);
    if (opts.specialty) params.set("specialty", opts.specialty);
    const qs = params.toString() ? `?${params.toString()}` : "";
    try {
      const res = await apiClient.get<RetainedSearchFirm[]>(
        `/api/retained-search/firms${qs}`,
        undefined,
        { suppressErrorEvent: true },
      );
      return res.data ?? [];
    } catch {
      return [];
    }
  },
};
