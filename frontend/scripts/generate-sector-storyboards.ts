#!/usr/bin/env tsx
/**
 * Sector-specific resume storyboard generator (#1167).
 *
 * Reads the renderer from `shared/sector-storyboard-templates.ts` and
 * writes one VideoScript JSON per recruitable sector to
 * `frontend/data/templates/`. Idempotent — re-running overwrites the
 * generated files.
 *
 * Run:
 *   npx tsx frontend/scripts/generate-sector-storyboards.ts
 *
 * The .mjs wrapper alongside this file invokes tsx so the build pipeline
 * doesn't need its own TypeScript setup.
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import { allGeneratedStoryboards } from "../../shared/sector-storyboard-templates.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const outDir = resolve(__dirname, "..", "data", "templates");

mkdirSync(outDir, { recursive: true });

let written = 0;
for (const { sector, filename, storyboard } of allGeneratedStoryboards()) {
  const filePath = resolve(outDir, `${filename}.json`);
  writeFileSync(filePath, JSON.stringify(storyboard, null, 2) + "\n", "utf8");
  written += 1;
  // eslint-disable-next-line no-console
  console.log(`[gen] ${sector} → ${filename}.json`);
}

// eslint-disable-next-line no-console
console.log(`[gen] Wrote ${written} sector storyboards to ${outDir}`);
