import { describe, expect, it } from "vitest";
import {
  createContextForType,
  createEnhancedSystemPrompt,
  getConversationalPrompt,
  resolveActiveResumeId,
} from "@/components/ai-chat/chat-prompts";
import { registerResumeDraft, unregisterResumeDraft } from "@/lib/tools/resume-draft-bridge";
import { registerForm, unregisterForm } from "@/lib/tools/active-form-bridge";
import { JOB_CREATE_FORM_ID } from "@/lib/tools/form-ids";

describe("resolveActiveResumeId", () => {
  it("binds the resume from edit and view URLs", () => {
    expect(resolveActiveResumeId("/resumes/edit/7c9e6679-7425-40de-944b-e07fc1f90ae7", undefined)).toBe(
      "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    );
    expect(resolveActiveResumeId("/resumes/seed-resume-002", undefined)).toBe("seed-resume-002");
  });

  it("ignores create routes and non-resume pages without context", () => {
    expect(resolveActiveResumeId("/resumes/new", undefined)).toBeUndefined();
    expect(resolveActiveResumeId("/resumes/create", undefined)).toBeUndefined();
    expect(resolveActiveResumeId("/studio/new", undefined)).toBeUndefined();
  });

  it("binds the résumé draft open in the studio workspace (its id is not in the path)", () => {
    const handle = { resumeId: "seed-resume-002", getContent: () => ({}) as never, commit: () => {} };
    registerResumeDraft(handle);
    try {
      expect(resolveActiveResumeId("/studio/p1", undefined)).toBe("seed-resume-002");
      // A résumé in the path still wins over the open draft.
      expect(resolveActiveResumeId("/resumes/7c9e6679-7425-40de-944b-e07fc1f90ae7", undefined)).toBe(
        "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      );
    } finally {
      unregisterResumeDraft(handle);
    }
    expect(resolveActiveResumeId("/studio/p1", undefined)).toBeUndefined();
  });
});

describe("getConversationalPrompt", () => {
  it("maps known studio actions to natural prompts", () => {
    expect(getConversationalPrompt("add-scene")).toBe("Add a new scene to my video");
  });

  it("falls back to a readable sentence for unknown actions", () => {
    expect(getConversationalPrompt("polish-intro-clip" as never)).toBe("Help me with polish intro clip");
  });
});

describe("createEnhancedSystemPrompt", () => {
  it("adds studio tool guidance for the studio context", () => {
    const ctx = createContextForType("studio", "job_seeker");
    const prompt = createEnhancedSystemPrompt(ctx, undefined, { name: "Ana", role: "job_seeker", plan: "free" });
    expect(prompt).toContain("CURRENT CONTEXT: Studio video editor");
    expect(prompt).toContain("studio_insert_widget");
  });
});

describe("job-draft guidance in the studio (#1915)", () => {
  const studio = () => createContextForType("studio");

  it("a job posting open in the studio gets the apply_job_draft guidance + its values", () => {
    registerForm({ formId: JOB_CREATE_FORM_ID, getValues: () => ({}), setValue: () => {}, writableFields: ["title"] });
    try {
      const prompt = createEnhancedSystemPrompt({
        ...studio(),
        formSnapshot: { title: "Staff Product Manager", description: "" },
      });
      expect(prompt).toContain("Job posting in the Studio");
      expect(prompt).toContain("apply_job_draft");
      expect(prompt).toContain("Staff Product Manager");
    } finally {
      unregisterForm(JOB_CREATE_FORM_ID);
    }
  });

  it("any other studio document gets no job guidance", () => {
    expect(createEnhancedSystemPrompt(studio())).not.toContain("Job posting in the Studio");
  });
});
