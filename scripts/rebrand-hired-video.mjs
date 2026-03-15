import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const allowedExt = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".json",
  ".md",
  ".yml",
  ".yaml",
  ".xml",
  ".toml",
  ".env",
  ".example",
  ".mjs",
  ".txt",
]);

const skipFragments = [
  `${path.sep}node_modules${path.sep}`,
  `${path.sep}dist${path.sep}`,
  `${path.sep}.git${path.sep}`,
  `${path.sep}hired-api${path.sep}`,
  `${path.sep}frontend${path.sep}html${path.sep}assets${path.sep}`,
  `${path.sep}api${path.sep}.wrangler${path.sep}`,
  `${path.sep}.wrangler${path.sep}`,
  `${path.sep}coverage${path.sep}`,
];

const replacements = [
  [/MyVideoResu\.ME/g, "hired.video"],
  [/MyVideoResu\.me/g, "hired.video"],
  [/hired.video/g, "hired.video"],
  [/myvideoresu\.me/g, "hired.video"],
  [/hired.video\.me/g, "hired.video"],
  [/hired-video-company/g, "hired-video-company"],
  [/hired-api/g, "hired-api"],
];

function shouldSkip(filePath) {
  return skipFragments.some((frag) => filePath.includes(frag));
}

function walk(dir, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (shouldSkip(full)) continue;
    if (ent.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (!ent.isFile()) continue;

    const ext = path.extname(ent.name);
    if (!allowedExt.has(ext) && !ent.name.endsWith(".env") && !ent.name.endsWith(".example")) {
      continue;
    }
    out.push(full);
  }
}

const files = [];
walk(root, files);

let updated = 0;
for (const file of files) {
  const original = fs.readFileSync(file, "utf8");
  let next = original;
  for (const [pattern, value] of replacements) {
    next = next.replace(pattern, value);
  }
  if (next !== original) {
    fs.writeFileSync(file, next, "utf8");
    updated += 1;
  }
}

console.log(`Rebrand complete. Updated files: ${updated}`);
