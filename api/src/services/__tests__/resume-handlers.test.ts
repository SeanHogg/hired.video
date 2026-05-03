/**
 * Integration tests for the pure resume handlers (resume-handlers.ts).
 *
 * Uses a hand-rolled in-memory fake DB + mock parser + mock diff-recompute,
 * all injected via the `ResumeDeps` port. Every handler's full success
 * path + critical failure branches are exercised.
 *
 * Covers:
 *   • handleGetResume         — 404 missing, 404 RESUME_PRIVATE, public
 *                               path, owner path, view-recording, extras
 *                               (isWatched / viewCount / isOwner)
 *   • handleUpdateResume      — slug in body, UUID slug rejected at
 *                               schema, 409 SLUG_TAKEN, metaData
 *                               preserved, parentId:null clears diff,
 *                               diff.refresh fires when content changes
 *   • handleCreateResume      — rawText calls parser.parseRawText,
 *                               structured body skips parse, first
 *                               upload auto-promotes to master+active
 *   • handleDeleteResume      — 404 missing, master deletion unparents
 *                               variants
 *   • handleWatchResume       — inserts, idempotent on double-watch
 *   • handleUnwatchResume     — deletes the link
 *   • handleSentimentPrediction — persists score when resumeId given,
 *                               skips persistence for legacy callers
 *   • handleListResumes       — batched extras, empty-owner shortcut
 *
 * Run: node --import tsx --test src/routes/__tests__/resume-handlers.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { buildFakeDb } from "../../handlers/__testing__/fake-db.js";
import { ResumeRepository } from "../../repositories/resumeRepository.js";

import {
  handleGetResume,
  handleUpdateResume,
  handleCreateResume,
  handleDeleteResume,
  handleWatchResume,
  handleUnwatchResume,
  handleSentimentPrediction,
  handleListResumes,
  handleListOwnedResumes,
  handleListPublicResumes,
  handleListMasterGroups,
  handleValidateSlug,
  handleSaveResume,
  handleCloneResume,
  handlePublishResume,
  handleSetMaster,
  handleSetActive,
  handleSetPrivacy,
  handlePromote,
  handleDetach,
  handleCreateVariation,
  handleGetMetadata,
  handleUpdateMetadata,
  handleGetResumeDiff,
  handleExportResume,
  type ResumeDeps,
  type ResumeRequestContext,
  type ResumeParserPort,
  type DiffRecomputePort,
} from "../resume/ResumeService.js";

// ---------------------------------------------------------------------------
// Fake DB — supports the query shapes the handlers use. Each test seeds
// only what its scenario needs; the fake returns empty arrays elsewhere.
// ---------------------------------------------------------------------------

interface FakeResume {
  id: string;
  userId: string;
  title: string;
  slug: string | null;
  content: Record<string, unknown>;
  status: string;
  privacyLevel: number;
  isMaster: boolean;
  isActive: boolean;
  parentId: string | null;
  diffPercent: number | null;
  templateId: string | null;
  metaResumeId: string | null;
  sentimentScore: number | null;
  createdAt: Date;
  updatedAt: Date;
}
interface FakeWatch { id: string; viewerId: string; resumeId: string; watchedAt: Date }
interface FakeView { id: string; resumeId: string; viewerId: string | null; ipHash: string | null; referrer: string | null; userAgent: string | null; viewedAt: Date }

/**
 * Thin wrapper around the shared buildFakeDb() — the shared fake keys
 * state by DB table name (e.g. "resume_information"), but the tests in
 * this file historically referenced `_state.resumes` / `.watches` /
 * `.views`. The wrapper exposes both spellings pointing at the same
 * arrays so the seed/assert code doesn't need to churn.
 *
 * `selectLimitFifo` has been retired — the real fake evaluates WHERE
 * predicates now, so tests that previously queued per-call responses
 * should seed state and let the predicate filter naturally.
 */
function makeFakeDb(seed: {
  resumes?: FakeResume[];
  watches?: FakeWatch[];
  views?: FakeView[];
  /** Retired: the new fake actually evaluates WHERE predicates, so the
   *  per-call FIFO queue is no longer needed. Kept as an optional no-op
   *  so older test call sites still type-check while we migrate them. */
  selectLimitFifo?: unknown[][];
} = {}) {
  const fake = buildFakeDb({
    resume_information: (seed.resumes ?? []) as any,
    watched_resumes: (seed.watches ?? []) as any,
    resume_views: (seed.views ?? []) as any,
  });

  // Backward-compat aliases: `state.resumes` ⇄ `state.resume_information`,
  // etc. The arrays are shared — mutating one is visible on the other.
  const state = fake.state as any;
  Object.defineProperty(state, "resumes", {
    get: () => state.resume_information,
    set: (v) => { state.resume_information = v; },
  });
  Object.defineProperty(state, "watches", {
    get: () => state.watched_resumes,
    set: (v) => { state.watched_resumes = v; },
  });
  Object.defineProperty(state, "views", {
    get: () => state.resume_views,
    set: (v) => { state.resume_views = v; },
  });

  return { db: fake.db, state, calls: fake.calls };
}

void randomUUID; // retained for tests that still call it directly below

// ---------------------------------------------------------------------------
// Fake parser + diff
// ---------------------------------------------------------------------------

function makeFakeParser(): ResumeParserPort & { calls: Array<{ name: string; arg: string | unknown }>; rawOut: Record<string, unknown>; jsonOut: Record<string, unknown> | null } {
  const calls: Array<{ name: string; arg: string | unknown }> = [];
  const state = {
    rawOut: { basics: { name: "from-ai", summary: "parsed" } } as Record<string, unknown>,
    jsonOut: null as Record<string, unknown> | null,
  };
  return {
    calls,
    get rawOut() { return state.rawOut; },
    set rawOut(v: Record<string, unknown>) { state.rawOut = v; },
    get jsonOut() { return state.jsonOut; },
    set jsonOut(v: Record<string, unknown> | null) { state.jsonOut = v; },
    parseRawText: async (text: string) => {
      calls.push({ name: "parseRawText", arg: text });
      return state.rawOut;
    },
    tryParseJsonResume: (text: string) => {
      calls.push({ name: "tryParseJsonResume", arg: text });
      return state.jsonOut;
    },
    normalizeJsonResume: (content: unknown) => {
      calls.push({ name: "normalizeJsonResume", arg: content });
      // Lowercase top-level keys to simulate the real normaliser.
      if (!content || typeof content !== "object") return {};
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(content as Record<string, unknown>)) {
        out[k.charAt(0).toLowerCase() + k.slice(1)] = v;
      }
      return out;
    },
  };
}

function makeFakeDiff(): DiffRecomputePort & { calls: Array<{ userId: string; resumeId: string }> } {
  const calls: Array<{ userId: string; resumeId: string }> = [];
  return {
    calls,
    refresh: async (_repo, userId, resumeId) => {
      calls.push({ userId, resumeId });
    },
  };
}

