/**
 * Legacy pitch backfill mapping (#1237) — the spec migration
 * 0519_pitch_studio_projects.sql implements. Fixtures mirror real
 * `users.video_pitch_url` values written by the retired
 * PUT /api/video-pitch/profile (z.string().url(), so anything URL-shaped):
 * our CDN recording keys, a mixed-case host, YouTube / Loom links, stray
 * whitespace, and the null / blank rows the migration must skip.
 *
 * Run: node --import tsx --test src/services/pitch/__tests__/pitch-backfill.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  LEGACY_PITCH_PROJECT_NAME,
  LEGACY_PITCH_RECORDING_SOURCE,
  cdnKeyFromUrl,
  mapLegacyPitch,
  type LegacyPitchUserRow,
} from "../pitch-backfill.js";

const UID = "5b0c7a9e-1f43-4c4e-9a51-2d7f3c1e8a10";
const NOW = new Date("2026-10-10T12:00:00Z");
const SET_AT = new Date("2026-06-02T17:45:12Z");
const UPDATED_AT = new Date("2026-07-01T08:00:00Z");

function row(videoPitchUrl: string | null, extra: Partial<LegacyPitchUserRow> = {}): LegacyPitchUserRow {
  return { userId: UID, videoPitchUrl, videoPitchSetAt: SET_AT, updatedAt: UPDATED_AT, hasCurrentPitch: false, ...extra };
}

describe("mapLegacyPitch — happy path", () => {
  it("maps a CDN recording URL to a pitch project + linked recording", () => {
    const url = `https://cdn.hired.video/studio/recordings/${UID}/1748886312000-recording-1748886311000.webm`;
    const out = mapLegacyPitch(row(url), NOW);
    assert.ok(out);
    assert.deepEqual(out.project, {
      userId: UID,
      resumeText: "",
      kind: "scene",
      mediaKind: "video",
      storyboard: { _name: LEGACY_PITCH_PROJECT_NAME, _purpose: "pitch", _rev: 1 },
      status: "draft",
      isCurrentPitch: true,
      createdAt: SET_AT,
      updatedAt: SET_AT,
    });
    assert.deepEqual(out.recording, {
      userId: UID,
      type: "webcam",
      videoUrl: url,
      videoKey: `studio/recordings/${UID}/1748886312000-recording-1748886311000.webm`,
      durationMs: null,
      metadata: { source: LEGACY_PITCH_RECORDING_SOURCE },
      createdAt: SET_AT,
    });
  });

  it("keeps a third-party URL playable but with no R2 key", () => {
    const out = mapLegacyPitch(row("https://www.loom.com/share/0f3c2b1a9d8e4f7a"), NOW);
    assert.equal(out?.recording.videoUrl, "https://www.loom.com/share/0f3c2b1a9d8e4f7a");
    assert.equal(out?.recording.videoKey, null);
  });

  it("trims whitespace around a pasted URL", () => {
    const out = mapLegacyPitch(row("  https://youtu.be/dQw4w9WgXcQ \n"), NOW);
    assert.equal(out?.recording.videoUrl, "https://youtu.be/dQw4w9WgXcQ");
  });
});

describe("mapLegacyPitch — boundaries", () => {
  it("falls back to updated_at, then now, when video_pitch_set_at is null", () => {
    const url = `https://cdn.hired.video/studio/recordings/${UID}/a.webm`;
    assert.equal(mapLegacyPitch(row(url, { videoPitchSetAt: null }), NOW)?.project.createdAt, UPDATED_AT);
    assert.equal(mapLegacyPitch(row(url, { videoPitchSetAt: null, updatedAt: null }), NOW)?.project.createdAt, NOW);
  });

  it("matches the CDN host case-insensitively and collapses extra slashes", () => {
    assert.equal(cdnKeyFromUrl("HTTPS://CDN.Hired.Video//studio/x.webm"), "studio/x.webm");
    assert.equal(cdnKeyFromUrl("http://cdn.hired.video/studio/x.webm"), "studio/x.webm");
  });

  it("honours a non-default CDN base", () => {
    assert.equal(cdnKeyFromUrl("https://media.example.com/studio/x.webm", "https://media.example.com/"), "studio/x.webm");
    assert.equal(cdnKeyFromUrl("https://cdn.hired.video/studio/x.webm", "https://media.example.com"), null);
  });

  it("a bare CDN origin has no key", () => {
    assert.equal(cdnKeyFromUrl("https://cdn.hired.video/"), null);
  });

  it("does not treat a look-alike host as our CDN", () => {
    assert.equal(cdnKeyFromUrl("https://cdn.hired.video.evil.example/studio/x.webm"), null);
    assert.equal(cdnKeyFromUrl("https://cdnxhiredxvideo/studio/x.webm"), null);
  });
});

describe("mapLegacyPitch — skipped rows", () => {
  it("skips null, empty and whitespace-only URLs", () => {
    assert.equal(mapLegacyPitch(row(null), NOW), null);
    assert.equal(mapLegacyPitch(row(""), NOW), null);
    assert.equal(mapLegacyPitch(row("   "), NOW), null);
  });

  it("skips a user who already has a current pitch (idempotent re-run)", () => {
    const url = `https://cdn.hired.video/studio/recordings/${UID}/a.webm`;
    assert.equal(mapLegacyPitch(row(url, { hasCurrentPitch: true }), NOW), null);
  });
});
