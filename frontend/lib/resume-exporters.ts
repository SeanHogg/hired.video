// Resume export utilities — PDF / Word / Plain Text / JSON.
//
// Design notes:
// - PDF: uses browser print-to-PDF via a dedicated print window. Works offline,
//   zero bundle impact, respects the live descriptor's styling. Server-side
//   Puppeteer isn't viable on CF Workers (see README § Phase 1 open questions).
// - DOCX: Word opens HTML files with application/msword + .doc extension, which
//   gives full text/formatting fidelity with zero dependency. We label it as
//   "Word" in the UI and save as .doc — functionally equivalent to .docx for
//   resume-sized documents.
// - Text: plain serializer from ResumeData.
// - JSON: raw resume data.

import type { Resume, ResumeData } from "@/types/resume";

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

function slugify(s: string, fallback = "resume"): string {
  const out = (s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return out || fallback;
}

// -----------------------------------------------------------------------------
// JSON
// -----------------------------------------------------------------------------

export function exportResumeJson(resume: Resume): void {
  const name = slugify(resume.data?.Basics?.Name || resume.name);
  const blob = new Blob([JSON.stringify(resume.data, null, 2)], { type: "application/json" });
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

export function resumeToPlainText(data: ResumeData): string {
  const parts: string[] = [];
  const b = data.Basics;
  if (b?.Name) parts.push(b.Name);
  if (b?.Label) parts.push(b.Label);
  const contact = [b?.Email, b?.Phone, b?.Url].filter(Boolean).join(" · ");
  if (contact) parts.push(contact);
  if (b?.Summary) parts.push(`\n${b.Summary}`);

  const work = (data.Work ?? []).map((w) => {
    const header = `${w.Position || ""} — ${w.Name || ""} (${dateRange(w.StartDate, w.EndDate || "Present")})`;
    const lines = [header];
    if (w.Summary) lines.push(`  ${w.Summary}`);
    (w.Highlights ?? []).forEach((h) => lines.push(`  • ${h}`));
    return lines.join("\n");
  });
  parts.push(textSection("Work Experience", work));

  const edu = (data.Education ?? []).map((e) => {
    const title = `${e.StudyType || ""} ${e.Area ? "in " + e.Area : ""}`.trim();
    const header = `${title} — ${e.Institution || ""} (${dateRange(e.StartDate, e.EndDate)})`;
    return e.Score ? `${header}\n  GPA: ${e.Score}` : header;
  });
  parts.push(textSection("Education", edu));

  const vol = (data.Volunteer ?? []).map((v) => {
    const header = `${v.Position || ""} — ${v.Organization || ""} (${dateRange(v.StartDate, v.EndDate || "Present")})`;
    const lines = [header];
    if (v.Summary) lines.push(`  ${v.Summary}`);
    (v.Highlights ?? []).forEach((h) => lines.push(`  • ${h}`));
    return lines.join("\n");
  });
  parts.push(textSection("Volunteer Experience", vol));

  const skills = (data.Skills ?? []).map((s) => {
    const kw = s.Keywords && s.Keywords.length > 0 ? ` — ${s.Keywords.join(", ")}` : "";
    const lvl = s.Level ? ` (${s.Level})` : "";
    return `  • ${s.Name}${lvl}${kw}`;
  });
  parts.push(textSection("Skills", skills));

  const langs = (data.Languages ?? []).map((l) => `  • ${l.Language}${l.Fluency ? ` — ${l.Fluency}` : ""}`);
  parts.push(textSection("Languages", langs));

  const projects = (data.Projects ?? []).map((p) => {
    const lines = [`${p.Name}${p.Entity ? ` (${p.Entity})` : ""}${p.Url ? ` — ${p.Url}` : ""}`];
    if (p.StartDate || p.EndDate) lines.push(`  ${dateRange(p.StartDate, p.EndDate || "Present")}`);
    if (p.Description) lines.push(`  ${p.Description}`);
    (p.Highlights ?? []).forEach((h) => lines.push(`  • ${h}`));
    if (p.Keywords && p.Keywords.length > 0) lines.push(`  [${p.Keywords.join(", ")}]`);
    return lines.join("\n");
  });
  parts.push(textSection("Projects", projects));

  const awards = (data.Awards ?? []).map((a) => {
    const meta = [a.Awarder, a.Date].filter(Boolean).join(" · ");
    return `  • ${a.Title}${meta ? ` (${meta})` : ""}${a.Summary ? `\n    ${a.Summary}` : ""}`;
  });
  parts.push(textSection("Awards", awards));

  const certs = (data.Certificates ?? []).map((c) => {
    const meta = [c.Issuer, c.Date].filter(Boolean).join(" · ");
    return `  • ${c.Name}${meta ? ` (${meta})` : ""}${c.Url ? ` — ${c.Url}` : ""}`;
  });
  parts.push(textSection("Certificates", certs));

  const pubs = (data.Publications ?? []).map((p) => {
    const meta = [p.Publisher, p.ReleaseDate].filter(Boolean).join(" · ");
    const lines = [`  • ${p.Name}${meta ? ` (${meta})` : ""}`];
    if (p.Summary) lines.push(`    ${p.Summary}`);
    if (p.Url) lines.push(`    ${p.Url}`);
    return lines.join("\n");
  });
  parts.push(textSection("Publications", pubs));

  const interests = (data.Interests ?? []).map((i) => `  • ${i.Name}${i.Keywords && i.Keywords.length > 0 ? ` — ${i.Keywords.join(", ")}` : ""}`);
  parts.push(textSection("Interests", interests));

  const refs = (data.References ?? []).map((r) => `  • ${r.Name}${r.Reference ? `\n    "${r.Reference}"` : ""}`);
  parts.push(textSection("References", refs));

  return parts.filter(Boolean).join("\n").trim() + "\n";
}

export function exportResumeText(resume: Resume): void {
  const name = slugify(resume.data?.Basics?.Name || resume.name);
  const blob = new Blob([resumeToPlainText(resume.data)], { type: "text/plain;charset=utf-8" });
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

function resumeToWordHtml(data: ResumeData): string {
  const b = data.Basics;
  const esc = escapeHtml;

  const sec = (title: string, inner: string): string => {
    if (!inner) return "";
    return `
    <h2 style="border-bottom:1pt solid #444;padding-bottom:2pt;margin:14pt 0 6pt;font-size:12pt;text-transform:uppercase;letter-spacing:1pt;">${esc(title)}</h2>
    ${inner}`;
  };

  const work = (data.Work ?? []).map((w) => `
    <div style="margin-bottom:8pt;">
      <div><b>${esc(w.Position || "")}</b> — ${esc(w.Name || "")}
        <span style="float:right;color:#555;">${esc(dateRange(w.StartDate, w.EndDate || "Present"))}</span>
      </div>
      ${w.Summary ? `<div>${esc(w.Summary)}</div>` : ""}
      ${w.Highlights && w.Highlights.length > 0 ? `<ul style="margin:4pt 0 0 16pt;">${w.Highlights.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>` : ""}
    </div>`).join("");

  const edu = (data.Education ?? []).map((e) => {
    const title = `${e.StudyType || ""} ${e.Area ? "in " + e.Area : ""}`.trim();
    return `
      <div style="margin-bottom:6pt;">
        <div><b>${esc(title)}</b> — ${esc(e.Institution || "")}
          <span style="float:right;color:#555;">${esc(dateRange(e.StartDate, e.EndDate))}</span>
        </div>
        ${e.Score ? `<div style="color:#555;">GPA: ${esc(e.Score)}</div>` : ""}
      </div>`;
  }).join("");

  const vol = (data.Volunteer ?? []).map((v) => `
    <div style="margin-bottom:8pt;">
      <div><b>${esc(v.Position || "")}</b> — ${esc(v.Organization || "")}
        <span style="float:right;color:#555;">${esc(dateRange(v.StartDate, v.EndDate || "Present"))}</span>
      </div>
      ${v.Summary ? `<div>${esc(v.Summary)}</div>` : ""}
      ${v.Highlights && v.Highlights.length > 0 ? `<ul style="margin:4pt 0 0 16pt;">${v.Highlights.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>` : ""}
    </div>`).join("");

  const skills = (data.Skills ?? []).map((s) => {
    const kw = s.Keywords && s.Keywords.length > 0 ? ` — ${esc(s.Keywords.join(", "))}` : "";
    const lvl = s.Level ? ` (${esc(s.Level)})` : "";
    return `<li><b>${esc(s.Name)}</b>${lvl}${kw}</li>`;
  }).join("");

  const langs = (data.Languages ?? []).map((l) => `<li><b>${esc(l.Language)}</b>${l.Fluency ? ` — ${esc(l.Fluency)}` : ""}</li>`).join("");

  const projects = (data.Projects ?? []).map((p) => `
    <div style="margin-bottom:8pt;">
      <div><b>${esc(p.Name)}</b>${p.Entity ? ` — ${esc(p.Entity)}` : ""}
        ${p.Url ? `<span style="float:right;">${esc(p.Url)}</span>` : ""}
      </div>
      ${p.StartDate || p.EndDate ? `<div style="color:#555;">${esc(dateRange(p.StartDate, p.EndDate || "Present"))}</div>` : ""}
      ${p.Description ? `<div>${esc(p.Description)}</div>` : ""}
      ${p.Highlights && p.Highlights.length > 0 ? `<ul style="margin:4pt 0 0 16pt;">${p.Highlights.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>` : ""}
    </div>`).join("");

  const awards = (data.Awards ?? []).map((a) => `
    <div style="margin-bottom:6pt;"><b>${esc(a.Title)}</b>${a.Awarder ? ` — ${esc(a.Awarder)}` : ""}${a.Date ? ` (${esc(a.Date)})` : ""}
    ${a.Summary ? `<div>${esc(a.Summary)}</div>` : ""}</div>`).join("");

  const certs = (data.Certificates ?? []).map((c) => `<li><b>${esc(c.Name)}</b>${c.Issuer ? ` — ${esc(c.Issuer)}` : ""}${c.Date ? ` (${esc(c.Date)})` : ""}</li>`).join("");

  const pubs = (data.Publications ?? []).map((p) => `
    <div style="margin-bottom:6pt;"><b>${esc(p.Name)}</b>${p.Publisher ? ` — ${esc(p.Publisher)}` : ""}${p.ReleaseDate ? ` (${esc(p.ReleaseDate)})` : ""}
    ${p.Summary ? `<div>${esc(p.Summary)}</div>` : ""}</div>`).join("");

  const interests = (data.Interests ?? []).map((i) => `<li><b>${esc(i.Name)}</b>${i.Keywords && i.Keywords.length > 0 ? ` — ${esc(i.Keywords.join(", "))}` : ""}</li>`).join("");

  const refs = (data.References ?? []).map((r) => `<div style="margin-bottom:4pt;"><b>${esc(r.Name)}</b>${r.Reference ? `<div>${esc(r.Reference)}</div>` : ""}</div>`).join("");

  const contact = [b?.Email, b?.Phone, b?.Url].filter(Boolean).map(esc).join(" · ");

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8" />
<title>${esc(b?.Name || "Resume")}</title>
<style>
  body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #222; max-width: 7.5in; margin: 0.75in auto; }
  h1 { font-size: 22pt; margin: 0 0 2pt; }
  .contact { color:#555; font-size:10pt; margin-bottom:10pt; }
  ul { padding-left: 16pt; }
</style>
</head>
<body>
  <h1>${esc(b?.Name || "Untitled Resume")}</h1>
  ${b?.Label ? `<div style="font-size:13pt;color:#444;">${esc(b.Label)}</div>` : ""}
  ${contact ? `<div class="contact">${contact}</div>` : ""}
  ${b?.Summary ? `<div>${esc(b.Summary)}</div>` : ""}
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
  const name = slugify(resume.data?.Basics?.Name || resume.name);
  const html = resumeToWordHtml(resume.data);
  const blob = new Blob([html], { type: "application/msword" });
  triggerDownload(blob, `${name}.doc`);
}

// -----------------------------------------------------------------------------
// PDF — opens a print-optimized window and triggers the browser's print dialog.
// Caller provides a URL that will render the resume alone (no chrome); we add
// ?print=1 which the viewer page uses to auto-trigger window.print().
// -----------------------------------------------------------------------------

export function exportResumePdf(printUrl: string): void {
  const w = window.open(printUrl, "_blank", "noopener,noreferrer");
  if (!w) {
    alert("Your browser blocked the print window. Allow pop-ups for this site, then try again.");
  }
}
