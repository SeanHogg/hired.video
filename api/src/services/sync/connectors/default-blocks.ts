/**
 * Default `renderExportBlocks` shared by every vendor connector that
 * doesn't need platform-specific shaping.
 *
 * Output shape:
 *   - "Headline"     — basics.label (job title) for vendors that want it short
 *   - "About"        — basics.summary (full)
 *   - "Experience"   — one block per work entry, formatted as a paragraph +
 *                      bullet list (matches the way Indeed, Glassdoor,
 *                      ZipRecruiter, Monster, Dice all expect text input)
 *   - "Education"    — one block per education entry
 *   - "Skills"       — comma-separated skills list
 *
 * LinkedIn and GitHub override this — see their connector files.
 */

import type { ResumeContent } from "../../../../../shared/resume.js";
import type { ExportBlock } from "./types.js";

function fmtDateRange(start?: string, end?: string): string {
  const s = start?.trim() ?? "";
  const e = end?.trim() ?? "";
  if (!s && !e) return "";
  if (!e) return `${s} – Present`;
  if (!s) return e;
  return `${s} – ${e}`;
}

function renderWorkBlock(w: NonNullable<ResumeContent["work"]>[number]): ExportBlock {
  const company = w.name ?? "";
  const role = w.position ?? "";
  const dates = fmtDateRange(w.startDate, w.endDate);
  const header = [role, company].filter(Boolean).join(" — ");
  const summary = w.summary?.trim() ? `${w.summary.trim()}\n\n` : "";
  const bullets = (w.highlights ?? [])
    .filter((h): h is string => typeof h === "string" && h.trim().length > 0)
    .map((h) => `• ${h.trim()}`)
    .join("\n");
  const text = [
    header,
    dates,
    "",
    summary + bullets,
  ].filter((line) => line !== undefined).join("\n").trim();

  return {
    section: "Experience",
    subSection: header || "Experience entry",
    text,
    format: "plain",
  };
}

function renderEducationBlock(ed: NonNullable<ResumeContent["education"]>[number]): ExportBlock {
  const inst = ed.institution ?? "";
  const degree = [ed.studyType, ed.area].filter(Boolean).join(" in ");
  const dates = fmtDateRange(ed.startDate, ed.endDate);
  const header = [degree, inst].filter(Boolean).join(" — ");
  const courses = (ed.courses ?? [])
    .filter((c): c is string => typeof c === "string" && c.trim().length > 0);
  const courseLine = courses.length > 0 ? `\nCoursework: ${courses.join(", ")}` : "";

  return {
    section: "Education",
    subSection: header || "Education entry",
    text: [header, dates].filter(Boolean).join("\n") + courseLine,
    format: "plain",
  };
}

export function renderDefaultBlocks(content: ResumeContent): ExportBlock[] {
  const blocks: ExportBlock[] = [];
  const basics = content.basics;

  if (basics?.label) {
    blocks.push({ section: "Headline", text: basics.label.trim(), format: "plain" });
  }
  if (basics?.summary) {
    blocks.push({ section: "About", text: basics.summary.trim(), format: "plain" });
  }

  for (const w of content.work ?? []) blocks.push(renderWorkBlock(w));
  for (const ed of content.education ?? []) blocks.push(renderEducationBlock(ed));

  // Flatten skills (vendor-agnostic — LinkedIn does its own
  // structured-skill picker which we cover in its connector).
  const skillNames = (content.skills ?? [])
    .map((s) => (typeof s === "object" && s ? (s as any).name : ""))
    .filter((n): n is string => typeof n === "string" && n.trim().length > 0);
  if (skillNames.length > 0) {
    blocks.push({
      section: "Skills",
      text: skillNames.join(", "),
      format: "plain",
    });
  }

  return blocks;
}
