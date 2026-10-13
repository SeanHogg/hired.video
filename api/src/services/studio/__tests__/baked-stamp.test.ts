/**
 * carryBakedStamp — a save that rebuilds the timeline keeps the hosted
 * render's stamp, so an unchanged video is not re-rendered on the next post.
 *
 * Run: node --import tsx --test src/services/studio/__tests__/baked-stamp.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { carryBakedStamp } from "../baked-stamp.js";

// Shaped like a kit timeline (canvasStateToTimeline) for project 28172982-….
const timeline = { version: 2, aspect: "16:9", tracks: [{ id: "video", clips: [{ id: "hook", start: 0, duration: 5 }] }] };
const stamped = { ...timeline, _meta: { bakedHash: "1-k3v9qz-6c" } };

describe("carryBakedStamp", () => {
  it("keeps the prior render stamp on a save that sends none", () => {
    assert.deepEqual(carryBakedStamp(stamped, timeline), stamped);
  });

  it("keeps other incoming _meta keys alongside the carried stamp", () => {
    const next = carryBakedStamp(stamped, { ...timeline, _meta: { savePipelineDisabled: true } }) as typeof stamped;
    assert.deepEqual(next._meta, { savePipelineDisabled: true, bakedHash: "1-k3v9qz-6c" });
  });

  it("never overrides the stamp a fresh render writes", () => {
    const fresh = { ...timeline, _meta: { bakedHash: "1-newhash-6c" } };
    assert.equal(carryBakedStamp(stamped, fresh), fresh);
  });

  it("leaves the save untouched when nothing was ever rendered (boundary)", () => {
    assert.equal(carryBakedStamp(timeline, timeline), timeline);
    assert.equal(carryBakedStamp(null, timeline), timeline);
  });

  it("passes non-object specs through (exception path)", () => {
    assert.equal(carryBakedStamp(stamped, null), null);
    assert.equal(carryBakedStamp(stamped, undefined), undefined);
  });
});
