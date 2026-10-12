/**
 * "This line" data — a KitLineRef resolves to the content field it names
 * (by index in its entry / section, with the text breaking ties when the
 * page moved under it), a content path maps back to a ref (the finding
 * flag's selection), a line's findings are the ones anchored on exactly it,
 * and its job keywords are the ones it mentions as whole words (matched) vs
 * the résumé's missing ones it doesn't (capped).
 */
import { describe, expect, it } from "vitest";
import { ResumeContentSchema, type ResumeContent } from "@shared/resume";
import {
  MAX_LINE_MISSING,
  findingsForLine,
  keywordsForLine,
  lineMentions,
  lineRefOfPath,
  linesInScope,
  resolveKitLine,
  rewriteSuggestions,
} from "@/lib/build/this-line";
import type { JobMatch } from "@/lib/build/job-match";
import type { PageFinding } from "@/lib/build/page-findings";

const AIM = "3f6a9c1e-0b2d-4e7a-9c55-1d2e3f4a5b6c";
const CNB = "seed-work-cnb-2019";
const COSTS = "Cut annual operating costs by $1.79M (≈43%) within 18 months by consolidating vendors.";
const ATTRITION = "90% reduction in attrition by establishing a people-first performance culture.";

function resume(): ResumeContent {
  return ResumeContentSchema.parse({
    basics: {
      name: "Sean Hogg",
      label: "Technology Executive & CIO",
      summary: "Hands-on technology executive with 20+ years in SaaS and education.",
    },
    work: [
      {
        id: AIM,
        name: "Alliance Inspection Management (AiM)",
        position: "CIO",
        summary: "Led IT for a national inspection business.",
        highlights: [COSTS, ATTRITION],
      },
      {
        id: CNB,
        name: "Career Now Brands (CNB)",
        position: "",
        highlights: ["Raised project completion 175% with Agile delivery."],
      },
    ],
    projects: [{ name: "Open-source CLI", description: "A CLI for résumé parsing in TypeScript." }],
  });
}

describe("linesInScope", () => {
  it("lists an entry's prose first, then its highlights", () => {
    expect(linesInScope(resume(), "work", AIM).map((f) => f.path)).toEqual([
      "work.0.summary",
      "work.0.highlights.0",
      "work.0.highlights.1",
    ]);
  });

  it("without an item id spans the whole section (basics: label, summary)", () => {
    expect(linesInScope(resume(), "basics").map((f) => f.field)).toEqual(["label", "summary"]);
    expect(linesInScope(resume(), "work")).toHaveLength(4);
  });
});

describe("resolveKitLine", () => {
  it("resolves the indexed line of the entry with its entry's title", () => {
    const line = resolveKitLine(resume(), { section: "work", itemId: AIM, lineIndex: 1, text: COSTS });
    expect(line).toMatchObject({ path: "work.0.highlights.0", field: "highlights", text: COSTS, itemTitle: "CIO" });
  });

  it("falls back to the entry's name, and to the project name", () => {
    expect(resolveKitLine(resume(), { section: "work", itemId: CNB, lineIndex: 0, text: "x" })?.itemTitle).toBe(
      "Career Now Brands (CNB)",
    );
    expect(resolveKitLine(resume(), { section: "projects", lineIndex: 0, text: "x" })?.itemTitle).toBe("Open-source CLI");
  });

  it("has no entry title for a section-level line", () => {
    const line = resolveKitLine(resume(), { section: "basics", lineIndex: 1, text: "" });
    expect(line).toMatchObject({ path: "basics.summary", itemTitle: null });
  });

  it("follows the text when the index went stale (a line was added above it)", () => {
    const line = resolveKitLine(resume(), { section: "work", itemId: AIM, lineIndex: 0, text: `  ${ATTRITION.toUpperCase()} ` });
    expect(line?.path).toBe("work.0.highlights.1");
  });

  it("keeps the indexed line when its text was edited (no exact match elsewhere)", () => {
    const line = resolveKitLine(resume(), { section: "work", itemId: AIM, lineIndex: 2, text: "old wording" });
    expect(line?.path).toBe("work.0.highlights.1");
  });

  it("is null with no selection, no content, a gone line or an unknown entry", () => {
    expect(resolveKitLine(resume(), null)).toBeNull();
    expect(resolveKitLine(null, { section: "work", lineIndex: 0, text: "" })).toBeNull();
    expect(resolveKitLine(resume(), { section: "work", itemId: AIM, lineIndex: 9, text: "nope" })).toBeNull();
    expect(resolveKitLine(resume(), { section: "work", itemId: "missing", lineIndex: 0, text: COSTS })).toBeNull();
  });
});

