#!/usr/bin/env node
/**
 * i18n coverage assessment.
 *
 * For every .tsx file under pages/ (and, with --components, components/),
 * estimate how much user-facing copy is localized:
 *
 *   coverage% = t_calls / (t_calls + hardcoded_strings)
 *
 * "hardcoded_strings" is a heuristic count of user-facing literals:
 *   - JSX text nodes containing real words
 *   - string literals in user-facing attributes (placeholder / title /
 *     aria-label / alt / label / heading / description / cta…)
 *   - toast / alert / confirm message string literals
 *
 * It deliberately ERRS TOWARD over-counting hardcoded text (so a page only
 * reads 100% when it genuinely has no stray literals). It is a ranking +
 * triage tool, not a compiler — treat the numbers as ±a few.
 *
 * Usage:
 *   node scripts/i18n-coverage.cjs              # pages only, table to stdout
 *   node scripts/i18n-coverage.cjs --components # include components/
 *   node scripts/i18n-coverage.cjs --json       # machine-readable
 *   node scripts/i18n-coverage.cjs --md         # markdown table (README)
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const INCLUDE_COMPONENTS = args.includes("--components");
const AS_JSON = args.includes("--json");
const AS_MD = args.includes("--md");
// Staff-only surfaces are English-by-policy (gap #634) — excluded from the
// localization target unless --staff is passed.
const INCLUDE_STAFF = args.includes("--staff");
const isStaff = (rel) => /\/(admin|superadmin)\//.test(rel) || /^pages\/(admin|superadmin)\//.test(rel);

/** Recursively collect .tsx files under a dir. */
function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.name.endsWith(".tsx")) acc.push(full);
  }
  return acc;
}

// User-facing attributes whose string-literal values are visible copy.
const UI_ATTRS = [
  "placeholder",
  "title",
  "aria-label",
  "alt",
  "label",
  "heading",
  "subtitle",
  "description",
  "cta",
  "ctaLabel",
  "emptyText",
  "tooltip",
  "confirmText",
  "cancelText",
];

// Toast/alert/confirm-style call names that take a user-facing message.
const MSG_CALLS = [
  "toast",
  "toast.success",
  "toast.error",
  "toast.info",
  "toast.warning",
  "alert",
  "confirm",
];

