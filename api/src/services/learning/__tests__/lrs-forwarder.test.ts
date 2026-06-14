/**
 * #1344 — external LRS forwarder tests (xAPI statement mirroring).
 *
 * Every xAPI statement we persist gets mirrored to each active
 * `external_lrs_targets` row for the statement's owner so enterprise
 * customers can consolidate analytics in their own LRS. The forwarder is
 * fire-and-forget per target (one slow/down target can't block the API
 * path) and records per-target success/error back onto the row so the
 * connector UI shows real status.
 *
 * These pin the contract that matters and was previously untested:
 *   - only ACTIVE targets for the owner are pinged,
 *   - the xAPI version header + the three auth modes (basic/bearer/none),
 *   - custom-header passthrough with the size/type guard,
 *   - success stamps last_success_at + clears last_error,
 *   - an HTTP error and a thrown fetch both land in last_error (and one
 *     bad target never stops the others — allSettled).
 *
 * `fetch` is stubbed per test; the DB is the shared fake-db.
 *
 * Run: node --import tsx --test src/services/learning/__tests__/lrs-forwarder.test.ts
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";

import { buildFakeDb } from "../../../handlers/__testing__/fake-db.js";
import { forwardStatementForUser } from "../lrs-forwarder.js";

const USER = "11111111-1111-4111-8111-111111111111";

const STATEMENT = {
  verb: { id: "http://adlnet.gov/expapi/verbs/completed", display: "completed" },
  object: { id: "https://hired.video/courses/abc", objectType: "Activity" },
  result: { completion: true, score: { scaled: 0.9 } },
};

// ── fetch stub harness ───────────────────────────────────────────────────

interface FetchCall {
  url: string;
  init: RequestInit & { headers: Record<string, string> };
}

let fetchCalls: FetchCall[] = [];
let originalFetch: typeof globalThis.fetch;

/** Install a fetch stub whose response is decided per-URL by `responder`. */
function installFetch(
  responder: (url: string) => { ok: boolean; status: number; text?: string } | Error,
) {
  fetchCalls = [];
  globalThis.fetch = (async (url: unknown, init: unknown) => {
    fetchCalls.push({
      url: String(url),
      init: init as FetchCall["init"],
    });
    const out = responder(String(url));
    if (out instanceof Error) throw out;
    return {
      ok: out.ok,
      status: out.status,
      text: async () => out.text ?? "",
    } as Response;
  }) as typeof globalThis.fetch;
}