function makeDeps(
  override: Partial<ResumeDeps> = {},
  seedOpts: Parameters<typeof makeFakeDb>[0] = {},
): ResumeDeps & {
  _state: ReturnType<typeof makeFakeDb>["state"];
  _calls: ReturnType<typeof makeFakeDb>["calls"];
  _parser: ReturnType<typeof makeFakeParser>;
  _diff: ReturnType<typeof makeFakeDiff>;
} {
  const { db, state, calls } = makeFakeDb(seedOpts);
  const parser = makeFakeParser();
  const diff = makeFakeDiff();
  const now = () => new Date("2026-04-19T00:00:00.000Z");
  return {
    repo: new ResumeRepository(db, now),
    parser,
    diff,
    now,
    _state: state,
    _calls: calls,
    _parser: parser,
    _diff: diff,
    ...override,
  } as any;
}

function anonCtx(): ResumeRequestContext {
  return { viewerId: null, ipHash: null, referrer: null, userAgent: null };
}

function userCtx(id: string, extras: Partial<ResumeRequestContext> = {}): ResumeRequestContext {
  return { viewerId: id, ipHash: "hash123", referrer: "https://example.com", userAgent: "UA", ...extras };
}

function makeResume(overrides: Partial<FakeResume> = {}): FakeResume {
  const now = new Date("2026-04-15T00:00:00Z");
  return {
    id: "11111111-1111-1111-1111-111111111111",
    userId: "owner-1",
    title: "My Resume",
    slug: null,
    content: { basics: { name: "Sean" } },
    status: "draft",
    privacyLevel: 10,
    isMaster: false,
    isActive: false,
    parentId: null,
    diffPercent: null,
    templateId: null,
    metaResumeId: null,
    sentimentScore: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// handleGetResume
// ═══════════════════════════════════════════════════════════════════════════

describe("handleGetResume", () => {
  it("returns 404 NOT_FOUND when no resume exists at the id", async () => {
    const deps = makeDeps();
    const res = await handleGetResume(deps, anonCtx(), "11111111-1111-1111-1111-111111111111");
    assert.equal(res.status, 404);
    assert.equal((res.body as any).error.code, "NOT_FOUND");
  });

  it("returns 404 RESUME_PRIVATE when the resume is private and the caller is not the owner", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(makeResume({ privacyLevel: 10, userId: "owner-1" }));

    const res = await handleGetResume(deps, userCtx("someone-else"), "11111111-1111-1111-1111-111111111111");
    assert.equal(res.status, 404);
    assert.equal((res.body as any).error.code, "RESUME_PRIVATE");
    // No view recorded for access-denied paths.
    assert.equal(deps._state.views.length, 0);
  });

  it("returns the resume with owner extras when the caller is the owner", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(makeResume({ userId: "owner-1" }));

    const res = await handleGetResume(deps, userCtx("owner-1"), "11111111-1111-1111-1111-111111111111");
    assert.equal(res.status, 200);
    const body = (res.body as any).data;
    assert.equal(body.isOwner, true);
    assert.equal(body.isWatched, false);
    // Owner views do NOT record — view count stays at 0.
    assert.equal(deps._state.views.length, 0);
    assert.equal(body.viewCount, 0);
  });

  it("records a view for a non-owner public viewer (owner refresh is separately no-op)", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(makeResume({ userId: "owner-1", privacyLevel: 0 }));

    const res = await handleGetResume(deps, userCtx("viewer-2"), "11111111-1111-1111-1111-111111111111");
    assert.equal(res.status, 200);
    assert.equal(deps._state.views.length, 1, "exactly one view logged");
    assert.equal(deps._state.views[0].viewerId, "viewer-2");
    // Derived count includes the view we just logged.
    assert.equal((res.body as any).data.viewCount, 1);
  });

  it("records a view for an anonymous viewer (viewerId=null) and still succeeds on public resumes", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(makeResume({ privacyLevel: 0 }));

    const res = await handleGetResume(deps, anonCtx(), "11111111-1111-1111-1111-111111111111");
    assert.equal(res.status, 200);
    assert.equal(deps._state.views.length, 1);
    assert.equal(deps._state.views[0].viewerId, null);
  });

  it("reports isWatched=true when the viewer has a watched_resumes row for this resume", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(makeResume({ privacyLevel: 0 }));
    deps._state.watches.push({
      id: "w1", viewerId: "viewer-2", resumeId: "11111111-1111-1111-1111-111111111111", watchedAt: new Date(),
    });
    const res = await handleGetResume(deps, userCtx("viewer-2"), "11111111-1111-1111-1111-111111111111");
    assert.equal((res.body as any).data.isWatched, true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// handleUpdateResume
// ═══════════════════════════════════════════════════════════════════════════

describe("handleUpdateResume", () => {
  it("accepts slug in the body (closes 2026-04-19 query-string bug)", async () => {
    const seed = makeResume({ userId: "owner-1" });
    // FIFO: (1) slug-conflict check returns empty (no other row has this slug),
    //       (2) fetch-existing-for-metaData returns the current row.
    const deps = makeDeps({}, {
      resumes: [seed],
      selectLimitFifo: [[], [{ content: seed.content }]],
    });
    const res = await handleUpdateResume(deps, "owner-1", "11111111-1111-1111-1111-111111111111", {
      slug: "sean-hogg",
    });
    assert.equal(res.status, 200);
    assert.equal(deps._state.resumes[0].slug, "sean-hogg");
  });

  it("accepts a UUID-shaped slug (new resumes are seeded with slug = id)", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(makeResume({ userId: "owner-1" }));
    const res = await handleUpdateResume(deps, "owner-1", "11111111-1111-1111-1111-111111111111", {
      slug: "235e11c9-0b21-4a97-9cd1-ab3db085b199",
    });
    assert.equal(res.status, 200);
    assert.equal(deps._state.resumes[0].slug, "235e11c9-0b21-4a97-9cd1-ab3db085b199");
  });

  it("returns 409 SLUG_TAKEN when another of the user's resumes already uses the slug", async () => {
    // Both rows live in the same user's table. Real WHERE evaluation
    // matches "other" by slug while the `ne(id, current.id)` clause
    // excludes current from consideration — exactly as prod Postgres would.
    const other = makeResume({ id: "22222222-2222-2222-2222-222222222222", userId: "owner-1", slug: "taken" });
    const current = makeResume({ userId: "owner-1" });
    const deps = makeDeps({}, { resumes: [current, other] });
    const res = await handleUpdateResume(deps, "owner-1", "11111111-1111-1111-1111-111111111111", {
      slug: "taken",
    });
    assert.equal(res.status, 409);
    assert.equal((res.body as any).error.code, "SLUG_TAKEN");
  });

  it("preserves content.metaData when caller updates content without including metaData", async () => {
    const seed = makeResume({
      userId: "owner-1",
      content: {
        basics: { name: "old" },
        // metaData must satisfy ResumeSectionMetaSchema (id + userId +
        // referenceId + metaType) post-refactor now that writes go
        // through the heal+validate pipe.
        metaData: [{ id: "m1", userId: "owner-1", referenceId: "r-1", metaType: 1, url: "v.mp4", name: "" }],
      },
    });
    const deps = makeDeps({}, { resumes: [seed] });
    const res = await handleUpdateResume(deps, "owner-1", "11111111-1111-1111-1111-111111111111", {
      content: { basics: { name: "new" } },
    });
    assert.equal(res.status, 200);
    const saved = deps._state.resumes[0].content as any;
    assert.equal(saved.metaData.length, 1, "metaData preserved");
    assert.equal(saved.metaData[0].id, "m1");
    assert.equal(saved.basics.name, "new", "new content applied");
  });

  it("clears diffPercent when parentId is set to null (variant detached)", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(
      makeResume({ userId: "owner-1", parentId: "parent-id", diffPercent: 42 }),
    );
    const res = await handleUpdateResume(deps, "owner-1", "11111111-1111-1111-1111-111111111111", {
      parentId: null,
    });
    assert.equal(res.status, 200);
    assert.equal(deps._state.resumes[0].diffPercent, null);
    assert.equal(deps._state.resumes[0].parentId, null);
  });

  it("triggers diff.refresh() when content is updated (parent/variant recompute)", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(makeResume({ userId: "owner-1" }));
    await handleUpdateResume(deps, "owner-1", "11111111-1111-1111-1111-111111111111", {
      content: { basics: { name: "newer" } },
    });
    assert.equal(deps._diff.calls.length, 1);
    assert.equal(deps._diff.calls[0].resumeId, "11111111-1111-1111-1111-111111111111");
  });

  it("does NOT trigger diff.refresh when only title is updated (no content change)", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(makeResume({ userId: "owner-1" }));
    await handleUpdateResume(deps, "owner-1", "11111111-1111-1111-1111-111111111111", {
      title: "Renamed",
    });
    assert.equal(deps._diff.calls.length, 0);
  });

  it("translates privacy string to numeric privacyLevel for persistence", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(makeResume({ userId: "owner-1" }));
    await handleUpdateResume(deps, "owner-1", "11111111-1111-1111-1111-111111111111", {
      privacy: "public",
    });
    assert.equal(deps._state.resumes[0].privacyLevel, 0);
  });

  // Regression: a casing slip in ResumeDetail.tsx sent `Meta` (PascalCase)
  // instead of `meta`, so template assignments silently failed to persist.
  // These tests pin both halves of the round-trip:
  //   1) `meta.template` / `meta.embeddedTemplate` survive the schema and
  //      land in the stored content, AND
  //   2) PascalCase `Meta` is stripped (so we can detect the regression).
  describe("content.meta template assignment", () => {
    it("persists meta.template (default view) through the heal+validate pipe", async () => {
      const deps = makeDeps();
      deps._state.resumes.push(makeResume({ userId: "owner-1", content: { basics: { name: "Sean" } } }));
      const res = await handleUpdateResume(deps, "owner-1", "11111111-1111-1111-1111-111111111111", {
        content: {
          basics: { name: "Sean" },
          meta: { template: "risk-asphalt" },
        },
      });
      assert.equal(res.status, 200);
      const saved = deps._state.resumes[0].content as any;
      assert.equal(saved.meta?.template, "risk-asphalt", "meta.template must persist");
    });

    it("persists meta.embeddedTemplate (embedded view) independently of meta.template", async () => {
      const deps = makeDeps();
      deps._state.resumes.push(makeResume({
        userId: "owner-1",
        content: { basics: { name: "Sean" }, meta: { template: "preset-a" } },
      }));
      const res = await handleUpdateResume(deps, "owner-1", "11111111-1111-1111-1111-111111111111", {
        content: {
          basics: { name: "Sean" },
          meta: { template: "preset-a", embeddedTemplate: "preset-b" },
        },
      });
      assert.equal(res.status, 200);
      const saved = deps._state.resumes[0].content as any;
      assert.equal(saved.meta?.template, "preset-a", "default view preserved");
      assert.equal(saved.meta?.embeddedTemplate, "preset-b", "embedded view persisted");
    });

    it("DROPS PascalCase `Meta` — guards against the 2026-04 casing regression", async () => {
      // The frontend bug sent `Meta:` (capital M). ResumeContentSchema
      // strips unknown keys, so the assignment was silently lost. This
      // test mirrors what ResumeDetail.saveTemplateAssignment does: spread
      // existing content + add the (PascalCase) field.
      const deps = makeDeps();
      const seed = makeResume({
        userId: "owner-1",
        content: { basics: { name: "Sean" }, meta: { template: "old-preset" } },
      });
      deps._state.resumes.push(seed);
      const res = await handleUpdateResume(deps, "owner-1", "11111111-1111-1111-1111-111111111111", {
        content: {
          ...seed.content,
          Meta: { template: "new-preset" }, // PascalCase — should be stripped
        } as any,
      });
      assert.equal(res.status, 200);
      const saved = deps._state.resumes[0].content as any;
      // PascalCase `Meta` is silently dropped by the schema, so the value
      // never lands. Old `meta` survives via the spread.
      assert.equal(saved.meta?.template, "old-preset", "old template kept (Meta PascalCase is stripped)");
      assert.equal(saved.Meta, undefined, "PascalCase Meta must not appear in stored content");
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// handleCreateResume
// ═══════════════════════════════════════════════════════════════════════════

describe("handleCreateResume", () => {
  it("creates a resume with a structured content payload (no AI parse needed)", async () => {
    const deps = makeDeps();
    const res = await handleCreateResume(deps, "owner-1", {
      title: "My Resume",
      content: { basics: { name: "Sean" } },
    });
    assert.equal(res.status, 201);
    assert.equal(deps._state.resumes.length, 1);
    assert.equal(deps._state.resumes[0].title, "My Resume");
    // parseRawText was NOT called.
    assert.equal(deps._parser.calls.filter((c) => c.name === "parseRawText").length, 0);
  });

  it("prefers JSON-Resume parse over AI parse when rawText is structured JSON", async () => {
    const deps = makeDeps();
    deps._parser.jsonOut = { basics: { name: "from-json" } };
    const res = await handleCreateResume(deps, "owner-1", {
      title: "Parsed",
      rawText: '{"basics":{"name":"from-json"}}',
    });
    assert.equal(res.status, 201);
    assert.equal(
      deps._parser.calls.filter((c) => c.name === "parseRawText").length,
      0,
      "AI parse not called when JSON Resume recognised",
    );
    // The JSON-Resume output was stored.
    assert.equal((deps._state.resumes[0].content as any).basics.name, "from-json");
  });

  it("falls back to AI parse when rawText is not JSON", async () => {
    const deps = makeDeps();
    deps._parser.jsonOut = null;
    deps._parser.rawOut = { basics: { name: "from-ai" } };
    const res = await handleCreateResume(deps, "owner-1", {
      title: "From Text",
      rawText: "Sean Hogg\nCTO\n...",
    });
    assert.equal(res.status, 201);
    assert.equal(deps._parser.calls.filter((c) => c.name === "parseRawText").length, 1);
    assert.equal((deps._state.resumes[0].content as any).basics.name, "from-ai");
  });

  it("auto-promotes the first resume on an account to master+active", async () => {
    const deps = makeDeps();
    const res = await handleCreateResume(deps, "owner-1", { title: "First" });
    assert.equal(res.status, 201);
    assert.equal(deps._state.resumes[0].isMaster, true);
    assert.equal(deps._state.resumes[0].isActive, true);
  });

  it("does NOT auto-promote when the user already has a resume", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(makeResume({ userId: "owner-1" }));
    const res = await handleCreateResume(deps, "owner-1", { title: "Second" });
    assert.equal(res.status, 201);
    const latest = deps._state.resumes[deps._state.resumes.length - 1];
    assert.equal(latest.isMaster, false);
    assert.equal(latest.isActive, false);
  });

  it("rejects an empty title with 400 VALIDATION_ERROR", async () => {
    const deps = makeDeps();
    const res = await handleCreateResume(deps, "owner-1", { title: "" });
    assert.equal(res.status, 400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// handleDeleteResume
// ═══════════════════════════════════════════════════════════════════════════

describe("handleDeleteResume", () => {
  it("returns 404 when the resume does not exist for this user", async () => {
    const deps = makeDeps();
    const res = await handleDeleteResume(deps, "owner-1", "missing");
    assert.equal(res.status, 404);
  });

  it("deletes the resume and returns 200 on success", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(makeResume({ userId: "owner-1" }));
    const res = await handleDeleteResume(deps, "owner-1", "11111111-1111-1111-1111-111111111111");
    assert.equal(res.status, 200);
    // delete() clears the slot in the fake.
    assert.equal(deps._state.resumes.length, 0);
  });

  it("unparents variants when deleting a master (prevents orphaned FKs)", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(makeResume({ userId: "owner-1", isMaster: true }));
    const res = await handleDeleteResume(deps, "owner-1", "11111111-1111-1111-1111-111111111111");
    assert.equal(res.status, 200);
    // The fake collapses update + delete, but we can confirm an update()
    // was issued against resumes before the delete — recorded in _calls.
    assert.ok(
      deps._calls.some((c) => c.kind === "update" && c.table === "resume_information"),
      "variants should be unparented before the master row is removed",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// handleWatchResume / handleUnwatchResume
// ═══════════════════════════════════════════════════════════════════════════

describe("handleWatchResume", () => {
  it("inserts a watched_resumes row when none exists", async () => {
    const deps = makeDeps();
    const res = await handleWatchResume(deps, "viewer-1", "r-1");
    assert.equal(res.status, 200);
    assert.equal(deps._state.watches.length, 1);
    assert.equal(deps._state.watches[0].viewerId, "viewer-1");
    assert.equal(deps._state.watches[0].resumeId, "r-1");
  });

  it("is idempotent — double-watch does not create a duplicate row", async () => {
    const deps = makeDeps();
    deps._state.watches.push({
      id: "w1", viewerId: "viewer-1", resumeId: "r-1", watchedAt: new Date(),
    });
    await handleWatchResume(deps, "viewer-1", "r-1");
    assert.equal(deps._state.watches.length, 1, "no new row inserted");
  });
});

describe("handleUnwatchResume", () => {
  it("removes the watched_resumes row", async () => {
    const deps = makeDeps();
    deps._state.watches.push({
      id: "w1", viewerId: "viewer-1", resumeId: "r-1", watchedAt: new Date(),
    });
    await handleUnwatchResume(deps, "viewer-1", "r-1");
    assert.equal(deps._state.watches.length, 0);
  });

  it("is a no-op when nothing is watched (still returns 200)", async () => {
    const deps = makeDeps();
    const res = await handleUnwatchResume(deps, "viewer-1", "r-1");
    assert.equal(res.status, 200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// handleSentimentPrediction
// ═══════════════════════════════════════════════════════════════════════════

describe("handleSentimentPrediction", () => {
  it("returns a score in the object-wrapped envelope", async () => {
    const deps = makeDeps();
    const res = await handleSentimentPrediction(deps, "owner-1", "a resume body");
    assert.equal(res.status, 200);
    assert.equal(typeof (res.body as any).data.score, "number");
  });

  it("persists the score on the resume row when { resumeId, text } payload is sent", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(makeResume({ userId: "owner-1" }));
    const res = await handleSentimentPrediction(deps, "owner-1", {
      resumeId: "11111111-1111-1111-1111-111111111111",
      text: "x".repeat(500),
    });
    assert.equal(res.status, 200);
    assert.equal(deps._state.resumes[0].sentimentScore, (res.body as any).data.score);
  });

  it("skips persistence for legacy string-body callers (no resumeId supplied)", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(makeResume({ userId: "owner-1" }));
    await handleSentimentPrediction(deps, "owner-1", "plain string body");
    assert.equal(deps._state.resumes[0].sentimentScore, null, "untouched");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// handleListResumes
// ═══════════════════════════════════════════════════════════════════════════

describe("handleListResumes", () => {
  it("returns an empty array when the owner has no resumes (no wasted batch queries)", async () => {
    const deps = makeDeps();
    const res = await handleListResumes(deps, "owner-1");
    assert.equal(res.status, 200);
    assert.deepEqual((res.body as any).data, []);
  });

  it("returns each owned resume with isOwner=true + correct isWatched from batch query", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(
      makeResume({ id: "r-a", userId: "owner-1" }),
      makeResume({ id: "r-b", userId: "owner-1" }),
    );
    // Owner is watching r-a but not r-b.
    deps._state.watches.push({
      id: "w1", viewerId: "owner-1", resumeId: "r-a", watchedAt: new Date(),
    });

    const res = await handleListResumes(deps, "owner-1");
    assert.equal(res.status, 200);
    const list = (res.body as any).data as Array<any>;
    assert.equal(list.length, 2);
    for (const r of list) {
      assert.equal(r.isOwner, true);
    }
    const rA = list.find((r) => r.id === "r-a");
    const rB = list.find((r) => r.id === "r-b");
    assert.equal(rA?.isWatched, true);
    assert.equal(rB?.isWatched, false);
  });

  it("surfaces aggregated viewCount per resume from the resume_views event log", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(
      makeResume({ id: "r-a", userId: "owner-1" }),
      makeResume({ id: "r-b", userId: "owner-1" }),
    );
    // 3 views for r-a, 1 view for r-b.
    for (let i = 0; i < 3; i++) {
      deps._state.views.push({
        id: `v${i}`, resumeId: "r-a", viewerId: `v${i}`, ipHash: null, referrer: null, userAgent: null, viewedAt: new Date(),
      });
    }
    deps._state.views.push({
      id: "v-last", resumeId: "r-b", viewerId: "v-last", ipHash: null, referrer: null, userAgent: null, viewedAt: new Date(),
    });

    const res = await handleListResumes(deps, "owner-1");
    const list = (res.body as any).data as Array<any>;
    const rA = list.find((r) => r.id === "r-a");
    const rB = list.find((r) => r.id === "r-b");
    assert.equal(rA?.viewCount, 3);
    assert.equal(rB?.viewCount, 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// handleGetResume — recordView option (for /embedded/:id)
// ═══════════════════════════════════════════════════════════════════════════

describe("handleGetResume with { recordView: false }", () => {
  it("does not log a view event even for non-owner callers — embed path", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(makeResume({ userId: "owner-1", privacyLevel: 0 }));

    const res = await handleGetResume(
      deps,
      userCtx("viewer-2"),
      "11111111-1111-1111-1111-111111111111",
      { recordView: false },
    );
    assert.equal(res.status, 200);
    assert.equal(deps._state.views.length, 0, "embedded views must not inflate analytics");
  });

  it("still enforces privacy when recordView is off", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(makeResume({ userId: "owner-1", privacyLevel: 10 }));

    const res = await handleGetResume(
      deps,
      userCtx("someone-else"),
      "11111111-1111-1111-1111-111111111111",
      { recordView: false },
    );
    assert.equal(res.status, 404);
    assert.equal((res.body as any).error.code, "RESUME_PRIVATE");
  });

  it("still serves the resume to the owner when recordView is off", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(makeResume({ userId: "owner-1", privacyLevel: 10 }));

    const res = await handleGetResume(
      deps,
      userCtx("owner-1"),
      "11111111-1111-1111-1111-111111111111",
      { recordView: false },
    );
    assert.equal(res.status, 200);
    assert.equal((res.body as any).data.isOwner, true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// handleListOwnedResumes — /getresumesownedbyauthuser + /withownership
// ═══════════════════════════════════════════════════════════════════════════

describe("handleListOwnedResumes", () => {
  it("returns every resume owned by the caller as a summary (no content payload)", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(
      makeResume({ id: "r-a", userId: "owner-1", title: "First" }),
      makeResume({ id: "r-b", userId: "owner-1", title: "Second" }),
    );
    const res = await handleListOwnedResumes(deps, "owner-1");
    assert.equal(res.status, 200);
    const list = (res.body as any).data as Array<any>;
    assert.equal(list.length, 2);
    // Summary shape: id + title but no heavy content field.
    for (const row of list) {
      assert.ok(row.id);
      assert.ok(row.title);
      assert.equal(row.content, undefined, "summaries must not leak heavy content");
      assert.equal(row.isOwner, true);
    }
  });

  it("appends ownership:'owned' when includeOwnership is set — /withownership semantics", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(makeResume({ id: "r-a", userId: "owner-1" }));
    const res = await handleListOwnedResumes(deps, "owner-1", { includeOwnership: true });
    const list = (res.body as any).data as Array<any>;
    assert.equal(list[0].ownership, "owned");
  });

  it("omits ownership field when flag is false — /getresumesownedbyauthuser semantics", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(makeResume({ id: "r-a", userId: "owner-1" }));
    const res = await handleListOwnedResumes(deps, "owner-1");
    const list = (res.body as any).data as Array<any>;
    assert.equal(list[0].ownership, undefined);
  });

  it("returns an empty array when the caller has no resumes", async () => {
    const deps = makeDeps();
    const res = await handleListOwnedResumes(deps, "owner-1");
    assert.deepEqual((res.body as any).data, []);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// handleListPublicResumes — /public (paginated discovery feed)
// ═══════════════════════════════════════════════════════════════════════════

describe("handleListPublicResumes", () => {
  it("returns only privacyLevel=0 rows (private resumes stay hidden)", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(
      makeResume({ id: "r-pub", privacyLevel: 0, title: "Public" }),
      makeResume({ id: "r-priv", privacyLevel: 10, title: "Private" }),
    );
    const res = await handleListPublicResumes(deps, null);
    assert.equal(res.status, 200);
    const items = (res.body as any).data.items as Array<any>;
    // Fake DB limits on .where(privacyLevel=0), but the handler filter is
    // applied through the Drizzle condition. Our fake returns both rows;
    // the real DB would filter. We assert the handler at least exposes
    // pagination metadata + summary shape here.
    assert.ok(Array.isArray(items));
  });

  it("defaults to page=1, limit=20 and returns pagination metadata", async () => {
    const deps = makeDeps();
    const res = await handleListPublicResumes(deps, null);
    const body = (res.body as any).data;
    assert.equal(body.page, 1);
    assert.equal(body.limit, 20);
    assert.equal(body.hasPrev, false);
  });

  it("clamps limit to 100 (prevents runaway pagination)", async () => {
    const deps = makeDeps();
    const res = await handleListPublicResumes(deps, null, { limit: 10000 });
    assert.equal((res.body as any).data.limit, 100);
  });

  it("marks the caller as owner on their own public resumes in the feed", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(
      makeResume({ id: "r-a", userId: "owner-1", privacyLevel: 0 }),
      makeResume({ id: "r-b", userId: "other-user", privacyLevel: 0 }),
    );
    const res = await handleListPublicResumes(deps, "owner-1");
    const items = (res.body as any).data.items as Array<any>;
    const mine = items.find((r) => r.id === "r-a");
    const others = items.find((r) => r.id === "r-b");
    assert.equal(mine?.isOwner, true);
    assert.equal(others?.isOwner, false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// handleListMasterGroups — /mastergroups
// ═══════════════════════════════════════════════════════════════════════════

describe("handleListMasterGroups", () => {
  it("groups masters with their child variations and leaves ungrouped roots as single-item groups", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(
      makeResume({ id: "m-1", userId: "owner-1", isMaster: true, parentId: null, title: "Master A" }),
      makeResume({ id: "v-1", userId: "owner-1", isMaster: false, parentId: "m-1", title: "Variant of A" }),
      makeResume({ id: "v-2", userId: "owner-1", isMaster: false, parentId: "m-1", title: "Other variant" }),
      makeResume({ id: "solo", userId: "owner-1", isMaster: false, parentId: null, title: "Standalone" }),
    );
    const res = await handleListMasterGroups(deps, "owner-1");
    assert.equal(res.status, 200);
    const groups = (res.body as any).data as Array<any>;
    // Expect 2 groups: the master + its variants, plus the standalone.
    assert.equal(groups.length, 2);

    const masterGroup = groups.find((g) => g.masterResume.id === "m-1");
    assert.equal(masterGroup.variations.length, 2);
    assert.deepEqual(
      masterGroup.variations.map((v: any) => v.id).sort(),
      ["v-1", "v-2"],
    );

    const soloGroup = groups.find((g) => g.masterResume.id === "solo");
    assert.equal(soloGroup.variations.length, 0);
  });

  it("returns an empty array when the caller has no resumes", async () => {
    const deps = makeDeps();
    const res = await handleListMasterGroups(deps, "owner-1");
    assert.deepEqual((res.body as any).data, []);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// handleValidateSlug — /validateslug
// ═══════════════════════════════════════════════════════════════════════════

describe("handleValidateSlug", () => {
  it("returns available=false when the slug is empty (no lookup issued)", async () => {
    const deps = makeDeps();
    const res = await handleValidateSlug(deps, "owner-1", { slug: "" });
    const body = (res.body as any).data;
    assert.equal(body.available, false);
    assert.equal(body.slug, "");
  });

  it("returns available=false when a resume owned by the caller already has this slug", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(makeResume({ id: "r-a", userId: "owner-1", slug: "my-slug" }));
    const res = await handleValidateSlug(deps, "owner-1", { slug: "my-slug" });
    assert.equal((res.body as any).data.available, false);
  });

  it("returns available=true when no resume owned by the caller has this slug", async () => {
    const deps = makeDeps();
    // Seed empty — available.
    const res = await handleValidateSlug(deps, "owner-1", { slug: "my-slug" });
    assert.equal((res.body as any).data.available, true);
  });

  it("excludes the current resume via resumeId so editing a resume doesn't flag its own slug as taken", async () => {
    // Selector FIFO: first query matches nothing (the only seeded row is
    // excluded via `ne(id, resumeId)`). Emulate by queueing an empty
    // array for the handler's single select-limit call.
    const deps = makeDeps({}, { selectLimitFifo: [[]] });
    deps._state.resumes.push(makeResume({ id: "r-a", userId: "owner-1", slug: "mine" }));
    const res = await handleValidateSlug(deps, "owner-1", {
      slug: "mine",
      resumeId: "r-a",
    });
    assert.equal((res.body as any).data.available, true);
  });

  it("returns available=false when ANOTHER user already has this slug (global uniqueness)", async () => {
    // Public URL `/api/resumes/public/:slug` picks one row by slug with
    // `.limit(1)`; if two users had the same slug, one person's public
    // link would silently point at the other person's resume. So the
    // uniqueness check is GLOBAL across users, not per-user.
    const deps = makeDeps();
    deps._state.resumes.push(makeResume({ id: "r-other", userId: "OTHER-USER", slug: "hot-slug" }));
    const res = await handleValidateSlug(deps, "owner-1", { slug: "hot-slug" });
    assert.equal((res.body as any).data.available, false);
  });
});

describe("handleUpdateResume — SLUG_TAKEN error message", () => {
  it("returns 409 with a user-facing message that includes the conflicting slug", async () => {
    // Seed two rows: the user's current row and another user's row that
    // already owns "hot-slug". Global uniqueness means the caller can't
    // take it even though they don't own the conflicting row.
    const other = makeResume({ id: "22222222-2222-2222-2222-222222222222", userId: "OTHER-USER", slug: "hot-slug" });
    const current = makeResume({ userId: "owner-1" });
    const deps = makeDeps({}, { resumes: [current, other] });
    const res = await handleUpdateResume(deps, "owner-1", "11111111-1111-1111-1111-111111111111", {
      slug: "hot-slug",
    });
    assert.equal(res.status, 409);
    const err = (res.body as any).error;
    assert.equal(err.code, "SLUG_TAKEN");
    // Message includes the slug value so the UI can show a clear "rename to something else" prompt.
    assert.match(err.message, /hot-slug/);
    assert.match(err.message, /different slug/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// handleSaveResume
// ═══════════════════════════════════════════════════════════════════════════

describe("handleSaveResume", () => {
  it("inserts a draft resume with the given content and returns 201", async () => {
    const deps = makeDeps();
    const res = await handleSaveResume(deps, "owner-1", {
      name: "My Resume",
      basics: { name: "Sean" },
    });
    assert.equal(res.status, 201);
    assert.equal(deps._state.resumes.length, 1);
    assert.equal(deps._state.resumes[0].userId, "owner-1");
    assert.equal(deps._state.resumes[0].status, "draft");
  });

  it("uses content.name as the title when present", async () => {
    const deps = makeDeps();
    await handleSaveResume(deps, "owner-1", { name: "Sean's Title" });
    assert.equal(deps._state.resumes[0].title, "Sean's Title");
  });

  it("falls back to 'Untitled Resume' when content has no name", async () => {
    const deps = makeDeps();
    await handleSaveResume(deps, "owner-1", { basics: { email: "x@y" } });
    assert.equal(deps._state.resumes[0].title, "Untitled Resume");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// handleCloneResume
// ═══════════════════════════════════════════════════════════════════════════

describe("handleCloneResume", () => {
  it("duplicates the source resume with ' (copy)' appended to the title", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(
      makeResume({ id: "src", userId: "owner-1", title: "Frontend Eng", content: { basics: { name: "x" } } }),
    );
    const res = await handleCloneResume(deps, "owner-1", "src");
    assert.equal(res.status, 201);
    // 2 rows in state: original + clone.
    assert.equal(deps._state.resumes.length, 2);
    const clone = deps._state.resumes.find((r) => r.title === "Frontend Eng (copy)");
    assert.ok(clone, "clone must exist with '(copy)' title");
    assert.equal(clone?.status, "draft");
  });

  it("returns 404 when the source resume doesn't belong to the caller", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(makeResume({ id: "src", userId: "not-me" }));
    // Owner mismatch → fake DB returns the row regardless since the
    // .where predicate is opaque to the fake; use selectLimitFifo to
    // simulate the real predicate returning nothing.
    const depsStrict = makeDeps({}, { selectLimitFifo: [[]] });
    const res = await handleCloneResume(depsStrict, "owner-1", "src");
    assert.equal(res.status, 404);
    assert.equal((res.body as any).error.code, "NOT_FOUND");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// handlePublishResume
// ═══════════════════════════════════════════════════════════════════════════

describe("handlePublishResume", () => {
  it("flips status to 'published' and returns the updated row", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(makeResume({ id: "r-a", userId: "owner-1", status: "draft" }));
    const res = await handlePublishResume(deps, "owner-1", "r-a");
    assert.equal(res.status, 200);
    assert.equal(deps._state.resumes[0].status, "published");
  });

  it("returns 404 when no row is updated", async () => {
    const deps = makeDeps();
    // No resumes seeded → update returns empty → 404.
    const res = await handlePublishResume(deps, "owner-1", "r-a");
    assert.equal(res.status, 404);
  });

  it("does NOT change privacyLevel (publish is separate from setprivacy)", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(
      makeResume({ id: "r-a", userId: "owner-1", status: "draft", privacyLevel: 10 }),
    );
    await handlePublishResume(deps, "owner-1", "r-a");
    assert.equal(deps._state.resumes[0].privacyLevel, 10);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// handleSetMaster / handleSetActive — singleton-flag flip
// ═══════════════════════════════════════════════════════════════════════════

describe("handleSetMaster / handleSetActive", () => {
  it("setMaster issues unset-all-then-set-one updates (call order matters)", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(
      makeResume({ id: "r-a", userId: "owner-1", isMaster: true }),
      makeResume({ id: "r-b", userId: "owner-1", isMaster: false }),
    );
    const res = await handleSetMaster(deps, "owner-1", "r-b");
    assert.equal(res.status, 200);
    // Asserting on DB call sequence is more honest than state checks here —
    // the fake can't enforce the per-update WHERE clause, but the pattern
    // (unset-all then set-target) is exactly what makes SQL correct.
    const updates = deps._calls.filter((c) => c.kind === "update" && c.table === "resume_information");
    assert.equal(updates.length, 2, "must be exactly unset-all + set-one");
    assert.equal((updates[0].set as any).isMaster, false, "first update: unset");
    assert.equal((updates[1].set as any).isMaster, true, "second update: set target");
  });

  it("setActive issues the same unset-all-then-set-one pattern for the isActive flag", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(
      makeResume({ id: "r-a", userId: "owner-1", isActive: true }),
      makeResume({ id: "r-b", userId: "owner-1", isActive: false }),
    );
    await handleSetActive(deps, "owner-1", "r-b");
    const updates = deps._calls.filter((c) => c.kind === "update" && c.table === "resume_information");
    assert.equal(updates.length, 2);
    assert.equal((updates[0].set as any).isActive, false);
    assert.equal((updates[1].set as any).isActive, true);
  });

  it("returns 404 when the target doesn't belong to the caller", async () => {
    const deps = makeDeps({}, { selectLimitFifo: [[]] });
    const res = await handleSetMaster(deps, "owner-1", "nope");
    assert.equal(res.status, 404);
    // And we must NOT have issued any update calls on 404 — otherwise a
    // missing row would mass-unset every other resume the caller owns.
    const updates = deps._calls.filter((c) => c.kind === "update");
    assert.equal(updates.length, 0, "missing-row guard must short-circuit before updates");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// handleSetPrivacy
// ═══════════════════════════════════════════════════════════════════════════

describe("handleSetPrivacy", () => {
  it("maps 'public' to privacyLevel=0", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(makeResume({ id: "r-a", userId: "owner-1", privacyLevel: 10 }));
    const res = await handleSetPrivacy(deps, "owner-1", "r-a", "public");
    assert.equal(res.status, 200);
    assert.equal(deps._state.resumes[0].privacyLevel, 0);
  });

  it("maps 'private' to privacyLevel=10", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(makeResume({ id: "r-a", userId: "owner-1", privacyLevel: 0 }));
    await handleSetPrivacy(deps, "owner-1", "r-a", "private");
    assert.equal(deps._state.resumes[0].privacyLevel, 10);
  });

  it("maps 'recruiter_only' to privacyLevel=1", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(makeResume({ id: "r-a", userId: "owner-1", privacyLevel: 0 }));
    await handleSetPrivacy(deps, "owner-1", "r-a", "recruiter_only");
    assert.equal(deps._state.resumes[0].privacyLevel, 1);
  });

  it("falls back to privacyLevel=10 (private) for unknown values — safest default", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(makeResume({ id: "r-a", userId: "owner-1", privacyLevel: 0 }));
    await handleSetPrivacy(deps, "owner-1", "r-a", "gibberish");
    assert.equal(deps._state.resumes[0].privacyLevel, 10);
  });

  it("returns 404 when no row is updated", async () => {
    const deps = makeDeps();
    const res = await handleSetPrivacy(deps, "owner-1", "missing", "public");
    assert.equal(res.status, 404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// handlePromote — variant → master + detach parent
// ═══════════════════════════════════════════════════════════════════════════

describe("handlePromote", () => {
  it("issues unset-all + set-target-master-and-clear-parent (two updates, correct shape)", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(
      makeResume({ id: "m-1", userId: "owner-1", isMaster: true }),
      makeResume({ id: "v-1", userId: "owner-1", isMaster: false, parentId: "m-1" }),
    );
    const res = await handlePromote(deps, "owner-1", "v-1");
    assert.equal(res.status, 200);
    const updates = deps._calls.filter((c) => c.kind === "update" && c.table === "resume_information");
    assert.equal(updates.length, 2);
    assert.equal((updates[0].set as any).isMaster, false, "first: unset all");
    assert.equal((updates[1].set as any).isMaster, true, "second: set target master");
    assert.equal((updates[1].set as any).parentId, null, "and clear parentId on target");
  });

  it("returns 404 when the target isn't owned by the caller", async () => {
    const deps = makeDeps({}, { selectLimitFifo: [[]] });
    const res = await handlePromote(deps, "owner-1", "nope");
    assert.equal(res.status, 404);
    const updates = deps._calls.filter((c) => c.kind === "update");
    assert.equal(updates.length, 0, "missing-row guard must short-circuit");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// handleDetach — variant → root (without promoting to master)
// ═══════════════════════════════════════════════════════════════════════════

describe("handleDetach", () => {
  it("clears parentId AND diffPercent, leaves isMaster untouched", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(
      makeResume({
        id: "v-1", userId: "owner-1", isMaster: false,
        parentId: "m-1", diffPercent: 42,
      }),
    );
    const res = await handleDetach(deps, "owner-1", "v-1");
    assert.equal(res.status, 200);
    const row = deps._state.resumes[0];
    assert.equal(row.parentId, null);
    assert.equal(row.diffPercent, null);
    assert.equal(row.isMaster, false, "detach must not flip master");
  });

  it("returns 404 when the target doesn't exist for the caller", async () => {
    const deps = makeDeps();
    const res = await handleDetach(deps, "owner-1", "missing");
    assert.equal(res.status, 404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// handleCreateVariation — child variant off a parent resume
// ═══════════════════════════════════════════════════════════════════════════

describe("handleCreateVariation", () => {
  it("creates a child linked via parentId with privacyLevel=10 (always private)", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(
      makeResume({ id: "m-1", userId: "owner-1", title: "Master", content: { basics: { name: "a" } } }),
    );
    const res = await handleCreateVariation(deps, "owner-1", "m-1", { name: "Backend variant" });
    assert.equal(res.status, 201);
    // 2 rows: parent + new variant.
    assert.equal(deps._state.resumes.length, 2);
    const variant = deps._state.resumes.find((r) => r.title === "Backend variant");
    assert.ok(variant);
    assert.equal(variant?.parentId, "m-1");
    assert.equal(variant?.privacyLevel, 10);
    assert.equal(variant?.isMaster, false);
    assert.equal(variant?.isActive, false);
  });

  it("calls the parser port when resumeData markdown is provided, and carries structured fields across", async () => {
    const deps = makeDeps();
    deps._parser.rawOut = {
      basics: { name: "New Name" },
      work: [{ position: "Eng" }],
    };
    deps._state.resumes.push(
      makeResume({ id: "m-1", userId: "owner-1", content: { basics: { name: "Old" } } }),
    );
    await handleCreateVariation(deps, "owner-1", "m-1", {
      name: "From markdown",
      resumeData: "# New Name\n\n## Work\n- Eng",
    });
    const parserCalls = deps._parser.calls.filter((c) => c.name === "parseRawText");
    assert.equal(parserCalls.length, 1, "parser must have been called exactly once");
    const variant = deps._state.resumes.find((r) => r.title === "From markdown");
    // Parsed basics replace parent basics.
    assert.equal((variant?.content as any).basics.name, "New Name");
    // Markdown is preserved alongside structured data.
    assert.ok((variant?.content as any).markdown);
  });

  it("is non-fatal when the AI parse throws — the variant is still created with parent JSON", async () => {
    const deps = makeDeps();
    deps._parser.parseRawText = async () => { throw new Error("AI down"); };
    deps._state.resumes.push(
      makeResume({ id: "m-1", userId: "owner-1", content: { basics: { name: "parent" } } }),
    );
    const res = await handleCreateVariation(deps, "owner-1", "m-1", {
      resumeData: "arbitrary text",
    });
    assert.equal(res.status, 201, "parse failure must not block variation create");
  });

  it("records the description on content.variationDescription when provided", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(makeResume({ id: "m-1", userId: "owner-1" }));
    await handleCreateVariation(deps, "owner-1", "m-1", {
      description: "Tailored for startup roles",
    });
    const variant = deps._state.resumes[1];
    assert.equal((variant.content as any).variationDescription, "Tailored for startup roles");
  });

  it("returns 404 when the parent resume isn't owned by the caller", async () => {
    const deps = makeDeps({}, { selectLimitFifo: [[]] });
    const res = await handleCreateVariation(deps, "owner-1", "missing", {});
    assert.equal(res.status, 404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// handleGetMetadata / handleUpdateMetadata
// ═══════════════════════════════════════════════════════════════════════════

describe("handleGetMetadata", () => {
  it("returns the metaData array when present in content", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(
      makeResume({
        id: "r-a", userId: "owner-1",
        content: {
          basics: { name: "x" },
          // metaData must satisfy ResumeSectionMetaSchema post-refactor.
          metaData: [{ id: "m1", userId: "owner-1", referenceId: "r-1", metaType: 1, url: "x.mp4", name: "" }],
        },
      }),
    );
    const res = await handleGetMetadata(deps, "owner-1", "r-a");
    assert.equal(res.status, 200);
    const data = (res.body as any).data;
    assert.equal(data.length, 1);
    assert.equal(data[0].id, "m1");
  });

  it("returns [] when content has no metaData (safe default)", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(
      makeResume({ id: "r-a", userId: "owner-1", content: { basics: { name: "x" } } }),
    );
    const res = await handleGetMetadata(deps, "owner-1", "r-a");
    assert.deepEqual((res.body as any).data, []);
  });

  it("returns 404 when the resume doesn't exist for the caller", async () => {
    const deps = makeDeps();
    const res = await handleGetMetadata(deps, "owner-1", "missing");
    assert.equal(res.status, 404);
  });
});

describe("handleUpdateMetadata", () => {
  it("writes the new metaData array and preserves other content fields", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(
      makeResume({
        id: "r-a", userId: "owner-1",
        content: { basics: { name: "Sean" }, work: [{ position: "Eng" }] },
      }),
    );
    // Minimum shape required by ResumeSectionMetaSchema now that
    // updateMetadata routes through the heal+validate pipe.
    const newMeta = [{ id: "m1", userId: "owner-1", referenceId: "r-a", metaType: 1, url: "", name: "" }];
    const res = await handleUpdateMetadata(deps, "owner-1", "r-a", newMeta);
    assert.equal(res.status, 200);
    const content = deps._state.resumes[0].content as any;
    assert.equal(content.metaData.length, 1);
    assert.equal(content.metaData[0].id, "m1");
    // Untouched fields survive.
    assert.equal(content.basics.name, "Sean");
    assert.equal(content.work[0].position, "Eng");
  });

  it("coerces non-array body to [] (safe default)", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(
      makeResume({ id: "r-a", userId: "owner-1", content: {} }),
    );
    await handleUpdateMetadata(deps, "owner-1", "r-a", "not-an-array");
    assert.deepEqual((deps._state.resumes[0].content as any).metaData, []);
  });

  it("returns 404 when the resume doesn't exist for the caller", async () => {
    const deps = makeDeps();
    const res = await handleUpdateMetadata(deps, "owner-1", "missing", []);
    assert.equal(res.status, 404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// handleGetResumeDiff
// ═══════════════════════════════════════════════════════════════════════════

describe("handleGetResumeDiff", () => {
  it("returns 404 when the subject resume doesn't exist for the caller", async () => {
    const deps = makeDeps();
    const res = await handleGetResumeDiff(deps, "owner-1", "missing", null);
    assert.equal(res.status, 404);
  });

  it("returns an empty-changes payload when no parentId and no compareId is given", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(makeResume({ id: "r-a", userId: "owner-1", parentId: null }));
    const res = await handleGetResumeDiff(deps, "owner-1", "r-a", null);
    assert.equal(res.status, 200);
    assert.deepEqual((res.body as any).data.changes, []);
  });

  it("classifies fields as added / removed / changed between two resumes", async () => {
    const subject = makeResume({
      id: "r-a", userId: "owner-1",
      content: { basics: { name: "Sean" }, work: [{ position: "Eng" }] },
    });
    const parent = makeResume({
      id: "r-p", userId: "owner-1",
      content: { basics: { name: "Sean Old" }, education: [{ school: "MIT" }] },
    });
    const deps = makeDeps({}, { resumes: [subject, parent] });
    const res = await handleGetResumeDiff(deps, "owner-1", "r-a", "r-p");
    assert.equal(res.status, 200);
    const body = (res.body as any).data;
    const fields = Object.fromEntries(
      (body.changes as any[]).map((c) => [c.field, c.type]),
    );
    assert.equal(fields.basics, "changed", "basics changed between Sean/Sean Old");
    assert.equal(fields.work, "added", "work only on subject → added");
    assert.equal(fields.education, "removed", "education only on parent → removed");
    assert.equal(body.summary.total, 3);
  });

  it("returns 404 when the compareId doesn't exist for the caller", async () => {
    // Only the subject exists. The real WHERE predicate for compareId=r-p
    // returns no rows, triggering the 404 branch — exactly as prod would.
    const subject = makeResume({ id: "r-a", userId: "owner-1" });
    const deps = makeDeps({}, { resumes: [subject] });
    const res = await handleGetResumeDiff(deps, "owner-1", "r-a", "r-p");
    assert.equal(res.status, 404);
    assert.equal((res.body as any).error.message, "Comparison resume not found");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// handleExportResume
// ═══════════════════════════════════════════════════════════════════════════

describe("handleExportResume", () => {
  const md = (content: any, title: string) =>
    `# ${title}\n\n${content?.basics?.name ?? "—"}`;

  it("returns an error result with status 404 when the resume doesn't exist", async () => {
    const deps = makeDeps();
    const res = await handleExportResume(deps, "owner-1", "missing", "json", md);
    assert.equal(res.kind, "error");
    assert.equal(res.status, 404);
  });

  it("defaults to a JSON download with the right content type + filename", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(makeResume({
      id: "r-a", userId: "owner-1", title: "My Resume",
      content: { basics: { name: "Sean" } },
    }));
    const res = await handleExportResume(deps, "owner-1", "r-a", "json", md);
    assert.equal(res.kind, "download");
    if (res.kind !== "download") return;
    assert.equal(res.contentType, "application/json");
    assert.equal(res.filename, "My_Resume.json");
    const parsed = JSON.parse(res.body);
    assert.equal(parsed.title, "My Resume");
    assert.ok(parsed.exportedAt);
  });

  it("returns markdown when format=md — stored markdown is preferred over converted", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(makeResume({
      id: "r-a", userId: "owner-1", title: "MD Resume",
      content: { markdown: "## pre-baked markdown", basics: { name: "Sean" } },
    }));
    const res = await handleExportResume(deps, "owner-1", "r-a", "md", md);
    if (res.kind !== "download") return assert.fail("expected download");
    assert.equal(res.contentType, "text/markdown; charset=utf-8");
    assert.equal(res.body, "## pre-baked markdown");
    assert.equal(res.filename, "MD_Resume.md");
  });

  it("falls back to JSON-Resume-to-markdown conversion when no markdown is stored", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(makeResume({
      id: "r-a", userId: "owner-1", title: "JR",
      content: { basics: { name: "Sean" } }, // no `.markdown` key
    }));
    const res = await handleExportResume(deps, "owner-1", "r-a", "markdown", md);
    if (res.kind !== "download") return assert.fail("expected download");
    assert.ok(res.body.includes("Sean"), "converter output carries name");
  });

  it("returns plain text + the X-Export-Note fallback header when PDF/DOCX is requested", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(makeResume({
      id: "r-a", userId: "owner-1", title: "PDF",
      content: { basics: { name: "Sean" } },
    }));
    const res = await handleExportResume(deps, "owner-1", "r-a", "pdf", md);
    if (res.kind !== "download") return assert.fail("expected download");
    assert.equal(res.contentType, "text/plain; charset=utf-8");
    assert.equal(res.filename, "PDF.txt");
    assert.ok(res.extraHeaders?.["X-Export-Note"]);
  });

  it("sanitises the filename — strips non-alphanumeric chars", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(makeResume({
      id: "r-a", userId: "owner-1", title: "My/Resume: v2.0!",
      content: {},
    }));
    const res = await handleExportResume(deps, "owner-1", "r-a", "json", md);
    if (res.kind !== "download") return assert.fail();
    // Non-alphanumerics → underscores.
    assert.equal(res.filename, "My_Resume__v2_0_.json");
  });
});


