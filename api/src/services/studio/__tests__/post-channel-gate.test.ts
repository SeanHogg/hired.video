/**
 * Post-channel cap — the pure rules behind the Post dock's channel limit
 * (shared/pricing `postChannelLimit`) and the server gate's ledger check
 * (`exceedsPostChannelLimit`). Destination ids mirror real publication rows
 * ("profile", "youtube", "linkedin").
 *
 * Run: node --import tsx --test src/services/studio/__tests__/post-channel-gate.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { exceedsPostChannelLimit } from "../post-channel-gate.js";
import {
  FREE_POST_CHANNEL_LIMIT,
  GUEST_POST_CHANNEL_LIMIT,
  postChannelLimit,
} from "../../../../../shared/pricing.js";

describe("postChannelLimit", () => {
  it("gives a guest one destination", () => {
    assert.equal(postChannelLimit({ isPro: false, hasAccount: false }), GUEST_POST_CHANNEL_LIMIT);
    assert.equal(GUEST_POST_CHANNEL_LIMIT, 1);
  });

  it("gives a free account two destinations", () => {
    assert.equal(postChannelLimit({ isPro: false, hasAccount: true }), FREE_POST_CHANNEL_LIMIT);
    assert.equal(FREE_POST_CHANNEL_LIMIT, 2);
  });

  it("is unlimited on Pro, account or not", () => {
    assert.equal(postChannelLimit({ isPro: true, hasAccount: true }), Number.POSITIVE_INFINITY);
    assert.equal(postChannelLimit({ isPro: true, hasAccount: false }), Number.POSITIVE_INFINITY);
  });
});

describe("exceedsPostChannelLimit", () => {
  it("allows the first destination", () => {
    assert.equal(exceedsPostChannelLimit([], "linkedin", 1), false);
  });

  it("allows up to the limit, then blocks a new destination", () => {
    assert.equal(exceedsPostChannelLimit(["profile"], "linkedin", 2), false);
    assert.equal(exceedsPostChannelLimit(["profile", "linkedin"], "youtube", 2), true);
  });

  it("never counts a re-post to a destination the video is already on", () => {
    assert.equal(exceedsPostChannelLimit(["profile", "linkedin"], "linkedin", 2), false);
    assert.equal(exceedsPostChannelLimit(["profile"], "profile", 1), false);
  });

  it("blocks a guest's second destination", () => {
    assert.equal(exceedsPostChannelLimit(["profile"], "youtube", 1), true);
  });

  it("ignores duplicate ledger entries", () => {
    assert.equal(exceedsPostChannelLimit(["youtube", "youtube"], "linkedin", 2), false);
  });

  it("never blocks on an infinite (Pro) limit", () => {
    assert.equal(
      exceedsPostChannelLimit(["profile", "linkedin", "youtube"], "x-post", Number.POSITIVE_INFINITY),
      false,
    );
  });
});
