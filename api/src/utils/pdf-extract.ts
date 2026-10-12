/**
 * PDF bytes → plain text. THE single PDF extractor for every upload pipeline
 * (resume parse / create-from-file, partner SDK file upload, job upload).
 *
 *   1. `unpdf` (serverless pdf.js build, Workers-safe) — handles Type0/CID
 *      fonts with ToUnicode maps, hex strings, object streams: everything a
 *      Word / Google Docs / "Save as PDF" resume produces.
 *   2. Legacy FlateDecode + BT…ET scan — last-resort fallback when pdf.js
 *      rejects a malformed file it can still partly read.
 *
 * Returns "" when neither yields text (scanned image PDF); callers turn that
 * into an actionable error.
 */
export async function extractPdfText(pdfBytes: Uint8Array): Promise<string> {
  const viaPdfJs = await extractWithPdfJs(pdfBytes);
  if (viaPdfJs.trim()) return viaPdfJs;
  return extractWithStreamScan(pdfBytes);
}

async function extractWithPdfJs(pdfBytes: Uint8Array): Promise<string> {
  try {
    // Lazy-import so the pdf.js bundle only loads when a PDF is uploaded.
    const { extractText, getDocumentProxy } = await import("unpdf");
    // pdf.js may transfer/detach the buffer it is given — hand it a copy so
    // the stream-scan fallback can still read the original bytes.
    const pdf = await getDocumentProxy(pdfBytes.slice());
    const { text } = await extractText(pdf, { mergePages: true });
    return (Array.isArray(text) ? (text as string[]).join("\n") : text).trim();
  } catch (err) {
    console.warn("[pdf-extract] pdf.js failed:", err instanceof Error ? err.message : err);
    return "";
  }
}

/** Decompress FlateDecode streams and pull `(…) Tj` / `[…] TJ` literals. Only
 *  reads simple-font literal strings — kept as a fallback, not the primary. */
async function extractWithStreamScan(pdfBytes: Uint8Array): Promise<string> {
  const pdfStr = new TextDecoder("latin1").decode(pdfBytes);
  const texts: string[] = [];

  const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m: RegExpExecArray | null;

  while ((m = streamRe.exec(pdfStr)) !== null) {
    const before = pdfStr.slice(Math.max(0, m.index - 300), m.index);
    const isFlateDecode = /\/FlateDecode/.test(before);
    let content = m[1];

    if (isFlateDecode) {
      try {
        const streamBytes = new Uint8Array(content.length);
        for (let i = 0; i < content.length; i++) streamBytes[i] = content.charCodeAt(i) & 0xff;

        const ds = new DecompressionStream("deflate");
        const writer = ds.writable.getWriter();
        const reader = ds.readable.getReader();
        writer.write(streamBytes);
        writer.close();

        const chunks: Uint8Array[] = [];
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
        const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
        let off = 0;
        for (const c of chunks) { out.set(c, off); off += c.length; }
        content = new TextDecoder("latin1").decode(out);
      } catch {
        continue;
      }
    }

    const btRe = /BT([\s\S]*?)ET/g;
    let bt: RegExpExecArray | null;
    while ((bt = btRe.exec(content)) !== null) {
      const ops = bt[1].match(/\((?:[^\\)]|\\.)*\)\s*Tj|\[(?:[^\]])*\]\s*TJ/g) ?? [];
      for (const op of ops) {
        const parens = op.match(/\((?:[^\\)]|\\.)*\)/g) ?? [];
        for (const p of parens) {
          const text = p.slice(1, -1)
            .replace(/\\n/g, "\n").replace(/\\r/g, "").replace(/\\t/g, " ")
            .replace(/\\\(/g, "(").replace(/\\\)/g, ")").replace(/\\\\/g, "\\");
          if (text.trim()) texts.push(text.trim());
        }
      }
    }
  }

  return texts.join(" ").replace(/\s{2,}/g, " ").trim();
}
