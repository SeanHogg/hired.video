import { and, eq } from "drizzle-orm";
import { getDb, schema } from "./db/index.js";
import { HIRED_VIDEO_SEED_COMPANY } from "./services/job/JobService.js";
import { USER_ROLES } from "../../shared/user-roles.js";
import { slugify } from "../../shared/slugify.js";
import { allSectorArticleDrafts } from "../../shared/sector-article-templates.js";
import { logger } from "./lib/logger.js";
import { hashPassword } from "./services/auth/password.js";

const { users, companyProfiles, userCompanyRoleAssociations, articles } = schema;

async function ensureCompanyProfile(
  db: ReturnType<typeof getDb>,
  ownerId: string,
  name: string,
  description: string,
): Promise<string> {
  const [existing] = await db
    .select({ id: companyProfiles.id })
    .from(companyProfiles)
    .where(eq(companyProfiles.name, name))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(companyProfiles)
    .values({
      ownerId,
      name,
      slug: slugify(name, { fallback: "", maxLen: 100, stripDiacritics: false }),
      description,
      isVerified: true,
      isActive: true,
    } as any)
    .returning({ id: companyProfiles.id });
  logger.info("[seed] Created company profile", { name });
  return created.id;
}

/** Idempotently grants a user an active membership row on a company.
 *  Required so the user can write through the company workspace —
 *  ownership alone (companyProfiles.ownerId) is not enough now that
 *  studio mutations route through assertCanWrite, which checks both. */
async function ensureCompanyMembership(
  db: ReturnType<typeof getDb>,
  userId: string,
  companyId: string,
  role: string,
): Promise<void> {
  const [existing] = await db
    .select({ id: userCompanyRoleAssociations.id })
    .from(userCompanyRoleAssociations)
    .where(
      and(
        eq(userCompanyRoleAssociations.userId, userId),
        eq(userCompanyRoleAssociations.companyId, companyId),
      ),
    )
    .limit(1);
  if (existing) return;
  await db.insert(userCompanyRoleAssociations).values({
    userId,
    companyId,
    role,
    isActive: true,
  } as any);
  logger.info("[seed] Granted membership", { role, userId, companyId });
}

/** Inputs that determine *what* the seed inserts. Separated from
 *  `seedSuperAdminAndCompany` so the env-reading wrapper stays env-aware
 *  while the core is unit-testable with explicit values + an injected db. */
export interface SeedOpts {
  email: string;
  password: string;
  name: string;
  role: string;
  companyName: string;
}

/** Default opts derived from `process.env` — the production caller. */
function defaultSeedOpts(): SeedOpts {
  return {
    email: process.env.SUPERADMIN_EMAIL ?? "seanhogg@gmail.com",
    password: process.env.SUPERADMIN_PASSWORD ?? "SuperAdmin123!",
    name: process.env.SUPERADMIN_NAME ?? "Sean Hogg",
    role: process.env.SUPERADMIN_ROLE ?? USER_ROLES.SUPER_ADMIN,
    companyName: process.env.SEED_COMPANY_NAME ?? "Fix Faster LLC",
  };
}

/** Core seed routine: `db` injected so tests can substitute a fake db.
 *  **Idempotent** and **never overwrites an existing user's credentials**
 *  — the previous "refresh on every boot" branch silently reset whatever
 *  password was set through the app each time a Cloudflare isolate
 *  cold-started (gap #1593). */
export async function runSeed(
  db: ReturnType<typeof getDb>,
  opts: SeedOpts,
): Promise<void> {
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, opts.email))
    .limit(1);

  let userId: string;

  if (!existingUser) {
    const passwordHash = await hashPassword(opts.password);
    const [created] = await db
      .insert(users)
      .values({
        email: opts.email,
        name: opts.name,
        passwordHash,
        emailVerified: true,
        role: opts.role,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any)
      .returning();

    userId = created?.id;
    logger.info("[seed] Created super admin user", { email: opts.email });
  } else {
    userId = existingUser.id;
  }

  if (userId) {
    const fixFasterId = await ensureCompanyProfile(
      db,
      userId,
      opts.companyName,
      `${opts.companyName} — seeded company profile.`,
    );
    const hiredVideoCommunityId = await ensureCompanyProfile(
      db,
      userId,
      HIRED_VIDEO_SEED_COMPANY,
      "Placeholder company for jobs tracked by hired.video community members through the Chrome extension. Tracked jobs that don't specify a company are attributed here. Also serves as the first-party owner of platform-shipped Studio templates.",
    );
    await ensureCompanyMembership(db, userId, fixFasterId, "owner");
    await ensureCompanyMembership(db, userId, hiredVideoCommunityId, "owner");
    await seedSectorArticles(db, userId);
  }
}

/**
 * Production wrapper: reads env, resolves real db, runs the core. Daily
 * window in scheduled.ts is the only caller — see worker.ts comment.
 */
export async function seedSuperAdminAndCompany(): Promise<void> {
  try {
    await runSeed(getDb(), defaultSeedOpts());
  } catch (err) {
    logger.error("[seed] Failed to seed super admin / company", err);
  }
}

async function seedSectorArticles(
  db: ReturnType<typeof getDb>,
  authorUserId: string,
): Promise<void> {
  const drafts = allSectorArticleDrafts();
  const now = new Date();
  let inserted = 0;
  for (const draft of drafts) {
    const slug = `${draft.sector}-${draft.audience}`.replace(/_/g, "-");
    const [existing] = await db
      .select({ id: articles.id })
      .from(articles)
      .where(and(eq(articles.userId, authorUserId), eq(articles.slug, slug)))
      .limit(1);
    if (existing) continue;
    const readMinutes = Math.max(
      1,
      Math.ceil(draft.bodyMd.trim().split(/\s+/).filter(Boolean).length / 225),
    );
    await db.insert(articles).values({
      userId: authorUserId,
      slug,
      title: draft.title,
      bodyMd: draft.bodyMd,
      summary: draft.summary,
      category: "career",
      tags: draft.tags,
      sector: draft.sector,
      audience: draft.audience,
      kind: "article",
      status: "published",
      submittedForReviewAt: now,
      publishedAt: now,
      approvedBy: authorUserId,
      approvedAt: now,
      readMinutes,
    } as any);
    inserted += 1;
  }
  if (inserted > 0) {
    logger.info("[seed] Inserted sector articles", { inserted });
  }
}
