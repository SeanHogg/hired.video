/**
 * #1342 — streamed AI answers. Two seams:
 *   1. `streamCompletion` folds the gateway's chunk stream back into the
 *      one-shot response shape (so the dispatch loop's validation + charge
 *      are unchanged), forwarding each text delta as it arrives and
 *      estimating usage when the stream carries none (paid AI is always
 *      charged).
 *   2. `aiStreamResponse` frames the call as SSE: deltas, then a `result`
 *      with the validated data — or an `error` with the same code/status
 *      the JSON route would have answered.
 * The event stream is parsed with the same decoder the web client uses.
 *
 * Run: node --import tsx --test src/services/adapters/__tests__/llm-stream.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Context } from "hono";
import type { BuilderforceClient, ChatCompletionChunk } from "@seanhogg/builderforce-sdk";
import type { AppEnv } from "../../../types/index.js";
import { estimateTokens, streamCompletion } from "../llm-stream.js";
import { aiStreamErrorEvent, aiStreamResponse } from "../ai-stream-response.js";
import { AppError } from "../../../middleware/errorHandler.js";
import { TokenBudgetExceededError } from "../../../domains/billing/token-ledger.js";
import { createSseJsonDecoder } from "../../../../../shared/sse-json.js";
import type { AiStreamEvent } from "../../../../../shared/ai-stream.js";

/** What a value-proposition answer looks like on the wire, chunked the way
 *  the gateway relays it (a few tokens per chunk, usage on the last). */
const ANSWER = JSON.stringify({
  valueProposition: "I cut infrastructure spend 28% while scaling to 2,000 seats.",
  executiveSummary: "IT director with 15 years in healthcare networks.",
  keyStrengths: ["Vendor consolidation", "HIPAA programs"],
  alignmentPoints: ["Your 2026 cloud migration"],
  callToAction: "Let's talk about your migration roadmap.",
  confidenceScore: 0.82,
});

function chunksOf(text: string, size: number, usage?: ChatCompletionChunk["usage"]): ChatCompletionChunk[] {
  const out: ChatCompletionChunk[] = [];
  for (let i = 0; i < text.length; i += size) {
    out.push({ model: "openrouter/test-model", choices: [{ index: 0, delta: { content: text.slice(i, i + size) } }] });
  }
  out.push({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }], ...(usage ? { usage } : {}) });
  return out;
}

function fakeSdk(chunks: ChatCompletionChunk[], seen: Array<Record<string, unknown>> = []): BuilderforceClient {
  return {
    chat: {
      completions: {
        create: async (params: Record<string, unknown>) => {
          seen.push(params);
          return {
            async *[Symbol.asyncIterator]() {
              for (const c of chunks) yield c;
            },
          };
        },
      },
    },
  } as unknown as BuilderforceClient;
}

describe("streamCompletion", () => {
  it("forwards every delta in order and folds them into one answer", async () => {
    const deltas: string[] = [];
    let first = 0;
    const seen: Array<Record<string, unknown>> = [];
    const res = await streamCompletion(
      fakeSdk(chunksOf(ANSWER, 7, { prompt_tokens: 900, completion_tokens: 120, total_tokens: 1020 }), seen),
      { messages: [{ role: "user", content: "pitch" }] },
      { onDelta: (t) => deltas.push(t) },
      () => first++,
    );
    assert.equal(deltas.join(""), ANSWER);
    assert.equal(first, 1, "onFirstDelta fires once");
    assert.equal(res.choices?.[0]?.message?.content, ANSWER);
    assert.equal(res.choices?.[0]?.finish_reason, "stop");
    assert.deepEqual(res.usage, { prompt_tokens: 900, completion_tokens: 120, total_tokens: 1020 });
    assert.equal(res.model, "openrouter/test-model");
    assert.equal(seen[0].stream, true);
    assert.deepEqual(seen[0].stream_options, { include_usage: true });
  });

  it("estimates usage when the stream carries none, so the call is still charged", async () => {
    const res = await streamCompletion(
      fakeSdk(chunksOf(ANSWER, 50)),
      { messages: [{ role: "system", content: "x".repeat(400) }, { role: "user", content: "y".repeat(400) }] },
      { onDelta: () => {} },
      () => {},
    );
    assert.equal(res.usage?.prompt_tokens, 200);
    assert.equal(res.usage?.completion_tokens, estimateTokens(ANSWER.length));
    assert.ok((res.usage?.total_tokens ?? 0) > 0);
  });

  it("an empty stream yields an empty answer (the dispatch loop treats it as a failed attempt)", async () => {
    let first = 0;
    const res = await streamCompletion(fakeSdk([{ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }]), { messages: [] }, { onDelta: () => {} }, () => first++);
    assert.equal(res.choices?.[0]?.message?.content, "");
    assert.equal(first, 0);
  });
});

