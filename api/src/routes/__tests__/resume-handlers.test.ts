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

import {
  handleGetResume,
  handleUpdateResume,
  handleCreateResume,
  handleDeleteResume,
  handleWatchResume,
  handleUnwatchResume,
  handleSentimentPrediction,
  handleListResumes,
  type ResumeDeps,
  type ResumeRequestContext,
  type ResumeParserPort,
  type DiffRecomputePort,
} from "../resume-handlers.js";

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

function makeFakeDb(seed: {
  resumes?: FakeResume[];
  watches?: FakeWatch[];
  views?: FakeView[];
  /** Optional FIFO of select-limit responses. When set, each
   *  `select().from().where().limit()` pops the next array from this
   *  queue instead of returning the whole slot. Use this for handlers
   *  that issue multiple lookups against the same table where the
   *  predicate matters (e.g. slug-conflict check then fetch-existing). */
  selectLimitFifo?: unknown[][];
} = {}) {
  const state = {
    resumes: seed.resumes ?? [],
    watches: seed.watches ?? [],
    views: seed.views ?? [],
    selectLimitFifo: seed.selectLimitFifo ? [...seed.selectLimitFifo] : null,
  };
  const calls: Array<{ kind: string; table?: string; [k: string]: unknown }> = [];

  function inferTable(t: any): "resumes" | "watches" | "views" | null {
    // Drizzle tables expose a symbol with the table name. Multiple
    // Drizzle versions disagree on which symbol, so walk a few.
    const sym = Object.getOwnPropertySymbols(t ?? {}).find((s) => /name/i.test(s.description ?? ""));
    const name = sym ? (t as any)[sym] : null;
    if (name === "resume_information") return "resumes";
    if (name === "watched_resumes") return "watches";
    if (name === "resume_views") return "views";
    // Fallback: walk the candidate keys on the drizzle table object.
    const n = (t as any)?._?.name ?? (t as any)?._?.baseName ?? (t as any)?.name ?? null;
    if (n === "resume_information") return "resumes";
    if (n === "watched_resumes") return "watches";
    if (n === "resume_views") return "views";
    return null;
  }

  const db: any = {
    select(columns?: unknown) {
      calls.push({ kind: "select", columns });
      return {
        from(table: any) {
          const key = inferTable(table);
          return {
            where(_: unknown) {
              return {
                limit(n: number) {
                  if (!key) return Promise.resolve([]);
                  // If the test provided a per-call FIFO, consume it —
                  // this is how tests simulate sequential lookups where
                  // the predicate matters (e.g. slug-conflict check →
                  // fetch-existing).
                  if (state.selectLimitFifo && state.selectLimitFifo.length > 0) {
                    const next = state.selectLimitFifo.shift();
                    return Promise.resolve((next as any[]).slice(0, n));
                  }
                  return Promise.resolve((state as any)[key].slice(0, n));
                },
                orderBy(_ob: unknown) {
                  if (!key) return Promise.resolve([]);
                  return Promise.resolve((state as any)[key].slice());
                },
                groupBy(_gb: unknown) {
                  if (key === "views") {
                    const counts = new Map<string, number>();
                    for (const v of state.views) counts.set(v.resumeId, (counts.get(v.resumeId) ?? 0) + 1);
                    return Promise.resolve(
                      Array.from(counts.entries()).map(([resumeId, c]) => ({ resumeId, c })),
                    );
                  }
                  return Promise.resolve([]);
                },
                then(resolve: any) {
                  if (!key) return resolve([]);
                  // Aggregate path — callers use .select({c: count(*)})
                  // with a .from().where().then() chain without .limit.
                  // For count(*) the fake returns a single row.
                  const colsObj = columns as Record<string, unknown> | undefined;
                  if (colsObj && "c" in colsObj && !("resumeId" in colsObj)) {
                    return resolve([{ c: (state as any)[key].length }]);
                  }
                  if (colsObj && "n" in colsObj) {
                    return resolve([{ n: (state as any)[key].length }]);
                  }
                  resolve((state as any)[key].slice());
                },
              };
            },
          };
        },
      };
    },
    insert(table: any) {
      const key = inferTable(table);
      return {
        values(vs: any) {
          const row = {
            id: vs.id ?? randomUUID(),
            ...vs,
            createdAt: vs.createdAt ?? new Date(),
            updatedAt: vs.updatedAt ?? new Date(),
            watchedAt: vs.watchedAt ?? new Date(),
            viewedAt: vs.viewedAt ?? new Date(),
          };
          if (key) (state as any)[key].push(row);
          calls.push({ kind: "insert", table: key ?? "unknown", row });
          return {
            returning(_?: unknown) {
              return Promise.resolve([row]);
            },
            then(resolve: any) {
              resolve(undefined);
            },
          };
        },
      };
    },
    update(table: any) {
      const key = inferTable(table);
      return {
        set(values: Record<string, unknown>) {
          return {
            where(_: unknown) {
              // Apply to every seeded row in the slot.
              if (key) {
                for (const row of (state as any)[key] as any[]) {
                  Object.assign(row, values);
                }
              }
              calls.push({ kind: "update", table: key ?? "unknown", set: values });
              return {
                returning(_?: unknown) {
                  return Promise.resolve(key ? (state as any)[key].slice() : []);
                },
                then(resolve: any) {
                  resolve(undefined);
                },
              };
            },
          };
        },
      };
    },
    delete(table: any) {
      const key = inferTable(table);
      return {
        where(_: unknown) {
          if (key) (state as any)[key].length = 0;
          calls.push({ kind: "delete", table: key ?? "unknown" });
          return Promise.resolve();
        },
      };
    },
  };

  return { db, state, calls };
}

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
    refresh: async (_db, userId, resumeId) => {
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
  return {
    db,
    parser,
    diff,
    now: () => new Date("2026-04-19T00:00:00.000Z"),
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

  it("rejects a UUID-shaped slug at the schema layer with 400 VALIDATION_ERROR", async () => {
    const deps = makeDeps();
    deps._state.resumes.push(makeResume({ userId: "owner-1" }));
    const res = await handleUpdateResume(deps, "owner-1", "11111111-1111-1111-1111-111111111111", {
      slug: "235e11c9-0b21-4a97-9cd1-ab3db085b199",
    });
    assert.equal(res.status, 400);
    assert.equal((res.body as any).error.code, "VALIDATION_ERROR");
  });

  it("returns 409 SLUG_TAKEN when another of the user's resumes already uses the slug", async () => {
    const other = makeResume({ id: "22222222-2222-2222-2222-222222222222", userId: "owner-1", slug: "taken" });
    const current = makeResume({ userId: "owner-1" });
    // FIFO: slug-conflict check returns the "other" row (conflict present).
    const deps = makeDeps({}, {
      resumes: [current],
      selectLimitFifo: [[other]],
    });
    const res = await handleUpdateResume(deps, "owner-1", "11111111-1111-1111-1111-111111111111", {
      slug: "taken",
    });
    assert.equal(res.status, 409);
    assert.equal((res.body as any).error.code, "SLUG_TAKEN");
  });

  it("preserves content.metaData when caller updates content without including metaData", async () => {
    const seed = makeResume({
      userId: "owner-1",
      content: { basics: { name: "old" }, metaData: [{ id: "m1", metaType: 1, url: "v.mp4" }] },
    });
    // No slug update requested → only the fetch-existing select runs.
    const deps = makeDeps({}, {
      resumes: [seed],
      selectLimitFifo: [[{ content: seed.content }]],
    });
    const res = await handleUpdateResume(deps, "owner-1", "11111111-1111-1111-1111-111111111111", {
      content: { basics: { name: "new" } },
    });
    assert.equal(res.status, 200);
    const saved = deps._state.resumes[0].content as any;
    assert.deepEqual(saved.metaData, [{ id: "m1", metaType: 1, url: "v.mp4" }], "metaData preserved");
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
      deps._calls.some((c) => c.kind === "update" && c.table === "resumes"),
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
