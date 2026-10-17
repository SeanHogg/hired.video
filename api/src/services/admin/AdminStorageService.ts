/**
 * AdminStorageService — SuperAdmin inspection + cleanup of the R2 video
 * bucket: bytes per user, orphaned objects (no DB row AND no live owner),
 * and single / batched deletes. Owner derivation, the DB-key column
 * registry and the orphan classifier live in services/storage/r2-keys.ts.
 */
import { getDb } from "../../db/index.js";
import { buildRepos } from "../../repositories/index.js";
import {
  classifyOrphans,
  loadDbLinkedKeys,
  loadLiveUserIds,
  summarizeByUser,
  deriveOwner,
} from "../storage/r2-keys.js";

interface R2KeyInfo {
  key: string;
  size: number;
  uploaded: string;
}

const UUID_RE = /^[0-9a-f-]{36}$/i;

/**
 * Iterate the bucket (cursor-paginated), capped at `maxKeys` so a runaway
 * scan can't walk the whole bucket — `truncated: true` tells the UI to show
 * a "showing first N" warning.
 */
async function listAll(bucket: R2Bucket, maxKeys: number): Promise<{ objects: R2KeyInfo[]; truncated: boolean }> {
  const out: R2KeyInfo[] = [];
  let cursor: string | undefined;
  let truncated = false;
  do {
    const page = await bucket.list({ cursor, limit: 1000 });
    for (const o of page.objects) {
      if (out.length >= maxKeys) {
        truncated = true;
        break;
      }
      out.push({ key: o.key, size: o.size, uploaded: o.uploaded.toISOString() });
    }
    cursor = page.truncated ? page.cursor : undefined;
    if (out.length >= maxKeys) {
      truncated = truncated || page.truncated;
      break;
    }
  } while (cursor);
  return { objects: out, truncated };
}

export async function storageUsage(bucket: R2Bucket, limit: number) {
  const { objects, truncated } = await listAll(bucket, limit);
  const summary = summarizeByUser(objects);
  const totalBytes = summary.reduce((acc, s) => acc + s.bytes, 0);

  // Hydrate user names in ONE round-trip — the synthetic `other` / `shared`
  // buckets have no user row.
  const userIds = summary
    .map((s) => s.userId)
    .filter((id): id is string => id !== "other" && id !== "shared" && UUID_RE.test(id));
  const users = userIds.length ? await buildRepos(getDb()).users.findManyByIds(userIds) : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  const breakdown = summary.map((s) => {
    const isUser = s.userId !== "other" && s.userId !== "shared";
    return {
      userId: isUser ? s.userId : null,
      bucketKind: isUser ? "user" : s.userId, // "user" | "other" | "shared"
      email: isUser ? userMap.get(s.userId)?.email ?? null : null,
      name: isUser ? userMap.get(s.userId)?.name ?? null : null,
      bytes: s.bytes,
      objectCount: s.objectCount,
    };
  });
  return { totalBytes, objectCount: objects.length, truncated, breakdown };
}

export async function storageOrphans(bucket: R2Bucket, limit: number) {
  const { objects, truncated } = await listAll(bucket, limit);
  const db = getDb();
  // 1. Every R2 key persisted anywhere in the DB. Per-table failures are
  //    captured (not thrown) so a not-yet-migrated table can't 500 the page.
  const { keys: linked, errors: dbErrors } = await loadDbLinkedKeys(db);
  // 2. Path-encoded owners that still exist own their objects even when no
  //    DB row tracks the key (e.g. `uploads/{userId}/files/...`).
  const candidateUserIds = objects.map((o) => deriveOwner(o.key).userId).filter((u): u is string => !!u);
  const liveUserIds = await loadLiveUserIds(db, candidateUserIds);

  const { orphans, reasons } = classifyOrphans(objects, linked, liveUserIds);
  orphans.sort((a, b) => b.size - a.size);
  return {
    totalOrphanBytes: orphans.reduce((acc, o) => acc + o.size, 0),
    orphanCount: orphans.length,
    truncated,
    orphans: orphans.map((o) => ({ ...o, reason: reasons.get(o.key) ?? null })),
    dbErrors,
  };
}

/** HEADs each key first so the response reports actual freed bytes and
 *  skips already-gone keys without failing the rest of the batch. */
export async function deleteObjects(bucket: R2Bucket, keys: string[]) {
  const results: Array<{ key: string; deleted: boolean; freedBytes: number; error?: string }> = [];
  let totalFreed = 0;
  let deletedCount = 0;
  for (const key of keys) {
    try {
      const head = await bucket.head(key);
      if (!head) {
        results.push({ key, deleted: false, freedBytes: 0, error: "not_found" });
        continue;
      }
      await bucket.delete(key);
      totalFreed += head.size;
      deletedCount += 1;
      results.push({ key, deleted: true, freedBytes: head.size });
    } catch (e) {
      results.push({ key, deleted: false, freedBytes: 0, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { requested: keys.length, deletedCount, totalFreedBytes: totalFreed, results };
}
