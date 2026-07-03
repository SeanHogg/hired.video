/**
 * Partner connection service — the SSoT for "does this partner have permission
 * to act on this Hired.Video user". A connection is created either:
 *   - `partner_created`: the partner made the account → auto `active`, or
 *   - `connected`: an existing account → starts `pending`, activated only when
 *     the job seeker gives explicit consent (see routes/partner-consent.ts).
 *
 * The job seeker can revoke at any time, which flips status to `revoked` and
 * cuts off reads/embeds immediately.
 */
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { invalidateCachedKey } from "../../utils/edge-cache.js";
import type {
  PartnerConnectionSource,
  PartnerScope,
} from "../../../../shared/partner.js";

const { partnerConnections, partners, users } = schema;

export type PartnerConnectionRow = typeof partnerConnections.$inferSelect;

export interface PartnerConnectionView {
  id: string;
  partnerId: string;
  userId: string;
  externalUserId: string | null;
  source: string;
  status: string;
  scopes: string[];
  consentAgreedAt: Date | null;
  createdAt: Date;
}

export function toConnectionView(row: PartnerConnectionRow): PartnerConnectionView {
  return {
    id: row.id,
    partnerId: row.partnerId,
    userId: row.userId,
    externalUserId: row.externalUserId,
    source: row.source,
    status: row.status,
    scopes: row.scopes as string[],
    consentAgreedAt: row.consentAgreedAt,
    createdAt: row.createdAt,
  };
}

/** Cache key for a partner's read-through view of a user's profile. Kept here
 *  so both the reader (jobSeekers.getProfileForPartner) and every writer that
 *  must bust it (resume create, connection revoke) reference ONE key. */
export function partnerProfileCacheKey(partnerId: string, userId: string): string {
  return `partner:profile:${partnerId}:${userId}`;
}

export async function getConnection(
  partnerId: string,
  userId: string,
  db = getDb(),
): Promise<PartnerConnectionRow | null> {
  const [row] = await db
    .select()
    .from(partnerConnections)
    .where(and(eq(partnerConnections.partnerId, partnerId), eq(partnerConnections.userId, userId)))
    .limit(1);
  return (row as PartnerConnectionRow) ?? null;
}

export async function getConnectionById(
  connectionId: string,
  db = getDb(),
): Promise<PartnerConnectionRow | null> {
  const [row] = await db
    .select()
    .from(partnerConnections)
    .where(eq(partnerConnections.id, connectionId))
    .limit(1);
  return (row as PartnerConnectionRow) ?? null;
}

export interface UpsertConnectionInput {
  partnerId: string;
  userId: string;
  source: PartnerConnectionSource;
  scopes: PartnerScope[];
  externalUserId?: string | null;
  /** partner_created → active immediately; connected → pending until consent. */
  activate?: boolean;
  consentIp?: string | null;
}

/** Create the connection row, or refresh an existing one (re-connect). */
export async function upsertConnection(
  input: UpsertConnectionInput,
  db = getDb(),
): Promise<PartnerConnectionRow> {
  const existing = await getConnection(input.partnerId, input.userId, db);
  const status = input.activate ? "active" : "pending";
  const consentAgreedAt = input.activate ? new Date() : null;
  if (existing) {
    const [row] = await db
      .update(partnerConnections)
      .set({
        source: input.source,
        scopes: input.scopes,
        externalUserId: input.externalUserId ?? existing.externalUserId,
        status,
        consentAgreedAt: consentAgreedAt ?? existing.consentAgreedAt,
        consentIp: input.consentIp ?? existing.consentIp,
        revokedAt: null,
        updatedAt: new Date(),
      } as any)
      .where(eq(partnerConnections.id, existing.id))
      .returning();
    invalidateCachedKey(partnerProfileCacheKey(input.partnerId, input.userId));
    return row as PartnerConnectionRow;
  }
  const [row] = await db
    .insert(partnerConnections)
    .values({
      partnerId: input.partnerId,
      userId: input.userId,
      externalUserId: input.externalUserId ?? null,
      source: input.source,
      status,
      scopes: input.scopes,
      consentAgreedAt,
      consentIp: input.consentIp ?? null,
    } as any)
    .returning();
  return row as PartnerConnectionRow;
}

