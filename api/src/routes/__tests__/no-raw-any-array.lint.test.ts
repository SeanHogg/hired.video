/**
 * Source-level lint test: ensure nobody re-introduces the
 * `sql`= ANY(${jsArray})` anti-pattern.
 *
 * Background — this exact pattern broke /api/workspaces with
 *   `op ANY/ALL (array) requires array on right side`
 * because the worker pg driver doesn't coerce JS arrays into Postgres
 * arrays the way node-postgres does locally. Five separate routes had
 * copy-pasted the form before it was caught (workspaces, advertising,
 * phone × 2, services). Drizzle's `inArray(col, array)` is the canonical
 * replacement and binds correctly under every supported driver.
 *
 * This test mirrors the eslint.config.js `no-restricted-syntax` rule but
 * runs inside the existing `node --test` suite so it catches the
 * anti-pattern even before `npm install` of the ESLint deps.
 *
 * Run: node --import tsx --test src/routes/__tests__/no-raw-any-array.lint.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(__dirname, "../../"); // api/src

// Match `sql\`...= ANY(${...})\`` — the exact form that fails under the
// worker pg driver. Permissive on whitespace; strict on the tagged-template
// boundary so we don't false-positive on raw SQL strings inside doc/migrations.
//   - `sql` tag, then a backtick (or whitespace then backtick)
//   - any chars (incl. newlines), lazy
//   - `= ANY(` or `= ALL(` followed by `${`
const RAW_ANY_PATTERN = /\bsql`[\s\S]*?=\s*(?:ANY|ALL)\s*\(\s*\$\{/;

async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      // Skip test files: SQL-shape tests intentionally reference the broken
      // form to document the regression boundary. Production code is what
      // matters here.
      if (entry.name.endsWith(".test.ts")) continue;
      yield full;
    }
  }
}

async function findOffenders(): Promise<{ file: string; line: number; snippet: string }[]> {
  const offenders: { file: string; line: number; snippet: string }[] = [];
  for await (const file of walk(SRC_ROOT)) {
    const text = await readFile(file, "utf8");
    if (!RAW_ANY_PATTERN.test(text)) continue;
    // Re-scan line by line to give a useful failure message.
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      // Multi-line templates: also check a small window so a hit that spans
      // two lines (the tag on one, the ANY( on the next) still surfaces.
      const window = lines.slice(i, i + 3).join("\n");
      if (RAW_ANY_PATTERN.test(window)) {
        offenders.push({ file: path.relative(SRC_ROOT, file), line: i + 1, snippet: lines[i].trim() });
        break;
      }
    }
  }
  return offenders;
}

describe("no raw `sql\\`= ANY(${array})\\`` in api/src", () => {
  it("the pattern recogniser catches the historical buggy form", () => {
    // Self-test the regex so a future tweak doesn't silently neuter it.
    const buggy = "const q = sql`${col} = ANY(${ids})`;";
    const fixed = "const q = inArray(col, ids);";
    assert.match(buggy, RAW_ANY_PATTERN);
    assert.doesNotMatch(fixed, RAW_ANY_PATTERN);
  });

  it("no source file under api/src uses the anti-pattern", async () => {
    const offenders = await findOffenders();
    if (offenders.length > 0) {
      const formatted = offenders
        .map((o) => `  ${o.file}:${o.line}  ${o.snippet}`)
        .join("\n");
      assert.fail(
        "Found banned `sql\\`= ANY(${array})\\`` patterns — replace with " +
          "Drizzle's `inArray(col, array)`:\n" +
          formatted,
      );
    }
  });
});
