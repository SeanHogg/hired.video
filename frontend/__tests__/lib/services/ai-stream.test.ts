/**
 * #1342 — streamed AI answers on the client: the SSE event stream is parsed
 * frame by frame (frames split across network chunks), the answer text grows
 * with each delta and restarts on a reset, the validated result resolves the
 * call, and an error event becomes the typed client error. The readable part
 * of the still-arriving JSON is pulled out for the live preview.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({
  apiClient: { openStream: vi.fn() },
  broadcastTokenBudget: vi.fn(),
}));

import { apiClient } from "@/lib/api-client";
import { streamAiJson } from "@/lib/services/ai-stream";
import { AIUsageLimitError } from "@/lib/errors";
import { partialJsonStrings } from "@shared/ai-stream";
import { encodeSseJson } from "@shared/sse-json";
import { ValuePropositionResponseSchema } from "@shared/tool-schemas";

const PITCH = {
  valueProposition: "I cut infrastructure spend 28% while scaling to 2,000 seats.",
  executiveSummary: "IT director with 15 years in healthcare networks.",
  keyStrengths: ["Vendor consolidation"],
  alignmentPoints: ["Your cloud migration"],
  callToAction: "Let's talk.",
  confidenceScore: 0.82,
};

/** An SSE response whose body arrives in the given raw chunks. */
function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return new Response(body, { headers: { "Content-Type": "text/event-stream; charset=utf-8" } });
}

/** Split a string into n-char pieces — frames break mid-way, as on a real network. */
const pieces = (s: string, n: number) => Array.from({ length: Math.ceil(s.length / n) }, (_, i) => s.slice(i * n, i * n + n));

describe("streamAiJson", () => {
  beforeEach(() => vi.mocked(apiClient.openStream).mockReset());

  it("reports the growing text, restarts on reset, and resolves with the validated result", async () => {
    const answer = JSON.stringify(PITCH);
    const stream =
      encodeSseJson({ type: "delta", text: '{"valueProp' }) +
      encodeSseJson({ type: "ping" }) +
      encodeSseJson({ type: "reset" }) +
      encodeSseJson({ type: "delta", text: answer.slice(0, 40) }) +
      encodeSseJson({ type: "delta", text: answer.slice(40) }) +
      encodeSseJson({ type: "result", data: PITCH, tokenBudget: { remaining: 1000 } });
    vi.mocked(apiClient.openStream).mockResolvedValue(sseResponse(pieces(stream, 17)));

    const seen: string[] = [];
    const out = await streamAiJson("/api/ai/tools/value-proposition", { jobContent: "x", resumeContent: "y" }, {
      schema: ValuePropositionResponseSchema,
      onText: (t) => seen.push(t),
    });

    expect(out).toEqual(PITCH);
    expect(seen).toEqual(['{"valueProp', "", answer.slice(0, 40), answer]);
    const [endpoint, config] = vi.mocked(apiClient.openStream).mock.calls[0];
    expect(endpoint).toBe("/api/ai/tools/value-proposition");
    expect(config?.headers?.Accept).toBe("text/event-stream");
  });

  it("turns an over-budget error event into the upgrade error", async () => {
    vi.mocked(apiClient.openStream).mockResolvedValue(
      sseResponse([encodeSseJson({ type: "error", code: "AI_USAGE_LIMIT_REACHED", message: "Upgrade to keep using AI tools.", status: 429 })]),
    );
    await expect(streamAiJson("/api/ai/tools/resume-score", {})).rejects.toBeInstanceOf(AIUsageLimitError);
  });

  it("rejects a result that fails the schema", async () => {
    vi.mocked(apiClient.openStream).mockResolvedValue(sseResponse([encodeSseJson({ type: "result", data: { valueProposition: 3 } })]));
    await expect(streamAiJson("/x", {}, { schema: ValuePropositionResponseSchema })).rejects.toThrow(/Validation failed/);
  });

  it("a stream that ends without a result is a network error", async () => {
    vi.mocked(apiClient.openStream).mockResolvedValue(sseResponse([encodeSseJson({ type: "delta", text: "{" })]));
    await expect(streamAiJson("/x", {})).rejects.toThrow(/without a result/);
  });

  it("falls back to the JSON envelope when the API does not stream", async () => {
    vi.mocked(apiClient.openStream).mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: PITCH }), { headers: { "Content-Type": "application/json" } }),
    );
    expect(await streamAiJson("/x", {}, { schema: ValuePropositionResponseSchema })).toEqual(PITCH);
  });
});

describe("partialJsonStrings", () => {
  it("pulls finished and still-arriving values of the chosen keys, in order", () => {
    const partial = '{"overallScore":71,"recommendations":[{"severity":"critical","title":"Add a metric","description":"x"},{"title":"Standardize da';
    expect(partialJsonStrings(partial, ["title"])).toEqual([
      { key: "title", text: "Add a metric", closed: true },
      { key: "title", text: "Standardize da", closed: false },
    ]);
  });

  it("decodes escapes and ignores keys it was not asked for", () => {
    const text = '{"valueProposition":"I said \\"cut 28%\\"\\nthen","grade":"B"}';
    expect(partialJsonStrings(text, ["valueProposition"])).toEqual([{ key: "valueProposition", text: 'I said "cut 28%"\nthen', closed: true }]);
  });

  it("does not mistake array strings or a split escape for values", () => {
    expect(partialJsonStrings('{"keyStrengths":["title","x"],"title":"A\\', ["title"])).toEqual([{ key: "title", text: "A", closed: false }]);
    expect(partialJsonStrings("", ["title"])).toEqual([]);
  });
});
