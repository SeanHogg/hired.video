/**
 * Master / version rules (services/resume/lineage.ts) + the shared pure
 * pieces they stand on: content paths (shared/resume-path.ts), confirmed
 * facts (shared/resume-tailor.ts) and the staleness predicate
 * (shared/resume-lineage.ts).
 *
 * Fixtures mirror real rows: seed-style ids, a master with versions, PascalCase-
 * free JSON Resume content.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildFakeDb } from "../../handlers/__testing__/fake-db.js";
import { ResumeRepository } from "../../repositories/resumeRepository.js";
import {
  describeLineage,
  markVersionSynced,
  masterFor,
  saveVersionOfMaster,
  writeFactsToMaster,
} from "../resume/lineage.js";
import { commitMerge } from "../resume/merge-flow.js";
import { omitPaths, readAt, writeAt, entryPathOf, parsePath } from "../../../../shared/resume-path.js";
import { applyConfirmedFacts } from "../../../../shared/resume-tailor.js";
import { isVersionStale } from "../../../../shared/resume-lineage.js";
import type { ResumeContent } from "../../../../shared/resume.js";

const OWNER = "00000000-0000-4000-8000-000000000101";
const OTHER = "00000000-0000-4000-8000-000000000202";
const MASTER = "11111111-0000-4000-8000-000000000001";
const VERSION = "11111111-0000-4000-8000-000000000002";
const LOOSE = "11111111-0000-4000-8000-000000000003";

const content = (name: string): ResumeContent =>
  ({
    basics: { name, label: "Director Engineering" },
    work: [{ name: "AiM", position: "VP Technology", highlights: ["20% cost reduction", "90% lower attrition"] }],
    skills: [{ name: "SOC 2", level: "", keywords: [] }],
  }) as unknown as ResumeContent;

function row(over: Record<string, unknown>) {
  const at = new Date("2026-09-01T10:00:00Z");
  return {
    id: MASTER,
    userId: OWNER,
    title: "DirectorEngineering_CIO_CTO_2023",
    slug: null,
    content: content("Sean"),
    status: "draft",
    privacyLevel: 10,
    isMaster: false,
    isActive: false,
    parentId: null,
    diffPercent: null,
    templateId: null,
    metaResumeId: null,
    sentimentScore: null,
    scores: null,
    archivedAt: null,
    masterSyncedAt: null,
    createdAt: at,
    updatedAt: at,
    ...over,
  };
}

function setup(rows: Array<Record<string, unknown>>) {
  const fake = buildFakeDb({ resume_information: rows as never });
  const repo = new ResumeRepository(fake.db, () => new Date("2026-10-04T12:00:00Z"));
  const state = () => (fake.state as Record<string, Array<Record<string, unknown>>>).resume_information;
  return { repo, state };
}

describe("lineage — where a copy goes", () => {
  it("a copy of a VERSION is saved under its master and the version stays linked", async () => {
    const { repo, state } = setup([
      row({ id: MASTER, isMaster: true }),
      row({ id: VERSION, parentId: MASTER, title: "VP Eng - Northwind" }),
    ]);
    const out = await saveVersionOfMaster(repo, OWNER, VERSION, { content: content("Sean"), title: "Staff - Acme" });
    assert.equal(out.ok, true);
    assert.equal(out.masterId, MASTER);
    assert.equal(out.row?.parentId, MASTER);
    assert.equal(out.row?.privacyLevel, 10);
    assert.ok(out.row?.masterSyncedAt, "a new version starts in sync with its master");
    const source = state().find((r) => r.id === VERSION);
    assert.equal(source?.parentId, MASTER, "the source version must NOT be unlinked");
  });

  it("a copy of a standalone résumé goes under the owner's master", async () => {
    const { repo } = setup([row({ id: MASTER, isMaster: true }), row({ id: LOOSE, title: "Old one" })]);
    const out = await saveVersionOfMaster(repo, OWNER, LOOSE, { content: content("Sean") });
    assert.equal(out.row?.parentId, MASTER);
  });

  it("with no master anywhere, the copy goes under the source itself", async () => {
    const { repo } = setup([row({ id: LOOSE })]);
    const master = await masterFor(repo, OWNER, (await repo.findByIdForOwner(LOOSE, OWNER))!);
    assert.equal(master.id, LOOSE);
  });

  it("never reads another owner's résumé", async () => {
    const { repo } = setup([row({ id: MASTER, userId: OTHER, isMaster: true })]);
    const out = await saveVersionOfMaster(repo, OWNER, MASTER, { content: content("x") });
    assert.equal(out.ok, false);
    assert.equal(out.code, "NOT_FOUND");
  });

  it("merge 'save as new' into a version makes a version of the MASTER, not a grandchild", async () => {
    const { repo } = setup([
      row({ id: MASTER, isMaster: true }),
      row({ id: VERSION, parentId: MASTER }),
    ]);
    const out = await commitMerge(repo, OWNER, {
      targetResumeId: VERSION,
      merged: content("Sean") as unknown as Record<string, unknown>,
      createNew: true,
      newTitle: "Merged with FractionalCTO_2025",
    });
    assert.equal(out.ok, true);
    const created = await repo.findByIdForOwner(out.ok ? out.resumeId : "", OWNER);
    assert.equal(created?.parentId, MASTER);
  });
});

describe("lineage — describe + staleness", () => {
  it("a version edited before its master changed is stale", async () => {
    const { repo } = setup([
      row({ id: MASTER, isMaster: true, updatedAt: new Date("2026-10-04T09:00:00Z") }),
      row({ id: VERSION, parentId: MASTER, diffPercent: 23, createdAt: new Date("2026-09-20T09:00:00Z") }),
    ]);
    const lineage = await describeLineage(repo, OWNER, VERSION);
    assert.equal(lineage?.role, "version");
    assert.equal(lineage?.master?.id, MASTER);
    assert.equal(lineage?.diffPercent, 23);
    assert.equal(lineage?.stale, true);
    assert.equal(lineage?.versionCount, 1);
  });

  it("pulling the master in clears staleness", async () => {
    const { repo } = setup([
      row({ id: MASTER, isMaster: true, updatedAt: new Date("2026-10-04T09:00:00Z") }),
      row({ id: VERSION, parentId: MASTER, createdAt: new Date("2026-09-20T09:00:00Z") }),
    ]);
    assert.equal(await markVersionSynced(repo, OWNER, VERSION, () => new Date("2026-10-04T12:00:00Z")), true);
    assert.equal((await describeLineage(repo, OWNER, VERSION))?.stale, false);
  });

  it("a master is never stale and reports its versions", async () => {
    const { repo } = setup([row({ id: MASTER, isMaster: true }), row({ id: VERSION, parentId: MASTER })]);
    const lineage = await describeLineage(repo, OWNER, MASTER);
    assert.deepEqual([lineage?.role, lineage?.stale, lineage?.versionCount], ["master", false, 1]);
  });

  it("isVersionStale falls back to created_at for rows made before the column", () => {
    assert.equal(isVersionStale({ masterUpdatedAt: "2026-10-04", versionSyncedAt: null, versionCreatedAt: "2026-10-01" }), true);
    assert.equal(isVersionStale({ masterUpdatedAt: "2026-10-04", versionSyncedAt: "2026-10-05", versionCreatedAt: "2026-10-01" }), false);
  });
});

describe("lineage — write confirmed facts to the master", () => {
  it("adds a confirmed skill and bullet once, idempotently", async () => {
    const { repo, state } = setup([row({ id: MASTER, isMaster: true })]);
    const facts = [
      { kind: "skill" as const, name: "Kubernetes" },
      { kind: "bullet" as const, text: "Moved AiM's apps to AKS in 2022.", entry: { section: "work" as const, name: "aim" } },
    ];
    const first = await writeFactsToMaster(repo, OWNER, facts);
    assert.deepEqual(first, { ok: true, masterId: MASTER, changed: true });
    const second = await writeFactsToMaster(repo, OWNER, facts);
    assert.deepEqual(second, { ok: true, masterId: MASTER, changed: false });
    const saved = state().find((r) => r.id === MASTER)?.content as ResumeContent;
    assert.equal(saved.skills.filter((s) => s.name === "Kubernetes").length, 1);
    assert.equal(saved.work[0].highlights.at(-1), "Moved AiM's apps to AKS in 2022.");
  });

  it("reports NO_MASTER when there is none", async () => {
    const { repo } = setup([row({ id: LOOSE })]);
    const out = await writeFactsToMaster(repo, OWNER, [{ kind: "skill", name: "Go" }]);
    assert.equal(out.ok, false);
  });

  it("a skill already listed as a keyword is not added again", () => {
    const base = { ...content("a"), skills: [{ name: "Cloud", level: "", keywords: ["Kubernetes"] }] } as ResumeContent;
    assert.equal(applyConfirmedFacts(base, [{ kind: "skill", name: "kubernetes" }]), base);
  });
});

describe("content paths", () => {
  const doc = content("Sean");
  it("reads and writes without mutating", () => {
    assert.equal(readAt(doc, "work.0.highlights.1"), "90% lower attrition");
    const next = writeAt(doc, "basics.label", "VP Engineering");
    assert.equal(readAt(next, "basics.label"), "VP Engineering");
    assert.equal(readAt(doc, "basics.label"), "Director Engineering");
    assert.equal(next.work, doc.work, "untouched branches are shared");
  });
  it("omits bullets and entries highest-index first", () => {
    const two = { ...doc, work: [...doc.work, { name: "CNB", highlights: ["a", "b", "c"] }] } as ResumeContent;
    const out = omitPaths(two, ["work.1.highlights.0", "work.1.highlights.2", "work.0"]);
    assert.equal(out.work.length, 1);
    assert.deepEqual(out.work[0].highlights, ["b"]);
  });
  it("parses indices and entry paths", () => {
    assert.deepEqual(parsePath("work.2.highlights.1"), ["work", 2, "highlights", 1]);
    assert.equal(entryPathOf("work.2.highlights.1"), "work.2");
    assert.equal(entryPathOf("basics.label"), null);
  });
});