/** Minimal request context: no signed-in user (no token budget to attach). */
const ctx = { var: {}, req: { header: () => "text/event-stream" } } as unknown as Context<AppEnv>;

async function eventsOf(res: Response): Promise<AiStreamEvent[]> {
  const decode = createSseJsonDecoder<AiStreamEvent>();
  return decode(await res.text());
}

describe("aiStreamResponse — the SSE event stream", () => {
  it("streams deltas, a reset, then the validated result", async () => {
    const res = aiStreamResponse(ctx, async (sink) => {
      sink?.onDelta('{"valueProp');
      sink?.onReset?.();
      sink?.onDelta('{"valueProposition":"I cut');
      sink?.onDelta(' spend 28%"}');
      return { valueProposition: "I cut spend 28%" };
    }, { tag: "[test]" });
    assert.equal(res.headers.get("content-type"), "text/event-stream; charset=utf-8");
    const events = (await eventsOf(res)).filter((e) => e.type !== "ping");
    assert.deepEqual(events.map((e) => e.type), ["delta", "reset", "delta", "delta", "result"]);
    const result = events.at(-1) as Extract<AiStreamEvent, { type: "result" }>;
    assert.deepEqual(result.data, { valueProposition: "I cut spend 28%" });
  });

  it("does not hand a sink to a caller who must not see the answer early (teaser)", async () => {
    let sinkSeen: unknown = "unset";
    const res = aiStreamResponse(ctx, async (sink) => {
      sinkSeen = sink;
      return { overallScore: 70, grade: "B-" };
    }, { stream: false, tag: "[test]" });
    const events = (await eventsOf(res)).filter((e) => e.type !== "ping");
    assert.equal(sinkSeen, undefined);
    assert.deepEqual(events.map((e) => e.type), ["result"]);
  });

  it("maps a failure to the JSON route's code and status", async () => {
    const res = aiStreamResponse(ctx, async () => {
      throw new AppError("LLM_UNAVAILABLE", "Resume analysis is temporarily unavailable.", 503);
    }, { tag: "[test]" });
    const events = (await eventsOf(res)).filter((e) => e.type !== "ping");
    assert.deepEqual(events, [{ type: "error", code: "LLM_UNAVAILABLE", message: "Resume analysis is temporarily unavailable.", status: 503 }]);
  });
});

describe("aiStreamErrorEvent", () => {
  it("an over-budget call is a 429 the client shows as the upgrade banner", () => {
    const summary = { used: 150_000, limit: 150_000 } as unknown as ConstructorParameters<typeof TokenBudgetExceededError>[0];
    const e = aiStreamErrorEvent(new TokenBudgetExceededError(summary));
    assert.equal(e.status, 429);
    assert.equal(e.code, "TOKEN_BUDGET_EXCEEDED");
  });

  it("an unknown throw is a generic 503", () => {
    assert.deepEqual(
      { code: aiStreamErrorEvent(new Error("boom")).code, status: aiStreamErrorEvent(new Error("boom")).status },
      { code: "AI_UNAVAILABLE", status: 503 },
    );
  });
});
