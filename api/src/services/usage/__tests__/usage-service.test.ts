/**
 * UsageService tests (#2043) — the consent gate, ingestion, and presence map.
 * In-memory fake repo (no Postgres). Distinct visitor/role per test to avoid
 * edge-cache L1 contamination.
 *
 * Run: node --import tsx --test src/services/usage/__tests__/usage-service.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { UsageService } from "../UsageService.js";
import type {
  IUsageTrackingRepository,
  UpsertSessionInput,
  InsertEventInput,
  UsageSessionRow,
  FeatureUsageCount,
} from "../../../repositories/usageTrackingRepository.js";
import type { TrackUsageInput } from "../../../../../shared/usage.js";

class FakeUsageRepo implements IUsageTrackingRepository {
  sessions: UpsertSessionInput[] = [];
  events: InsertEventInput[] = [];
  active: UsageSessionRow[] = [];

  async upsertSession(input: UpsertSessionInput): Promise<string> {
    this.sessions.push(input);
    return `sess-${this.sessions.length}`;
  }
  async insertEvents(_sessionId: string, events: InsertEventInput[]): Promise<void> {
    this.events.push(...events);
  }
  async listActiveSessions(): Promise<UsageSessionRow[]> {
    return this.active;
  }
  async featureUsageForRole(): Promise<FeatureUsageCount[]> {
    return [];
  }
  async eraseByVisitor(): Promise<number> {
    return 1;
  }
  async eraseByUser(): Promise<number> {
    return 2;
  }
}

function batch(over: Partial<TrackUsageInput> = {}): TrackUsageInput {
  return {
    visitorId: "visitor-abc-123",
    consent: true,
    events: [{ type: "page_view", path: "/jobs" }],
    ...over,
  };
}

describe("UsageService.recordBatch — consent gate", () => {
  it("drops the batch and stores nothing when consent is false", async () => {
    const repo = new FakeUsageRepo();
    const svc = new UsageService(repo);
    const res = await svc.recordBatch(batch({ consent: false }), {});
    assert.equal(res.stored, false);
    assert.equal(repo.sessions.length, 0);
    assert.equal(repo.events.length, 0);
  });

  it("stores session + events on consent, deriving identity from the request", async () => {
    const repo = new FakeUsageRepo();
    const svc = new UsageService(repo);
    const res = await svc.recordBatch(
      batch({ visitorId: "visitor-authed-1", events: [{ type: "search", path: "/search", payload: { query: "react" } }] }),
      { userId: "user-1", roles: ["recruiter"], country: "US" },
    );
    assert.equal(res.stored, true);
    assert.equal(repo.sessions.length, 1);
    assert.equal(repo.sessions[0].isAuthenticated, true);
    assert.equal(repo.sessions[0].role, "recruiter");
    assert.equal(repo.sessions[0].country, "US");
    assert.equal(repo.sessions[0].lastEventType, "search");
    assert.equal(repo.events.length, 1);
  });

  it("records an anonymous visitor (no userId) with role null", async () => {
    const repo = new FakeUsageRepo();
    const svc = new UsageService(repo);
    await svc.recordBatch(batch({ visitorId: "visitor-anon-1" }), {});
    assert.equal(repo.sessions[0].isAuthenticated, false);
    assert.equal(repo.sessions[0].role, null);
  });
});

describe("UsageService.getActiveSessions — presence map", () => {
  it("maps rows to the presence DTO", async () => {
    const repo = new FakeUsageRepo();
    repo.active = [
      {
        id: "s1",
        visitorId: "v1",
        userId: "u1",
        isAuthenticated: true,
        role: "employer",
        entryPath: "/dashboard",
        referrer: null,
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
        country: "CA",
        userAgent: null,
        lastEventType: "page_view",
        lastPath: "/jobs",
        firstSeen: new Date(0),
        lastSeen: new Date(0),
      } as UsageSessionRow,
    ];
    const svc = new UsageService(repo);
    const out = await svc.getActiveSessions();
    assert.equal(out.length, 1);
    assert.equal(out[0].sessionId, "s1");
    assert.equal(out[0].role, "employer");
    assert.equal(out[0].lastPath, "/jobs");
  });
});
