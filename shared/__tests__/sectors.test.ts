import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SECTORS,
  sectorMeta,
  allSectors,
  recruitableSectors,
  pivotTargetSectors,
  isValidSector,
  classifyJobSector,
  applySpecialtyBonus,
  SECTOR_SPECIALTY_BONUS,
  ARTICLE_AUDIENCES,
  ARTICLE_AUDIENCE_LABELS,
  type Sector,
} from "../sectors.js";

/**
 * #1964 — taxonomy integrity + pure-function behavior for the sector SSoT.
 */

describe("SECTORS taxonomy integrity", () => {
  it("has no duplicate slugs", () => {
    assert.equal(new Set(SECTORS).size, SECTORS.length);
  });

  it("every sector has a complete, well-formed metadata record", () => {
    for (const slug of SECTORS) {
      const m = sectorMeta(slug);
      assert.equal(m.slug, slug, `slug self-reference mismatch for ${slug}`);
      assert.ok(m.label.trim().length > 0, `${slug} label empty`);
      assert.ok(m.tagline.trim().length > 0, `${slug} tagline empty`);
      assert.ok(["high", "medium", "low"].includes(m.aiResilience), `${slug} bad aiResilience`);
      assert.ok(m.aiResilienceNotes.trim().length > 0, `${slug} notes empty`);
      assert.ok(Array.isArray(m.exampleRoles) && m.exampleRoles.length > 0, `${slug} no example roles`);
      assert.ok(m.exampleRoles.every((r) => r.trim().length > 0), `${slug} blank example role`);
      assert.equal(typeof m.requiresLicense, "boolean");
      assert.equal(typeof m.contentOnly, "boolean");
      assert.ok(m.iconKey.trim().length > 0, `${slug} iconKey empty`);
      assert.ok(Array.isArray(m.transferableFromTech));
      // requiresLicense implies licensingNotes present
      if (m.requiresLicense) {
        assert.ok(m.licensingNotes && m.licensingNotes.trim().length > 0, `${slug} licensed but no notes`);
      }
    }
  });

  it("icon keys are unique per sector", () => {
    const keys = allSectors().map((m) => m.iconKey);
    assert.equal(new Set(keys).size, keys.length, "duplicate iconKey across sectors");
  });

  it("has no template-placeholder leakage in metadata strings", () => {
    for (const m of allSectors()) {
      const blob = JSON.stringify(m);
      assert.ok(!blob.includes("{{"), `${m.slug} contains {{ placeholder`);
      assert.ok(!blob.includes("undefined"), `${m.slug} contains literal undefined`);
    }
  });
});

describe("sector accessor helpers", () => {
  it("allSectors returns one record per slug in declared order", () => {
    const all = allSectors();
    assert.equal(all.length, SECTORS.length);
    assert.deepEqual(all.map((m) => m.slug), [...SECTORS]);
  });

  it("recruitableSectors excludes contentOnly sectors", () => {
    const recruitable = recruitableSectors();
    assert.ok(recruitable.every((m) => !m.contentOnly));
    assert.ok(!recruitable.some((m) => m.slug === "politics_civic"));
  });

  it("pivotTargetSectors excludes tech and contentOnly", () => {
    const pivots = pivotTargetSectors();
    assert.ok(!pivots.some((m) => m.slug === "tech"));
    assert.ok(pivots.every((m) => !m.contentOnly));
  });
});

describe("isValidSector", () => {
  it("accepts every declared sector", () => {
    for (const s of SECTORS) assert.ok(isValidSector(s));
  });
  it("rejects unknown / wrong-type values (safe fallback)", () => {
    assert.equal(isValidSector("finance"), false);
    assert.equal(isValidSector(""), false);
    assert.equal(isValidSector(null), false);
    assert.equal(isValidSector(undefined), false);
    assert.equal(isValidSector(42), false);
    assert.equal(isValidSector({ slug: "tech" }), false);
  });
});

describe("classifyJobSector", () => {
  it("classifies a strong title hit", () => {
    assert.equal(classifyJobSector("Registered Nurse (RN)", "ICU"), "healthcare");
    assert.equal(classifyJobSector("Journeyman Electrician", "IBEW Local 3"), "skilled_trades");
    assert.equal(classifyJobSector("Police Officer", "patrol division"), "law_enforcement");
  });

  it("returns null below the confidence threshold (single weak desc hit)", () => {
    // one description-only keyword scores 1 < threshold 2
    assert.equal(classifyJobSector("Generic Role", "we offer a clinic discount"), null);
  });

  it("returns null when nothing matches", () => {
    assert.equal(classifyJobSector("Underwater Basket Weaver", "artisanal reeds"), null);
  });

  it("returns null on empty / null input (boundary)", () => {
    assert.equal(classifyJobSector(null, null), null);
    assert.equal(classifyJobSector("", ""), null);
    assert.equal(classifyJobSector(undefined, undefined), null);
  });

  it("never auto-classifies into the content-only civic sector", () => {
    // politics_civic has no keywords; even civic-ish text should not land there
    const result = classifyJobSector("School Board Member", "city council elected office");
    assert.notEqual(result, "politics_civic");
  });

  it("title weighting (3x) wins over a competing description hit", () => {
    // title => skilled_trades (3), desc mentions nurse (healthcare +1) => trades wins
    assert.equal(classifyJobSector("Welder", "works alongside a nurse on site"), "skilled_trades");
  });
});

describe("applySpecialtyBonus", () => {
  it("adds the flat bonus on a specialty match", () => {
    const r = applySpecialtyBonus({
      baseRate: 0.1,
      tierBonus: 0.05,
      specialtySectors: ["healthcare", "legal"],
      landingSector: "healthcare",
    });
    assert.equal(r.specialtyMatched, true);
    assert.ok(Math.abs(r.effectiveRate - (0.15 + SECTOR_SPECIALTY_BONUS)) < 1e-9);
  });

  it("no bonus when landing sector is not in specialties", () => {
    const r = applySpecialtyBonus({
      baseRate: 0.1,
      tierBonus: 0.05,
      specialtySectors: ["legal"],
      landingSector: "healthcare",
    });
    assert.equal(r.specialtyMatched, false);
    assert.ok(Math.abs(r.effectiveRate - 0.15) < 1e-9);
  });

  it("no bonus when landing sector is null or invalid (boundary/exception)", () => {
    const a = applySpecialtyBonus({ baseRate: 0.1, tierBonus: 0, specialtySectors: ["healthcare"], landingSector: null });
    assert.equal(a.specialtyMatched, false);
    const b = applySpecialtyBonus({ baseRate: 0.1, tierBonus: 0, specialtySectors: ["healthcare"], landingSector: "not_a_sector" });
    assert.equal(b.specialtyMatched, false);
  });
});

describe("article audience vocabulary", () => {
  it("every audience has a label and labels are non-empty", () => {
    for (const a of ARTICLE_AUDIENCES) {
      assert.ok(ARTICLE_AUDIENCE_LABELS[a]?.trim().length > 0, `${a} label missing`);
    }
    assert.equal(Object.keys(ARTICLE_AUDIENCE_LABELS).length, ARTICLE_AUDIENCES.length);
  });
});
