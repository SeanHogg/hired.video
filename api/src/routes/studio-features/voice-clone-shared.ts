/**
 * Studio features — voice clone marketplace: fee constants and licence
 * checks shared by the read and write route modules.
 */
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { studioVoiceCloneLicenses } from "./shared.js";

// ═══════════════════════════════════════════════════════════════════════════════
// ██  9. VOICE CLONE MARKETPLACE
// ═══════════════════════════════════════════════════════════════════════════════
//
// Voice cloning is now a creator-owned, optionally-monetised asset. The
// backend stores reference audio + listing metadata + a license ledger;
// synthesis itself runs entirely client-side via WebGPU TTS engines
// (Kokoro, Piper, VibeVoice). No model is invoked server-side.
//
// Endpoints:
//   GET    /voice-clones                    — list caller's own clones
//   GET    /voice-clones/library            — every clone the caller can use (owned + licensed)
//   GET    /voice-clones/marketplace        — public catalog (no auth)
//   GET    /voice-clones/:id                — single clone (must be owner OR public OR licensee)
//   POST   /voice-clones                    — upload sample, create private clone
//   PATCH  /voice-clones/:id                — edit metadata, publish/unpublish, set price
//   DELETE /voice-clones/:id                — delete (owner only)
//   POST   /voice-clones/:id/claim          — claim a free public listing
//   POST   /voice-clones/:id/checkout       — start a paid checkout (returns provider session info)
//   POST   /voice-clones/:id/play           — increment play_count (analytics)

// Platform fee for creator sales, in basis points. 500 = 5%. The CC
// processing fee is additionally passed to the buyer at checkout. This is the
// PROSPECTIVE default applied to new opt-ins; each listing snapshots its own
// `platformFeeBps` at publish time so historical sales remain auditable when
// the default changes. Per-user overrides may be set by superadmin on the
// users table and are applied at opt-in time.
export const PLATFORM_FEE_BPS_DEFAULT = 500; // 5%
export const MAX_PRICE_CENTS = 1_000_00;       // $1,000 hard cap, sanity guard

/**
 * Resolve the platform fee bps to snapshot onto a listing for `userId`
 * (#157). Reads `users.creator_platform_fee_bps_override`; falls back to
 * `PLATFORM_FEE_BPS_DEFAULT` when null. Snapshot semantics apply at the
 * call site — existing listings keep their stored `platform_fee_bps`.
 */
export async function resolveCreatorFeeBps(userId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ override: schema.users.creatorPlatformFeeBpsOverride })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return row?.override ?? PLATFORM_FEE_BPS_DEFAULT;
}

/** Returns true iff `userId` may synthesize speech with `cloneId`. */
export async function userHasVoiceLicense(db: ReturnType<typeof getDb>, userId: string, cloneId: string): Promise<boolean> {
  const rows = await db
    .select({ id: studioVoiceCloneLicenses.id })
    .from(studioVoiceCloneLicenses)
    .where(and(eq(studioVoiceCloneLicenses.userId, userId), eq(studioVoiceCloneLicenses.voiceCloneId, cloneId)))
    .limit(1);
  return rows.length > 0;
}
