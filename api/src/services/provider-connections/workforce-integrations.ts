/**
 * Company workforce integrations (#1441 — QuickBooks, Xero, Gusto, DocuSign,
 * Helcim, Slack) — the adapter over provider_connections purpose
 * "workforce" (W3-C, migration 0600; was company_integrations). Company-owned,
 * one per (company, provider).
 *
 *   status "connected" / "disconnected" / "error" ⇄ active / revoked / error
 *   metadata ← config     scopes (string[]) ⇄ space-separated scopes
 *
 * Tokens are sealed with the one connection-secrets scheme (always
 * encrypted — no plaintext fallback).
 */
import { inArray } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import {
  ProviderConnectionsRepository,
  type ProviderConnectionRow,
} from "../../repositories/providerConnectionsRepository.js";
import { sealConnectionSecret } from "./connection-secrets.js";

const PURPOSE = "workforce" as const;

/** The integration shape the workforce API has always returned (no tokens). */
export interface WorkforceIntegrationView {
  id: string;
  companyId: string;
  provider: string;
  /** "connected" | "disconnected" | "error" | "expired" */
  status: string;
  externalAccountId: string | null;
  expiresAt: Date | null;
  scopes: string[] | null;
  lastSyncAt: Date | null;
  lastError: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertWorkforceIntegrationInput {
  companyId: string;
  provider: string;
  /** PLAINTEXT tokens from the OAuth callback — sealed before writing. */
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  scopes?: string[] | null;
  externalAccountId?: string | null;
  connectedByUserId?: string | null;
  metadata?: Record<string, unknown> | null;
}

function apiStatus(status: string): string {
  if (status === "active") return "connected";
  if (status === "revoked") return "disconnected";
  return status;
}

function toView(row: ProviderConnectionRow): WorkforceIntegrationView {
  const config = (row.config ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    companyId: row.companyId ?? row.ownerId ?? "",
    provider: row.provider,
    status: apiStatus(row.status),
    externalAccountId: row.externalAccountId,
    expiresAt: row.expiresAt,
    scopes: row.scopes ? row.scopes.split(" ").filter(Boolean) : null,
    lastSyncAt: row.lastSyncAt,
    lastError: row.lastError,
    metadata: Object.keys(config).length ? config : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class WorkforceIntegrations {
  private readonly connections: ProviderConnectionsRepository;

  constructor(db = getDb()) {
    this.connections = new ProviderConnectionsRepository(db);
  }

  /** Insert-or-update a company's integration after a successful OAuth
   *  callback (one per company + provider). */
  async upsert(input: UpsertWorkforceIntegrationInput): Promise<WorkforceIntegrationView> {
    const accessTokenEnc = await sealConnectionSecret(input.accessToken);
    const refreshTokenEnc = await sealConnectionSecret(input.refreshToken);
    const scopes = input.scopes ? input.scopes.join(" ") : null;
    const match = { purpose: PURPOSE, ownerKind: "company" as const, ownerId: input.companyId, provider: input.provider };
    const existing = await this.connections.findOne(match);
    if (existing) {
      const row = await this.connections.updateById(existing.id, {
        status: "active",
        accessTokenEnc: accessTokenEnc ?? existing.accessTokenEnc,
        refreshTokenEnc: refreshTokenEnc ?? existing.refreshTokenEnc,
        expiresAt: input.expiresAt ?? existing.expiresAt,
        scopes: scopes ?? existing.scopes,
        externalAccountId: input.externalAccountId ?? existing.externalAccountId,
        connectedByUserId: input.connectedByUserId ?? existing.connectedByUserId,
        config: input.metadata ?? existing.config,
        lastError: null,
      });
      return toView(row ?? existing);
    }
    const row = await this.connections.insert({
      ownerKind: "company",
      ownerId: input.companyId,
      companyId: input.companyId,
      provider: input.provider,
      purpose: PURPOSE,
      status: "active",
      accessTokenEnc,
      refreshTokenEnc,
      expiresAt: input.expiresAt ?? null,
      scopes,
      externalAccountId: input.externalAccountId ?? null,
      connectedByUserId: input.connectedByUserId ?? null,
      config: input.metadata ?? {},
    });
    return toView(row);
  }

  /** Keep the row (audit trail), flip it to disconnected. */
  async disconnect(companyId: string, provider: string): Promise<void> {
    await this.connections.update({ purpose: PURPOSE, ownerKind: "company", ownerId: companyId, provider }, { status: "revoked" });
  }

  /** Integrations of the given companies, most recently updated first. */
  async listForCompanies(companyIds: string[]): Promise<WorkforceIntegrationView[]> {
    if (companyIds.length === 0) return [];
    const rows = await this.connections.listWhere(
      { purpose: PURPOSE, ownerKind: "company" },
      inArray(schema.providerConnections.companyId, companyIds),
      { orderBy: "updatedAt", direction: "desc" },
    );
    return rows.map(toView);
  }

  async listForCompany(companyId: string): Promise<WorkforceIntegrationView[]> {
    const rows = await this.connections.list({ purpose: PURPOSE, ownerKind: "company", ownerId: companyId });
    return rows.map(toView);
  }

  async find(companyId: string, provider: string): Promise<WorkforceIntegrationView | null> {
    const row = await this.connections.findOne({ purpose: PURPOSE, ownerKind: "company", ownerId: companyId, provider });
    return row ? toView(row) : null;
  }
}
