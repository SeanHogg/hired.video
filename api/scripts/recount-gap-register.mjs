/**
 * Section-scoped recount for the Consolidated Gap Register totals. Gap #791.
 *
 * The register totals line ("795 active — … plus 469 Done …") is
 * hand-maintained across many concurrent multi-session edits and drifts from
 * the real rows (verified 2026-06-14: the prose claimed 469 Done / 795 active
 * while the live rows were 462 Done / 793 active). A naive
 * `grep -cE '^\| [0-9]+ \|' README.md` over-counts because the file holds
 * OTHER `| N |` tables (API inventory, localization catalog, capability
 * assessment) outside the register.
 *
 * This script scopes STRICTLY to the lines between the
 * `## Consolidated Gap Register` heading and the next `## ` heading (or EOF —
 * the register is currently the final section), tallies the status vocabulary,
 * detects the duplicate gap IDs that concurrent edits introduce (gap #2009),
 * and maintains a machine-written totals block so the number can never silently
 * drift again.
 *
 * Modes:
 *   (default)   print the report to stdout; exit 0.
 *   --write     upsert the `<!-- gap-register-totals -->` block in README.md
 *               with the freshly computed totals; exit 0.
 *   --check     recompute and verify the block is present AND current; exit 1
 *               (with a diff) if it is missing or stale. Wired into CI so the
 *               register totals stay honest across multi-session edits.
 *
 * Pure node: no dependencies, runnable from any cwd (paths resolve off the
 * script location, not the working directory).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
// api/scripts/ -> api/ -> hired.video/README.md
const README_PATH = join(SCRIPT_DIR, "..", "..", "README.md");

const SECTION_HEADING = "## Consolidated Gap Register";
const BLOCK_START = "<!-- gap-register-totals:START -->";
const BLOCK_END = "<!-- gap-register-totals:END -->";

/**
 * The four-state vocabulary from the register legend, plus the two archival
 * states the live rows actually use (Wontfix / Removed). Ordered for the
 * printed breakdown. `emoji` is matched with startsWith against the trimmed
 * status cell — `⚠️` is a two-codepoint sequence (U+26A0 U+FE0F) so we match
 * the base `⚠`.
 */
const STATUSES = [
  { key: "Open", emoji: "🔲" },
  { key: "Partial", emoji: "⚠" },
  { key: "Done", emoji: "✅" },
  { key: "Removed", emoji: "⛔" },
  { key: "Wontfix", emoji: "🟪" },
];

/** Extract the register section lines (heading exclusive, end exclusive). */
export function sectionLines(allLines) {
  const startIdx = allLines.findIndex((l) => l.startsWith(SECTION_HEADING));
  if (startIdx === -1) {
    throw new Error(`Could not find "${SECTION_HEADING}" heading in README.md`);
  }
  let endIdx = allLines.length;
  for (let i = startIdx + 1; i < allLines.length; i++) {
    if (allLines[i].startsWith("## ")) {
      endIdx = i;
      break;
    }
  }
  return { startIdx, endIdx, lines: allLines.slice(startIdx + 1, endIdx) };
}

/** Classify a gap-register table row. Returns { id, status } or null. */
export function parseRow(line) {
  // A gap row is `| <digits> | … | <status cell> | …`. The leading-digits guard
  // skips the `| # | Status |` header, `|---|` separators, and the many
  // non-gap `| label | value |` rows elsewhere in the file. Since the
  // 2026-06-20 re-tier-by-track pass the schema is `| # | Rev | Status | … |`
  // (Rev = the old revenue tier, T1–T4), so the status no longer sits in a
  // fixed column. We scan the first few cells and take the first one that
  // begins with a status glyph — backward-compatible with the old
  // `| # | Status | … |` layout where status was cell 2.
  const m = line.match(/^\|\s*(\d+)\s*\|/u);
  if (!m) return null;
  const id = Number(m[1]);
  const cells = line.slice(m[0].length).split("|").map((c) => c.trim());
  for (const cell of cells.slice(0, 3)) {
    const status = STATUSES.find((s) => cell.startsWith(s.emoji));
    if (status) return { id, status: status.key };
  }
  return null;
}

