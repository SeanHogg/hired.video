/**
 * Microsoft Advertising ad groups (= our ad sets) + their targeting
 * criteria, on the documented Campaign Management v13 REST endpoints:
 *
 *   POST   /AdGroups                       AddAdGroups
 *   PUT    /AdGroups                       UpdateAdGroups
 *   DELETE /AdGroups                       DeleteAdGroups
 *   POST   /AdGroupCriterions              AddAdGroupCriterions
 *   POST   /AdGroupCriterions/QueryByIds   GetAdGroupCriterionsByIds
 *   DELETE /AdGroupCriterions              DeleteAdGroupCriterions
 *
 * Transport (auth headers + error mapping) is injected by the adapter.
 */

import { PaidMediaAdapterError } from "../../ports/adapter.js";
import type { AdapterAdSetInput, AdapterResourceRef } from "../../ports/types.js";
import {
  buildBingCriteriaDelta,
  buildBingCriteriaPlan,
  existingCriteriaQuery,
} from "./criteria.js";

/** JSON call against MS_CAMPAIGN_API; returns the parsed body. */
export type BingCall = (method: "POST" | "PUT" | "DELETE", path: string, body: unknown) => Promise<any>;

function msDate(d: Date | null | undefined) {
  return d ? { Day: d.getUTCDate(), Month: d.getUTCMonth() + 1, Year: d.getUTCFullYear() } : undefined;
}

export async function createBingAdGroup(
  call: BingCall,
  input: AdapterAdSetInput,
  status: string,
): Promise<AdapterResourceRef> {
  const data = await call("POST", "/AdGroups", {
    CampaignId: Number(input.externalCampaignId),
    AdGroups: [{
      Name: input.name,
      Status: status,
      StartDate: msDate(input.startAt),
      EndDate: msDate(input.endAt),
      CpcBid: input.bidAmountCents != null ? { Amount: input.bidAmountCents / 100 } : undefined,
    }],
  });
  const id = data?.AdGroupIds?.[0];
  if (id == null) {
    throw new PaidMediaAdapterError("bing", "API_ERROR", "Failed to create Bing ad group", data?.PartialErrors);
  }
  // #977 — geo / age / gender / device criteria in ONE AddAdGroupCriterions call.
  const plan = buildBingCriteriaPlan(String(id), input.targeting ?? {});
  const criteria = plan.body ? await call("POST", "/AdGroupCriterions", plan.body) : null;
  return { externalId: String(id), raw: { adGroup: data, criteria, skipped: plan.skipped } };
}

export async function updateBingAdGroup(
  call: BingCall,
  externalId: string,
  input: Partial<AdapterAdSetInput>,
  status: string | undefined,
): Promise<AdapterResourceRef> {
  if (!input.externalCampaignId) {
    throw new PaidMediaAdapterError("bing", "VALIDATION_ERROR", "UpdateAdGroups needs the parent externalCampaignId");
  }
  const group: Record<string, unknown> = { Id: Number(externalId) };
  if (input.name) group.Name = input.name;
  if (status) group.Status = status;
  if (input.bidAmountCents != null) group.CpcBid = { Amount: input.bidAmountCents / 100 };
  const adGroup = await call("PUT", "/AdGroups", { CampaignId: Number(input.externalCampaignId), AdGroups: [group] });

  if (!input.targeting) return { externalId, raw: { adGroup } };
  // #977 — read what's there, then one delete batch + one add batch.
  const existing = await call("POST", "/AdGroupCriterions/QueryByIds", existingCriteriaQuery(externalId));
  const delta = buildBingCriteriaDelta(externalId, input.targeting, existing?.AdGroupCriterions ?? []);
  const removed = delta.remove ? await call("DELETE", "/AdGroupCriterions", delta.remove) : null;
  const added = delta.add ? await call("POST", "/AdGroupCriterions", delta.add) : null;
  return { externalId, raw: { adGroup, criteria: { removed, added, skipped: delta.skipped } } };
}

export async function deleteBingAdGroup(call: BingCall, externalId: string, externalCampaignId: string | undefined): Promise<void> {
  if (!externalCampaignId) {
    throw new PaidMediaAdapterError("bing", "VALIDATION_ERROR", "DeleteAdGroups needs the parent externalCampaignId");
  }
  await call("DELETE", "/AdGroups", { CampaignId: Number(externalCampaignId), AdGroupIds: [Number(externalId)] });
}
