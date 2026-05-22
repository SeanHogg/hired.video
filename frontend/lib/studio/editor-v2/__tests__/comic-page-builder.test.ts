/**
 * Comic page builder unit tests.
 *
 * `buildComicPage()` is the single assembler shared by the static
 * template seed path (`template-seeds.ts`) and the AI-generated spec
 * path (`comic-spec-to-canvas.ts`). Per the DRY rule the visual
 * structure of a comic page is decided in exactly one place — these
 * tests pin that contract so neither caller can drift.
 *
 * Run: vitest run lib/studio/editor-v2/__tests__/comic-page-builder.test.ts
 */

import { describe, it, expect } from "vitest";
import {
  buildComicPage,
  type ComicPageContent,
} from "@/lib/studio/editor-v2/comic-page-builder";
import { comicSpecToCanvas } from "@/lib/studio/editor-v2/comic-spec-to-canvas";
import {
  COMIC_DEFAULT_LAYOUT,
  type ComicSpec,
} from "@shared/comic-spec";
import { getComicGenre } from "@shared/comic-genres";

const HERO_PALETTE = getComicGenre("hero").palette;

function content(over: Partial<ComicPageContent> = {}): ComicPageContent {
  return {
    label: "Hook",
    caption: "HOOK",
    protagonistLine: "I take the call.",
    protagonistMode: "speech",
    otherLine: "",
    sfx: "",
    backgroundUrl: null,
    characterUrl: null,
    propUrl: null,
    ...over,
  };
}

describe("buildComicPage()", () => {
  it("stamps the genre's paper colour as the scene background", () => {
    const scene = buildComicPage(content(), HERO_PALETTE, COMIC_DEFAULT_LAYOUT);
    expect(scene.backgroundColor).toBe(HERO_PALETTE.paper);
  });

  it("defaults to 4 seconds dwell unless content overrides", () => {
    expect(buildComicPage(content(), HERO_PALETTE, COMIC_DEFAULT_LAYOUT).durationSeconds).toBe(4);
    expect(
      buildComicPage(content({ durationSeconds: 7 }), HERO_PALETTE, COMIC_DEFAULT_LAYOUT)
        .durationSeconds,
    ).toBe(7);
  });

  it("emits exactly the widgets the content needs — no empty slots", () => {
    // Minimum page: panel frame + caption + bubble. No bg/character/prop/sfx
    // means those slots stay unfilled — the assembler doesn't synthesise
    // empty `image` widgets.
    const scene = buildComicPage(content(), HERO_PALETTE, COMIC_DEFAULT_LAYOUT);
    const kinds = scene.widgets.map((w) => w.kind).sort();
    expect(kinds).toEqual(["caption-box", "shape-rect", "speech-bubble"].sort());
  });

  it("emits a background image widget when content.backgroundUrl is set", () => {
    const scene = buildComicPage(
      content({ backgroundUrl: "/comics/hero/bg-skyline.svg" }),
      HERO_PALETTE,
      COMIC_DEFAULT_LAYOUT,
    );
    const bg = scene.widgets.find((w) => w.kind === "image");
    expect(bg).toBeTruthy();
    if (!bg || bg.params.kind !== "image") throw new Error("image kind narrow");
    expect(bg.params.data.source).toEqual({ kind: "url", url: "/comics/hero/bg-skyline.svg" });
    // Background sits at z=0 — behind every other widget on the page.
    expect(bg.position.z).toBe(0);
    // Background uses `cover` so a landscape SVG paints corner-to-corner
    // without letterbox bars.
    expect(bg.params.data.fit).toBe("cover");
  });

  it("uses fit=contain for foreground slots (character + prop) so silhouettes don't crop", () => {
    // Regression guard for the user-reported "graphics don't render
    // correctly" bug — character/prop SVGs were inheriting the
    // background's `cover` default and getting cropped to the slot's
    // aspect ratio (cape silhouettes lost their cape, compass needles
    // lost their tip, etc.). Per-slot fit policy lives in
    // `buildComicPage` — these assertions lock it.
    const scene = buildComicPage(
      content({
        backgroundUrl: "/comics/hero/bg-skyline.svg",
        characterUrl: "/comics/hero/char-cape.svg",
        propUrl: "/comics/hero/prop-explosion.svg",
      }),
      HERO_PALETTE,
      COMIC_DEFAULT_LAYOUT,
    );
    const images = scene.widgets.filter((w) => w.kind === "image");
    expect(images).toHaveLength(3);
    // Background → cover (full-bleed panel).
    const bg = images.find((w) => w.position.z === 0);
    if (!bg || bg.params.kind !== "image") throw new Error("bg missing");
    expect(bg.params.data.fit).toBe("cover");
    // Character + prop → contain (silhouettes preserved).
    const foreground = images.filter((w) => w.position.z === 3);
    expect(foreground).toHaveLength(2);
    for (const w of foreground) {
      if (w.params.kind !== "image") throw new Error("image kind narrow");
      expect(w.params.data.fit).toBe("contain");
    }
  });

  it("emits a thought-bubble when protagonistMode is 'thought'", () => {
    const scene = buildComicPage(
      content({ protagonistMode: "thought", protagonistLine: "Was that real?" }),
      HERO_PALETTE,
      COMIC_DEFAULT_LAYOUT,
    );
    const bubble = scene.widgets.find((w) => w.kind === "speech-bubble");
    if (!bubble || bubble.params.kind !== "speech-bubble") throw new Error("bubble missing");
    expect(bubble.params.data.shape).toBe("thought");
  });

  it("emits a second speech-bubble when otherLine is provided", () => {
    const scene = buildComicPage(
      content({ otherLine: "And then?" }),
      HERO_PALETTE,
      COMIC_DEFAULT_LAYOUT,
    );
    const bubbles = scene.widgets.filter((w) => w.kind === "speech-bubble");
    expect(bubbles).toHaveLength(2);
  });

  it("emits an SFX burst when content.sfx is provided", () => {
    const scene = buildComicPage(
      content({ sfx: "BAM!" }),
      HERO_PALETTE,
      COMIC_DEFAULT_LAYOUT,
    );
    const sfx = scene.widgets.find((w) => w.kind === "sfx-burst");
    if (!sfx || sfx.params.kind !== "sfx-burst") throw new Error("sfx missing");
    expect(sfx.params.data.text).toBe("BAM!");
  });

  it("stamps palette.ink onto every panel-frame stroke + bubble stroke + caption stroke", () => {
    // Single SoT for ink colour at the page level — caller doesn't
    // have to thread it. Mismatches here would mean a page rendered
    // with non-uniform black-line weight.
    const scene = buildComicPage(content({ sfx: "POW!" }), HERO_PALETTE, COMIC_DEFAULT_LAYOUT);
    for (const w of scene.widgets) {
      switch (w.params.kind) {
        case "shape-rect":
          expect(w.params.data.strokeColor).toBe(HERO_PALETTE.ink);
          break;
        case "speech-bubble":
        case "caption-box":
        case "sfx-burst":
          expect(w.params.data.strokeColor).toBe(HERO_PALETTE.ink);
          break;
      }
    }
  });
});

