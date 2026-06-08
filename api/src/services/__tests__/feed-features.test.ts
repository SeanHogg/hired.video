/**
 * Tests for the SuperAdmin-curated dashboard feed.
 *
 * Covers:
 *   • resolveFeedRole / featureAppliesToRole — the per-role targeting SSoT
 *   • FeedFeatureService — per-role read-through cache (loader runs once per
 *     role until a write invalidates), role filtering, and the embed_payload
 *     → card mapping (featureId/rank/type stamping)
 *
 * The cache is the canonical getOrSetCached (L1 in-isolate Map; KV is absent
 * in tests so only L1 is exercised). Each caching test uses a DISTINCT role
 * string so the module-global Map can't leak state between tests.
 *
 * Run: node --import tsx --test src/services/__tests__/feed-features.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  resolveFeedRole,
  featureAppliesToRole,
} from "../../../../shared/feed-features.js";
import { FeedFeatureService } from "../feed/FeedFeatureService.js";
import type {
  IFeedFeaturesRepository,
  FeedFeatureRow,
} from "../../repositories/feedFeaturesRepository.js";

// ═══════════════════════════════════════════════════════════════════════════
// shared helpers
// ═══════════════════════════════════════════════════════════════════════════

describe("resolveFeedRole", () => {
  it("returns the first canonical role present in the claim", () => {
    assert.equal(resolveFeedRole(["recruiter"]), "recruiter");
    assert.equal(resolveFeedRole(["employer"]), "employer");
  });

  it("prefers the canonical order, not the claim order", () => {
    // job_seeker comes first in FEED_FEATURE_ROLES, so it wins even when
    // it's listed second in the JWT claim.
    assert.equal(resolveFeedRole(["employer", "job_seeker"]), "job_seeker");
  });

  it("falls back to job_seeker for empty / unknown / missing claims", () => {
    assert.equal(resolveFeedRole([]), "job_seeker");
    assert.equal(resolveFeedRole(undefined), "job_seeker");
    assert.equal(resolveFeedRole(["nonsense"]), "job_seeker");
  });
});

describe("featureAppliesToRole", () => {
  it("treats an empty target list as global (every role)", () => {
    assert.equal(featureAppliesToRole([], "job_seeker"), true);
    assert.equal(featureAppliesToRole(null, "recruiter"), true);
    assert.equal(featureAppliesToRole(undefined, "employer"), true);
  });

  it("matches only the targeted roles otherwise", () => {
    assert.equal(featureAppliesToRole(["recruiter"], "recruiter"), true);
    assert.equal(featureAppliesToRole(["recruiter"], "job_seeker"), false);
    assert.equal(featureAppliesToRole(["recruiter", "employer"], "employer"), true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FeedFeatureService
// ═══════════════════════════════════════════════════════════════════════════

function row(partial: Partial<FeedFeatureRow>): FeedFeatureRow {
  return {
    id: partial.id ?? "feat-1",
    entityKind: partial.entityKind ?? "tool",
    entityId: partial.entityId ?? "career-360",
    roles: partial.roles ?? [],
    title: partial.title ?? "Career 360",
    embedPayload: partial.embedPayload ?? { type: "tool", id: "career-360", title: "Career 360" },
    rank: partial.rank ?? 0,
    isActive: partial.isActive ?? true,
    createdBy: partial.createdBy ?? null,
    createdAt: partial.createdAt ?? new Date("2026-01-01T00:00:00Z"),
    updatedAt: partial.updatedAt ?? new Date("2026-01-01T00:00:00Z"),
  } as FeedFeatureRow;
}

class MockRepo implements IFeedFeaturesRepository {
  listActiveCalls = 0;
  constructor(private rows: FeedFeatureRow[]) {}
  async listActive(): Promise<FeedFeatureRow[]> {
    this.listActiveCalls++;
    return this.rows.filter((r) => r.isActive);
  }
  async listAll(): Promise<FeedFeatureRow[]> {
    return this.rows;
  }
  async findById(id: string): Promise<FeedFeatureRow | null> {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async upsert(input: any): Promise<FeedFeatureRow> {
    const r = row({ id: `feat-${this.rows.length + 1}`, ...input });
    this.rows.push(r);
    return r;
  }
  async update(): Promise<FeedFeatureRow | null> {
    return this.rows[0] ?? null;
  }
  async remove(): Promise<boolean> {
    return true;
  }
}

describe("FeedFeatureService.getCardsForRole", () => {
  it("serves the cached result on the second call (loader runs once per role)", async () => {
    const repo = new MockRepo([row({ id: "a" })]);
    const svc = new FeedFeatureService(repo);
    await svc.getCardsForRole("seeker_cache_1");
    await svc.getCardsForRole("seeker_cache_1");
    assert.equal(repo.listActiveCalls, 1);
  });

  it("filters to features that target the role (empty target = global)", async () => {
    const repo = new MockRepo([
      row({ id: "global", roles: [] }),
      row({ id: "recruiter-only", roles: ["recruiter"] }),
    ]);
    const svc = new FeedFeatureService(repo);
    const cards = await svc.getCardsForRole("seeker_filter_1");
    const ids = cards.map((c) => c.featureId).sort();
    assert.deepEqual(ids, ["global"]);
  });

  it("stamps featureId, type, and rank onto the embed_payload card", async () => {
    const repo = new MockRepo([
      row({ id: "feat-x", rank: 3, embedPayload: { type: "tool", id: "career-360", title: "Career 360" } }),
    ]);
    const svc = new FeedFeatureService(repo);
    const [card] = await svc.getCardsForRole("seeker_map_1");
    assert.equal(card.featureId, "feat-x");
    assert.equal(card.type, "tool");
    assert.equal(card.id, "career-360");
    assert.equal(card.rank, 3);
  });

  it("re-runs the loader after a write invalidates the cache", async () => {
    const repo = new MockRepo([row({ id: "a" })]);
    const svc = new FeedFeatureService(repo);
    await svc.getCardsForRole("job_seeker"); // loader #1
    await svc.create({
      entityKind: "page",
      entityId: "/chrome-extension",
      roles: [],
      title: "Chrome Extension",
      embedPayload: { type: "page", id: "/chrome-extension" },
    });
    await svc.getCardsForRole("job_seeker"); // cache invalidated → loader #2
    assert.equal(repo.listActiveCalls, 2);
  });
});