export function tally(lines) {
  const counts = Object.fromEntries(STATUSES.map((s) => [s.key, 0]));
  const idSeen = new Map();
  let rows = 0;
  for (const line of lines) {
    const row = parseRow(line);
    if (!row) continue;
    rows++;
    counts[row.status]++;
    idSeen.set(row.id, (idSeen.get(row.id) ?? 0) + 1);
  }
  const duplicates = [...idSeen.entries()]
    .filter(([, n]) => n > 1)
    .map(([id, n]) => ({ id, count: n }))
    .sort((a, b) => a.id - b.id);
  const active = counts.Open + counts.Partial;
  return { counts, rows, active, duplicates };
}

/** The canonical one-line totals string the block + report share. */
export function totalsLine(t) {
  const breakdown = STATUSES.map((s) => `${t.counts[s.key]} ${s.key}`).join(" · ");
  return (
    `${t.active} active — ${breakdown} · ${t.rows} rows · ` +
    `${t.duplicates.length} duplicate id(s)`
  );
}

export function blockText(t) {
  return [
    BLOCK_START,
    "<!-- AUTO-GENERATED by api/scripts/recount-gap-register.mjs — run `--write` to refresh; do not hand-edit. -->",
    `**Automated register totals:** ${totalsLine(t)}`,
    BLOCK_END,
  ].join("\n");
}

function readReadme() {
  const raw = readFileSync(README_PATH, "utf8");
  return { raw, lines: raw.split("\n") };
}

/** Return README content with the totals block upserted under the heading. */
export function withBlock(raw, t) {
  const block = blockText(t);
  if (raw.includes(BLOCK_START) && raw.includes(BLOCK_END)) {
    const re = new RegExp(
      `${escapeRe(BLOCK_START)}[\\s\\S]*?${escapeRe(BLOCK_END)}`,
    );
    return raw.replace(re, block);
  }
  // Insert immediately after the heading line (append-only, no reorder).
  const lines = raw.split("\n");
  const headingIdx = lines.findIndex((l) => l.startsWith(SECTION_HEADING));
  lines.splice(headingIdx + 1, 0, "", block);
  return lines.join("\n");
}

export function currentBlock(raw) {
  const re = new RegExp(
    `${escapeRe(BLOCK_START)}[\\s\\S]*?${escapeRe(BLOCK_END)}`,
  );
  const m = raw.match(re);
  return m ? m[0] : null;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function printReport(t) {
  console.log("Consolidated Gap Register — recount");
  console.log("-----------------------------------");
  console.log(totalsLine(t));
  console.log("");
  for (const s of STATUSES) console.log(`  ${s.key.padEnd(8)} ${t.counts[s.key]}`);
  console.log(`  ${"rows".padEnd(8)} ${t.rows}`);
  if (t.duplicates.length) {
    console.log("");
    console.log(`  ⚠ ${t.duplicates.length} duplicate gap id(s) (gap #2009):`);
    for (const d of t.duplicates) console.log(`      #${d.id} ×${d.count}`);
  }
}

function main() {
  const mode = process.argv.includes("--write")
    ? "write"
    : process.argv.includes("--check")
      ? "check"
      : "report";

  const { raw, lines } = readReadme();
  const { lines: section } = sectionLines(lines);
  const t = tally(section);

  if (mode === "report") {
    printReport(t);
    return;
  }

  if (mode === "write") {
    const next = withBlock(raw, t);
    if (next !== raw) {
      writeFileSync(README_PATH, next);
      console.log("✓ wrote totals block:");
    } else {
      console.log("✓ totals block already current:");
    }
    console.log(`  ${totalsLine(t)}`);
    return;
  }

  // mode === "check"
  const want = blockText(t);
  const have = currentBlock(raw);
  if (have === null) {
    console.error(
      "✗ gap-register totals block is missing. Run:\n" +
        "    node api/scripts/recount-gap-register.mjs --write",
    );
    process.exit(1);
  }
  if (have.trim() !== want.trim()) {
    console.error("✗ gap-register totals are stale.");
    console.error(`  in README: ${blockSummary(have)}`);
    console.error(`  actual   : ${totalsLine(t)}`);
    console.error("  Run: node api/scripts/recount-gap-register.mjs --write");
    process.exit(1);
  }
  console.log(`✓ gap-register totals current: ${totalsLine(t)}`);
}

/** Pull the human-readable totals line out of an existing block for the diff. */
function blockSummary(block) {
  const m = block.match(/\*\*Automated register totals:\*\*\s*(.+)/);
  return m ? m[1].trim() : "(unparseable block)";
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