describe("comicSpecToCanvas()", () => {
  function spec(over: Partial<ComicSpec> = {}): ComicSpec {
    return {
      genreId: "hero",
      title: "Test pitch",
      palette: HERO_PALETTE,
      layout: COMIC_DEFAULT_LAYOUT,
      pages: [
        {
          pageNumber: 1,
          label: "Hook",
          caption: "DOWNTOWN",
          protagonistLine: "I take the case.",
          protagonistMode: "speech",
          otherLine: "",
          otherLabel: "",
          sfx: "",
          visualBrief: "",
          assets: {
            backgroundUrl: "/comics/hero/bg-skyline.svg",
            characterUrl: "/comics/hero/char-cape.svg",
            propUrl: "/comics/hero/prop-explosion.svg",
            sfxUrl: null,
          },
        },
      ],
      ...over,
    };
  }

  it("produces a portrait canvas (1080×1920) for vertical-scroll comics", () => {
    const canvas = comicSpecToCanvas(spec());
    expect(canvas.width).toBe(1080);
    expect(canvas.height).toBe(1920);
  });

  it("emits one scene per spec.pages entry", () => {
    const sixPages = spec({
      pages: Array.from({ length: 6 }, (_, i) => ({
        pageNumber: i + 1,
        label: `Page ${i + 1}`,
        caption: "",
        protagonistLine: "...",
        protagonistMode: "speech" as const,
        otherLine: "",
        otherLabel: "",
        sfx: "",
        visualBrief: "",
        assets: { backgroundUrl: null, characterUrl: null, propUrl: null, sfxUrl: null },
      })),
    });
    const canvas = comicSpecToCanvas(sixPages);
    expect(canvas.scenes).toHaveLength(6);
  });

  it("falls back to label.toUpperCase() when page.caption is empty", () => {
    // Matches the existing behavior in comic-spec-to-canvas's adapter:
    // empty caption uses the beat label as the narration ribbon so the
    // page never reads as blank.
    const s = spec();
    s.pages[0].caption = "";
    s.pages[0].label = "Climax";
    const canvas = comicSpecToCanvas(s);
    const captionWidget = canvas.scenes[0].widgets.find((w) => w.kind === "caption-box");
    if (!captionWidget || captionWidget.params.kind !== "caption-box") throw new Error("caption missing");
    expect(captionWidget.params.data.text).toBe("CLIMAX");
  });

  it("suppresses the prop slot when sfx is present (avoids visual collision)", () => {
    const s = spec();
    s.pages[0].sfx = "POW!";
    s.pages[0].assets.sfxUrl = "/comics/hero/sfx-star.svg";
    const canvas = comicSpecToCanvas(s);
    // Two image widgets (background + character) — not three. The
    // prop URL was dropped because the page has an SFX burst.
    const imageCount = canvas.scenes[0].widgets.filter((w) => w.kind === "image").length;
    expect(imageCount).toBe(2);
    // SFX burst widget IS emitted.
    expect(canvas.scenes[0].widgets.find((w) => w.kind === "sfx-burst")).toBeTruthy();
  });
});
