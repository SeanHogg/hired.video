import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeContent } from "../resume/content.js";

/**
 * #1588 — `normalizeContent` short-circuit. The read path (every embed /
 * detail load) previously ran `remapKeys` — a recursive deep-walk that
 * re-allocates every object + array to lowercase keys — regardless of
 * whether the stored row was already canonical. On heavy resumes this
 * dominated Worker CPU. The fast path skips the walk for canonical rows.
 *
 * These tests pin BOTH branches: the fast path must return the same shape
 * the deep walk would, and the legacy PascalCase path must still normalize.
 *
 * Run: node --import tsx --test src/services/__tests__/resume-normalize-content.test.ts
 */

describe("normalizeContent — fast path for canonical rows (#1588)", () => {
  it("preserves an already-canonical blob and fills missing section defaults", () => {
    const input = {
      basics: { name: "Jane", label: "Engineer" },
      work: [{ company: "Acme", highlights: ["shipped"] }],
    };
    const out = normalizeContent(input);
    assert.deepEqual(out.basics, { name: "Jane", label: "Engineer" });
    assert.deepEqual(out.work, [{ company: "Acme", highlights: ["shipped"] }]);
    // Omitted sections are back-filled with empty arrays.
    assert.deepEqual(out.skills, []);
    assert.deepEqual(out.education, []);
    assert.deepEqual(out.metaData, []);
  });

  it("does not mutate the input row", () => {
    const input: Record<string, unknown> = { basics: { name: "Jane" } };
    normalizeContent(input);
    assert.deepEqual(Object.keys(input), ["basics"]); // no default arrays leaked in
  });

  it("promotes top-level `name` → `title` on the fast path", () => {
    const out = normalizeContent({ name: "My Resume", skills: [] });
    assert.equal(out.title, "My Resume");
    assert.equal("name" in out, false);
  });
});

describe("normalizeContent — legacy PascalCase still normalized", () => {
  it("deep-lowercases PascalCase top-level + nested keys", () => {
    const out = normalizeContent({
      Basics: { Name: "Bob", StartDate: "2020" },
      Work: [{ Company: "BigCo" }],
    });
    // Top-level lowercased.
    assert.ok("basics" in out);
    assert.ok("work" in out);
    assert.equal("Basics" in out, false);
    // Nested lowercased too (the expensive walk must still run here).
    const basics = out.basics as Record<string, unknown>;
    assert.equal(basics.name, "Bob");
    assert.equal(basics.startDate, "2020");
  });

  it("promotes legacy top-level `Name` → `title`", () => {
    const out = normalizeContent({ Name: "Legacy Resume", Basics: {} });
    assert.equal(out.title, "Legacy Resume");
  });
});

describe("normalizeContent — non-object input", () => {
  it("returns just the section defaults for null / non-object", () => {
    const out = normalizeContent(null);
    assert.deepEqual(out.work, []);
    assert.deepEqual(out.skills, []);
  });
});
