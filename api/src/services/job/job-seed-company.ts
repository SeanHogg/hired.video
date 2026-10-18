/** First-party "hired.video Community" seed company identity. */

/** Stable string used as the "company" for jobs tracked through the
 * extension when we can't extract a real employer from the page.
 * Surfaced as the seed company on the public job board. Also serves as
 * the first-party owner of platform-shipped Studio templates — see
 * getHiredVideoCommunityCompanyId() below. */
export const HIRED_VIDEO_SEED_COMPANY = "hired.video Community";

/** Resolve the Hired.VIDEO Community companyProfiles.id. Delegates to the
 *  ONE cached resolver (`getPlatformCompanyId`, edge-cache key
 *  `platform:hired-video-company-id`) so there is a single cache for the id.
 *  Returns null if the seed hasn't run yet — callers should treat that as
 *  "no first-party templates exist" rather than blocking. Dynamic imports
 *  avoid a job-seed-company <-> platform-company import cycle. */
export async function getHiredVideoCommunityCompanyId(): Promise<string | null> {
  const { getDb } = await import("../../db/index.js");
  const { getPlatformCompanyId } = await import("../campaigns/platform-company.js");
  return getPlatformCompanyId(getDb());
}
