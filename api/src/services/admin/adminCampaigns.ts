/**
 * SuperAdmin marketing-campaign bindings: the CampaignService on the request
 * DB handle, and campaign creation always attributed to the hired.video
 * platform company.
 */
import { getDb } from "../../db/index.js";
import { CampaignService } from "../campaigns/CampaignService.js";
import { getPlatformCompanyId } from "../campaigns/platform-company.js";

export function adminCampaignService(): CampaignService {
  return CampaignService.create(getDb());
}

/** SuperAdmin marketing campaigns are always sent as the hired.video company. */
export async function createPlatformCampaign(input: Parameters<CampaignService["create"]>[0], createdByUserId: string) {
  const db = getDb();
  const senderCompanyId = await getPlatformCompanyId(db);
  return CampaignService.create(db).create(input, { createdByUserId, senderCompanyId });
}
