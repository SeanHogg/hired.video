/**
 * First-party Studio template seeder.
 *
 * Bulk-imports every JSON file under frontend/data/templates/ as a public,
 * free `studio_templates` row owned by the Hired.VIDEO Community company.
 * Idempotent: matches existing rows by listing_slug and updates the
 * videoScript / metadata in place rather than inserting duplicates.
 *
 * Run:
 *   DATABASE_URL=... node api/scripts/seed-first-party-templates.mjs
 *
 * The intent is that the platform can ship more curated structures
 * (Hook-Led / Story-Led / Pivot-Led / future patterns) without per-row
 * admin clicks. New JSON files dropped into frontend/data/templates/
 * are picked up automatically.
 *
 * Permissions / consent:
 *   - The Hired.VIDEO Community company is treated as the canonical
 *     first-party publisher; consent_agreed_at is stamped from a fixed
 *     value because the company itself agreed via legal/onboarding.
 *   - The creator_id is set to the Hired.VIDEO Community company's
 *     ownerId (the superadmin) so the FK constraint is satisfied. The
 *     marketplace surfaces the row as "Made by hired.video" via the
 *     firstParty flag (see search.ts toTemplateItem).
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(HERE, "..", "..", "frontend", "data", "templates");
const HIRED_VIDEO_COMMUNITY_NAME = "hired.video Community";

/** Slugify a file basename into a URL-safe listing slug. */
function toSlug(name) {
  return name
    .toLowerCase()
    .replace(/\.json$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Pull catalog metadata out of a script body so the listing card can
 *  surface duration / motion / language without re-parsing the JSON. */
function extractMeta(script) {
  const v = script?.video ?? {};
  return {
    durationSec: typeof v.duration === "number" ? Math.round(v.duration) : null,
    motion: typeof v?.theme?.motion === "string" ? v.theme.motion : null,
    language: typeof v?.audio?.language === "string" ? v.audio.language : null,
  };
}

/** Best-effort name + blurb derivation from the JSON body, with a slug
 *  fallback. The platform-shipped templates use stable file names so
 *  these lookups are mostly cosmetic. */
function deriveCardCopy(slug, script) {
  const intro = (script?.scenes ?? []).find((s) => s?.type === "intro");
  const introTitle = typeof intro?.title === "string" ? intro.title : null;
  const titleCase = slug
    .replace(/^video-resume-/, "")
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
  return {
    name: `${titleCase} Video Resume`,
    description: introTitle ?? `Platform-shipped ${titleCase} starter template.`,
  };
}

async function main() {
  const url = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  const sql = neon(url);

  // 1. Resolve the Hired.VIDEO Community company + its owner.
  const companies = await sql`SELECT id, owner_id FROM company_profiles WHERE name = ${HIRED_VIDEO_COMMUNITY_NAME} LIMIT 1`;
  if (companies.length === 0) {
    console.error(`[seed] No company profile named "${HIRED_VIDEO_COMMUNITY_NAME}" — run the API seed first.`);
    process.exit(1);
  }
  const { id: companyId, owner_id: ownerId } = companies[0];
  if (!ownerId) {
    console.error("[seed] Hired.VIDEO Community has no ownerId; cannot satisfy creator_id FK.");
    process.exit(1);
  }

  // 2. Walk the templates directory.
  const files = readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    console.log("[seed] No template JSON files found.");
    return;
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const file of files) {
    const slug = toSlug(file);
    const raw = readFileSync(join(TEMPLATES_DIR, file), "utf8");
    let script;
    try {
      script = JSON.parse(raw);
    } catch (err) {
      console.error(`[seed] Skipping ${file}: invalid JSON (${err.message})`);
      skipped++;
      continue;
    }
    const meta = extractMeta(script);
    const copy = deriveCardCopy(slug, script);

    // Idempotency: lookup by listing_slug. The slug is unique across all
    // studio_templates so collisions outside our seed are impossible.
    const existing = await sql`SELECT id FROM studio_templates WHERE listing_slug = ${slug} LIMIT 1`;
    if (existing.length > 0) {
      await sql`
        UPDATE studio_templates
           SET video_script   = ${script}::jsonb,
               name           = ${copy.name},
               description    = ${copy.description},
               duration_sec   = ${meta.durationSec},
               motion         = ${meta.motion},
               language       = ${meta.language},
               company_id     = ${companyId},
               creator_id     = ${ownerId},
               visibility     = 'public',
               price_cents    = 0,
               updated_at     = NOW()
         WHERE id = ${existing[0].id}
      `;
      updated++;
      console.log(`[seed] Updated  ${slug}`);
    } else {
      const tagsJson = JSON.stringify(["first-party", "video-resume"]);
      await sql`
        INSERT INTO studio_templates (
          creator_id, company_id, name, description, video_script,
          duration_sec, motion, language, tags, visibility,
          listing_slug, price_cents, currency, platform_fee_bps,
          consent_agreed_at, published_at
        ) VALUES (
          ${ownerId}, ${companyId}, ${copy.name}, ${copy.description}, ${script}::jsonb,
          ${meta.durationSec}, ${meta.motion}, ${meta.language}, ${tagsJson}::jsonb, 'public',
          ${slug}, 0, 'USD', 500,
          NOW(), NOW()
        )
      `;
      inserted++;
      console.log(`[seed] Inserted ${slug}`);
    }
  }

  console.log(`[seed] Done. inserted=${inserted} updated=${updated} skipped=${skipped} total=${files.length}`);
}

main().catch((err) => {
  console.error("[seed] FATAL:", err);
  process.exit(1);
});
