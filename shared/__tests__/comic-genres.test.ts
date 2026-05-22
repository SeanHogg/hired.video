/**
 * Comic genre catalog tests.
 *
 * The catalog is the single source of truth read by:
 *   - the AI scaffolder (system prompt + stock asset picks)
 *   - the frontend intake form (genre picker)
 *   - the template-seed builder (placeholder canvas content)
 *   - the SVG asset generator script (file output)
 *
 * If any of these drift on the schema (e.g. a genre missing a palette
 * field, an asset path that doesn't exist), these tests fail before
 * the runtime does. Run via the shared test runner (`pnpm -F shared test`).
 *
 * Test framework: node:test (matches the repo's API + shared test setup
 * per `package.json` `test` script).
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  COMIC_GENRES,
  COMIC_GENRE_IDS,
  DEFAULT_NARRATIVE_SHAPE,
  getComicGenre,
  getNarrativeShape,
  pickStockAsset,
} from "../comic-genres.js";

describe("comic-genres catalog", () => {
  it("ships at least 12 genres (the user requirement from #938 intake)", () => {
    assert.ok(
      COMIC_GENRES.length >= 12,
      `expected ≥12 genres, got ${COMIC_GENRES.length}`,
    );
  });

  it("COMIC_GENRES order matches COMIC_GENRE_IDS order — both are picker SoT", () => {
    assert.deepEqual(
      COMIC_GENRES.map((g) => g.id),
      [...COMIC_GENRE_IDS],
    );
  });

  it("every genre carries a complete 5-role palette", () => {
    for (const g of COMIC_GENRES) {
      for (const role of ["paper", "ink", "primary", "secondary", "accent"] as const) {
        const colour = g.palette[role];
        assert.equal(
          typeof colour,
          "string",
          `${g.id}.palette.${role} not a string`,
        );
        assert.match(
          colour,
          /^#[0-9a-fA-F]{3,8}$/,
          `${g.id}.palette.${role} not a hex colour: ${colour}`,
        );
      }
    }
  });

  it("every genre declares ≥1 background + ≥1 character + ≥1 prop", () => {
    // The scaffolder + the seed both call pickStockAsset() against each
    // category and degrade silently on empty arrays — but a genre with
    // zero stock art is almost certainly a typo, not a deliberate
    // omission. SFX is excluded from this check: quiet genres
    // (slice-of-life, webtoon) intentionally ship 0 SFX.
    for (const g of COMIC_GENRES) {
      assert.ok(g.stockAssets.backgrounds.length >= 1, `${g.id} no backgrounds`);
      assert.ok(g.stockAssets.characters.length >= 1, `${g.id} no characters`);
      assert.ok(g.stockAssets.props.length >= 1, `${g.id} no props`);
    }
  });

  it("every stock asset path points under /comics/<genreId>/", () => {
    // The SVG generator script (`scripts/generate-comic-svgs.mjs`)
    // emits files into `frontend/public/comics/<genreId>/`. If a path
    // drifts off this prefix the editor + the reader render broken
    // images at runtime.
    for (const g of COMIC_GENRES) {
      const all = [
        ...g.stockAssets.backgrounds,
        ...g.stockAssets.characters,
        ...g.stockAssets.props,
        ...g.stockAssets.sfx,
      ];
      for (const asset of all) {
        assert.ok(
          asset.path.startsWith(`/comics/${g.id}/`),
          `${g.id}.${asset.id} path "${asset.path}" outside genre dir`,
        );
        assert.ok(
          asset.path.endsWith(".svg"),
          `${g.id}.${asset.id} path "${asset.path}" not an SVG`,
        );
      }
    }
  });

  it("every genre declares ≥1 tone descriptor (drives LLM system prompt)", () => {
    for (const g of COMIC_GENRES) {
      assert.ok(
        g.tone.length >= 1,
        `${g.id} has no tone descriptors`,
      );
    }
  });
});

describe("DEFAULT_NARRATIVE_SHAPE", () => {
  it("ships exactly 6 pages with stable beat ids", () => {
    assert.equal(DEFAULT_NARRATIVE_SHAPE.length, 6);
    assert.deepEqual(
      DEFAULT_NARRATIVE_SHAPE.map((b) => b.beatId),
      ["hook", "setup", "rising-action", "midpoint", "climax", "resolution"],
    );
  });

  it("page numbers are 1..6 in order", () => {
    DEFAULT_NARRATIVE_SHAPE.forEach((b, i) => {
      assert.equal(b.pageNumber, i + 1);
    });
  });
});

describe("getComicGenre()", () => {
  it("returns the matching genre by id", () => {
    assert.equal(getComicGenre("noir").id, "noir");
  });

  it("falls back to hero for unknown ids (never throws)", () => {
    // Critical: render paths call this with persisted strings that may
    // be from an older catalog. Must not throw — must return a usable
    // default.
    assert.equal(getComicGenre("not-a-real-genre").id, "hero");
    assert.equal(getComicGenre(undefined).id, "hero");
  });
});

describe("getNarrativeShape()", () => {
  it("returns the default shape verbatim when a genre overrides nothing", () => {
    // Slice-of-life keeps the default arc — no per-beat overrides.
    const shape = getNarrativeShape(getComicGenre("slice"));
    assert.equal(shape.length, 6);
    assert.equal(shape[0].brief, DEFAULT_NARRATIVE_SHAPE[0].brief);
  });

  it("merges per-beat overrides while preserving beat order + count", () => {
    const noir = getComicGenre("noir");
    // Noir's narrativeShape overrides the "hook" beat's brief.
    const shape = getNarrativeShape(noir);
    assert.equal(shape.length, 6);
    assert.equal(shape[0].beatId, "hook");
    assert.equal(shape[0].label, "Hook"); // label preserved
    assert.notEqual(shape[0].brief, DEFAULT_NARRATIVE_SHAPE[0].brief); // brief replaced
    // Non-overridden beats keep their default brief.
    assert.equal(shape[1].brief, DEFAULT_NARRATIVE_SHAPE[1].brief);
  });
});

describe("pickStockAsset()", () => {
  const hero = getComicGenre("hero");

  it("returns the asset at index % length", () => {
    const a0 = pickStockAsset(hero.stockAssets.backgrounds, 0);
    const aWrapped = pickStockAsset(hero.stockAssets.backgrounds, hero.stockAssets.backgrounds.length);
    assert.equal(a0?.id, aWrapped?.id);
  });

  it("handles negative indices via positive modulo (no NaN, no crash)", () => {
    const a = pickStockAsset(hero.stockAssets.backgrounds, -1);
    assert.ok(a, "negative index returned null");
  });

  it("returns null on an empty category (slice-of-life has no SFX)", () => {
    const slice = getComicGenre("slice");
    assert.equal(slice.stockAssets.sfx.length, 0);
    assert.equal(pickStockAsset(slice.stockAssets.sfx, 0), null);
  });
});
