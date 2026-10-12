/**
 * Built-in sprite library — the curated catalog of `GameAsset`-shaped
 * sprites the editor offers when the user picks "swap sprite" in the
 * inspector. Each entry is a self-contained SVG encoded as a data URI
 * so:
 *   - The runtime (`runtime-core.js`) loads them via the same `Image()`
 *     path it uses for user-uploaded R2 assets — no special-cased
 *     "built-in" code path. One asset loader, two asset sources.
 *   - The exported HTML5 bundle inherits them automatically because
 *     each picked sprite is COPIED into `state.assets` at pick time —
 *     the bundle is self-contained, no fetch of a remote sprite
 *     catalog at runtime.
 *
 * Per the DRY rule: every editor / template / catalog surface that
 * names a built-in sprite reads from `BUILTIN_SPRITES` here. The
 * `pickBuiltinSprite(id)` helper is the canonical resolver; the
 * `assignSpriteAsset(state, …, builtin)` mutation in
 * `game-state-edit.ts` is the canonical "use this sprite" action.
 *
 * Adding a sprite is one entry in `BUILTIN_SPRITES`; it lights up in
 * the picker grid + becomes addressable from seed templates without
 * any other wiring.
 */

import type { GameAsset } from "@shared/game-state";

export type SpriteCategory =
  | "character"
  | "obstacle"
  | "tile"
  | "collectible"
  | "ui";

export interface BuiltinSprite {
  /** Asset id — stable, namespaced `builtin:<slug>`. Copied verbatim
   *  into `GameSprite.assetId` and matched against `GameAsset.id` in
   *  the runtime's image cache. */
  id: string;
  /** Display label shown in the picker. */
  label: string;
  /** Bucket the picker groups by. */
  category: SpriteCategory;
  /** Inline SVG data URI — the runtime treats this exactly like any
   *  other asset URL. Encoded once at module load. */
  url: string;
  /** Recommended render size in design-time pixels. The picker
   *  adopts these as the sprite's `width` / `height` when the user
   *  assigns the asset; the inspector still lets them override. */
  width: number;
  height: number;
}

// Encode an SVG body as a data URI. `encodeURIComponent` is the
// browser-universal escape — `btoa` chokes on multi-byte chars + isn't
// available at module-load on every runtime we care about. Stripping
// leading whitespace keeps the URIs tight without sacrificing source
// readability.
function svgUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg.trim())}`;
}

// ─── Character sprites ───────────────────────────────────────────────────────
// Simple 64×64 blob characters with two-dot eyes. Tunable hue per
// character so the player roster reads as four distinct heroes at a
// glance. Visual contract: face fills ~80% of the canvas so the
// character is clearly visible even at small scales.

const character = (fill: string, label: string): BuiltinSprite => ({
  id: `builtin:player-${label}`,
  label: `Player (${label})`,
  category: "character",
  width: 64,
  height: 96,
  url: svgUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 96">
      <rect x="6" y="14" width="52" height="76" rx="18" ry="20" fill="${fill}" stroke="#1f2937" stroke-width="2.5"/>
      <circle cx="22" cy="40" r="4" fill="#1f2937"/>
      <circle cx="42" cy="40" r="4" fill="#1f2937"/>
      <path d="M 22 60 Q 32 70 42 60" stroke="#1f2937" stroke-width="3" fill="none" stroke-linecap="round"/>
      <rect x="14" y="86" width="14" height="6" rx="2" fill="#1f2937"/>
      <rect x="36" y="86" width="14" height="6" rx="2" fill="#1f2937"/>
    </svg>
  `),
});

// ─── Obstacle sprites ────────────────────────────────────────────────────────

