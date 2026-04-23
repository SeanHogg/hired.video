import { eq } from "drizzle-orm";
import { getDb, schema } from "./db/index.js";
import { HIRED_VIDEO_SEED_COMPANY } from "./services/job/JobService.js";
import { USER_ROLES } from "../../shared/user-roles.js";

const { users, companyProfiles } = schema;

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
): Promise<void> {
  const [existing] = await db
    .select({ id: companyProfiles.id })
    .from(companyProfiles)
    .where(eq(companyProfiles.name, name))
    .limit(1);
  if (existing) return;

  await db.insert(companyProfiles).values({
    ownerId,
    name,
    slug: toSlug(name),
    description,
    isVerified: true,
    isActive: true,
  } as any);
  console.log("[seed] Created company profile", name);
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

let seeded = false;

export async function seedSuperAdminAndCompany(): Promise<void> {
  if (seeded) return;

  const email = process.env.SUPERADMIN_EMAIL ?? "seanhogg@gmail.com";
  const password = process.env.SUPERADMIN_PASSWORD ?? "SuperAdmin123!";
  const name = process.env.SUPERADMIN_NAME ?? "Sean Hogg";
  const role = process.env.SUPERADMIN_ROLE ?? USER_ROLES.SUPER_ADMIN;
  const companyName = process.env.SEED_COMPANY_NAME ?? "Fix Faster LLC";

  try {
    const db = getDb();

    const [existingUser] = await db
      .select()
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
      // Always refresh the seeded password and ensure the intended role
      const passwordHash = await hashPassword(password);
      await db
        .update(users)
        .set({ passwordHash, role, updatedAt: new Date() } as any)
        .where(eq(users.id, userId));
      console.log("[seed] Refreshed super admin password and role");
    }

    // Seed company profiles (not fake jobs) so the companies surface on
    // the public board. Idempotent on name — if the profile already
    // exists, nothing happens. No placeholder jobs are created.
    if (userId) {
      await ensureCompanyProfile(
        db,
        userId,
        companyName,
        `${companyName} — seeded company profile.`,
      );
      await ensureCompanyProfile(
        db,
        userId,
        HIRED_VIDEO_SEED_COMPANY,
        "Placeholder company for jobs tracked by hired.video community members through the Chrome extension. Tracked jobs that don't specify a company are attributed here.",
      );
    }

    seeded = true;
  } catch (err) {
    console.error("[seed] Failed to seed super admin / company:", err);
  }
}
