/**
 * Partner record service — CRUD for the external-platform record. Partners are
 * provisioned by a SuperAdmin when a platform "requests API access".
 */
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { slugify } from "../../../../shared/slugify.js";

const { partners } = schema;

export type PartnerRow = typeof partners.$inferSelect;

export interface PartnerView {
  id: string;
  name: string;
  slug: string;
  contactEmail: string | null;
  websiteUrl: string | null;
  logoUrl: string | null;
  ownerUserId: string | null;
  requestNote: string | null;
  status: string;
  approvedAt: Date | null;
  createdAt: Date;
}

export function toPartnerView(row: PartnerRow): PartnerView {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    contactEmail: row.contactEmail,
    websiteUrl: row.websiteUrl,
    logoUrl: row.logoUrl,
    ownerUserId: row.ownerUserId,
    requestNote: row.requestNote,
    status: row.status,
    approvedAt: row.approvedAt,
    createdAt: row.createdAt,
  };
}

async function uniqueSlug(base: string, db: ReturnType<typeof getDb>): Promise<string> {
  const baseSlug = slugify(base, { fallback: () => `partner-${Date.now().toString(36)}` });
  const existing = await db
    .select({ id: partners.id })
    .from(partners)
    .where(eq(partners.slug, baseSlug))
    .limit(1);
  return existing.length > 0 ? `${baseSlug}-${crypto.randomUUID().slice(0, 6)}` : baseSlug;
}

export interface CreatePartnerInput {
  name: string;
  slug?: string;
  contactEmail?: string | null;
  websiteUrl?: string | null;
  logoUrl?: string | null;
  createdBy?: string | null;
  /** Admin-provisioned partners are active immediately; requests are pending. */
  status?: "active" | "pending";
}

/** Admin-provisioned partner (active immediately). */
export async function createPartner(input: CreatePartnerInput, db = getDb()): Promise<PartnerView> {
  const slug = await uniqueSlug(input.slug || input.name, db);
  const status = input.status ?? "active";
  const [row] = await db
    .insert(partners)
    .values({
      name: input.name,
      slug,
      contactEmail: input.contactEmail ?? null,
      websiteUrl: input.websiteUrl ?? null,
      logoUrl: input.logoUrl ?? null,
      status,
      approvedAt: status === "active" ? new Date() : null,
      createdBy: input.createdBy ?? null,
    } as any)
    .returning();
  return toPartnerView(row as PartnerRow);
}

export interface RequestPartnerInput {
  ownerUserId: string;
  name: string;
  contactEmail?: string | null;
  websiteUrl?: string | null;
  requestNote?: string | null;
}

/** Self-service partner-access request from an account owner → status pending. */
export async function requestPartner(input: RequestPartnerInput, db = getDb()): Promise<PartnerView> {
  const slug = await uniqueSlug(input.name, db);
  const [row] = await db
    .insert(partners)
    .values({
      name: input.name,
      slug,
      contactEmail: input.contactEmail ?? null,
      websiteUrl: input.websiteUrl ?? null,
      ownerUserId: input.ownerUserId,
      requestNote: input.requestNote ?? null,
      status: "pending",
    } as any)
    .returning();
  return toPartnerView(row as PartnerRow);
}

/** The partner owned by a given account owner (self-service surface). */
export async function getPartnerByOwner(ownerUserId: string, db = getDb()): Promise<PartnerView | null> {
  const [row] = await db
    .select()
    .from(partners)
    .where(eq(partners.ownerUserId, ownerUserId))
    .orderBy(desc(partners.createdAt))
    .limit(1);
  return row ? toPartnerView(row as PartnerRow) : null;
}

export async function approvePartner(
  partnerId: string,
  approvedBy: string,
  db = getDb(),
): Promise<PartnerView | null> {
  const [row] = await db
    .update(partners)
    .set({ status: "active", approvedAt: new Date(), approvedBy, updatedAt: new Date() } as any)
    .where(eq(partners.id, partnerId))
    .returning();
  return row ? toPartnerView(row as PartnerRow) : null;
}

export async function rejectPartner(partnerId: string, db = getDb()): Promise<PartnerView | null> {
  const [row] = await db
    .update(partners)
    .set({ status: "rejected", updatedAt: new Date() } as any)
    .where(eq(partners.id, partnerId))
    .returning();
  return row ? toPartnerView(row as PartnerRow) : null;
}

export async function listPartnersByStatus(status: string, db = getDb()): Promise<PartnerView[]> {
  const rows = await db
    .select()
    .from(partners)
    .where(eq(partners.status, status))
    .orderBy(desc(partners.createdAt));
  return rows.map((r) => toPartnerView(r as PartnerRow));
}

export async function getPartner(partnerId: string, db = getDb()): Promise<PartnerView | null> {
  const [row] = await db.select().from(partners).where(eq(partners.id, partnerId)).limit(1);
  return row ? toPartnerView(row as PartnerRow) : null;
}

export async function listPartners(db = getDb()): Promise<PartnerView[]> {
  const rows = await db.select().from(partners).orderBy(desc(partners.createdAt));
  return rows.map((r) => toPartnerView(r as PartnerRow));
}

export async function setPartnerStatus(
  partnerId: string,
  status: "active" | "suspended",
  db = getDb(),
): Promise<boolean> {
  const rows = await db
    .update(partners)
    .set({ status, updatedAt: new Date() } as any)
    .where(eq(partners.id, partnerId))
    .returning({ id: partners.id });
  return rows.length > 0;
}
