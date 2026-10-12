// marketing-proof-service — public, anonymous-safe social-proof counts for
// the marketing pages (GET /api/proof/stats). Real aggregates only.

import { apiClient } from "@/lib/api-client";
import type { MarketingProofStats } from "@shared/marketing-proof";

export const marketingProofService = {
  async getStats(): Promise<MarketingProofStats> {
    const response = await apiClient.get<MarketingProofStats>("/api/proof/stats");
    return response.data;
  },
};
