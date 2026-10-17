import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResumeContent } from "@shared/resume";
import { readVideoPlan } from "@shared/video-plan";

vi.mock("@/lib/services/resume-service", () => ({
  resumeService: { getResumeById: vi.fn(), updateResumeData: vi.fn() },
}));
vi.mock("@/lib/api-client", () => ({ apiClient: { post: vi.fn(), get: vi.fn() } }));

import { apiClient } from "@/lib/api-client";
import { commitJourneyMutation, journeyTools } from "@/lib/tools/journey-tools";
import { getCoachToolSpecs, getTool } from "@/lib/tools/registry";
import { registerResumeDraft, unregisterResumeDraft, type ResumeDraftHandle } from "@/lib/tools/resume-draft-bridge";

const RESUME_ID = "seed-resume-002";

function draftWith(plan: unknown): ResumeContent {
  return {
    basics: { name: "Sean Hogg", label: "Director Engineering", summary: "Technology executive." },
    work: [{ name: "AiM", position: "VP of Technology", highlights: ["Cut IT cost 20% ($1.79M)."] }],
    meta: { video: plan },
  } as unknown as ResumeContent;
}

function openDraft(content: ResumeContent) {
  let current = content;
  const commit = vi.fn((next: ResumeContent, _label: string) => {
    current = next;
  });
  const handle: ResumeDraftHandle = { resumeId: RESUME_ID, getContent: () => current, commit };
  registerResumeDraft(handle);
  return { handle, commit, read: () => current };
}

const editScene = getTool("edit_resume_video_scene")!;

describe("edit_resume_video_scene", () => {
  let open: ReturnType<typeof openDraft> | null = null;
  beforeEach(() => {
    if (open) unregisterResumeDraft(open.handle);
    open = null;
    vi.clearAllMocks();
  });

  it("is exposed to the AI as a mutating tool", () => {
    expect(editScene.mutates).toBe(true);
    expect(getCoachToolSpecs().some((s) => s.function.name === "edit_resume_video_scene")).toBe(true);
  });

  it("previews, then applies the wording to the open draft's video plan as one step", async () => {
    open = openDraft(draftWith({}));
    const result = await editScene.run({
      bound: { resumeId: RESUME_ID },
      args: { sceneId: "hook", title: "I cut IT cost 20% at AiM.", voiceover: "Twenty years in, here's what I fix." },
    });
    expect(result.mutation?.status).toBe("pending");
    expect(result.previewText).toContain("Title: I cut IT cost 20% at AiM.");
    expect(open.commit).not.toHaveBeenCalled();

    const applied = await commitJourneyMutation(result);
    expect(applied?.mutation?.status).toBe("applied");
    expect(open.commit).toHaveBeenCalledTimes(1);
    expect(open.commit.mock.calls[0][1]).toBe("ai:video");
    expect(readVideoPlan(open.read()).scenes?.hook).toEqual({
      title: "I cut IT cost 20% at AiM.",
      voiceover: "Twenty years in, here's what I fix.",
    });
  });

  it("editing a hidden scene's wording keeps it hidden", async () => {
    open = openDraft(draftWith({ scenes: { skills: { off: true } } }));
    const result = await editScene.run({ bound: { resumeId: RESUME_ID }, args: { sceneId: "skills", title: "Cloud cost, delivery, teams" } });
    await commitJourneyMutation(result);
    expect(readVideoPlan(open.read()).scenes?.skills).toEqual({ off: true, title: "Cloud cost, delivery, teams" });
  });

  it("turns a scene back on with on: true", async () => {
    open = openDraft(draftWith({ scenes: { skills: { off: true } } }));
    await commitJourneyMutation(await editScene.run({ bound: { resumeId: RESUME_ID }, args: { sceneId: "skills", on: true } }));
    expect(readVideoPlan(open.read()).scenes?.skills).toBeUndefined();
  });

  it("refuses to leave the video with no scenes", async () => {
    open = openDraft(draftWith({ scenes: { hook: { off: true }, who: { off: true }, proof: { off: true }, skills: { off: true } } }));
    await expect(editScene.run({ bound: { resumeId: RESUME_ID }, args: { sceneId: "next", on: false } })).rejects.toThrow(
      /at least one scene/,
    );
  });

  it("rejects an unknown scene and wording too long for the frame", async () => {
    open = openDraft(draftWith({}));
    await expect(editScene.run({ bound: { resumeId: RESUME_ID }, args: { sceneId: "outro", title: "x" } })).rejects.toThrow(/sceneId/);
    await expect(
      editScene.run({ bound: { resumeId: RESUME_ID }, args: { sceneId: "hook", lines: ["a", "b", "c", "d"] } }),
    ).rejects.toThrow(/doesn't fit/);
  });

  it("leaves other tools' results to the registry", async () => {
    expect(await commitJourneyMutation({ raw: { kind: "update_resume_summary" } })).toBeNull();
  });
});

describe("read-only journey tools", () => {
  beforeEach(() => vi.clearAllMocks());

  it("roasts the open draft's text, not the stored row", async () => {
    const open = openDraft(draftWith({}));
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        score: 62,
        strengths: ["Numbers"],
        weaknesses: ["Generic summary"],
        roast: "Reads like a LinkedIn bio.",
        fixes: ["Lead with the $1.79M"],
        improvedExamples: [{ original: "Technology executive.", improved: "Cut IT cost 20% while lifting delivery." }],
      },
    });
    try {
      const out = await getTool("resume-roast")!.run({ bound: { resumeId: RESUME_ID }, args: {} });
      const [url, body] = (apiClient.post as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toBe("/api/resumes/roast");
      expect(body.resumeText).toContain("Cut IT cost 20% ($1.79M).");
      expect(out.overallScore).toBe(62);
      expect(out.recommendations).toEqual([
        { title: "Lead with the $1.79M" },
        { title: "Cut IT cost 20% while lifting delivery.", description: "Technology executive." },
      ]);
    } finally {
      unregisterResumeDraft(open.handle);
    }
  });

  it("asks for a company or role before researching", async () => {
    await expect(getTool("employer-research")!.run({ bound: {}, args: {} })).rejects.toThrow(/company name or a role/);
  });

  it("every journey tool has a schema the AI can call", () => {
    for (const tool of journeyTools) expect(tool.parameters?.type).toBe("object");
  });
});
