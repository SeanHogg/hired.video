/**
 * Vendor Sync — connector registry + per-vendor rendering unit tests.
 *
 * Covers:
 *   • applyTuning  — section label rename + char-cap truncation +
 *                    autofill selector attachment
 *   • Registry     — listConnectors returns every vendor, getConnector
 *                    by id, per-vendor capability flags match the
 *                    documented surface
 *   • Default      — renderDefaultBlocks shape (Headline, About,
 *                    Experience per work entry, Education per ed entry,
 *                    Skills flat)
 *   • LinkedIn     — per-skill blocks, char limits, autofill selectors
 *   • GitHub       — Bio block + Profile README markdown block + per-block
 *                    openTargetUrl
 *
 * Run: node --import tsx --test src/services/sync/__tests__/connectors.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { listConnectors, getConnector } from "../connectors/index.js";
import { renderDefaultBlocks } from "../connectors/default-blocks.js";
import type { ResumeContent } from "../../../../../shared/resume.js";

const SAMPLE_RESUME: ResumeContent = {
  basics: {
    name: "Ada Lovelace",
    label: "Senior Analytical Engineer",
    summary:
      "Twenty years building computing systems from first principles. Comfortable with both Babbage engines and modern stacks.",
    location: { city: "London", region: "England", countryCode: "GB" },
  },
  work: [
    {
      name: "Babbage & Co",
      position: "Lead Analyst",
      startDate: "1843",
      endDate: "1852",
      summary: "Designed the first published algorithm intended for a machine.",
      highlights: ["Authored Notes on the Analytical Engine", "Coined the term 'analyst'"],
    },
  ],
  education: [
    {
      institution: "Mathematical Tutor",
      area: "Mathematics",
      studyType: "Private",
      startDate: "1830",
      endDate: "1840",
      courses: [],
    },
  ],
  skills: [
    { name: "Algorithm design", keywords: [] },
    { name: "Symbolic mathematics", keywords: [] },
    { name: "Technical writing", keywords: [] },
  ],
} as unknown as ResumeContent;

// ── Registry ──────────────────────────────────────────────────────────────

describe("vendor sync connector registry", () => {
  const ids = listConnectors().map((c) => c.id).sort();

  it("ships exactly the documented 9 vendors", () => {
    assert.deepStrictEqual(ids, [
      "dice",
      "github",
      "glassdoor",
      "indeed",
      "linkedin",
      "monster",
      "personal-site",
      "wellfound",
      "ziprecruiter",
    ]);
  });

  it("getConnector returns null for unknown ids", () => {
    assert.strictEqual(getConnector("not-a-vendor"), null);
  });

  it("getConnector returns a non-null entry for every listed id", () => {
    for (const id of ids) assert.ok(getConnector(id), `missing connector ${id}`);
  });

  it("every vendor declares a label, iconKey, category, editProfileUrl, and the two extension capability flags", () => {
    for (const c of listConnectors()) {
      assert.ok(c.label, `${c.id} missing label`);
      assert.ok(c.iconKey, `${c.id} missing iconKey`);
      assert.ok(c.category, `${c.id} missing category`);
      assert.strictEqual(typeof c.editProfileUrl, "string", `${c.id} editProfileUrl shape`);
      assert.strictEqual(typeof c.supportsExtensionExtract, "boolean", `${c.id} extract flag`);
      assert.strictEqual(typeof c.supportsExtensionWrite, "boolean", `${c.id} write flag`);
    }
  });

  it("extract is enabled on every vendor except personal-site", () => {
    for (const c of listConnectors()) {
      if (c.id === "personal-site") {
        assert.strictEqual(c.supportsExtensionExtract, false, "personal-site is paste-only");
      } else {
        assert.strictEqual(c.supportsExtensionExtract, true, `${c.id} should support extract`);
      }
    }
  });

  it("write is enabled on every vendor except github + personal-site (out-of-DOM destinations)", () => {
    const writeable = new Set(["linkedin", "indeed", "glassdoor", "ziprecruiter", "monster", "wellfound", "dice"]);
    for (const c of listConnectors()) {
      const expected = writeable.has(c.id);
      assert.strictEqual(c.supportsExtensionWrite, expected, `${c.id} write flag mismatch`);
    }
  });
});

// ── Default block renderer + tuning ───────────────────────────────────────

describe("default block renderer + VendorTuning", () => {
  it("emits Headline, About, one Experience per work, one Education per ed, and one Skills block", () => {
    const blocks = renderDefaultBlocks(SAMPLE_RESUME);
    const sections = blocks.map((b) => b.section);
    assert.ok(sections.includes("Headline"));
    assert.ok(sections.includes("About"));
    assert.strictEqual(sections.filter((s) => s === "Experience").length, 1);
    assert.strictEqual(sections.filter((s) => s === "Education").length, 1);
    assert.strictEqual(sections.filter((s) => s === "Skills").length, 1);
  });

  it("Indeed renames About → Summary via tuning", () => {
    const indeed = getConnector("indeed")!;
    const sections = indeed.renderExportBlocks(SAMPLE_RESUME).map((b) => b.section);
    assert.ok(sections.includes("Summary"), "Indeed should expose a Summary block");
    assert.ok(!sections.includes("About"), "Indeed should NOT expose About");
  });

  it("Monster renames About → Highlights AND caps to 500 chars", () => {
    const longSummary = "x".repeat(800);
    const resume = { ...SAMPLE_RESUME, basics: { ...SAMPLE_RESUME.basics!, summary: longSummary } } as ResumeContent;
    const monster = getConnector("monster")!;
    const blocks = monster.renderExportBlocks(resume);
    const highlights = blocks.find((b) => b.section === "Highlights");
    assert.ok(highlights, "Monster should rename to Highlights");
    assert.strictEqual(highlights!.charLimit, 500);
    assert.ok(highlights!.text.length <= 500, "text should be truncated");
    assert.ok(highlights!.text.endsWith("…"), "truncated text should end with ellipsis");
  });

  it("Wellfound caps summary at 240 chars (elevator pitch)", () => {
    const longSummary = "y".repeat(500);
    const resume = { ...SAMPLE_RESUME, basics: { ...SAMPLE_RESUME.basics!, summary: longSummary } } as ResumeContent;
    const wellfound = getConnector("wellfound")!;
    const blocks = wellfound.renderExportBlocks(resume);
    const about = blocks.find((b) => b.section === "About");
    assert.ok(about, "Wellfound About block exists");
    assert.strictEqual(about!.charLimit, 240);
    assert.ok(about!.text.length <= 240);
  });

  it("ZipRecruiter caps summary at 600 chars without renaming", () => {
    const longSummary = "z".repeat(900);
    const resume = { ...SAMPLE_RESUME, basics: { ...SAMPLE_RESUME.basics!, summary: longSummary } } as ResumeContent;
    const zip = getConnector("ziprecruiter")!;
    const blocks = zip.renderExportBlocks(resume);
    const about = blocks.find((b) => b.section === "About");
    assert.ok(about);
    assert.strictEqual(about!.charLimit, 600);
    assert.ok(about!.text.length <= 600);
  });

  it("tuning autofillSelectors thread onto the matching section blocks", () => {
    const indeed = getConnector("indeed")!;
    const blocks = indeed.renderExportBlocks(SAMPLE_RESUME);
    const headline = blocks.find((b) => b.section === "Headline");
    const summary = blocks.find((b) => b.section === "Summary");
    assert.ok(headline?.autofillSelector, "Indeed Headline should have autofillSelector");
    assert.ok(summary?.autofillSelector, "Indeed Summary should have autofillSelector");
  });

  it("short summaries still get charLimit attached (so the dialog counter renders)", () => {
    const resume = { ...SAMPLE_RESUME, basics: { ...SAMPLE_RESUME.basics!, summary: "short bio" } } as ResumeContent;
    const wellfound = getConnector("wellfound")!;
    const about = wellfound.renderExportBlocks(resume).find((b) => b.section === "About");
    assert.strictEqual(about!.charLimit, 240);
    assert.strictEqual(about!.text, "short bio", "short text should not be modified");
  });
});

// ── LinkedIn connector specifics ──────────────────────────────────────────

describe("linkedin connector", () => {
  const linkedin = getConnector("linkedin")!;

  it("supports extension extract AND write (Headline + About via autofill)", () => {
    assert.strictEqual(linkedin.supportsExtensionExtract, true);
    assert.strictEqual(linkedin.supportsExtensionWrite, true);
  });

  it("emits one Skills block per skill (not a flat comma-separated list)", () => {
    const skillBlocks = linkedin.renderExportBlocks(SAMPLE_RESUME).filter((b) => b.section === "Skills");
    assert.strictEqual(skillBlocks.length, 3, "expected one block per skill");
    assert.deepStrictEqual(
      skillBlocks.map((b) => b.subSection),
      ["Algorithm design", "Symbolic mathematics", "Technical writing"],
    );
  });

  it("applies 220-char limit to Headline and 2600 to About", () => {
    const blocks = linkedin.renderExportBlocks(SAMPLE_RESUME);
    const headline = blocks.find((b) => b.section === "Headline");
    const about = blocks.find((b) => b.section === "About");
    assert.strictEqual(headline?.charLimit, 220);
    assert.strictEqual(about?.charLimit, 2600);
  });

  it("Headline + About blocks carry autofillSelector", () => {
    const blocks = linkedin.renderExportBlocks(SAMPLE_RESUME);
    const headline = blocks.find((b) => b.section === "Headline");
    const about = blocks.find((b) => b.section === "About");
    assert.ok(headline?.autofillSelector);
    assert.ok(about?.autofillSelector);
  });

  it("Experience blocks walk the Add-position modal one field per step (#2138)", () => {
    const exp = linkedin.renderExportBlocks(SAMPLE_RESUME).filter((b) => b.section === "Experience");
    assert.strictEqual(exp.length, 1);
    const steps = exp[0].autofillSteps ?? [];
    assert.deepStrictEqual(steps.map((s) => s.field), ["title", "company", "description"]);
    assert.strictEqual(steps[0].value, "Lead Analyst");
    assert.strictEqual(steps[1].value, "Babbage & Co");
    assert.ok(steps[2].value.startsWith("Designed the first published algorithm"));
    assert.ok(steps[2].value.includes("• Authored Notes on the Analytical Engine"));
    for (const s of steps) assert.ok(s.selector.length > 0, `${s.field} needs a selector`);
  });

  it("Experience steps skip empty fields and cap the description at 2,000 chars (boundary)", () => {
    const resume = {
      ...SAMPLE_RESUME,
      work: [{ name: "", position: "Founder", startDate: "2020", endDate: "", summary: "x".repeat(2_500), highlights: [] }],
    } as unknown as ResumeContent;
    const steps = linkedin.renderExportBlocks(resume).find((b) => b.section === "Experience")?.autofillSteps ?? [];
    assert.deepStrictEqual(steps.map((s) => s.field), ["title", "description"]);
    assert.strictEqual(steps[1].value.length, 2_000);
  });

  it("an Experience entry with nothing to fill keeps paste-only (no steps)", () => {
    const resume = {
      ...SAMPLE_RESUME,
      work: [{ name: "", position: "", startDate: "2020", endDate: "", summary: "", highlights: [] }],
    } as unknown as ResumeContent;
    const block = linkedin.renderExportBlocks(resume).find((b) => b.section === "Experience");
    assert.ok(block);
    assert.strictEqual(block.autofillSteps, undefined);
  });

  it("each Skills block types its skill into the Add-skill typeahead", () => {
    const skillBlocks = linkedin.renderExportBlocks(SAMPLE_RESUME).filter((b) => b.section === "Skills");
    for (const b of skillBlocks) {
      assert.ok(b.autofillSelector, `${b.subSection} needs the skill typeahead selector`);
      assert.strictEqual(b.text, b.subSection);
    }
  });

  it("skips Skills blocks for skills with empty names", () => {
    const resume = {
      ...SAMPLE_RESUME,
      skills: [{ name: "" }, { name: "Real Skill" }, { name: "   " }],
    } as ResumeContent;
    const skillBlocks = linkedin.renderExportBlocks(resume).filter((b) => b.section === "Skills");
    assert.strictEqual(skillBlocks.length, 1);
    assert.strictEqual(skillBlocks[0].subSection, "Real Skill");
  });
});

// ── GitHub connector specifics ────────────────────────────────────────────

describe("github connector", () => {
  const github = getConnector("github")!;

  it("emits Bio + Profile README blocks with per-block openTargetUrl", () => {
    const blocks = github.renderExportBlocks(SAMPLE_RESUME);
    const bio = blocks.find((b) => b.section === "Bio");
    const readme = blocks.find((b) => b.section === "Profile README");
    assert.ok(bio, "Bio block missing");
    assert.ok(readme, "README block missing");
    assert.ok(bio!.openTargetUrl?.includes("/settings/profile"), "Bio opens settings");
    assert.ok(readme!.openTargetUrl?.includes("github.com/new"), "README opens new-repo");
  });

  it("Bio block respects the 160-char GitHub limit", () => {
    const bio = github.renderExportBlocks(SAMPLE_RESUME).find((b) => b.section === "Bio");
    assert.strictEqual(bio!.charLimit, 160);
  });

  it("README block is markdown-formatted", () => {
    const readme = github.renderExportBlocks(SAMPLE_RESUME).find((b) => b.section === "Profile README");
    assert.strictEqual(readme!.format, "markdown");
    assert.ok(readme!.text.includes("# Ada Lovelace"), "README should include name as H1");
    assert.ok(readme!.text.includes("## Experience"), "README should include Experience heading");
  });

  it("supports extract (public profile page) but NOT write (README in repo, not form field)", () => {
    assert.strictEqual(github.supportsExtensionExtract, true);
    assert.strictEqual(github.supportsExtensionWrite, false);
  });

  it("Bio falls back to summary when label is missing", () => {
    const resume = {
      ...SAMPLE_RESUME,
      basics: { ...SAMPLE_RESUME.basics!, label: "" },
    } as ResumeContent;
    const bio = github.renderExportBlocks(resume).find((b) => b.section === "Bio");
    assert.ok(bio, "Bio should still render with summary as fallback");
    assert.ok(bio!.text.includes("Twenty years"), "Bio should use summary when label empty");
  });
});

// ── Personal Site — verify nothing crashes on empty connector ─────────────

describe("personal-site connector", () => {
  it("renders default blocks without crashing", () => {
    const personal = getConnector("personal-site")!;
    const blocks = personal.renderExportBlocks(SAMPLE_RESUME);
    assert.ok(blocks.length > 0);
    assert.strictEqual(personal.editProfileUrl, "", "personal-site has no edit URL");
  });
});
