/**
 * TenantIntegrationsRepository — pure data access for the generic self-serve
 * vendor-integration registry (`tenant_integrations`, migration 0463, #261).
 *
 * No business logic / encryption / authorization — that lives in
 * services/integrations/TenantIntegrationsService.ts, which owns the
 * AES-GCM round-trip, the admin gate, and credential masking. This layer
 * only reads + writes already-encrypted bytea columns; it never sees a raw
 * credential.
 */
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { schema } from "../db/index.js";
import type {
  TenantIntegration,
  NewTenantIntegration,
} from "../db/schema/tenantIntegrations.js";

const { tenantIntegrations } = schema;

export type DbLike = any;
export type TenantIntegrationRow = TenantIntegration;
export type TenantIntegrationInsert = NewTenantIntegration;

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
  update(
    id: string,
    patch: Partial<TenantIntegrationInsert>,
  ): Promise<TenantIntegrationRow | null>;
  remove(id: string): Promise<boolean>;
}

export class TenantIntegrationsRepository
  implements ITenantIntegrationsRepository
{
  constructor(
    private readonly db: DbLike,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private ownerWhere(scope: OwnerScope) {
    return and(
      eq(tenantIntegrations.userId, scope.userId),
      scope.companyId == null
        ? isNull(tenantIntegrations.companyId)
        : eq(tenantIntegrations.companyId, scope.companyId),
    );
  }

  async listForOwner(scope: OwnerScope): Promise<TenantIntegrationRow[]> {
    return this.db
      .select()
      .from(tenantIntegrations)
      .where(this.ownerWhere(scope))
      .orderBy(desc(tenantIntegrations.createdAt))
      .limit(500);
  }

  async findById(id: string): Promise<TenantIntegrationRow | null> {
    const [row] = await this.db
      .select()
      .from(tenantIntegrations)
      .where(eq(tenantIntegrations.id, id))
      .limit(1);
    return row ?? null;
  }

  async findForOwner(
    scope: OwnerScope,
    provider: string,
    slug: string,
  ): Promise<TenantIntegrationRow | null> {
    const [row] = await this.db
      .select()
      .from(tenantIntegrations)
      .where(
        and(
          this.ownerWhere(scope),
          eq(tenantIntegrations.provider, provider),
          eq(tenantIntegrations.slug, slug),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async create(values: TenantIntegrationInsert): Promise<TenantIntegrationRow> {
    const [row] = await this.db
      .insert(tenantIntegrations)
      .values(values)
      .returning();
    return row;
  }

  async update(
    id: string,
    patch: Partial<TenantIntegrationInsert>,
  ): Promise<TenantIntegrationRow | null> {
    const [row] = await this.db
      .update(tenantIntegrations)
      .set({ ...patch, updatedAt: this.now() })
      .where(eq(tenantIntegrations.id, id))
      .returning();
    return row ?? null;
  }

  async remove(id: string): Promise<boolean> {
    const res = await this.db
      .delete(tenantIntegrations)
      .where(eq(tenantIntegrations.id, id))
      .returning({ id: tenantIntegrations.id });
    return res.length > 0;
  }
}
