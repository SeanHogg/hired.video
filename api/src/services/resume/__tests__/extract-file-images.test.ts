/**
 * extractPdfEmbeddedImages — scanned-PDF page unpack for OCR (#2308).
 *
 * Workers has no canvas, so /createfromfile and the partner resume write
 * pull DCTDecode JPEGs and FlateDecode RGB/gray rasters out of the PDF
 * and hand them to vision. Logos/thumbnails and unsupported filters
 * (CCITT) stay empty so the 422 path still owns them.
 *
 * Run: node --import tsx --test src/services/resume/__tests__/extract-file-images.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { zlibSync } from "fflate";
import {
  extractPdfEmbeddedImages,
  pdfEmbeddedImagesToFiles,
} from "../extractFile.js";
import { extractUploadedResumeFiles } from "../uploadIntake.js";

function latin1(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const n = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(n);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function pdfWithImage(dict: string, data: Uint8Array): Uint8Array {
  const header = latin1(`%PDF-1.4\n1 0 obj\n${dict}\nstream\n`);
  const tail = latin1(`\nendstream\nendobj\n`);
  return concat(header, data, tail);
}

function fakeJpeg(bytes: number): Uint8Array {
  const jpeg = new Uint8Array(bytes);
  jpeg[0] = 0xff;
  jpeg[1] = 0xd8;
  jpeg.fill(0x41, 2, bytes - 2);
  jpeg[bytes - 2] = 0xff;
  jpeg[bytes - 1] = 0xd9;
  return jpeg;
}

function dctDict(width: number, height: number, length: number): string {
  return `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${length} >>`;
}

describe("extractPdfEmbeddedImages — DCTDecode JPEG", () => {
  it("unpacks a page-sized JPEG XObject", () => {
    const jpeg = fakeJpeg(4100);
    const pdf = pdfWithImage(dctDict(640, 480, jpeg.length), jpeg);
    const images = extractPdfEmbeddedImages(pdf);
    assert.equal(images.length, 1);
    assert.equal(images[0].mime, "image/jpeg");
    assert.equal(images[0].bytes[0], 0xff);
    assert.equal(images[0].bytes[1], 0xd8);
    assert.equal(images[0].bytes[images[0].bytes.length - 1], 0xd9);
    assert.ok(images[0].bytes.length >= 4100);
  });

  it("skips tiny JPEG blobs (thumbnails)", () => {
    const jpeg = fakeJpeg(100);
    const pdf = pdfWithImage(dctDict(640, 480, jpeg.length), jpeg);
    assert.deepEqual(extractPdfEmbeddedImages(pdf), []);
  });

  it("skips images whose longest edge is under 400px (logos)", () => {
    const jpeg = fakeJpeg(4100);
    const pdf = pdfWithImage(dctDict(64, 64, jpeg.length), jpeg);
    assert.deepEqual(extractPdfEmbeddedImages(pdf), []);
  });

  it("skips non-image FlateDecode content streams", () => {
    const payload = zlibSync(latin1("BT (hello) Tj ET"));
    const dict = `<< /Length ${payload.length} /Filter /FlateDecode >>`;
    assert.deepEqual(extractPdfEmbeddedImages(pdfWithImage(dict, payload)), []);
  });
});

describe("extractPdfEmbeddedImages — FlateDecode raster", () => {
  it("inflates an RGB page raster and wraps it as PNG", () => {
    const width = 400;
    const height = 400;
    const pixels = new Uint8Array(width * height * 3);
    pixels.fill(0x7f);
    const compressed = zlibSync(pixels);
    const dict = `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${compressed.length} >>`;
    const images = extractPdfEmbeddedImages(pdfWithImage(dict, compressed));
    assert.equal(images.length, 1);
    assert.equal(images[0].mime, "image/png");
    assert.equal(images[0].bytes[0], 0x89);
    assert.equal(images[0].bytes[1], 0x50);
    assert.equal(images[0].bytes[2], 0x4e);
    assert.equal(images[0].bytes[3], 0x47);
    const files = pdfEmbeddedImagesToFiles(images, "scan.pdf");
    assert.equal(files[0].name, "scan-p1.png");
    assert.equal(files[0].type, "image/png");
  });

  it("names JPEG pages <stem>-p1.jpg", () => {
    const jpeg = fakeJpeg(4100);
    const images = extractPdfEmbeddedImages(pdfWithImage(dctDict(800, 600, jpeg.length), jpeg));
    const files = pdfEmbeddedImagesToFiles(images, "Resume.PDF");
    assert.equal(files[0].name, "Resume-p1.jpg");
    assert.equal(files[0].type, "image/jpeg");
  });

  it("feeds unpacked JPEG pages to OCR via extractUploadedResumeFiles", async () => {
    const jpeg = fakeJpeg(4100);
    const pdf = pdfWithImage(dctDict(800, 600, jpeg.length), jpeg);
    const file = new File([pdf], "scan.pdf", { type: "application/pdf" });
    const result = await extractUploadedResumeFiles([file], {
      ocrImage: async () => "Jane Doe\nSoftware Engineer\nBuilt hiring products at Hired.",
    });
    assert.equal(result.kind, "text");
    if (result.kind === "text") {
      assert.match(result.text, /Jane Doe/);
    }
  });

  it("skips CMYK rasters (cannot encode as PNG)", () => {
    const width = 400;
    const height = 400;
    const pixels = new Uint8Array(width * height * 4);
    const compressed = zlibSync(pixels);
    const dict = `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceCMYK /BitsPerComponent 8 /Filter /FlateDecode /Length ${compressed.length} >>`;
    assert.deepEqual(extractPdfEmbeddedImages(pdfWithImage(dict, compressed)), []);
  });
});
