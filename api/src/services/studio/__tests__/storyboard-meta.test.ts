import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { storyboardScriptKeys } from "../storyboard-meta.js";

// Shaped like a stored V1 row: VideoScript keys plus save-draft meta.
const STORED_V1 = {
  video: { title: "Ana Ruiz — Director of IT", aspectRatio: "16:9", audio: { clips: [{ url: "https://cdn.hired.video/music/a.mp3" }] } },
  scenes: [{ id: "s1", duration: 4, elements: [{ type: "text", text: "Hi, I'm Ana" }] }],
  _name: "Ana — IT pitch",
  _prompt: "make it punchy",
  _jobDescription: "Director of IT at Northwind Health…",
  _rev: 7,
  _slug: "ana-it-pitch",
};

describe("storyboardScriptKeys", () => {
  it("keeps the script keys and drops every save-draft meta key", () => {
    assert.deepEqual(storyboardScriptKeys(STORED_V1), { video: STORED_V1.video, scenes: STORED_V1.scenes });
  });

  it("returns {} for a V2 meta-only storyboard (boundary): a meta-only save stays meta-only", () => {
    assert.deepEqual(storyboardScriptKeys({ _name: "x", _rev: 2 }), {});
  });

  it("returns {} for null, arrays and primitives", () => {
    for (const bad of [null, undefined, "x", 3, [1, 2]]) assert.deepEqual(storyboardScriptKeys(bad), {});
  });
});
