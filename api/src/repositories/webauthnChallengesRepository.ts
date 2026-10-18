/**
 * WebauthnChallengesRepository — the short-lived WebAuthn ceremony
 * challenges (`webauthn_challenges`). One row per begin call; consumed
 * (deleted) by the matching complete call. TTL is enforced by the passkey
 * service, which also sweeps expired rows on every begin.
 *
 * Registered credentials (`webauthn_credentials`) belong to the auth-token
 * aggregate — see AuthTokensRepository (passkey methods).
 *
 * Zero business logic — typed Drizzle wrappers taking a `db` handle.
 */

import { and, eq, lt } from "drizzle-orm";
import { schema } from "../db/index.js";

const { webauthnChallenges } = schema;

export type DbLike = any;

export type WebauthnChallengeRow = typeof webauthnChallenges.$inferSelect;
export type WebauthnCeremony = "registration" | "authentication";

export class WebauthnChallengesRepository {
  constructor(private readonly db: DbLike) {}

  async deleteExpired(now: Date): Promise<void> {
    await this.db.delete(webauthnChallenges).where(lt(webauthnChallenges.expiresAt, now));
  }

  async insert(input: { userId: string | null; challenge: string; type: WebauthnCeremony; expiresAt: Date }): Promise<void> {
    await this.db.insert(webauthnChallenges).values(input as any);
  }

  /** The challenge row for a ceremony. `userId` narrows registration
   *  challenges to their owner; authentication challenges are anonymous. */
  async findByChallenge(challenge: string, type: WebauthnCeremony, userId?: string): Promise<WebauthnChallengeRow | null> {
    const conditions = [eq(webauthnChallenges.challenge, challenge), eq(webauthnChallenges.type, type)];
    if (userId) conditions.push(eq(webauthnChallenges.userId, userId));
    const [row] = await this.db.select().from(webauthnChallenges).where(and(...conditions)).limit(1);
    return (row as WebauthnChallengeRow) ?? null;
  }

  async deleteById(id: string): Promise<void> {
    await this.db.delete(webauthnChallenges).where(eq(webauthnChallenges.id, id));
  }
}
