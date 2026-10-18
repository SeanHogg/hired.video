/**
 * Studio features — voice clone marketplace: the fee constants shared by the
 * write routes and services/studio/voice-clone-commands.ts (which resolves a
 * creator's fee override).
 */
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

