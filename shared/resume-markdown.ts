/**
 * Render a JSON Resume (ResumeContent) as Markdown.
 *
 * Used by:
 *   • the tailor JSON pipeline to produce a backward-compatible
 *     `markdownResume` field in the response alongside the structured
 *     `tailoredResume` output;
 *   • the frontend ResumeTailor to render the tailored resume locally
 *     when the backend returns a `tailoredResume` object.
 *
 * Lives in shared/ so backend + frontend produce byte-identical output
 * — otherwise the "Save as Variation" flow would round-trip through two
 * different markdown shapes and visual diffs would become noise.
 *
 * The format matches the sections the legacy tailor prompt emitted:
 *   # Name
 *   ## Summary
 *   ## Experience   (work[])
 *   ## Skills       (skills[])
 *   ## Education    (education[])
 *   ## Projects     (projects[], if any)
 *   ## Certifications (certificates[], if any)
 */

import type { ResumeContent } from "./resume.js";

function joinTruthy(parts: (string | undefined | null)[], sep = " — "): string {
  return parts.filter((p) => p && String(p).trim().length > 0).join(sep);
}

function formatDateRange(startDate?: string, endDate?: string): string {
  const start = (startDate ?? "").trim();
  const end = (endDate ?? "").trim() || "Present";
  if (!start) return "";
  return `${start} – ${end}`;
}

export function renderMarkdownFromJsonResume(resume: ResumeContent): string {
  const lines: string[] = [];

  const basics = resume.basics;
  if (basics) {
    const name = (basics.name ?? "").trim();
    if (name) lines.push(`# ${name}`);
    const label = (basics.label ?? "").trim();
    if (label) lines.push(`*${label}*`);

    const contactParts: string[] = [];
    if (basics.email) contactParts.push(String(basics.email));
    if (basics.phone) contactParts.push(String(basics.phone));
    if (basics.url) contactParts.push(String(basics.url));
    const loc = basics.location;
    if (loc) {
      const locParts = [loc.city, loc.region, loc.countryCode]
        .map((s) => (s ?? "").trim())
        .filter(Boolean);
      if (locParts.length > 0) contactParts.push(locParts.join(", "));
    }
    if (contactParts.length > 0) lines.push(contactParts.join(" · "));

    const summary = (basics.summary ?? "").trim();
    if (summary) {
      lines.push("");
      lines.push("## Summary");
      lines.push(summary);
    }
  }

  const work = resume.work ?? [];
  if (work.length > 0) {
    lines.push("");
    lines.push("## Experience");
    for (const job of work) {
      const heading = joinTruthy([job.position, job.name]);
      if (heading) lines.push(`### ${heading}`);
      const meta = formatDateRange(job.startDate, job.endDate);
      if (meta) lines.push(`*${meta}*`);
      const summary = (job.summary ?? "").trim();
      if (summary) lines.push(summary);
      const highlights = (job.highlights ?? []).filter((h) => h && h.trim().length > 0);
      for (const h of highlights) lines.push(`- ${h}`);
      lines.push("");
    }
  }

  const skills = resume.skills ?? [];
  if (skills.length > 0) {
    lines.push("## Skills");
    for (const skill of skills) {
      const name = (skill.name ?? "").trim();
      const keywords = (skill.keywords ?? []).filter((k) => k && k.trim().length > 0);
      if (name && keywords.length > 0) {
        lines.push(`- **${name}**: ${keywords.join(", ")}`);
      } else if (name) {
        lines.push(`- ${name}`);
      } else if (keywords.length > 0) {
        lines.push(`- ${keywords.join(", ")}`);
      }
    }
    lines.push("");
  }

  const education = resume.education ?? [];
  if (education.length > 0) {
    lines.push("## Education");
    for (const edu of education) {
      const heading = joinTruthy([edu.institution, edu.studyType, edu.area]);
      if (heading) lines.push(`### ${heading}`);
      const meta = formatDateRange(edu.startDate, edu.endDate);
      if (meta) lines.push(`*${meta}*`);
      if (edu.score) lines.push(`Score: ${edu.score}`);
      const courses = (edu.courses ?? []).filter((c) => c && c.trim().length > 0);
      for (const c of courses) lines.push(`- ${c}`);
      lines.push("");
    }
  }

  const projects = resume.projects ?? [];
  if (projects.length > 0) {
    lines.push("## Projects");
    for (const proj of projects) {
      const heading = (proj.name ?? "").trim();
      if (heading) lines.push(`### ${heading}`);
      const desc = (proj.description ?? "").trim();
      if (desc) lines.push(desc);
      const highlights = (proj.highlights ?? []).filter((h) => h && h.trim().length > 0);
      for (const h of highlights) lines.push(`- ${h}`);
      lines.push("");
    }
  }

  const certificates = resume.certificates ?? [];
  if (certificates.length > 0) {
    lines.push("## Certifications");
    for (const cert of certificates) {
      const name = (cert.name ?? "").trim();
      const issuer = (cert.issuer ?? "").trim();
      const date = (cert.date ?? "").trim();
      const parts = [name, issuer, date].filter(Boolean);
      if (parts.length > 0) lines.push(`- ${parts.join(" — ")}`);
    }
    lines.push("");
  }

  const awards = resume.awards ?? [];
  if (awards.length > 0) {
    lines.push("## Awards");
    for (const a of awards) {
      const parts = [a.title, a.awarder, a.date].map((s) => (s ?? "").trim()).filter(Boolean);
      if (parts.length > 0) lines.push(`- ${parts.join(" — ")}`);
      const summary = (a.summary ?? "").trim();
      if (summary) lines.push(`  ${summary}`);
    }
    lines.push("");
  }

  const volunteer = resume.volunteer ?? [];
  if (volunteer.length > 0) {
    lines.push("## Volunteer");
    for (const v of volunteer) {
      const heading = joinTruthy([v.position, v.organization]);
      if (heading) lines.push(`### ${heading}`);
      const meta = formatDateRange(v.startDate, v.endDate);
      if (meta) lines.push(`*${meta}*`);
      const summary = (v.summary ?? "").trim();
      if (summary) lines.push(summary);
      const highlights = (v.highlights ?? []).filter((h) => h && h.trim().length > 0);
      for (const h of highlights) lines.push(`- ${h}`);
      lines.push("");
    }
  }

  const languages = resume.languages ?? [];
  if (languages.length > 0) {
    lines.push("## Languages");
    for (const lang of languages) {
      const parts = [lang.language, lang.fluency].map((s) => (s ?? "").trim()).filter(Boolean);
      if (parts.length > 0) lines.push(`- ${parts.join(" — ")}`);
    }
    lines.push("");
  }

  // Trim trailing blank lines.
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();

  return lines.join("\n");
}