/** Job seeker approves a pending connection (or re-approves a revoked one). */
export async function activateConnection(
  connectionId: string,
  consentIp: string | null,
  db = getDb(),
): Promise<PartnerConnectionRow | null> {
  const [row] = await db
    .update(partnerConnections)
    .set({
      status: "active",
      consentAgreedAt: new Date(),
      consentIp,
      revokedAt: null,
      updatedAt: new Date(),
    } as any)
    .where(eq(partnerConnections.id, connectionId))
    .returning();
  if (row) {
    invalidateCachedKey(
      partnerProfileCacheKey((row as PartnerConnectionRow).partnerId, (row as PartnerConnectionRow).userId),
    );
  }
  return (row as PartnerConnectionRow) ?? null;
}

/** Revoke — cuts off partner reads/embeds immediately. */
export async function revokeConnection(
  connectionId: string,
  db = getDb(),
): Promise<PartnerConnectionRow | null> {
  const [row] = await db
    .update(partnerConnections)
    .set({ status: "revoked", revokedAt: new Date(), updatedAt: new Date() } as any)
    .where(eq(partnerConnections.id, connectionId))
    .returning();
  if (row) {
    invalidateCachedKey(
      partnerProfileCacheKey((row as PartnerConnectionRow).partnerId, (row as PartnerConnectionRow).userId),
    );
  }
  return (row as PartnerConnectionRow) ?? null;
}

/**
 * Assert an ACTIVE connection exists for (partner, user). Throws so route
 * handlers can convert to a 403. The single gate every partner read/write on a
 * specific user runs behind.
 */
export class ConnectionRequiredError extends Error {
  constructor(message = "No active connection for this user. The job seeker must approve access first.") {
    super(message);
  }
}

export async function requireActiveConnection(
  partnerId: string,
  userId: string,
  db = getDb(),
): Promise<PartnerConnectionRow> {
  const conn = await getConnection(partnerId, userId, db);
  if (!conn || conn.status !== "active") throw new ConnectionRequiredError();
  return conn;
}

/** List a partner's connections (for the partner API `read:connections`). */
export async function listConnectionsForPartner(
  partnerId: string,
  db = getDb(),
): Promise<PartnerConnectionView[]> {
  const rows = await db
    .select()
    .from(partnerConnections)
    .where(eq(partnerConnections.partnerId, partnerId))
    .orderBy(desc(partnerConnections.createdAt));
  return rows.map((r) => toConnectionView(r as PartnerConnectionRow));
}

export interface UserConnectionView extends PartnerConnectionView {
  partnerName: string;
  partnerSlug: string;
  partnerLogoUrl: string | null;
  partnerWebsiteUrl: string | null;
}

/** List a user's connected partners (for the job seeker's management surface). */
export async function listConnectionsForUser(
  userId: string,
  db = getDb(),
): Promise<UserConnectionView[]> {
  const rows = await db
    .select({
      conn: partnerConnections,
      partnerName: partners.name,
      partnerSlug: partners.slug,
      partnerLogoUrl: partners.logoUrl,
      partnerWebsiteUrl: partners.websiteUrl,
    })
    .from(partnerConnections)
    .innerJoin(partners, eq(partners.id, partnerConnections.partnerId))
    .where(eq(partnerConnections.userId, userId))
    .orderBy(desc(partnerConnections.createdAt));
  return rows.map((r) => ({
    ...toConnectionView(r.conn as PartnerConnectionRow),
    partnerName: r.partnerName,
    partnerSlug: r.partnerSlug,
    partnerLogoUrl: r.partnerLogoUrl,
    partnerWebsiteUrl: r.partnerWebsiteUrl,
  }));
}

/** Resolve a user by email (for connect-existing-account). Returns id + name. */
export async function findUserByEmail(
  email: string,
  db = getDb(),
): Promise<{ id: string; name: string; email: string } | null> {
  const [row] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.email, email.toLowerCase().trim()))
    .limit(1);
  return row ?? null;
}
