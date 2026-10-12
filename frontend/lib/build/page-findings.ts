/**
 * Findings pinned on the page (the kit workspace, Strengthen): what the latest scoring
 * runs (Roast, AI Résumé Scorer, Résumé Optimizer) said about the draft,
 * each anchored to the exact line it criticises — so the page can flag that
 * line, and a rewrite can be applied in place as one Undo step.
 *
 *   rewrite   a Roast before/after, or an analyzer recommendation whose
 *             structured action is a rewrite (#374), whose `original` is
 *             found on the page
 *   issue     a weakness / fix / recommendation that quotes a line — with
 *             the wand that fixes it when the analyzer named one
 *   missing   a run says the email / phone is missing and it is empty
 *
 * Text matching folds case, whitespace, smart quotes and dashes, and accepts
 * a truncated quote ("…", "...") as a prefix of the line. A finding that
 * can't be anchored is dropped here (the chat's result card still shows it).
 *
 * Pure: no I/O, never mutates its input.
 */
import type { ResumeContent } from "@shared/resume";
import { readAt, writeAt, type ContentPath } from "@shared/resume-path";
import { MIN_REWRITE_QUOTE, locateQuote, type Hit } from "./line-locate";
import type { ToolRun } from "./use-tool-runs";
import { findWandForRecommendation, type ResolvedWand } from "@/lib/tools/find-wand-for-recommendation";

export { locateQuote, textFields, type TextField } from "./line-locate";

export type FindingSource = "roast" | "scorer" | "optimizer";
export type FindingSeverity = "critical" | "important" | "minor";
export type FindingKind = "rewrite" | "issue" | "missing";

export interface FindingAnchor {
  /** Content path of the field (`work.2.highlights.1`, `basics.summary`;
   *  `basics` for a missing contact field). */
  path: ContentPath;
  /** Top-level section (`work`, `basics`, …). */
  section: string;
  /** The entry's stable id, when it has one. */
  itemId?: string;
  /** The field inside the entry (`highlights`, `summary`, `email`, …). */
  field: string;
  /** The field's text when the finding was anchored ("" when missing). */
  text: string;
  /** The criticised span inside `text` ([start, end) — the whole field when
   *  the quote is the whole line). */
  start: number;
  end: number;
}

export interface PageFinding {
  /** Stable for a run: `<runId>:<n>`. */
  id: string;
  source: FindingSource;
  kind: FindingKind;
  severity: FindingSeverity;
  /** i18n key of the short flag text ("Roast · rewrite", "ATS", "+ add email"). */
  labelKey: string;
  /** What the tool said (model text, shown as-is). */
  title?: string;
  rewrite?: { before: string; after: string };
  /** The wand that fixes it (#374/#375) — the analyzer's structured action,
   *  run on the draft as a chat card (Apply = one Undo step). Absent on a
   *  rewrite (its Apply is in place) and on prose-only findings. */
  action?: ResolvedWand;
  anchor: FindingAnchor;
}

const SCORING_TOOLS: Readonly<Record<string, FindingSource>> = {
  "resume-roast": "roast",
  "ai-resume-scorer": "scorer",
  "resume-optimizer": "optimizer",
};

const CATEGORY_LABEL: Readonly<Record<string, string>> = {
  ats: "build.findings.flag.ats",
  keywords: "build.findings.flag.keywords",
  format: "build.findings.flag.format",
  content: "build.findings.flag.content",
  impact: "build.findings.flag.impact",
  structure: "build.findings.flag.structure",
};

const SEVERITIES: readonly FindingSeverity[] = ["critical", "important", "minor"];

function anchorOf(hit: Hit): FindingAnchor {
  const { field, start, end } = hit;
  return { path: field.path, section: field.section, itemId: field.itemId, field: field.field, text: field.text, start, end };
}

