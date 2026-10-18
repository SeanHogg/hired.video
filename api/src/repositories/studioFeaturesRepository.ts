/**
 * Studio-features batch writes/reads used by routes/studio-features.ts —
 * voice-clone licenses (cart checkout). Batch-shaped so a cart costs a
 * fixed number of round-trips
 * instead of one per line item (neon-http: every query is an HTTP request).
 */
import { and, eq, inArray } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const { studioVoiceCloneLicenses } = schema;

/** Which of `cloneIds` the user already holds a license for — ONE query. */
export async function findLicensedVoiceCloneIds(
  db: Db,
  userId: string,
  cloneIds: readonly string[],
): Promise<Set<string>> {
  if (cloneIds.length === 0) return new Set();
  const rows = await db
    .select({ voiceCloneId: studioVoiceCloneLicenses.voiceCloneId })
    .from(studioVoiceCloneLicenses)
    .where(and(
      eq(studioVoiceCloneLicenses.userId, userId),
      inArray(studioVoiceCloneLicenses.voiceCloneId, [...new Set(cloneIds)]),
    ));
  return new Set(rows.map((r) => r.voiceCloneId));
}

/** Grant 'free' licenses for many clones in ONE multi-row insert. */
export async function grantFreeVoiceCloneLicenses(
  db: Db,
  userId: string,
  cloneIds: readonly string[],
): Promise<void> {
  const unique = [...new Set(cloneIds)];
  if (unique.length === 0) return;
  await db
    .insert(studioVoiceCloneLicenses)
    .values(unique.map((voiceCloneId) => ({ userId, voiceCloneId, source: "free" })))
    .onConflictDoNothing();
}
