/**
 * Tests for `healAndValidateContent` — the write-boundary guard that
 * transforms arbitrary content blobs (legacy DB rows, AI parses, user
 * input) into a shape that parses against ResumeContentSchema.
 *
 * These encode the contract every resume-writing code path depends on:
 *   - null-as-array heals to []
 *   - PascalCase keys remap to camelCase
 *   - missing top-level sections fill with []
 *   - truly broken input fails with typed issues (no silent corruption)
 *
 * Run: node --import tsx --test src/handlers/__tests__/resume-heal.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  healAndValidateContent,
  healResumeContent,
} from "../../services/resume/content.js";
import { ResumeContentSchema } from "../../../../shared/resume.js";

describe("healAndValidateContent", () => {
  it("heals the exact legacy blob shape from the 2026-04-22 support ticket", () => {
    // Reproduces the Kevin_Ho.RAM row: education[].courses = null ×3,
    // volunteer[].highlights = null ×1. Four schema violations total.
    const input = {
      basics: { name: "Kevin" },
      education: [
        { institution: "University of Windsor", courses: null },
        { institution: "Purdue University", courses: null },
        { institution: "Purdue University", courses: null },
      ],
      volunteer: [
        { organization: "UNICEF", highlights: null },
      ],
    };
    const result = healAndValidateContent(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.content.education?.[0]?.courses, []);
    assert.deepEqual(result.content.education?.[1]?.courses, []);
    assert.deepEqual(result.content.education?.[2]?.courses, []);
    assert.deepEqual(result.content.volunteer?.[0]?.highlights, []);
  });

  it("remaps PascalCase keys + heals null arrays in one pass", () => {
    const input = {
      Basics: { Name: "Old Sean" },
      Work: [{ Name: "Acme", Position: "CTO", Highlights: null }],
    };
    const result = healAndValidateContent(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.content.basics?.name, "Old Sean");
    assert.equal(result.content.work?.[0]?.name, "Acme");
    assert.deepEqual(result.content.work?.[0]?.highlights, []);
  });

  it("fills missing top-level sections with empty arrays", () => {
    // Many legacy rows stored only `basics`. Heal must emit a complete
    // canonical shape so downstream code never sees missing sections.
    const result = healAndValidateContent({ basics: { name: "Sean" } });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.content.work, []);
    assert.deepEqual(result.content.education, []);
    assert.deepEqual(result.content.skills, []);
    assert.deepEqual(result.content.projects, []);
  });

  it("coerces null at the top-level section keys too (not just nested)", () => {
    const result = healAndValidateContent({
      basics: { name: "X" },
      work: null,
      skills: null,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.content.work, []);
    assert.deepEqual(result.content.skills, []);
  });

  it("heals keywords (Skill, Interest, Project) and roles (Project)", () => {
    const result = healAndValidateContent({
      skills: [{ name: "TS", keywords: null }],
      interests: [{ name: "Hiking", keywords: null }],
      projects: [{ name: "p1", keywords: null, roles: null, highlights: null }],
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.content.skills?.[0]?.keywords, []);
    assert.deepEqual(result.content.interests?.[0]?.keywords, []);
    assert.deepEqual(result.content.projects?.[0]?.keywords, []);
    assert.deepEqual(result.content.projects?.[0]?.roles, []);
    assert.deepEqual(result.content.projects?.[0]?.highlights, []);
  });

  it("preserves basics.location = null (schema explicitly allows null)", () => {
    // LocationSchema is .nullable().optional() — heal must NOT coerce
    // this to {} because null is a valid, distinct value here.
    const result = healAndValidateContent({
      basics: { name: "Kevin", location: null },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.content.basics?.location, null);
  });

  it("passes an already-canonical blob through unchanged (idempotent)", () => {
    const canonical = ResumeContentSchema.parse({
      basics: { name: "Sean" },
      work: [{ name: "Acme", position: "CTO", highlights: ["shipped"] }],
    });
    const result = healAndValidateContent(canonical);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    // Re-parsing the healed blob yields the same shape.
    const reparsed = ResumeContentSchema.safeParse(result.content);
    assert.equal(reparsed.success, true);
  });

  it("reports structured issues when heal cannot recover the input", () => {
    // A work entry with highlights:123 (a number) can't be coerced to an
    // array by the heal pass — heal only touches `null`, so the Zod parse
    // surfaces the violation with a dotted path.
    const result = healAndValidateContent({
      work: [{ name: "Acme", highlights: 123 }],
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.ok(result.issues.length > 0);
    const issue = result.issues[0];
    assert.equal(typeof issue.path, "string");
    assert.match(issue.path, /work\.0\.highlights/);
    assert.equal(typeof issue.message, "string");
  });

  it("returns a fresh canonical shape for completely empty input", () => {
    const result = healAndValidateContent({});
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.content.work, []);
    assert.deepEqual(result.content.skills, []);
  });

  it("survives null/undefined input (treats as empty document)", () => {
    assert.equal(healAndValidateContent(null).ok, true);
    assert.equal(healAndValidateContent(undefined).ok, true);
  });
});

describe("healResumeContent (transform step, no schema)", () => {
  it("exposes the pre-Zod shape for producers that layer on more changes", () => {
    // Used by callers that need to see the normalised blob before the
    // final parse — e.g. tests asserting on exactly what the heal pass
    // produces, or a merge pipeline that rewrites fields post-heal.
    const healed = healResumeContent({
      Basics: { Name: "X" },
      Education: [{ Institution: "Purdue", Courses: null }],
    });
    assert.equal((healed.basics as any)?.name, "X");
    assert.deepEqual((healed.education as any)?.[0]?.courses, []);
  });
});
