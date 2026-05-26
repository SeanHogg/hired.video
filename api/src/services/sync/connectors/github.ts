/**
 * GitHub connector.
 *
 * GitHub doesn't have a "profile" in the same shape as a job board — the
 * canonical surface is the user's profile README (`username/username`
 * repo). So this connector emits one big markdown block ready to paste
 * into that README, plus a "Bio" block sized to the 160-char limit on
 * the GitHub profile bio field.
 *
 * Extraction is not yet supported — adding it requires a parser entry
 * in shared/profile-parsers.js for github.com/<user>. Logged in the
 * gap register; not blocking v1.
 */

import type { ResumeContent } from "../../../../../shared/resume.js";
import type { ExportBlock, VendorConnector } from "./types.js";

const GITHUB_BIO_LIMIT = 160;

function fmtDates(start?: string, end?: string): string {
  const s = start?.trim() ?? "";
  const e = end?.trim() ?? "";
  if (!s && !e) return "";
  if (!e) return `${s} – Present`;
  if (!s) return e;
  return `${s} – ${e}`;
}

function renderReadmeMarkdown(content: ResumeContent): string {
  // ResumeContent is wide enough that TS narrows `content.basics ?? {}`
  // to `{}` and drops the property keys. Pin the partial shape so
  // optional-chained reads compile.
  const basics: Partial<NonNullable<ResumeContent["basics"]>> = content.basics ?? {};
  const lines: string[] = [];

  if (basics.name) lines.push(`# ${basics.name}`);
  if (basics.label) lines.push(`### ${basics.label}`);
  if (basics.summary) {
    lines.push("");
    lines.push(basics.summary.trim());
  }

  const work = content.work ?? [];
  if (work.length > 0) {
    lines.push("", "## Experience");
    for (const w of work) {
      const header = [w.position, w.name].filter(Boolean).join(" — ");
      const dates = fmtDates(w.startDate, w.endDate);
      lines.push("", `### ${header}`);
      if (dates) lines.push(`*${dates}*`);
      if (w.summary) lines.push("", w.summary.trim());
      const bullets = (w.highlights ?? [])
        .filter((h): h is string => typeof h === "string" && h.trim().length > 0);
      if (bullets.length > 0) {
        lines.push("");
        for (const b of bullets) lines.push(`- ${b.trim()}`);
      }
    }
  }

  const projects = content.projects ?? [];
  if (projects.length > 0) {
    lines.push("", "## Projects");
    for (const p of projects) {
      const linkText = p.url ? `[${p.name}](${p.url})` : p.name;
      lines.push("", `### ${linkText}`);
      if (p.description) lines.push("", p.description.trim());
    }
  }

  const skillNames = (content.skills ?? [])
    .map((s) => (typeof s === "object" && s ? (s as any).name : ""))
    .filter((n): n is string => typeof n === "string" && n.trim().length > 0);
  if (skillNames.length > 0) {
    lines.push("", "## Skills");
    lines.push("");
    lines.push(skillNames.map((s) => `\`${s}\``).join(" "));
  }

  return lines.join("\n").trim();
}

export const githubConnector: VendorConnector = {
  id: "github",
  label: "GitHub",
  iconKey: "github",
  category: "developer",
  description:
    "Generate a profile-README.md and a 160-char bio from your master resume — paste straight into GitHub.",
  editProfileUrl: "https://github.com/settings/profile",
  supportsExtensionExtract: false,
  supportsExtensionWrite: false,

  renderExportBlocks(content: ResumeContent): ExportBlock[] {
    const blocks: ExportBlock[] = [];
    const basics: Partial<NonNullable<ResumeContent["basics"]>> = content.basics ?? {};
    const bio = (basics.label || basics.summary || "").trim();
    if (bio) {
      blocks.push({
        section: "Bio",
        text: bio,
        format: "plain",
        charLimit: GITHUB_BIO_LIMIT,
        // Bio lives in /settings/profile. Same as the connector-level
        // editProfileUrl, but pinned here so the card opens the right
        // destination when openTargetUrl is set on a sibling block too.
        openTargetUrl: "https://github.com/settings/profile",
      });
    }
    blocks.push({
      section: "Profile README",
      text: renderReadmeMarkdown(content),
      format: "markdown",
      // The Profile README lives in a special `<username>/<username>` repo,
      // NOT in /settings/profile. We don't know the user's handle here, so
      // we send them to github.com/new pre-filled to create that repo (the
      // template field guides them when their username is logged in). Fixes
      // gap #1416 — previously the card sent them to settings, which is
      // the wrong destination for the README block.
      openTargetUrl: "https://github.com/new?template_name=README&template_owner=github",
    });
    return blocks;
  },
};
