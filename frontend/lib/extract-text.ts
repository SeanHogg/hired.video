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
    // Fallback: return raw bytes as text so the UI shows something instead of remaining blank.
    const bytes = await file.arrayBuffer();
    return new TextDecoder().decode(bytes).slice(0, 3000);
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

  // JSON resume uploads — convert to readable prose so LLMs/regex score correctly
  if (name.endsWith(".json")) {
    const raw = await file.text();
    try {
      const parsed = JSON.parse(raw);
      return jsonResumeToText(parsed);
    } catch {
      return raw;
    }
  }

  // Markdown / plain text — strip markdown syntax to plain text
  if (name.endsWith(".md") || name.endsWith(".markdown") || file.type === "text/markdown") {
    const raw = await file.text();
    return stripMarkdown(raw);
  }

  return file.text();
}

/** Convert a JSON Resume (jsonresume.org) or similar object to readable plain text. */
function jsonResumeToText(obj: unknown): string {
  if (typeof obj !== "object" || !obj) return String(obj);
  const r = obj as Record<string, unknown>;
  const lines: string[] = [];

  // Basics / contact
  const basics = r["basics"] as Record<string, unknown> | undefined;
  if (basics) {
    if (basics["name"]) lines.push(String(basics["name"]));
    if (basics["label"]) lines.push(String(basics["label"]));
    if (basics["email"]) lines.push(`Email: ${basics["email"]}`);
    if (basics["phone"]) lines.push(`Phone: ${basics["phone"]}`);
    if (basics["summary"]) lines.push(`\nSummary\n${basics["summary"]}`);
  }

  // Work experience
  const work = r["work"] as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(work) && work.length) {
    lines.push("\nExperience");
    for (const job of work) {
      const title = [job["position"], job["name"] ?? job["company"]].filter(Boolean).join(" at ");
      const dates = [job["startDate"], job["endDate"] ?? "Present"].filter(Boolean).join(" – ");
      lines.push(`${title}  (${dates})`);
      if (job["summary"]) lines.push(String(job["summary"]));
      const highlights = job["highlights"] as string[] | undefined;
      if (Array.isArray(highlights)) highlights.forEach((h) => lines.push(`• ${h}`));
    }
  }

  // Education
  const education = r["education"] as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(education) && education.length) {
    lines.push("\nEducation");
    for (const edu of education) {
      const deg = [edu["studyType"], edu["area"]].filter(Boolean).join(" in ");
      lines.push(`${deg} — ${edu["institution"] ?? ""} (${edu["startDate"] ?? ""} – ${edu["endDate"] ?? ""})`);
    }
  }

  // Skills
  const skills = r["skills"] as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(skills) && skills.length) {
    lines.push("\nSkills");
    for (const s of skills) {
      const keywords = s["keywords"] as string[] | undefined;
      lines.push(`${s["name"] ?? ""}${keywords?.length ? ": " + keywords.join(", ") : ""}`);
    }
  }

  // Projects
  const projects = r["projects"] as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(projects) && projects.length) {
    lines.push("\nProjects");
    for (const p of projects) {
      lines.push(`${p["name"] ?? ""}: ${p["description"] ?? ""}`);
      const ph = p["highlights"] as string[] | undefined;
      if (Array.isArray(ph)) ph.forEach((h) => lines.push(`• ${h}`));
    }
  }

  // Fallback for non-standard JSON shapes — just dump string values
  if (lines.length < 3) {
    return flattenObject(obj).join("\n");
  }

  return lines.join("\n");
}

function flattenObject(obj: unknown, depth = 0): string[] {
  if (depth > 4) return [];
  if (typeof obj === "string") return [obj];
  if (typeof obj === "number") return [String(obj)];
  if (Array.isArray(obj)) return obj.flatMap((v) => flattenObject(v, depth + 1));
  if (typeof obj === "object" && obj) {
    return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => {
      const vals = flattenObject(v, depth + 1);
      return vals.length ? [`${k}: ${vals.join(", ")}`] : [];
    });
  }
  return [];
}

/** Strip common markdown syntax to produce plain readable text. */
function stripMarkdown(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, "")          // headings
    .replace(/\*\*(.+?)\*\*/g, "$1")       // bold
    .replace(/\*(.+?)\*/g, "$1")           // italic
    .replace(/__(.+?)__/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/`{1,3}[^`]*`{1,3}/g, "")    // inline code / code blocks
    .replace(/^\s*[-*+]\s+/gm, "• ")       // bullets
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links → text
    .replace(/\n{3,}/g, "\n\n")            // collapse excess blank lines
    .trim();
}
