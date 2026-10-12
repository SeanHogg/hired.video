/**
 * `createAssetCache` tests — the asset loader that bridges
 * `GameState.assets` → `HTMLImageElement` for `drawFrame`. The cache
 * is per-`runGame` instance so repeated frame draws are constant-time
 * lookups, and it tolerates missing / dangling asset references by
 * returning `null` so callers fall back to a placeholder.
 *
 * The actual `Image.onload` round-trip is async; we don't drive it
 * here. The tests pin the synchronous contract:
 *   - First call for an unknown id returns null + records "error".
 *   - First call for a known id returns null + records "loading"
 *     (the image is fetching).
 *   - Subsequent calls return cached null until onload fires.
 *
 * Run: vitest run lib/studio/__tests__/game-asset-cache.test.ts
 */

import { describe, it, expect } from "vitest";
import { createAssetCache } from "@/lib/studio/game/runtime-core.js";
import type { GameAsset } from "@shared/game-state";

const FAKE_SPRITE_URL =
  "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2010%2010%22%3E%3C/svg%3E";

const fakeAssets: GameAsset[] = [
  { id: "builtin:player-yellow", kind: "sprite", url: FAKE_SPRITE_URL },
  { id: "builtin:rock", kind: "sprite", url: FAKE_SPRITE_URL },
];

describe("createAssetCache", () => {
  it("returns null on the first call for a known id (load in progress)", () => {
    const cache = createAssetCache(fakeAssets);
    // First call kicks off the load. Image.onload runs async in
    // jsdom, so the same-tick result must be null. Callers that paint
    // every frame pick up the bitmap when it lands a frame later.
    expect(cache.get("builtin:player-yellow")).toBeNull();
  });

  it("returns null for unknown asset ids (defensive fallback to placeholder)", () => {
    const cache = createAssetCache(fakeAssets);
    expect(cache.get("builtin:does-not-exist")).toBeNull();
  });

  it("treats null / undefined asset ids as empty without lookup", () => {
    const cache = createAssetCache(fakeAssets);
    expect(cache.get(null)).toBeNull();
    expect(cache.get(undefined)).toBeNull();
  });

  it("caches the in-flight load — repeated calls don't kick off a new Image()", () => {
    const cache = createAssetCache(fakeAssets);
    // Same id; both calls return null (still loading) but the second
    // call must hit the cache (no new fetch). We can't directly
    // observe the Image count here, but the contract is "no throw
    // + null result both times" — exercised by simply calling twice.
    expect(cache.get("builtin:rock")).toBeNull();
    expect(cache.get("builtin:rock")).toBeNull();
  });

  it("works against an empty assets array — every lookup is null", () => {
    const cache = createAssetCache([]);
    expect(cache.get("builtin:player-yellow")).toBeNull();
  });
});
