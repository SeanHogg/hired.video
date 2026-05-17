// r2-keys.ts — canonical registry of R2 key conventions + orphan detection.
//
// Every R2 write site in the codebase stamps a key that follows one of the
// patterns in `R2_KEY_PATTERNS`. The same registry powers:
//   • Usage-by-user roll-ups in admin-r2.ts (the second segment of a
//     `studio/{uid}/...` or `uploads/{uid}/...` key identifies the owner).
//   • Orphan detection — an object is an orphan iff it has no DB row pointing
//     at it AND its path-encoded owner is missing (or unidentifiable).
//
// If you add a new R2 write site, add its pattern here and (if it persists
// the key) its `r2KeyColumn` so the orphan sweep recognises it. Otherwise
// the next admin sweep will flag your new objects as deletable.

import type { Db } from "../../db/index.js";
import { schema } from "../../db/index.js";
import { inArray } from "drizzle-orm";

/**
 * How a key is owned:
 *   • `user`   — the second path segment is a user UUID. Object is valid as
 *                long as that user exists.
 *   • `shared` — the object is shared across users (e.g. stock media). Only
 *                its DB row keeps it alive.
 */
export type OwnerKind = "user" | "shared";

interface KeyPattern {
  /** Human label for diagnostics. */
  label: string;
  /** Regex anchored at the start of the key. Capture group 1 = userId for `user` kind. */
  match: RegExp;
  ownerKind: OwnerKind;
}

/**
 * Every prefix the app writes to R2. Keep ordered most-specific-first so
 * `studio/recordings/{uid}` and `studio/voice-clones/{uid}` match before the
 * generic `studio/{uid}` rule.
 */
