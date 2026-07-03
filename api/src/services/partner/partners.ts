/**
 * Partner record service — CRUD for the external-platform record. Partners are
 * provisioned by a SuperAdmin when a platform "requests API access".
 */
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";

const { partners } = schema;

export type PartnerRow = typeof partners.$inferSelect;

export interface PartnerView {
  id: string;
  name: string;
  slug: string;
  contactEmail: string | null;
  websiteUrl: string | null;
  logoUrl: string | null;
  status: string;
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
    status: row.status,
    createdAt: row.createdAt,
  };
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export interface CreatePartnerInput {
  name: string;
  slug?: string;
  contactEmail?: string | null;
  websiteUrl?: string | null;
  logoUrl?: string | null;
  createdBy?: string | null;
}

export async function createPartner(input: CreatePartnerInput, db = getDb()): Promise<PartnerView> {
  const baseSlug = slugify(input.slug || input.name) || `partner-${Date.now().toString(36)}`;
  // Ensure slug uniqueness — append a short suffix on collision.
  let slug = baseSlug;
  const existing = await db.select({ id: partners.id }).from(partners).where(eq(partners.slug, slug)).limit(1);
  if (existing.length > 0) {
    slug = `${baseSlug}-${crypto.randomUUID().slice(0, 6)}`;
  }
  const [row] = await db
    .insert(partners)
    .values({
      name: input.name,
      slug,
      contactEmail: input.contactEmail ?? null,
      websiteUrl: input.websiteUrl ?? null,
      logoUrl: input.logoUrl ?? null,
      createdBy: input.createdBy ?? null,
    } as any)
    .returning();
  return toPartnerView(row as PartnerRow);
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
