/**
 * Subrequest budgets (#2047 / #2048): per-destination send costs (networks
 * that poll cost more), what still fits a run, and how many posts of a
 * metrics group one run can read (LinkedIn reads one post per call).
 *
 * Run: node --import tsx --test src/services/distribution/__tests__/subrequest-budget.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  affordableJobKinds,
  METRICS_SUBREQUEST_BUDGET,
  metricsGroupCost,
  metricsPostsThatFit,
  PUBLISH_SUBREQUEST_BUDGET,
  publishJobCost,
} from "../subrequest-budget.js";
import { JOB_KINDS } from "../drain-publish-jobs.js";

describe("publishJobCost", () => {
  it("costs polling networks more than pull-from-URL ones, and the feed least", () => {
    assert.ok(publishJobCost("instagram", "self") > publishJobCost("tiktok", "self"));
    assert.ok(publishJobCost("tiktok", "self") > publishJobCost("facebook", "self"));
    assert.ok(publishJobCost("feed", "self") < publishJobCost("youtube", "managed"));
    assert.equal(publishJobCost("youtube", "managed"), publishJobCost("tiktok", "managed"), "a brand submit doesn't upload");
  });

  it("stays inside the cron's 50 with room for the other sweeps", () => {
    assert.ok(PUBLISH_SUBREQUEST_BUDGET + METRICS_SUBREQUEST_BUDGET <= 40);
  });
});

describe("affordableJobKinds", () => {
  it("everything fits a fresh run; little fits a spent one", () => {
    assert.equal(affordableJobKinds(JOB_KINDS, PUBLISH_SUBREQUEST_BUDGET).length, JOB_KINDS.length);
    assert.deepEqual(affordableJobKinds(JOB_KINDS, 5), [{ destination: "feed", lane: "self" }]);
    assert.deepEqual(affordableJobKinds(JOB_KINDS, 4), []);
  });
});

describe("metrics reads", () => {
  it("costs a token plus one call per batch", () => {
    assert.equal(metricsGroupCost("youtube", 1), 3);
    assert.equal(metricsGroupCost("youtube", 51), 4);
    assert.equal(metricsGroupCost("facebook", 3), 4, "Facebook looks up the Page token first");
    assert.equal(metricsGroupCost("linkedin", 3), 5, "LinkedIn reads one post per call");
    assert.equal(metricsGroupCost("x", 0), 0);
  });

  it("trims a group to what fits, or none", () => {
    assert.equal(metricsPostsThatFit("linkedin", 10, 6), 4);
    assert.equal(metricsPostsThatFit("youtube", 40, 3), 40);
    assert.equal(metricsPostsThatFit("tiktok", 5, 2), 0);
  });
});