export const R2_KEY_PATTERNS: readonly KeyPattern[] = [
  { label: "studio recordings",      match: /^studio\/recordings\/([0-9a-f-]{36})\//i,    ownerKind: "user" },
  { label: "studio voice clones",    match: /^studio\/voice-clones\/([0-9a-f-]{36})\//i,  ownerKind: "user" },
  { label: "studio project video",   match: /^studio\/([0-9a-f-]{36})\//i,                ownerKind: "user" },
  { label: "user uploads",           match: /^uploads\/([0-9a-f-]{36})\//i,               ownerKind: "user" },
  { label: "NLE source",             match: /^nle-sources\/([0-9a-f-]{36})\//i,           ownerKind: "user" },
  { label: "NLE proxy",              match: /^nle-proxies\/([0-9a-f-]{36})\//i,           ownerKind: "user" },
  { label: "stock media",            match: /^stock\//,                                    ownerKind: "shared" },
] as const;

export interface OwnerDerivation {
  pattern: KeyPattern | null;
  userId: string | null;     // present when ownerKind === "user"
}

/** Inspect a key against the registry and report the owning convention. */
export function deriveOwner(key: string): OwnerDerivation {
  for (const p of R2_KEY_PATTERNS) {
    const m = p.match.exec(key);
    if (!m) continue;
    return { pattern: p, userId: p.ownerKind === "user" ? (m[1] ?? null) : null };
  }
  return { pattern: null, userId: null };
}

/**
 * Roll up R2 object listings into per-user totals. Unrecognised keys land
 * under the synthetic `"other"` bucket so they're visible rather than silently
 * dropped. Shared keys (stock/) collect under `"shared"` for the same reason.
 */
export type UsageBucket = string | "other" | "shared";

export interface UsageBreakdownEntry {
  userId: UsageBucket;
  bytes: number;
  objectCount: number;
}

export function summarizeByUser(
  objects: ReadonlyArray<{ key: string; size: number }>,
): UsageBreakdownEntry[] {
  const byUser = new Map<UsageBucket, { bytes: number; objectCount: number }>();
  for (const obj of objects) {
    const { pattern, userId } = deriveOwner(obj.key);
    const bucket: UsageBucket = userId ?? (pattern?.ownerKind === "shared" ? "shared" : "other");
    const cur = byUser.get(bucket) ?? { bytes: 0, objectCount: 0 };
    cur.bytes += obj.size;
    cur.objectCount += 1;
    byUser.set(bucket, cur);
  }
  return Array.from(byUser.entries())
    .map(([userId, agg]) => ({ userId, ...agg }))
    .sort((a, b) => b.bytes - a.bytes);
}

// ─── Orphan detection ───────────────────────────────────────────────────────

/**
 * Every column in the DB that stores an R2 key. The orphan sweep UNIONs these
 * so any object referenced anywhere in the system is kept alive. If you add
 * a new table column that holds an R2 key, add it here.
 */
export const DB_R2_KEY_COLUMNS = [
  { table: schema.videos,                column: schema.videos.r2Key,                    label: "videos.r2Key" },
  { table: schema.interviewAnswers,      column: schema.interviewAnswers.r2Key,          label: "interviewAnswers.r2Key" },
  { table: schema.studioVoiceovers,      column: schema.studioVoiceovers.audioKey,       label: "studioVoiceovers.audioKey" },
  { table: schema.studioVoiceClones,     column: schema.studioVoiceClones.sampleAudioKey,  label: "studioVoiceClones.sampleAudioKey" },
  { table: schema.studioVoiceClones,     column: schema.studioVoiceClones.previewAudioKey, label: "studioVoiceClones.previewAudioKey" },
  { table: schema.studioRecordings,      column: schema.studioRecordings.videoKey,       label: "studioRecordings.videoKey" },
  { table: schema.studioAsyncResponses,  column: schema.studioAsyncResponses.videoKey,   label: "studioAsyncResponses.videoKey" },
  { table: schema.stockMediaAssets,      column: schema.stockMediaAssets.storageKey,     label: "stockMediaAssets.storageKey" },
  { table: schema.studioThumbnails,      column: schema.studioThumbnails.storageKey,     label: "studioThumbnails.storageKey" },
] as const;

/** Load every key the DB knows about, across all owning tables. */
export async function loadDbLinkedKeys(db: Db): Promise<Set<string>> {
  const linked = new Set<string>();
  // Sequential rather than Promise.all — neon-http drivers serialize on the
  // single fetch connection and the parallelism wins nothing while making
  // failures harder to attribute.
  for (const { table, column } of DB_R2_KEY_COLUMNS) {
    const rows = await db.select({ k: column }).from(table);
    for (const r of rows) {
      if (r.k) linked.add(r.k);
    }
  }
  return linked;
}

export interface OrphanInput {
  key: string;
  size: number;
  uploaded: string;
}

export interface OrphanClassification<T extends OrphanInput> {
  orphans: T[];
  /** Map from key → human reason for diagnostics (only present on orphans). */
  reasons: Map<string, string>;
}

/**
 * An object is an orphan iff:
 *   1. It does NOT appear in any DB-tracked R2 key column, AND
 *   2. Its path-encoded user owner is missing (user doesn't exist), or the
 *      key follows no known convention at all.
 *
 * The `shared` kind (stock/) is orphan-only when the DB row is gone — the
 * path doesn't carry an owner to validate against.
 */
export function classifyOrphans<T extends OrphanInput>(
  objects: ReadonlyArray<T>,
  linkedKeys: ReadonlySet<string>,
  liveUserIds: ReadonlySet<string>,
): OrphanClassification<T> {
  const orphans: T[] = [];
  const reasons = new Map<string, string>();
  for (const obj of objects) {
    if (linkedKeys.has(obj.key)) continue;
    const { pattern, userId } = deriveOwner(obj.key);
    if (!pattern) {
      orphans.push(obj);
      reasons.set(obj.key, "unrecognised key prefix");
      continue;
    }
    if (pattern.ownerKind === "user") {
      if (userId && liveUserIds.has(userId)) continue;
      orphans.push(obj);
      reasons.set(obj.key, userId ? `${pattern.label}: owner ${userId} no longer exists` : `${pattern.label}: malformed owner segment`);
      continue;
    }
    // shared kind — no path owner; absence from DB is enough
    orphans.push(obj);
    reasons.set(obj.key, `${pattern.label}: no DB row references this key`);
  }
  return { orphans, reasons };
}

/** Resolve which of `candidateUserIds` actually exist in `users`. */
export async function loadLiveUserIds(
  db: Db,
  candidateUserIds: ReadonlyArray<string>,
): Promise<Set<string>> {
  const ids = Array.from(new Set(candidateUserIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id))));
  if (ids.length === 0) return new Set();
  const rows = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(inArray(schema.users.id, ids));
  return new Set(rows.map((r) => r.id));
}
