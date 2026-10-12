/**
 * The pure pieces of the kit review layer: content diff + exact revert,
 * attachment / intent routing, where merged entries land, and path remap
 * past hidden entries. Fixtures are shaped like real parsed résumés.
 */
import { describe, expect, it } from "vitest";
import { ResumeContentSchema, type ResumeContent } from "@shared/resume";
import { pathAfterOmit } from "@shared/resume-path";
import { diffContent, revertChanges } from "@/lib/build/review/content-diff";
import { classifyText, intentFrom, jobLinkIn } from "@/lib/build/review/attachment-router";
import { addedEntryPaths, buildFinalDecisions } from "@/lib/merge/merge-decisions";

const base: ResumeContent = ResumeContentSchema.parse({
  basics: { name: "Sean Hogg", label: "Director Engineering / CIO / CTO", summary: "Strategic technology executive." },
  work: [
    { name: "Alliance Inspection Management (AiM)", position: "VP of Technology/CIO", highlights: ["20% cost reduction", "90% lower attrition"] },
    { name: "Career Now Brands", position: "EVP Product & Technology", highlights: ["Cut costs from 4M to 1.7M"] },
  ],
  skills: [{ name: "SOC 2", keywords: ["Compliance"] }],
});

describe("diffContent", () => {
  it("finds field, bullet and entry changes, anchored by path", () => {
    const after = ResumeContentSchema.parse({
      ...base,
      basics: { ...base.basics, label: "VP Engineering" },
      work: [
        { ...base.work[0], highlights: ["20% cost reduction", "Rebuilt QA with API automation"] },
        base.work[1],
        { name: "Hire Fractional Talent", position: "Fractional CTO", highlights: [] },
      ],
    });
    const changes = diffContent(base, after);
    const byPath = Object.fromEntries(changes.map((c) => [`${c.kind}:${c.path}`, c]));
    expect(byPath["changed:basics.label"].before).toBe("Director Engineering / CIO / CTO");
    expect(byPath["added:work.0.highlights.1"].after).toBe("Rebuilt QA with API automation");
    expect(byPath["removed:work.0"].before).toBe("90% lower attrition");
    expect(byPath["added:work.2"]).toBeDefined();
  });

  it("ignores spacing / case differences (same normalisation as merge)", () => {
    const after = { ...base, basics: { ...base.basics, label: "  director engineering /  CIO / CTO " } } as ResumeContent;
    expect(diffContent(base, after)).toEqual([]);
  });

  it("matches entries by identity, not position", () => {
    const swapped = { ...base, work: [base.work[1], base.work[0]] } as ResumeContent;
    expect(diffContent(base, swapped)).toEqual([]);
  });
});

describe("revertChanges", () => {
  it("undoes chosen changes on top of a draft edited since", () => {
    const after = ResumeContentSchema.parse({
      ...base,
      basics: { ...base.basics, label: "VP Engineering" },
      work: [{ ...base.work[0], highlights: [...base.work[0].highlights, "New bullet"] }, base.work[1]],
    });
    const changes = diffContent(base, after);
    // The person edited the summary after the revision landed.
    const current = { ...after, basics: { ...after.basics, summary: "Edited since." } } as ResumeContent;
    const out = revertChanges(current, base, changes);
    expect(out.basics?.label).toBe(base.basics?.label);
    expect(out.work[0].highlights).toEqual(base.work[0].highlights);
    expect(out.basics?.summary).toBe("Edited since.");
  });

  it("puts a removed bullet back", () => {
    const after = { ...base, work: [{ ...base.work[0], highlights: ["20% cost reduction"] }, base.work[1]] } as ResumeContent;
    const out = revertChanges(after, base, diffContent(base, after));
    expect(out.work[0].highlights).toContain("90% lower attrition");
  });
});

describe("attachment router", () => {
  const jobPost = `VP Engineering — Northwind Health
About the role: you will lead a 60+ person engineering org.
Responsibilities: own quality and release cadence.
Requirements: 10+ years of experience; Kubernetes; SOC 2 / HIPAA.
Nice to have: healthcare domain. Benefits: equal opportunity employer.`;
  const resume = `Sean Hogg  sean@example.com
Experience
VP of Technology/CIO — AiM   Jul 2021 - Present
Led a 20% reduction in operating costs. Reduced attrition 90%.
Education  Bachelor of Science, University of Windsor
Skills  SOC 2, M&A, Business Intelligence`;

  it("tells a job post from a résumé", () => {
    expect(classifyText(jobPost)).toBe("job");
    expect(classifyText(resume)).toBe("resume");
    expect(classifyText("make it punchier")).toBeNull();
  });

  it("reads typed intents, and leaves ordinary change requests to the chat", () => {
    expect(intentFrom("merge it into my master")).toBe("merge");
    expect(intentFrom("update my résumé for this job")).toBe("tailor");
    expect(intentFrom("create a new one for this job")).toBe("create");
    expect(intentFrom("Update my summary to mention it")).toBeNull();
    expect(intentFrom("Fit on one page")).toBeNull();
    expect(intentFrom("Make the summary punchier")).toBeNull();
  });

  it("finds a pasted job link", () => {
    expect(jobLinkIn("tailor it for https://jobs.example.com/vp-eng?id=4.")).toBe("https://jobs.example.com/vp-eng?id=4");
  });
});

describe("merge anchors", () => {
  it("appended entries land after the target's, in decision order", () => {
    const final = buildFinalDecisions(
      [{ sectionType: "work", sourceIndex: 0, targetIndex: null, action: "add" }],
      new Map([["work:3", true], ["skills:1", true], ["work:4", false]]),
    );
    const paths = addedEntryPaths(final, base as unknown as Record<string, unknown>);
    expect(paths.get("work:0")).toBe("work.2");
    expect(paths.get("work:3")).toBe("work.3");
    expect(paths.get("skills:1")).toBe("skills.1");
    expect(paths.has("work:4")).toBe(false);
  });
});

describe("pathAfterOmit", () => {
  it("shifts later siblings and drops omitted paths", () => {
    expect(pathAfterOmit("work.3.highlights.1", ["work.1"])).toBe("work.2.highlights.1");
    expect(pathAfterOmit("work.1", ["work.1"])).toBeNull();
    expect(pathAfterOmit("work.0", ["work.1", "skills.0"])).toBe("work.0");
  });
});
