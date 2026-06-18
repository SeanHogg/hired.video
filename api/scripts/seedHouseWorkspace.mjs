/**
 * House workspace seeder (#986).
 *
 * The /superadmin/ads "Internal Growth" page binds a reserved HOUSE user —
 * hired.video's own account that owns the platform's PAID-MEDIA ad
 * connections for growth marketing. Without an explicit house binding the
 * page would fall through to the calling SuperAdmin's PERSONAL ad
 * connections (the #986 bug).
 *
 * This script, run on first boot, idempotently:
 *
 *   1. Creates the reserved house user if absent. If HOUSE_USER_ID is set it
 *      uses that id; otherwise it creates one and PRINTS the id so you can
 *      pin it in the Worker env (HOUSE_USER_ID=...). The user is flagged
 *      is_system = true (editorial / house account) and is_active.
 *
 *   2. Grants every SuperAdmin (or a single SA via --sa=<userId> / the
 *      HOUSE_GRANT_SA env) an ACTIVE workspace_grants row (scope 'studio')
 *      against the house subject, so canActFor() authorizes the delegated
 *      workspace on the SA ads page. The partial unique index
 *      uq_workspace_grants_active makes re-grants a no-op.
 *
 * No 4th workspace kind is introduced — the existing `delegated` kind +
 * canActFor() SSoT (services/studio/workspace.ts) is reused, the same path
 * #975 preserved.
 *
 * Run:
 *   DATABASE_URL=... HOUSE_USER_ID=<uuid> node api/scripts/seedHouseWorkspace.mjs
 *   # or, to mint a fresh id and print it:
 *   DATABASE_URL=... node api/scripts/seedHouseWorkspace.mjs
 *   # grant a single SA only:
 *   DATABASE_URL=... node api/scripts/seedHouseWorkspace.mjs --sa=<userId>
 *
 * Safe to re-run any number of times.
 */

import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";

const HOUSE_EMAIL = "house@hired.video";
const HOUSE_NAME = "hired.video (House)";
const SUPER_ADMIN_ROLE = "super_admin";

function parseArgs() {
  const out = {};
  for (const arg of process.argv.slice(2)) {
    const m = /^--([^=]+)=(.*)$/.exec(arg);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

async function main() {
  const url = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
  if (!url) {
    console.error("[house] DATABASE_URL is not set");
    process.exit(1);
  }
  const sql = neon(url);
  const args = parseArgs();
  const targetSa = args.sa || process.env.HOUSE_GRANT_SA || null;

  // ── 1. Resolve / create the reserved house user. ──────────────────────────
  const envHouseId = process.env.HOUSE_USER_ID || null;
  let houseUserId = null;

  if (envHouseId) {
    const byId = await sql`SELECT id FROM users WHERE id = ${envHouseId} LIMIT 1`;
    if (byId.length > 0) {
      houseUserId = byId[0].id;
      console.log(`[house] House user already exists for HOUSE_USER_ID: ${houseUserId}`);
    }
  }

  if (!houseUserId) {
    // Fall back to the well-known email so re-runs without HOUSE_USER_ID set
    // still converge on a single house account instead of creating dupes.
    const byEmail = await sql`SELECT id FROM users WHERE email = ${HOUSE_EMAIL} LIMIT 1`;
    if (byEmail.length > 0) {
      houseUserId = byEmail[0].id;
      console.log(`[house] House user already exists by email (${HOUSE_EMAIL}): ${houseUserId}`);
    }
  }

  if (!houseUserId) {
    houseUserId = envHouseId || randomUUID();
    await sql`
      INSERT INTO users (id, email, name, role, email_verified, is_active, is_system)
      VALUES (${houseUserId}, ${HOUSE_EMAIL}, ${HOUSE_NAME}, 'job_seeker', true, true, true)
      ON CONFLICT (id) DO NOTHING
    `;
    console.log(`[house] Created house user: ${houseUserId}`);
    if (!envHouseId) {
      console.log("");
      console.log("  ┌──────────────────────────────────────────────────────────────┐");
      console.log("  │  Pin this in the API env so /superadmin/ads binds the house    │");
      console.log("  │  workspace on every boot:                                      │");
      console.log(`  │      HOUSE_USER_ID=${houseUserId}  │`);
      console.log("  └──────────────────────────────────────────────────────────────┘");
      console.log("");
    }
  }

  // ── 2. Grant SuperAdmin(s) an active studio-scope grant on the house. ──────
  let admins;
  if (targetSa) {
    admins = await sql`SELECT id FROM users WHERE id = ${targetSa} LIMIT 1`;
    if (admins.length === 0) {
      console.error(`[house] --sa user not found: ${targetSa}`);
      process.exit(1);
    }
  } else {
    admins = await sql`
      SELECT id FROM users
      WHERE is_super_admin = true OR role = ${SUPER_ADMIN_ROLE}
    `;
  }

  if (admins.length === 0) {
    console.log("[house] No SuperAdmins found — house user created, grants skipped.");
    console.log("[house] Re-run after promoting a SuperAdmin, or pass --sa=<userId>.");
    return;
  }

  let granted = 0;
  let skipped = 0;
  for (const { id: saId } of admins) {
    if (saId === houseUserId) {
      // The SA IS the house user — canActFor() treats this as self-act; no
      // grant row needed.
      skipped++;
      continue;
    }
    const existing = await sql`
      SELECT id FROM workspace_grants
      WHERE subject_user_id = ${houseUserId}
        AND contributor_user_id = ${saId}
        AND scope = 'studio'
        AND is_active = true
      LIMIT 1
    `;
    if (existing.length > 0) {
      skipped++;
      continue;
    }
    await sql`
      INSERT INTO workspace_grants
        (subject_user_id, contributor_user_id, granted_by_user_id, role, scope, is_active)
      VALUES
        (${houseUserId}, ${saId}, ${saId}, 'editor', 'studio', true)
      ON CONFLICT DO NOTHING
    `;
    granted++;
    console.log(`[house] Granted SA ${saId} studio access to house ${houseUserId}`);
  }

  console.log(`[house] Done. houseUserId=${houseUserId} grantsAdded=${granted} alreadyActive=${skipped} admins=${admins.length}`);
}

main().catch((err) => {
  console.error("[house] FATAL:", err);
  process.exit(1);
});
