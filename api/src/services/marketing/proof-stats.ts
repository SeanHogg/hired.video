/**
 * Public social-proof stats for the marketing surface.
 *
 * Cached through the canonical edge cache with a 1h TTL rather than
 * invalidate-on-write: the figure is a slow-moving aggregate that every
 * resume create would otherwise churn, and the UI rounds it down anyway
 * (`shared/marketing-proof.ts`), so an hour of lag never changes what
 * a visitor sees.
 */

import { getOrSetCached } from "../../utils/edge-cache.js";
import type { IMarketingProofRepository } from "../../repositories/marketingProofRepository.js";
import type { MarketingProofStats } from "../../../../shared/marketing-proof.js";

const PROOF_CACHE_KEY = "marketing:proof:v1";
const PROOF_TTL_SECONDS = 3600;

export function getMarketingProofStats(repo: IMarketingProofRepository): Promise<MarketingProofStats> {
  return getOrSetCached<MarketingProofStats>({
    key: PROOF_CACHE_KEY,
    ttlSeconds: PROOF_TTL_SECONDS,
    loader: async () => ({ resumeBuilders: await repo.countResumeBuilders() }),
  });
}
