#!/usr/bin/env node
// Gap #2251. Gap IDs are globally unique across ROADMAP.md + DONE.md: a row's
// leading `| <id> |` cell may appear once. Parallel edits kept reusing IDs, so
// this fails on any duplicate and names the files + lines. Both files are
// gitignored (local-only), so a missing file is skipped. Run it locally.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = ["ROADMAP.md", "DONE.md"];
const ROW_ID = /^\| (\d{3,5}) \|/;

const seen = new Map();
for (const file of FILES) {
  if (!existsSync(join(root, file))) continue;
  readFileSync(join(root, file), "utf8")
    .split("\n")
    .forEach((line, i) => {
      const id = ROW_ID.exec(line)?.[1];
      if (!id) return;
      const at = `${file}:${i + 1}`;
      seen.set(id, [...(seen.get(id) ?? []), at]);
    });
}

const dupes = [...seen].filter(([, at]) => at.length > 1);
if (dupes.length) {
  for (const [id, at] of dupes) console.error(`Duplicate gap ID #${id}: ${at.join(", ")}`);
  console.error(`\n${dupes.length} duplicate gap ID(s). Renumber the newer row to the next free ID (> #${Math.max(...[...seen.keys()].map(Number))}).`);
  process.exit(1);
}
console.log(`Gap IDs unique (${seen.size} rows across ${FILES.join(" + ")}).`);