// ── Tool output → findings ──────────────────────────────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && s.trim() !== "") : [];
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Phrases a tool quoted, longest first. */
function quotesIn(text: string): string[] {
  const out: string[] = [];
  const re = /["“]([^"“”]{6,400})["”]|‘([^‘’]{6,400})’/g;
  for (const m of text.matchAll(re)) out.push(m[1] ?? m[2] ?? "");
  return out.sort((a, b) => b.length - a.length);
}

function locateQuoted(content: ResumeContent, text: string): Hit | null {
  for (const q of quotesIn(text)) {
    const hit = locateQuote(content, q);
    if (hit) return hit;
  }
  return null;
}

interface Draft {
  source: FindingSource;
  kind: FindingKind;
  severity: FindingSeverity;
  labelKey: string;
  title?: string;
  rewrite?: { before: string; after: string };
  action?: ResolvedWand;
  anchor: FindingAnchor;
}

interface Said {
  source: FindingSource;
  text: string;
}

const LEADING_BULLET = /^[•·▪●*–—-]\s*/;

function roastFindings(raw: Record<string, unknown>, content: ResumeContent, said: Said[]): Draft[] {
  const out: Draft[] = [];
  const examples = Array.isArray(raw.improvedExamples) ? raw.improvedExamples.filter(isRecord) : [];
  for (const ex of examples) {
    const original = str(ex.original);
    // The model often prefixes a bullet ("• Slashed…"); the line already is one.
    const improved = str(ex.improved).trim().replace(LEADING_BULLET, "");
    if (!improved) continue;
    const hit = locateQuote(content, original, MIN_REWRITE_QUOTE);
    if (!hit) continue;
    out.push({
      source: "roast",
      kind: "rewrite",
      severity: "important",
      labelKey: "build.findings.flag.roastRewrite",
      rewrite: { before: hit.field.text.slice(hit.start, hit.end), after: improved },
      anchor: anchorOf(hit),
    });
  }
  for (const text of [...strings(raw.weaknesses), ...strings(raw.fixes)]) {
    said.push({ source: "roast", text });
    const hit = locateQuoted(content, text);
    if (hit) out.push({ source: "roast", kind: "issue", severity: "important", labelKey: "build.findings.flag.roast", title: text, anchor: anchorOf(hit) });
  }
  return out;
}

function analysisFindings(source: FindingSource, raw: Record<string, unknown>, content: ResumeContent, said: Said[]): Draft[] {
  const out: Draft[] = [];
  const recs = Array.isArray(raw.recommendations) ? raw.recommendations.filter(isRecord) : [];
  for (const rec of recs) {
    const title = str(rec.title).trim();
    const description = str(rec.description).trim();
    const text = [title, description].filter(Boolean).join(" — ");
    if (!text) continue;
    said.push({ source, text });
    const severity = SEVERITIES.find((s) => s === rec.severity) ?? "minor";
    const labelKey = CATEGORY_LABEL[str(rec.category).toLowerCase()] ?? "build.findings.flag.tip";
    // The analyzer's structured action (#374) names the exact line + fix.
    const wand = findWandForRecommendation(rec);
    if (wand?.toolId === "apply_resume_rewrite") {
      const hit = locateQuote(content, str(wand.args.original), MIN_REWRITE_QUOTE);
      const after = str(wand.args.improved).trim();
      if (hit && after) {
        out.push({
          source,
          kind: "rewrite",
          severity,
          labelKey,
          title: text,
          rewrite: { before: hit.field.text.slice(hit.start, hit.end), after },
          anchor: anchorOf(hit),
        });
        continue;
      }
    }
    const quoted = wand ? str(wand.args.original) || str(wand.args.matchHighlight) : "";
    const hit = (quoted ? locateQuote(content, quoted) : null) ?? locateQuoted(content, `${title} ${description}`);
    if (!hit) continue;
    const action = wand && wand.toolId !== "apply_resume_rewrite" ? wand : undefined;
    out.push({ source, kind: "issue", severity, labelKey, title: text, ...(action ? { action } : {}), anchor: anchorOf(hit) });
  }
  for (const text of strings(raw.weaknesses)) {
    said.push({ source, text });
    const hit = locateQuoted(content, text);
    if (hit) out.push({ source, kind: "issue", severity: "important", labelKey: "build.findings.flag.weakness", title: text, anchor: anchorOf(hit) });
  }
  return out;
}

