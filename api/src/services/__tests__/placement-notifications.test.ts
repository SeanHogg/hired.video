/**
 * Unit tests for the placement notification subscription service (#230).
 * Uses a plain fake repo + a spy dispatcher (no Drizzle / no DB).
 *
 * Run: node --import tsx --test src/services/__tests__/placement-notifications.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  PlacementNotificationService,
  placementEventCopy,
  isPlacementEvent,
  PLACEMENT_EVENTS,
  type IPlacementNotificationRepository,
  type PlacementSummary,
} from "../notifications/placement-notifications.js";

function fakeRepo(opts: {
  subscribers?: Record<string, string[]>; // event -> userIds
  placement?: PlacementSummary | null;
  started?: PlacementSummary[];
  expiring?: PlacementSummary[];
} = {}): IPlacementNotificationRepository & { subs: Array<{ p: string; u: string; e: string }> } {
  const subs: Array<{ p: string; u: string; e: string }> = [];
  const firedSet = new Set<string>();
  return {
    subs,
    async subscribe(p, u, e) {
      if (!subs.some((s) => s.p === p && s.u === u && s.e === e)) subs.push({ p, u, e });
    },
    async unsubscribe(p, u, e) {
      const i = subs.findIndex((s) => s.p === p && s.u === u && s.e === e);
      if (i >= 0) subs.splice(i, 1);
    },
    async listForPlacement(p) {
      return subs.filter((s) => s.p === p).map((s, i) => ({ id: `s${i}`, placementId: s.p, userId: s.u, event: s.e }));
    },
    async findSubscriberIds(p, e) {
      return opts.subscribers?.[e] ?? subs.filter((s) => s.p === p && s.e === e).map((s) => s.u);
    },
    async getPlacement() {
      return opts.placement === undefined
        ? { id: "p1", recruiterId: "r1", candidateName: "Ada Lovelace", jobTitle: "Engineer", companyName: "Acme" }
        : opts.placement;
    },
    async findStartedPlacements() {
      return (opts as any).started ?? [];
    },
    async findGuaranteeExpiringPlacements() {
      return (opts as any).expiring ?? [];
    },
    async markEventFired(_p: string, _e: string) {
      const key = `${_p}:${_e}`;
      if (firedSet.has(key)) return false;
      firedSet.add(key);
      return true;
    },
  };
}

function spyNotify() {
  const calls: any[] = [];
  const fn = (async (_deps: any, input: any) => {
    calls.push(input);
  }) as any;
  return { calls, fn };
}

describe("isPlacementEvent", () => {
  it("accepts the five known events and rejects others", () => {
    for (const e of PLACEMENT_EVENTS) assert.equal(isPlacementEvent(e), true);
    assert.equal(isPlacementEvent("bogus"), false);
    assert.equal(isPlacementEvent(123), false);
  });
});

describe("placementEventCopy", () => {
  const p: PlacementSummary = { id: "p1", recruiterId: "r1", candidateName: "Ada", jobTitle: "Eng", companyName: "Acme" };
  it("renders distinct copy per event including candidate + company", () => {
    assert.match(placementEventCopy("signed", p).message, /Ada was placed as Eng at Acme/);
    assert.equal(placementEventCopy("signed", p).title, "Placement confirmed");
    assert.match(placementEventCopy("first_day", p).message, /Ada starts at Acme today/);
    assert.match(placementEventCopy("guarantee_met", p).message, /cleared its guarantee/);
  });
  it("degrades gracefully when fields are missing", () => {
    const bare: PlacementSummary = { id: "p", recruiterId: "r", candidateName: null, jobTitle: null, companyName: null };
    assert.match(placementEventCopy("signed", bare).message, /A candidate was placed\./);
  });
});

describe("PlacementNotificationService.subscribe/unsubscribe/list", () => {
  it("subscribes idempotently and unsubscribes", async () => {
    const repo = fakeRepo();
    const { fn } = spyNotify();
    const svc = new PlacementNotificationService(repo, {}, fn);
    await svc.subscribe("p1", "u1", "signed");
    await svc.subscribe("p1", "u1", "signed"); // idempotent
    assert.equal(repo.subs.length, 1);
    const list = await svc.listForPlacement("p1");
    assert.equal(list.length, 1);
    await svc.unsubscribe("p1", "u1", "signed");
    assert.equal(repo.subs.length, 0);
  });

  it("subscribeAll opts a user into every event", async () => {
    const repo = fakeRepo();
    const svc = new PlacementNotificationService(repo, {}, spyNotify().fn);
    await svc.subscribeAll("p1", "r1");
    assert.equal(repo.subs.length, PLACEMENT_EVENTS.length);
  });
});

describe("PlacementNotificationService.notifyEvent", () => {
  it("dispatches to subscribers with opt-in email and a placement deep-link", async () => {
    const repo = fakeRepo({ subscribers: { signed: ["r1", "mgr2"] } });
    const { calls, fn } = spyNotify();
    const svc = new PlacementNotificationService(repo, {}, fn);
    await svc.notifyEvent("p1", "signed");
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].recipientIds, ["r1", "mgr2"]);
    assert.equal(calls[0].type, "placement_signed");
    assert.equal(calls[0].email, true);
    assert.match(calls[0].title, /Placement confirmed/);
    assert.match(calls[0].url, /placement=p1/);
  });

  it("is a no-op when there are no subscribers", async () => {
    const repo = fakeRepo({ subscribers: { signed: [] } });
    const { calls, fn } = spyNotify();
    await new PlacementNotificationService(repo, {}, fn).notifyEvent("p1", "signed");
    assert.equal(calls.length, 0);
  });

  it("is a no-op when the placement no longer exists", async () => {
    const repo = fakeRepo({ subscribers: { signed: ["r1"] }, placement: null });
    const { calls, fn } = spyNotify();
    await new PlacementNotificationService(repo, {}, fn).notifyEvent("p1", "signed");
    assert.equal(calls.length, 0);
  });
});

describe("PlacementNotificationService.sweepStageEvents", () => {
  const ada: PlacementSummary = { id: "p1", recruiterId: "r1", candidateName: "Ada", jobTitle: null, companyName: null };
  const bo: PlacementSummary = { id: "p2", recruiterId: "r2", candidateName: "Bo", jobTitle: null, companyName: null };

  it("fires started+first_day for started placements and guarantee_expires for expiring — idempotently", async () => {
    const repo = fakeRepo({ started: [ada], expiring: [bo], subscribers: {} });
    const svc = new PlacementNotificationService(repo, {}, spyNotify().fn);
    const first = await svc.sweepStageEvents(new Date());
    assert.equal(first, 3); // started + first_day (p1) + guarantee_expires (p2)
    const second = await svc.sweepStageEvents(new Date()); // log already has them
    assert.equal(second, 0);
  });

  it("dispatches each swept event to its subscribers", async () => {
    const repo = fakeRepo({ started: [ada], subscribers: { started: ["u1"], first_day: ["u1"] } });
    const { calls, fn } = spyNotify();
    await new PlacementNotificationService(repo, {}, fn).sweepStageEvents(new Date());
    assert.equal(calls.length, 2);
    assert.deepEqual(calls.map((c) => c.type).sort(), ["placement_first_day", "placement_started"]);
  });
});
