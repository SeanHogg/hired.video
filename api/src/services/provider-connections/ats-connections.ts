/**
 * ATS connections (Greenhouse, Lever, Workday — #64) — the adapter over
 * provider_connections purpose "ats" (W3-C, migration 0600; was
 * ats_connections). Company-owned, one per (company, provider).
 *
 *   API key / OAuth token ← access_token_enc
 *   inbound-webhook HMAC secret ← extra_secret_enc
 *   provider config (board token, subdomain, RaaS URL …) ← config
 *   isActive ← enabled
 *
 * Secrets are sealed with the one connection-secrets scheme; ATS wrote
 * plaintext before CREDENTIALS_KMS_KEY existed, so it keeps the plaintext
 * fallback for a key-less environment.
 */
import { getDb } from "../../db/index.js";
import {
  ProviderConnectionsRepository,
  type ProviderConnectionRow,
} from "../../repositories/providerConnectionsRepository.js";
import { openAndResealSecret, sealConnectionSecret } from "./connection-secrets.js";

const PURPOSE = "ats" as const;
const SEAL = { allowPlaintextFallback: true } as const;

export interface AtsConnectionView {
  id: string;
  companyId: string;
  provider: string;
  config: Record<string, unknown>;
  isActive: boolean;
  lastSyncAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function toView(row: ProviderConnectionRow): AtsConnectionView {
  return {
    id: row.id,
    companyId: row.companyId ?? row.ownerId ?? "",
    provider: row.provider,
    config: (row.config ?? {}) as Record<string, unknown>,
    isActive: row.enabled,
    lastSyncAt: row.lastSyncAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class AtsConnections {
  private readonly connections: ProviderConnectionsRepository;

  constructor(db = getDb()) {
    this.connections = new ProviderConnectionsRepository(db);
  }

  async listForCompany(companyId: string): Promise<AtsConnectionView[]> {
    const rows = await this.connections.list({ purpose: PURPOSE, ownerKind: "company", ownerId: companyId });
    return rows.map(toView);
  }

  async findById(id: string): Promise<AtsConnectionView | null> {
    const row = await this.connections.findOne({ id, purpose: PURPOSE });
    return row ? toView(row) : null;
  }

  /** Connect (or re-key) the company's connection for `provider`. */
  async connect(input: {
    companyId: string;
    provider: string;
    apiKey: string;
    webhookSecret: string | null | undefined;
    config: Record<string, unknown>;
  }): Promise<AtsConnectionView> {
    const accessTokenEnc = await sealConnectionSecret(input.apiKey, SEAL);
    const extraSecretEnc = await sealConnectionSecret(input.webhookSecret, SEAL);
    const fields = { accessTokenEnc, extraSecretEnc, config: input.config, enabled: true, status: "active" as const };
    const row = await this.connections.upsert(
      { purpose: PURPOSE, ownerKind: "company", ownerId: input.companyId, provider: input.provider },
      {
        ownerKind: "company",
        ownerId: input.companyId,
        companyId: input.companyId,
        provider: input.provider,
        purpose: PURPOSE,
        ...fields,
      },
      fields,
    );
    return toView(row);
  }

  async remove(id: string): Promise<void> {
    await this.connections.delete({ id, purpose: PURPOSE });
  }

  /** The connection's API key (re-sealing a legacy value). */
  async apiKey(id: string): Promise<string> {
    const row = await this.connections.findOne({ id, purpose: PURPOSE });
    if (!row) return "";
    return (await this.open(row, "accessTokenEnc")) ?? "";
  }

  async markSynced(id: string): Promise<void> {
    await this.connections.update({ id, purpose: PURPOSE }, { lastSyncAt: new Date() });
  }

  /**
   * The connection an inbound webhook belongs to. Webhooks don't carry our
   * connection id, so this is the first connection for the provider (gap
   * register #2016 tracks per-connection attribution).
   */
  async forWebhook(provider: string): Promise<{ companyId: string; webhookSecret: string | null } | null> {
    const row = await this.connections.findOne({ purpose: PURPOSE, provider });
    if (!row) return null;
    return {
      companyId: row.companyId ?? row.ownerId ?? "",
      webhookSecret: await this.open(row, "extraSecretEnc"),
    };
  }

  private open(row: ProviderConnectionRow, column: "accessTokenEnc" | "extraSecretEnc"): Promise<string | null> {
    const stored = row[column];
    return openAndResealSecret(stored, (next) => this.connections.resealSecret(row.id, column, stored as string, next));
  }
}
