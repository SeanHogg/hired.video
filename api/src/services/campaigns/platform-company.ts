/**
 * Resolves the hired.video platform company id — the sender attribution for
 * SuperAdmin marketing campaigns. The row ("hired.video Community") is created
 * by the daily seed (seed.ts / HIRED_VIDEO_SEED_COMPANY); here we just look it
 * up by name and cache the id (it never changes after seed).
 */
import { eq } from "drizzle-orm";
import { schema } from "../../db/index.js";
import { getOrSetCached } from "../../utils/edge-cache.js";
import { HIRED_VIDEO_SEED_COMPANY } from "../job/JobService.js";

const CACHE_KEY = "platform:hired-video-company-id";
const CACHE_TTL = 600;

export async function getPlatformCompanyId(db: any): Promise<string | null> {
  return getOrSetCached<string | null>({
    key: CACHE_KEY,
    ttlSeconds: CACHE_TTL,
    loader: async () => {
      const [row] = await db
        .select({ id: schema.companyProfiles.id })
        .from(schema.companyProfiles)
        .where(eq(schema.companyProfiles.name, HIRED_VIDEO_SEED_COMPANY))
        .limit(1);
      return row?.id ?? null;
    },
  });
}
