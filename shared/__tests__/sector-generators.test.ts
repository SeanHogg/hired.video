import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SECTORS, type Sector } from "../sectors.js";
import { sectorTemplateRec, sectorTemplateFile } from "../sector-templates.js";
import {
  renderSectorArticle,
  allSectorArticleDrafts,
} from "../sector-article-templates.js";
import {
  renderSectorStoryboard,
  sectorStoryboardFile,
  allGeneratedStoryboards,
} from "../sector-storyboard-templates.js";

const THEME_IDS = new Set(["pivot-led", "professional", "hook-led", "story-led", "minimal"]);

function assertNoLeakage(s: string, ctx: string) {
  assert.ok(!s.includes("{{"), `${ctx}: contains {{ placeholder`);
  assert.ok(!s.includes("undefined"), `${ctx}: contains literal "undefined"`);
  assert.ok(!s.includes("null,"), `${ctx}: contains literal null token`);
}

// ── sector-templates.ts ────────────────────────────────────────────────
describe("sectorTemplateRec", () => {
  it("returns a complete, well-formed rec for every sector", () => {
    for (const slug of SECTORS) {
      const rec = sectorTemplateRec(slug);
      assert.ok(THEME_IDS.has(rec.primaryThemeId), `${slug} bad primaryThemeId`);
      assert.ok(rec.displayName.trim().length > 0, `${slug} empty displayName`);
      assert.ok(rec.rationale.trim().length > 0, `${slug} empty rationale`);
      assert.ok(Array.isArray(rec.alternates), `${slug} alternates not array`);
      for (const alt of rec.alternates) {
        assert.ok(THEME_IDS.has(alt.themeId), `${slug} bad alternate themeId ${alt.themeId}`);
        assert.ok(alt.when.trim().length > 0, `${slug} empty alternate.when`);
      }
      assertNoLeakage(rec.displayName + rec.rationale, `${slug} rec`);
    }
  });

  it("sectorTemplateFile resolves a unique, slug-format filename per sector", () => {
    const files = SECTORS.map((s) => sectorTemplateFile(s));
    for (const f of files) {
      assert.match(f, /^[a-z0-9-]+$/, `bad filename slug: ${f}`);
    }
    assert.equal(new Set(files).size, files.length, "duplicate storyboard filename");
  });

  it("sectorTemplateFile delegates to sectorStoryboardFile (single source)", () => {
    for (const s of SECTORS) {
      assert.equal(sectorTemplateFile(s), sectorStoryboardFile(s));
    }
  });
});

// ── sector-article-templates.ts ────────────────────────────────────────
describe("renderSectorArticle", () => {
  it("emits a well-formed draft for a recruitable sector × all 4 audiences", () => {
    const audiences = ["job_seeker", "recruiter", "pivot", "resume_guide"] as const;
    for (const audience of audiences) {
      const d = renderSectorArticle("healthcare", audience);
      assert.ok(d, `healthcare/${audience} returned null`);
      assert.equal(d!.sector, "healthcare");
      assert.equal(d!.audience, audience);
      assert.ok(d!.title.trim().length > 0, `${audience} empty title`);
      assert.ok(d!.summary.trim().length > 0, `${audience} empty summary`);
      assert.ok(d!.summary.length <= 280, `${audience} summary exceeds 280 chars`);
      assert.ok(d!.bodyMd.trim().length > 0, `${audience} empty body`);
      assert.ok(d!.bodyMd.startsWith("# "), `${audience} body has no H1`);
      assert.ok(Array.isArray(d!.tags) && d!.tags.length > 0, `${audience} no tags`);
      assert.ok(d!.tags.includes("healthcare"), `${audience} missing sector tag`);
      assertNoLeakage(d!.bodyMd, `healthcare/${audience} body`);
    }
  });

  it("returns null for tech/pivot (tech is the 'from' side)", () => {
    assert.equal(renderSectorArticle("tech", "pivot"), null);
    // tech still has the other three
    assert.ok(renderSectorArticle("tech", "job_seeker"));
  });

  it("politics_civic only yields the civic article", () => {
    assert.ok(renderSectorArticle("politics_civic", "civic"));
    assert.equal(renderSectorArticle("politics_civic", "job_seeker"), null);
    assert.equal(renderSectorArticle("politics_civic", "recruiter"), null);
    assert.equal(renderSectorArticle("politics_civic", "pivot"), null);
  });

  it("civic audience only valid for politics_civic", () => {
    assert.equal(renderSectorArticle("healthcare", "civic"), null);
  });

  it("is deterministic (same input → identical body)", () => {
    const a = renderSectorArticle("skilled_trades", "pivot");
    const b = renderSectorArticle("skilled_trades", "pivot");
    assert.deepEqual(a, b);
  });

  it("non-licensed sector renders the no-license branch without placeholder gaps", () => {
    const d = renderSectorArticle("gig_work", "job_seeker");
    assert.ok(d);
    assert.ok(d!.bodyMd.includes("do not require formal licensure"));
    assertNoLeakage(d!.bodyMd, "gig_work/job_seeker");
  });
});

