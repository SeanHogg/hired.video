// Resume export utilities — PDF / Word / Plain Text / JSON.
//
// Design notes:
// - Reads the canonical camelCase JSON Resume shape (shared/resume.ts).
// - PDF: uses browser print-to-PDF via a dedicated print window. Works offline,
//   zero bundle impact, respects the live descriptor's styling. Server-side
//   Puppeteer isn't viable on CF Workers (see README § Phase 1 open questions).
// - DOCX: Word opens HTML files with application/msword + .doc extension, which
//   gives full text/formatting fidelity with zero dependency. We label it as
//   "Word" in the UI and save as .doc — functionally equivalent to .docx for
//   resume-sized documents.
// - Text: plain serializer from ResumeContent.
// - JSON: raw resume content.

import type { Resume, ResumeContent } from "@/types/resume";
import { slugify } from "@shared/slugify";
import { alertDialog } from "@/lib/dialogs";

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 500);
}

// -----------------------------------------------------------------------------
// JSON
// -----------------------------------------------------------------------------

/** Strip per-record `interactive` fields before serialising — ATS / PDF
 *  / Word / plain-text outputs can't render interactive canvases (a
 *  webcam clip on a resume PDF makes no sense), and the JSON-Resume
 *  consumers downstream (Greenhouse / Lever / Workday) reject unknown
 *  fields. The interactive overlay stays available on the public
 *  resume page; exports are deliberately the unenhanced shell. */
function stripInteractive<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => stripInteractive(v)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "interactive") continue;
      next[k] = stripInteractive(v);
    }
    return next as T;
  }
  return value;
}

export function exportResumeJson(resume: Resume): void {
  const name = slugify(resume.content?.basics?.name || resume.title, { fallback: "resume" });
  const stripped = stripInteractive(resume.content);
  const blob = new Blob([JSON.stringify(stripped, null, 2)], { type: "application/json" });
  triggerDownload(blob, `${name}.resume.json`);
}

// -----------------------------------------------------------------------------
// Plain Text
// -----------------------------------------------------------------------------

function textSection(title: string, lines: string[]): string {
  if (lines.length === 0) return "";
  const underline = "=".repeat(Math.min(title.length, 40));
  return `\n${title.toUpperCase()}\n${underline}\n${lines.join("\n")}\n`;
}

function dateRange(start?: string, end?: string): string {
  const s = start || "";
  const e = end || "Present";
  if (!s && !e) return "";
  return `${s} – ${e}`;
}

export function resumeToPlainText(content: ResumeContent): string {
  const parts: string[] = [];
  const b = content.basics;
  if (b?.name) parts.push(b.name);
  if (b?.label) parts.push(b.label);
  const contact = [b?.email, b?.phone, b?.url].filter(Boolean).join(" · ");
  if (contact) parts.push(contact);
  if (b?.summary) parts.push(`\n${b.summary}`);

  const work = (content.work ?? []).map((w) => {
    const header = `${w.position || ""} — ${w.name || ""} (${dateRange(w.startDate, w.endDate || "Present")})`;
    const lines = [header];
    if (w.summary) lines.push(`  ${w.summary}`);
    (w.highlights ?? []).forEach((h) => lines.push(`  • ${h}`));
    return lines.join("\n");
  });
  parts.push(textSection("Work Experience", work));

  const edu = (content.education ?? []).map((e) => {
    const title = `${e.studyType || ""} ${e.area ? "in " + e.area : ""}`.trim();
    const header = `${title} — ${e.institution || ""} (${dateRange(e.startDate, e.endDate)})`;
    return e.score ? `${header}\n  GPA: ${e.score}` : header;
  });
  parts.push(textSection("Education", edu));

  const vol = (content.volunteer ?? []).map((v) => {
    const header = `${v.position || ""} — ${v.organization || ""} (${dateRange(v.startDate, v.endDate || "Present")})`;
    const lines = [header];
    if (v.summary) lines.push(`  ${v.summary}`);
    (v.highlights ?? []).forEach((h) => lines.push(`  • ${h}`));
    return lines.join("\n");
  });
  parts.push(textSection("Volunteer Experience", vol));

  const skills = (content.skills ?? []).map((s) => {
    const kw = s.keywords && s.keywords.length > 0 ? ` — ${s.keywords.join(", ")}` : "";
    const lvl = s.level ? ` (${s.level})` : "";
    return `  • ${s.name}${lvl}${kw}`;
  });
  parts.push(textSection("Skills", skills));

  const langs = (content.languages ?? []).map((l) => `  • ${l.language}${l.fluency ? ` — ${l.fluency}` : ""}`);
  parts.push(textSection("Languages", langs));

  const projects = (content.projects ?? []).map((p) => {
    const lines = [`${p.name}${p.entity ? ` (${p.entity})` : ""}${p.url ? ` — ${p.url}` : ""}`];
    if (p.startDate || p.endDate) lines.push(`  ${dateRange(p.startDate, p.endDate || "Present")}`);
    if (p.description) lines.push(`  ${p.description}`);
    (p.highlights ?? []).forEach((h) => lines.push(`  • ${h}`));
    if (p.keywords && p.keywords.length > 0) lines.push(`  [${p.keywords.join(", ")}]`);
    return lines.join("\n");
  });
  parts.push(textSection("Projects", projects));

  const awards = (content.awards ?? []).map((a) => {
    const meta = [a.awarder, a.date].filter(Boolean).join(" · ");
    return `  • ${a.title}${meta ? ` (${meta})` : ""}${a.summary ? `\n    ${a.summary}` : ""}`;
  });
  parts.push(textSection("Awards", awards));

  const certs = (content.certificates ?? []).map((c) => {
    const meta = [c.issuer, c.date].filter(Boolean).join(" · ");
    return `  • ${c.name}${meta ? ` (${meta})` : ""}${c.url ? ` — ${c.url}` : ""}`;
  });
  parts.push(textSection("Certificates", certs));

  const pubs = (content.publications ?? []).map((p) => {
    const meta = [p.publisher, p.releaseDate].filter(Boolean).join(" · ");
    const lines = [`  • ${p.name}${meta ? ` (${meta})` : ""}`];
    if (p.summary) lines.push(`    ${p.summary}`);
    if (p.url) lines.push(`    ${p.url}`);
    return lines.join("\n");
  });
  parts.push(textSection("Publications", pubs));

  const interests = (content.interests ?? []).map((i) => `  • ${i.name}${i.keywords && i.keywords.length > 0 ? ` — ${i.keywords.join(", ")}` : ""}`);
  parts.push(textSection("Interests", interests));

  const refs = (content.references ?? []).map((r) => `  • ${r.name}${r.reference ? `\n    "${r.reference}"` : ""}`);
  parts.push(textSection("References", refs));

  return parts.filter(Boolean).join("\n").trim() + "\n";
}

