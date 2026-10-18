/**
 * LMS connectors (#200) — the adapter over provider_connections purpose "lms"
 * (W3-C, migration 0600; was lms_connectors). Row ids were kept, so
 * lms_course_publishes.connector_id still names the same connector.
 *
 *   baseUrl / metadata ← config   status "connected" ⇄ status "active"
 *
 * One connector per (user, provider). Credentials (OAuth token or pasted API
 * key) are sealed with the one connection-secrets scheme; LMS wrote plaintext
 * before CREDENTIALS_KMS_KEY existed, so it keeps the plaintext fallback.
 */
import { getDb } from "../../db/index.js";
import {
  ProviderConnectionsRepository,
  type ProviderConnectionRow,
} from "../../repositories/providerConnectionsRepository.js";
import { openAndResealSecret, sealConnectionSecret } from "./connection-secrets.js";

const PURPOSE = "lms" as const;
const SEAL = { allowPlaintextFallback: true } as const;

/** The columns safe to return to API clients — never a credential. */
export interface LmsConnectorView {
  id: string;
  provider: string;
  displayName: string | null;
  baseUrl: string | null;
  /** "connected" | "revoked" | "expired" | "error" — the LMS API vocabulary. */
  status: string;
  expiresAt: Date | null;
  lastSyncAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** A connector ready for an adapter call. */
export interface LmsConnectorCredentials {
  id: string;
  provider: string;
  status: string;
  accessToken: string;
  baseUrl: string;
  metadata: Record<string, unknown>;
}

function config(row: ProviderConnectionRow): Record<string, unknown> {
  return (row.config ?? {}) as Record<string, unknown>;
}

/** The LMS API has always said "connected" for a live connector. */
function lmsStatus(row: ProviderConnectionRow): string {
  return row.status === "active" ? "connected" : row.status;
}

export function toLmsConnectorView(row: ProviderConnectionRow): LmsConnectorView {
  const baseUrl = config(row).baseUrl;
  return {
    id: row.id,
    provider: row.provider,
    displayName: row.displayName,
    baseUrl: typeof baseUrl === "string" ? baseUrl : null,
    status: lmsStatus(row),
    expiresAt: row.expiresAt,
    lastSyncAt: row.lastSyncAt,
    lastError: row.lastError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class LmsConnectors {
  private readonly connections: ProviderConnectionsRepository;

  constructor(db = getDb()) {
    this.connections = new ProviderConnectionsRepository(db);
  }

  async listForUser(userId: string): Promise<LmsConnectorView[]> {
    const rows = await this.connections.list({ purpose: PURPOSE, userId }, { orderBy: "createdAt", direction: "desc" });
    return rows.map(toLmsConnectorView);
  }

  /** Revoke the caller's connector; null when it isn't theirs. */
  async revoke(id: string, userId: string): Promise<LmsConnectorView | null> {
    const [row] = await this.connections.update({ id, purpose: PURPOSE, userId }, { status: "revoked" });
    return row ? toLmsConnectorView(row) : null;
  }

  /** OAuth callback: store the tokens for (user, provider). */
  async saveOAuth(input: {
    userId: string;
    provider: string;
    baseUrl: string;
    displayName: string | null;
    accessToken: string;
    refreshToken: string | null;
    scope: string | null;
    expiresAt: Date | null;
  }): Promise<LmsConnectorView> {
    const accessTokenEnc = await sealConnectionSecret(input.accessToken, SEAL);
    const refreshTokenEnc = await sealConnectionSecret(input.refreshToken, SEAL);
    const fields = {
      accessTokenEnc,
      refreshTokenEnc,
      scopes: input.scope,
      expiresAt: input.expiresAt,
      status: "active" as const,
      lastError: null,
    };
    const row = await this.connections.upsert(
      { purpose: PURPOSE, userId: input.userId, provider: input.provider },
      {
        ...this.owner(input.userId),
        provider: input.provider,
        displayName: input.displayName,
        config: { baseUrl: input.baseUrl },
        ...fields,
      },
      {
        ...fields,
        ...(input.displayName ? { displayName: input.displayName } : {}),
        configMerge: { baseUrl: input.baseUrl },
      },
    );
    return toLmsConnectorView(row);
  }

  /** Manual / API-key path: the key is stored as the connector's access token. */
  async saveApiKey(input: {
    userId: string;
    provider: string;
    baseUrl: string;
    apiKey: string;
    displayName: string | null;
    metadata: Record<string, unknown> | null;
  }): Promise<{ connector: LmsConnectorView; created: boolean }> {
    const accessTokenEnc = await sealConnectionSecret(input.apiKey, SEAL);
    const existing = await this.connections.findOne({ purpose: PURPOSE, userId: input.userId, provider: input.provider });
    const cfg = { baseUrl: input.baseUrl, metadata: input.metadata };
    if (existing) {
      const row = await this.connections.updateById(existing.id, {
        accessTokenEnc,
        displayName: input.displayName,
        configMerge: cfg,
        status: "active",
        lastError: null,
      });
      return { connector: toLmsConnectorView(row ?? existing), created: false };
    }
    const row = await this.connections.insert({
      ...this.owner(input.userId),
      provider: input.provider,
      accessTokenEnc,
      displayName: input.displayName,
      config: cfg,
      status: "active",
    });
    return { connector: toLmsConnectorView(row), created: true };
  }

  /** The caller's connector with its credential opened, or null. */
  async credentialsFor(id: string, userId: string): Promise<LmsConnectorCredentials | null> {
    const row = await this.connections.findOne({ id, purpose: PURPOSE, userId });
    if (!row) return null;
    const stored = row.accessTokenEnc;
    const accessToken = await openAndResealSecret(stored, (next) =>
      this.connections.resealSecret(row.id, "accessTokenEnc", stored as string, next),
    );
    const cfg = config(row);
    return {
      id: row.id,
      provider: row.provider,
      status: lmsStatus(row),
      accessToken: accessToken ?? "",
      baseUrl: typeof cfg.baseUrl === "string" ? cfg.baseUrl : "",
      metadata: cfg.metadata && typeof cfg.metadata === "object" ? (cfg.metadata as Record<string, unknown>) : {},
    };
  }

  private owner(userId: string) {
    return { ownerKind: "user" as const, ownerId: userId, userId, purpose: PURPOSE };
  }
}
