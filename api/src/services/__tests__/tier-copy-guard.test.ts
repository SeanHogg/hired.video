/**
 * Regression guard — makes another Pro/Premium drift structurally
 * impossible.
 *
 * Walks every tracked source file in the API (`api/src/`), the frontend
 * (`frontend/`), and the shared module (`shared/`), and FAILS if any
 * file contains a standalone `Premium` word literal (capital P, regex
 * `\bPremium\b`) that:
 *
 *   - is NOT inside a comment line
 *   - is NOT in the allowlisted files (`shared/tier-copy.ts` defines
 *     the canonical strings; this guard test file references them)
 *
 * Identifiers that legitimately contain the substring (`isPro`,
 * `requirePro`, `PRO_REQUIRED`, `PREMIUM_MONTHLY_PRICE`,
 * `proGated`, `skillsPremium`) are NOT matched by `\bPremium\b`
 * because `\b` is a word boundary — they're inside longer identifiers.
 *
 * If this test fails, fix it by adding the message you wanted to write
 * to `shared/tier-copy.ts` as a new template, then importing it.
 *
 * Run: node --import tsx --test src/services/__tests__/tier-copy-guard.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Repo root, computed from this file's location:
//   api/src/services/__tests__/tier-copy-guard.test.ts
//   ↑5: __tests__ → services → src → api → repo root.
const REPO_ROOT = join(import.meta.dirname, "..", "..", "..", "..");

const SCAN_ROOTS = [
  join(REPO_ROOT, "api", "src"),
  join(REPO_ROOT, "frontend"),
  join(REPO_ROOT, "shared"),
];

const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  ".wrangler",
  ".next",
  "coverage",
  ".turbo",
]);

/** Files where the literal "Premium" word is *deliberately* allowed. Add
 *  to this list with a one-line reason — it should never be a long list. */
const FILE_ALLOWLIST = new Set<string>([
  // Source of truth — defines all user-visible tier copy.
  "shared/tier-copy.ts",
  // The guard itself talks about the literal it's looking for.
  "api/src/services/__tests__/tier-copy-guard.test.ts",
  // Tier-copy template tests reference the canonical literal strings.
  "api/src/services/__tests__/tier-copy.test.ts",
]);

/** Walk a directory tree and yield every file path with a scannable extension. */
function* walk(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      yield* walk(full);
    } else if (st.isFile()) {
      const dot = name.lastIndexOf(".");
      if (dot >= 0 && SCAN_EXTENSIONS.has(name.slice(dot))) {
        yield full;
      }
    }
  }
}

interface Hit {
  file: string;
  line: number;
  text: string;
}

/** Match standalone capitalized `Premium` only. `\b` boundaries mean
 *  identifiers like `isPro`, `PREMIUM_*`, `proGated` don't fire. */
const PREMIUM_LITERAL = /\bPremium\b/g;

/**
 * Per-line comment-detection. Stateless across lines on purpose —
 * tracking multi-line block comments is unreliable because `/*` shows
 * up inside template literals, regex bodies, and URLs without opening
 * a real comment. We accept a false negative for the rare case of a
 * Premium literal *inside* a multi-line `/* … * /` block comment in
 * exchange for not swallowing real code that lives below an unclosed
 * `/*` lookalike.
 */
function isInsideCommentAt(line: string, matchIndex: number): boolean {
  const trimmed = line.trim();
  if (trimmed.startsWith("*") || trimmed.startsWith("//")) return true;
  const before = line.slice(0, matchIndex);
  const lineCommentOpen = before.indexOf("//");
  if (lineCommentOpen !== -1) return true;
  const blockOpen = before.lastIndexOf("/*");
  if (blockOpen !== -1) {
    const blockCloseAfterOpen = before.indexOf("*/", blockOpen + 2);
    if (blockCloseAfterOpen === -1) return true; // open, never closed before match
  }
  return false;
}

function findHits(filePath: string, repoRelativePath: string): Hit[] {
  const text = readFileSync(filePath, "utf8");
  const hits: Hit[] = [];
  text.split("\n").forEach((rawLine, i) => {
    PREMIUM_LITERAL.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = PREMIUM_LITERAL.exec(rawLine)) !== null) {
      if (isInsideCommentAt(rawLine, m.index)) continue;
      hits.push({ file: repoRelativePath, line: i + 1, text: rawLine.trim() });
      break; // one hit per line is enough for the report
    }
  });
  return hits;
}

describe("Tier-copy guard — no hardcoded Premium literals in user-visible code", () => {
  it("every standalone 'Premium' literal lives in shared/tier-copy.ts (or its tests)", () => {
    const allHits: Hit[] = [];
    for (const root of SCAN_ROOTS) {
      for (const file of walk(root)) {
        const repoRel = relative(REPO_ROOT, file).split("\\").join("/");
        if (FILE_ALLOWLIST.has(repoRel)) continue;
        allHits.push(...findHits(file, repoRel));
      }
    }

    if (allHits.length > 0) {
      const grouped = allHits
        .slice(0, 25)
        .map((h) => `  ${h.file}:${h.line}  →  ${h.text}`)
        .join("\n");
      const more = allHits.length > 25 ? `\n  …and ${allHits.length - 25} more` : "";
      assert.fail(
        `Found ${allHits.length} hardcoded "Premium" literal(s) outside the source-of-truth files.\n` +
        `Add the copy to shared/tier-copy.ts as a new template and import it instead:\n${grouped}${more}`,
      );
    }
  });
});
