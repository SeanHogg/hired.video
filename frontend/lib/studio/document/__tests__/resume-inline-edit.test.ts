/**
 * Inline edit round-trip (#1916 / #2101 / #2153): an edit made on the résumé
 * page changes ONLY the edited field of the entity content — `metaData` and
 * `skillEvidence` are untouched (same references), everything else is
 * deep-equal to the original.
 *
 * Run: vitest run lib/studio/document/__tests__/resume-inline-edit.test.ts
 */
import { describe, expect, it } from "vitest";
import { readAt, writeAt } from "@shared/resume-path";
import { applyInlineEdit, inlineEditTarget, normalizeInlineValue } from "../resume-inline-edit";
import { resumeFixture } from "./resume-fixture";

/** The fixture with exactly one field set — the expected result. */
function expectedWith(path: string, value: string) {
  return writeAt(resumeFixture(), path, value);
}

describe("applyInlineEdit — happy path", () => {
  it("changes only the edited work field; metaData and skillEvidence are the same references", () => {
    const before = resumeFixture();
    const snapshot = structuredClone(before);
    const result = applyInlineEdit(before, "work.0.position", "Staff Engineer");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changed).toBe(true);
    expect(result.content).toEqual(expectedWith("work.0.position", "Staff Engineer"));
    expect(result.content.metaData).toBe(before.metaData);
    expect(result.content.skillEvidence).toBe(before.skillEvidence);
    expect(result.content.education).toBe(before.education);
    expect(result.content.work[1]).toBe(before.work[1]);
    // The input was not mutated.
    expect(before).toEqual(snapshot);
  });

  it("edits a header field and a bullet", () => {
    const first = applyInlineEdit(resumeFixture(), "basics.name", "Sean P. Hogg");
    expect(first.ok && readAt(first.content, "basics.name")).toBe("Sean P. Hogg");
    const bullet = applyInlineEdit(resumeFixture(), "work.0.highlights.1", "Mentored 8 engineers");
    expect(bullet.ok).toBe(true);
    if (!bullet.ok) return;
    expect(bullet.content).toEqual(expectedWith("work.0.highlights.1", "Mentored 8 engineers"));
    expect(bullet.content.metaData).toEqual(resumeFixture().metaData);
    expect(bullet.content.skillEvidence).toEqual(resumeFixture().skillEvidence);
  });

  it("edits an item whose id is a seed-derived (non-RFC) uuid", () => {
    const result = applyInlineEdit(resumeFixture(), "education.0.institution", "UWaterloo");
    expect(result.ok && result.content).toEqual(expectedWith("education.0.institution", "UWaterloo"));
  });
});

describe("applyInlineEdit — boundaries", () => {
  it("returns the same object (no history step) when the value didn't change", () => {
    const before = resumeFixture();
    const result = applyInlineEdit(before, "work.0.position", "  Senior Engineer \n");
    expect(result).toEqual({ ok: true, content: before, changed: false });
    if (result.ok) expect(result.content).toBe(before);
  });

  it("collapses breaks in one-line fields and keeps them in paragraphs", () => {
    const line = applyInlineEdit(resumeFixture(), "basics.label", "Chief\nTechnology  Officer ");
    expect(line.ok && readAt(line.content, "basics.label")).toBe("Chief Technology  Officer");
    const para = applyInlineEdit(resumeFixture(), "basics.summary", "Line one.\r\nLine two.\n");
    expect(para.ok && readAt(para.content, "basics.summary")).toBe("Line one.\nLine two.");
  });

  it("edits the last bullet but never appends one past the end", () => {
    expect(applyInlineEdit(resumeFixture(), "work.0.highlights.1", "x").ok).toBe(true);
    expect(applyInlineEdit(resumeFixture(), "work.0.highlights.2", "x")).toEqual({ ok: false, reason: "missing-entry" });
    expect(applyInlineEdit(resumeFixture(), "work.1.highlights.0", "x")).toEqual({ ok: false, reason: "missing-entry" });
  });

  it("writes a header field into a résumé that has no basics yet", () => {
    const { basics: _omit, ...rest } = resumeFixture();
    const result = applyInlineEdit(rest, "basics.name", "Dana");
    expect(result.ok && result.content).toEqual({ ...rest, basics: { name: "Dana" } });
  });

  it("clears a field to an empty string", () => {
    const result = applyInlineEdit(resumeFixture(), "work.0.summary", "   ");
    expect(result.ok && result.content).toEqual(expectedWith("work.0.summary", ""));
  });
});

describe("applyInlineEdit — refusals", () => {
  it.each([
    ["metaData.0.url"],
    ["skillEvidence.0.skillName"],
    ["work.0.id"],
    ["work.0"],
    ["work"],
    ["work.0.startDate"],
    ["skills.1.keywords.0"],
    ["education.0.highlights.0"],
    ["basics.location"],
    ["basics"],
    [""],
  ])("refuses a path that isn't an inline text field: %s", (path) => {
    expect(applyInlineEdit(resumeFixture(), path, "x")).toEqual({ ok: false, reason: "not-editable" });
  });

  it("refuses an entry that doesn't exist", () => {
    expect(applyInlineEdit(resumeFixture(), "work.5.position", "x")).toEqual({ ok: false, reason: "missing-entry" });
    expect(applyInlineEdit(resumeFixture(), "volunteer.0.position", "x")).toEqual({ ok: false, reason: "missing-entry" });
  });

  it("refuses to overwrite a field that holds something other than text", () => {
    const corrupt = writeAt(resumeFixture(), "work.0.summary", { html: "<b>x</b>" });
    expect(applyInlineEdit(corrupt, "work.0.summary", "x")).toEqual({ ok: false, reason: "not-text" });
  });
});

describe("inlineEditTarget / normalizeInlineValue", () => {
  it("knows which fields are paragraphs", () => {
    expect(inlineEditTarget("basics.summary")).toEqual({ multiline: true });
    expect(inlineEditTarget("projects.0.description")).toEqual({ multiline: true });
    expect(inlineEditTarget("projects.0.highlights.0")).toEqual({ multiline: false });
    expect(inlineEditTarget("references.0.reference")).toEqual({ multiline: true });
  });
  it("normalizes non-breaking spaces from contentEditable", () => {
    expect(normalizeInlineValue({ multiline: false }, " Lead ")).toBe("Lead");
  });
});
