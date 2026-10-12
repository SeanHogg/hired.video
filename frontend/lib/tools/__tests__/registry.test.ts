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
    getUserResumes: vi.fn(async () => []),
    updateResumeData: vi.fn(),
  },
}));

vi.mock("@/lib/services/auth-service", () => ({
  authService: {
    getCurrentUser: vi.fn(async () => ({
      id: "u1",
      email: "a@b.c",
      firstName: "Ada",
      lastName: "Lovelace",
      role: "job_seeker",
      headline: "Engineer",
      createdAt: "",
      updatedAt: "",
    })),
  },
}));

vi.mock("@/lib/services/studio-service", () => ({
  studioService: {
    saveDraft: vi.fn(async () => ({ data: { id: "proj-1" } })),
  },
}));

import { resumeService } from "@/lib/services/resume-service";
import { studioService } from "@/lib/services/studio-service";
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
import {
  registerStudioEditor,
  unregisterStudioEditor,
  type StudioEditorHandle,
} from "@/lib/studio/editor-v2/studio-editor-bridge";
import type { NormalizedToolRunResult } from "../types";

function stubStudioEditor(
  mediaKind: string,
  extras?: Partial<StudioEditorHandle>,
): StudioEditorHandle {
  return {
    projectId: "p1",
    mediaKind,
    supportsScenes: extras?.supportsScenes ?? true,
    supportsRecording: extras?.supportsRecording ?? true,
    getActiveSceneId: () => "s1",
    listScenes: () => [],
    insertableWidgetKinds: () => [],
    insertWidget: () => {},
    addScene: () => "s2",
    duplicateScene: () => {},
    deleteScene: () => {},
    reorderScenes: () => {},
    setActiveScene: () => {},
    setSceneBackground: () => {},
    addImageWidget: () => {},
    addVideoWidget: () => {},
    captureScreenshot: () => {},
    openRecorder: () => {},
    ...extras,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// getCoachToolSpecs — exposed-to-LLM view of the registry
// ═══════════════════════════════════════════════════════════════════════════

describe("getCoachToolSpecs", () => {
  it("emits one entry per tool that declares a `parameters` schema", () => {
    const specs = getCoachToolSpecs();
    // getCoachToolSpecs applies two self-gates we must mirror or the
    // expectation drifts the moment a gated tool is added:
    //   • `requiresSuperAdmin` — default view is non-SA, so SA tools are out.
    //   • `requiresStudioEditor` — only exposed when a CanvasState-authoring
    //     Studio editor is mounted; no editor is mounted in this unit test,
    //     so those tools (record / insert-widget / add-scene, etc.) are out.
    const expectedNames = toolRegistry
      .filter((t) => t.parameters)
      .filter((t) => !t.requiresSuperAdmin)
      .filter((t) => !t.requiresStudioEditor)
      // `requiresActiveForm` — only while that form is registered; none is.
      .filter((t) => !t.requiresActiveForm)
      .map((t) => t.id)
      .sort();
    const actualNames = specs.map((s) => s.function.name).sort();
    expect(actualNames).toEqual(expectedNames);
    // Sanity: at least the read-only scorer + a mutation tool are present.
    expect(actualNames).toContain("ai-resume-scorer");
    expect(actualNames).toContain("apply_resume_rewrite");
  });

  it("exposes apply_job_draft only while a job posting form is open (#1915)", () => {
    expect(getCoachToolSpecs().map((s) => s.function.name)).not.toContain("apply_job_draft");
    registerForm({ formId: JOB_CREATE_FORM_ID, getValues: () => ({}), setValue: () => {}, writableFields: ["title"] });
    try {
      expect(getCoachToolSpecs().map((s) => s.function.name)).toContain("apply_job_draft");
    } finally {
      unregisterForm(JOB_CREATE_FORM_ID);
    }
  });

  it("gates SuperAdmin-only tools out of the default view but exposes them under { superAdmin: true }", () => {
    const saTools = toolRegistry
      .filter((t) => t.parameters && t.requiresSuperAdmin)
      .map((t) => t.id);
    // Precondition: there is at least one SA-gated tool to assert against.
    expect(saTools.length).toBeGreaterThan(0);

    const defaultNames = getCoachToolSpecs().map((s) => s.function.name);
    const saNames = getCoachToolSpecs({ superAdmin: true }).map((s) => s.function.name);
    for (const id of saTools) {
      expect(defaultNames).not.toContain(id);
      expect(saNames).toContain(id);
    }
  });

  it("exposes exactly the tools that declare a `parameters` schema", () => {
    // A page-only / wizard tool (no schema) can't be run headless, so the
    // LLM mustn't be told it can call it — the rule is the schema, not a list.
    const names = new Set(getCoachToolSpecs({ superAdmin: true }).map((s) => s.function.name));
    for (const tool of toolRegistry) {
      if (!tool.parameters) expect(names.has(tool.id)).toBe(false);
    }
    // Value Proposition became a one-call tool (2026-10-04) — the AI runs it on the kit workspace.
    expect(names.has("value-proposition")).toBe(true);
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

  describe("studio_* tools vs media kind (#1911)", () => {
    afterEach(() => {
      unregisterStudioEditor();
    });

    it("exposes studio_* tools for a timeline/canvas-authoring editor (video)", () => {
      registerStudioEditor(stubStudioEditor("video", { supportsScenes: true, supportsRecording: true }));
      const names = getCoachToolSpecs().map((s) => s.function.name);
      expect(names).toContain("studio_start_recording");
      expect(names).toContain("studio_list_scenes");
      expect(names).toContain("studio_insert_widget");
    });

    it("hides studio_* tools for a game editor even though a handle is mounted", () => {
      registerStudioEditor(stubStudioEditor("game", { supportsScenes: false, supportsRecording: false }));
      const names = getCoachToolSpecs().map((s) => s.function.name);
      expect(names).not.toContain("studio_start_recording");
      expect(names).not.toContain("studio_list_scenes");
      expect(names).not.toContain("studio_insert_widget");
      expect(names).not.toContain("studio_add_image");
    });

    it("hides studio_* tools for an image editor", () => {
      registerStudioEditor(stubStudioEditor("image", { supportsScenes: false, supportsRecording: false }));
      const names = getCoachToolSpecs().map((s) => s.function.name);
      expect(names.filter((n) => n.startsWith("studio_"))).toEqual([]);
    });

    it("studio_start_recording auto-starts the live preview (#3090)", async () => {
      const openRecorder = vi.fn();
      registerStudioEditor(
        stubStudioEditor("video", { openRecorder, supportsRecording: true }),
      );
      const tool = getTool("studio_start_recording")!;
      const result = await tool.run({ bound: {}, args: { mode: "webcam" } });
      expect(openRecorder).toHaveBeenCalledWith("webcam", {
        asScene: true,
        autoStart: true,
      });
      expect(result.raw).toEqual({ kind: "studio_start_recording", mode: "webcam" });
    });

    it("studio_start_recording defaults to screen when mode is omitted", async () => {
      const openRecorder = vi.fn();
      registerStudioEditor(
        stubStudioEditor("video", { openRecorder, supportsRecording: true }),
      );
      await getTool("studio_start_recording")!.run({ bound: {}, args: {} });
      expect(openRecorder).toHaveBeenCalledWith("screen", {
        asScene: true,
        autoStart: true,
      });
    });
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
      bound: { resumeId: "r1" },
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
      tool.run({ bound: {}, args: { original: "a", improved: "b" } }),
    ).rejects.toThrow(/active resume/i);
  });

  it("apply_resume_rewrite throws when args are missing required fields", async () => {
    const tool = getTool("apply_resume_rewrite")!;
    await expect(tool.run({ bound: { resumeId: "r1" }, args: {} })).rejects.toThrow(/original.*improved/);
  });

  it("update_resume_summary stages a pending mutation pointing at basics.summary", async () => {
    const tool = getTool("update_resume_summary")!;
    const result = await tool.run({
      bound: { resumeId: "r1" },
      args: { summary: "A new summary." },
    });
    expect(result.mutation).toEqual({ status: "pending", location: "basics.summary" });
    expect(result.previewText).toBe("A new summary.");
  });

  it("add_resume_skill stages a pending mutation pointing at skills", async () => {
    const tool = getTool("add_resume_skill")!;
    const result = await tool.run({
      bound: { resumeId: "r1" },
      args: { name: "TypeScript", level: "Expert" },
    });
    expect(result.mutation).toEqual({ status: "pending", location: "skills" });
    expect(result.previewText).toBe("TypeScript");
    expect(result.summary).toMatch(/Expert/);
  });

  it("add_resume_skill works when level is omitted", async () => {
    const tool = getTool("add_resume_skill")!;
    const result = await tool.run({
      bound: { resumeId: "r1" },
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
      bound: {},
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
      bound: {},
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
    await expect(tool.run({ bound: {}, args: {} })).rejects.toThrow(/at least one field/);
  });

  it("rejects a run when no form is mounted (the page isn't open)", async () => {
    unregisterForm(JOB_CREATE_FORM_ID);
    const tool = getTool("apply_job_draft")!;
    await expect(
      tool.run({ bound: {}, args: { title: "x" } }),
    ).rejects.toThrow(/No active form/);
  });

  it("commit fails clearly when the form unmounted between Run and Apply", async () => {
    const tool = getTool("apply_job_draft")!;
    const staged = await tool.run({ bound: {}, args: { title: "x" } });
    unregisterForm(JOB_CREATE_FORM_ID);

    const out = await commitMutation(staged);
    expect(out.mutation?.status).toBe("failed");
    expect(out.summary).toMatch(/No active form/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// generate_video_from_template — CHRO entry point into the V2 Studio
// ═══════════════════════════════════════════════════════════════════════════

describe("generate_video_from_template", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects when templateId is missing or not a known template id", async () => {
    const tool = getTool("generate_video_from_template")!;
    await expect(tool.run({ bound: {}, args: {} })).rejects.toThrow(/templateId/);
    await expect(
      tool.run({ bound: {}, args: { templateId: "not-a-real-template" } }),
    ).rejects.toThrow(/templateId/);
  });

  it("stages a pending mutation with the hydrated canvas — no saveDraft yet", async () => {
    const tool = getTool("generate_video_from_template")!;
    const result = await tool.run({
      bound: {},
      args: { templateId: "profile" },
    });
    expect(result.mutation?.status).toBe("pending");
    const raw = result.raw as Record<string, unknown>;
    expect(raw.kind).toBe("generate_video_from_template");
    expect(raw.templateId).toBe("profile");
    expect(raw.hydrated).toBeDefined();
    // Critical: saveDraft is commitMutation's job, not run()'s.
    expect(studioService.saveDraft).not.toHaveBeenCalled();
  });

  it("commit persists a draft + returns redirectUrl pointing at the new project", async () => {
    const tool = getTool("generate_video_from_template")!;
    const staged = await tool.run({
      bound: {},
      args: { templateId: "resume", name: "My Story" },
    });
    const out = await commitMutation(staged);
    expect(out.mutation?.status).toBe("applied");
    expect(out.redirectUrl).toBe("/studio/proj-1");
    expect(studioService.saveDraft).toHaveBeenCalledTimes(1);
    const arg = (studioService.saveDraft as any).mock.calls[0][0];
    expect(arg.kind).toBe("nle");
    expect(arg.name).toBe("My Story");
    expect(arg.timelineSpec).toBeDefined();
  });
});
