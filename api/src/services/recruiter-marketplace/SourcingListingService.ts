/**
 * SourcingListingService — domain operations on the JobSourcingListing
 * aggregate (companies opening a job to external recruiter bids) plus the
 * bid lifecycle on the related boardBids rows.
 *
 * The Listing is its own aggregate (1:1 with a Job, see `jobSourcingListings`).
 * Bids live in `boardBids` keyed by jobId; this service brokers between the
 * two so routes stay transport-only.
 *
 * NB: not to be confused with `services/sourcing/*` — that's the contact
 * enrichment pipeline (looking up emails / phone numbers for a person).
 * This one is the recruiter marketplace (companies bid out their job to
 * external recruiters).
 */
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";

export interface SourcingConfig {
  acceptsBids: boolean;
  feeCents: number | null;
  deadline: string | null;
  terms: string | null;
}

const EMPTY_CONFIG: SourcingConfig = {
  acceptsBids: false,
  feeCents: null,
  deadline: null,
  terms: null,
};

function rowToConfig(row: typeof schema.jobSourcingListings.$inferSelect | undefined): SourcingConfig {
  if (!row) return EMPTY_CONFIG;
  return {
    acceptsBids: row.acceptsBids,
    feeCents: row.feeCents,
    deadline: row.deadline ? row.deadline.toISOString() : null,
    terms: row.terms,
  };
}

export async function getConfig(jobId: string): Promise<SourcingConfig> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.jobSourcingListings)
    .where(eq(schema.jobSourcingListings.jobId, jobId))
    .limit(1);
  return rowToConfig(row);
}

export interface UpsertConfigInput {
  jobId: string;
  acceptsBids: boolean;
  feeCents: number | null;
  deadline: string | null;
  terms: string | null;
  actorUserId: string;
}

export async function upsertConfig(input: UpsertConfigInput): Promise<SourcingConfig> {
  const db = getDb();
  const now = new Date();
  const deadlineDate = input.deadline ? new Date(input.deadline) : null;

  const [row] = await db
    .insert(schema.jobSourcingListings)
    .values({
      jobId: input.jobId,
      acceptsBids: input.acceptsBids,
      feeCents: input.feeCents,
      deadline: deadlineDate,
      terms: input.terms,
      createdByUserId: input.actorUserId,
    } as typeof schema.jobSourcingListings.$inferInsert)
    .onConflictDoUpdate({
      target: schema.jobSourcingListings.jobId,
      set: {
        acceptsBids: input.acceptsBids,
        feeCents: input.feeCents,
        deadline: deadlineDate,
        terms: input.terms,
        updatedAt: now,
      } as Partial<typeof schema.jobSourcingListings.$inferInsert>,
    })
    .returning();

  return rowToConfig(row);
}

export async function listOpenSourcingJobs() {
  const db = getDb();
  return db
    .select({
      id: schema.jobItems.id,
      title: schema.jobItems.title,
      company: schema.jobItems.company,
      location: schema.jobItems.location,
      isRemote: schema.jobItems.isRemote,
      salaryMin: schema.jobItems.salaryMin,
      salaryMax: schema.jobItems.salaryMax,
      sourcingFeeCents: schema.jobSourcingListings.feeCents,
      sourcingDeadline: schema.jobSourcingListings.deadline,
      sourcingTerms: schema.jobSourcingListings.terms,
      createdAt: schema.jobItems.createdAt,
    })
    .from(schema.jobSourcingListings)
    .innerJoin(schema.jobItems, eq(schema.jobItems.id, schema.jobSourcingListings.jobId))
    .where(
      and(
        eq(schema.jobSourcingListings.acceptsBids, true),
        eq(schema.jobItems.isActive, true),
      ),
    )
    .orderBy(desc(schema.jobItems.createdAt))
    .limit(100);
}

export async function listMyBids(userId: string) {
  const db = getDb();
  return db
    .select({
      bid: schema.boardBids,
      job: {
        id: schema.jobItems.id,
        title: schema.jobItems.title,
        company: schema.jobItems.company,
        sourcingFeeCents: schema.jobSourcingListings.feeCents,
      },
    })
    .from(schema.boardBids)
    .leftJoin(schema.jobItems, eq(schema.boardBids.jobId, schema.jobItems.id))
    .leftJoin(schema.jobSourcingListings, eq(schema.jobSourcingListings.jobId, schema.boardBids.jobId))
    .where(and(eq(schema.boardBids.bidderId, userId), isNotNull(schema.boardBids.jobId)))
    .orderBy(desc(schema.boardBids.createdAt));
}