beforeEach(() => {
  originalFetch = globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function target(over: Record<string, unknown>) {
  return {
    id: over.id ?? "t-1",
    userId: USER,
    endpoint: "https://lrs.example.com/xapi/statements",
    authMode: "none",
    authToken: null,
    customHeaders: null,
    active: true,
    lastSuccessAt: null,
    lastError: null,
    lastErrorAt: null,
    ...over,
  };
}

// ── tests ────────────────────────────────────────────────────────────────

describe("forwardStatementForUser — target selection", () => {
  it("makes no network call when the user has no LRS targets", async () => {
    installFetch(() => ({ ok: true, status: 200 }));
    const { db } = buildFakeDb({ external_lrs_targets: [] });
    await forwardStatementForUser(db as never, USER, STATEMENT);
    assert.equal(fetchCalls.length, 0);
  });

  it("pings only ACTIVE targets owned by the user", async () => {
    installFetch(() => ({ ok: true, status: 200 }));
    const { db } = buildFakeDb({
      external_lrs_targets: [
        target({ id: "active", endpoint: "https://a.example/xapi" }),
        target({ id: "inactive", endpoint: "https://b.example/xapi", active: false }),
        target({ id: "other-user", endpoint: "https://c.example/xapi", userId: "someone-else" }),
      ],
    });
    await forwardStatementForUser(db as never, USER, STATEMENT);
    assert.deepEqual(
      fetchCalls.map((c) => c.url),
      ["https://a.example/xapi"],
    );
  });
});

describe("forwardStatementForUser — request shape + auth", () => {
  it("POSTs the statement JSON with the xAPI version header", async () => {
    installFetch(() => ({ ok: true, status: 200 }));
    const { db } = buildFakeDb({ external_lrs_targets: [target({})] });
    await forwardStatementForUser(db as never, USER, STATEMENT);
    const call = fetchCalls[0]!;
    assert.equal(call.init.method, "POST");
    assert.equal(call.init.headers["Content-Type"], "application/json");
    assert.equal(call.init.headers["X-Experience-API-Version"], "1.0.3");
    assert.equal(call.init.body, JSON.stringify(STATEMENT));
  });

  it("sends NO Authorization header for authMode=none", async () => {
    installFetch(() => ({ ok: true, status: 200 }));
    const { db } = buildFakeDb({ external_lrs_targets: [target({ authMode: "none", authToken: "ignored" })] });
    await forwardStatementForUser(db as never, USER, STATEMENT);
    assert.equal(fetchCalls[0]!.init.headers["Authorization"], undefined);
  });

  it("sends a Basic Authorization header for authMode=basic", async () => {
    installFetch(() => ({ ok: true, status: 200 }));
    const { db } = buildFakeDb({ external_lrs_targets: [target({ authMode: "basic", authToken: "dXNlcjpwYXNz" })] });
    await forwardStatementForUser(db as never, USER, STATEMENT);
    assert.equal(fetchCalls[0]!.init.headers["Authorization"], "Basic dXNlcjpwYXNz");
  });

  it("sends a Bearer Authorization header for authMode=bearer", async () => {
    installFetch(() => ({ ok: true, status: 200 }));
    const { db } = buildFakeDb({ external_lrs_targets: [target({ authMode: "bearer", authToken: "tok123" })] });
    await forwardStatementForUser(db as never, USER, STATEMENT);
    assert.equal(fetchCalls[0]!.init.headers["Authorization"], "Bearer tok123");
  });

  it("omits Authorization when the auth mode is set but the token is null", async () => {
    installFetch(() => ({ ok: true, status: 200 }));
    const { db } = buildFakeDb({ external_lrs_targets: [target({ authMode: "bearer", authToken: null })] });
    await forwardStatementForUser(db as never, USER, STATEMENT);
    assert.equal(fetchCalls[0]!.init.headers["Authorization"], undefined);
  });

  it("merges valid custom headers but drops non-string and oversized values", async () => {
    installFetch(() => ({ ok: true, status: 200 }));
    const { db } = buildFakeDb({
      external_lrs_targets: [
        target({
          customHeaders: {
            "X-Tenant": "acme",
            "X-Big": "y".repeat(2000), // > 1024 → dropped
            "X-Bad": 42, // non-string → dropped
          },
        }),
      ],
    });
    await forwardStatementForUser(db as never, USER, STATEMENT);
    const headers = fetchCalls[0]!.init.headers;
    assert.equal(headers["X-Tenant"], "acme");
    assert.equal(headers["X-Big"], undefined);
    assert.equal(headers["X-Bad"], undefined);
  });
});

describe("forwardStatementForUser — status persistence", () => {
  it("stamps last_success_at and clears last_error on a 2xx", async () => {
    installFetch(() => ({ ok: true, status: 204 }));
    const { db, state } = buildFakeDb({
      external_lrs_targets: [target({ lastError: "previous failure" })],
    });
    await forwardStatementForUser(db as never, USER, STATEMENT);
    const row = state.external_lrs_targets[0]!;
    assert.ok(row.lastSuccessAt instanceof Date);
    assert.equal(row.lastError, null);
  });

  it("records last_error with the status + body on a non-2xx", async () => {
    installFetch(() => ({ ok: false, status: 500, text: "upstream boom" }));
    const { db, state } = buildFakeDb({ external_lrs_targets: [target({})] });
    await forwardStatementForUser(db as never, USER, STATEMENT);
    const row = state.external_lrs_targets[0]!;
    assert.match(String(row.lastError), /^HTTP 500: upstream boom/);
    assert.ok(row.lastErrorAt instanceof Date);
    assert.equal(row.lastSuccessAt, null);
  });

  it("records last_error when fetch throws (target down) and still pings the other targets", async () => {
    installFetch((url) => (url.includes("down") ? new Error("ECONNREFUSED") : { ok: true, status: 200 }));
    const { db, state } = buildFakeDb({
      external_lrs_targets: [
        target({ id: "down", endpoint: "https://down.example/xapi" }),
        target({ id: "up", endpoint: "https://up.example/xapi" }),
      ],
    });
    await forwardStatementForUser(db as never, USER, STATEMENT);
    assert.equal(fetchCalls.length, 2, "both targets attempted despite one failing");
    const down = state.external_lrs_targets.find((r) => r.id === "down")!;
    const up = state.external_lrs_targets.find((r) => r.id === "up")!;
    assert.match(String(down.lastError), /ECONNREFUSED/);
    assert.ok(up.lastSuccessAt instanceof Date);
    assert.equal(up.lastError, null);
  });
});
