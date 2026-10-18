/**
 * getResume — the public/detail résumé read.
 *
 *   • The view insert runs OFF the response path (deps.runDetached →
 *     waitUntil): the response resolves even while insertView is pending.
 *   • hasWatched / countViews / the promote flag run concurrently.
 *   • Owner views and embeds (recordView:false) record nothing.
 *   • Response shape is unchanged.
 *
 * Run: node --import tsx --test src/services/resume/__tests__/get-resume.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { getResume } from "../queries.js";
import type { ResumeDeps, ResumeRequestContext } from "../ports.js";
import type { ResumeRow } from "../../../repositories/index.js";

const RESUME_ID = "11111111-1111-4111-8111-111111111111";
const OWNER = "22222222-2222-4222-8222-222222222222";
const VIEWER = "33333333-3333-4333-8333-333333333333";

function makeRow(over: Partial<ResumeRow> = {}): ResumeRow {
  const now = new Date("2026-10-17T00:00:00Z");
  return {
    id: RESUME_ID,
    userId: OWNER,
    title: "Senior Engineer",
    slug: "senior-engineer",
    content: { basics: { name: "Ada" }, work: [], education: [], skills: [] },
    status: "draft",
    privacyLevel: 0,
    isMaster: true,
    isActive: true,
    parentId: null,
    diffPercent: null,
    templateId: null,
    metaResumeId: null,
    sentimentScore: null,
    scores: null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    ...over,
  } as unknown as ResumeRow;
}

interface Harness {
  deps: ResumeDeps;
  inserts: unknown[];
  detached: Promise<void>[];
  started: string[];
  releaseInsert: () => void;
  releaseReads: () => void;
}

function harness(opts: { row?: ResumeRow; promoted?: boolean; withRunDetached?: boolean } = {}): Harness {
  const inserts: unknown[] = [];
  const detached: Promise<void>[] = [];
  const started: string[] = [];
  let releaseInsert = () => {};
  const insertGate = new Promise<void>((r) => (releaseInsert = r));
  let releaseReads = () => {};
  const readGate = new Promise<void>((r) => (releaseReads = r));
  const row = opts.row ?? makeRow();

  const repo = {
    async findById() {
      return row;
    },
    async findByIdOrSlug() {
      return row;
    },
    async insertView(v: unknown) {
      inserts.push(v);
      await insertGate; // never released in the "off the path" test
    },
    async hasWatched() {
      started.push("hasWatched");
      await readGate;
      return true;
    },
    async countViews() {
      started.push("countViews");
      await readGate;
      return 7;
    },
  };
  const deps = {
    repo: repo as unknown as ResumeDeps["repo"],
    parser: {} as ResumeDeps["parser"],
    diff: {} as ResumeDeps["diff"],
    now: () => new Date(),
    ownerFlags: {
      async isPromotedWithoutAuth() {
        started.push("promote");
        await readGate;
        return opts.promoted ?? false;
      },
    },
    ...(opts.withRunDetached === false ? {} : { runDetached: (t: Promise<void>) => void detached.push(t) }),
  } satisfies ResumeDeps;
  return { deps, inserts, detached, started, releaseInsert, releaseReads };
}

function ctx(viewerId: string | null): ResumeRequestContext {
  return { viewerId, ipHash: "h", ipCountry: "CA", referrer: null, userAgent: "UA" };
}

describe("getResume — view insert off the response path", () => {
  it("responds while the view insert is still pending and hands it to runDetached", async () => {
    const h = harness();
    h.releaseReads();
    const resume = await getResume(h.deps, ctx(VIEWER), RESUME_ID);
    assert.equal(resume.id, RESUME_ID);
    assert.equal(h.inserts.length, 1, "insert started");
    assert.equal(h.detached.length, 1, "registered with waitUntil");
    h.releaseInsert();
    await Promise.all(h.detached);
  });

  it("still records (detached) when no runDetached is wired", async () => {
    const h = harness({ withRunDetached: false });
    h.releaseReads();
    h.releaseInsert();
    await getResume(h.deps, ctx(VIEWER), RESUME_ID);
    assert.equal(h.inserts.length, 1);
  });

  it("records nothing for the owner or for embeds", async () => {
    const owner = harness();
    owner.releaseReads();
    await getResume(owner.deps, ctx(OWNER), RESUME_ID);
    assert.equal(owner.inserts.length, 0);

    const embed = harness();
    embed.releaseReads();
    await getResume(embed.deps, ctx(VIEWER), RESUME_ID, { recordView: false });
    assert.equal(embed.inserts.length, 0);
    assert.equal(embed.detached.length, 0);
  });

  it("a failing view insert never fails the read", async () => {
    const h = harness();
    h.releaseReads();
    (h.deps.repo as unknown as { insertView: () => Promise<void> }).insertView = async () => {
      throw new Error("db down");
    };
    const resume = await getResume(h.deps, ctx(VIEWER), RESUME_ID);
    assert.equal(resume.id, RESUME_ID);
    await Promise.all(h.detached);
  });
});

describe("getResume — concurrent reads, unchanged shape", () => {
  it("starts hasWatched + countViews before either resolves (signed-in viewer)", async () => {
    const h = harness();
    h.releaseInsert();
    const pending = getResume(h.deps, ctx(VIEWER), RESUME_ID);
    await new Promise((r) => setImmediate(r));
    assert.deepEqual([...h.started].sort(), ["countViews", "hasWatched"]);
    h.releaseReads();
    const resume = await pending;
    assert.equal(resume.isWatched, true);
    assert.equal(resume.viewCount, 7);
    assert.equal(resume.isOwner, false);
    assert.equal(resume.ownerPromoteWithoutAuth, undefined, "signed-in viewers don't get the flag");
  });

  it("anonymous viewer: countViews + promote flag run together; no watch lookup", async () => {
    const h = harness({ promoted: true });
    h.releaseInsert();
    const pending = getResume(h.deps, ctx(null), RESUME_ID);
    await new Promise((r) => setImmediate(r));
    assert.deepEqual([...h.started].sort(), ["countViews", "promote"]);
    h.releaseReads();
    const resume = await pending;
    assert.equal(resume.isWatched, false);
    assert.equal(resume.ownerPromoteWithoutAuth, true);
  });

  it("private résumé is still 404 RESUME_PRIVATE for non-owners, with no view recorded", async () => {
    const h = harness({ row: makeRow({ privacyLevel: 2 }) });
    h.releaseReads();
    await assert.rejects(getResume(h.deps, ctx(VIEWER), RESUME_ID), (e: unknown) => {
      return (e as { code?: string }).code === "RESUME_PRIVATE";
    });
    assert.equal(h.inserts.length, 0);
  });
});
