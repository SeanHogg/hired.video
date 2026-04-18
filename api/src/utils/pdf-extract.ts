/**
 * Extract human-readable text from a PDF by decompressing FlateDecode streams
 * and parsing BT...ET text blocks. Works with Google Docs, Word-exported, and
 * most standard PDFs. Uses the Web Streams DecompressionStream API available
 * in Cloudflare Workers.
 *
 * Shared between the resume-upload and job-upload pipelines so both convert
 * PDF bytes into the same plain-text intermediate before downstream parsing.
 */
export async function extractPdfText(pdfBytes: Uint8Array): Promise<string> {
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
