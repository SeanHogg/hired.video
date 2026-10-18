/**
 * TenantIntegrationsService — generic self-serve API-key vendor registry
 * (#261). Workspace admins paste credentials for any vendor without a
 * custom connector; this service owns the AES-GCM round-trip, the admin
 * authorization gate, and credential masking.
 *
 * SECURITY INVARIANTS:
 *   • The raw credential is NEVER returned to the client or logged. List /
 *     read responses expose only provider / slug / is_active / last4.
 *   • The credential is sealed with the ONE provider_connections scheme
 *     (services/provider-connections/connection-secrets.ts) — no bespoke
 *     crypto here.
 *   • Every mutation is authorized through `canActFor` (the workspace
 *     admin / company-member gate) before any DB write.
 */

import type { Repos } from "../../repositories/index.js";
import { getDb } from "../../db/index.js";
import { TenantIntegrationsRepository } from "../../repositories/tenantIntegrationsRepository.js";
import type {
  OwnerScope,
  TenantIntegrationPatch,
  TenantIntegrationRow,
} from "../../repositories/tenantIntegrationsRepository.js";
import { sealConnectionSecret } from "../provider-connections/connection-secrets.js";
import { canActFor } from "../studio/workspace.js";
import { DomainError, statusForErrorCode } from "../../domains/errors.js";

export type TenantIntegrationsServiceDeps = {
  repos: Pick<Repos, "tenantIntegrations">;
  /** Worker env — CREDENTIALS_KMS_KEY seals the credential. */
  env: Record<string, string | undefined>;
};

export type TenantIntegrationErrorCode =
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_ERROR";

export class TenantIntegrationError extends DomainError {
  declare readonly code: TenantIntegrationErrorCode;
  constructor(code: TenantIntegrationErrorCode, message: string) {
    super(statusForErrorCode(code), code, message);
    this.name = "TenantIntegrationError";
  }
}

/** Wire-safe view of an integration — never carries the secret. */
export interface TenantIntegrationView {
  id: string;
  provider: string;
  slug: string;
  isActive: boolean;
  last4: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTenantIntegrationInput {
  provider: string;
  slug: string;
  credentials: string;
}

export interface UpdateTenantIntegrationInput {
  isActive?: boolean;
  /** When present, re-encrypts and replaces the stored secret. */
  credentials?: string;
}

function toView(row: TenantIntegrationRow): TenantIntegrationView {
  return {
    id: row.id,
    provider: row.provider,
    slug: row.slug,
    isActive: row.isActive,
    last4: row.credentialsLast4 ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function last4(secret: string): string | null {
  const trimmed = secret.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(-4);
}

export class TenantIntegrationsService {
  constructor(private readonly deps: TenantIntegrationsServiceDeps) {}

  /** Workspace admin gate. `canActFor` resolves self / company-member /
   *  delegated-grant; for company-scoped rows the actor must be a member of
   *  the company (the workspace-admin equivalent in this codebase). */
  private async assertAdmin(actorUserId: string, scope: OwnerScope): Promise<void> {
    const ok = await canActFor(actorUserId, scope.userId, scope.companyId);
    if (!ok) {
      throw new TenantIntegrationError(
        "FORBIDDEN",
        "You do not have permission to manage integrations for this workspace.",
      );
    }
  }

  /** Seal a raw credential (always encrypted — no plaintext fallback). */
  private async encrypt(credential: string) {
    const masterKey = this.deps.env.CREDENTIALS_KMS_KEY;
    const enc = await sealConnectionSecret(credential, masterKey ? { masterKey } : {});
    return { enc: enc ?? "", last4: last4(credential) };
  }

  async list(
    actorUserId: string,
    scope: OwnerScope,
  ): Promise<TenantIntegrationView[]> {
    await this.assertAdmin(actorUserId, scope);
    const rows = await this.deps.repos.tenantIntegrations.listForOwner(scope);
    return rows.map(toView);
  }

  async create(
    actorUserId: string,
    scope: OwnerScope,
    input: CreateTenantIntegrationInput,
  ): Promise<TenantIntegrationView> {
    await this.assertAdmin(actorUserId, scope);

    const provider = input.provider.trim();
    const slug = input.slug.trim();
    const credentials = input.credentials.trim();
    if (!provider || !slug || !credentials) {
      throw new TenantIntegrationError(
        "VALIDATION_ERROR",
        "provider, slug and credentials are all required.",
      );
    }

    const existing = await this.deps.repos.tenantIntegrations.findForOwner(
      scope,
      provider,
      slug,
    );
    if (existing) {
      throw new TenantIntegrationError(
        "CONFLICT",
        "An integration with this provider and slug already exists.",
      );
    }

    const enc = await this.encrypt(credentials);
    const row = await this.deps.repos.tenantIntegrations.create({
      userId: scope.userId,
      companyId: scope.companyId,
      provider,
      slug,
      credentialsEnc: enc.enc,
      credentialsLast4: enc.last4,
      isActive: true,
    });
    return toView(row);
  }

  async update(
    actorUserId: string,
    scope: OwnerScope,
    id: string,
    input: UpdateTenantIntegrationInput,
  ): Promise<TenantIntegrationView> {
    await this.assertAdmin(actorUserId, scope);

    const row = await this.loadOwned(scope, id);

    const patch: TenantIntegrationPatch = {};
    if (typeof input.isActive === "boolean") patch.isActive = input.isActive;
    if (typeof input.credentials === "string") {
      const credentials = input.credentials.trim();
      if (!credentials) {
        throw new TenantIntegrationError(
          "VALIDATION_ERROR",
          "credentials cannot be empty when rotating a secret.",
        );
      }
      const enc = await this.encrypt(credentials);
      patch.credentialsEnc = enc.enc;
      patch.credentialsLast4 = enc.last4;
    }

    if (Object.keys(patch).length === 0) return toView(row);

    const updated = await this.deps.repos.tenantIntegrations.update(id, patch);
    if (!updated) {
      throw new TenantIntegrationError("NOT_FOUND", "Integration not found.");
    }
    return toView(updated);
  }

  async remove(
    actorUserId: string,
    scope: OwnerScope,
    id: string,
  ): Promise<void> {
    await this.assertAdmin(actorUserId, scope);
    await this.loadOwned(scope, id);
    await this.deps.repos.tenantIntegrations.remove(id);
  }

  /** Load a row and assert it belongs to the caller's workspace scope —
   *  prevents an admin of workspace A from touching workspace B's row by id. */
  private async loadOwned(
    scope: OwnerScope,
    id: string,
  ): Promise<TenantIntegrationRow> {
    const row = await this.deps.repos.tenantIntegrations.findById(id);
    if (
      !row ||
      row.userId !== scope.userId ||
      (row.companyId ?? null) !== (scope.companyId ?? null)
    ) {
      throw new TenantIntegrationError("NOT_FOUND", "Integration not found.");
    }
    return row;
  }
}

/** Production wiring over the request-scoped db handle. */
export function tenantIntegrationsService(env: Record<string, string | undefined>): TenantIntegrationsService {
  return new TenantIntegrationsService({
    repos: { tenantIntegrations: new TenantIntegrationsRepository(getDb()) },
    env,
  });
}