export async function listBidsForJob(jobId: string) {
  const db = getDb();
  return db
    .select()
    .from(schema.boardBids)
    .where(and(eq(schema.boardBids.jobId, jobId), isNotNull(schema.boardBids.jobId)))
    .orderBy(desc(schema.boardBids.createdAt));
}

export interface PlaceBidInput {
  jobId: string;
  bidderId: string;
  bidAmount: number;
  proposalText: string;
  durationDays: number;
}

export type PlaceBidResult =
  | { ok: true; bid: typeof schema.boardBids.$inferSelect }
  | { ok: false; reason: "NOT_OPEN" | "DEADLINE_PASSED" | "OWN_JOB" | "BID_EXISTS" };

export async function placeBid(input: PlaceBidInput, jobOwnerId: string | null): Promise<PlaceBidResult> {
  const db = getDb();

  if (jobOwnerId === input.bidderId) return { ok: false, reason: "OWN_JOB" };

  const [config] = await db
    .select()
    .from(schema.jobSourcingListings)
    .where(eq(schema.jobSourcingListings.jobId, input.jobId))
    .limit(1);
  if (!config?.acceptsBids) return { ok: false, reason: "NOT_OPEN" };
  if (config.deadline && new Date(config.deadline) < new Date()) {
    return { ok: false, reason: "DEADLINE_PASSED" };
  }

  const [existing] = await db
    .select({ id: schema.boardBids.id })
    .from(schema.boardBids)
    .where(
      and(
        eq(schema.boardBids.jobId, input.jobId),
        eq(schema.boardBids.bidderId, input.bidderId),
        eq(schema.boardBids.status, "pending"),
      ),
    )
    .limit(1);
  if (existing) return { ok: false, reason: "BID_EXISTS" };

  const [bid] = await db
    .insert(schema.boardBids)
    .values({
      jobId: input.jobId,
      bidderId: input.bidderId,
      bidAmount: String(input.bidAmount),
      durationDays: input.durationDays,
      proposalText: input.proposalText,
      status: "pending",
    } as typeof schema.boardBids.$inferInsert)
    .returning();

  return { ok: true, bid };
}

export async function acceptBid(bidId: string, accepterUserId: string) {
  const db = getDb();
  const now = new Date();
  const [updated] = await db
    .update(schema.boardBids)
    .set({
      status: "accepted",
      approvedAt: now,
      approvedByUserId: accepterUserId,
      updatedAt: now,
    } as Partial<typeof schema.boardBids.$inferInsert>)
    .where(eq(schema.boardBids.id, bidId))
    .returning();

  if (updated?.jobId) {
    // Auto-reject competing pending bids on the same job (one winner).
    await db
      .update(schema.boardBids)
      .set({
        status: "rejected",
        rejectionReason: "Another bid was accepted",
        updatedAt: now,
      } as Partial<typeof schema.boardBids.$inferInsert>)
      .where(
        and(
          eq(schema.boardBids.jobId, updated.jobId),
          eq(schema.boardBids.status, "pending"),
          sql`${schema.boardBids.id} <> ${bidId}`,
        ),
      );

    // Snapshot winner on the listing aggregate.
    await db
      .update(schema.jobSourcingListings)
      .set({
        winningBidderId: updated.bidderId,
        updatedAt: now,
      } as Partial<typeof schema.jobSourcingListings.$inferInsert>)
      .where(eq(schema.jobSourcingListings.jobId, updated.jobId));
  }

  return updated;
}

export async function rejectBid(bidId: string, rejectionReason: string | null) {
  const db = getDb();
  const [updated] = await db
    .update(schema.boardBids)
    .set({
      status: "rejected",
      rejectionReason,
      updatedAt: new Date(),
    } as Partial<typeof schema.boardBids.$inferInsert>)
    .where(eq(schema.boardBids.id, bidId))
    .returning();
  return updated;
}

export async function withdrawBid(bidId: string) {
  const db = getDb();
  const [updated] = await db
    .update(schema.boardBids)
    .set({ status: "withdrawn", updatedAt: new Date() } as Partial<
      typeof schema.boardBids.$inferInsert
    >)
    .where(eq(schema.boardBids.id, bidId))
    .returning();
  return updated;
}

export async function getBid(bidId: string) {
  const db = getDb();
  const [bid] = await db
    .select()
    .from(schema.boardBids)
    .where(eq(schema.boardBids.id, bidId))
    .limit(1);
  return bid;
}
