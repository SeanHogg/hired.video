/**
 * ProviderConnectionsRepository — the ONE data-access object for
 * `provider_connections` (W3-C, migration 0600): sign-in identities,
 * calendars, ATS, LMS, paid media, social (self + managed), inboxes,
 * YouTube, workforce connectors and pasted API keys.
 *
 * Pure persistence: no encryption, no status mapping, no authorization. The
 * per-purpose adapters (socialConnectionRepository, externalEmailAccounts
 * Repository, tenantIntegrationsRepository, services/provider-connections/
 * adapters/*) translate between this row and the shape each feature's API
 * already returns; secrets go through services/provider-connections/
 * connection-secrets.ts.
 */
import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { schema } from "../db/index.js";
import type {
  ProviderConnection,
  NewProviderConnection,
  ProviderConnectionOwnerKind,
  ProviderConnectionPurpose,
  ProviderConnectionStatus,
} from "../db/schema/providerConnections.js";
import type { ConnectionSecretColumn } from "../services/provider-connections/connection-secrets.js";

const { providerConnections: t } = schema;

export type DbLike = any;

export type ProviderConnectionRow = ProviderConnection;
export type ProviderConnectionInsert = NewProviderConnection;
export type ProviderConnectionPatch = Partial<Omit<NewProviderConnection, "id" | "createdAt">> & {
  /** Keys merged into `config` (jsonb `||`) instead of replacing it. */
  configMerge?: Record<string, unknown>;
};

/** Equality filter. `undefined` = don't filter; `null` = IS NULL. Arrays = IN. */
export interface ProviderConnectionFilter {
  id?: string;
  purpose?: ProviderConnectionPurpose | ProviderConnectionPurpose[];
  provider?: string;
  ownerKind?: ProviderConnectionOwnerKind;
  ownerId?: string | null;
  userId?: string | string[] | null;
  companyId?: string | null;
  externalAccountId?: string | null;
  status?: ProviderConnectionStatus;
  enabled?: boolean;
}

export interface ListOptions {
  orderBy?: "createdAt" | "updatedAt";
  direction?: "asc" | "desc";
  limit?: number;
}

export interface IProviderConnectionsRepository {
  findById(id: string): Promise<ProviderConnectionRow | null>;
  findOne(filter: ProviderConnectionFilter, opts?: ListOptions): Promise<ProviderConnectionRow | null>;
  list(filter: ProviderConnectionFilter, opts?: ListOptions): Promise<ProviderConnectionRow[]>;
  /** Escape hatch for an OR across owners (workspace lists). `where` is
   *  ANDed with the filter. */
  listWhere(filter: ProviderConnectionFilter, where: SQL | undefined, opts?: ListOptions): Promise<ProviderConnectionRow[]>;
  count(filter: ProviderConnectionFilter): Promise<number>;
  insert(values: ProviderConnectionInsert): Promise<ProviderConnectionRow>;
  /** Update every row matching `filter`; returns the updated rows. */
  update(filter: ProviderConnectionFilter, patch: ProviderConnectionPatch): Promise<ProviderConnectionRow[]>;
  updateById(id: string, patch: ProviderConnectionPatch): Promise<ProviderConnectionRow | null>;
  /** Find by `match`, update it with `patch`, or insert `values`. */
  upsert(
    match: ProviderConnectionFilter,
    values: ProviderConnectionInsert,
    patch: ProviderConnectionPatch,
  ): Promise<ProviderConnectionRow>;
  /** Delete every row matching `filter`; returns the deleted ids. */
  delete(filter: ProviderConnectionFilter): Promise<string[]>;
  /** Compare-and-set one secret column (lazy re-seal of a legacy value). */
  resealSecret(id: string, column: ConnectionSecretColumn, expected: string, next: string): Promise<void>;
}

/** The filter as a WHERE. Mutations require an id or a purpose so a bad
 *  call can never touch the whole table. */
export function connectionWhere(filter: ProviderConnectionFilter): SQL | undefined {
  const parts: SQL[] = [];
  const add = (cond: SQL | undefined) => {
    if (cond) parts.push(cond);
  };
  if (filter.id !== undefined) add(eq(t.id, filter.id));
  if (filter.purpose !== undefined) {
    add(Array.isArray(filter.purpose) ? inArray(t.purpose, filter.purpose) : eq(t.purpose, filter.purpose));
  }
  if (filter.provider !== undefined) add(eq(t.provider, filter.provider));
  if (filter.ownerKind !== undefined) add(eq(t.ownerKind, filter.ownerKind));
  if (filter.ownerId !== undefined) add(filter.ownerId === null ? isNull(t.ownerId) : eq(t.ownerId, filter.ownerId));
  if (filter.userId !== undefined) {
    if (filter.userId === null) add(isNull(t.userId));
    else if (Array.isArray(filter.userId)) add(filter.userId.length ? inArray(t.userId, filter.userId) : sql`false`);
    else add(eq(t.userId, filter.userId));
  }
  if (filter.companyId !== undefined) add(filter.companyId === null ? isNull(t.companyId) : eq(t.companyId, filter.companyId));
  if (filter.externalAccountId !== undefined) {
    add(filter.externalAccountId === null ? isNull(t.externalAccountId) : eq(t.externalAccountId, filter.externalAccountId));
  }
  if (filter.status !== undefined) add(eq(t.status, filter.status));
  if (filter.enabled !== undefined) add(eq(t.enabled, filter.enabled));
  return parts.length ? and(...parts) : undefined;
}

