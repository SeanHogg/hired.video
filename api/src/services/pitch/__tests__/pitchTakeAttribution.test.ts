/**
 * Pitch take attribution (#2391 hardening, defence in depth): a take counts
 * toward a user's pitch only when it was recorded by the project's owner or
 * by a delegate with an active "studio" workspace grant from them — the same
 * personal-side `canActFor` rule the recording upload enforces. A take
 * someone else linked to the project is never shown as the owner's pitch.
 *
 * Two layers:
 *   1. SQL — `countedPitchTake()` compiles to owner-equality OR an EXISTS
 *      over live workspace_grants, and every PitchRepository take lookup
 *      (findCurrentForUsers, findCurrentForProfiles, hasRecording) applies
 *      it. Captured from the real repository with a stub db (no Postgres).
 *   2. Behaviour — the service reads (`getProfilePitch`, `getVisiblePitch`,
 *      `getCurrentPitch`, `setCurrentPitch`) over a fake repository that
 *      evaluates the same rule in memory.
 *
 * Run: node --import tsx --test src/services/pitch/__tests__/pitchTakeAttribution.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import {
  PitchRepository,
  countedPitchTake,
  type CurrentPitchRow,
  type IPitchRepository,
  type PitchProjectRow,
  type ProfilePitchRow,
} from "../../../repositories/pitchRepository.js";
import { PitchError, getCurrentPitch, getProfilePitch, getVisiblePitch, setCurrentPitch } from "../pitchService.js";

const dialect = new PgDialect();
const compile = (w: SQL) => dialect.sqlToQuery(w);

const ALICE = "5b0c7a9e-1f43-4c4e-9a51-2d7f3c1e8a10";
const MALLORY = "9e2d4f61-7a8b-4c3d-8e9f-0a1b2c3d4e5f";
const COACH = "0d1e2f3a-4b5c-4d6e-8f70-8192a3b4c5d6";
const P_PITCH = "11111111-1111-4111-8111-111111111111";
const cdn = (uid: string, file: string) => `https://cdn.hired.video/studio/recordings/${uid}/${file}`;

// ── 1. SQL ──────────────────────────────────────────────────────────────────

const OWNER_EQ = /"studio_recordings"\."user_id" = "studio_projects"\."user_id"::text/;

/** Stub db that records each query's WHERE and resolves every chain to []. */
function captureDb() {
  const wheres: SQL[] = [];
  const chain: Record<string, unknown> = new Proxy<Record<string, unknown>>({}, {
    get(_target, prop) {
      if (prop === "then") return undefined; // the chain itself is not a promise
      if (prop === "where") return (w: SQL) => { wheres.push(w); return chain; };
      if (prop === "orderBy" || prop === "limit") return async () => [];
      return () => chain;
    },
  });
  return { db: { select: () => chain }, wheres };
}

