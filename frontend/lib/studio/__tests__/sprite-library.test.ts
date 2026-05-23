/**
 * Built-in sprite library tests — pins the catalog shape so the
 * editor's SpritePalette + the GamePropertiesPanel sprite picker +
 * the seed templates never silently drift from each other.
 *
 *   - Every entry has a stable `builtin:` id namespace so the runtime
 *     can never confuse a built-in for a user-uploaded R2 asset.
 *   - Every entry encodes a parseable `data:image/svg+xml;…` URL so
 *     the `<img src>` in the palette + the `Image()` load in the
 *     runtime don't 404.
 *   - Every seed template's referenced builtin id resolves — a
 *     rename in the library would otherwise quietly land game
 *     projects on broken images.
 *
 * Run: vitest run lib/studio/__tests__/sprite-library.test.ts
 */

import { describe, it, expect } from "vitest";
import {
  BUILTIN_SPRITES,
  pickBuiltinSprite,
  spriteToAsset,
} from "@/lib/studio/game/sprite-library";
import { SEED_REFERENCED_BUILTINS } from "@/lib/studio/game/game-seeds";
import { assignSpriteAsset } from "@/lib/studio/game/game-state-edit";
import { emptyGameState } from "@shared/game-state";

describe("BUILTIN_SPRITES catalog", () => {
  it("ships a non-trivial number of sprites (≥10) so the palette feels populated", () => {
    expect(BUILTIN_SPRITES.length).toBeGreaterThanOrEqual(10);
  });

  it("uses the `builtin:` id namespace on every entry — namespace-safe lookup", () => {
    for (const s of BUILTIN_SPRITES) {
      expect(s.id.startsWith("builtin:")).toBe(true);
    }
  });

  it("has no duplicate ids — the picker uses id as a React key", () => {
    const ids = BUILTIN_SPRITES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("encodes every URL as a valid SVG data URI", () => {
    // The Image() loader in the runtime accepts data: URIs directly;
    // an http(s) URL or a malformed string would silently 404 on
    // load and leave the placeholder in place. Pin the SVG prefix.
    for (const s of BUILTIN_SPRITES) {
      expect(s.url.startsWith("data:image/svg+xml")).toBe(true);
      expect(s.url.length).toBeGreaterThan(50);
    }
  });

  it("ships positive width + height — the runtime divides by these for scaling", () => {
    for (const s of BUILTIN_SPRITES) {
      expect(s.width).toBeGreaterThan(0);
      expect(s.height).toBeGreaterThan(0);
    }
  });
});

describe("pickBuiltinSprite", () => {
  it("returns the entry for a known id", () => {
    const first = BUILTIN_SPRITES[0];
    expect(pickBuiltinSprite(first.id)).toBe(first);
  });

  it("returns null for an unknown id so callers can fall back defensively", () => {
    expect(pickBuiltinSprite("builtin:does-not-exist")).toBeNull();
  });
});

describe("spriteToAsset", () => {
  it("projects a BuiltinSprite onto the GameAsset shape the runtime reads", () => {
    const sprite = BUILTIN_SPRITES[0];
    const asset = spriteToAsset(sprite);
    expect(asset.id).toBe(sprite.id);
    expect(asset.kind).toBe("sprite");
    expect(asset.url).toBe(sprite.url);
  });
});

describe("assignSpriteAsset", () => {
  it("copies the chosen built-in into state.assets idempotently", () => {
    let state = emptyGameState({ width: 1280, height: 720, fps: 60 });
    // Add a sprite to the level so we have something to assign to.
    state = {
      ...state,
      levels: state.levels.map((l, i) =>
        i === 0
          ? {
              ...l,
              sprites: [
                {
                  id: "player",
                  assetId: "placeholder:player",
                  x: 0,
                  y: 0,
                  width: 32,
                  height: 32,
                  behavior: "platformer-player",
                  params: {},
                },
              ],
            }
          : l,
      ),
    };
    const yellow = pickBuiltinSprite("builtin:player-yellow")!;
    const once = assignSpriteAsset(state, "level-1", "player", yellow);
    expect(once.assets.find((a) => a.id === yellow.id)).toBeDefined();
    expect(once.assets).toHaveLength(1);

    // Assigning the same built-in twice doesn't duplicate the asset.
    const twice = assignSpriteAsset(once, "level-1", "player", yellow);
    expect(twice.assets).toHaveLength(1);
  });

  it("adopts the built-in's recommended width + height + assetId", () => {
    let state = emptyGameState();
    state = {
      ...state,
      levels: [
        {
          id: "level-1",
          label: "L1",
          backgroundColor: "#000",
          sprites: [
            {
              id: "s",
              assetId: "placeholder:foo",
              x: 0, y: 0, width: 10, height: 10,
              behavior: null,
              params: {},
            },
          ],
        },
      ],
      startLevelId: "level-1",
    };
    const card = pickBuiltinSprite("builtin:card-back")!;
    const next = assignSpriteAsset(state, "level-1", "s", card);
    const sprite = next.levels[0].sprites[0];
    expect(sprite.assetId).toBe("builtin:card-back");
    expect(sprite.width).toBe(card.width);
    expect(sprite.height).toBe(card.height);
  });
});

describe("seed → library cross-reference", () => {
  it("every SEED_REFERENCED_BUILTINS id resolves in BUILTIN_SPRITES", () => {
    // A rename in `sprite-library.ts` that forgets the seeds would
    // otherwise have new projects open with broken images. Pin the
    // reference set.
    for (const id of SEED_REFERENCED_BUILTINS) {
      expect(pickBuiltinSprite(id), `seed references missing builtin ${id}`).not.toBeNull();
    }
  });
});