export function exportResumeText(resume: Resume): void {
  const name = slugify(resume.content?.basics?.name || resume.title, { fallback: "resume" });
  const blob = new Blob([resumeToPlainText(resume.content)], { type: "text/plain;charset=utf-8" });
  triggerDownload(blob, `${name}.txt`);
}

// -----------------------------------------------------------------------------
// Word (.doc) — HTML-based, no dependencies
// -----------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function resumeToWordHtml(content: ResumeContent): string {
  const b = content.basics;
  const esc = escapeHtml;

  const sec = (title: string, inner: string): string => {
    if (!inner) return "";
    return `
    <h2 style="border-bottom:1pt solid #444;padding-bottom:2pt;margin:14pt 0 6pt;font-size:12pt;text-transform:uppercase;letter-spacing:1pt;">${esc(title)}</h2>
    ${inner}`;
  };

  const work = (content.work ?? []).map((w) => `
    <div style="margin-bottom:8pt;">
      <div><b>${esc(w.position || "")}</b> — ${esc(w.name || "")}
        <span style="float:right;color:#555;">${esc(dateRange(w.startDate, w.endDate || "Present"))}</span>
      </div>
      ${w.summary ? `<div>${esc(w.summary)}</div>` : ""}
      ${w.highlights && w.highlights.length > 0 ? `<ul style="margin:4pt 0 0 16pt;">${w.highlights.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>` : ""}
    </div>`).join("");

  const edu = (content.education ?? []).map((e) => {
    const title = `${e.studyType || ""} ${e.area ? "in " + e.area : ""}`.trim();
    return `
      <div style="margin-bottom:6pt;">
        <div><b>${esc(title)}</b> — ${esc(e.institution || "")}
          <span style="float:right;color:#555;">${esc(dateRange(e.startDate, e.endDate))}</span>
        </div>
        ${e.score ? `<div style="color:#555;">GPA: ${esc(e.score)}</div>` : ""}
      </div>`;
  }).join("");

  const vol = (content.volunteer ?? []).map((v) => `
    <div style="margin-bottom:8pt;">
      <div><b>${esc(v.position || "")}</b> — ${esc(v.organization || "")}
        <span style="float:right;color:#555;">${esc(dateRange(v.startDate, v.endDate || "Present"))}</span>
      </div>
      ${v.summary ? `<div>${esc(v.summary)}</div>` : ""}
      ${v.highlights && v.highlights.length > 0 ? `<ul style="margin:4pt 0 0 16pt;">${v.highlights.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>` : ""}
    </div>`).join("");

  const skills = (content.skills ?? []).map((s) => {
    const kw = s.keywords && s.keywords.length > 0 ? ` — ${esc(s.keywords.join(", "))}` : "";
    const lvl = s.level ? ` (${esc(s.level)})` : "";
    return `<li><b>${esc(s.name)}</b>${lvl}${kw}</li>`;
  }).join("");

  const langs = (content.languages ?? []).map((l) => `<li><b>${esc(l.language)}</b>${l.fluency ? ` — ${esc(l.fluency)}` : ""}</li>`).join("");

  const projects = (content.projects ?? []).map((p) => `
    <div style="margin-bottom:8pt;">
      <div><b>${esc(p.name)}</b>${p.entity ? ` — ${esc(p.entity)}` : ""}
        ${p.url ? `<span style="float:right;">${esc(p.url)}</span>` : ""}
      </div>
      ${p.startDate || p.endDate ? `<div style="color:#555;">${esc(dateRange(p.startDate, p.endDate || "Present"))}</div>` : ""}
      ${p.description ? `<div>${esc(p.description)}</div>` : ""}
      ${p.highlights && p.highlights.length > 0 ? `<ul style="margin:4pt 0 0 16pt;">${p.highlights.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>` : ""}
    </div>`).join("");

  const awards = (content.awards ?? []).map((a) => `
    <div style="margin-bottom:6pt;"><b>${esc(a.title)}</b>${a.awarder ? ` — ${esc(a.awarder)}` : ""}${a.date ? ` (${esc(a.date)})` : ""}
    ${a.summary ? `<div>${esc(a.summary)}</div>` : ""}</div>`).join("");

  const certs = (content.certificates ?? []).map((c) => `<li><b>${esc(c.name)}</b>${c.issuer ? ` — ${esc(c.issuer)}` : ""}${c.date ? ` (${esc(c.date)})` : ""}</li>`).join("");

  const pubs = (content.publications ?? []).map((p) => `
    <div style="margin-bottom:6pt;"><b>${esc(p.name)}</b>${p.publisher ? ` — ${esc(p.publisher)}` : ""}${p.releaseDate ? ` (${esc(p.releaseDate)})` : ""}
    ${p.summary ? `<div>${esc(p.summary)}</div>` : ""}</div>`).join("");

  const interests = (content.interests ?? []).map((i) => `<li><b>${esc(i.name)}</b>${i.keywords && i.keywords.length > 0 ? ` — ${esc(i.keywords.join(", "))}` : ""}</li>`).join("");

  const refs = (content.references ?? []).map((r) => `<div style="margin-bottom:4pt;"><b>${esc(r.name)}</b>${r.reference ? `<div>${esc(r.reference)}</div>` : ""}</div>`).join("");

  const contact = [b?.email, b?.phone, b?.url].filter(Boolean).map((s) => esc(s as string)).join(" · ");

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8" />
<title>${esc(b?.name || "Resume")}</title>
<style>
  body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #222; max-width: 7.5in; margin: 0.75in auto; }
  h1 { font-size: 22pt; margin: 0 0 2pt; }
  .contact { color:#555; font-size:10pt; margin-bottom:10pt; }
  ul { padding-left: 16pt; }
</style>
</head>
<body>
  <h1>${esc(b?.name || "Untitled Resume")}</h1>
  ${b?.label ? `<div style="font-size:13pt;color:#444;">${esc(b.label)}</div>` : ""}
  ${contact ? `<div class="contact">${contact}</div>` : ""}
  ${b?.summary ? `<div>${esc(b.summary)}</div>` : ""}
  ${sec("Work Experience", work)}
  ${sec("Education", edu)}
  ${sec("Volunteer Experience", vol)}
  ${skills ? sec("Skills", `<ul>${skills}</ul>`) : ""}
  ${langs ? sec("Languages", `<ul>${langs}</ul>`) : ""}
  ${sec("Projects", projects)}
  ${sec("Awards", awards)}
  ${certs ? sec("Certificates", `<ul>${certs}</ul>`) : ""}
  ${sec("Publications", pubs)}
  ${interests ? sec("Interests", `<ul>${interests}</ul>`) : ""}
  ${sec("References", refs)}
</body>
</html>`;
}

export function exportResumeWord(resume: Resume): void {
  const name = slugify(resume.content?.basics?.name || resume.title, { fallback: "resume" });
  const html = resumeToWordHtml(resume.content);
  const blob = new Blob([html], { type: "application/msword" });
  triggerDownload(blob, `${name}.doc`);
}

// -----------------------------------------------------------------------------
// PDF — opens a print-optimized window and triggers the browser's print dialog.
// Caller provides a URL that will render the resume alone (no chrome); we add
// ?print=1 which the viewer page uses to auto-trigger window.print().
// -----------------------------------------------------------------------------

export async function exportResumePdf(printUrl: string): Promise<void> {
  const w = window.open(printUrl, "_blank", "noopener,noreferrer");
  if (!w) {
    await alertDialog({
      title: "Pop-up blocked",
      description: "Your browser blocked the print window. Allow pop-ups for this site, then try again.",
    });
  }
}
