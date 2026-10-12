/**
 * #2221 — the create step's plan: a résumé opens a master kit or branches a
 * variant (wearing the picked design); a job / company document is seeded
 * with the picked design before the editor mounts.
 */
import { describe, expect, it } from "vitest";
import { documentTemplatesForEntity } from "@/lib/studio/editor-v2/document-templates";
import { documentCreatePlan, variantHref } from "../use-document-create";

const RESUME_ID = "8b6f2c1e-0d6a-4b8e-9f3a-2c7d5e1a9b40";
let n = 0;
const ids = () => `blk-${++n}`;

describe("documentCreatePlan", () => {
  const resumeDesign = documentTemplatesForEntity("resume")[0];
  const jobDesign = documentTemplatesForEntity("job")[0];

  it("résumé master with no design → a new kit leading with the résumé", () => {
    expect(documentCreatePlan("resume", null)).toEqual({ type: "navigate", to: "/studio/new?start=resume" });
  });

  it("résumé master with a design → a new kit wearing it", () => {
    const plan = documentCreatePlan("resume", resumeDesign, { mode: "master" });
    expect(plan).toEqual({
      type: "navigate",
      to: `/studio/new?start=resume&design=${encodeURIComponent(resumeDesign.id)}`,
    });
  });

  it("résumé variant → branch off the master, carrying the design", () => {
    expect(documentCreatePlan("resume", resumeDesign, { mode: "variant", parentId: RESUME_ID })).toEqual({
      type: "variant",
      parentId: RESUME_ID,
      design: resumeDesign.id,
    });
    expect(variantHref(RESUME_ID, null)).toBe(`/studio/resume/${RESUME_ID}`);
    expect(variantHref(RESUME_ID, "modern")).toBe(`/studio/resume/${RESUME_ID}?design=modern`);
  });

  it("job with a design → a blank job document seeded with that design", () => {
    const plan = documentCreatePlan("job", jobDesign, undefined, ids);
    expect(plan.type).toBe("document");
    if (plan.type !== "document") return;
    const state = plan.documentState;
    expect(state.entityKind).toBe("job");
    expect(state.entityId).toBeNull();
    expect(state.templateId).toBe(jobDesign.id);
    expect(state.theme.themeKey).toBe(jobDesign.theme.themeKey);
    expect(state.pages[0].blocks.map((b) => b.sectionKey)).toEqual(jobDesign.sections.map((s) => s.sectionKey));
  });

  it("job / company with no design → the plain input template (boundary)", () => {
    expect(documentCreatePlan("job", null)).toEqual({ type: "template", kind: "job" });
    expect(documentCreatePlan("company", null)).toEqual({ type: "template", kind: "company" });
  });

  it("a company starts on its own section set", () => {
    const owned = {
      id: "tpl-1",
      name: "Brand page",
      theme: jobDesign.theme,
      sections: [{ kind: "section" as const, sectionKey: "overview", layout: "prose" }],
      source: "owned" as const,
    };
    const plan = documentCreatePlan("company", owned, undefined, ids);
    expect(plan.type === "document" && plan.documentState.entityKind).toBe("company");
    expect(plan.type === "document" && plan.documentState.pages[0].blocks).toHaveLength(1);
  });
});
