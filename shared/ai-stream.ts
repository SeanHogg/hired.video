/**
 * Streamed AI answers (#1342) — the wire contract between a route that runs a
 * long LLM call with `LLMCallOpts.stream` (résumé scorer / optimizer, value
 * proposition) and the web client.
 *
 * A client opts in with `Accept: text/event-stream`; the same endpoint
 * otherwise answers with the classic JSON envelope. Events (SSE framing,
 * sse-json.ts):
 *
 *   delta   a piece of the model's raw answer, in order
 *   reset   the attempt so far failed and the next model starts over —
 *           discard every delta received
 *   result  the validated answer (the exact `data` the JSON envelope carries)
 *   error   the call failed; `code` / `status` match the JSON error envelope
 *   ping    heartbeat, so the idle deadline never fires on a live call
 *
 * The answers are JSON documents, so the UI shows the readable part as it
 * grows: `partialJsonStrings` pulls the string values of chosen keys out of
 * an unfinished JSON text (a pitch paragraph, recommendation titles).
 */

export const AI_STREAM_HEARTBEAT_MS = 10_000;

export type AiStreamEvent<T = unknown> =
  | { type: "delta"; text: string }
  | { type: "reset" }
  | { type: "result"; data: T; tokenBudget?: unknown }
  | { type: "error"; code: string; message: string; status: number; details?: unknown }
  | { type: "ping" };

const ESCAPES: Readonly<Record<string, string>> = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", '"': '"', "\\": "\\", "/": "/" };

/** Read a JSON string body starting at `from` (just after the opening
 *  quote). Returns the decoded text so far and whether it was closed. */
function readJsonString(src: string, from: number): { text: string; closed: boolean; end: number } {
  let text = "";
  let i = from;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '"') return { text, closed: true, end: i + 1 };
    if (ch === "\\") {
      const next = src[i + 1];
      if (next === undefined) break; // escape split across chunks
      if (next === "u") {
        const hex = src.slice(i + 2, i + 6);
        if (hex.length < 4) break;
        const code = Number.parseInt(hex, 16);
        if (!Number.isNaN(code)) text += String.fromCharCode(code);
        i += 6;
        continue;
      }
      text += ESCAPES[next] ?? next;
      i += 2;
      continue;
    }
    text += ch;
    i += 1;
  }
  return { text, closed: false, end: src.length };
}

/**
 * The string values of `keys` found so far in a JSON text that may still be
 * arriving, in document order. The last one may be unfinished (`closed:
 * false`). Keys are matched anywhere in the document (`"title": "…"` inside
 * a recommendations array counts). Pure and linear in the text length.
 */
export function partialJsonStrings(
  src: string,
  keys: readonly string[],
): Array<{ key: string; text: string; closed: boolean }> {
  const out: Array<{ key: string; text: string; closed: boolean }> = [];
  const wanted = new Set(keys);
  let i = 0;
  while (i < src.length) {
    const quote = src.indexOf('"', i);
    if (quote < 0) break;
    const name = readJsonString(src, quote + 1);
    if (!name.closed) break;
    // A key is followed by `:`; a string value is anything else.
    let j = name.end;
    while (j < src.length && /\s/.test(src[j])) j++;
    if (src[j] !== ":") {
      i = name.end;
      continue;
    }
    j++;
    while (j < src.length && /\s/.test(src[j])) j++;
    if (j >= src.length) break;
    if (src[j] !== '"') {
      i = j;
      continue;
    }
    const value = readJsonString(src, j + 1);
    if (wanted.has(name.text)) out.push({ key: name.text, text: value.text, closed: value.closed });
    if (!value.closed) break;
    i = value.end;
  }
  return out;
}
