/**
 * Tests for the AI-coach pieces of the tool registry:
 *   • `getCoachToolSpecs()` — single source of truth for what the LLM
 *     sees as callable tools. Adding a tool to the registry should expose
 *     it for free; tools without a `parameters` schema (e.g. multi-step
 *     wizards like Value Proposition) should NOT leak in.
 *   • Mutation runners — must STAGE the change as `mutation: pending`
 *     without persisting; `commitMutation` is the one path that actually
 *     writes. Keeps the per-mutation Apply UX honest.
 *   • `commitMutation` dispatch table — routes by `raw.kind` and writes
 *     the right field for each kind. Easy to break when a new mutation
 *     tool is added without wiring its kind here.
 *
 * Run: vitest run lib/tools/__tests__/registry.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/services/resume-service", () => ({
  resumeService: {
    getResumeById: vi.fn(),
    updateResumeData: vi.fn(),
  },
}));

import { resumeService } from "@/lib/services/resume-service";
import {
  toolRegistry,
  getCoachToolSpecs,
  getTool,
  commitMutation,
  JOB_CREATE_FORM_ID,
} from "../registry";
import {
  registerForm,
  unregisterForm,
} from "../active-form-bridge";
import type { NormalizedToolRunResult } from "../types";

// ═══════════════════════════════════════════════════════════════════════════
// getCoachToolSpecs — exposed-to-LLM view of the registry
// ═══════════════════════════════════════════════════════════════════════════

describe("getCoachToolSpecs", () => {
  it("emits one entry per tool that declares a `parameters` schema", () => {
    const specs = getCoachToolSpecs();
    const expectedNames = toolRegistry
      .filter((t) => t.parameters)
      .map((t) => t.id)
      .sort();
    const actualNames = specs.map((s) => s.function.name).sort();
    expect(actualNames).toEqual(expectedNames);
    // Sanity: at least the read-only scorer + a mutation tool are present.
    expect(actualNames).toContain("ai-resume-scorer");
    expect(actualNames).toContain("apply_resume_rewrite");
  });

  it("excludes tools without a `parameters` schema (page-only / wizard tools)", () => {
    // value-proposition is a multi-step wizard. The user's spec is "the
    // coach has access to all the tools" — but a wizard's run() throws
    // when invoked headless, so the LLM mustn't be told it can call it.
    const names = getCoachToolSpecs().map((s) => s.function.name);
    expect(names).not.toContain("value-proposition");
  });

  it("forwards the description verbatim — the LLM relies on it", () => {
    const spec = getCoachToolSpecs().find((s) => s.function.name === "apply_resume_rewrite");
    expect(spec).toBeDefined();
    const tool = getTool("apply_resume_rewrite")!;
    expect(spec!.function.description).toBe(tool.description);
  });

  it("emits `type: 'function'` and a JSON-schema parameters block per spec", () => {
    for (const s of getCoachToolSpecs()) {
      expect(s.type).toBe("function");
      expect(s.function.parameters.type).toBe("object");
      expect(typeof s.function.parameters.properties).toBe("object");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Mutation runners stage rather than persist
// ═══════════════════════════════════════════════════════════════════════════

describe("mutation tool runners", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("apply_resume_rewrite stages a pending mutation without calling the API", async () => {
    const tool = getTool("apply_resume_rewrite")!;
    const result = await tool.run({
      resumeId: "r1",
      args: { original: "old bullet", improved: "new bullet" },
    });

    expect(result.mutation).toEqual({ status: "pending" });
    expect(result.previewText).toContain("old bullet");
    expect(result.previewText).toContain("new bullet");
    // Critical: nothing was persisted yet — that's commitMutation's job.
    expect(resumeService.updateResumeData).not.toHaveBeenCalled();
  });

  it("apply_resume_rewrite throws when no resumeId is bound", async () => {
    const tool = getTool("apply_resume_rewrite")!;
    await expect(
      tool.run({ args: { original: "a", improved: "b" } }),
    ).rejects.toThrow(/active resume/i);
  });

  it("apply_resume_rewrite throws when args are missing required fields", async () => {
    const tool = getTool("apply_resume_rewrite")!;
    await expect(tool.run({ resumeId: "r1", args: {} })).rejects.toThrow(/original.*improved/);
  });

  it("update_resume_summary stages a pending mutation pointing at basics.summary", async () => {
    const tool = getTool("update_resume_summary")!;
    const result = await tool.run({
      resumeId: "r1",
      args: { summary: "A new summary." },
    });
    expect(result.mutation).toEqual({ status: "pending", location: "basics.summary" });
    expect(result.previewText).toBe("A new summary.");
  });

  it("add_resume_skill stages a pending mutation pointing at skills", async () => {
    const tool = getTool("add_resume_skill")!;
    const result = await tool.run({
      resumeId: "r1",
      args: { name: "TypeScript", level: "Expert" },
    });
    expect(result.mutation).toEqual({ status: "pending", location: "skills" });
    expect(result.previewText).toBe("TypeScript");
    expect(result.summary).toMatch(/Expert/);
  });

  it("add_resume_skill works when level is omitted", async () => {
    const tool = getTool("add_resume_skill")!;
    const result = await tool.run({
      resumeId: "r1",
      args: { name: "TypeScript" },
    });
    expect(result.mutation?.status).toBe("pending");
    expect(result.summary).not.toMatch(/\(.*\)/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// commitMutation — the one path that actually writes
// ═══════════════════════════════════════════════════════════════════════════

describe("commitMutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("apply_resume_rewrite kind: writes the matching slot via resumeService", async () => {
    (resumeService.getResumeById as any).mockResolvedValue({
      content: {
        work: [{ name: "Acme", highlights: ["Shipped onboarding redesign"] }],
      },
    });
    (resumeService.updateResumeData as any).mockResolvedValue({});

    const pending: NormalizedToolRunResult = {
      summary: "rewrite proposed",
      mutation: { status: "pending" },
      raw: {
        kind: "apply_resume_rewrite",
        resumeId: "r1",
        original: "Shipped onboarding redesign",
        improved: "REWRITTEN",
      },
    };
    const out = await commitMutation(pending);

    expect(out.mutation?.status).toBe("applied");
    expect(out.mutation?.location).toBe("work[0].highlights[0]");
    const [, payload] = (resumeService.updateResumeData as any).mock.calls[0];
    expect(payload.data.work[0].highlights[0]).toBe("REWRITTEN");
  });

  it("apply_resume_rewrite kind: surfaces a friendly summary on no_match", async () => {
    (resumeService.getResumeById as any).mockResolvedValue({
      content: { work: [{ name: "Acme", highlights: ["a totally different bullet"] }] },
    });

    const out = await commitMutation({
      mutation: { status: "pending" },
      raw: {
        kind: "apply_resume_rewrite",
        resumeId: "r1",
        original: "Shipped onboarding redesign",
        improved: "x",
      },
    });

    expect(out.mutation?.status).toBe("failed");
    // The "couldn't find that bullet" message has to read as a *user*
    // explanation, not a stack trace. Pin the phrasing.
    expect(out.summary).toMatch(/couldn't find that bullet/i);
  });

  it("update_resume_summary kind: writes basics.summary and preserves other basics fields", async () => {
    (resumeService.getResumeById as any).mockResolvedValue({
      content: {
        basics: {
          name: "Sam",
          label: "Engineer",
          image: "img.png",
          email: "s@x",
          phone: "555",
          url: "u",
          summary: "OLD",
        },
      },
    });
    (resumeService.updateResumeData as any).mockResolvedValue({});

    const out = await commitMutation({
      mutation: { status: "pending", location: "basics.summary" },
      raw: { kind: "update_resume_summary", resumeId: "r1", summary: "NEW" },
    });

    expect(out.mutation?.status).toBe("applied");
    const [, payload] = (resumeService.updateResumeData as any).mock.calls[0];
    expect(payload.data.basics.summary).toBe("NEW");
    expect(payload.data.basics.name).toBe("Sam"); // other fields preserved
  });

  it("update_resume_summary kind: seeds an empty basics block when none exists", async () => {
    (resumeService.getResumeById as any).mockResolvedValue({ content: {} });
    (resumeService.updateResumeData as any).mockResolvedValue({});

    const out = await commitMutation({
      mutation: { status: "pending" },
      raw: { kind: "update_resume_summary", resumeId: "r1", summary: "NEW" },
    });

    expect(out.mutation?.status).toBe("applied");
    const [, payload] = (resumeService.updateResumeData as any).mock.calls[0];
    expect(payload.data.basics.summary).toBe("NEW");
  });

  it("add_resume_skill kind: appends a new skill", async () => {
    (resumeService.getResumeById as any).mockResolvedValue({
      content: { skills: [{ name: "React", level: "", keywords: [] }] },
    });
    (resumeService.updateResumeData as any).mockResolvedValue({});

    const out = await commitMutation({
      mutation: { status: "pending", location: "skills" },
      raw: { kind: "add_resume_skill", resumeId: "r1", name: "TypeScript", level: "Expert" },
    });

    expect(out.mutation?.status).toBe("applied");
    const [, payload] = (resumeService.updateResumeData as any).mock.calls[0];
    expect(payload.data.skills).toHaveLength(2);
    expect(payload.data.skills[1]).toMatchObject({ name: "TypeScript", level: "Expert" });
  });

  it("add_resume_skill kind: skips duplicates (case-insensitive name match)", async () => {
    // Idempotency matters because the LLM can re-call the same tool on a
    // followup turn — duplicate skills shouldn't pile up.
    (resumeService.getResumeById as any).mockResolvedValue({
      content: { skills: [{ name: "TypeScript", level: "", keywords: [] }] },
    });
    (resumeService.updateResumeData as any).mockResolvedValue({});

    const out = await commitMutation({
      mutation: { status: "pending" },
      raw: { kind: "add_resume_skill", resumeId: "r1", name: "typescript" },
    });

    expect(out.mutation?.status).toBe("applied");
    expect(resumeService.updateResumeData).not.toHaveBeenCalled();
  });

  it("invalidates resume + resumes cache keys on success when a queryClient is supplied", async () => {
    (resumeService.getResumeById as any).mockResolvedValue({
      content: { basics: { summary: "OLD", name: "", label: "", image: "", email: "", phone: "", url: "" } },
    });
    (resumeService.updateResumeData as any).mockResolvedValue({});
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);

    await commitMutation(
      {
        mutation: { status: "pending" },
        raw: { kind: "update_resume_summary", resumeId: "r1", summary: "NEW" },
      },
      { invalidateQueries } as any,
    );

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["resume", "r1"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["resumes"] });
  });

  it("returns mutation: failed with an error summary when the API call throws", async () => {
    (resumeService.getResumeById as any).mockResolvedValue({
      content: { basics: { summary: "OLD", name: "", label: "", image: "", email: "", phone: "", url: "" } },
    });
    (resumeService.updateResumeData as any).mockRejectedValue(new Error("503"));

    const out = await commitMutation({
      mutation: { status: "pending" },
      raw: { kind: "update_resume_summary", resumeId: "r1", summary: "NEW" },
    });

    expect(out.mutation?.status).toBe("failed");
    expect(out.summary).toContain("503");
  });

  it("returns mutation: failed with a clear message for an unknown kind", async () => {
    // Guard against silently swallowing a typo in `raw.kind` — that
    // would look like the apply succeeded but nothing was written.
    const out = await commitMutation({
      mutation: { status: "pending" },
      raw: { kind: "made_up_kind" as any, resumeId: "r1" },
    });
    expect(out.mutation?.status).toBe("failed");
    expect(out.summary).toMatch(/Unknown mutation kind/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// apply_job_draft — writes through the active-form bridge, not the API
// ═══════════════════════════════════════════════════════════════════════════

describe("apply_job_draft", () => {
  let setValueCalls: Array<[string, unknown]>;

  beforeEach(() => {
    setValueCalls = [];
    registerForm({
      formId: JOB_CREATE_FORM_ID,
      getValues: () => ({}),
      setValue: (field, value) => {
        setValueCalls.push([field, value]);
      },
      writableFields: [
        "title",
        "description",
        "company",
        "location",
        "responsibilities",
        "requirements",
        "employmentType",
        "seniority",
        "workSetting",
        "salaryMin",
        "salaryMax",
        "currency",
      ],
    });
  });

  afterEach(() => {
    unregisterForm(JOB_CREATE_FORM_ID);
  });

  it("stages a pending mutation and does NOT call setValue at run time", async () => {
    const tool = getTool("apply_job_draft")!;
    const result = await tool.run({
      args: { title: "Senior AI Engineer", description: "Build cool stuff." },
    });
    expect(result.mutation?.status).toBe("pending");
    expect(result.previewText).toContain("Senior AI Engineer");
    expect(result.previewText).toContain("Build cool stuff.");
    // Critical: setValue runs only on commit (Apply click), not on run.
    expect(setValueCalls).toEqual([]);
  });

  it("writes every provided field on commit, in registration order", async () => {
    const tool = getTool("apply_job_draft")!;
    const staged = await tool.run({
      args: {
        title: "Senior AI Engineer",
        description: "Long description.",
        employmentType: ["FullTime"],
        seniority: ["Senior"],
        workSetting: "Remote",
      },
    });

    const out = await commitMutation(staged);

    expect(out.mutation?.status).toBe("applied");
    const written = Object.fromEntries(setValueCalls);
    expect(written.title).toBe("Senior AI Engineer");
    expect(written.description).toBe("Long description.");
    expect(written.employmentType).toEqual(["FullTime"]);
    expect(written.seniority).toEqual(["Senior"]);
    expect(written.workSetting).toBe("Remote");
  });

  it("rejects a run when no field is supplied", async () => {
    const tool = getTool("apply_job_draft")!;
    await expect(tool.run({ args: {} })).rejects.toThrow(/at least one field/);
  });

  it("rejects a run when no form is mounted (the page isn't open)", async () => {
    unregisterForm(JOB_CREATE_FORM_ID);
    const tool = getTool("apply_job_draft")!;
    await expect(
      tool.run({ args: { title: "x" } }),
    ).rejects.toThrow(/No active form/);
  });

  it("commit fails clearly when the form unmounted between Run and Apply", async () => {
    const tool = getTool("apply_job_draft")!;
    const staged = await tool.run({ args: { title: "x" } });
    unregisterForm(JOB_CREATE_FORM_ID);

    const out = await commitMutation(staged);
    expect(out.mutation?.status).toBe("failed");
    expect(out.summary).toMatch(/No active form/);
  });
});
