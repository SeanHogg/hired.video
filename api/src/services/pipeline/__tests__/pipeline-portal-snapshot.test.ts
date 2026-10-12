/**
 * Hiring-manager share portal snapshot carries each candidate's current
 * video pitch (#2133) under the same confidential-applicant rule as the
 * recruiter kanban (#1679): hidden with the identity until shortlist,
 * shown once revealed.
 *
 * Fixtures mirror the portal's narrow `job_pipeline_entries` select (no
 * contact PII) as it comes back from the neon driver.
 *
 * Run: node --import tsx --test src/services/pipeline/__tests__/pipeline-portal-snapshot.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { toPortalStages, type PortalEntryRow } from "../pipelinePortalSnapshot.js";
import type { PitchSummary } from "../../../../../shared/pitch.js";

const OPEN_CANDIDATE = "5b0c7a9e-1f43-4c4e-9a51-2d7f3c1e8a10";
const CONFIDENTIAL_CANDIDATE = "9d3e6f12-7a8b-4c0d-8e1f-3a4b5c6d7e8f";

function pitchFor(userId: string, projectId: string): PitchSummary {
  return {
    projectId,
    videoUrl: `https://cdn.hired.video/studio/recordings/${userId}/1760100000000-recording.webm`,
    durationMs: 58_200,
    recordedAt: "2026-09-28T17:05:00.000Z",
  };
}

const OPEN_PITCH = pitchFor(OPEN_CANDIDATE, "22222222-2222-4222-8222-222222222222");
const CONFIDENTIAL_PITCH = pitchFor(CONFIDENTIAL_CANDIDATE, "33333333-3333-4333-8333-333333333333");

function row(overrides: Partial<PortalEntryRow>): PortalEntryRow {
  return {
    id: "a1b2c3d4-0000-4000-8000-000000000001",
    stage: "screening",
    candidateUserId: OPEN_CANDIDATE,
    candidateName: "Priya Raman",
    candidateLocation: "Oakland, CA",
    candidateAvatarUrl: "https://cdn.hired.video/avatars/priya.jpg",
    tags: ["referral"],
    stageChangedAt: new Date("2026-10-01T15:00:00Z"),
    addedFrom: "applied",
    ...overrides,
  };
}

const signals = {
  confidential: new Set([CONFIDENTIAL_CANDIDATE]),
  pitches: new Map([
    [OPEN_CANDIDATE, OPEN_PITCH],
    [CONFIDENTIAL_CANDIDATE, CONFIDENTIAL_PITCH],
  ]),
};

function confidentialRow(stage: string): PortalEntryRow {
  return row({
    id: "a1b2c3d4-0000-4000-8000-000000000002",
    stage,
    candidateUserId: CONFIDENTIAL_CANDIDATE,
    candidateName: "Marcus Okafor",
    candidateLocation: "Austin, TX",
    candidateAvatarUrl: "https://cdn.hired.video/avatars/marcus.jpg",
    tags: [],
    addedFrom: "applied",
  });
}

function entriesOf(snapshot: ReturnType<typeof toPortalStages>, stage: string) {
  const col = snapshot.stages.find((s) => s.stage === stage);
  assert.ok(col, `stage column ${stage} exists`);
  return col.entries;
}

describe("toPortalStages — candidate pitch", () => {
  it("shows a non-confidential candidate's pitch", () => {
    const snap = toPortalStages([row({})], signals);
    const [e] = entriesOf(snap, "screening");
    assert.deepEqual(e.candidatePitch, OPEN_PITCH);
    assert.equal(e.confidentialMasked, false);
    assert.equal(snap.total, 1);
  });

  it("hides a confidential candidate's pitch (and identity) before shortlist", () => {
    const snap = toPortalStages([confidentialRow("interviewing")], signals);
    const [e] = entriesOf(snap, "interviewing");
    assert.equal(e.confidentialMasked, true);
    assert.equal(e.candidatePitch, null);
    assert.equal(e.candidateUserId, null);
    assert.equal(e.candidateAvatarUrl, null);
    assert.notEqual(e.candidateName, "Marcus Okafor");
  });

  it("keeps a confidential candidate rejected pre-shortlist hidden", () => {
    const [e] = entriesOf(toPortalStages([confidentialRow("rejected")], signals), "rejected");
    assert.equal(e.candidatePitch, null);
  });

  it("reveals a confidential candidate's pitch once shortlisted", () => {
    const [e] = entriesOf(toPortalStages([confidentialRow("shortlist")], signals), "shortlist");
    assert.equal(e.confidentialMasked, false);
    assert.equal(e.candidateName, "Marcus Okafor");
    assert.deepEqual(e.candidatePitch, CONFIDENTIAL_PITCH);
  });

  it("is null for manual entries with no linked account", () => {
    const [e] = entriesOf(
      toPortalStages([row({ candidateUserId: null, addedFrom: "manual" })], signals),
      "screening",
    );
    assert.equal(e.candidatePitch, null);
  });

  it("never mixes pitches between candidates on one page", () => {
    const snap = toPortalStages(
      [row({}), confidentialRow("offer")],
      signals,
    );
    assert.deepEqual(entriesOf(snap, "screening")[0].candidatePitch, OPEN_PITCH);
    assert.deepEqual(entriesOf(snap, "offer")[0].candidatePitch, CONFIDENTIAL_PITCH);
  });
});
