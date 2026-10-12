/**
 * Tests for the fake-db predicate evaluator. These exercise the
 * introspection layer — if Drizzle ever changes its SQL AST shape
 * these break and we notice before every handler test goes wrong.
 *
 * Run: node --import tsx --test src/handlers/__testing__/fake-db.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { and, eq, ne, inArray, lte, or, isNull } from "drizzle-orm";

import { schema } from "../../db/index.js";
import { buildFakeDb, compilePredicate } from "./fake-db.js";

const { resumeInformation: resumes, watchedResumes } = schema;

describe("compilePredicate — Drizzle AST → row filter", () => {
  it("eq filters rows to strict equality on the named column", () => {
    const pred = compilePredicate(eq(resumes.id, "r-1"));
    assert.equal(pred({ id: "r-1" }), true);
    assert.equal(pred({ id: "r-2" }), false);
    assert.equal(pred({ id: null }), false);
  });

  it("ne filters rows to inequality", () => {
    const pred = compilePredicate(ne(resumes.slug, "taken"));
    assert.equal(pred({ slug: "taken" }), false);
    assert.equal(pred({ slug: "other" }), true);
  });

  it("inArray filters rows whose column value appears in the list", () => {
    const pred = compilePredicate(inArray(resumes.userId, ["u1", "u2"]));
    assert.equal(pred({ userId: "u1" }), true);
    assert.equal(pred({ userId: "u2" }), true);
    assert.equal(pred({ userId: "u3" }), false);
  });

  it("lte on integer column", () => {
    const pred = compilePredicate(lte(resumes.privacyLevel, 1));
    assert.equal(pred({ privacyLevel: 0 }), true);
    assert.equal(pred({ privacyLevel: 1 }), true);
    assert.equal(pred({ privacyLevel: 2 }), false);
  });

  it("and composes — both branches must hold", () => {
    const pred = compilePredicate(
      and(eq(resumes.userId, "u1"), eq(resumes.slug, "x")),
    );
    assert.equal(pred({ userId: "u1", slug: "x" }), true);
    assert.equal(pred({ userId: "u1", slug: "y" }), false);
    assert.equal(pred({ userId: "u2", slug: "x" }), false);
  });

  it("or composes — at least one branch must hold", () => {
    const pred = compilePredicate(
      or(eq(resumes.userId, "u1"), eq(resumes.userId, "u2")),
    );
    assert.equal(pred({ userId: "u1" }), true);
    assert.equal(pred({ userId: "u2" }), true);
    assert.equal(pred({ userId: "u3" }), false);
  });

  it("isNull matches null/undefined column values", () => {
    const pred = compilePredicate(isNull(resumes.parentId));
    assert.equal(pred({ parentId: null }), true);
    assert.equal(pred({ parentId: undefined }), true);
    assert.equal(pred({ parentId: "m-1" }), false);
  });

  it("nested and(ne, eq, inArray) from a real handler predicate shape", () => {
    // This is the shape handleValidateSlug uses to exclude the current resume.
    const pred = compilePredicate(
      and(
        eq(resumes.userId, "u1"),
        eq(resumes.slug, "mine"),
        ne(resumes.id, "r-a"),
      ),
    );
    assert.equal(
      pred({ userId: "u1", slug: "mine", id: "r-b" }),
      true,
      "same-slug but different resume id → match",
    );
    assert.equal(
      pred({ userId: "u1", slug: "mine", id: "r-a" }),
      false,
      "excluded id → no match",
    );
    assert.equal(
      pred({ userId: "u2", slug: "mine", id: "r-b" }),
      false,
      "different user → no match",
    );
  });
});

describe("buildFakeDb — select chain", () => {
  it("select().from().where() filters the table", async () => {
    const { db } = buildFakeDb({
      resume_information: [
        { id: "r-a", userId: "u1", title: "A" },
        { id: "r-b", userId: "u2", title: "B" },
      ],
    });
    const rows = await db.select().from(resumes).where(eq(resumes.userId, "u1"));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, "r-a");
  });

  it(".where().limit(n) returns only n matching rows", async () => {
    const { db } = buildFakeDb({
      resume_information: [
        { id: "r-1", userId: "u1" },
        { id: "r-2", userId: "u1" },
        { id: "r-3", userId: "u1" },
      ],
    });
    const rows = await db
      .select()
      .from(resumes)
      .where(eq(resumes.userId, "u1"))
      .limit(2);
    assert.equal(rows.length, 2);
  });

  it(".where() on non-matching predicate returns empty", async () => {
    const { db } = buildFakeDb({
      resume_information: [{ id: "r-a", userId: "u1" }],
    });
    const rows = await db
      .select()
      .from(resumes)
      .where(eq(resumes.userId, "someone-else"))
      .limit(1);
    assert.equal(rows.length, 0);
  });

  it("projection via select({alias: col}) returns only the aliased fields", async () => {
    const { db } = buildFakeDb({
      resume_information: [{ id: "r-a", userId: "u1", title: "A" }],
    });
    const rows = await db
      .select({ id: resumes.id })
      .from(resumes)
      .where(eq(resumes.userId, "u1"));
    assert.deepEqual(Object.keys(rows[0] ?? {}).sort(), ["id"]);
  });
});

describe("buildFakeDb — update respects WHERE", () => {
  it("update().where(eq(id, target)) mutates ONLY matching rows", async () => {
    const { db, state } = buildFakeDb({
      resume_information: [
        { id: "r-a", userId: "u1", isMaster: true },
        { id: "r-b", userId: "u1", isMaster: false },
      ],
    });
    await db
      .update(resumes)
      .set({ isMaster: true })
      .where(eq(resumes.id, "r-b"));
    const a = state.resume_information.find((r) => r.id === "r-a")!;
    const b = state.resume_information.find((r) => r.id === "r-b")!;
    assert.equal(a.isMaster, true, "untouched target stays true");
    assert.equal(b.isMaster, true, "target was flipped");
  });

  it("mass unset: update({flag:false}).where(eq(userId, u)) affects all user rows only", async () => {
    const { db, state } = buildFakeDb({
      resume_information: [
        { id: "r-a", userId: "u1", isMaster: true },
        { id: "r-b", userId: "u1", isMaster: true },
        { id: "r-c", userId: "u2", isMaster: true },
      ],
    });
    await db
      .update(resumes)
      .set({ isMaster: false })
      .where(eq(resumes.userId, "u1"));
    const rows = state.resume_information;
    assert.equal(rows.find((r) => r.id === "r-a")!.isMaster, false);
    assert.equal(rows.find((r) => r.id === "r-b")!.isMaster, false);
    assert.equal(
      rows.find((r) => r.id === "r-c")!.isMaster,
      true,
      "other user's row must NOT be touched",
    );
  });
});

describe("buildFakeDb — delete respects WHERE", () => {
  it("delete().where(eq(id, target)) removes only that row", async () => {
    const { db, state } = buildFakeDb({
      resume_information: [
        { id: "r-a", userId: "u1" },
        { id: "r-b", userId: "u1" },
      ],
    });
    await db.delete(resumes).where(eq(resumes.id, "r-a"));
    assert.equal(state.resume_information.length, 1);
    assert.equal(state.resume_information[0].id, "r-b");
  });

  it("delete.where(compound and-chain) removes only rows matching all clauses", async () => {
    const { db, state } = buildFakeDb({
      watched_resumes: [
        { id: "w1", viewerId: "u1", resumeId: "r-a" },
        { id: "w2", viewerId: "u1", resumeId: "r-b" },
        { id: "w3", viewerId: "u2", resumeId: "r-a" },
      ],
    });
    await db
      .delete(watchedResumes)
      .where(
        and(
          eq(watchedResumes.viewerId, "u1"),
          eq(watchedResumes.resumeId, "r-a"),
        ),
      );
    assert.equal(state.watched_resumes.length, 2);
    assert.ok(!state.watched_resumes.find((r) => r.id === "w1"));
    assert.ok(state.watched_resumes.find((r) => r.id === "w2"));
    assert.ok(state.watched_resumes.find((r) => r.id === "w3"));
  });
});