const ROCK: BuiltinSprite = {
  id: "builtin:obstacle-rock",
  label: "Rock",
  category: "obstacle",
  width: 56,
  height: 56,
  url: svgUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56">
      <path d="M 6 42 Q 4 28 18 18 Q 28 8 40 16 Q 54 22 50 38 Q 48 50 32 50 Q 14 52 6 42 Z"
            fill="#6b7280" stroke="#1f2937" stroke-width="2"/>
      <path d="M 16 32 L 20 26 L 26 32 Z" fill="#9ca3af"/>
      <path d="M 32 22 L 38 18 L 42 26 Z" fill="#9ca3af"/>
    </svg>
  `),
};

const CACTUS: BuiltinSprite = {
  id: "builtin:obstacle-cactus",
  label: "Cactus",
  category: "obstacle",
  width: 48,
  height: 72,
  url: svgUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 72">
      <rect x="18" y="16" width="12" height="50" rx="6" fill="#16a34a" stroke="#14532d" stroke-width="2"/>
      <rect x="6" y="32" width="14" height="20" rx="6" fill="#16a34a" stroke="#14532d" stroke-width="2"/>
      <rect x="28" y="26" width="14" height="22" rx="6" fill="#16a34a" stroke="#14532d" stroke-width="2"/>
      <line x1="24" y1="22" x2="24" y2="62" stroke="#14532d" stroke-width="1.5" stroke-dasharray="3 3"/>
    </svg>
  `),
};

const BOMB: BuiltinSprite = {
  id: "builtin:obstacle-bomb",
  label: "Bomb",
  category: "obstacle",
  width: 56,
  height: 64,
  url: svgUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 64">
      <circle cx="28" cy="38" r="22" fill="#1f2937" stroke="#000" stroke-width="2"/>
      <circle cx="20" cy="30" r="4" fill="#4b5563"/>
      <path d="M 36 18 Q 42 8 50 12" stroke="#92400e" stroke-width="3" fill="none" stroke-linecap="round"/>
      <circle cx="50" cy="12" r="4" fill="#fbbf24"/>
      <circle cx="50" cy="12" r="2" fill="#fff"/>
    </svg>
  `),
};

// ─── Tile sprites ────────────────────────────────────────────────────────────

const GROUND_GRASS: BuiltinSprite = {
  id: "builtin:tile-grass",
  label: "Grass tile",
  category: "tile",
  width: 128,
  height: 32,
  url: svgUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 32" preserveAspectRatio="none">
      <rect x="0" y="8" width="128" height="24" fill="#92400e"/>
      <rect x="0" y="0" width="128" height="10" fill="#16a34a"/>
      <path d="M 0 10 L 8 6 L 16 10 L 24 6 L 32 10 L 40 6 L 48 10 L 56 6 L 64 10 L 72 6 L 80 10 L 88 6 L 96 10 L 104 6 L 112 10 L 120 6 L 128 10"
            stroke="#15803d" stroke-width="1.5" fill="none"/>
    </svg>
  `),
};

const STONE_TILE: BuiltinSprite = {
  id: "builtin:tile-stone",
  label: "Stone tile",
  category: "tile",
  width: 64,
  height: 64,
  url: svgUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <rect width="64" height="64" fill="#6b7280" stroke="#1f2937" stroke-width="2"/>
      <line x1="0" y1="32" x2="64" y2="32" stroke="#1f2937" stroke-width="1"/>
      <line x1="20" y1="0" x2="20" y2="32" stroke="#1f2937" stroke-width="1"/>
      <line x1="44" y1="32" x2="44" y2="64" stroke="#1f2937" stroke-width="1"/>
    </svg>
  `),
};

const BRICK_TILE: BuiltinSprite = {
  id: "builtin:tile-brick",
  label: "Brick tile",
  category: "tile",
  width: 64,
  height: 32,
  url: svgUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 32" preserveAspectRatio="none">
      <rect width="64" height="32" fill="#b91c1c"/>
      <line x1="0" y1="16" x2="64" y2="16" stroke="#7f1d1d" stroke-width="2"/>
      <line x1="20" y1="0" x2="20" y2="16" stroke="#7f1d1d" stroke-width="2"/>
      <line x1="44" y1="16" x2="44" y2="32" stroke="#7f1d1d" stroke-width="2"/>
    </svg>
  `),
};

// ─── Collectible sprites ─────────────────────────────────────────────────────

