import { describe, it, expect } from "vitest";
import { TEMPLATE_CATALOG } from "@/lib/studio/templates/catalog";
import {
  templatesForAudience,
  relatedTemplatesFor,
} from "../templates-by-audience";

describe("templatesForAudience", () => {
  it("returns every template tagged with the audience, preserving catalog order", () => {
    const podcaster = templatesForAudience("podcaster");
    expect(podcaster.length).toBeGreaterThan(0);
    for (const t of podcaster) {
      expect(t.audiences).toContain("podcaster");
    }
    // Order matches catalog declaration (no in-helper sort).
    const order = TEMPLATE_CATALOG.filter((t) => t.audiences.includes("podcaster")).map((t) => t.id);
    expect(podcaster.map((t) => t.id)).toEqual(order);
  });

  it("returns at least one template for every populated audience (no empty-state landings)", () => {
    // Per audiences.ts: new audiences only land alongside their first
    // template (the "no empty-state landings" invariant). This test
    // protects that invariant — adding an audience without tagging any
    // template fails here loudly.
    const populated = ["athlete", "actor", "director", "musician", "creator", "job_seeker", "recruiter", "employer", "founder", "developer", "designer", "data_analyst", "podcaster", "educator", "voice_actor", "game_dev", "illustrator"] as const;
    for (const a of populated) {
      expect(templatesForAudience(a).length).toBeGreaterThan(0);
    }
  });

  it("game_dev audience surfaces every game-kind template", () => {
    // Derive from the catalog so adding a new game template (e.g.
    // game_3d_world) doesn't require touching a hardcoded list — the
    // contract is "game_dev sees all mediaKind:'game' templates".
    const games = templatesForAudience("game_dev");
    const expectedGameIds = TEMPLATE_CATALOG.filter((t) => t.mediaKind === "game")
      .map((t) => t.id)
      .sort();
    expect(games.map((t) => t.id).sort()).toEqual(expectedGameIds);
    for (const g of games) expect(g.mediaKind).toBe("game");
  });

  it("illustrator audience surfaces every comic + drawing-image template", () => {
    const ids = new Set(templatesForAudience("illustrator").map((t) => t.id));
    // Every comic_* and drawing-style image template should be tagged
    // illustrator. Ad-banner image templates (`ad_*`) intentionally
    // target designer / marketer audiences, NOT illustrator — they're
    // image-kind only because the runtime renders pixels, not because
    // an illustrator's workflow produces them. This is a coverage
    // (subset) check, not exact equality: other kinds — e.g.
    // `interactive_comic` (Comic+) — may ALSO serve illustrators but are
    // audience-tagged per-template (a Comic+ case study targets
    // recruiters, not illustrators), so the illustrator set is a
    // superset of the comic + drawing-image guarantee.
    const mustBeIllustrator = TEMPLATE_CATALOG.filter(
      (t) => t.mediaKind === "comic" || (t.mediaKind === "image" && !t.id.startsWith("ad_")),
    );
    for (const t of mustBeIllustrator) expect(ids.has(t.id)).toBe(true);
  });
});

describe("relatedTemplatesFor", () => {
  it("excludes the source template from its own related list", () => {
    const source = TEMPLATE_CATALOG.find((t) => t.id === "sizzle_reel");
    if (!source) throw new Error("sizzle_reel missing from catalog");
    const related = relatedTemplatesFor(source, 10);
    expect(related.find((t) => t.id === source.id)).toBeUndefined();
  });

  it("only returns templates that share at least one audience with the source", () => {
    const source = TEMPLATE_CATALOG.find((t) => t.id === "podcast_episode");
    if (!source) throw new Error("podcast_episode missing from catalog");
    const related = relatedTemplatesFor(source, 50);
    for (const r of related) {
      const overlap = r.audiences.some((a) => source.audiences.includes(a));
      expect(overlap).toBe(true);
    }
  });

  it("respects the limit argument", () => {
    const source = TEMPLATE_CATALOG.find((t) => t.id === "profile");
    if (!source) throw new Error("profile missing from catalog");
    expect(relatedTemplatesFor(source, 3).length).toBeLessThanOrEqual(3);
    expect(relatedTemplatesFor(source, 0).length).toBe(0);
  });
});
