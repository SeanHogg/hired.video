/**
 * Push the OAuth / auth / vendor secrets from api/.env into the deployed
 * `hired-api` Worker.
 *
 * Why this exists:
 *   Cloudflare secrets are ACCOUNT-scoped, not worker-scoped — they do not
 *   travel with a worker when it is redeployed under a different account.
 *   The 2026-10-03 redeploy moved `hired-api` (and the api.hired.video route)
 *   into the Fixfasterllc account, which carried over only the 4 DB secrets.
 *   Every provider login then 503'd at routes/oauth.ts (`!cfg.clientId()`),
 *   because GOOGLE/LINKEDIN/GITHUB/MICROSOFT_CLIENT_ID were simply absent.
 *   Cloudflare never discloses a secret's value back, so the old account
 *   cannot be used as the source — api/.env is.
 *
 * Contract:
 *   • SYNCED_SECRETS is the allowlist and the whole story: only these names
 *     are read from .env and only these are pushed. Adding a secret means
 *     adding a NAME to that list, never a branch below.
 *   • SHADOWS_WRANGLER_VARS names keys that must NEVER become secrets. A
 *     Worker secret silently overrides the same-named `[vars]` entry in
 *     wrangler.toml, so pushing a dev FRONTEND_URL would repoint production
 *     at localhost. These are refused even if listed by mistake.
 *   • Values are never printed, logged or persisted anywhere but the
 *     short-lived 0600 temp file `wrangler secret bulk` consumes, which is
 *     removed in a finally block.
 *   • Re-running is safe: `secret bulk` is an upsert, so this is idempotent.
 *
 * Usage:
 *   node scripts/sync-worker-secrets.mjs --dry-run     # report, push nothing
 *   node scripts/sync-worker-secrets.mjs               # push
 *   node scripts/sync-worker-secrets.mjs --account <id> --worker hired-api
 */

import { spawnSync } from "node:child_process";
import { argv, env, platform } from "node:process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Cloudflare account that now owns `hired-api` + the api.hired.video route. */
export const DEFAULT_ACCOUNT_ID = "649c6cbf254539f87f0692327f20e223";

export const DEFAULT_WORKER = "hired-api";

/**
 * The secrets to copy from .env, grouped only for readability — the list is
 * flat data. Every name here was present on the pre-migration worker, so
 * nothing in this list is a guess about what production expects.
 */
export const SYNCED_SECRETS = Object.freeze([
  // Social login — the four providers in routes/oauth.ts PROVIDERS.
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "LINKEDIN_CLIENT_ID",
  "LINKEDIN_CLIENT_SECRET",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "MICROSOFT_CLIENT_ID",
  "MICROSOFT_CLIENT_SECRET",
  // Session signing + the base used to build OAuth callback URLs.
  "JWT_SECRET",
  "API_URL",
  // Transactional email.
  "EMAIL_CLIENTID",
  "EMAIL_SECRET",
  // LLM + publishing vendors.
  "OPENROUTER_API_KEY",
]);

/**
 * Keys that exist as plain `[vars]` in wrangler.toml. A secret of the same
 * name takes precedence over the var, so pushing one from a dev .env would
 * quietly break production. Never sync these.
 */
export const SHADOWS_WRANGLER_VARS = Object.freeze([
  "FRONTEND_URL",
  "BASE_URL",
  "VITE_API_URL",
]);

/**
 * Secrets the old worker had that api/.env does NOT carry. They cannot be
 * recovered from Cloudflare, so they are reported for a manual
 * `wrangler secret put` rather than silently dropped.
 */
export const NOT_IN_ENV = Object.freeze([
  "TURNSTILE_SECRET_KEY",
  "HELCIM_API_TOKEN",
  "HELCIM_JS_SECRET",
  "HELCIM_JS_TOKEN",
  "MAPBOX_TOKEN",
  "CEREBRAS_API_KEY",
  "OLLAMA_API_KEY",
  "PEXELS_API_KEY",
  "PIXABAY_API_KEY",
  "UNSPLASH_ACCESS_KEY",
  "GOOGLE_API_KEY",
  "ADSENSE_PUBLISHER_ID",
  "BUILDERFORCE_BASE_URL",
  "API_USER_ID",
]);

/** A value matching any of these is a dev placeholder, not a prod secret. */
// `^[.\s…*-]+$` catches elided values like "..." / "***" — that one shipped
// YOUTUBE_CLIENT_ID="..." to prod on 2026-10-03 (Google: 401 invalid_client).
const PLACEHOLDER = /localhost|127\.0\.0\.1|0\.0\.0\.0|\bexample\b|changeme|^your[-_]|^<.*>$|^(todo|tbd|xxx+)$|^[.\s…*-]+$/i;

/**
 * Minimal dotenv parse: `KEY=value`, optional `export ` prefix, optional
 * single/double quotes, `#` comments and blank lines ignored. Deliberately
 * not a dependency — this runs before anything is installed in CI.
 */
