/**
 * Tests for the async-transcription orchestrator (#1238).
 *
 * The orchestrator reads/writes to studio_async_responses, fans out to
 * injected fetchAudio + transcribe deps, and bookkeeps transcriptionStatus
 * across the three terminal branches (skipped / completed / failed). The
 * tests pin each branch + verify no AI score is silently nuked on success.
 *
 * Run: node --import tsx --test src/services/__tests__/transcribe-response.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildFakeDb } from "../../handlers/__testing__/fake-db.js";
import {
  isTransientTranscribeError,
  MAX_TRANSCRIBE_ATTEMPTS,
  transcribeResponse,
} from "../interview/transcribe-response.js";

function seed(rows: Array<Record<string, unknown>>) {
  return buildFakeDb({ studio_async_responses: rows as any });
}

const baseRow = {
  id: "r1",
  interviewId: "i1",
  candidateId: "c1",
  questionId: "q1",
  responseMode: "video" as const,
  videoUrl: "https://cdn.example.com/x.webm",
  textAnswer: null,
  transcription: null,
  transcriptionStatus: null,
  attempt: 1,
  status: "recorded",
};

describe("transcribeResponse", () => {
  it("skips when the response row is missing", async () => {
    const { db } = seed([]);
    const out = await transcribeResponse(db, mockDeps(), { responseId: "r-missing" });
    assert.equal(out.status, "skipped");
    if (out.status !== "skipped") return;
    assert.equal(out.reason, "response_not_found");
  });

  it("skips when responseMode is 'text' (no video to transcribe)", async () => {
    const { db } = seed([{ ...baseRow, responseMode: "text", videoUrl: null, textAnswer: "wrote it out" }]);
    const out = await transcribeResponse(db, mockDeps(), { responseId: "r1" });
    assert.equal(out.status, "skipped");
    if (out.status !== "skipped") return;
    assert.equal(out.reason, "not_video_mode");
  });

  it("skips when there's no videoUrl (and none provided)", async () => {
    const { db } = seed([{ ...baseRow, videoUrl: null }]);
    const out = await transcribeResponse(db, mockDeps(), { responseId: "r1" });
    assert.equal(out.status, "skipped");
    if (out.status !== "skipped") return;
    assert.equal(out.reason, "no_video_url");
  });

  it("happy path — writes transcript + marks completed", async () => {
    const { db, state } = seed([{ ...baseRow, aiScore: 7.5, aiSummary: "Decent" }]);
    const out = await transcribeResponse(db, mockDeps("Hello world transcript"), { responseId: "r1" });
    assert.equal(out.status, "completed");
    if (out.status !== "completed") return;
    assert.equal(out.transcription, "Hello world transcript");

    const row = (state as any).studio_async_responses[0];
    assert.equal(row.transcription, "Hello world transcript");
    assert.equal(row.transcriptionStatus, "completed");
    // Crucial: the previous AI score is preserved. The recruiter may
    // re-score on the new transcript later; we shouldn't nuke their old
    // verdict in the meantime.
    assert.equal(row.aiScore, 7.5);
    assert.equal(row.aiSummary, "Decent");
  });

  it("records 'pending' on the row before kicking off fetch (visible while in flight)", async () => {
    // Snapshot the row state at the moment fetchAudio is called.
    const { db, state } = seed([{ ...baseRow }]);
    let snapshotAtFetch: any = null;
    const deps = {
      fetchAudio: async () => {
        snapshotAtFetch = { ...(state as any).studio_async_responses[0] };
        return new ArrayBuffer(8);
      },
      transcribe: async () => ({ text: "ok" }),
    };
    await transcribeResponse(db, deps, { responseId: "r1" });
    assert.equal(snapshotAtFetch.transcriptionStatus, "pending");
  });

  it("marks 'failed' when fetchAudio throws", async () => {
    const { db, state } = seed([{ ...baseRow }]);
    const deps = {
      fetchAudio: async () => {
        throw new Error("network down");
      },
      transcribe: async () => ({ text: "unreachable" }),
    };
    const out = await transcribeResponse(db, deps, { responseId: "r1" });
    assert.equal(out.status, "failed");
    if (out.status !== "failed") return;
    assert.match(out.error, /fetch_failed/);
    assert.equal((state as any).studio_async_responses[0].transcriptionStatus, "failed");
    assert.equal((state as any).studio_async_responses[0].transcription, null);
  });

  it("marks 'failed' when transcribe throws", async () => {
    const { db, state } = seed([{ ...baseRow }]);
    const deps = {
      fetchAudio: async () => new ArrayBuffer(8),
      transcribe: async () => {
        throw new Error("whisper 500");
      },
    };
    const out = await transcribeResponse(db, deps, { responseId: "r1" });
    assert.equal(out.status, "failed");
    if (out.status !== "failed") return;
    assert.match(out.error, /transcribe_failed/);
    assert.equal((state as any).studio_async_responses[0].transcriptionStatus, "failed");
  });

  it("accepts an override videoUrl when the row's videoUrl is null", async () => {
    // Race condition: the route layer has the videoUrl from the just-
    // returned row but the persisted row's column may lag behind. The
    // helper takes an explicit override so we don't lose the work.
    const { db } = seed([{ ...baseRow, videoUrl: null }]);
    const out = await transcribeResponse(db, mockDeps("override hit"), {
      responseId: "r1",
      videoUrl: "https://cdn.example.com/override.webm",
    });
    assert.equal(out.status, "completed");
  });
});

describe("transcribeResponse — bounded automatic retry (#2145)", () => {
  /** Records requested waits instead of sleeping — no real timers. */
  function recordingSleep() {
    const waits: number[] = [];
    return { waits, sleep: async (ms: number) => { waits.push(ms); } };
  }

  it("retries a transient Whisper 503 and completes on the second attempt", async () => {
    const { db, state } = seed([{ ...baseRow }]);
    const { waits, sleep } = recordingSleep();
    let calls = 0;
    const out = await transcribeResponse(db, {
      fetchAudio: async () => new ArrayBuffer(8),
      transcribe: async () => {
        calls++;
        if (calls === 1) throw new Error("Whisper API error 503: upstream unavailable");
        return { text: "second time lucky" };
      },
      retry: { maxAttempts: 3, sleep, backoffMs: [10, 20] },
    }, { responseId: "r1" });
    assert.equal(out.status, "completed");
    assert.equal(calls, 2);
    assert.deepEqual(waits, [10]);
    assert.equal((state as any).studio_async_responses[0].transcriptionStatus, "completed");
  });

  it("stops at the attempt ceiling even when asked for more", async () => {
    const { db, state } = seed([{ ...baseRow }]);
    const { waits, sleep } = recordingSleep();
    let calls = 0;
    const out = await transcribeResponse(db, {
      fetchAudio: async () => {
        calls++;
        throw new Error("fetch 502");
      },
      transcribe: async () => ({ text: "unreachable" }),
      retry: { maxAttempts: 99, sleep, backoffMs: [5] },
    }, { responseId: "r1" });
    assert.equal(out.status, "failed");
    assert.equal(calls, MAX_TRANSCRIBE_ATTEMPTS);
    // Last backoff entry repeats for later gaps.
    assert.deepEqual(waits, [5, 5]);
    assert.equal((state as any).studio_async_responses[0].transcriptionStatus, "failed");
  });

  it("fails fast on a permanent 404 (missing R2 object) without retrying", async () => {
    const { db } = seed([{ ...baseRow }]);
    const { waits, sleep } = recordingSleep();
    let calls = 0;
    const out = await transcribeResponse(db, {
      fetchAudio: async () => {
        calls++;
        throw new Error("fetch 404");
      },
      transcribe: async () => ({ text: "unreachable" }),
      retry: { maxAttempts: 3, sleep },
    }, { responseId: "r1" });
    assert.equal(out.status, "failed");
    assert.equal(calls, 1);
    assert.deepEqual(waits, []);
  });

  it("classifies errors: 5xx / 408 / 429 / network are transient, other 4xx are not", () => {
    assert.equal(isTransientTranscribeError("Whisper API error 500"), true);
    assert.equal(isTransientTranscribeError("fetch 429"), true);
    assert.equal(isTransientTranscribeError("fetch 408"), true);
    assert.equal(isTransientTranscribeError("TypeError: fetch failed"), true);
    assert.equal(isTransientTranscribeError("Whisper API error 400: invalid file format"), false);
    assert.equal(isTransientTranscribeError("fetch 403"), false);
  });
});

function mockDeps(text = "transcript text") {
  return {
    fetchAudio: async () => new ArrayBuffer(8),
    transcribe: async () => ({ text }),
  };
}
