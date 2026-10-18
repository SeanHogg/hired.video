/**
 * TenantIntegrationsRepository — the pasted-vendor-credential adapter over
 * provider_connections (purpose "api_key", W3-C migration 0600; was
 * tenant_integrations, mig 0463, #261).
 *
 *   slug  ← external_account_id   credential ← extra_secret_enc
 *   last4 ← config.last4          isActive   ← enabled
 *
 * No business logic / encryption / authorization — that lives in
 * services/integrations/TenantIntegrationsService.ts, which owns sealing the
 * credential (connection-secrets.ts), the admin gate, and credential masking.
 * This layer only reads + writes the already-sealed value; it never sees a
 * raw credential.
 */
import {
  ProviderConnectionsRepository,
  type ProviderConnectionFilter,
  type ProviderConnectionPatch,
  type ProviderConnectionRow,
} from "./providerConnectionsRepository.js";

export type DbLike = any;

const PURPOSE = "api_key" as const;

export interface TenantIntegrationRow {
  id: string;
  userId: string;
  companyId: string | null;
  provider: string;
  slug: string;
  /** Sealed credential (open with connection-secrets.ts). */
  credentialsEnc: string | null;
  /** Non-secret display hint: last 4 chars of the raw credential. */
  credentialsLast4: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantIntegrationInsert {
  userId: string;
  companyId: string | null;
  provider: string;
  slug: string;
  credentialsEnc: string;
  credentialsLast4: string | null;
  isActive?: boolean;
}

export type TenantIntegrationPatch = Partial<Pick<TenantIntegrationRow, "isActive" | "credentialsEnc" | "credentialsLast4">>;

/** Owner scope — personal (companyId null) or a company workspace. */
export interface OwnerScope {
  userId: string;
  companyId: string | null;
}

export interface ITenantIntegrationsRepository {
  listForOwner(scope: OwnerScope): Promise<TenantIntegrationRow[]>;
  findById(id: string): Promise<TenantIntegrationRow | null>;
  findForOwner(
    scope: OwnerScope,
    provider: string,
    slug: string,
  ): Promise<TenantIntegrationRow | null>;
  create(values: TenantIntegrationInsert): Promise<TenantIntegrationRow>;
  update(id: string, patch: TenantIntegrationPatch): Promise<TenantIntegrationRow | null>;
  remove(id: string): Promise<boolean>;
}

function ownerFilter(scope: OwnerScope): ProviderConnectionFilter {
  return scope.companyId == null
    ? { purpose: PURPOSE, ownerKind: "user", ownerId: scope.userId, userId: scope.userId, companyId: null }
    : { purpose: PURPOSE, ownerKind: "workspace", ownerId: scope.companyId, userId: scope.userId, companyId: scope.companyId };
}

function toIntegration(row: ProviderConnectionRow): TenantIntegrationRow {
  const last4 = (row.config ?? {}).last4;
  return {
    id: row.id,
    userId: row.userId ?? "",
    companyId: row.companyId,
    provider: row.provider,
    slug: row.externalAccountId ?? "",
    credentialsEnc: row.extraSecretEnc,
    credentialsLast4: typeof last4 === "string" ? last4 : null,
    isActive: row.enabled,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toPatch(patch: TenantIntegrationPatch): ProviderConnectionPatch {
  const out: ProviderConnectionPatch = {};
  if (patch.isActive !== undefined) out.enabled = patch.isActive;
  if (patch.credentialsEnc !== undefined) out.extraSecretEnc = patch.credentialsEnc;
  if (patch.credentialsLast4 !== undefined) out.configMerge = { last4: patch.credentialsLast4 };
  return out;
}

export class TenantIntegrationsRepository implements ITenantIntegrationsRepository {
  private readonly connections: ProviderConnectionsRepository;

  constructor(db: DbLike, now: () => Date = () => new Date()) {
    this.connections = new ProviderConnectionsRepository(db, now);
  }

  async listForOwner(scope: OwnerScope): Promise<TenantIntegrationRow[]> {
    const rows = await this.connections.list(ownerFilter(scope), { orderBy: "createdAt", direction: "desc", limit: 500 });
    return rows.map(toIntegration);
  }

  async findById(id: string): Promise<TenantIntegrationRow | null> {
    const row = await this.connections.findOne({ id, purpose: PURPOSE });
    return row ? toIntegration(row) : null;
  }

  async findForOwner(
    scope: OwnerScope,
    provider: string,
    slug: string,
  ): Promise<TenantIntegrationRow | null> {
    const row = await this.connections.findOne({ ...ownerFilter(scope), provider, externalAccountId: slug });
    return row ? toIntegration(row) : null;
  }

  async create(values: TenantIntegrationInsert): Promise<TenantIntegrationRow> {
    const owner = ownerFilter(values);
    const row = await this.connections.insert({
      ownerKind: owner.ownerKind!,
      ownerId: owner.ownerId as string,
      userId: values.userId,
      companyId: values.companyId,
      provider: values.provider,
      purpose: PURPOSE,
      externalAccountId: values.slug,
      extraSecretEnc: values.credentialsEnc,
      enabled: values.isActive ?? true,
      config: values.credentialsLast4 ? { last4: values.credentialsLast4 } : {},
    });
    return toIntegration(row);
  }

  async update(id: string, patch: TenantIntegrationPatch): Promise<TenantIntegrationRow | null> {
    const [row] = await this.connections.update({ id, purpose: PURPOSE }, toPatch(patch));
    return row ? toIntegration(row) : null;
  }

  async remove(id: string): Promise<boolean> {
    const deleted = await this.connections.delete({ id, purpose: PURPOSE });
    return deleted.length > 0;
  }
}
