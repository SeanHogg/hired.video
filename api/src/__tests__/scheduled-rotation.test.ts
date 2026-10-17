/**
 * Regression tests for the cron plan (services/scheduling/cron-plan.ts) and
 * the KV work-marker decisions (work-signals.ts) — gaps #1589, #1593,
 * #1602, #1617 and the W1-B Neon remediation.
 *
 * Why this matters: in 2026-05 the /5 tick fired every sweep on every tick
 * and tripped the Worker CPU limit; later the same single /5 tick kept Neon
 * compute awake 24/7 by querying ~12–16 times every 5 minutes. These tests
 * pin (a) which cron does what, (b) that daily jobs run exactly once a day,
 * and (c) that the marker logic only writes KV on a change of state.
 */

import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  CRON,
  CRON_SCHEDULES,
  cronKind,
  hourlyJobsFor,
  isHalfHourInterval,
  isMonthlyCloseWindow,
  isPartnerPoolCloseWindow,
  isPayoutReleaseWindow,
} from "../services/scheduling/cron-plan.js";
import {
  WORK_DUE_SLACK_MS,
  dueQueues,
  idleUntilMs,
  nextMarkerAction,
  type WorkMarkers,
} from "../services/scheduling/work-signals.js";
import { WORKER_DUE_GRACE_MS, isWorkerDueAt } from "../workers/runner.js";
import type { WorkerDefinition } from "../workers/types.js";

const utc = (iso: string) => new Date(iso);
const HOUR = 60 * 60 * 1000;

describe("cronKind — dispatch by event.cron", () => {
  it("maps each registered schedule to its plan", () => {
    assert.equal(cronKind(CRON.TICK), "tick");
    assert.equal(cronKind(CRON.INTERVAL), "interval");
    assert.equal(cronKind(CRON.HOURLY), "hourly");
  });
  it("falls back to the tick for unknown / missing crons", () => {
    assert.equal(cronKind(undefined), "tick");
    assert.equal(cronKind("* * * * *"), "tick");
  });
  it("wrangler.toml registers exactly CRON_SCHEDULES", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const toml = readFileSync(resolve(here, "../../wrangler.toml"), "utf8");
    const line = toml.split("\n").find((l) => l.trim().startsWith("crons ="));
    assert.ok(line, "no crons line in wrangler.toml");
    const listed = [...line!.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(listed, [...CRON_SCHEDULES]);
  });
});

describe("isHalfHourInterval — job-board scrape on :00/:30 only", () => {
  it("fires on the :00 and :30 interval runs", () => {
    for (const min of [0, 30]) {
      assert.equal(isHalfHourInterval(utc(`2026-05-26T12:${String(min).padStart(2, "0")}:00Z`)), true);
    }
  });
  it("does NOT fire on :15 / :45", () => {
    for (const min of [15, 45]) {
      assert.equal(isHalfHourInterval(utc(`2026-05-26T12:${min}:00Z`)), false);
    }
  });
});

describe("hourlyJobsFor — daily jobs run exactly once a day", () => {
  const day = (h: number) => utc(`2026-05-26T${String(h).padStart(2, "0")}:02:00Z`);
  const countOver24h = (job: string) =>
    Array.from({ length: 24 }, (_, h) => hourlyJobsFor(day(h))).filter((jobs) => jobs.includes(job as never)).length;

  it("every hour reconciles markers first", () => {
    for (let h = 0; h < 24; h++) assert.equal(hourlyJobsFor(day(h))[0], "reconcile-markers");
  });
  it("seed, maintenance (retention → counters → fraud), drift, geocoder, placement: once per day", () => {
    for (const job of ["seed-superadmin", "maintenance", "model-catalog-drift", "geocoder-refresh", "placement-stage-events"]) {
      assert.equal(countOver24h(job), 1, `${job} should run once per day`);
    }
  });
  it("keeps the historical hours", () => {
    assert.ok(hourlyJobsFor(day(3)).includes("seed-superadmin"));
    assert.ok(hourlyJobsFor(day(4)).includes("maintenance"));
    assert.ok(hourlyJobsFor(day(5)).includes("model-catalog-drift"));
    assert.ok(hourlyJobsFor(day(6)).includes("placement-stage-events"));
  });
});

