/**
 * Tests for the tool-calling plumbing in openai-compat.ts.
 *
 * Pins the wire contract that the AI coach (`/api/ai/chat`) depends on:
 *   • `tools` + `tool_choice` are forwarded to the provider when present.
 *   • `tool_calls` returned by the provider are surfaced on the result.
 *   • A response carrying tool_calls but empty content is VALID (the
 *     model is asking us to dispatch, not refusing to answer).
 *   • When tools are passed, `response_format: json_object` is suppressed
 *     — the two are mutually exclusive on most providers.
 *   • When tools are absent, the legacy json-mode behaviour still works.
 *
 * Run: node --import tsx --test src/services/__tests__/openai-compat-tools.test.ts
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  callOpenAICompatProvider,
  type ToolSpec,
} from "../adapters/openai-compat.js";
import type { ProviderConfig } from "../adapters/providers.js";

// ---------------------------------------------------------------------------
// Fixtures — a fake provider (no real network) plus a tiny fetch recorder
// that lets each test inspect the request body the helper sent.
// ---------------------------------------------------------------------------

const fakeProvider: ProviderConfig = {
  id: "openrouter",
  label: "FakeVendor",
  endpoint: "https://fake.invalid/v1/chat/completions",
  models: [{ id: "fake-model", label: "Fake", tier: "free", context: 8192 }],
  apiKeyEnvVar: "OPENROUTER_API_KEY",
  timeoutMs: 5_000,
};

interface CapturedCall {
  body: any;
  headers: Record<string, string>;
}

let captured: CapturedCall | null = null;
let respond: () => Response;
const realFetch = globalThis.fetch;

function makeJsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  captured = null;
  respond = () =>
    makeJsonResponse({
      choices: [{ message: { content: "default ok" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
      model: "fake-model",
    });
  globalThis.fetch = async (input: any, init: any) => {
    captured = {
      body: typeof init?.body === "string" ? JSON.parse(init.body) : init?.body,
      headers: init?.headers ?? {},
    };
    return respond();
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

const sampleTools: ToolSpec[] = [
  {
    type: "function",
    function: {
      name: "apply_resume_rewrite",
      description: "Replace one bullet/summary on the active resume.",
      parameters: {
        type: "object",
        properties: {
          original: { type: "string" },
          improved: { type: "string" },
        },
        required: ["original", "improved"],
        additionalProperties: false,
      },
    },
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// Request shape
// ═══════════════════════════════════════════════════════════════════════════

describe("callOpenAICompatProvider — request body", () => {
  it("forwards `tools` and `tool_choice` when tools are passed", async () => {
    await callOpenAICompatProvider(
      fakeProvider,
      "fake-key",
      "fake-model",
      [{ role: "user", content: "rewrite my summary" }],
      { tools: sampleTools },
    );

    assert.ok(captured, "fetch was not called");
    assert.deepEqual(captured!.body.tools, sampleTools);
    assert.equal(captured!.body.tool_choice, "auto", "tool_choice defaults to auto when tools present");
  });

  it("honours an explicit toolChoice override", async () => {
    await callOpenAICompatProvider(
      fakeProvider,
      "fake-key",
      "fake-model",
      [{ role: "user", content: "go" }],
      { tools: sampleTools, toolChoice: "required" },
    );
    assert.equal(captured!.body.tool_choice, "required");
  });

  it("does not include `tools` / `tool_choice` when no tools were passed", async () => {
    await callOpenAICompatProvider(
      fakeProvider,
      "fake-key",
      "fake-model",
      [{ role: "user", content: "plain" }],
      {},
    );
    assert.equal(captured!.body.tools, undefined);
    assert.equal(captured!.body.tool_choice, undefined);
  });

  it("suppresses `response_format: json_object` when tools are passed", async () => {
    // Tool-calling and JSON-mode are mutually exclusive on most providers
    // (the model may legitimately return prose OR tool_calls, so we can't
    // pre-commit to a JSON-only response shape).
    await callOpenAICompatProvider(
      fakeProvider,
      "fake-key",
      "fake-model",
      [{ role: "user", content: "go" }],
      { tools: sampleTools, responseFormat: "json_object" },
    );
    assert.equal(captured!.body.response_format, undefined);
  });

  it("still sends `response_format: json_object` for legacy JSON-mode callers", async () => {
    await callOpenAICompatProvider(
      fakeProvider,
      "fake-key",
      "fake-model",
      [{ role: "system", content: "json please" }, { role: "user", content: "x" }],
      { responseFormat: "json_object" },
    );
    assert.deepEqual(captured!.body.response_format, { type: "json_object" });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Response parsing
// ═══════════════════════════════════════════════════════════════════════════

describe("callOpenAICompatProvider — response parsing", () => {
  it("returns toolCalls + finishReason when the model wants tools dispatched", async () => {
    respond = () =>
      makeJsonResponse({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: {
                    name: "apply_resume_rewrite",
                    arguments: '{"original":"a","improved":"b"}',
                  },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        model: "fake-model",
      });

    const out = await callOpenAICompatProvider(
      fakeProvider,
      "k",
      "fake-model",
      [{ role: "user", content: "go" }],
      { tools: sampleTools },
    );

    assert.equal(out.content, "", "tool-only responses produce empty content");
    assert.equal(out.toolCalls.length, 1);
    assert.equal(out.toolCalls[0].id, "call_1");
    assert.equal(out.toolCalls[0].function.name, "apply_resume_rewrite");
    assert.equal(out.finishReason, "tool_calls");
    assert.equal(out.usage.promptTokens, 10);
  });

  it("does NOT throw 'Empty LLM response' when content is empty but tool_calls is set", async () => {
    // Regression: the original parser threw on empty content because no
    // call could legitimately produce one. With tool calling, an empty
    // content + non-empty tool_calls is the normal "I want to dispatch"
    // shape and must not be treated as a failure.
    respond = () =>
      makeJsonResponse({
        choices: [
          {
            message: {
              content: "",
              tool_calls: [
                {
                  id: "x",
                  type: "function",
                  function: { name: "summarize_resume", arguments: "{}" },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
        model: "fake-model",
      });

    await assert.doesNotReject(() =>
      callOpenAICompatProvider(
        fakeProvider,
        "k",
        "fake-model",
        [{ role: "user", content: "go" }],
        { tools: sampleTools },
      ),
    );
  });

  it("still throws 'Empty LLM response' when both content and tool_calls are absent", async () => {
    // The "no content, no tools" case still represents a broken provider
    // response — keep the error so the fallback chain advances.
    respond = () =>
      makeJsonResponse({
        choices: [{ message: { content: "" }, finish_reason: "stop" }],
        model: "fake-model",
      });

    await assert.rejects(
      () =>
        callOpenAICompatProvider(
          fakeProvider,
          "k",
          "fake-model",
          [{ role: "user", content: "go" }],
          {},
        ),
      /Empty LLM response/,
    );
  });

  it("returns toolCalls: [] and finishReason: 'stop' for a normal text completion", async () => {
    const out = await callOpenAICompatProvider(
      fakeProvider,
      "k",
      "fake-model",
      [{ role: "user", content: "hi" }],
      {},
    );
    assert.equal(out.content, "default ok");
    assert.deepEqual(out.toolCalls, []);
    assert.equal(out.finishReason, "stop");
  });

  it("infers finishReason as 'tool_calls' when the provider omits it but tool_calls is present", async () => {
    // OpenRouter sometimes drops finish_reason; fall back to inspecting
    // tool_calls so the upstream loop can still decide whether to dispatch.
    respond = () =>
      makeJsonResponse({
        choices: [
          {
            message: {
              content: "",
              tool_calls: [
                { id: "y", type: "function", function: { name: "summarize_resume", arguments: "{}" } },
              ],
            },
            // finish_reason omitted on purpose
          },
        ],
        model: "fake-model",
      });

    const out = await callOpenAICompatProvider(
      fakeProvider,
      "k",
      "fake-model",
      [{ role: "user", content: "go" }],
      { tools: sampleTools },
    );
    assert.equal(out.finishReason, "tool_calls");
  });
});
