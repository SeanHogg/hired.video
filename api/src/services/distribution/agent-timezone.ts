/**
 * User timezone for posting-agent day/week windows.
 * Falls back to UTC when the account has none set.
 */
import { eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { accountPreferences } from "../../db/schema/users.js";

export async function loadTimezone(userId: string): Promise<string> {
  const db = getDb();
  const [row] = await db
    .select({ tz: accountPreferences.timezone })
    .from(accountPreferences)
    .where(eq(accountPreferences.userId, userId))
    .limit(1);
  return row?.tz || "UTC";
}
