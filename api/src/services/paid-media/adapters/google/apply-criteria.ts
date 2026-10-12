/**
 * #976 — push an ad set's TargetingSpec to Google Ads: (on update) read the
 * managed criteria with GAQL, then send the whole delta in ONE
 * `googleAds:mutate` batch. Transport is injected so the adapter keeps
 * owning auth headers + error mapping.
 */

import type { TargetingSpec } from "../../ports/types.js";
import {
  buildGoogleCriteriaPlan,
  existingCriteriaQueries,
  parseExistingCriteria,
  type ExistingCriterion,
} from "./criteria.js";

/** POST `path` (relative to the customer) with a JSON body; returns parsed JSON. */
export type GooglePost = (path: string, body: unknown) => Promise<any>;

export interface AppliedCriteria {
  operations: number;
  skipped: string[];
  response?: unknown;
}

export async function applyGoogleTargetingCriteria(
  post: GooglePost,
  args: { customerId: string; campaignId: string; adGroupId: string; spec: TargetingSpec; readExisting: boolean },
): Promise<AppliedCriteria> {
  let existing: ExistingCriterion[] = [];
  if (args.readExisting) {
    const q = existingCriteriaQueries(args.campaignId, args.adGroupId);
    const [camp, group] = await Promise.all([
      post("googleAds:search", { query: q.campaign }),
      post("googleAds:search", { query: q.adGroup }),
    ]);
    existing = parseExistingCriteria([...(camp?.results ?? []), ...(group?.results ?? [])]);
  }
  const plan = buildGoogleCriteriaPlan({ ...args, existing });
  if (plan.mutateOperations.length === 0) return { operations: 0, skipped: plan.skipped };
  const response = await post("googleAds:mutate", { mutateOperations: plan.mutateOperations });
  return { operations: plan.mutateOperations.length, skipped: plan.skipped, response };
}
