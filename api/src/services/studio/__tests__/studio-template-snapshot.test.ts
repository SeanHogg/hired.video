/**
 * What a studio template stores (studioTemplateSnapshot.ts). A résumé
 * template is a document snapshot whose `entityKind` becomes the row's
 * `document_kind` = 'resume' (mig 0520) — no separate résumé-template table.
 * Fixtures mirror real project payloads (a résumé DocumentState with a
 * media-bound overlay; a v1 VideoScript with name/headline scenes).
 *
 * Run: node --import tsx --test src/services/studio/__tests__/studio-template-snapshot.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { templateSnapshotFor } from "../studioTemplateSnapshot.js";

const resumeDocument = {
  entityKind: "resume",
  entityId: "1f2e3d4c-5b6a-4789-8a9b-0c1d2e3f4a5b",
  templateId: "healthcare-clinical-blue",
  pageSize: "letter",
  orientation: "portrait",
  columns: 12,
  theme: { key: "clinical-blue" },
  pages: [
    {
      id: "page-1",
      blocks: [{ id: "b-work", kind: "section", key: "work", mode: "flow" }],
      overlays: [
        { id: "o-photo", kind: "image", src: "https://cdn.hired.video/u/dana.jpg", mediaBinding: { referenceId: "work-0" } },
      ],
    },
  ],
};

const videoScript = {
  resumeText: "Dana Okafor — RN",
  ownerName: "Dana Okafor",
  video: { duration: 31.6, theme: { motion: "moderate" }, audio: { language: "en" } },
  scenes: [
    { elements: [{ role: "name", text: "Dana Okafor" }, { role: "headline", text: "ICU nurse" }, { role: "body", text: "Keep me" }] },
  ],
};

describe("templateSnapshotFor — documents", () => {
  it("names a résumé document's kind, unbinds it and takes the strict strip (no headshot src)", () => {
    const snap = templateSnapshotFor("document", resumeDocument);
    assert.equal(snap.documentKind, "resume");
    assert.equal(snap.videoScript.entityId, null);
    assert.equal(snap.videoScript.templateId, "healthcare-clinical-blue");
    const overlay = (snap.videoScript.pages as Array<{ overlays: Array<Record<string, unknown>> }>)[0]!.overlays[0]!;
    assert.equal("mediaBinding" in overlay, false);
    assert.equal("src" in overlay, false);
    assert.deepEqual(overlay, { id: "o-photo", kind: "image" });
    assert.deepEqual([snap.durationSec, snap.motion, snap.language], [null, null, null]);
  });

  it("names a job document 'job' and keeps its free overlays (structural strip)", () => {
    const snap = templateSnapshotFor("document", { ...resumeDocument, entityKind: "job" });
    assert.equal(snap.documentKind, "job");
    const overlay = (snap.videoScript.pages as Array<{ overlays: Array<Record<string, unknown>> }>)[0]!.overlays[0]!;
    assert.equal("mediaBinding" in overlay, false);
    assert.equal(overlay.src, "https://cdn.hired.video/u/dana.jpg");
  });

  it("leaves the document kind unset for an unknown or missing entity kind", () => {
    assert.equal(templateSnapshotFor("document", { ...resumeDocument, entityKind: "invoice" }).documentKind, null);
    assert.equal(templateSnapshotFor("document", null).documentKind, null);
  });

  it("never mutates the source payload", () => {
    templateSnapshotFor("document", resumeDocument);
    assert.equal(resumeDocument.entityId, "1f2e3d4c-5b6a-4789-8a9b-0c1d2e3f4a5b");
    assert.ok("mediaBinding" in resumeDocument.pages[0]!.overlays[0]!);
  });
});

describe("templateSnapshotFor — video kinds", () => {
  it("strips user fields, tokenises name/headline and reads catalog metadata", () => {
    const snap = templateSnapshotFor("video", videoScript);
    assert.equal(snap.documentKind, null);
    assert.equal(snap.videoScript.resumeText, undefined);
    assert.equal(snap.videoScript.ownerName, undefined);
    const els = (snap.videoScript.scenes as Array<{ elements: Array<{ text: string }> }>)[0]!.elements;
    assert.deepEqual(els.map((e) => e.text), ["{{name}}", "{{headline}}", "Keep me"]);
    assert.deepEqual([snap.durationSec, snap.motion, snap.language], [32, "moderate", "en"]);
  });

  it("never records a document kind for a non-document project, even with a document-looking payload", () => {
    assert.equal(templateSnapshotFor("podcast", resumeDocument).documentKind, null);
  });
});
