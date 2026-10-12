import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResumeContent } from "@shared/resume";

vi.mock("@/lib/services/resume-service", () => ({
  resumeService: { getResumeById: vi.fn(), updateResumeData: vi.fn() },
}));

import { resumeService } from "@/lib/services/resume-service";
import { readResumeContent, writeResumeContent } from "@/lib/tools/resume-content";
import { registerResumeDraft, unregisterResumeDraft, type ResumeDraftHandle } from "@/lib/tools/resume-draft-bridge";

const stored = (): ResumeContent =>
  ({ basics: { name: "Sean Hogg", summary: "Stored summary." }, skills: [{ name: "Agile", level: "", keywords: [] }] }) as unknown as ResumeContent;

describe("résumé content port", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads and writes the stored row when no draft is open, refreshing the caches", async () => {
    (resumeService.getResumeById as ReturnType<typeof vi.fn>).mockResolvedValue({ content: stored() });
    (resumeService.updateResumeData as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);

    const wrote = await writeResumeContent(
      "seed-resume-002",
      (c) => ({ ...c, basics: { ...c.basics!, summary: "New." } }),
      "ai:summary",
      { invalidateQueries } as never,
    );

    expect(wrote).toBe(true);
    const [id, payload] = (resumeService.updateResumeData as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(id).toBe("seed-resume-002");
    expect(payload.data.basics.summary).toBe("New.");
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["resume", "seed-resume-002"] });
  });

  it("reads and edits the open kit draft instead of the server", async () => {
    const draft = stored();
    const commit = vi.fn();
    const handle: ResumeDraftHandle = { resumeId: "7c9e6679-7425-40de-944b-e07fc1f90ae7", getContent: () => draft, commit };
    registerResumeDraft(handle);
    try {
      expect(await readResumeContent(handle.resumeId)).toBe(draft);
      await writeResumeContent(handle.resumeId, (c) => ({ ...c, skills: [...(c.skills ?? []), { name: "Snowflake", level: "", keywords: [] }] }), "ai:skill");
      expect(commit).toHaveBeenCalledTimes(1);
      expect(commit.mock.calls[0][0].skills.map((s: { name: string }) => s.name)).toEqual(["Agile", "Snowflake"]);
      expect(commit.mock.calls[0][1]).toBe("ai:skill");
      expect(resumeService.getResumeById).not.toHaveBeenCalled();
      expect(resumeService.updateResumeData).not.toHaveBeenCalled();
    } finally {
      unregisterResumeDraft(handle);
    }
  });

  it("writes nothing when the update reports no change", async () => {
    (resumeService.getResumeById as ReturnType<typeof vi.fn>).mockResolvedValue({ content: stored() });
    expect(await writeResumeContent("r1", () => null, "ai:skill")).toBe(false);
    expect(resumeService.updateResumeData).not.toHaveBeenCalled();
  });

  it("fails clearly when the résumé has no content", async () => {
    (resumeService.getResumeById as ReturnType<typeof vi.fn>).mockResolvedValue({ content: undefined });
    await expect(writeResumeContent("r1", (c) => c, "ai:x")).rejects.toThrow(/unavailable/i);
  });

  it("a late unmount never clears a newer draft", () => {
    const a: ResumeDraftHandle = { resumeId: "a", getContent: stored, commit: vi.fn() };
    const b: ResumeDraftHandle = { resumeId: "b", getContent: stored, commit: vi.fn() };
    registerResumeDraft(a);
    registerResumeDraft(b);
    unregisterResumeDraft(a);
    // Still b — and an id filter only matches the open draft.
    return readResumeContent("b").then((c) => {
      expect(c).toEqual(stored());
      unregisterResumeDraft(b);
    });
  });
});
