/**
 * Microsoft Advertising responsive search ads on Campaign Management v13
 * (#977): every call is ad-group scoped, so update + delete carry the
 * parent AdGroupId.
 *
 *   POST   /Ads   AddAds      { AdGroupId, Ads: [ResponsiveSearchAd] } → { AdIds }
 *   PUT    /Ads   UpdateAds   { AdGroupId, Ads: [{ Id, Type, Status }] }
 *   DELETE /Ads   DeleteAds   { AdGroupId, AdIds }
 *
 * Headlines / descriptions are AssetLinks wrapping a TextAsset; UTM tags go
 * in FinalUrlSuffix (custom-parameter keys can't contain "_").
 *
 * Docs: https://learn.microsoft.com/en-us/advertising/campaign-management-service/responsivesearchad
 *       https://learn.microsoft.com/en-us/advertising/campaign-management-service/addads
 */

import { PaidMediaAdapterError } from "../../ports/adapter.js";
import type { AdapterAdInput, AdapterResourceRef } from "../../ports/types.js";
import type { BingCall } from "./ad-groups.js";

const textAssets = (texts: string[]) => texts.map((Text) => ({ Asset: { Type: "TextAsset", Text } }));

/** `utm_source=…&utm_medium=…` from the ad's UTM fields (empty ones dropped). */
export function finalUrlSuffix(input: Pick<AdapterAdInput, "utmSource" | "utmMedium" | "utmCampaign" | "utmContent" | "utmTerm" | "name">): string {
  const params = new URLSearchParams();
  const pairs: Array<[string, string | null | undefined]> = [
    ["utm_source", input.utmSource ?? "bing"],
    ["utm_medium", input.utmMedium ?? "cpc"],
    ["utm_campaign", input.utmCampaign ?? input.name],
    ["utm_content", input.utmContent],
    ["utm_term", input.utmTerm],
  ];
  for (const [k, v] of pairs) if (v) params.set(k, v);
  return params.toString();
}

export async function createBingAd(
  call: BingCall,
  input: AdapterAdInput & { headlines?: string[]; headline?: string; descriptions?: string[]; description?: string },
  status: string,
): Promise<AdapterResourceRef> {
  const headlines = input.headlines ?? [input.headline ?? "Visit Site"];
  const descriptions = input.descriptions ?? [input.description ?? "Learn more today"];
  const data = await call("POST", "/Ads", {
    AdGroupId: Number(input.externalAdSetId),
    Ads: [{
      Type: "ResponsiveSearch",
      Status: status,
      Headlines: textAssets(headlines.slice(0, 15)),
      Descriptions: textAssets(descriptions.slice(0, 4)),
      FinalUrls: [input.destinationUrl],
      FinalUrlSuffix: finalUrlSuffix(input),
    }],
  });
  const id = data?.AdIds?.[0];
  if (id == null) throw new PaidMediaAdapterError("bing", "API_ERROR", "Failed to create Bing ad", data?.PartialErrors);
  return { externalId: String(id), raw: data };
}

export async function updateBingAd(
  call: BingCall,
  externalId: string,
  input: Partial<AdapterAdInput>,
  status: string | undefined,
): Promise<AdapterResourceRef> {
  if (!input.externalAdSetId) {
    throw new PaidMediaAdapterError("bing", "VALIDATION_ERROR", "UpdateAds needs the parent externalAdSetId");
  }
  const ad: Record<string, unknown> = { Id: Number(externalId), Type: "ResponsiveSearch" };
  if (status) ad.Status = status;
  if (input.destinationUrl) ad.FinalUrls = [input.destinationUrl];
  const raw = await call("PUT", "/Ads", { AdGroupId: Number(input.externalAdSetId), Ads: [ad] });
  return { externalId, raw };
}

export async function deleteBingAd(call: BingCall, externalId: string, externalAdSetId: string | undefined): Promise<void> {
  if (!externalAdSetId) {
    throw new PaidMediaAdapterError("bing", "VALIDATION_ERROR", "DeleteAds needs the parent externalAdSetId");
  }
  await call("DELETE", "/Ads", { AdGroupId: Number(externalAdSetId), AdIds: [Number(externalId)] });
}
