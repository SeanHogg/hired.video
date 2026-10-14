/**
 * isAbortError — the disconnect detector resume parse uses so a closed tab
 * is not treated as a model failure.
 *
 * Run: node --import tsx --test src/utils/__tests__/abort.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isAbortError } from "../abort.js";

describe("isAbortError", () => {
  it("matches AbortError from AbortSignal.throwIfAborted", () => {
    const c = new AbortController();
    c.abort();
    try {
      c.signal.throwIfAborted();
      assert.fail("expected throwIfAborted to throw");
    } catch (err) {
      assert.equal(isAbortError(err), true);
    }
  });

  it("matches a named AbortError and rejects ordinary failures", () => {
    const abort = new Error("The operation was aborted");
    abort.name = "AbortError";
    assert.equal(isAbortError(abort), true);
    assert.equal(isAbortError(new Error("gateway down")), false);
    assert.equal(isAbortError("aborted"), false);
    assert.equal(isAbortError(null), false);
  });
});
