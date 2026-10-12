/**
 * Where a "the job asks for X" answer goes: every job on the résumé is a
 * choice ("Position · Employer"), and the default is the job the gap points
 * at — or the first job when it points nowhere usable.
 */
import { describe, expect, it } from "vitest";
import type { ResumeContent } from "@shared/resume";
import type { JobGap } from "@shared/resume-tailor";
import { defaultTarget, gapTargets } from "@/lib/build/review/use-gap-answers";

const CONTENT = {
  basics: { name: "Sean Hogg" },
  work: [
    { id: "item_71f56dfc-9f6b-4423-ba12-13c929c8b781", name: "BuilderForce.ai", position: "Chief Innovation Officer", highlights: [] },
    { id: "5d65aefd-8979-4ad7-8535-822a11b756c9", name: "Alliance Inspection Management", position: "CIO/VP of Technology", highlights: [] },
    { id: "37a37509-086b-4e70-a3f1-e525ec8a215f", name: "", position: "", highlights: [] },
  ],
} as unknown as ResumeContent;

const gap = (anchorPath?: string): JobGap => ({
  id: "G1",
  requirement: "Enterprise system modernization including SaaS ERP/SIS platforms",
  kind: "experience",
  question: "Can you provide specific examples of leading enterprise system modernization?",
  ...(anchorPath ? { anchorPath } : {}),
});

describe("gap answer targets", () => {
  it("lists every job as Position · Employer, with a fallback for an unnamed one", () => {
    expect(gapTargets(CONTENT)).toEqual([
      { path: "work.0", label: "Chief Innovation Officer · BuilderForce.ai" },
      { path: "work.1", label: "CIO/VP of Technology · Alliance Inspection Management" },
      { path: "work.2", label: "#3" },
    ]);
    expect(gapTargets(null)).toEqual([]);
  });

  it("defaults to the job the gap points at, even from a path inside it", () => {
    const targets = gapTargets(CONTENT);
    expect(defaultTarget(gap("work.1"), targets)).toBe("work.1");
    expect(defaultTarget(gap("work.1.highlights.2"), targets)).toBe("work.1");
  });

  it("falls back to the first job when the gap points nowhere usable", () => {
    const targets = gapTargets(CONTENT);
    expect(defaultTarget(gap(), targets)).toBe("work.0");
    expect(defaultTarget(gap("skills.0"), targets)).toBe("work.0");
    expect(defaultTarget(gap("work.9"), targets)).toBe("work.0");
    expect(defaultTarget(gap("work.1"), [])).toBeUndefined();
  });
});
