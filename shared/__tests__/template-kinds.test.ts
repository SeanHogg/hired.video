/**
 * templateKindLabelKey — the ONE label rule for "what kind of template is
 * this" (search / marketplace card chip, studio kind badge, kind-filtered
 * empty states). Also asserts every key it can return is translated in
 * en / es / fr-CA so no surface ever renders a raw key.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MEDIA_KINDS } from "../media-kinds.js";
import { DOCUMENT_ENTITY_KINDS } from "../document-entity-kinds.js";
import {
  DOCUMENT_KIND_LABEL_KEYS,
  GENERIC_TEMPLATE_KIND_LABEL_KEY,
  MEDIA_KIND_LABEL_KEYS,
  isMediaKind,
  mediaKindLabelKey,
  templateKindLabelKey,
} from "../template-kinds.js";

describe("templateKindLabelKey", () => {
  it("labels a résumé template by its document kind", () => {
    assert.equal(templateKindLabelKey("document", "resume"), "templateKind.document.resume");
  });

  it("labels every document kind distinctly", () => {
    for (const kind of DOCUMENT_ENTITY_KINDS) {
      assert.equal(templateKindLabelKey("document", kind), DOCUMENT_KIND_LABEL_KEYS[kind]);
    }
    assert.equal(new Set(Object.values(DOCUMENT_KIND_LABEL_KEYS)).size, DOCUMENT_ENTITY_KINDS.length);
  });

  it("falls back to the generic Document label when document_kind is null / unknown", () => {
    assert.equal(templateKindLabelKey("document", null), "templateKind.media.document");
    assert.equal(templateKindLabelKey("document", undefined), "templateKind.media.document");
    assert.equal(templateKindLabelKey("document", "spreadsheet"), "templateKind.media.document");
  });

  it("ignores document_kind on non-document media kinds", () => {
    assert.equal(templateKindLabelKey("video", "resume"), "templateKind.media.video");
  });

  it("labels every media kind by its media key", () => {
    for (const kind of MEDIA_KINDS) {
      assert.equal(templateKindLabelKey(kind, null), MEDIA_KIND_LABEL_KEYS[kind]);
      assert.equal(mediaKindLabelKey(kind), MEDIA_KIND_LABEL_KEYS[kind]);
    }
  });

  it("returns the generic Template label for a missing / unknown media kind", () => {
    assert.equal(templateKindLabelKey(undefined), GENERIC_TEMPLATE_KIND_LABEL_KEY);
    assert.equal(templateKindLabelKey(null, "resume"), GENERIC_TEMPLATE_KIND_LABEL_KEY);
    assert.equal(templateKindLabelKey("hologram"), GENERIC_TEMPLATE_KIND_LABEL_KEY);
    assert.equal(templateKindLabelKey(""), GENERIC_TEMPLATE_KIND_LABEL_KEY);
  });

  it("isMediaKind narrows only registered kinds", () => {
    assert.equal(isMediaKind("podcast"), true);
    assert.equal(isMediaKind("Podcast"), false);
    assert.equal(isMediaKind(42), false);
  });
});

describe("template kind labels are translated", () => {
  const allKeys = [
    ...Object.values(MEDIA_KIND_LABEL_KEYS),
    ...Object.values(DOCUMENT_KIND_LABEL_KEYS),
    GENERIC_TEMPLATE_KIND_LABEL_KEY,
  ];
  for (const locale of ["en", "es", "fr-CA"]) {
    it(`${locale}.json has a non-empty string for every key`, () => {
      const file = fileURLToPath(new URL(`../../frontend/public/locales/${locale}.json`, import.meta.url));
      const catalogue = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
      for (const key of allKeys) {
        const value = catalogue[key];
        assert.ok(typeof value === "string" && value.trim().length > 0, `${locale}: missing ${key}`);
      }
    });
  }
});
