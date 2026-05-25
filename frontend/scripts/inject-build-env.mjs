#!/usr/bin/env node

/**
 * Pre-build env injector — assembles `.env.production.local` from a
 * centralized manifest of required VITE_* variables so the Vite build
 * picks them up automatically without devs having to know how Vite's
 * env file precedence works. Runs before `vite build` via the
 * `prebuild` hook in package.json.
 *
 * ─── Why this script exists ──────────────────────────────────────────
 * Cloudflare Pages exposes runtime secrets to Pages Functions (via the
 * `secret_text` binding type) but NOT to the build runner. Vite needs
 * VITE_* env vars at BUILD time — `import.meta.env.X` is replaced
 * literally during `vite build`. So a value stored only as a Pages
 * secret never reaches the bundled JS. The deploy chain (local
 * `npm run deploy` → `wrangler pages deploy dist`) does not get a
 * chance to inject either.
 *
 * This script fills the gap: it reads from the shell environment AND
 * from a gitignored local override file, then writes a Vite-recognised
 * `.env.production.local`. CI sets vars via the shell (per-job env or
 * the platform's secret store); local devs populate
 * `frontend/scripts/.build-env.local.json` once after cloning.
 *
 * ─── Source priority (highest to lowest) ─────────────────────────────
 *   1. process.env.<VAR>                       — CI / explicit export
 *   2. scripts/.build-env.local.json[<VAR>]    — local dev override
 *   3. (none)                                  — logs a warning;
 *                                                build proceeds with
 *                                                the var unset. The
 *                                                runtime gracefully
 *                                                degrades for every var
 *                                                listed here (Turnstile
 *                                                hides the widget +
 *                                                backend soft-signals
 *                                                via gap #1122).
 *
 * Strict mode (`BUILD_ENV_STRICT=1`) flips missing vars from warning
 * into fail. Use in CI to gate releases that MUST have full config.
 *
 * To add a new managed variable, append to REQUIRED_VARS below and
 * document why it's needed in the description field. Centralising the
 * manifest is the DRY anchor — no scattered `process.env.FOO ?? ""`
 * fallbacks across consumers.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FRONTEND_DIR = path.resolve(__dirname, '..');
const LOCAL_OVERRIDES_PATH = path.join(__dirname, '.build-env.local.json');
const OUTPUT_PATH = path.join(FRONTEND_DIR, '.env.production.local');

/** The full manifest of build-time env vars this app expects. Every
 *  entry must include a name, a short reason, and a "missing impact"
 *  line so consumers + the warning output stay actionable. */
const REQUIRED_VARS = [
  {
    name: 'VITE_TURNSTILE_SITE_KEY',
    reason: 'Cloudflare Turnstile public site key — paired with the API\'s TURNSTILE_SECRET_KEY to gate every unauthenticated entry form (Login / Forgot Password / Magic Link / Signup / Affiliate).',
    missingImpact: 'Captcha widget will not render; the backend soft-signal path (gap #1122) will allow signup/login/forgot-password/magic-link to proceed but every request will record a TURNSTILE_FAIL bot_block_event for the SuperAdmin globe.',
  },
];

function readLocalOverrides() {
  if (!fs.existsSync(LOCAL_OVERRIDES_PATH)) return {};
  try {
    const raw = fs.readFileSync(LOCAL_OVERRIDES_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`[inject-build-env] ⚠️  Failed to parse ${LOCAL_OVERRIDES_PATH} — ignoring. ${err.message}`);
    return {};
  }
}

function resolveValue(name, overrides) {
  if (process.env[name] !== undefined && process.env[name] !== '') {
    return { value: process.env[name], source: 'process.env' };
  }
  if (overrides[name] !== undefined && overrides[name] !== '') {
    return { value: overrides[name], source: '.build-env.local.json' };
  }
  return { value: null, source: null };
}

function main() {
  const overrides = readLocalOverrides();
  const strict = process.env.BUILD_ENV_STRICT === '1';
  const resolved = [];
  const missing = [];

  for (const spec of REQUIRED_VARS) {
    const { value, source } = resolveValue(spec.name, overrides);
    if (value === null) {
      missing.push(spec);
      console.warn(`[inject-build-env] ⚠️  ${spec.name} not set in process.env OR ${path.basename(LOCAL_OVERRIDES_PATH)} — ${spec.missingImpact}`);
    } else {
      resolved.push({ ...spec, value, source });
      console.log(`[inject-build-env] ✅ ${spec.name} resolved from ${source}`);
    }
  }

  if (missing.length > 0 && strict) {
    console.error(`[inject-build-env] ❌ BUILD_ENV_STRICT=1 set and ${missing.length} required var(s) missing — aborting build.`);
    console.error('    Either export the var(s) in the shell, populate scripts/.build-env.local.json, or unset BUILD_ENV_STRICT to allow soft-fail.');
    process.exit(1);
  }

  // Write the file even when empty so any prior stale .env.production.local
  // doesn't leak old values into this build. Vite reads files in order:
  // .env.production.local > .env.production > .env.local > .env, so this
  // overrides whatever's in committed .env files.
  const lines = [
    '# AUTO-GENERATED by frontend/scripts/inject-build-env.mjs — DO NOT EDIT BY HAND.',
    '# Source of truth for these values: see scripts/inject-build-env.mjs REQUIRED_VARS,',
    '# the shell environment, or scripts/.build-env.local.json (gitignored local override).',
    `# Generated at: ${new Date().toISOString()}`,
    '',
    ...resolved.map((r) => `${r.name}=${r.value}`),
  ];
  fs.writeFileSync(OUTPUT_PATH, lines.join('\n') + '\n', 'utf8');
  console.log(`[inject-build-env] ✅ Wrote ${OUTPUT_PATH} (${resolved.length}/${REQUIRED_VARS.length} vars resolved)`);
}

main();
