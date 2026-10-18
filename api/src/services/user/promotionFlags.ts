/**
 * Owner promotion flags — SSoT reader for Settings → Privacy →
 * "Promote Services & Content Without Authentication" (#887).
 *
 * Every public creator-output detail endpoint (profile, résumé, …) that
 * the frontend log-walls for anonymous visitors exposes the OWNER's
 * `promoteWithoutAuth` so the page can skip the AuthOverlay. They all
 * read it through this module so the column, default and failure mode
 * stay identical across surfaces.
 *
 * Batched by design: `loadPromoteWithoutAuth` takes N owner ids and runs
 * ONE `IN (...)` query, so list-shaped callers never fan out per row.
 *
 * Not cached on purpose: it's a PK-indexed single-row read that only
 * runs for anonymous viewers, and leaving it uncached means the owner's
 * toggle takes effect on the very next request with no invalidation
 * contract to maintain.
 */

import { and, inArray, isNotNull } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { logger } from "../../lib/logger.js";

type Db = ReturnType<typeof getDb>;

/** Owner id → promoteWithoutAuth. Owners without a privacy row (never
 *  opened Settings) get the column default, `false`. Fail-soft: a DB
 *  error degrades to "gated" (false) — the safe default — rather than
 *  failing the detail read it decorates. */
export async function loadPromoteWithoutAuth(
  ownerIds: readonly string[],
  db?: Db,
): Promise<Map<string, boolean>> {
  const ids = [...new Set(ownerIds.filter(Boolean))];
  const result = new Map<string, boolean>(ids.map((id) => [id, false]));
  if (ids.length === 0) return result;
  try {
    const rows = await (db ?? getDb())
      .select({
        userId: schema.userSettings.userId,
        promoteWithoutAuth: schema.userSettings.promoteWithoutAuth,
      })
      .from(schema.userSettings)
      .where(and(inArray(schema.userSettings.userId, ids), isNotNull(schema.userSettings.privacySavedAt)));
    for (const row of rows) result.set(row.userId, row.promoteWithoutAuth === true);
  } catch (err) {
    logger.warn("[promotionFlags] lookup failed; defaulting to gated", err);
  }
  return result;
}

/** Single-owner convenience over the batched reader. */
export async function isPromotedWithoutAuth(
  ownerId: string,
  db?: Db,
): Promise<boolean> {
  const map = await loadPromoteWithoutAuth([ownerId], db);
  return map.get(ownerId) ?? false;
}
