/**
 * Recruiter re-transcribe claim (#2145): creator-only, video answers only,
 * from `failed` / never-run only, and one atomic flip to `pending` so a
 * double-click queues a single job.
 *
 * Run: node --import tsx --test src/services/__tests__/retranscribe.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildFakeDb } from "../../handlers/__testing__/fake-db.js";
import { claimRetranscription, isRetranscribable } from "../interview/retranscribe.js";

const interview = {
  id: "11111111-1111-4111-8111-111111111111",
  recruiterId: "recruiter-1",
  candidateId: "candidate-1",
  title: "Senior Backend Engineer — async screen",
  status: "in_progress",
};

const failedVideo = {
  id: "22222222-2222-4222-8222-222222222222",
  interviewId: interview.id,
  candidateId: "candidate-1",
  questionId: "q-3",
  responseMode: "video",
  videoUrl: "https://cdn.hired.video/interviews/candidate-1/q-3.webm",
  transcription: null,
  transcriptionStatus: "failed",
  attempt: 1,
  status: "recorded",
};

function seed(responses: Array<Record<string, unknown>>) {
  return buildFakeDb({
    studio_async_interviews: [interview] as any,
    studio_async_responses: responses as any,
  });
}

const args = { interviewId: interview.id, responseId: failedVideo.id, userId: "recruiter-1" };

describe("claimRetranscription", () => {
  it("queues a failed video answer and flips it to pending", async () => {
    const { db, state } = seed([{ ...failedVideo }]);
    const out = await claimRetranscription(db, args);
    assert.equal(out.outcome, "queued");
    if (out.outcome !== "queued") return;
    assert.equal(out.videoUrl, failedVideo.videoUrl);
    assert.equal((state as any).studio_async_responses[0].transcriptionStatus, "pending");
  });

  it("queues an answer whose job never ran (status null)", async () => {
    const { db } = seed([{ ...failedVideo, transcriptionStatus: null }]);
    const out = await claimRetranscription(db, args);
    assert.equal(out.outcome, "queued");
  });

  it("a second claim while pending is refused (no duplicate job)", async () => {
    const { db } = seed([{ ...failedVideo }]);
    await claimRetranscription(db, args);
    const again = await claimRetranscription(db, args);
    assert.equal(again.outcome, "not_retryable");
  });

  it("refuses a completed transcript", async () => {
    const { db, state } = seed([{ ...failedVideo, transcriptionStatus: "completed", transcription: "I led the migration…" }]);
    const out = await claimRetranscription(db, args);
    assert.equal(out.outcome, "not_retryable");
    assert.equal((state as any).studio_async_responses[0].transcription, "I led the migration…");
  });

  it("hides the interview from anyone but its creator", async () => {
    const { db, state } = seed([{ ...failedVideo }]);
    const out = await claimRetranscription(db, { ...args, userId: "candidate-1" });
    assert.equal(out.outcome, "not_found");
    assert.equal((state as any).studio_async_responses[0].transcriptionStatus, "failed");
  });

  it("rejects text answers", async () => {
    const { db } = seed([{ ...failedVideo, responseMode: "text", videoUrl: null, textAnswer: "Typed answer" }]);
    const out = await claimRetranscription(db, args);
    assert.equal(out.outcome, "not_video");
  });

  it("a response id from another interview is not found", async () => {
    const { db } = seed([{ ...failedVideo, interviewId: "33333333-3333-4333-8333-333333333333" }]);
    const out = await claimRetranscription(db, args);
    assert.equal(out.outcome, "not_found");
  });
});

describe("isRetranscribable", () => {
  it("only failed and never-run statuses", () => {
    assert.equal(isRetranscribable("failed"), true);
    assert.equal(isRetranscribable(null), true);
    assert.equal(isRetranscribable("pending"), false);
    assert.equal(isRetranscribable("completed"), false);
  });
});
