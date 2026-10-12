import { describe, expect, it } from "vitest";
import { mergeSavedRuns } from "@/lib/build/saved-tool-runs";
import type { ToolRun } from "@/lib/build/use-tool-runs";
import type { ToolRun as SavedToolRun } from "@/lib/services/tool-runs-service";

// Shaped like a real /api/tool-runs row (numeric score comes back as a string).
const saved = (id: string, toolId: string, createdAt: string, result: Record<string, unknown> | null = { overallScore: 72 }): SavedToolRun => ({
  id,
  userId: "u-1",
  toolId,
  resumeId: "r-1",
  studioProjectId: "p-1",
  score: "72",
  tokensUsed: 812,
  result,
  summary: null,
  jobDescription: null,
  createdAt,
});

const counter = (start: number) => {
  let n = start;
  return () => n++;
};

describe("mergeSavedRuns", () => {
  it("brings a session's saved runs into an empty log, oldest first", () => {
    const out = mergeSavedRuns(
      [],
      [saved("s2", "resume-roast", "2026-10-10T12:05:00Z"), saved("s1", "ai-resume-scorer", "2026-10-10T12:00:00Z")],
      counter(0),
    );
    expect(out.map((r) => r.toolId)).toEqual(["ai-resume-scorer", "resume-roast"]);
    expect(out.every((r) => r.status === "done" && r.savedId)).toBe(true);
  });

  it("never duplicates a run the log already holds, and keeps its log id", () => {
    const local: ToolRun[] = [
      { id: 4, at: Date.parse("2026-10-10T12:00:00Z"), toolId: "ai-resume-scorer", status: "done", result: { overallScore: 72 }, savedId: "s1" },
    ];
    const out = mergeSavedRuns(local, [saved("s1", "ai-resume-scorer", "2026-10-10T12:00:00Z")], counter(5));
    expect(out).toBe(local);
    expect(out[0].id).toBe(4);
  });

  it("keeps runs only this browser has (a failure, an unsaved run) beside the saved ones", () => {
    const local: ToolRun[] = [{ id: 0, at: Date.parse("2026-10-10T12:10:00Z"), toolId: "profile-audit", status: "failed", message: "timeout" }];
    const out = mergeSavedRuns(local, [saved("s1", "ai-resume-scorer", "2026-10-10T12:00:00Z")], counter(1));
    expect(out.map((r) => r.status)).toEqual(["done", "failed"]);
    expect(out[0].id).toBe(1);
  });

  it("skips a saved row with no result to show", () => {
    expect(mergeSavedRuns([], [saved("s1", "ai-resume-scorer", "2026-10-10T12:00:00Z", null)], counter(0))).toEqual([]);
  });
});