describe("lineRefOfPath", () => {
  it("round-trips through resolveKitLine", () => {
    const content = resume();
    for (const path of ["basics.label", "basics.summary", "work.0.summary", "work.0.highlights.1", "work.1.highlights.0", "projects.0.description"]) {
      const ref = lineRefOfPath(content, path);
      expect(ref).not.toBeNull();
      expect(resolveKitLine(content, ref)?.path).toBe(path);
    }
  });

  it("names the entry and the index inside it", () => {
    expect(lineRefOfPath(resume(), "work.0.highlights.1")).toEqual({ section: "work", itemId: AIM, lineIndex: 2, text: ATTRITION });
  });

  it("is null for a path that is not a line", () => {
    expect(lineRefOfPath(resume(), "basics")).toBeNull();
    expect(lineRefOfPath(resume(), "work.0.position")).toBeNull();
  });
});

function finding(id: string, path: string, extra: Partial<PageFinding> = {}): PageFinding {
  return {
    id,
    source: "roast",
    kind: "issue",
    severity: "important",
    labelKey: "build.findings.flag.roast",
    anchor: { path, section: path.split(".")[0], field: "highlights", text: "", start: 0, end: 0 },
    ...extra,
  };
}

describe("findingsForLine / rewriteSuggestions", () => {
  const rewrite = finding("1:0", "work.0.highlights.0", { kind: "rewrite", rewrite: { before: COSTS, after: "Cut costs 43%." } });
  const issue = finding("2:0", "work.0.highlights.0", { title: "Say how." });
  const other = finding("2:1", "work.0.highlights.1");
  const missing = finding("-1:0", "basics", { kind: "missing" });

  it("keeps only the findings anchored on exactly this line", () => {
    expect(findingsForLine([rewrite, issue, other, missing], "work.0.highlights.0").map((f) => f.id)).toEqual(["1:0", "2:0"]);
  });

  it("never pins a missing-field finding on a line", () => {
    expect(findingsForLine([missing], "basics")).toEqual([]);
  });

  it("turns rewrites into wording suggestions", () => {
    expect(rewriteSuggestions([rewrite, issue])).toEqual([{ id: "1:0", text: "Cut costs 43%." }]);
  });
});

const match = (found: string[], missing: string[]): JobMatch => ({
  jobLabel: "CIO · Macomb",
  score: 85,
  found,
  missing,
  source: "tool",
});

describe("lineMentions", () => {
  it("matches whole words, case- and spacing-insensitive", () => {
    expect(lineMentions(COSTS, "Vendors")).toBe(true);
    expect(lineMentions(COSTS, "consolidating  VENDORS")).toBe(true);
    expect(lineMentions("Built C++ and Node.js services", "c++")).toBe(true);
    expect(lineMentions("Built Node.js services", "node.js")).toBe(true);
  });

  it("doesn't match inside a longer word, or an empty keyword", () => {
    expect(lineMentions("Agile delivery", "Agi")).toBe(false);
    expect(lineMentions(COSTS, "vendor")).toBe(false);
    expect(lineMentions("Agile delivery", "  ")).toBe(false);
  });
});

describe("keywordsForLine", () => {
  it("is null with no job match", () => {
    expect(keywordsForLine(null, COSTS)).toBeNull();
  });

  it("matched = the job's keywords the line shows; missing = the résumé's gaps it doesn't", () => {
    const out = keywordsForLine(match(["operating costs", "Agile"], ["vendor management", "budget", "consolidating vendors"]), COSTS);
    expect(out).toEqual({ matched: ["operating costs", "consolidating vendors"], missing: ["vendor management", "budget"] });
  });

  it("caps the could-cover list", () => {
    const many = Array.from({ length: MAX_LINE_MISSING + 3 }, (_, i) => `skill ${i}`);
    expect(keywordsForLine(match([], many), COSTS)?.missing).toHaveLength(MAX_LINE_MISSING);
  });
});
