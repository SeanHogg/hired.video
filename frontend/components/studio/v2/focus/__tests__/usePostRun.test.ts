/**
 * usePostRun — a failed save / render fails every destination with its
 * reason (never stuck on "Preparing"); a destination's error message is kept;
 * and the run reports itself to the diagnostics report (`postRun`).
 */
import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { readDiagnosticsSections } from "@/lib/diagnostics/diagnostics-sections";
import type { StudioProject } from "@/lib/services/studio-service";
import { usePostRun } from "../usePostRun";

const PROJECT = {
  id: "9ff4634c-a0af-41ba-90b5-1a152aa0c477",
  status: "published",
  videoUrl: "https://media.hired.video/studio/9ff4634c/master.mp4",
} as unknown as StudioProject;

describe("usePostRun", () => {
  it("fails every destination with the reason when the render fails", async () => {
    const { result } = renderHook(() => usePostRun());
    let outcomes: Awaited<ReturnType<typeof result.current.run>> = {};
    await act(async () => {
      outcomes = await result.current.run({
        channels: ["linkedin", "youtube"],
        prepare: () => Promise.reject(new Error("Render failed: out of memory")),
        postOne: () => Promise.resolve({ ok: true, url: null }),
      });
    });
    expect(result.current.progress.phase).toBe("done");
    expect(result.current.progress.channels.youtube).toEqual({
      state: "done",
      outcome: { ok: false, url: null, reason: "failed", message: "Render failed: out of memory" },
    });
    expect(outcomes.linkedin?.message).toBe("Render failed: out of memory");
    const trace = readDiagnosticsSections().postRun as { phases: Array<{ phase: string; detail?: string }> };
    expect(trace.phases.map((p) => p.phase)).toEqual(["preparing", "prepare-failed"]);
  });

  it("keeps a destination's error message and reports who is still waiting", async () => {
    const { result } = renderHook(() => usePostRun());
    let releaseYouTube: (v: { ok: boolean; url: string | null }) => void = () => {};
    let running: Promise<unknown> = Promise.resolve();
    await act(async () => {
      running = result.current.run({
        channels: ["profile", "linkedin", "youtube"],
        prepare: () => Promise.resolve(PROJECT),
        postOne: (channel) => {
          if (channel === "linkedin") return Promise.reject(new Error("LinkedIn rejected the video"));
          if (channel === "youtube") return new Promise((resolve) => (releaseYouTube = resolve));
          return Promise.resolve({ ok: true, url: "/v/sean-hogg" });
        },
      });
      await Promise.resolve();
    });
    const report = readDiagnosticsSections().postRun as {
      phase: string;
      projectId: string;
      videoUrl: string;
      destinations: Record<string, { state: string; outcome?: { message?: string }; waitingSec: number | null }>;
    };
    expect(report.phase).toBe("posting");
    expect(report.projectId).toBe(PROJECT.id);
    expect(report.videoUrl).toBe(PROJECT.videoUrl);
    expect(report.destinations.linkedin.outcome?.message).toBe("LinkedIn rejected the video");
    expect(report.destinations.youtube.state).toBe("posting");
    expect(report.destinations.youtube.waitingSec).toBe(0);
    await act(async () => {
      releaseYouTube({ ok: true, url: "https://youtu.be/x" });
      await running;
    });
    expect(result.current.progress.phase).toBe("done");
  });
});
