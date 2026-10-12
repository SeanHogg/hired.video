/**
 * Set-as-pitch (#1237): one current pitch per user, ownership + purpose
 * gates, and the batch read every candidate surface embeds (#2133).
 *
 * The fake repository mirrors PitchRepository semantics, including the
 * partial unique index `uq_studio_projects_current_pitch_per_user` (a
 * second `is_current_pitch = true` row for the same user throws 23505).
 * Fixtures mirror real rows: uuid ids, `studio/recordings/{uid}/...` CDN
 * URLs as written by POST /api/studio/recording/upload.
 *
 * Run: node --import tsx --test src/services/pitch/__tests__/pitchService.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PitchError,
  clearCurrentPitch,
  getCurrentPitch,
  getCurrentPitches,
  getProfilePitch,
  getVisiblePitch,
  getVisiblePitches,
  pitchAllowedUnderRedaction,
  setCurrentPitch,
  toPitchSummaries,
} from "../pitchService.js";
import type {
  CurrentPitchRow,
  IPitchRepository,
  PitchProjectRow,
  ProfilePitchRow,
} from "../../../repositories/pitchRepository.js";

const ALICE = "5b0c7a9e-1f43-4c4e-9a51-2d7f3c1e8a10";
const BOB = "9e2d4f61-7a8b-4c3d-8e9f-0a1b2c3d4e5f";
const ACME = "c0ffee00-1234-4abc-8def-001122334455";

const P_FIRST = "11111111-1111-4111-8111-111111111111";
const P_SECOND = "22222222-2222-4222-8222-222222222222";
const P_BOB = "33333333-3333-4333-8333-333333333333";
const P_RESUME_VIDEO = "44444444-4444-4444-8444-444444444444";
const P_COMPANY = "55555555-5555-4555-8555-555555555555";
const P_EMPTY = "66666666-6666-4666-8666-666666666666";

const cdn = (uid: string, file: string) => `https://cdn.hired.video/studio/recordings/${uid}/${file}`;

interface FakeRecording {
  projectId: string;
  videoUrl: string | null;
  durationMs: number | null;
  createdAt: Date;
}

class FakePitchRepo implements IPitchRepository {
  findCurrentCalls = 0;
  failNextSetWithUniqueViolation = false;
  /** Raw `user_profiles.profile_sections` per user (absent = no row). */
  profileSections = new Map<string, unknown>();
  /** `users.role` per user (the section defaults). */
  roles = new Map<string, string>([[ALICE, "job_seeker"], [BOB, "recruiter"]]);
  constructor(
    public projects: PitchProjectRow[],
    public recordings: FakeRecording[],
  ) {}

  private assertUnique(): void {
    const seen = new Set<string>();
    for (const p of this.projects.filter((x) => x.isCurrentPitch)) {
      if (seen.has(p.userId)) {
        throw Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" });
      }
      seen.add(p.userId);
    }
  }

  async findCurrentForUsers(userIds: string[]): Promise<CurrentPitchRow[]> {
    this.findCurrentCalls += 1;
    const rows: CurrentPitchRow[] = [];
    for (const p of this.projects) {
      if (!userIds.includes(p.userId) || !p.isCurrentPitch) continue;
      for (const r of this.recordings.filter((x) => x.projectId === p.id && x.videoUrl)) {
        rows.push({ userId: p.userId, projectId: p.id, videoUrl: r.videoUrl, durationMs: r.durationMs, recordedAt: r.createdAt });
      }
    }
    return rows.sort((a, b) => new Date(b.recordedAt ?? 0).getTime() - new Date(a.recordedAt ?? 0).getTime());
  }

  async findCurrentForProfiles(userIds: string[]): Promise<ProfilePitchRow[]> {
    return (await this.findCurrentForUsers(userIds)).map((r) => ({
      ...r,
      profileSections: this.profileSections.get(r.userId) ?? null,
      role: this.roles.get(r.userId) ?? null,
    }));
  }

  async findProject(projectId: string): Promise<PitchProjectRow | null> {
    return this.projects.find((p) => p.id === projectId) ?? null;
  }

  async hasRecording(projectId: string): Promise<boolean> {
    return this.recordings.some((r) => r.projectId === projectId && r.videoUrl);
  }

  async setCurrent(userId: string, projectId: string): Promise<void> {
    if (this.failNextSetWithUniqueViolation) {
      this.failNextSetWithUniqueViolation = false;
      throw Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" });
    }
    for (const p of this.projects) {
      if (p.userId === userId && p.isCurrentPitch && p.id !== projectId) p.isCurrentPitch = false;
    }
    const target = this.projects.find((p) => p.id === projectId && p.userId === userId);
    if (target) target.isCurrentPitch = true;
    this.assertUnique();
  }

  async clearCurrent(userId: string): Promise<void> {
    for (const p of this.projects) if (p.userId === userId) p.isCurrentPitch = false;
  }
}

