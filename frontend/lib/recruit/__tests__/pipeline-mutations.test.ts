/**
 * Tests for the pure snapshot-mutation helpers powering the recruiter
 * kanban's optimistic updates.
 *
 * The kanban uses these to reflect drag-drop / stage-change / add / remove
 * instantly while the backend round-trip is in flight. Edge cases that
 * matter: stale entry ids (no-op), no-op moves to the same stage,
 * bookkeeping of per-stage `count` and `total`.
 *
 * Run: vitest run lib/recruit/__tests__/pipeline-mutations.test.ts
 */

import { describe, it, expect } from "vitest";
import {
  findEntryStage,
  insertEntry,
  moveEntry,
  removeEntry,
} from "@/lib/recruit/pipeline-mutations";
import type {
  PipelineEntry,
  PipelineSnapshot,
} from "@/lib/services/job-pipeline-service";

function entry(id: string, stage: PipelineEntry["stage"]): PipelineEntry {
  return {
    id,
    jobId: "job-1",
    candidateUserId: null,
    candidateName: `Cand ${id}`,
    candidateEmail: null,
    candidatePhone: null,
    candidateLocation: null,
    candidateLinkedinUrl: null,
    candidateResumeUrl: null,
    candidateAvatarUrl: null,
    stage,
    stageChangedAt: "2026-01-01T00:00:00Z",
    ownerId: null,
    addedFrom: "manual",
    notes: null,
    tags: [],
    rejectedAt: null,
    rejectionReason: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

function snapshot(): PipelineSnapshot {
  const stages = [
    { stage: "applied" as const, entries: [entry("a1", "applied"), entry("a2", "applied")], count: 2 },
    { stage: "longlist" as const, entries: [entry("l1", "longlist")], count: 1 },
    { stage: "screening" as const, entries: [], count: 0 },
    { stage: "interviewing" as const, entries: [], count: 0 },
    { stage: "shortlist" as const, entries: [], count: 0 },
    { stage: "submitted" as const, entries: [], count: 0 },
    { stage: "offer" as const, entries: [], count: 0 },
    { stage: "hired" as const, entries: [], count: 0 },
    { stage: "rejected" as const, entries: [], count: 0 },
  ];
  return { stages, total: 3 };
}

describe("moveEntry", () => {
  it("moves an entry between stages and updates per-stage counts", () => {
    const next = moveEntry(snapshot(), "a1", "screening");
    const applied = next.stages.find((g) => g.stage === "applied")!;
    const screening = next.stages.find((g) => g.stage === "screening")!;
    expect(applied.entries.map((e) => e.id)).toEqual(["a2"]);
    expect(applied.count).toBe(1);
    expect(screening.entries.map((e) => e.id)).toEqual(["a1"]);
    expect(screening.count).toBe(1);
    // Total unchanged on a move.
    expect(next.total).toBe(3);
  });

  it("returns the same snapshot for a stale entry id", () => {
    const snap = snapshot();
    const next = moveEntry(snap, "does-not-exist", "screening");
    expect(next).toBe(snap);
  });

  it("inserts the moved entry at the head of the target stage", () => {
    const snap = snapshot();
    const next = moveEntry(snap, "a1", "longlist");
    const longlist = next.stages.find((g) => g.stage === "longlist")!;
    expect(longlist.entries.map((e) => e.id)).toEqual(["a1", "l1"]);
  });
});

describe("removeEntry", () => {
  it("drops the entry and decrements both per-stage and total", () => {
    const next = removeEntry(snapshot(), "a1");
    const applied = next.stages.find((g) => g.stage === "applied")!;
    expect(applied.entries.map((e) => e.id)).toEqual(["a2"]);
    expect(applied.count).toBe(1);
    expect(next.total).toBe(2);
  });

  it("is a no-op for a stale id", () => {
    const snap = snapshot();
    const next = removeEntry(snap, "missing");
    expect(next).toBe(snap);
    expect(next.total).toBe(3);
  });
});

describe("insertEntry", () => {
  it("prepends the entry to the matching stage and bumps total", () => {
    const fresh = entry("new-1", "screening");
    const next = insertEntry(snapshot(), fresh);
    const screening = next.stages.find((g) => g.stage === "screening")!;
    expect(screening.entries.map((e) => e.id)).toEqual(["new-1"]);
    expect(screening.count).toBe(1);
    expect(next.total).toBe(4);
  });
});

describe("findEntryStage", () => {
  it("returns the owning stage", () => {
    expect(findEntryStage(snapshot(), "l1")).toBe("longlist");
  });
  it("returns null for unknown entries", () => {
    expect(findEntryStage(snapshot(), "ghost")).toBeNull();
  });
});
