/**
 * Promo-video projects between a customer and a creator: the source inquiry
 * + offering, the project row, its revisions, extra-revision purchases, the
 * auto-created 1:1 conversation. (The linked studio review comments are read
 * through studioReviewCommentsRepository.)
 */
import { and, desc, eq, or } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const {
  promoProjects,
  promoProjectRevisions,
  promoProjectExtraRevisionPurchases,
  serviceInquiries,
  serviceOfferings,
  conversations,
  conversationParticipants,
} = schema;

export type PromoProjectRow = typeof promoProjects.$inferSelect;
export type PromoProjectInsert = typeof promoProjects.$inferInsert;
export type PromoProjectPatch = Partial<PromoProjectInsert>;
export type PromoRevisionRow = typeof promoProjectRevisions.$inferSelect;
export type PromoRevisionInsert = typeof promoProjectRevisions.$inferInsert;
export type ExtraRevisionPurchaseInsert = typeof promoProjectExtraRevisionPurchases.$inferInsert;
export type ExtraRevisionPurchaseRow = typeof promoProjectExtraRevisionPurchases.$inferSelect;
export type ProjectListRole = "creator" | "customer" | "any";

export async function findInquiry(db: Db, inquiryId: string) {
  const [row] = await db.select().from(serviceInquiries).where(eq(serviceInquiries.id, inquiryId)).limit(1);
  return row ?? null;
}

export async function findOffering(db: Db, offeringId: string) {
  const [row] = await db.select().from(serviceOfferings).where(eq(serviceOfferings.id, offeringId)).limit(1);
  return row ?? null;
}

export async function markInquiryAccepted(db: Db, inquiryId: string): Promise<void> {
  await db
    .update(serviceInquiries)
    .set({ status: "accepted", updatedAt: new Date() })
    .where(eq(serviceInquiries.id, inquiryId));
}

/** Create the project's 1:1 conversation with both parties; returns its id. */
export async function createProjectConversation(
  db: Db,
  subject: string,
  customerId: string,
  creatorId: string,
): Promise<string> {
  const [conv] = await db
    .insert(conversations)
    .values({ subject, type: "promo_project" })
    .returning();
  await db.insert(conversationParticipants).values([
    { conversationId: conv.id, userId: customerId, role: "customer" },
    { conversationId: conv.id, userId: creatorId, role: "creator" },
  ]);
  return conv.id;
}

export async function insertProject(db: Db, values: PromoProjectInsert): Promise<PromoProjectRow> {
  const [project] = await db.insert(promoProjects).values(values).returning();
  return project;
}

export async function listProjectsForUser(db: Db, userId: string, role: ProjectListRole): Promise<PromoProjectRow[]> {
  const where =
    role === "creator"
      ? eq(promoProjects.creatorId, userId)
      : role === "customer"
        ? eq(promoProjects.customerId, userId)
        : or(eq(promoProjects.creatorId, userId), eq(promoProjects.customerId, userId));
  return db.select().from(promoProjects).where(where).orderBy(desc(promoProjects.createdAt));
}

export async function findProject(db: Db, projectId: string): Promise<PromoProjectRow | null> {
  const [row] = await db.select().from(promoProjects).where(eq(promoProjects.id, projectId)).limit(1);
  return row ?? null;
}

export async function updateProject(db: Db, projectId: string, patch: PromoProjectPatch): Promise<void> {
  await db.update(promoProjects).set(patch).where(eq(promoProjects.id, projectId));
}

export async function listRevisions(db: Db, projectId: string): Promise<PromoRevisionRow[]> {
  return db
    .select()
    .from(promoProjectRevisions)
    .where(eq(promoProjectRevisions.projectId, projectId))
    .orderBy(promoProjectRevisions.revisionNumber);
}

export async function insertRevision(db: Db, values: PromoRevisionInsert): Promise<PromoRevisionRow> {
  const [rev] = await db.insert(promoProjectRevisions).values(values).returning();
  return rev;
}

export async function findRevision(db: Db, revisionId: string, projectId: string): Promise<PromoRevisionRow | null> {
  const [row] = await db
    .select()
    .from(promoProjectRevisions)
    .where(and(eq(promoProjectRevisions.id, revisionId), eq(promoProjectRevisions.projectId, projectId)))
    .limit(1);
  return row ?? null;
}

export async function recordRevisionDecision(
  db: Db,
  revisionId: string,
  decision: string,
  feedback: string | null,
): Promise<void> {
  await db
    .update(promoProjectRevisions)
    .set({ customerDecision: decision, customerFeedback: feedback, decidedAt: new Date() })
    .where(eq(promoProjectRevisions.id, revisionId));
}

export async function insertExtraRevisionPurchase(db: Db, values: ExtraRevisionPurchaseInsert): Promise<ExtraRevisionPurchaseRow> {
  const [purchase] = await db.insert(promoProjectExtraRevisionPurchases).values(values).returning();
  return purchase;
}
