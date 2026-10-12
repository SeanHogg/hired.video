/**
 * #1342 — the SSE framing every streamed AI answer uses (shared/sse-json.ts),
 * fed with frames shaped like a real streamed résumé score: deltas, a reset,
 * then the validated result.
 *
 * Run: node --import tsx --test shared/__tests__/sse-json.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createSseJsonDecoder, encodeSseJson } from "../sse-json.js";

type Ev = { type: string; [k: string]: unknown };

const EVENTS: Ev[] = [
  { type: "delta", text: '{"overallScore":7' },
  { type: "delta", text: '1,"atsScore":78,"summary":"Strong IT director résumé — “quantified” wins"' },
  { type: "reset" },
  { type: "result", data: { overallScore: 71, atsScore: 78, recommendations: [{ category: "impact", actionId: "add_bullet_metric" }] } },
];

describe("createSseJsonDecoder", () => {
  it("round-trips encoded events in order", () => {
    const decode = createSseJsonDecoder<Ev>();
    assert.deepEqual(decode(EVENTS.map(encodeSseJson).join("")), EVENTS);
  });

  it("reassembles frames split at every possible chunk size", () => {
    const wire = EVENTS.map(encodeSseJson).join("");
    for (const size of [1, 2, 3, 5, 13, 64]) {
      const decode = createSseJsonDecoder<Ev>();
      const out: Ev[] = [];
      for (let i = 0; i < wire.length; i += size) out.push(...decode(wire.slice(i, i + size)));
      assert.deepEqual(out, EVENTS, `chunk size ${size}`);
    }
  });

  it("delivers a CRLF frame as soon as it completes, even when the CRLF is split across chunks", () => {
    const decode = createSseJsonDecoder<Ev>();
    // A proxy re-framed with CRLF; the network split the final "\r\n" pair.
    assert.deepEqual(decode('data: {"type":"reset"}\r\n\r'), []);
    assert.deepEqual(decode("\n"), [{ type: "reset" }]);
  });

  it("skips keep-alive comments, non-JSON frames and objects without a type", () => {
    const decode = createSseJsonDecoder<Ev>();
    assert.deepEqual(
      decode(': keep-alive\n\ndata: <html>502</html>\n\ndata: {"kind":"delta"}\n\ndata: "x"\n\ndata: {"type":"reset"}\n\n'),
      [{ type: "reset" }],
    );
  });

  it("holds an unterminated frame until it completes", () => {
    const decode = createSseJsonDecoder<Ev>();
    assert.deepEqual(decode('data: {"type":"result","data":{"overallScore":71}}'), []);
    assert.deepEqual(decode("\n\n"), [{ type: "result", data: { overallScore: 71 } }]);
  });
});
