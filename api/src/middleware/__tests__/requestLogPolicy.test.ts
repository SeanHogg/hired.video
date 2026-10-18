/**
 * decideRequestLog — which requests become request_logs rows.
 *
 * Sampled (1 in SAMPLE_RATE, weight SAMPLE_RATE): fast 2xx/3xx of ANY method
 * and routine 401/403/404/429. Always written (weight 1): 5xx, other 4xx,
 * slow requests, a signed-in user's first request of the day. Never written:
 * preflights/HEAD, health, crawler/beacon paths, bots.
 *
 * Run: node --import tsx --test src/middleware/__tests__/requestLogPolicy.test.ts
 */
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  SAMPLE_RATE,
  SAMPLED_STATUSES,
  SLOW_REQUEST_MS,
  __resetRequestLogPolicyForTests,
  decideRequestLog,
  type RequestLogInput,
} from "../requestLogPolicy.js";

const HIT = () => 0; // random() * N < 1 → sampled in
const MISS = () => 0.99; // sampled out
const NOW = new Date("2026-10-17T12:00:00Z");

function req(over: Partial<RequestLogInput> = {}): RequestLogInput {
  return { method: "GET", path: "/api/jobs", status: 200, durationMs: 20, userAgent: "Mozilla/5.0", ...over };
}

beforeEach(() => __resetRequestLogPolicyForTests());

describe("decideRequestLog — skips", () => {
  for (const r of [
    req({ method: "OPTIONS" }),
    req({ method: "HEAD" }),
    req({ path: "/api/health" }),
    req({ path: "/api/analytics/events", method: "POST", status: 500 }),
    req({ path: "/api/og/job/1" }),
    req({ userAgent: "Googlebot/2.1", status: 500 }),
  ]) {
    it(`never logs ${r.method} ${r.path} (${r.userAgent})`, () => {
      assert.deepEqual(decideRequestLog(r, HIT, NOW), { log: false });
    });
  }
});

describe("decideRequestLog — always written", () => {
  it("5xx of any method", () => {
    assert.deepEqual(decideRequestLog(req({ status: 500 }), MISS, NOW), { log: true, weight: 1 });
    assert.deepEqual(decideRequestLog(req({ method: "POST", status: 503 }), MISS, NOW), { log: true, weight: 1 });
  });

  it("slow requests (>= SLOW_REQUEST_MS), including writes", () => {
    const slow = req({ method: "PATCH", durationMs: SLOW_REQUEST_MS });
    assert.deepEqual(decideRequestLog(slow, MISS, NOW), { log: true, weight: 1 });
  });

  it("non-routine 4xx (400 / 409 / 422)", () => {
    for (const status of [400, 409, 422]) {
      assert.deepEqual(decideRequestLog(req({ method: "POST", status }), MISS, NOW), { log: true, weight: 1 });
    }
  });

  it("a signed-in user's first sampled-class request of the day", () => {
    const r = req({ userId: "user-1" });
    assert.deepEqual(decideRequestLog(r, MISS, NOW), { log: true, weight: 1 });
    assert.deepEqual(decideRequestLog(r, MISS, NOW), { log: false }, "second request falls back to sampling");
  });
});

describe("decideRequestLog — sampled with sample_weight", () => {
  it("fast successful non-GET writes are sampled like GETs", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      assert.deepEqual(decideRequestLog(req({ method, status: 201 }), HIT, NOW), { log: true, weight: SAMPLE_RATE });
      assert.deepEqual(decideRequestLog(req({ method, status: 204 }), MISS, NOW), { log: false });
    }
  });

  it("3xx is sampled", () => {
    assert.deepEqual(decideRequestLog(req({ status: 302 }), MISS, NOW), { log: false });
  });

  it("401 / 403 / 404 / 429 are sampled", () => {
    assert.deepEqual([...SAMPLED_STATUSES].sort(), [401, 403, 404, 429]);
    for (const status of SAMPLED_STATUSES) {
      assert.deepEqual(decideRequestLog(req({ status }), HIT, NOW), { log: true, weight: SAMPLE_RATE });
      assert.deepEqual(decideRequestLog(req({ method: "POST", status }), MISS, NOW), { log: false });
    }
  });

  it("weighted count is unbiased: ~1 in SAMPLE_RATE rows, each weighted SAMPLE_RATE", () => {
    // Evenly spread uniform draws over [0, 1).
    let i = 0;
    const rand = () => ((i++ * 0.6180339887) % 1);
    let weighted = 0;
    const n = 20_000;
    for (let k = 0; k < n; k++) {
      const d = decideRequestLog(req({ method: "POST", status: 200 }), rand, NOW);
      if (d.log) weighted += d.weight;
    }
    assert.ok(Math.abs(weighted - n) / n < 0.1, `weighted ${weighted} ≈ ${n}`);
  });
});
