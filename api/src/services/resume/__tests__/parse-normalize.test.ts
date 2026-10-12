/**
 * normalizeJsonResume tests — the canonical-row fast path (#1588 Worker-CPU
 * fix) must skip the deep remap walk WITHOUT changing observable output:
 * canonical rows pass through (same reference when no promotion needed),
 * PascalCase legacy exports still get remapped, and the top-level name→title
 * promotion holds on both paths without mutating the caller's object.
 *
 * Run: node --import tsx --test src/services/resume/__tests__/parse-normalize.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeJsonResume } from "../parse.js";

describe("normalizeJsonResume — canonical fast path (#1588)", () => {
  it("returns an already-canonical row unchanged (same reference, no deep walk)", () => {
    const input = {
      basics: { name: "Jess", label: "Engineer" },
      work: [{ name: "Acme", position: "Staff" }],
      skills: [{ name: "TS", keywords: ["types"] }],
    };
    const out = normalizeJsonResume(input);
    assert.deepEqual(out, input);
    assert.equal(out, input); // fast path returns the same ref (no reallocation)
  });

  it("does NOT mutate the caller's object when promoting top-level name→title", () => {
    const input = { name: "My Resume", basics: { name: "Jess" } };
    const out = normalizeJsonResume(input);
    assert.equal(out.title, "My Resume");
    assert.equal(out.name, undefined);
    // Original input untouched (we clone on the fast path before promoting).
    assert.equal((input as Record<string, unknown>).name, "My Resume");
  });
});

describe("normalizeJsonResume — legacy PascalCase still remaps", () => {
  it("lowercases PascalCase top-level + nested keys", () => {
    const out = normalizeJsonResume({
      Basics: { Name: "Jess", Label: "Engineer" },
      Work: [{ Name: "Acme", Position: "Staff" }],
    });
    assert.deepEqual(out.basics, { name: "Jess", label: "Engineer" });
    assert.deepEqual(out.work, [{ name: "Acme", position: "Staff" }]);
    assert.equal(out.Basics, undefined);
  });

  it("promotes the legacy top-level Name → title", () => {
    const out = normalizeJsonResume({ Name: "My Resume", Basics: { Name: "Jess" } });
    assert.equal(out.title, "My Resume");
    assert.equal(out.name, undefined);
  });

  it("handles non-object input", () => {
    assert.deepEqual(normalizeJsonResume(null), {});
    assert.deepEqual(normalizeJsonResume("nope"), {});
  });
});