function pitchProject(id: string, userId: string, extra: Partial<PitchProjectRow> = {}): PitchProjectRow {
  return { id, userId, companyId: null, purpose: "pitch", isCurrentPitch: false, ...extra };
}

function seed(): FakePitchRepo {
  return new FakePitchRepo(
    [
      pitchProject(P_FIRST, ALICE),
      pitchProject(P_SECOND, ALICE),
      pitchProject(P_BOB, BOB, { isCurrentPitch: true }),
      pitchProject(P_RESUME_VIDEO, ALICE, { purpose: "resume" }),
      pitchProject(P_COMPANY, ALICE, { companyId: ACME }),
      pitchProject(P_EMPTY, ALICE),
    ],
    [
      { projectId: P_FIRST, videoUrl: cdn(ALICE, "1760000000000-recording-1760000000000.webm"), durationMs: 58_000, createdAt: new Date("2026-09-01T10:00:00Z") },
      { projectId: P_SECOND, videoUrl: cdn(ALICE, "1760100000000-recording-1760100000000.mp4"), durationMs: 61_500, createdAt: new Date("2026-09-20T09:30:00Z") },
      { projectId: P_BOB, videoUrl: cdn(BOB, "1759000000000-recording.webm"), durationMs: 30_000, createdAt: new Date("2026-08-15T12:00:00Z") },
      { projectId: P_RESUME_VIDEO, videoUrl: cdn(ALICE, "resume.webm"), durationMs: 90_000, createdAt: new Date("2026-09-02T10:00:00Z") },
      { projectId: P_COMPANY, videoUrl: cdn(ALICE, "company.webm"), durationMs: 45_000, createdAt: new Date("2026-09-03T10:00:00Z") },
    ],
  );
}

const currentIds = (repo: FakePitchRepo, userId: string) =>
  repo.projects.filter((p) => p.userId === userId && p.isCurrentPitch).map((p) => p.id);

