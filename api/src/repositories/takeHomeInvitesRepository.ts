/**
 * Take-home invites (#1386) — the candidate magic-link rows on
 * `take_home_invites`, keyed by `invite_token` for the public landing page.
 * Each write is a single statement returning the updated row.
 */
import { eq } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";
import type { NewTakeHomeInvite, TakeHomeInvite } from "../db/schema/takehome.js";

const { takeHomeInvites } = schema;

export async function insertTakeHomeInvite(db: Db, input: NewTakeHomeInvite): Promise<TakeHomeInvite | undefined> {
  const [row] = await db.insert(takeHomeInvites).values(input).returning();
  return row;
}

export async function findTakeHomeInviteByToken(db: Db, token: string): Promise<TakeHomeInvite | null> {
  const [row] = await db.select().from(takeHomeInvites).where(eq(takeHomeInvites.inviteToken, token)).limit(1);
  return row ?? null;
}

/** Patch the invite with `token`; null when no such invite. */
export async function updateTakeHomeInviteByToken(
  db: Db,
  token: string,
  patch: Partial<NewTakeHomeInvite>,
): Promise<TakeHomeInvite | null> {
  const [row] = await db.update(takeHomeInvites).set(patch).where(eq(takeHomeInvites.inviteToken, token)).returning();
  return row ?? null;
}