const COIN: BuiltinSprite = {
  id: "builtin:collectible-coin",
  label: "Coin",
  category: "collectible",
  width: 32,
  height: 32,
  url: svgUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="14" fill="#fbbf24" stroke="#92400e" stroke-width="2"/>
      <circle cx="16" cy="16" r="9" fill="none" stroke="#92400e" stroke-width="1.5"/>
      <text x="16" y="20" text-anchor="middle" font-family="serif" font-weight="bold" font-size="11" fill="#92400e">$</text>
    </svg>
  `),
};

const STAR: BuiltinSprite = {
  id: "builtin:collectible-star",
  label: "Star",
  category: "collectible",
  width: 40,
  height: 40,
  url: svgUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
      <polygon points="20,3 24,15 37,15 27,23 31,36 20,28 9,36 13,23 3,15 16,15"
               fill="#fbbf24" stroke="#92400e" stroke-width="2" stroke-linejoin="round"/>
    </svg>
  `),
};

const CHERRY: BuiltinSprite = {
  id: "builtin:collectible-cherry",
  label: "Cherry",
  category: "collectible",
  width: 40,
  height: 48,
  url: svgUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 48">
      <path d="M 14 8 Q 20 0 28 4" stroke="#15803d" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <path d="M 26 4 Q 30 14 28 18" stroke="#15803d" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <circle cx="13" cy="32" r="10" fill="#dc2626" stroke="#7f1d1d" stroke-width="1.5"/>
      <circle cx="27" cy="36" r="10" fill="#dc2626" stroke="#7f1d1d" stroke-width="1.5"/>
      <ellipse cx="10" cy="28" rx="3" ry="2" fill="#fca5a5" opacity="0.7"/>
    </svg>
  `),
};

// ─── UI sprites ──────────────────────────────────────────────────────────────

const CARD_BACK: BuiltinSprite = {
  id: "builtin:card-back",
  label: "Card back",
  category: "ui",
  width: 96,
  height: 128,
  url: svgUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 128">
      <rect width="96" height="128" rx="10" fill="#7c3aed" stroke="#1e1b4b" stroke-width="2"/>
      <rect x="8" y="8" width="80" height="112" rx="6" fill="none" stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="3 3"/>
      <circle cx="48" cy="64" r="20" fill="none" stroke="#a78bfa" stroke-width="2"/>
      <path d="M 38 64 L 48 54 L 58 64 L 48 74 Z" fill="#a78bfa"/>
    </svg>
  `),
};

const BUTTON: BuiltinSprite = {
  id: "builtin:button",
  label: "Button",
  category: "ui",
  width: 160,
  height: 48,
  url: svgUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 48" preserveAspectRatio="none">
      <rect x="2" y="2" width="156" height="44" rx="22" fill="#7c3aed" stroke="#1e1b4b" stroke-width="2"/>
      <rect x="6" y="6" width="148" height="14" rx="7" fill="#a78bfa" opacity="0.5"/>
    </svg>
  `),
};

// ─── Catalog ────────────────────────────────────────────────────────────────

export const BUILTIN_SPRITES: BuiltinSprite[] = [
  // Characters
  character("#fbbf24", "yellow"),
  character("#3b82f6", "blue"),
  character("#22c55e", "green"),
  character("#ef4444", "red"),
  // Obstacles
  ROCK,
  CACTUS,
  BOMB,
  // Tiles
  GROUND_GRASS,
  STONE_TILE,
  BRICK_TILE,
  // Collectibles
  COIN,
  STAR,
  CHERRY,
  // UI
  CARD_BACK,
  BUTTON,
];

/** Resolve a built-in sprite by id. Returns null for unknown ids so
 *  callers can defensively fall back to a placeholder render. */
export function pickBuiltinSprite(id: string): BuiltinSprite | null {
  return BUILTIN_SPRITES.find((s) => s.id === id) ?? null;
}

/** Project a `BuiltinSprite` into a `GameAsset` shape — the runtime
 *  reads assets via this shape only, so the editor copies built-ins
 *  into `state.assets` to keep the data model uniform. */
export function spriteToAsset(sprite: BuiltinSprite): GameAsset {
  return {
    id: sprite.id,
    kind: "sprite",
    url: sprite.url,
  };
}
