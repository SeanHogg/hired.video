import { describe, expect, it } from "vitest";
import type { JobGap } from "@shared/resume-tailor";
import type { JobRequirement } from "@shared/resume-from-job";
import type { GapAnswer } from "@/lib/build/review/use-gap-answers";
import type { ToolRun } from "@/lib/build/use-tool-runs";
import {
  deriveJobMatch,
  latestJobMatchRun,
  type FromJobMatchInput,
  type TailorMatchInput,
} from "@/lib/build/job-match";

const gaps: JobGap[] = [
  { id: "G1", requirement: "Kubernetes or cloud platform", kind: "skill", question: "Have you run Kubernetes?", skill: "Kubernetes" },
  { id: "G2", requirement: "HIPAA compliance experience", kind: "experience", question: "Have you shipped under HIPAA?", anchorPath: "work.0" },
  { id: "G3", requirement: "Terraform", kind: "skill", question: "Have you used Terraform?", skill: "  " },
];

function tailor(overrides: Partial<TailorMatchInput> = {}, answered: Record<string, GapAnswer> = {}): TailorMatchInput {
  return {
    kind: "tailor",
    status: "ready",
    job: { label: "VP Engineering · Northwind Health" },
    score: 86.4,
    oldScore: 62,
    gaps,
    matchedKeywords: [],
    answers: { answerOf: (id) => answered[id] ?? { status: "open" } },
    ...overrides,
  };
}

const requirements: JobRequirement[] = [
  { id: "R1", text: "8+ years leading engineering teams", status: "covered", evidence: ["work.0.highlights.1"], note: "AiM: led 14 engineers" },
  { id: "R2", text: "React", status: "partial", evidence: ["skills.2"], note: "" },
  { id: "R3", text: "HIPAA", status: "gap", evidence: [], note: "" },
  { id: "R4", text: "react", status: "covered", evidence: ["skills.3"], note: "" },
];

const fromJob = (overrides: Partial<FromJobMatchInput> = {}): FromJobMatchInput => ({
  kind: "fromJob",
  status: "ready",
  subject: "Staff Engineer · Acme Robotics",
  requirements,
  ...overrides,
});

const matchRun = (id: number, overallScore: number | undefined, strengths: string[], weaknesses: string[]): ToolRun => ({
  id,
  at: 1_759_000_000_000 + id,
  toolId: "job-resume-match",
  status: "done",
  result: { overallScore, strengths, weaknesses, raw: { score: overallScore, matchedKeywords: strengths, missingKeywords: weaknesses } },
});

describe("deriveJobMatch — tailor review", () => {
  it("uses the estimated tailored score, the original as before, and open gaps as missing", () => {
    expect(deriveJobMatch(tailor(), [])).toEqual({
      jobLabel: "VP Engineering · Northwind Health",
      score: 86,
      scoreBefore: 62,
      found: [],
      missing: ["Kubernetes", "HIPAA compliance experience", "Terraform"],
      source: "tailor",
    });
  });

  it("moves a confirmed gap to found; a declined one stays missing", () => {
    const match = deriveJobMatch(
      tailor({}, { G1: { status: "confirmed", fact: { kind: "skill", name: "Kubernetes" } }, G2: { status: "declined" } }),
      [],
    );
    expect(match?.found).toEqual(["Kubernetes"]);
    expect(match?.missing).toEqual(["HIPAA compliance experience", "Terraform"]);
  });

  it("shows the keywords the tailor found on the résumé first, then confirmed gaps (#2344)", () => {
    const match = deriveJobMatch(
      tailor(
        { matchedKeywords: ["React", "TypeScript", "react", "Kubernetes"] },
        { G1: { status: "confirmed", fact: { kind: "skill", name: "Kubernetes" } } },
      ),
      [],
    );
    expect(match?.found).toEqual(["React", "TypeScript", "Kubernetes"]);
    expect(match?.missing).toEqual(["HIPAA compliance experience", "Terraform"]);
  });

  it("clamps out-of-range scores and nulls a blank job label", () => {
    const match = deriveJobMatch(tailor({ score: 104, oldScore: -3, job: { label: "  " } }), []);
    expect(match).toMatchObject({ score: 100, scoreBefore: 0, jobLabel: null });
  });

  it("has no match while the review loads or failed, even with a tool run", () => {
    const runs = [matchRun(1, 70, ["SQL"], [])];
    expect(deriveJobMatch(tailor({ status: "loading" }), runs)).toBeNull();
    expect(deriveJobMatch(tailor({ status: "error" }), runs)).toBeNull();
  });
});

describe("deriveJobMatch — create-from-a-job review", () => {
  it("scores the share covered (partial counts) and dedupes keywords case-insensitively", () => {
    expect(deriveJobMatch(fromJob(), [])).toEqual({
      jobLabel: "Staff Engineer · Acme Robotics",
      score: 75,
      found: ["8+ years leading engineering teams", "React"],
      missing: ["HIPAA"],
      source: "fromJob",
    });
  });

  it("has no match when no requirements were read", () => {
    expect(deriveJobMatch(fromJob({ requirements: [] }), [])).toBeNull();
  });
});

describe("deriveJobMatch — Job Match tool runs", () => {
  it("falls back to the latest finished run when no job review is open", () => {
    const runs: ToolRun[] = [
      matchRun(1, 58, ["SQL"], ["Go"]),
      { id: 2, at: 2, toolId: "ai-resume-scorer", status: "done", result: { overallScore: 91 } },
      matchRun(3, 81.6, ["TypeScript", " typescript ", "AWS"], ["Kubernetes", ""]),
      { id: 4, at: 4, toolId: "job-resume-match", status: "running" },
      { id: 5, at: 5, toolId: "job-resume-match", status: "failed", message: "Network error" },
    ];
    expect(deriveJobMatch({ kind: "merge" }, runs)).toEqual({
      jobLabel: null,
      score: 82,
      found: ["TypeScript", "AWS"],
      missing: ["Kubernetes"],
      source: "tool",
    });
    expect(deriveJobMatch(null, runs)?.score).toBe(82);
  });

  it("names the job the run recorded (#2344)", () => {
    const run: ToolRun = { ...matchRun(1, 70, ["SQL"], []), result: { overallScore: 70, jobLabel: "Data Engineer · Globex", strengths: ["SQL"] } } as ToolRun;
    expect(latestJobMatchRun([run])?.jobLabel).toBe("Data Engineer · Globex");
    const blank: ToolRun = { ...matchRun(2, 70, [], []), result: { overallScore: 70, jobLabel: "   " } } as ToolRun;
    expect(latestJobMatchRun([blank])?.jobLabel).toBeNull();
  });

  it("skips a run without a score", () => {
    expect(latestJobMatchRun([matchRun(1, 64, [], []), matchRun(2, undefined, ["SQL"], [])])?.score).toBe(64);
  });

  it("has no match with no runs", () => {
    expect(deriveJobMatch(null, [])).toBeNull();
    expect(latestJobMatchRun([])).toBeNull();
  });
});
