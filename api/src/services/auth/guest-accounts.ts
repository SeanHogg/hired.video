/**
 * Guest accounts (mig 0496) — the silent server identity of a signed-out
 * visitor on the kit workspace or the studio.
 *
 *   createGuestAccount — mint a guest user + session + guest JWT. The visitor
 *     never sees a form; every existing save / render / connect / post path
 *     works unchanged because there is now a real `users` row behind them.
 *   adoptGuestAccount  — after the visitor signs up or signs in (any path:
 *     password, 2FA, magic link, OAuth, email-verify), move everything the
 *     guest owns onto the real account and delete the guest
 *     (`adopt_guest_user()` SQL function, one transaction; 0533: the guest's
 *     fresh network connections replace the account's for the same network,
 *     and a collision drops only that row).
 *
 * Stale guests age out in the retention sweep (RETENTION_POLICIES, 30 days).
 */
import { sql } from "drizzle-orm";
import { jwtVerify } from "jose";
import { getDb, type Db } from "../../db/index.js";
import { users } from "../../db/schema/index.js";
import { getJwtSecret } from "../../utils/jwt.js";
import { guestEmailFor } from "../../../../shared/guest-accounts.js";
import { issueJwt } from "./jwt.js";
import { createSession } from "./session-lifecycle.js";

const GUEST_ROLE = "job_seeker";

export interface GuestRequestMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface GuestAccount {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    emailVerified: false;
    isGuest: true;
  };
}

export async function createGuestAccount(meta: GuestRequestMeta, db: Db = getDb()): Promise<GuestAccount> {
  const id = crypto.randomUUID();
  const email = guestEmailFor(id);
  const name = "Guest";
  await db.insert(users).values({
    id,
    email,
    name,
    passwordHash: null,
    emailVerified: false,
    role: GUEST_ROLE,
    isGuest: true,
    signupIp: meta.ipAddress ?? null,
    signupUserAgent: meta.userAgent ?? null,
  } as typeof users.$inferInsert);

  const { session } = await createSession({
    db,
    userId: id,
    ipAddress: meta.ipAddress ?? undefined,
    userAgent: meta.userAgent ?? undefined,
  });
  const token = await issueJwt(
    {
      sub: id,
      email,
      roles: [GUEST_ROLE],
      emailVerified: false,
      mustChangePassword: false,
      sid: session.id,
      guest: true,
    },
    getJwtSecret(),
  );
  return { token, user: { id, email, name, role: GUEST_ROLE, emailVerified: false, isGuest: true } };
}

/** The guest user id inside a guest JWT, or null when the token is not a
 *  valid guest token. Expiry is NOT enforced: a guest whose token lapsed
 *  but whose row survives (sweep not yet run) can still be claimed. */
export async function guestIdFromToken(guestToken: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(guestToken, new TextEncoder().encode(getJwtSecret()), {
      algorithms: ["HS256"],
      clockTolerance: 60 * 60 * 24 * 365,
    });
    return payload["guest"] === true && typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export interface AdoptResult {
  adopted: boolean;
  /** Rows moved onto the real account. */
  moved: number;
}

/** Move the guest behind `guestToken` onto `targetUserId`. Idempotent: a
 *  guest already adopted (row gone) or a non-guest id reports adopted=false. */
export async function adoptGuestAccount(guestToken: string, targetUserId: string, db: Db = getDb()): Promise<AdoptResult> {
  const guestId = await guestIdFromToken(guestToken);
  if (!guestId || guestId === targetUserId) return { adopted: false, moved: 0 };
  const result = await db.execute(
    sql`SELECT adopt_guest_user(${guestId}::uuid, ${targetUserId}::uuid) AS moved`,
  );
  const rows: Array<{ moved?: number | string }> = Array.isArray(result)
    ? (result as Array<{ moved?: number | string }>)
    : ((result as { rows?: Array<{ moved?: number | string }> })?.rows ?? []);
  const moved = Number(rows[0]?.moved ?? -1);
  return moved >= 0 ? { adopted: true, moved } : { adopted: false, moved: 0 };
}
