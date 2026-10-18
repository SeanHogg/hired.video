/**
 * OAuth sign-in identities (Google, LinkedIn, GitHub, Microsoft …) — the
 * adapter over provider_connections purpose "login" (W3-C, migration 0600;
 * was oauth_accounts). Row ids were kept, so every existing linked user keeps
 * signing in.
 *
 *   providerAccountId ← external_account_id (unique per provider:
 *                       uq_provider_connections_login)
 *   email ← handle
 *
 * Provider tokens are sealed with the one connection-secrets scheme; sign-in
 * wrote plaintext before CREDENTIALS_KMS_KEY existed, so it keeps the
 * plaintext fallback (sign-in must never fail for want of a key).
 */
import { getDb } from "../../db/index.js";
import { ProviderConnectionsRepository } from "../../repositories/providerConnectionsRepository.js";
import { sealConnectionSecret } from "./connection-secrets.js";

const PURPOSE = "login" as const;
const SEAL = { allowPlaintextFallback: true } as const;

/** The linked-account shape the security settings tab has always shown. */
export interface LinkedLoginAccount {
  id: string;
  provider: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: Date;
}

export interface LoginTokens {
  accessToken: string | null | undefined;
  refreshToken: string | null | undefined;
  expiresAt: Date | null;
}

export class LoginIdentities {
  private readonly connections: ProviderConnectionsRepository;

  constructor(db = getDb()) {
    this.connections = new ProviderConnectionsRepository(db);
  }

  /** The user a provider identity signs in as. */
  async findByProviderAccount(provider: string, providerAccountId: string): Promise<{ id: string; userId: string } | null> {
    const row = await this.connections.findOne({ purpose: PURPOSE, provider, externalAccountId: providerAccountId });
    return row && row.userId ? { id: row.id, userId: row.userId } : null;
  }

  /** Link a new provider identity to `userId`. */
  async link(input: {
    userId: string;
    provider: string;
    providerAccountId: string;
    email: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    tokens: LoginTokens;
  }): Promise<void> {
    await this.connections.insert({
      ownerKind: "user",
      ownerId: input.userId,
      userId: input.userId,
      provider: input.provider,
      purpose: PURPOSE,
      externalAccountId: input.providerAccountId,
      handle: input.email,
      displayName: input.displayName,
      avatarUrl: input.avatarUrl,
      ...(await this.sealTokens(input.tokens)),
    });
  }

  /** Refresh an existing identity on sign-in — and move it to `userId` when a
   *  signed-in user re-links an identity that belonged to another account. */
  async refresh(
    id: string,
    input: { userId: string; displayName: string | null; avatarUrl: string | null; tokens: LoginTokens },
  ): Promise<void> {
    await this.connections.update(
      { id, purpose: PURPOSE },
      {
        ownerId: input.userId,
        userId: input.userId,
        displayName: input.displayName,
        avatarUrl: input.avatarUrl,
        ...(await this.sealTokens(input.tokens)),
      },
    );
  }

  async listForUser(userId: string): Promise<LinkedLoginAccount[]> {
    const rows = await this.connections.list({ purpose: PURPOSE, userId });
    return rows.map((r) => ({
      id: r.id,
      provider: r.provider,
      email: r.handle,
      displayName: r.displayName,
      avatarUrl: r.avatarUrl,
      createdAt: r.createdAt,
    }));
  }

  async countForUser(userId: string): Promise<number> {
    return this.connections.count({ purpose: PURPOSE, userId });
  }

  /** Unlink every identity of `provider` from `userId`; returns how many. */
  async unlink(userId: string, provider: string): Promise<number> {
    return (await this.connections.delete({ purpose: PURPOSE, userId, provider })).length;
  }

  private async sealTokens(tokens: LoginTokens) {
    return {
      accessTokenEnc: await sealConnectionSecret(tokens.accessToken, SEAL),
      refreshTokenEnc: await sealConnectionSecret(tokens.refreshToken, SEAL),
      expiresAt: tokens.expiresAt,
    };
  }
}
