/**
 * Recruiter pipeline card DTO carries the candidate's current video pitch
 * (#2133) — stamped from the page-wide batch read, and masked together with
 * the rest of the identity for confidential candidates (#1679).
 *
 * Fixture mirrors a real `job_pipeline_entries` row (select() shape).
 *
 * Run: node --import tsx --test src/services/pipeline/__tests__/pipeline-candidate-dto.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { toPipelineCandidateDto } from "../PipelineService.js";
import type { PitchSummary } from "../../../../../shared/pitch.js";

const CANDIDATE = "5b0c7a9e-1f43-4c4e-9a51-2d7f3c1e8a10";
const PITCH: PitchSummary = {
  projectId: "22222222-2222-4222-8222-222222222222",
  videoUrl: `https://cdn.hired.video/studio/recordings/${CANDIDATE}/1760100000000-recording.webm`,
  durationMs: 61_500,
  recordedAt: "2026-09-20T09:30:00.000Z",
};

function entry(stage: string, candidateUserId: string | null = CANDIDATE) {
  return {
    id: "a1b2c3d4-0000-4000-8000-000000000001",
    jobId: "f0e1d2c3-0000-4000-8000-000000000002",
    jobApplicationId: null,
    candidateUserId,
    candidateName: "Priya Raman",
    candidateEmail: "priya.raman@example.com",
    candidatePhone: "+1 415 555 0142",
    candidateLocation: "Oakland, CA",
    candidateLinkedinUrl: "https://www.linkedin.com/in/priyaraman",
    candidateResumeUrl: null,
    candidateAvatarUrl: null,
    stage,
    stageChangedAt: new Date("2026-10-01T15:00:00Z"),
    tags: ["referral"],
  };
}

const signals = (confidential: string[] = []) => ({
  confidential: new Set(confidential),
  pitches: new Map([[CANDIDATE, PITCH]]),
});

describe("toPipelineCandidateDto", () => {
  it("includes the candidate's current pitch", () => {
    const dto = toPipelineCandidateDto(entry("screening"), signals());
    assert.deepEqual(dto.candidatePitch, PITCH);
    assert.equal(dto.confidentialMasked, false);
    assert.equal(dto.candidateName, "Priya Raman");
  });

  it("is null when the candidate has no pitch or no linked account", () => {
    assert.equal(toPipelineCandidateDto(entry("applied"), { confidential: new Set(), pitches: new Map() }).candidatePitch, null);
    assert.equal(toPipelineCandidateDto(entry("applied", null), signals()).candidatePitch, null);
  });

  it("masks the pitch with the identity for a confidential candidate before shortlist", () => {
    const dto = toPipelineCandidateDto(entry("interviewing"), signals([CANDIDATE]));
    assert.equal(dto.confidentialMasked, true);
    assert.equal(dto.candidatePitch, null);
    assert.equal(dto.candidateUserId, null);
  });

  it("reveals the pitch once a confidential candidate reaches shortlist", () => {
    const dto = toPipelineCandidateDto(entry("shortlist"), signals([CANDIDATE]));
    assert.equal(dto.confidentialMasked, false);
    assert.deepEqual(dto.candidatePitch, PITCH);
  });
});
