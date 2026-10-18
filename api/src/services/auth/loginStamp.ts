import { eq } from "drizzle-orm";
import { schema } from "../../db/index.js";

/**
 * Stamp `lastLoginAt = now` on the user. Called from every successful login
 * path (password, 2FA, OAuth, magic link) so the admin UserManagement page
 * reflects real login activity. Takes a minimal db port so unit tests can
 * pass a fake.
 */
export async function markUserLogin(
  db: { update: (table: any) => any },
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  await db
    .update(schema.users)
    .set({ lastLoginAt: now })
    .where(eq(schema.users.id, userId));
}