export function parseEnvFile(text) {
  const out = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    const quoted = /^(['"])([\s\S]*)\1$/.exec(value);
    if (quoted) value = quoted[2];
    else value = value.replace(/\s+#.*$/, "").trim();
    out.set(m[1], value);
  }
  return out;
}

/**
 * Split the allowlist against what .env actually holds. Returns names only —
 * `ready` carries values because the caller must write them to the bulk file,
 * and nothing else may read it.
 */
export function classify(envMap) {
  const ready = new Map();
  const absent = [];
  const placeholder = [];
  const refused = [];

  for (const name of SYNCED_SECRETS) {
    if (SHADOWS_WRANGLER_VARS.includes(name)) {
      refused.push(name);
      continue;
    }
    const value = envMap.get(name);
    if (!value) {
      absent.push(name);
      continue;
    }
    if (PLACEHOLDER.test(value)) {
      placeholder.push(name);
      continue;
    }
    ready.set(name, value);
  }
  return { ready, absent, placeholder, refused };
}

/** API_URL builds the OAuth callback URLs, so a wrong host breaks every login. */
function warnOnApiUrl(ready) {
  const value = ready.get("API_URL");
  if (!value) return;
  let host;
  try {
    host = new URL(value).host;
  } catch {
    console.warn(`  ! API_URL is not a valid URL — logins will build broken callbacks`);
    return;
  }
  if (host !== "api.hired.video") {
    console.warn(`  ! API_URL host is "${host}", expected "api.hired.video"`);
  }
}

function flag(name) {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? undefined : argv[i + 1];
}

function main() {
  const dryRun = argv.includes("--dry-run");
  const worker = flag("worker") ?? DEFAULT_WORKER;
  const accountId = flag("account") ?? env.CLOUDFLARE_ACCOUNT_ID ?? DEFAULT_ACCOUNT_ID;
  const envPath = path.resolve(flag("env-file") ?? ".env");

  if (!fs.existsSync(envPath)) {
    console.error(`No env file at ${envPath} — run this from hired.video/api`);
    process.exit(1);
  }

  const { ready, absent, placeholder, refused } = classify(parseEnvFile(fs.readFileSync(envPath, "utf8")));

  console.log(`Worker : ${worker}`);
  console.log(`Account: ${accountId}`);
  console.log(`Source : ${envPath}\n`);

  console.log(`Ready to push (${ready.size}):`);
  for (const [name, value] of ready) console.log(`  + ${name} (${value.length} chars)`);
  warnOnApiUrl(ready);

  if (placeholder.length) {
    console.log(`\nSkipped — value looks like a dev placeholder (${placeholder.length}):`);
    for (const name of placeholder) console.log(`  ~ ${name}`);
  }
  if (absent.length) {
    console.log(`\nSkipped — not set in env file (${absent.length}):`);
    for (const name of absent) console.log(`  - ${name}`);
  }
  if (refused.length) {
    console.log(`\nRefused — would shadow a wrangler.toml [vars] entry (${refused.length}):`);
    for (const name of refused) console.log(`  x ${name}`);
  }

  console.log(`\nStill missing after this run — not in the env file, set by hand (${NOT_IN_ENV.length}):`);
  for (const name of NOT_IN_ENV) console.log(`  ? ${name}`);
  console.log(`      npx wrangler secret put <NAME> --name ${worker}`);

  if (!ready.size) {
    console.log("\nNothing to push.");
    return;
  }
  if (dryRun) {
    console.log("\n--dry-run: nothing pushed.");
    return;
  }

  // `secret bulk` takes a JSON file. Keep it 0600, in the OS temp dir (never
  // the repo, so a crash can't leave secrets next to tracked files), and
  // remove it whatever happens.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hired-secrets-"));
  const file = path.join(dir, "bulk.json");
  try {
    fs.writeFileSync(file, JSON.stringify(Object.fromEntries(ready)), { mode: 0o600 });
    const npx = platform === "win32" ? "npx.cmd" : "npx";
    console.log(`\nPushing ${ready.size} secrets...`);
    const run = spawnSync(`${npx} wrangler secret bulk "${file}" --name ${worker}`, {
      stdio: "inherit",
      shell: true,
      env: { ...env, CLOUDFLARE_ACCOUNT_ID: accountId },
    });
    if (run.status !== 0) {
      console.error(`\nwrangler exited ${run.status}. Secrets may be partially applied — re-run to finish.`);
      process.exit(run.status ?? 1);
    }
    console.log(`\nDone. Secrets apply immediately — no redeploy needed.`);
    console.log(`Verify: npx wrangler secret list --name ${worker}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Only auto-run when invoked directly — importing this module for tests must
// not read .env or reach Cloudflare.
if (fileURLToPath(import.meta.url) === argv[1]) {
  main();
}
