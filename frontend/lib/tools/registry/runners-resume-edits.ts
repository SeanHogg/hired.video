// ── Mutation runners (AI coach edits resume / profile) ──────────────────────
//
// These return `mutation: { status: "pending", ... }` and DO NOT persist on
// their own. The chat panel's ToolCallCard inspects the user's
// `aiAutoApplyChanges` setting and either calls `commitMutation` (which
// performs the persist) or waits for the user to click Apply. Read-only
// tools keep their original semantics — they always run to completion.

import { aiToolPath } from "@shared/ai-tools/tool-ids";
import {
  ConsolidateHighlightsResponseSchema,
  ShortenBulletResponseSchema,
} from "@shared/tool-schemas";
import { apiClient } from "@/lib/api-client";
import { findSectionsContaining } from "../find-section";
import { readResumeContent } from "../resume-content";
import { standardizeResumeDates } from "../standardize-dates";
import type { NormalizedToolRunResult, ToolRunContext } from "../types";
import { asString } from "./shared";

export async function runApplyResumeRewrite(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const original = asString(ctx.args.original);
  const improved = asString(ctx.args.improved);
  if (!original || !improved) {
    throw new Error("apply_resume_rewrite requires `original` and `improved` strings.");
  }
  const { resumeId } = ctx.bound;
  if (!resumeId) {
    throw new Error("No active resume — open a resume to apply edits.");
  }
  return {
    summary: `Rewrite proposed: replace one bullet/summary on the active resume.`,
    previewText: `Before:\n${original}\n\nAfter:\n${improved}`,
    mutation: { status: "pending" },
    raw: { kind: "apply_resume_rewrite", resumeId, original, improved },
  };
}

export async function runUpdateResumeSummary(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const summary = asString(ctx.args.summary);
  if (!summary) throw new Error("update_resume_summary requires `summary`.");
  const { resumeId } = ctx.bound;
  if (!resumeId) throw new Error("No active resume — open a resume to apply edits.");
  return {
    summary: "New resume summary proposed.",
    previewText: summary,
    mutation: { status: "pending", location: "basics.summary" },
    raw: { kind: "update_resume_summary", resumeId, summary },
  };
}

export async function runAddResumeSkill(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const name = asString(ctx.args.name);
  if (!name) throw new Error("add_resume_skill requires `name`.");
  const { resumeId } = ctx.bound;
  if (!resumeId) throw new Error("No active resume — open a resume to add skills.");
  const level = asString(ctx.args.level) ?? "";
  return {
    summary: `Add skill: ${name}${level ? ` (${level})` : ""}`,
    previewText: name,
    mutation: { status: "pending", location: "skills" },
    raw: { kind: "add_resume_skill", resumeId, name, level },
  };
}

export async function runConsolidateSectionHighlights(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const matchHighlight = asString(ctx.args.matchHighlight);
  if (!matchHighlight) {
    throw new Error("consolidate_section_highlights requires `matchHighlight`.");
  }
  const { resumeId } = ctx.bound;
  if (!resumeId) {
    throw new Error("No active resume — open a resume to consolidate bullets.");
  }

  const content = await readResumeContent(resumeId);
  if (!content) throw new Error("Resume content unavailable.");

  const hits = findSectionsContaining(content, matchHighlight);
  if (hits.length === 0) {
    throw new Error("Couldn't find that bullet on the resume — was it edited recently?");
  }
  const target = hits[0];

  const { data } = await apiClient.post(
    aiToolPath("resume-consolidate-highlights"),
    { highlights: target.highlights, context: target.context },
    ConsolidateHighlightsResponseSchema,
  );
  const consolidated = data.items.map((i) => i.text);
  if (consolidated.length === 0) {
    throw new Error("AI couldn't consolidate these — try again in a moment.");
  }

  const before = target.highlights.map((h, i) => `${i + 1}. ${h}`).join("\n");
  const after = consolidated.map((h, i) => `${i + 1}. ${h}`).join("\n");
  const reduction = target.highlights.length - consolidated.length;

  return {
    summary:
      reduction > 0
        ? `Consolidated ${target.highlights.length} → ${consolidated.length} bullets on ${target.label}.`
        : `Tightened ${consolidated.length} bullets on ${target.label}.`,
    previewText: `${target.label}\n\nBefore:\n${before}\n\nAfter:\n${after}`,
    mutation: { status: "pending", location: `${target.kind}[${target.index}].highlights` },
    raw: {
      kind: "consolidate_section_highlights",
      resumeId,
      sectionKind: target.kind,
      sectionIndex: target.index,
      consolidated,
    },
  };
}

export async function runStandardizeResumeDates(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const { resumeId } = ctx.bound;
  if (!resumeId) {
    throw new Error("No active resume — open a resume to standardize dates.");
  }
  const content = await readResumeContent(resumeId);
  if (!content) throw new Error("Resume content unavailable.");

  const { report } = standardizeResumeDates(content);
  if (report.changedCount === 0) {
    return {
      summary: "All dates already use the standard format. Nothing to apply.",
      previewText:
        report.unparseable.length > 0
          ? `Couldn't parse:\n${report.unparseable.map((u) => `  • ${u.location}: "${u.value}"`).join("\n")}`
          : undefined,
      raw: { kind: "noop" },
    };
  }

  const preview = report.changes
    .map((c) => `  • ${c.location}: "${c.from}" → "${c.to}"`)
    .join("\n");
  const more =
    report.changedCount > report.changes.length
      ? `\n  …and ${report.changedCount - report.changes.length} more`
      : "";
  const unparseable =
    report.unparseable.length > 0
      ? `\n\nLeft alone (couldn't parse):\n${report.unparseable.map((u) => `  • ${u.location}: "${u.value}"`).join("\n")}`
      : "";

  return {
    summary: `Standardize ${report.changedCount} date${report.changedCount === 1 ? "" : "s"} on the resume.`,
    previewText: `Will change:\n${preview}${more}${unparseable}`,
    mutation: { status: "pending", location: "dates" },
    raw: {
      kind: "standardize_resume_dates",
      resumeId,
    },
  };
}

export async function runShortenBullet(ctx: ToolRunContext): Promise<NormalizedToolRunResult> {
  const original = asString(ctx.args.original);
  if (!original) {
    throw new Error("shorten_bullet requires `original` (the bullet text to shorten).");
  }
  const { resumeId } = ctx.bound;
  if (!resumeId) {
    throw new Error("No active resume — open a resume to shorten bullets.");
  }
  const maxChars = typeof ctx.args.maxChars === "number" ? ctx.args.maxChars : undefined;

  const { data } = await apiClient.post<{ improved: string }>(
    aiToolPath("resume-shorten-bullet"),
    { original, maxChars },
    ShortenBulletResponseSchema,
  );
  const improved = data.improved;
  if (!improved || improved.trim().length === 0) {
    throw new Error("Shorten failed — got an empty rewrite.");
  }

  return {
    summary: `Shorten one bullet (${original.length} → ${improved.length} chars).`,
    previewText: `Before:\n${original}\n\nAfter:\n${improved}`,
    mutation: { status: "pending" },
    // Reuse the apply_resume_rewrite commit path — one matcher + one
    // persistence pipeline regardless of which tool produced the rewrite.
    raw: { kind: "apply_resume_rewrite", resumeId, original, improved },
  };
}