describe("allSectorArticleDrafts", () => {
  it("produces unique sector×audience drafts with non-empty bodies", () => {
    const drafts = allSectorArticleDrafts();
    assert.ok(drafts.length > 0);
    const keys = drafts.map((d) => `${d.sector}/${d.audience}`);
    assert.equal(new Set(keys).size, keys.length, "duplicate sector/audience draft");
    for (const d of drafts) {
      assert.ok(d.bodyMd.trim().length > 0, `${d.sector}/${d.audience} empty body`);
      assertNoLeakage(d.bodyMd, `${d.sector}/${d.audience}`);
    }
  });

  it("includes exactly one civic draft and no tech/pivot draft", () => {
    const drafts = allSectorArticleDrafts();
    assert.equal(drafts.filter((d) => d.audience === "civic").length, 1);
    assert.equal(drafts.filter((d) => d.sector === "tech" && d.audience === "pivot").length, 0);
  });
});

// ── sector-storyboard-templates.ts ─────────────────────────────────────
describe("renderSectorStoryboard", () => {
  const SCENE_TYPES = ["intro", "achievement", "achievement", "skills", "closing"];

  it("emits a structurally valid storyboard for every sector", () => {
    for (const slug of SECTORS) {
      const sb = renderSectorStoryboard(slug);
      assert.equal(sb.video.fps, 30);
      assert.equal(sb.video.duration, 60);
      assert.ok(["720p", "1080p"].includes(sb.video.resolution));
      assert.equal(sb.video.theme.colorPalette.length, 4, `${slug} palette must have 4 colors`);
      for (const c of sb.video.theme.colorPalette) {
        assert.ok(/^(#[0-9a-fA-F]{6}|rgba?\()/.test(c) || c.length > 0, `${slug} bad color ${c}`);
      }

      assert.equal(sb.scenes.length, 5, `${slug} expected 5 scenes`);
      assert.deepEqual(sb.scenes.map((s) => s.type), SCENE_TYPES, `${slug} scene type order`);

      // scene ids unique, non-empty
      const ids = sb.scenes.map((s) => s.id);
      assert.equal(new Set(ids).size, ids.length, `${slug} duplicate scene id`);

      // contiguous, non-overlapping timeline that fills the duration
      let cursor = 0;
      for (const sc of sb.scenes) {
        assert.equal(sc.start, cursor, `${slug} scene ${sc.id} start gap`);
        assert.ok(sc.duration > 0, `${slug} scene ${sc.id} non-positive duration`);
        assert.ok(sc.title.trim().length > 0, `${slug} scene ${sc.id} empty title`);
        cursor += sc.duration;
      }
      assert.equal(cursor, sb.video.duration, `${slug} scenes don't fill duration`);

      // achievement/skills scenes carry non-empty item arrays
      for (const sc of sb.scenes) {
        if (sc.type === "achievement") {
          assert.ok(sc.items.length > 0, `${slug} achievement no items`);
          assert.ok(sc.items.every((i) => i.trim().length > 0), `${slug} blank achievement item`);
        }
        if (sc.type === "skills") {
          assert.ok(sc.skills.length > 0, `${slug} skills no entries`);
        }
      }
      assertNoLeakage(JSON.stringify(sb.scenes), `${slug} storyboard`);
    }
  });

  it("is deterministic", () => {
    assert.deepEqual(renderSectorStoryboard("legal"), renderSectorStoryboard("legal"));
  });
});

describe("allGeneratedStoryboards", () => {
  it("emits unique filenames and excludes tech", () => {
    const gen = allGeneratedStoryboards();
    assert.ok(gen.length > 0);
    assert.ok(!gen.some((g) => g.sector === "tech"), "tech should reuse the professional template");
    const names = gen.map((g) => g.filename);
    assert.equal(new Set(names).size, names.length, "duplicate generated filename");
    for (const g of gen) {
      assert.match(g.filename, /^[a-z0-9-]+$/);
      assert.equal(g.filename, sectorStoryboardFile(g.sector));
    }
  });

  it("includes politics_civic (candidate-intro is a real surface)", () => {
    const gen = allGeneratedStoryboards();
    assert.ok(gen.some((g) => g.sector === "politics_civic"));
  });
});
