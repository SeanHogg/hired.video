import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractPdfText } from "../pdf-extract.js";
import { extractResumeText } from "../../services/resume/extractFile.js";

/** Build a minimal, valid one-page PDF whose content stream is `content`
 *  (uncompressed), with correct xref offsets. */
function buildPdf(content: string): Uint8Array {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefAt = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

const hex = (s: string) => Buffer.from(s, "latin1").toString("hex").toUpperCase();

describe("extractPdfText", () => {
  it("reads hex-string text (Word / 'Save as PDF' exports) — the old regex scan returned ''", async () => {
    const pdf = buildPdf(`BT /F1 12 Tf 72 720 Td <${hex("Jane Doe Senior Engineer")}> Tj ET`);
    const text = await extractPdfText(pdf);
    assert.match(text, /Jane Doe Senior Engineer/);
  });

  it("reads literal-string text", async () => {
    const pdf = buildPdf("BT /F1 12 Tf 72 720 Td (Experience at Acme Corp) Tj ET");
    assert.match(await extractPdfText(pdf), /Experience at Acme Corp/);
  });

  it("returns '' for a PDF with no text layer (scanned image)", async () => {
    const pdf = buildPdf("0 0 m 100 100 l S");
    assert.equal(await extractPdfText(pdf), "");
  });
});

describe("extractResumeText", () => {
  it("routes PDFs through the shared PDF extractor", async () => {
    const pdf = buildPdf(`BT /F1 12 Tf 72 720 Td <${hex("Work History")}> Tj ET`);
    const result = await extractResumeText(pdf, { filename: "resume.pdf", contentType: "application/pdf" });
    assert.equal(result.ok, true);
    assert.match(result.ok ? result.text : "", /Work History/);
  });

  it("flags a text-less PDF as INVALID_RESUME", async () => {
    const result = await extractResumeText(buildPdf("0 0 m 100 100 l S"), { filename: "scan.pdf" });
    assert.equal(result.ok, false);
    assert.equal(result.ok ? null : result.code, "INVALID_RESUME");
  });

  it("decodes plain text uploads", async () => {
    const bytes = new TextEncoder().encode("Jane Doe\nSenior Engineer at Acme, 2019 - Present");
    const result = await extractResumeText(bytes, { filename: "resume.txt", contentType: "text/plain" });
    assert.equal(result.ok, true);
  });
});