describe("setCurrentPitch — one current pitch per user", () => {
  it("sets the first pitch", async () => {
    const repo = seed();
    const summary = await setCurrentPitch(ALICE, P_FIRST, repo);
    assert.deepEqual(currentIds(repo, ALICE), [P_FIRST]);
    assert.equal(summary.projectId, P_FIRST);
    assert.equal(summary.videoUrl, cdn(ALICE, "1760000000000-recording-1760000000000.webm"));
    assert.equal(summary.durationMs, 58_000);
    assert.equal(summary.recordedAt, "2026-09-01T10:00:00.000Z");
  });

  it("replacing the pitch leaves exactly one current, and never touches another user's", async () => {
    const repo = seed();
    await setCurrentPitch(ALICE, P_FIRST, repo);
    await setCurrentPitch(ALICE, P_SECOND, repo);
    assert.deepEqual(currentIds(repo, ALICE), [P_SECOND]);
    assert.deepEqual(currentIds(repo, BOB), [P_BOB]);
  });

  it("re-setting the same pitch is idempotent", async () => {
    const repo = seed();
    await setCurrentPitch(ALICE, P_SECOND, repo);
    await setCurrentPitch(ALICE, P_SECOND, repo);
    assert.deepEqual(currentIds(repo, ALICE), [P_SECOND]);
  });

  it("retries once when a concurrent set wins the unique index race", async () => {
    const repo = seed();
    repo.failNextSetWithUniqueViolation = true;
    const summary = await setCurrentPitch(ALICE, P_FIRST, repo);
    assert.equal(summary.projectId, P_FIRST);
    assert.deepEqual(currentIds(repo, ALICE), [P_FIRST]);
  });

  it("rejects another user's project (FORBIDDEN)", async () => {
    const repo = seed();
    await assert.rejects(setCurrentPitch(ALICE, P_BOB, repo), (e: unknown) => e instanceof PitchError && e.code === "FORBIDDEN");
    assert.deepEqual(currentIds(repo, BOB), [P_BOB]);
  });

  it("rejects a company-workspace project (FORBIDDEN)", async () => {
    await assert.rejects(setCurrentPitch(ALICE, P_COMPANY, seed()), (e: unknown) => e instanceof PitchError && e.code === "FORBIDDEN");
  });

  it("rejects a non-pitch purpose (NOT_A_PITCH)", async () => {
    await assert.rejects(setCurrentPitch(ALICE, P_RESUME_VIDEO, seed()), (e: unknown) => e instanceof PitchError && e.code === "NOT_A_PITCH");
  });

  it("rejects a pitch with no recorded take (NO_MEDIA)", async () => {
    await assert.rejects(setCurrentPitch(ALICE, P_EMPTY, seed()), (e: unknown) => e instanceof PitchError && e.code === "NO_MEDIA");
  });

  it("rejects an unknown project (NOT_FOUND)", async () => {
    await assert.rejects(
      setCurrentPitch(ALICE, "77777777-7777-4777-8777-777777777777", seed()),
      (e: unknown) => e instanceof PitchError && e.code === "NOT_FOUND",
    );
  });

  it("clearCurrentPitch removes the pitch from reads", async () => {
    const repo = seed();
    await setCurrentPitch(ALICE, P_SECOND, repo);
    await clearCurrentPitch(ALICE, repo);
    assert.equal(await getCurrentPitch(ALICE, repo), null);
    assert.deepEqual(currentIds(repo, BOB), [P_BOB]);
  });
});

describe("pitch reads (DTO shape)", () => {
  it("batch read resolves many users in ONE repository call", async () => {
    const repo = seed();
    await setCurrentPitch(ALICE, P_SECOND, repo);
    repo.findCurrentCalls = 0;
    const map = await getCurrentPitches([ALICE, BOB, "no-such-user"], repo);
    assert.equal(repo.findCurrentCalls, 1);
    assert.equal(map.get(ALICE)?.projectId, P_SECOND);
    assert.equal(map.get(BOB)?.projectId, P_BOB);
    assert.equal(map.has("no-such-user"), false);
  });

  it("empty id list short-circuits without a query", async () => {
    const repo = seed();
    assert.equal((await getCurrentPitches([], repo)).size, 0);
    assert.equal(repo.findCurrentCalls, 0);
  });

  it("toPitchSummaries keeps the newest take per user regardless of row order", () => {
    const rows: CurrentPitchRow[] = [
      { userId: ALICE, projectId: P_SECOND, videoUrl: cdn(ALICE, "take-1.webm"), durationMs: 59_000, recordedAt: "2026-09-20T09:30:00.000Z" },
      { userId: ALICE, projectId: P_SECOND, videoUrl: cdn(ALICE, "take-2.webm"), durationMs: 60_000, recordedAt: new Date("2026-09-21T08:00:00Z") },
      { userId: BOB, projectId: P_BOB, videoUrl: null, durationMs: null, recordedAt: "2026-09-25T00:00:00.000Z" },
      { userId: BOB, projectId: P_BOB, videoUrl: cdn(BOB, "only.webm"), durationMs: null, recordedAt: null },
    ];
    const map = toPitchSummaries(rows);
    assert.deepEqual(map.get(ALICE), {
      projectId: P_SECOND,
      videoUrl: cdn(ALICE, "take-2.webm"),
      durationMs: 60_000,
      recordedAt: "2026-09-21T08:00:00.000Z",
    });
    // A take without a URL never wins; a URL with no timestamp still shows.
    assert.deepEqual(map.get(BOB), { projectId: P_BOB, videoUrl: cdn(BOB, "only.webm"), durationMs: null, recordedAt: null });
  });
});