describe("countedPitchTake — compiled SQL", () => {
  const { sql, params } = compile(countedPitchTake());

  it("accepts a take recorded by the project owner (text-cast join)", () => {
    assert.match(sql, OWNER_EQ);
  });

  it("or by a delegate with a live studio grant from the owner", () => {
    assert.match(sql, /exists \(select 1 from "workspace_grants"/i);
    assert.match(sql, /"workspace_grants"\."subject_user_id" = "studio_projects"\."user_id"/);
    assert.match(sql, /"workspace_grants"\."contributor_user_id"::text = "studio_recordings"\."user_id"/);
    assert.match(sql, /"workspace_grants"\."is_active" = \$\d+/);
    assert.match(sql, /"workspace_grants"\."expires_at" is null/i);
    assert.ok(params.includes("studio"), "grant scope is bound as 'studio'");
  });

  it("never compiles an empty operand around `=`", () => {
    assert.doesNotMatch(sql, / {2}=/);
  });
});

describe("PitchRepository — every take lookup applies the attribution rule", () => {
  it("findCurrentForUsers", async () => {
    const { db, wheres } = captureDb();
    await new PitchRepository(db).findCurrentForUsers([ALICE]);
    assert.equal(wheres.length, 1);
    assert.match(compile(wheres[0]).sql, OWNER_EQ);
  });

  it("findCurrentForProfiles", async () => {
    const { db, wheres } = captureDb();
    await new PitchRepository(db).findCurrentForProfiles([ALICE]);
    assert.equal(wheres.length, 1);
    assert.match(compile(wheres[0]).sql, OWNER_EQ);
  });

  it("hasRecording (the set-as-pitch NO_MEDIA gate)", async () => {
    const { db, wheres } = captureDb();
    assert.equal(await new PitchRepository(db).hasRecording(P_PITCH), false);
    assert.equal(wheres.length, 1);
    const { sql, params } = compile(wheres[0]);
    assert.match(sql, OWNER_EQ);
    assert.match(sql, /"studio_projects"\."id" = \$\d+/);
    assert.ok(params.includes(P_PITCH));
  });
});

// ── 2. Behaviour ────────────────────────────────────────────────────────────

interface Take { projectId: string; recordedBy: string; videoUrl: string; createdAt: Date }

/** Evaluates `countedPitchTake` in memory: owner, or an active studio grant. */
class AttributingRepo implements IPitchRepository {
  grants = new Set<string>(); // `${subject}->${contributor}`
  constructor(public projects: PitchProjectRow[], public takes: Take[]) {}

  private counted(p: PitchProjectRow, t: Take): boolean {
    return t.recordedBy === p.userId || this.grants.has(`${p.userId}->${t.recordedBy}`);
  }
  async findCurrentForUsers(userIds: string[]): Promise<CurrentPitchRow[]> {
    return this.projects
      .filter((p) => userIds.includes(p.userId) && p.isCurrentPitch)
      .flatMap((p) => this.takes
        .filter((t) => t.projectId === p.id && this.counted(p, t))
        .map((t) => ({ userId: p.userId, projectId: p.id, videoUrl: t.videoUrl, durationMs: null, recordedAt: t.createdAt })))
      .sort((a, b) => +new Date(b.recordedAt ?? 0) - +new Date(a.recordedAt ?? 0));
  }
  async findCurrentForProfiles(userIds: string[]): Promise<ProfilePitchRow[]> {
    return (await this.findCurrentForUsers(userIds)).map((r) => ({ ...r, profileSections: null, role: "job_seeker" }));
  }
  async findProject(id: string) { return this.projects.find((p) => p.id === id) ?? null; }
  async hasRecording(id: string) {
    const p = this.projects.find((x) => x.id === id);
    return !!p && this.takes.some((t) => t.projectId === id && this.counted(p, t));
  }
  async setCurrent(userId: string, projectId: string) {
    for (const p of this.projects) if (p.userId === userId) p.isCurrentPitch = p.id === projectId;
  }
  async clearCurrent(userId: string) { for (const p of this.projects) if (p.userId === userId) p.isCurrentPitch = false; }
}

const ownTake: Take = { projectId: P_PITCH, recordedBy: ALICE, videoUrl: cdn(ALICE, "own.webm"), createdAt: new Date("2026-09-20T09:30:00Z") };
const foreignTake: Take = { projectId: P_PITCH, recordedBy: MALLORY, videoUrl: cdn(MALLORY, "planted.webm"), createdAt: new Date("2026-09-21T12:00:00Z") };
const coachTake: Take = { projectId: P_PITCH, recordedBy: COACH, videoUrl: cdn(COACH, "coached.webm"), createdAt: new Date("2026-09-22T08:00:00Z") };
const alicePitch = (isCurrentPitch: boolean): PitchProjectRow =>
  ({ id: P_PITCH, userId: ALICE, companyId: null, purpose: "pitch", isCurrentPitch });

describe("pitch reads ignore foreign takes", () => {
  it("a newer take planted by another user never replaces the owner's pitch", async () => {
    const repo = new AttributingRepo([alicePitch(true)], [ownTake, foreignTake]);
    assert.equal((await getProfilePitch({ id: ALICE, role: "job_seeker" }, repo))?.videoUrl, ownTake.videoUrl);
    assert.equal((await getVisiblePitch(ALICE, repo))?.videoUrl, ownTake.videoUrl);
    assert.equal((await getCurrentPitch(ALICE, repo))?.videoUrl, ownTake.videoUrl);
  });

  it("a project with only a foreign take has no pitch, and cannot be set as one", async () => {
    const repo = new AttributingRepo([alicePitch(false)], [foreignTake]);
    await assert.rejects(setCurrentPitch(ALICE, P_PITCH, repo), (e: unknown) => e instanceof PitchError && e.code === "NO_MEDIA");
    repo.projects[0].isCurrentPitch = true;
    assert.equal(await getVisiblePitch(ALICE, repo), null);
  });

  it("the owner's own take still sets and shows", async () => {
    const repo = new AttributingRepo([alicePitch(false)], [ownTake]);
    assert.equal((await setCurrentPitch(ALICE, P_PITCH, repo)).videoUrl, ownTake.videoUrl);
  });

  it("a delegate's take counts while their studio grant is active", async () => {
    const repo = new AttributingRepo([alicePitch(true)], [ownTake, coachTake]);
    assert.equal((await getVisiblePitch(ALICE, repo))?.videoUrl, ownTake.videoUrl);
    repo.grants.add(`${ALICE}->${COACH}`);
    assert.equal((await getVisiblePitch(ALICE, repo))?.videoUrl, coachTake.videoUrl);
  });
});
