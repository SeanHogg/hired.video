/**
 * #2220 — reviewer authoring on a résumé review:
 *   - a selected quote + a replacement → the structured `suggestedEdit` the
 *     owner accepts in one click (field located in the CONTENT, only the
 *     selected span replaced; entries without a stable id get no edit);
 *   - a full proposed draft: every rewritable line, the edits written into a
 *     copy, and the diff vs the résumé as it is.
 */
import { describe, expect, it } from "vitest";
import { ResumeContentSchema, type ResumeContent } from "@shared/resume";
import { SuggestedEditSchema } from "@shared/resume-feedback";
import { buildSuggestedEdit, suggestTargetFor } from "@/lib/review-feedback/suggested-edit";
import { applyDraftEdits, draftChanges, draftLines } from "@/lib/review-feedback/proposed-draft";

function resume(): ResumeContent {
  return ResumeContentSchema.parse({
    basics: { name: "Ana Ruiz", label: "Director of IT", summary: "IT leader for healthcare networks. Results-driven professional." },
    work: [
      {
        id: "3f6a9c1e-0b2d-4e7a-9c55-1d2e3f4a5b6c",
        name: "Northwind Health",
        position: "Director of IT",
        summary: "Ran IT for a 2,000-seat network.",
        highlights: ["Responsible for vendor management across 12 contracts", "Migrated 40 apps to Azure"],
      },
      { name: "Acme Clinics", position: "IT Manager", highlights: ["Built the ITIL service desk from scratch"] },
    ],
  });
}

describe("suggestTargetFor / buildSuggestedEdit", () => {
  it("targets a bullet by entry id + bracketed path and replaces only the selection", () => {
    const target = suggestTargetFor(resume(), "Responsible for vendor management");
    expect(target).toMatchObject({ sectionKey: "work", referenceId: "3f6a9c1e-0b2d-4e7a-9c55-1d2e3f4a5b6c", fieldPath: "highlights[0]" });
    const edit = buildSuggestedEdit(target!, "Cut vendor spend 18% by renegotiating");
    expect(edit).toEqual({
      sectionKey: "work",
      referenceId: "3f6a9c1e-0b2d-4e7a-9c55-1d2e3f4a5b6c",
      fieldPath: "highlights[0]",
      before: "Responsible for vendor management across 12 contracts",
      after: "Cut vendor spend 18% by renegotiating across 12 contracts",
    });
    expect(SuggestedEditSchema.safeParse(edit).success).toBe(true);
  });

  it("targets a basics field without a referenceId", () => {
    const target = suggestTargetFor(resume(), "Results-driven professional.");
    expect(target).toMatchObject({ sectionKey: "basics", fieldPath: "summary" });
    expect(target?.referenceId).toBeUndefined();
    expect(buildSuggestedEdit(target!, "Cut infra spend 28%.")?.after).toBe("IT leader for healthcare networks. Cut infra spend 28%.");
  });

  it("offers no edit on an entry without a stable id, or for text not on the page", () => {
    expect(suggestTargetFor(resume(), "Built the ITIL service desk")).toBeNull();
    expect(suggestTargetFor(resume(), "A sentence this résumé never had")).toBeNull();
    expect(suggestTargetFor(null, "Migrated 40 apps")).toBeNull();
  });

  it("an empty or identical replacement is not an edit", () => {
    const target = suggestTargetFor(resume(), "Migrated 40 apps to Azure")!;
    expect(buildSuggestedEdit(target, "   ")).toBeNull();
    expect(buildSuggestedEdit(target, "Migrated 40 apps to Azure")).toBeNull();
  });
});

describe("proposed draft", () => {
  it("lists every rewritable line with its entry", () => {
    const lines = draftLines(resume());
    expect(lines.map((l) => l.path)).toEqual([
      "basics.label",
      "basics.summary",
      "work.0.summary",
      "work.0.highlights.0",
      "work.0.highlights.1",
      "work.1.highlights.0",
    ]);
    expect(lines[2].entry).toBe("Director of IT · Northwind Health");
    expect(lines[0].entry).toBe("");
  });

  it("writes the edits into a copy and diffs it against the résumé", () => {
    const content = resume();
    const edits = { "work.0.highlights.0": "Cut vendor spend 18% across 12 contracts", "basics.label": "VP Technology" };
    const draft = applyDraftEdits(content, edits);
    expect(draft.work?.[0].highlights[0]).toBe("Cut vendor spend 18% across 12 contracts");
    expect(content.work?.[0].highlights[0]).toBe("Responsible for vendor management across 12 contracts");
    const changes = draftChanges(content, edits);
    expect(changes.map((c) => [c.kind, c.after])).toEqual(
      expect.arrayContaining([
        ["changed", "VP Technology"],
        ["changed", "Cut vendor spend 18% across 12 contracts"],
      ]),
    );
    expect(ResumeContentSchema.safeParse(draft).success).toBe(true);
  });

  it("no edits (or edits back to the same text) means nothing to send", () => {
    const content = resume();
    expect(draftChanges(content, {})).toEqual([]);
    expect(draftChanges(content, { "basics.label": "Director of IT" })).toEqual([]);
  });
});
