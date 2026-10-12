import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createResumeParseEventDecoder,
  encodeResumeParseEvent,
  type ResumeParseEvent,
} from "../resume-parse-stream.js";

const EVENTS: ResumeParseEvent[] = [
  { type: "stage", stage: "ocr", page: 1, pages: 3 },
  { type: "preview", content: { basics: { name: "Jess Rivera" }, work: [{ name: "Acme Health" }] } },
  { type: "ping" },
  { type: "result", content: { basics: { name: "Jess Rivera — “Senior” Designer" } } },
];

describe("résumé parse event stream", () => {
  it("round-trips events through encode → decode", () => {
    const decode = createResumeParseEventDecoder();
    assert.deepEqual(decode(EVENTS.map(encodeResumeParseEvent).join("")), EVENTS);
  });

  it("reassembles frames split across arbitrary chunk boundaries", () => {
    const wire = EVENTS.map(encodeResumeParseEvent).join("");
    const decode = createResumeParseEventDecoder();
    const out: ResumeParseEvent[] = [];
    for (let i = 0; i < wire.length; i += 7) out.push(...decode(wire.slice(i, i + 7)));
    assert.deepEqual(out, EVENTS);
  });

  it("accepts CRLF framing", () => {
    const decode = createResumeParseEventDecoder();
    assert.deepEqual(decode(`data: {"type":"ping"}\r\n\r\n`), [{ type: "ping" }]);
  });

  it("skips comments and non-JSON frames instead of throwing", () => {
    const decode = createResumeParseEventDecoder();
    assert.deepEqual(decode(`: keep-alive\n\ndata: not json\n\ndata: {"type":"ping"}\n\n`), [{ type: "ping" }]);
  });

  it("holds an incomplete trailing frame until it completes", () => {
    const decode = createResumeParseEventDecoder();
    assert.deepEqual(decode(`data: {"type":"pi`), []);
    assert.deepEqual(decode(`ng"}\n\n`), [{ type: "ping" }]);
  });
});
