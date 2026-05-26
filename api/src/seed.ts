import { and, eq } from "drizzle-orm";
import { getDb, schema } from "./db/index.js";
import { HIRED_VIDEO_SEED_COMPANY } from "./services/job/JobService.js";
import { USER_ROLES } from "../../shared/user-roles.js";
import { allSectorArticleDrafts } from "../../shared/sector-article-templates.js";

const { users, companyProfiles, userCompanyRoleAssociations, articles } = schema;

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

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
      slug: toSlug(name),
      description,
      isVerified: true,
      isActive: true,
    } as any)
    .returning({ id: companyProfiles.id });
  console.log("[seed] Created company profile", name);
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
  console.log("[seed] Granted membership", role, "for", userId, "on", companyId);
}

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  const saltHex = Array.from(salt).map((b) => b.toString(16).padStart(2, "0")).join("");
  const hashHex = Array.from(new Uint8Array(bits))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${saltHex}:${hashHex}`;
}

/**
 * Idempotent seed: creates the superadmin user (if missing) and the two
 * platform-shipped company profiles + sector articles. **Never** overwrites
 * an existing user's password or role — the previous "refresh on every
 * boot" branch silently reset whatever password was set through the app
 * each time a Cloudflare isolate cold-started (gap #1593).
 *
 * Invoked from the daily window in scheduled.ts, not from the fetch path,
 * so the SELECT-per-article-draft loop doesn't tax request latency.
 */
export async function seedSuperAdminAndCompany(): Promise<void> {
  const email = process.env.SUPERADMIN_EMAIL ?? "seanhogg@gmail.com";
  const password = process.env.SUPERADMIN_PASSWORD ?? "SuperAdmin123!";
  const name = process.env.SUPERADMIN_NAME ?? "Sean Hogg";
  const role = process.env.SUPERADMIN_ROLE ?? USER_ROLES.SUPER_ADMIN;
  const companyName = process.env.SEED_COMPANY_NAME ?? "Fix Faster LLC";

  try {
    const db = getDb();

    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    let userId: string;

    if (!existingUser) {
      const passwordHash = await hashPassword(password);
      const [created] = await db
        .insert(users)
        .values({
          email,
          name,
          passwordHash,
          emailVerified: true,
          role,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any)
        .returning();

      userId = created?.id;
      console.log("[seed] Created super admin user", email);
    } else {
      userId = existingUser.id;
    }

    // Seed company profiles (not fake jobs) so the companies surface on
    // the public board. Idempotent on name — if the profile already
    // exists, nothing happens. No placeholder jobs are created.
    if (userId) {
      const fixFasterId = await ensureCompanyProfile(
        db,
        userId,
        companyName,
        `${companyName} — seeded company profile.`,
      );
      const hiredVideoCommunityId = await ensureCompanyProfile(
        db,
        userId,
        HIRED_VIDEO_SEED_COMPANY,
        "Placeholder company for jobs tracked by hired.video community members through the Chrome extension. Tracked jobs that don't specify a company are attributed here. Also serves as the first-party owner of platform-shipped Studio templates.",
      );
      // Make the superadmin a member of both seeded companies so they can
      // act through those workspaces in Studio. companyProfiles.ownerId
      // alone doesn't satisfy the assertCanWrite gate — we need an active
      // userCompanyRoleAssociations row too.
      await ensureCompanyMembership(db, userId, fixFasterId, "owner");
      await ensureCompanyMembership(db, userId, hiredVideoCommunityId, "owner");

      // Phase 1: seed sector articles. Idempotent on (userId, slug) so
      // the daily reconciliation does not duplicate. Platform-shipped
      // content lands as `published` (approvedBy=SA, approvedAt=now)
      // because it bypasses the creator-program enrollment gate that
      // user-authored articles run through.
      await seedSectorArticles(db, userId);
    }
  } catch (err) {
    console.error("[seed] Failed to seed super admin / company:", err);
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
    console.log(`[seed] Inserted ${inserted} sector articles`);
  }
}
