/** AudienceService bound to the request DB handle, for SuperAdmin batch tagging. */
import { getDb } from "../../db/index.js";
import { AudienceService } from "../audience/AudienceService.js";

export function adminAudienceService(): AudienceService {
  return new AudienceService({ db: getDb() });
}
