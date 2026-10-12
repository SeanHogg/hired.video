/**
 * Manual-upload fallback (#2048): a pasted post link is accepted only for
 * its own network (https, that network's site), and the post id is kept
 * exactly where that network's stats API can read it — so the post gets
 * metrics like any other; Instagram (shortcode links), Webtoon and Tapas
 * are recorded without one.
 *
 * Run: node --import tsx --test shared/__tests__/manual-upload.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isManualUploadDestination,
  manualPostTracksMetrics,
  manualUploadUrl,
  parseManualPostUrl,
} from "../manual-upload.js";

describe("parseManualPostUrl — ids the stats readers take", () => {
  it("YouTube: watch, youtu.be and Shorts links", () => {
    assert.equal(parseManualPostUrl("youtube", "https://www.youtube.com/watch?v=Ks-_Mh1QhMc&t=3s")?.externalId, "Ks-_Mh1QhMc");
    assert.equal(parseManualPostUrl("youtube", "https://youtu.be/Ks-_Mh1QhMc")?.externalId, "Ks-_Mh1QhMc");
    assert.equal(parseManualPostUrl("youtube", "https://www.youtube.com/shorts/Ks-_Mh1QhMc")?.externalId, "Ks-_Mh1QhMc");
  });

  it("TikTok, X, Facebook and LinkedIn post links", () => {
    assert.equal(parseManualPostUrl("tiktok", "https://www.tiktok.com/@mayachen/video/7429184417062718726")?.externalId, "7429184417062718726");
    assert.equal(parseManualPostUrl("x", "https://x.com/mayachen/status/1844417062718726000")?.externalId, "1844417062718726000");
    assert.equal(parseManualPostUrl("x", "https://twitter.com/mayachen/status/1844417062718726000")?.externalId, "1844417062718726000");
    assert.equal(parseManualPostUrl("facebook", "https://www.facebook.com/MayaChenDesign/videos/1092837465012345/")?.externalId, "1092837465012345");
    assert.equal(
      parseManualPostUrl("linkedin", "https://www.linkedin.com/feed/update/urn:li:share:7247000000000000000/")?.externalId,
      "urn:li:share:7247000000000000000",
    );
  });

  it("records without an id where stats can't be read from the link", () => {
    assert.deepEqual(parseManualPostUrl("instagram", "https://www.instagram.com/reel/C9xYz12AbCd/"), {
      externalUrl: "https://www.instagram.com/reel/C9xYz12AbCd/",
      externalId: null,
    });
    assert.equal(parseManualPostUrl("webtoon-feed", "https://www.webtoons.com/en/canvas/hired-life/episode-1/viewer?title_no=901234&episode_no=1")?.externalId, null);
    assert.equal(parseManualPostUrl("tapas-feed", "https://tapas.io/episode/3141592")?.externalId, null);
    assert.equal(manualPostTracksMetrics("instagram"), false);
    assert.equal(manualPostTracksMetrics("tapas-feed"), false);
    assert.equal(manualPostTracksMetrics("tiktok"), true);
  });
});

describe("parseManualPostUrl — refusals", () => {
  it("refuses another network's link, plain http, and garbage", () => {
    assert.equal(parseManualPostUrl("tiktok", "https://x.com/mayachen/status/1844417062718726000"), null);
    assert.equal(parseManualPostUrl("youtube", "http://www.youtube.com/watch?v=Ks-_Mh1QhMc"), null);
    assert.equal(parseManualPostUrl("x", "not a link"), null);
    assert.equal(parseManualPostUrl("youtube", "https://youtube.com.evil.example/watch?v=Ks-_Mh1QhMc"), null);
  });

  it("knows which destinations are manual and where to upload", () => {
    assert.equal(isManualUploadDestination("webtoon-feed"), true);
    assert.equal(isManualUploadDestination("profile"), false);
    assert.match(manualUploadUrl("tapas-feed"), /^https:\/\/tapas\.io\//);
  });
});
