/**
 * legacyScriptForPublic (#721): the public watch payload carries a stored V1
 * VideoScript only for rows that are one, with the save-draft meta stripped.
 * Fixtures mirror real `studio_projects.storyboard` rows: a V1 script saved
 * by save-draft (template JSON + `_name`/`_prompt`/`_jobDescription`/`_rev`
 * meta), and a V2 project whose storyboard holds only that meta.
 *
 * Run: node --import tsx --test src/services/studio/__tests__/public-video-state.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { legacyScriptForPublic } from "../public-video-state.js";

const v1StoredRow = {
  video: {
    duration: 28,
    fps: 30,
    resolution: "720p",
    aspect: "16:9",
    theme: {
      colorPalette: ["#7c3aed", "#2563eb", "#e2e8f0", "#c4b5fd"],
      fontFamily: "Inter, sans-serif",
      motion: "moderate",
      transition: "fade",
      background: "gradient",
    },
    audio: { track: "corporate-inspire", label: "Corporate Inspire", volume: 0.6 },
  },
  scenes: [
    { id: "intro", start: 0, duration: 7, type: "intro", title: "Dana Reyes", subtitle: "Senior Platform Engineer · Acme" },
    { id: "skills", start: 7, duration: 7, type: "skills", title: "Core Skills", skills: ["TypeScript", "AWS"] },
  ],
  _name: "Dana — platform video",
  _prompt: "Create a professional 28-second video resume",
  _jobDescription: "Staff Platform Engineer at Initech — confidential search",
  _purpose: "resume",
  _metaDescription: null,
  _slug: "dana-platform",
  _keywords: ["platform"],
  _rev: 7,
  _meta: { bakedHash: "abc123", savePipelineDisabled: ["render"] },
};

const v2MetaOnlyRow = {
  _name: "My V2 video",
  _prompt: "",
  _jobDescription: "",
  _purpose: "resume",
  _slug: null,
  _rev: 3,
};

describe("legacyScriptForPublic", () => {
  it("returns a stored V1 script with every save-draft meta key stripped", () => {
    const out = legacyScriptForPublic(v1StoredRow);
    assert.ok(out);
    assert.deepEqual(Object.keys(out).sort(), ["scenes", "video"]);
    assert.equal((out.scenes as unknown[]).length, 2);
    assert.deepEqual(out.video, v1StoredRow.video);
    assert.equal(JSON.stringify(out).includes("Initech"), false, "JD must not leak");
  });

  it("returns null for a V2 project whose storyboard holds only meta", () => {
    assert.equal(legacyScriptForPublic(v2MetaOnlyRow), null);
  });

  it("returns null for a script with zero scenes (boundary)", () => {
    assert.equal(legacyScriptForPublic({ ...v1StoredRow, scenes: [] }), null);
  });

  it("returns null for malformed / non-object storyboards", () => {
    assert.equal(legacyScriptForPublic(null), null);
    assert.equal(legacyScriptForPublic("not json"), null);
    assert.equal(legacyScriptForPublic([v1StoredRow]), null);
    assert.equal(legacyScriptForPublic({ video: [], scenes: v1StoredRow.scenes }), null);
    assert.equal(legacyScriptForPublic({ video: v1StoredRow.video, scenes: "nope" }), null);
  });
});
