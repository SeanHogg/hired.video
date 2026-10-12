/** #733 — which uploaded_assets row an R2 write produces, from its key. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deriveAssetRecord } from "../asset-record.js";
import { PROJECT_ID, USER_ID } from "./fixtures.js";

describe("deriveAssetRecord", () => {
  it("derives the kind from the uploads/{userId}/<folder>/ convention", () => {
    const cases: Array<[string, string, string]> = [
      [`uploads/${USER_ID}/images/1d2c.png`, "image/png", "image"],
      [`uploads/${USER_ID}/ai-images/9f8e.png`, "image/png", "ai_image"],
      [`uploads/${USER_ID}/avatars/77aa.jpg`, "image/jpeg", "avatar"],
      [`uploads/${USER_ID}/videos/0b1c.webm`, "video/webm", "video"],
      [`uploads/${USER_ID}/scorm/${PROJECT_ID}/scormcontent/index.html`, "text/html", "scorm"],
      [`studio/recordings/${USER_ID}/1760000000000-recording.webm`, "video/webm", "recording"],
      [`studio/voice-clones/${USER_ID}/abc.webm`, "audio/webm", "voice"],
      [`interview/${USER_ID}/sess/q1-1760000000000.webm`, "video/webm", "recording"],
    ];
    for (const [key, type, kind] of cases) {
      const rec = deriveAssetRecord(key, type, 2048);
      assert.equal(rec?.kind, kind, key);
      assert.equal(rec?.userId, USER_ID, key);
    }
  });

  it("falls back to the MIME family for /single uploads (composed music, documents)", () => {
    assert.equal(deriveAssetRecord(`uploads/${USER_ID}/files/a.wav`, "audio/wav", 1)?.kind, "audio");
    assert.equal(deriveAssetRecord(`uploads/${USER_ID}/files/a.pdf`, "application/pdf", 1)?.kind, "file");
    assert.equal(deriveAssetRecord(`uploads/${USER_ID}/5f0e.jpeg`, "image/jpeg", 1)?.kind, "image");
    assert.equal(deriveAssetRecord(`nle-sources/${USER_ID}/sha256abc`, "video/mp4", 1)?.kind, "video");
  });

  it("takes the source project from a studio/{userId}/{projectId}/ key", () => {
    const rec = deriveAssetRecord(`studio/${USER_ID}/${PROJECT_ID}/1760000000000-video.webm`, "video/webm", 10);
    assert.equal(rec?.kind, "video");
    assert.equal(rec?.sourceProjectId, PROJECT_ID);
  });

  it("applies the caller's hint (AI kind, dimensions, project) and drops invalid sizes", () => {
    const rec = deriveAssetRecord(`uploads/${USER_ID}/images/x.png`, "image/png", 99.6, {
      kind: "ai_image",
      width: 1024,
      height: 0,
      sourceProjectId: PROJECT_ID,
    });
    assert.deepEqual(rec, {
      userId: USER_ID,
      r2Key: `uploads/${USER_ID}/images/x.png`,
      kind: "ai_image",
      contentType: "image/png",
      sizeBytes: 100,
      width: 1024,
      height: null,
      sourceProjectId: PROJECT_ID,
    });
  });

  it("records nothing for keys without a user owner", () => {
    for (const key of [
      "stock/unsplash/abc.jpg",
      "workforce/docs/company-1/doc-1/offer.pdf",
      `nle-proxies/${USER_ID}/source-hash.mp4`,
      "uploads/not-a-uuid/images/a.png",
    ]) {
      assert.equal(deriveAssetRecord(key, "image/png", 1), null, key);
    }
  });
});
