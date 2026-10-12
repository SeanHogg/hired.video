/**
 * UsageReportService — traffic + funnel reads over the usage tracker, with
 * funnels resolved from the shared registry (no per-funnel branches).
 *
 * Run: node --import tsx --test src/services/usage/__tests__/usage-report-service.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { UsageReportService } from "../UsageReportService.js";
import { USAGE_FUNNELS, findFunnel, toTrafficWindow, type FunnelStepMatch } from "../../../../../shared/usage.js";

const NOW = new Date("2026-10-10T12:00:00Z");

function fakeRepo(counts: number[]) {
  const calls: { steps?: readonly FunnelStepMatch[]; since?: Date } = {};
  return {
    calls,
    repo: {
      trafficSeries: async (since: Date) => {
        calls.since = since;
        return [{ day: "2026-10-09", visitors: 3, signedIn: 1, pageViews: 9 }];
      },
      trafficSources: async () => ({
        entryPaths: [{ key: "/", visitors: 2 }],
        referrers: [{ key: "(direct)", visitors: 2 }],
        utmSources: [{ key: "(none)", visitors: 2 }],
      }),
      funnelCounts: async (steps: readonly FunnelStepMatch[], since: Date) => {
        calls.steps = steps;
        calls.since = since;
        return counts;
      },
    },
  };
}

describe("UsageReportService", () => {
  it("builds the traffic report for the window", async () => {
    const { repo, calls } = fakeRepo([]);
    const report = await new UsageReportService(repo, () => NOW).getTraffic(7);
    assert.equal(report.days, 7);
    assert.equal(report.series[0].visitors, 3);
    assert.equal(report.entryPaths[0].key, "/");
    assert.equal(calls.since?.toISOString(), "2026-10-03T12:00:00.000Z");
  });

  it("maps funnel counts onto the registry's steps in order", async () => {
    const funnel = USAGE_FUNNELS[1];
    const counts = funnel.steps.map((_, i) => 10 - i);
    const { repo, calls } = fakeRepo(counts);
    const report = await new UsageReportService(repo, () => NOW).getFunnel(funnel.id, 90);
    assert.ok(report);
    assert.deepEqual(report.steps.map((s) => s.id), funnel.steps.map((s) => s.id));
    assert.deepEqual(report.steps.map((s) => s.visitors), counts);
    assert.deepEqual(calls.steps, funnel.steps.map((s) => s.match));
  });

  it("returns null for an unregistered funnel", async () => {
    const { repo } = fakeRepo([]);
    assert.equal(await new UsageReportService(repo, () => NOW).getFunnel("nope", 30), null);
  });
});

describe("funnel registry", () => {
  it("has unique funnel ids and unique step ids per funnel", () => {
    const ids = USAGE_FUNNELS.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const f of USAGE_FUNNELS) {
      assert.equal(new Set(f.steps.map((s) => s.id)).size, f.steps.length, f.id);
      assert.ok(findFunnel(f.id));
    }
  });

  it("clamps the window to an offered value", () => {
    assert.equal(toTrafficWindow("7"), 7);
    assert.equal(toTrafficWindow("90"), 90);
    assert.equal(toTrafficWindow("365"), 30);
    assert.equal(toTrafficWindow(undefined), 30);
  });
});
