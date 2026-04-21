// Shared helper for extracting plain text from resume files in the browser.
// Supports: .pdf, .docx, .txt, .md, .json

/** Client-side JSON Resume normaliser — mirrors the backend
 *  `normalizeJsonResume` so we can ship already-parsed content directly
 *  to endpoints that accept `parsedContent`. Lowercases first letter of
 *  every object key recursively; leaves values unchanged. */
export function normalizeJsonResume(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object") return {};
  return remapKeys(input as Record<string, unknown>) as Record<string, unknown>;
}

function toLowerFirst(key: string): string {
  if (!key || key[0] === key[0].toLowerCase()) return key;
  return key.charAt(0).toLowerCase() + key.slice(1);
}

function remapKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(remapKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[toLowerFirst(k)] = remapKeys(v);
    }
    return out;
  }
  return value;
}

/** Detect + parse a JSON Resume file. Returns the normalised object when
 *  the file is a JSON Resume, or null otherwise. Both PascalCase (legacy
 *  hired.video exports) and canonical jsonresume.org lowercase accepted.
 *
 *  Legacy hired.video exports stored the resume's display title at the
 *  top-level `Name` (now lowercased to `name`). Promote it to `title` so
 *  callers reading `parsedContent.title` get the canonical field. */
export async function parseJsonResumeFile(file: File): Promise<Record<string, unknown> | null> {
  const filename = file.name.toLowerCase();
  const isJson = filename.endsWith(".json") || file.type === "application/json";
  if (!isJson) return null;
  try {
    const raw = await file.text();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as Record<string, unknown>;
    const RESUME_KEYS = [
      "basics", "Basics", "work", "Work", "education", "Education",
      "skills", "Skills", "volunteer", "Volunteer", "projects", "Projects",
    ];
    if (!RESUME_KEYS.some((k) => k in obj)) return null;
    const normalized = normalizeJsonResume(obj);
    if (typeof normalized.name === "string" && normalized.title === undefined) {
      normalized.title = normalized.name;
      delete normalized.name;
    }
    return normalized;
  } catch {
    return null;
  }
}

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
      const parts: string[] = [];
      for (const item of content.items) {
        if (!("str" in item)) continue;
        parts.push(item.str);
        // pdfjs sets hasEOL when the text item ends a line in the original PDF
        if ((item as any).hasEOL) parts.push("\n");
      }
      pages.push(parts.join(""));
    }

    // Collapse runs of 3+ blank lines but preserve single/double line breaks and bullet structure
    return pages.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
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
      // Preserve paragraph structure: each </w:p> becomes a newline
      // Detect list items via <w:numPr> (Word numbering) and prefix with bullet
      const withBreaks = xml
        .replace(/<w:p\b[^>]*>(?=[\s\S]*?<w:numPr\b)/g, "\n• ")  // list paragraphs → bullet
        .replace(/<\/w:p>/g, "\n")                                  // paragraph breaks
        .replace(/<w:tab\s*\/>/g, "\t")                             // tabs
        .replace(/<w:br\s*\/>/g, "\n")                              // explicit breaks
        .replace(/<[^>]+>/g, "")                                    // strip remaining tags
        .replace(/[ \t]+/g, " ")                                    // collapse horizontal whitespace only
        .replace(/\n /g, "\n")                                      // trim leading space on lines
        .replace(/\n{3,}/g, "\n\n")                                 // collapse excess blank lines
        .trim();
      return withBreaks;
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
