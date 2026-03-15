import { eq } from "drizzle-orm";
import { getDb, schema } from "./db/index.js";

const { users, jobItems } = schema;

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
  const role = process.env.SUPERADMIN_ROLE ?? "SuperAdmin";
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

    // Seed an example job/company record to make the company visible in UI
    const [existingJob] = await db
      .select()
      .from(jobItems)
      .where(eq(jobItems.company, companyName))
      .limit(1);

    if (!existingJob && userId) {
      await db.insert(jobItems).values({
        postedByUserId: userId,
        title: `${companyName} - Sample Job`,
        description: `This is a sample job posting for ${companyName}.`,
        company: companyName,
        location: "Remote",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
      console.log("[seed] Created sample job for company", companyName);
    }

    seeded = true;
  } catch (err) {
    console.error("[seed] Failed to seed super admin / company:", err);
  }
}
