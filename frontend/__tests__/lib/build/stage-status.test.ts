import { describe, expect, it } from "vitest";
import { latestScore, readiness, stageStatuses } from "@/lib/build/stage-status";
import type { ToolRun } from "@/lib/build/use-tool-runs";

const scored = (id: number, toolId: string, overallScore: number, weaknesses: string[]): ToolRun => ({
  id,
  at: id,
  toolId,
  status: "done",
  result: { overallScore, weaknesses },
});

const facts = { seniorityKey: "build.seniority.senior", seconds: 28, scenes: 5, openFixes: null, jobMatch: null };

describe("stage status", () => {
  it("has no readiness and no fix badge until the résumé is scored", () => {
    const statuses = stageStatuses({ ...facts, runs: [] });
    expect(readiness([])).toBeNull();
    expect(statuses.strengthen).toEqual({ key: "build.stages.status.strengthenPending" });
    expect(statuses.video.values).toEqual({ seconds: 28, scenes: 5 });
    expect(statuses.create.values).toEqual({ levelKey: "build.seniority.senior" });
  });

  it("reads the latest finished scoring run, ignoring other tools and failures", () => {
    const runs: ToolRun[] = [
      scored(1, "ai-resume-scorer", 61, ["a", "b", "c", "d"]),
      scored(2, "resume-roast", 71.4, ["a", "b", "c"]),
      { id: 3, at: 3, toolId: "ai-resume-scorer", status: "failed", message: null },
      scored(4, "vendor-sync", 99, []),
    ];
    expect(latestScore(runs)).toEqual({ score: 71, fixes: 3 });
    // Readiness averages the latest score per scoring tool: (61 + 71.4) / 2.
    expect(readiness(runs)).toBe(66);
    expect(stageStatuses({ ...facts, runs }).strengthen).toEqual({
      key: "build.stages.status.strengthen",
      values: { score: 71, count: 3 },
      badge: 3,
    });
  });

  it("clamps out-of-range scores and drops the badge when nothing is left to fix", () => {
    const runs = [scored(1, "resume-optimizer", 140, [])];
    expect(readiness(runs)).toBe(100);
    expect(stageStatuses({ ...facts, runs }).strengthen.badge).toBeUndefined();
  });

  it("says the résumé is still being read before insights exist", () => {
    expect(stageStatuses({ ...facts, seniorityKey: null, runs: [] }).create).toEqual({
      key: "build.stages.status.createPending",
    });
  });

  it("counts only the fixes still flagged on the page, so fixes the chat made drop off", () => {
    const runs = [scored(1, "resume-roast", 62, ["a", "b", "c"])];
    expect(stageStatuses({ ...facts, runs, openFixes: 1 }).strengthen).toEqual({
      key: "build.stages.status.strengthen",
      values: { score: 62, count: 1 },
      badge: 1,
    });
    expect(stageStatuses({ ...facts, runs, openFixes: 0 }).strengthen.badge).toBeUndefined();
  });

  it("names the job and its match score once the résumé is aimed at one", () => {
    expect(stageStatuses({ ...facts, runs: [] }).target).toEqual({ key: "build.stages.status.target" });
    expect(
      stageStatuses({ ...facts, runs: [], jobMatch: { jobLabel: "Chief Information Officer · Macomb Community College", score: 92 } })
        .target,
    ).toEqual({
      key: "build.stages.status.targetJob",
      values: { job: "Chief Information Officer · Macomb Community College", score: 92 },
    });
    expect(stageStatuses({ ...facts, runs: [], jobMatch: { jobLabel: null, score: 85 } }).target).toEqual({
      key: "build.stages.status.targetScore",
      values: { score: 85 },
    });
  });

  it("counts the job match in readiness once the résumé is aimed at a job", () => {
    const runs = [scored(1, "ai-resume-scorer", 60, [])];
    expect(readiness(runs)).toBe(60);
    expect(readiness(runs, 92)).toBe(76);
    expect(readiness([], 92)).toBeNull();
  });

  it("moves when the résumé is scored again after the fixes", () => {
    const before = [scored(1, "ai-resume-scorer", 60, ["a", "b"])];
    const after = [...before, scored(2, "ai-resume-scorer", 78, [])];
    expect(readiness(before)).toBe(60);
    expect(readiness(after)).toBe(78);
  });
});
