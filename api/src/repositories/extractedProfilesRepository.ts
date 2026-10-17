/**
 * ExtractedProfilesRepository — candidate profiles captured from web pages
 * by the recruiter extension (`extracted_profiles`), deduped per recruiter
 * on the (name|title) content hash.
 */
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";

const { extractedProfiles } = schema;

export type ExtractedProfileRow = typeof extractedProfiles.$inferSelect;
export type ExtractedProfileInsert = typeof extractedProfiles.$inferInsert;

export async function findExtractedProfileByHash(
  recruiterId: string,
  contentHash: string,
): Promise<ExtractedProfileRow | null> {
  const [existing] = await getDb()
    .select()
    .from(extractedProfiles)
    .where(and(eq(extractedProfiles.recruiterId, recruiterId), eq(extractedProfiles.contentHash, contentHash)))
    .limit(1);
  return existing ?? null;
}

export async function insertExtractedProfile(values: ExtractedProfileInsert): Promise<ExtractedProfileRow> {
  const [profile] = await getDb().insert(extractedProfiles).values(values).returning();
  return profile;
}