describe("pitchAllowedUnderRedaction", () => {
  it("default share redaction (name + avatar hidden) never embeds the pitch", () => {
    assert.equal(pitchAllowedUnderRedaction({ hideName: true, hideAvatar: true }), false);
    assert.equal(pitchAllowedUnderRedaction({ hideName: false, hideAvatar: true }), false);
    assert.equal(pitchAllowedUnderRedaction({ hideName: true, hideAvatar: false }), false);
  });
  it("an identity-visible share embeds it", () => {
    assert.equal(pitchAllowedUnderRedaction({ hideName: false, hideAvatar: false }), true);
  });
});

describe("getProfilePitch — /u/:handle + /people/:id visibility", () => {
  it("shows a job seeker's pitch by default (no stored overrides)", async () => {
    const repo = seed();
    await setCurrentPitch(ALICE, P_SECOND, repo);
    const pitch = await getProfilePitch({ id: ALICE, role: "job_seeker" }, repo);
    assert.equal(pitch?.projectId, P_SECOND);
  });

  it("hides it when the owner turned the videoResume section off", async () => {
    const repo = seed();
    await setCurrentPitch(ALICE, P_SECOND, repo);
    repo.profileSections.set(ALICE, { videoResume: false, skills: true });
    assert.equal(await getProfilePitch({ id: ALICE, role: "job_seeker" }, repo), null);
  });

  it("follows the role default, and an explicit opt-in overrides it", async () => {
    const repo = seed();
    // Recruiter defaults hide videoResume.
    assert.equal(await getProfilePitch({ id: BOB, role: "recruiter" }, repo), null);
    repo.profileSections.set(BOB, { videoResume: true });
    assert.equal((await getProfilePitch({ id: BOB, role: "recruiter" }, repo))?.projectId, P_BOB);
  });

  it("is null when the user has no current pitch", async () => {
    assert.equal(await getProfilePitch({ id: ALICE, role: "job_seeker" }, seed()), null);
  });
});

describe("getProfilePitch — owner always sees their own (#2391)", () => {
  it("returns the owner's pitch even with the videoResume section hidden", async () => {
    const repo = seed();
    await setCurrentPitch(ALICE, P_SECOND, repo);
    repo.profileSections.set(ALICE, { videoResume: false });
    assert.equal(await getProfilePitch({ id: ALICE, role: "job_seeker" }, repo, { isOwner: false }), null);
    assert.equal((await getProfilePitch({ id: ALICE, role: "job_seeker" }, repo, { isOwner: true }))?.projectId, P_SECOND);
  });
});

describe("getVisiblePitches — pipeline card, shared résumé, partner payload (#2391)", () => {
  it("keeps visible pitches and drops a hidden section, in one query for the page", async () => {
    const repo = seed();
    await setCurrentPitch(ALICE, P_SECOND, repo);
    repo.profileSections.set(BOB, { videoResume: true });
    repo.findCurrentCalls = 0;
    const visible = await getVisiblePitches([ALICE, BOB], repo);
    assert.equal(repo.findCurrentCalls, 1);
    assert.deepEqual([...visible.keys()].sort(), [ALICE, BOB].sort());

    repo.profileSections.set(ALICE, { videoResume: false, skills: true });
    const afterHide = await getVisiblePitches([ALICE, BOB], repo);
    assert.equal(afterHide.has(ALICE), false);
    assert.equal(afterHide.get(BOB)?.videoUrl, cdn(BOB, "1759000000000-recording.webm"));
  });

  it("applies each owner's role default when nothing is stored (recruiter → hidden)", async () => {
    const repo = seed();
    assert.equal(await getVisiblePitch(BOB, repo), null);
  });

  it("keeps the owner's own read unfiltered while third parties get null", async () => {
    const repo = seed();
    repo.profileSections.set(BOB, { videoResume: false });
    // The owner's own read (GET /video-pitch) still sees it.
    assert.equal((await getCurrentPitch(BOB, repo))?.projectId, P_BOB);
    assert.equal(await getVisiblePitch(BOB, repo), null);
  });

  it("is empty for no users or users without a pitch", async () => {
    const repo = seed();
    assert.equal((await getVisiblePitches([], repo)).size, 0);
    assert.equal((await getVisiblePitches([ALICE, "no-such-user"], repo)).size, 0);
  });
});
