/**
 * ServiceMarketplaceRepository — the lead-gen services aggregate:
 * `service_offerings` (a provider's menu of services) and
 * `service_inquiries` (buyer inquiries / purchase intents against them).
 * Typed Drizzle wrappers only; rules live in services/service-marketplace/.
 *
 * (The promo-project flow reads single inquiry/offering rows through
 * creatorProjectsRepository.)
 */
import { and, desc, eq } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const { serviceOfferings, serviceInquiries, users, userProfiles } = schema;

export type ServiceOfferingRow = typeof serviceOfferings.$inferSelect;
export type ServiceOfferingInsert = typeof serviceOfferings.$inferInsert;
export type ServiceOfferingPatch = Partial<ServiceOfferingInsert>;
export type ServiceInquiryRow = typeof serviceInquiries.$inferSelect;
export type ServiceInquiryInsert = typeof serviceInquiries.$inferInsert;

// ── Offerings ───────────────────────────────────────────────────────────────

export function listOfferingsByOwner(db: Db, userId: string): Promise<ServiceOfferingRow[]> {
  return db
    .select()
    .from(serviceOfferings)
    .where(eq(serviceOfferings.userId, userId))
    .orderBy(desc(serviceOfferings.createdAt));
}

export async function insertOffering(db: Db, values: ServiceOfferingInsert): Promise<ServiceOfferingRow> {
  const [row] = await db.insert(serviceOfferings).values(values).returning();
  return row;
}

/** True when the offering exists and belongs to `userId`. */
export async function isOfferingOwnedBy(db: Db, offeringId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: serviceOfferings.id })
    .from(serviceOfferings)
    .where(and(eq(serviceOfferings.id, offeringId), eq(serviceOfferings.userId, userId)))
    .limit(1);
  return Boolean(row);
}

export async function updateOffering(
  db: Db,
  offeringId: string,
  patch: ServiceOfferingPatch,
): Promise<ServiceOfferingRow | undefined> {
  const [row] = await db
    .update(serviceOfferings)
    .set(patch)
    .where(eq(serviceOfferings.id, offeringId))
    .returning();
  return row;
}

export async function deleteOffering(db: Db, offeringId: string): Promise<void> {
  await db.delete(serviceOfferings).where(eq(serviceOfferings.id, offeringId));
}

/** An active offering by id, or null. */
export async function findActiveOffering(db: Db, offeringId: string): Promise<ServiceOfferingRow | null> {
  const [row] = await db
    .select()
    .from(serviceOfferings)
    .where(and(eq(serviceOfferings.id, offeringId), eq(serviceOfferings.isActive, true)))
    .limit(1);
  return row ?? null;
}

export async function findOfferingTitle(db: Db, offeringId: string): Promise<string | null> {
  const [row] = await db
    .select({ title: serviceOfferings.title })
    .from(serviceOfferings)
    .where(eq(serviceOfferings.id, offeringId))
    .limit(1);
  return row?.title ?? null;
}

/** A provider's active offerings, oldest first (public profile list). */
export function listActiveOfferingsByOwner(db: Db, userId: string): Promise<ServiceOfferingRow[]> {
  return db
    .select()
    .from(serviceOfferings)
    .where(and(eq(serviceOfferings.userId, userId), eq(serviceOfferings.isActive, true)))
    .orderBy(serviceOfferings.createdAt);
}

/** Active offerings from verified providers, platform services first. */
export function listBrowseOfferings(db: Db, limit: number) {
  return db
    .select({
      service: serviceOfferings,
      provider: { id: users.id, name: users.name },
      providerProfile: { avatarUrl: userProfiles.avatarUrl, customUrlSlug: userProfiles.customUrlSlug },
    })
    .from(serviceOfferings)
    .innerJoin(users, eq(serviceOfferings.userId, users.id))
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(and(eq(serviceOfferings.isActive, true), eq(users.emailVerified, true)))
    .orderBy(desc(serviceOfferings.isPlatformService), desc(serviceOfferings.createdAt))
    .limit(limit);
}

// ── Inquiries ───────────────────────────────────────────────────────────────

/** Inquiries where `providerId` is the provider, newest first, with buyer. */
export function listIncomingInquiries(db: Db, providerId: string) {
  return db
    .select({
      inquiry: serviceInquiries,
      service: {
        id: serviceOfferings.id,
        title: serviceOfferings.title,
        priceCents: serviceOfferings.priceCents,
      },
      buyer: { id: users.id, name: users.name, email: users.email },
    })
    .from(serviceInquiries)
    .innerJoin(serviceOfferings, eq(serviceInquiries.serviceId, serviceOfferings.id))
    .innerJoin(users, eq(serviceInquiries.fromUserId, users.id))
    .where(eq(serviceInquiries.providerId, providerId))
    .orderBy(desc(serviceInquiries.createdAt));
}

/** Inquiries `buyerId` submitted, newest first, with provider. */
export function listOutgoingInquiries(db: Db, buyerId: string) {
  return db
    .select({
      inquiry: serviceInquiries,
      service: {
        id: serviceOfferings.id,
        title: serviceOfferings.title,
        priceCents: serviceOfferings.priceCents,
        priceVisible: serviceOfferings.priceVisible,
      },
      provider: { id: users.id, name: users.name },
    })
    .from(serviceInquiries)
    .innerJoin(serviceOfferings, eq(serviceInquiries.serviceId, serviceOfferings.id))
    .innerJoin(users, eq(serviceInquiries.providerId, users.id))
    .where(eq(serviceInquiries.fromUserId, buyerId))
    .orderBy(desc(serviceInquiries.createdAt));
}

export async function insertInquiry(db: Db, values: ServiceInquiryInsert): Promise<ServiceInquiryRow> {
  const [row] = await db.insert(serviceInquiries).values(values).returning();
  return row;
}

/** The inquiry when `providerId` is its provider, else null. */
export async function findProviderInquiry(
  db: Db,
  inquiryId: string,
  providerId: string,
): Promise<ServiceInquiryRow | null> {
  const [row] = await db
    .select()
    .from(serviceInquiries)
    .where(and(eq(serviceInquiries.id, inquiryId), eq(serviceInquiries.providerId, providerId)))
    .limit(1);
  return row ?? null;
}

export async function updateInquiryStatus(
  db: Db,
  inquiryId: string,
  status: string,
): Promise<ServiceInquiryRow | undefined> {
  const [row] = await db
    .update(serviceInquiries)
    .set({ status, updatedAt: new Date() })
    .where(eq(serviceInquiries.id, inquiryId))
    .returning();
  return row;
}