describe("monthly / weekly windows (hour granularity)", () => {
  it("month close: 1st of month, 00:xx–03:xx", () => {
    assert.equal(isMonthlyCloseWindow(utc("2026-06-01T01:02:00Z")), true);
    assert.equal(isMonthlyCloseWindow(utc("2026-05-01T03:02:00Z")), true);
    assert.equal(isMonthlyCloseWindow(utc("2026-05-01T04:02:00Z")), false);
    assert.equal(isMonthlyCloseWindow(utc("2026-05-02T01:02:00Z")), false);
  });
  it("partner pool: 1st of month, 02:xx only", () => {
    assert.equal(isPartnerPoolCloseWindow(utc("2026-05-01T02:02:00Z")), true);
    assert.equal(isPartnerPoolCloseWindow(utc("2026-05-01T03:02:00Z")), false);
    assert.equal(isPartnerPoolCloseWindow(utc("2026-05-02T02:02:00Z")), false);
  });
  it("payout release: Tuesday 09:xx only", () => {
    assert.equal(isPayoutReleaseWindow(utc("2026-05-26T09:02:00Z")), true); // Tuesday
    assert.equal(isPayoutReleaseWindow(utc("2026-05-27T09:02:00Z")), false);
    assert.equal(isPayoutReleaseWindow(utc("2026-05-26T10:02:00Z")), false);
  });
});

describe("work markers — KV writes only on a change of state", () => {
  const now = Date.parse("2026-05-26T12:00:00Z");

  it("nothing pending: delete an existing marker, otherwise no-op", () => {
    assert.deepEqual(nextMarkerAction(now - 1000, null, now), { kind: "delete" });
    assert.deepEqual(nextMarkerAction(null, null, now), { kind: "none" });
  });
  it("due now (or within the slack): keep a due marker without writing", () => {
    assert.deepEqual(nextMarkerAction(now - 60_000, now - 5, now), { kind: "none" });
    assert.deepEqual(nextMarkerAction(now - 60_000, now + WORK_DUE_SLACK_MS, now), { kind: "none" });
    assert.deepEqual(nextMarkerAction(null, now, now), { kind: "put", value: now });
    assert.deepEqual(nextMarkerAction(now + HOUR, now, now), { kind: "put", value: now });
  });
  it("due later: write the time once, then no-op", () => {
    assert.deepEqual(nextMarkerAction(null, now + HOUR, now), { kind: "put", value: now + HOUR });
    assert.deepEqual(nextMarkerAction(now + HOUR, now + HOUR, now), { kind: "none" });
  });
  it("dueQueues: only markers at/before now; no KV → everything", () => {
    const markers: WorkMarkers = new Map([
      ["followups", now - 1],
      ["campaigns", now + HOUR],
      ["job-queue", null],
    ]);
    assert.deepEqual(dueQueues(markers, now, ["followups", "campaigns", "job-queue"]), ["followups"]);
    assert.deepEqual(dueQueues(null, now, ["followups", "campaigns"]), ["followups", "campaigns"]);
  });
  it("idle back-off expires just before the next top of hour, ≥ 60s ahead", () => {
    const at = Date.parse("2026-05-26T12:15:00Z");
    assert.equal(idleUntilMs(at), Date.parse("2026-05-26T12:58:00Z"));
    const late = Date.parse("2026-05-26T12:57:30Z");
    assert.equal(idleUntilMs(late), Date.parse("2026-05-26T13:58:00Z"));
  });
});

describe("isWorkerDueAt — cadence gate with tick grace", () => {
  const hourly = { name: "w", cadenceMs: HOUR } as WorkerDefinition;
  const now = Date.parse("2026-05-26T13:00:01Z");
  it("never ran → due", () => {
    assert.equal(isWorkerDueAt(hourly, undefined, now), true);
  });
  it("a run that started a few seconds past the previous tick is still due", () => {
    assert.equal(isWorkerDueAt(hourly, new Date(Date.parse("2026-05-26T12:00:04Z")), now), true);
  });
  it("not due before cadence minus grace", () => {
    assert.equal(isWorkerDueAt(hourly, new Date(now - HOUR + WORKER_DUE_GRACE_MS + 60_000), now), false);
  });
});