// Strings to ignore even inside UI contexts (not real copy).
function isNoise(s) {
  const t = s.trim();
  if (t.length < 2) return true;
  if (!/[A-Za-z]/.test(t)) return true; // no letters → punctuation/number
  if (!/[A-Za-z]{2,}/.test(t)) return true; // no 2+ letter word
  // Single lowercase token that looks like a CSS/identifier/enum value.
  if (/^[a-z][a-zA-Z0-9_-]*$/.test(t) && !t.includes(" ")) return true;
  // className-ish: contains tailwind tokens
  if (/\b(?:flex|grid|text-|bg-|border|rounded|px-|py-|gap-|w-|h-|mt-|mb-)/.test(t))
    return true;
  // URLs / paths / mime / template-ish
  if (/^(https?:|\/|#|mailto:|tel:)/.test(t)) return true;
  if (/^[a-z]+\/[a-z]+/.test(t)) return true; // mime e.g. image/png
  // Pure interpolation / expression remnants
  if (/^[{}$]/.test(t)) return true;
  return false;
}

function analyze(file) {
  const src = fs.readFileSync(file, "utf8");

  // Count t() calls (react-i18next) + <Trans> usage.
  const tCalls = (src.match(/\bt\(\s*["'`]/g) || []).length;
  const transTags = (src.match(/<Trans[\s>]/g) || []).length;
  const localized = tCalls + transTags;

  // Strip comments + import lines to reduce false positives.
  const cleaned = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/[^\n]*/g, "$1")
    .split("\n")
    .filter((l) => !/^\s*import\s/.test(l))
    .join("\n");

  let hardcoded = 0;
  const samples = [];

  // 1) JSX text nodes: >text<  (no tags/braces inside)
  const jsxText = cleaned.match(/>\s*([^<>{}\n][^<>{}]*?)\s*</g) || [];
  for (const m of jsxText) {
    const inner = m.slice(1, -1).trim();
    if (!isNoise(inner)) {
      hardcoded++;
      if (samples.length < 4) samples.push(inner.slice(0, 50));
    }
  }

  // 2) UI attribute string literals
  for (const attr of UI_ATTRS) {
    const re = new RegExp(`\\b${attr}\\s*=\\s*"([^"]+)"`, "g");
    let mm;
    while ((mm = re.exec(cleaned))) {
      const val = mm[1];
      if (!isNoise(val) && !val.includes("{")) {
        hardcoded++;
        if (samples.length < 4) samples.push(`[${attr}] ${val.slice(0, 40)}`);
      }
    }
  }

  // 3) toast/alert/confirm("literal")
  for (const fn of MSG_CALLS) {
    const re = new RegExp(
      `${fn.replace(".", "\\.")}\\s*\\(\\s*["'\`]([^"'\`]{3,})["'\`]`,
      "g",
    );
    let mm;
    while ((mm = re.exec(cleaned))) {
      if (!isNoise(mm[1])) {
        hardcoded++;
        if (samples.length < 4) samples.push(`[msg] ${mm[1].slice(0, 40)}`);
      }
    }
  }

  const total = localized + hardcoded;
  const coverage = total === 0 ? 100 : Math.round((localized / total) * 100);
  return { file, localized, hardcoded, coverage, samples };
}

const dirs = [path.join(ROOT, "pages")];
if (INCLUDE_COMPONENTS) dirs.push(path.join(ROOT, "components"));

const files = dirs.flatMap((d) => walk(d));
const rows = files
  .map(analyze)
  .map((r) => ({ ...r, rel: path.relative(ROOT, r.file).replace(/\\/g, "/") }))
  // Skip files with no user-facing copy at all (pure logic/layout).
  .filter((r) => r.localized + r.hardcoded > 0)
  // Drop staff-only surfaces unless explicitly requested.
  .filter((r) => INCLUDE_STAFF || !isStaff(r.rel));

// Sort: most hardcoded first (highest leverage), then lowest coverage.
rows.sort((a, b) => b.hardcoded - a.hardcoded || a.coverage - b.coverage);

const totalLoc = rows.reduce((s, r) => s + r.localized, 0);
const totalHard = rows.reduce((s, r) => s + r.hardcoded, 0);
const overall = Math.round((totalLoc / (totalLoc + totalHard)) * 100);
const fullyDone = rows.filter((r) => r.hardcoded === 0).length;

if (AS_JSON) {
  console.log(
    JSON.stringify(
      { overall, totalLoc, totalHard, fullyDone, files: rows },
      null,
      2,
    ),
  );
  process.exit(0);
}

if (AS_MD) {
  console.log(
    `<!-- generated by scripts/i18n-coverage.cjs — do not hand-edit numbers -->`,
  );
  console.log(
    `**Overall: ${overall}% localized** · ${totalHard} hardcoded strings remaining across ${rows.length} files (${fullyDone} already at 100%). Lower coverage / higher count = higher priority.\n`,
  );
  console.log(`| File | t()+Trans | Hardcoded | Coverage |`);
  console.log(`|------|----------:|----------:|---------:|`);
  for (const r of rows) {
    const flag = r.coverage === 100 ? "✅" : r.coverage >= 70 ? "🟡" : "🔴";
    console.log(
      `| [${r.rel}](hired.video/frontend/${r.rel}) | ${r.localized} | ${r.hardcoded} | ${flag} ${r.coverage}% |`,
    );
  }
  process.exit(0);
}

// Default: human table to stdout.
console.log(
  `Overall ${overall}% localized | ${totalHard} hardcoded across ${rows.length} files | ${fullyDone} at 100%\n`,
);
console.log(
  ["COV%".padStart(5), "HARD".padStart(5), "LOC".padStart(5), "FILE"].join(
    "  ",
  ),
);
for (const r of rows.slice(0, 80)) {
  console.log(
    [
      `${r.coverage}`.padStart(5),
      `${r.hardcoded}`.padStart(5),
      `${r.localized}`.padStart(5),
      r.rel.replace("frontend/", ""),
    ].join("  "),
  );
}
