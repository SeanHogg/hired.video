/**
 * ingestAnalyticsEvents — batched dispatch behind POST /api/analytics/events.
 *
 * A beacon of up to 50 events must cost a constant number of statements:
 * one activity_logs INSERT, one owner lookup call, one artifact_views INSERT
 * and one usage call — regardless of how many events of each kind arrive.
 * Validation / skip rules and the { accepted, rejected } shape are unchanged.
 *
 * Run: node --import tsx --test src/services/analytics/__tests__/event-ingest.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  ingestAnalyticsEvents,
  classifyEvents,
  parseEventsBody,
  type AnalyticsRequestContext,
} from "../event-kinds.js";
import type { AnalyticsIngestSink } from "../analyticsIngestSink.js";
import { artifactRefKey, planOwnerLookups, type ArtifactRef } from "../artifactOwners.js";
import type { ActivityLogInsert } from "../../../repositories/auditRepository.js";
import type { NewArtifactView } from "../artifactView.js";
import type { TrackUsageInput } from "../../../../../shared/usage.js";
import type { UsageRequestContext } from "../../usage/UsageService.js";

const OWNER = "11111111-1111-4111-8111-111111111111";
const VIEWER = "22222222-2222-4222-8222-222222222222";
const RESUME_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const RESUME_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const VIDEO = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const JOB = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const COMPANY = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function ctx(over: Partial<AnalyticsRequestContext> = {}): AnalyticsRequestContext {
  return {
    userId: VIEWER,
    roles: ["job_seeker"],
    ipAddress: "203.0.113.7",
    ipHash: "hash-1",
    ipCountry: "CA",
    countryHeader: "CA",
    region: "ON",
    userAgent: "Mozilla/5.0",
    referer: "https://hired.video/jobs",
    ...over,
  };
}

class FakeSink implements AnalyticsIngestSink {
  lookupCalls: ArtifactRef[][] = [];
  activityCalls: ActivityLogInsert[][] = [];
  viewCalls: NewArtifactView[][] = [];
  usageCalls: TrackUsageInput[][] = [];
  owners = new Map<string, string | null>();
  failActivities = false;

  async lookupOwners(refs: readonly ArtifactRef[]) {
    this.lookupCalls.push([...refs]);
    const out = new Map<string, string | null>();
    for (const r of refs) out.set(artifactRefKey(r.kind, r.id), this.owners.get(r.id) ?? null);
    return out;
  }
  async insertActivities(rows: readonly ActivityLogInsert[]) {
    if (this.failActivities) throw new Error("activity insert failed");
    this.activityCalls.push([...rows]);
  }
  async insertArtifactViews(rows: readonly NewArtifactView[]) {
    this.viewCalls.push([...rows]);
  }
  async recordUsage(batches: readonly TrackUsageInput[], _ctx: UsageRequestContext) {
    this.usageCalls.push([...batches]);
  }
}

function usage(visitorId: string, path: string) {
  return { kind: "usage", visitorId, consent: true, events: [{ type: "page_view", path }] };
}

describe("ingestAnalyticsEvents — constant statements per batch", () => {
  it("folds a full 50-event mixed beacon into one write per table", async () => {
    const sink = new FakeSink();
    sink.owners.set(RESUME_A, OWNER);
    const events: unknown[] = [];
    for (let i = 0; i < 20; i++) events.push({ kind: "artifact_view", artifactKind: "resume", artifactId: RESUME_A });
    for (let i = 0; i < 10; i++) events.push({ kind: "activity", event: "pageview" });
    for (let i = 0; i < 5; i++) events.push({ kind: "ad", slotId: "rail", action: "click" });
    for (let i = 0; i < 5; i++) events.push({ kind: "job_view", jobId: JOB });
    for (let i = 0; i < 5; i++) events.push({ kind: "company_view", companyId: COMPANY, source: "boost" });
    for (let i = 0; i < 5; i++) events.push(usage("visitor-abcdef-1", `/p/${i}`));

    const res = await ingestAnalyticsEvents(events, ctx(), sink);

    assert.deepEqual(res, { accepted: 50, rejected: 0 });
    assert.equal(sink.lookupCalls.length, 1, "one owner-lookup call");
    assert.equal(sink.activityCalls.length, 1, "one activity_logs insert");
    assert.equal(sink.activityCalls[0].length, 15);
    assert.equal(sink.viewCalls.length, 1, "one artifact_views insert");
    assert.equal(sink.viewCalls[0].length, 30);
    assert.equal(sink.usageCalls.length, 1, "one usage call");
    assert.equal(sink.usageCalls[0].length, 5);
  });

  it("maps ad events to ad_click / ad_impression activity rows with request identity", async () => {
    const sink = new FakeSink();
    await ingestAnalyticsEvents(
      [
        { kind: "ad", slotId: "rail", action: "click", page: "/jobs" },
        { kind: "ad" },
      ],
      ctx(),
      sink,
    );
    const rows = sink.activityCalls[0];
    assert.equal(rows[0].action, "ad_click");
    assert.deepEqual(rows[0].metadata, { slotId: "rail", page: "/jobs" });
    assert.equal(rows[1].action, "ad_impression");
    assert.deepEqual(rows[1].metadata, { slotId: "unknown", page: null });
    assert.equal(rows[0].ipAddress, "203.0.113.7");
    assert.equal(rows[0].userId, VIEWER);
  });

  it("stamps the server-resolved owner and skips the owner's own views", async () => {
    const sink = new FakeSink();
    sink.owners.set(RESUME_A, OWNER);
    sink.owners.set(RESUME_B, VIEWER); // viewer owns B → self-view
    await ingestAnalyticsEvents(
      [
        { kind: "artifact_view", artifactKind: "resume", artifactId: RESUME_A, percentConsumed: 0.5 },
        { kind: "artifact_view", artifactKind: "resume", artifactId: RESUME_B },
        { kind: "artifact_view", artifactKind: "video", artifactId: VIDEO, totalEngagementSec: 12 },
      ],
      ctx(),
      sink,
    );
    const rows = sink.viewCalls[0];
    assert.equal(rows.length, 2);
    assert.equal(rows[0].ownerUserId, OWNER);
    assert.equal(rows[0].engagementUnit, "%");
    assert.equal(rows[0].referrer, "https://hired.video/jobs");
    assert.equal(rows[1].artifactId, VIDEO);
    assert.equal(rows[1].ownerUserId, null);
    assert.equal(rows[1].engagementUnit, "s");
    assert.equal(rows[1].totalEngagementSec, 12);
  });

  it("writes listing views with event_type listing_view and truncated source/UA", async () => {
    const sink = new FakeSink();
    await ingestAnalyticsEvents([{ kind: "job_view", jobId: JOB }], ctx({ userAgent: "x".repeat(600) }), sink);
    assert.equal(sink.lookupCalls.length, 0, "no owner lookup without artifact_view events");
    const [row] = sink.viewCalls[0];
    assert.equal(row.eventType, "listing_view");
    assert.equal(row.artifactKind, "job");
    assert.equal(row.source, "organic");
    assert.equal(row.ipCountry, "CA");
    assert.equal(row.region, "ON");
    assert.equal(row.userAgent?.length, 512);
  });

  it("counts unknown kinds and schema failures as rejected and writes nothing for them", async () => {
    const sink = new FakeSink();
    const res = await ingestAnalyticsEvents(
      [
        { kind: "nope" },
        null,
        "string",
        { kind: "job_view", jobId: "not-a-uuid" },
        { kind: "usage", visitorId: "short", consent: true, events: [] },
      ],
      ctx(),
      sink,
    );
    assert.deepEqual(res, { accepted: 0, rejected: 5 });
    assert.equal(sink.viewCalls.length + sink.activityCalls.length + sink.usageCalls.length, 0);
  });

  it("skips an activity whose entityId isn't UUID-shaped (would fail the whole insert)", async () => {
    const sink = new FakeSink();
    const res = await ingestAnalyticsEvents(
      [
        { kind: "activity", event: "open", entityType: "job", entityId: JOB },
        { kind: "activity", event: "open", entityType: "job", entityId: "job-123" },
      ],
      ctx(),
      sink,
    );
    assert.deepEqual(res, { accepted: 2, rejected: 0 });
    assert.equal(sink.activityCalls[0].length, 1);
    assert.equal(sink.activityCalls[0][0].entityId, JOB);
  });

  it("skips an artifact view whose integer fields overflow Postgres int", async () => {
    const sink = new FakeSink();
    await ingestAnalyticsEvents(
      [
        { kind: "artifact_view", artifactKind: "video", artifactId: VIDEO, totalEngagementSec: 3_000_000_000 },
        { kind: "artifact_view", artifactKind: "video", artifactId: VIDEO, totalEngagementSec: 3 },
      ],
      ctx(),
      sink,
    );
    assert.equal(sink.viewCalls[0].length, 1);
  });

  it("isolates table writes: a failed activity insert still writes views + usage", async () => {
    const sink = new FakeSink();
    sink.failActivities = true;
    const res = await ingestAnalyticsEvents(
      [{ kind: "activity" }, { kind: "job_view", jobId: JOB }, usage("visitor-abcdef-2", "/")],
      ctx(),
      sink,
    );
    assert.deepEqual(res, { accepted: 3, rejected: 0 });
    assert.equal(sink.viewCalls.length, 1);
    assert.equal(sink.usageCalls.length, 1);
  });

  it("passes request identity (never the body) to the usage writer", async () => {
    let seenCtx: unknown;
    const sink = new FakeSink();
    sink.recordUsage = async (batches, c) => {
      sink.usageCalls.push([...batches]);
      seenCtx = c;
    };
    await ingestAnalyticsEvents([usage("visitor-abcdef-3", "/a")], ctx({ userId: null, roles: null }), sink);
    assert.deepEqual(seenCtx, { userId: null, roles: null, country: "CA", userAgent: "Mozilla/5.0" });
  });
});

describe("classifyEvents / parseEventsBody", () => {
  it("groups by kind", () => {
    const { byKind, accepted } = classifyEvents([{ kind: "activity" }, { kind: "ad" }, { kind: "ad" }]);
    assert.equal(accepted, 3);
    assert.equal(byKind.activity.length, 1);
    assert.equal(byKind.ad.length, 2);
    assert.equal(byKind.activity[0].event, "pageview");
  });

  it("caps a batch envelope at 50 and treats a kinded body as one event", () => {
    const many = { events: Array.from({ length: 80 }, () => ({ kind: "activity" })) };
    assert.equal(parseEventsBody(JSON.stringify(many))?.length, 50);
    assert.equal(parseEventsBody(JSON.stringify(usage("visitor-abcdef-4", "/")))?.length, 1);
    assert.equal(parseEventsBody("[1,2]"), null);
    assert.equal(parseEventsBody("not json"), null);
  });
});

describe("planOwnerLookups — one query per owner source", () => {
  it("collapses studio kinds into one studio_projects lookup and dedupes ids", () => {
    const groups = planOwnerLookups([
      { kind: "video", id: VIDEO },
      { kind: "podcast", id: VIDEO },
      { kind: "image", id: RESUME_B },
      { kind: "resume", id: RESUME_A },
      { kind: "resume", id: RESUME_A },
      { kind: "article", id: RESUME_B },
      { kind: "service", id: RESUME_B },
    ]);
    const byTable = new Map(groups.map((g) => [g.source.table === "artifact_views" ? `av:${g.source.kind}` : g.source.table, g]));
    assert.equal(groups.length, 4);
    assert.deepEqual(byTable.get("studio_projects")?.ids, [VIDEO, RESUME_B]);
    assert.equal(byTable.get("studio_projects")?.refs.length, 3);
    assert.deepEqual(byTable.get("resume_information")?.ids, [RESUME_A]);
    assert.ok(byTable.has("av:article"));
    assert.ok(byTable.has("av:service"));
  });
});
