#!/usr/bin/env node
/**
 * Test discoverer + runner. Replaces a hand-maintained glob list in
 * package.json (gap #1617) — the old form missed `__tests__/` dirs in
 * `domains/`, `middleware/`, `repositories/`, `handlers/`,
 * `services/articles|interview|scorecards/`, plus `__testing__/` under
 * `handlers/`. Now we walk the tree once and pass every match to
 * `node --test`, so adding a new `__tests__/` dir is a no-op.
 */

import { readdirSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");

const TEST_DIR_NAMES = new Set(["__tests__", "__testing__"]);
const TEST_FILE_RE = /\.test\.(ts|mjs|js)$/;

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".wrangler") continue;
      yield* walk(path);
    } else if (entry.isFile() && TEST_FILE_RE.test(entry.name)) {
      // Match the historical scope: include files only when they sit
      // inside a known test dir, OR when they are `scripts/*.test.mjs`.
      const parent = path.split(/[\\/]/).slice(-2, -1)[0];
      const isScriptsTest = path.includes(`${ROOT}\\scripts\\`) || path.includes(`${ROOT}/scripts/`);
      if (TEST_DIR_NAMES.has(parent) || isScriptsTest) {
        yield path;
      }
    }
  }
}

const targets = [];
for (const root of [join(ROOT, "src"), join(ROOT, "scripts"), join(ROOT, "..", "shared", "__tests__")]) {
  for (const file of walk(root)) targets.push(file);
}

if (targets.length === 0) {
  console.error("[run-tests] No test files discovered.");
  process.exit(1);
}

console.log(`[run-tests] Discovered ${targets.length} test files. Invoking node --test.`);
for (const t of targets) console.log("  -", relative(ROOT, t));

const child = spawn(
  process.execPath,
  ["--import", "tsx", "--test", ...targets],
  // NODE_ENV=test opts the suite out of production behaviour in
  // utils/runtime-env.ts (which otherwise fails closed to "production"
  // and would make getJwtSecret() throw for tests that never set a secret).
  { stdio: "inherit", cwd: ROOT, env: { ...process.env, NODE_ENV: process.env.NODE_ENV ?? "test" } },
);
child.on("exit", (code) => process.exit(code ?? 1));
