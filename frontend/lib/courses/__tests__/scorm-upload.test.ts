/**
 * Pure-function tests for scorm-upload.ts.
 *
 * Covers the three units that don't need DOM / network / R2:
 *   - classifyVersion: SCORM schemaversion string → enum
 *   - parseManifest: imsmanifest.xml → { version, entryHref }
 *   - contentTypeFor: filename → MIME (drives R2 Content-Type on upload)
 *
 * The end-to-end pipeline (JSZip extract + per-file POST) is exercised
 * manually in the editor; the network half doesn't unit-test without
 * mocking the entire fetch + JSZip surface.
 */

import { describe, it, expect } from "vitest";
import { classifyVersion, parseManifest, contentTypeFor } from "../scorm-upload";

// vitest is configured with the jsdom environment (frontend/vitest.config.ts),
// so DOMParser is available globally — parseManifest's DOMParser call works
// without any polyfill.

describe("classifyVersion", () => {
  it("recognises plain SCORM 1.2", () => {
    expect(classifyVersion("1.2")).toBe("1.2");
  });

  it("recognises CAM 1.2 (legacy spelling)", () => {
    expect(classifyVersion("CAM 1.2")).toBe("1.2");
  });

  it("recognises SCORM 2004 1st edition (CAM 1.3)", () => {
    expect(classifyVersion("CAM 1.3")).toBe("2004_1");
  });

  it("recognises 2004 2nd / 3rd / 4th editions", () => {
    expect(classifyVersion("2004 2nd Edition")).toBe("2004_2");
    expect(classifyVersion("2004 3rd Edition")).toBe("2004_3");
    expect(classifyVersion("2004 4th Edition")).toBe("2004_4");
  });

  it("is case-insensitive", () => {
    expect(classifyVersion("2004 4TH EDITION")).toBe("2004_4");
    expect(classifyVersion("Cam 1.2")).toBe("1.2");
  });

  it("falls back to 1.2 for unrecognised strings (most permissive runtime)", () => {
    expect(classifyVersion("")).toBe("1.2");
    expect(classifyVersion("some-future-version")).toBe("1.2");
  });
});

describe("contentTypeFor", () => {
  it("returns text/html for .html and .htm", () => {
    expect(contentTypeFor("index.html")).toBe("text/html");
    expect(contentTypeFor("default.htm")).toBe("text/html");
  });

  it("returns application/javascript for .js (SCORM SCOs typically use script)", () => {
    expect(contentTypeFor("loader.js")).toBe("application/javascript");
  });

  it("returns text/css for stylesheets", () => {
    expect(contentTypeFor("style.css")).toBe("text/css");
  });

  it("handles common image MIME types correctly", () => {
    expect(contentTypeFor("logo.png")).toBe("image/png");
    expect(contentTypeFor("photo.jpg")).toBe("image/jpeg");
    expect(contentTypeFor("icon.svg")).toBe("image/svg+xml");
  });

  it("falls back to application/octet-stream for unknown extensions", () => {
    expect(contentTypeFor("data.bin")).toBe("application/octet-stream");
    expect(contentTypeFor("noext")).toBe("application/octet-stream");
  });

  it("is case-insensitive on extension", () => {
    expect(contentTypeFor("PHOTO.JPG")).toBe("image/jpeg");
    expect(contentTypeFor("Index.HTML")).toBe("text/html");
  });
});

describe("parseManifest", () => {
  it("extracts SCORM 1.2 version + entry href from a minimal manifest", () => {
    const xml = `<?xml version="1.0"?>
      <manifest>
        <metadata>
          <schema>ADL SCORM</schema>
          <schemaversion>1.2</schemaversion>
        </metadata>
        <organizations default="default">
          <organization identifier="default">
            <item identifier="i1" identifierref="r1"><title>L1</title></item>
          </organization>
        </organizations>
        <resources>
          <resource identifier="r1" type="webcontent" href="index.html"/>
        </resources>
      </manifest>`;
    const { version, entryHref } = parseManifest(xml);
    expect(version).toBe("1.2");
    expect(entryHref).toBe("index.html");
  });

  it("extracts SCORM 2004 4th edition correctly", () => {
    const xml = `<?xml version="1.0"?>
      <manifest>
        <metadata>
          <schema>ADL SCORM</schema>
          <schemaversion>2004 4th Edition</schemaversion>
        </metadata>
        <resources>
          <resource identifier="r1" type="webcontent" href="scormcontent/index.html"/>
        </resources>
      </manifest>`;
    const { version, entryHref } = parseManifest(xml);
    expect(version).toBe("2004_4");
    expect(entryHref).toBe("scormcontent/index.html");
  });

  it("picks the FIRST resource with an href when multiple exist", () => {
    // Mirrors the convention every major authoring tool (Articulate,
    // iSpring, Captivate) follows.
    const xml = `<?xml version="1.0"?>
      <manifest>
        <metadata><schemaversion>1.2</schemaversion></metadata>
        <resources>
          <resource identifier="data" type="webcontent"/>
          <resource identifier="entry" type="webcontent" href="launch.html"/>
          <resource identifier="aux" type="webcontent" href="aux.html"/>
        </resources>
      </manifest>`;
    const { entryHref } = parseManifest(xml);
    expect(entryHref).toBe("launch.html");
  });

  it("returns entryHref=null when no resource has href", () => {
    const xml = `<?xml version="1.0"?>
      <manifest>
        <metadata><schemaversion>1.2</schemaversion></metadata>
        <resources>
          <resource identifier="r1" type="webcontent"/>
        </resources>
      </manifest>`;
    const { entryHref } = parseManifest(xml);
    expect(entryHref).toBeNull();
  });

  it("throws when the XML is malformed", () => {
    // browser DOMParser returns a doc with <parsererror> rather than
    // throwing; parseManifest re-throws so the caller can show a UX msg.
    const xml = `<manifest><unclosed`;
    expect(() => parseManifest(xml)).toThrow();
  });

  it("defaults to SCORM 1.2 when schemaversion is missing", () => {
    const xml = `<?xml version="1.0"?>
      <manifest>
        <resources>
          <resource identifier="r1" type="webcontent" href="index.html"/>
        </resources>
      </manifest>`;
    const { version } = parseManifest(xml);
    expect(version).toBe("1.2");
  });
});
