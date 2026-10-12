/**
 * Tests for buildTemplateAssignmentContent.
 *
 * Regression context: ResumeDetail.tsx originally inlined a content patch
 * with `Meta:` (PascalCase). The backend schema is .strip(), so the field
 * was silently dropped — toast said "Template assigned" but the DB never
 * changed and the dropdown still showed the old default. These tests pin
 * the casing and the merge semantics.
 *
 * Run: vitest run lib/utils/__tests__/resume-template-assignment.test.ts
 */

import { describe, it, expect } from "vitest";
import { buildTemplateAssignmentContent } from "@/lib/utils/resume-template-assignment";

describe("buildTemplateAssignmentContent", () => {
  it("emits LOWERCASE `meta` (server schema strips PascalCase) — regression pin", () => {
    const result = buildTemplateAssignmentContent({}, "template", "preset-a");
    expect(result).toHaveProperty("meta");
    expect(result).not.toHaveProperty("Meta");
    expect((result as any).meta.template).toBe("preset-a");
  });

  it("assigns 'template' slot for the default view", () => {
    const result = buildTemplateAssignmentContent({}, "template", "default-preset");
    expect((result as any).meta).toEqual({ template: "default-preset" });
  });

  it("assigns 'embeddedTemplate' slot for the embedded view", () => {
    const result = buildTemplateAssignmentContent({}, "embeddedTemplate", "embed-preset");
    expect((result as any).meta).toEqual({ embeddedTemplate: "embed-preset" });
  });

  it("preserves the OTHER slot when assigning one", () => {
    // Setting `embeddedTemplate` must not erase `template` or vice versa.
    const existing = { meta: { template: "default-preset" } };
    const result = buildTemplateAssignmentContent(existing, "embeddedTemplate", "embed-preset");
    expect((result as any).meta.template).toBe("default-preset");
    expect((result as any).meta.embeddedTemplate).toBe("embed-preset");
  });

  it("overwrites the same slot when reassigning", () => {
    const existing = { meta: { template: "old-preset" } };
    const result = buildTemplateAssignmentContent(existing, "template", "new-preset");
    expect((result as any).meta.template).toBe("new-preset");
  });

  it("preserves existing content fields (basics, work, etc.)", () => {
    const existing = {
      basics: { name: "Sean" },
      work: [{ name: "Acme", position: "CTO" }],
      meta: { version: "1.0" },
    };
    const result = buildTemplateAssignmentContent(existing, "template", "preset-x");
    expect((result as any).basics).toEqual({ name: "Sean" });
    expect((result as any).work).toEqual([{ name: "Acme", position: "CTO" }]);
    // version field inside meta is preserved alongside the new template
    expect((result as any).meta.version).toBe("1.0");
    expect((result as any).meta.template).toBe("preset-x");
  });

  it("handles null / undefined existing content", () => {
    expect((buildTemplateAssignmentContent(null, "template", "p") as any).meta.template).toBe("p");
    expect((buildTemplateAssignmentContent(undefined, "template", "p") as any).meta.template).toBe("p");
  });

  it("handles existing content with no meta object", () => {
    const existing = { basics: { name: "Jane" } };
    const result = buildTemplateAssignmentContent(existing, "template", "preset-y");
    expect((result as any).meta).toEqual({ template: "preset-y" });
    expect((result as any).basics).toEqual({ name: "Jane" });
  });
});