function assertScoped(filter: ProviderConnectionFilter): void {
  if (filter.id === undefined && filter.purpose === undefined) {
    throw new Error("provider_connections mutation needs an id or a purpose");
  }
}

function patchValues(patch: ProviderConnectionPatch, now: Date): Record<string, unknown> {
  const { configMerge, ...rest } = patch;
  const values: Record<string, unknown> = { ...rest, updatedAt: now };
  if (configMerge && Object.keys(configMerge).length > 0) {
    values.config = sql`${t.config} || ${JSON.stringify(configMerge)}::jsonb`;
  }
  return values;
}

export class ProviderConnectionsRepository implements IProviderConnectionsRepository {
  constructor(
    private readonly db: DbLike,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private ordered(query: any, opts: ListOptions = {}) {
    let q = query;
    if (opts.orderBy) {
      const col = opts.orderBy === "updatedAt" ? t.updatedAt : t.createdAt;
      q = q.orderBy(opts.direction === "asc" ? asc(col) : desc(col));
    }
    if (opts.limit) q = q.limit(opts.limit);
    return q;
  }

  async findById(id: string): Promise<ProviderConnectionRow | null> {
    const [row] = await this.db.select().from(t).where(eq(t.id, id)).limit(1);
    return row ?? null;
  }

  async findOne(filter: ProviderConnectionFilter, opts: ListOptions = {}): Promise<ProviderConnectionRow | null> {
    const rows = await this.list(filter, { ...opts, limit: 1 });
    return rows[0] ?? null;
  }

  async list(filter: ProviderConnectionFilter, opts: ListOptions = {}): Promise<ProviderConnectionRow[]> {
    return this.ordered(this.db.select().from(t).where(connectionWhere(filter)), opts);
  }

  async listWhere(
    filter: ProviderConnectionFilter,
    where: SQL | undefined,
    opts: ListOptions = {},
  ): Promise<ProviderConnectionRow[]> {
    const cond = where ? and(connectionWhere(filter), where) : connectionWhere(filter);
    return this.ordered(this.db.select().from(t).where(cond), opts);
  }

  async count(filter: ProviderConnectionFilter): Promise<number> {
    const [row] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(t)
      .where(connectionWhere(filter));
    const v = row?.total ?? 0;
    return typeof v === "string" ? Number(v) : v;
  }

  async insert(values: ProviderConnectionInsert): Promise<ProviderConnectionRow> {
    const [row] = await this.db.insert(t).values(values).returning();
    return row;
  }

  async update(filter: ProviderConnectionFilter, patch: ProviderConnectionPatch): Promise<ProviderConnectionRow[]> {
    assertScoped(filter);
    return this.db.update(t).set(patchValues(patch, this.now())).where(connectionWhere(filter)).returning();
  }

  async updateById(id: string, patch: ProviderConnectionPatch): Promise<ProviderConnectionRow | null> {
    const [row] = await this.update({ id }, patch);
    return row ?? null;
  }

  async upsert(
    match: ProviderConnectionFilter,
    values: ProviderConnectionInsert,
    patch: ProviderConnectionPatch,
  ): Promise<ProviderConnectionRow> {
    assertScoped(match);
    const existing = await this.findOne(match);
    if (existing) {
      return (await this.updateById(existing.id, patch)) ?? existing;
    }
    return this.insert(values);
  }

  async delete(filter: ProviderConnectionFilter): Promise<string[]> {
    assertScoped(filter);
    const rows: Array<{ id: string }> = await this.db
      .delete(t)
      .where(connectionWhere(filter))
      .returning({ id: t.id });
    return rows.map((r) => r.id);
  }

  async resealSecret(id: string, column: ConnectionSecretColumn, expected: string, next: string): Promise<void> {
    await this.db
      .update(t)
      .set({ [column]: next, updatedAt: this.now() })
      .where(and(eq(t.id, id), eq(t[column], expected)));
  }
}
