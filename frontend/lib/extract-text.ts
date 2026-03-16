// Shared helper for extracting plain text from resume files in the browser.
// Supports: .pdf, .docx, .txt, .md

export async function extractTextFromPdf(file: File): Promise<string> {
  try {
    const pdfjs = await import("pdfjs-dist");
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      const worker = await import("pdfjs-dist/build/pdf.worker.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default as string;
    }

    const data = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data }).promise;
    const pages: string[] = [];

    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
    }

    return pages.join("\n").replace(/\s+/g, " ").trim();
  } catch (err) {
    // Fallback to returning raw text (may be garbage) so the UI at least shows something
    return file.text();
  }
}

export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return extractTextFromPdf(file);

  if (name.endsWith(".docx") || file.type.includes("wordprocessingml")) {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const xmlFile = zip.file("word/document.xml");
    if (xmlFile) {
      const xml = await xmlFile.async("text");
      return xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    }
  }

  return file.text();
}