const MISSING: ReadonlyArray<{ field: "email" | "phone"; mention: RegExp; labelKey: string }> = [
  { field: "email", mention: /\be-?mail\b/i, labelKey: "build.findings.flag.addEmail" },
  { field: "phone", mention: /\bphone\b/i, labelKey: "build.findings.flag.addPhone" },
];

/** A run said the email / phone is missing, and the page has none. */
function missingFindings(said: readonly Said[], content: ResumeContent): Draft[] {
  const out: Draft[] = [];
  for (const { field, mention, labelKey } of MISSING) {
    if (str(content.basics?.[field]).trim()) continue;
    const s = said.find((x) => mention.test(x.text));
    if (!s) continue;
    out.push({
      source: s.source,
      kind: "missing",
      severity: "critical",
      labelKey,
      title: s.text,
      anchor: { path: "basics", section: "basics", field, text: "", start: 0, end: 0 },
    });
  }
  return out;
}

/** The latest finished run of each scoring tool, oldest first. */
function latestScoringRuns(runs: readonly ToolRun[]) {
  const latest = new Map<string, Extract<ToolRun, { status: "done" }>>();
  for (const run of runs) {
    if (run.status === "done" && SCORING_TOOLS[run.toolId]) latest.set(run.toolId, run);
  }
  return [...latest.values()].sort((a, b) => a.at - b.at);
}

/** The findings of the latest scoring runs that anchor on `content`. One
 *  rewrite per line (the first), and no repeated issue on a line. */
export function pageFindings(runs: readonly ToolRun[], content: ResumeContent): PageFinding[] {
  const out: PageFinding[] = [];
  const rewritten = new Set<ContentPath>();
  const issues = new Set<string>();
  const said: Said[] = [];
  const keep = (runId: number, drafts: readonly Draft[]) => {
    drafts.forEach((d, n) => {
      if (d.kind === "rewrite") {
        if (rewritten.has(d.anchor.path)) return;
        rewritten.add(d.anchor.path);
      } else {
        const key = `${d.anchor.path}|${d.anchor.field}|${(d.title ?? "").toLowerCase()}`;
        if (issues.has(key)) return;
        issues.add(key);
      }
      out.push({ id: `${runId}:${n}`, ...d });
    });
  };

  for (const run of latestScoringRuns(runs)) {
    const source = SCORING_TOOLS[run.toolId];
    const raw = run.result.raw;
    if (!isRecord(raw)) continue;
    keep(run.id, source === "roast" ? roastFindings(raw, content, said) : analysisFindings(source, raw, content, said));
  }
  keep(-1, missingFindings(said, content));
  return out;
}

/**
 * `content` with `finding`'s rewrite applied to its span — `after` is the
 * visitor's edit of the suggested rewrite (defaults to the suggestion). Null
 * when there is no rewrite, the edit is empty, or the line changed since the
 * finding was made.
 */
export function applyFindingRewrite(
  content: ResumeContent,
  finding: PageFinding,
  after: string = finding.rewrite?.after ?? "",
): ResumeContent | null {
  const { rewrite, anchor } = finding;
  const text = after.trim();
  if (!rewrite || !text) return null;
  const current = readAt(content, anchor.path);
  if (current !== anchor.text) return null;
  let tail = anchor.text.slice(anchor.end);
  // The rewrite brings its own full stop.
  if (/^[.!?]/.test(tail) && /[.!?]$/.test(text)) tail = tail.slice(1);
  return writeAt(content, anchor.path, `${anchor.text.slice(0, anchor.start)}${text}${tail}`);
}
