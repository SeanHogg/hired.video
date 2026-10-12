/**
 * request-service — orchestrates a screening request's lifecycle:
 *
 *   create  → snapshot a template's items onto the request, mint a magic-link
 *             token, and PRE-SATISFY any item the candidate already has on file
 *             (pitch-book resolver) so the portal only asks for what's missing.
 *   read    → resolve a request by token for the public portal (expiry-aware).
 *   claim   → bind the candidate's user id once they're signed in and re-run the
 *             resolver against still-outstanding items (pull-don't-ask).
 *   satisfy → mark one item complete with a pointer to the produced artifact,
 *             then recompute the request's required-items gate.
 *
 * Company authorization is enforced in the route; this module trusts the
 * companyId it's given. Items always come from a saved template (the per-role
 * checklist the recruiter authored) — the always-required floor was enforced
 * when that template was written.
 */

import { randomBytes } from "crypto";
import { asc, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { schema } from "../../db/index.js";
import {
  ScreeningItemConfigSchema,
  type ScreeningItemType,
  type ScreeningRequestStatus,
} from "../../../../shared/screening.js";
import {
  checkItemSatisfied,
  resolveCandidateUserId,
  type PitchBookItem,
} from "./pitch-book-resolver.js";
import { getTemplateWithItems } from "./template-service.js";
import {
  insertScreeningRequestItems,
  markScreeningItemsPreSatisfied,
} from "../../repositories/screeningRequestItemsRepository.js";

const { screeningRequests, screeningRequestItems } = schema;

const TOKEN_BYTES = 24; // 48 hex chars — fits varchar(64), unguessable bearer.

function newToken(): string {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

/** Parse a stored jsonb config back into the typed shape (it was validated at
 *  template-write time; this just narrows it for the resolver). */
function asPitchBookItem(row: {
  itemType: string;
  refId: string | null;
  config: unknown;
}): PitchBookItem {
  return {
    itemType: row.itemType as ScreeningItemType,
    refId: row.refId,
    config: ScreeningItemConfigSchema.parse(row.config ?? {}),
  };
}

export interface CreateRequestArgs {
  companyId: string;
  createdByUserId: string | null;
  templateId: string;
  jobId?: string | null;
  applicationId?: string | null;
  candidateEmail: string;
  candidateName?: string | null;
  candidateUserId?: string | null;
  message?: string | null;
  expiresInDays?: number;
}

export interface RequestWithItems {
  request: typeof screeningRequests.$inferSelect;
  items: Array<typeof screeningRequestItems.$inferSelect>;
}

/**
 * Create a request from a template. Returns null when the template doesn't exist
 * or doesn't belong to the company (caller → 404/403). On success returns the
 * request, its snapshot items, and the candidate-facing magic link path.
 */
export async function createScreeningRequest(
  db: Db,
  args: CreateRequestArgs,
): Promise<(RequestWithItems & { magicLink: string }) | null> {
  const loaded = await getTemplateWithItems(db, args.templateId);
  if (!loaded || loaded.template.companyId !== args.companyId) return null;

  const candidateUserId = await resolveCandidateUserId(
    db,
    args.candidateUserId ?? null,
    args.candidateEmail,
  );

  const token = newToken();
  const now = new Date();
  const expiresInDays = args.expiresInDays ?? 14;
  const tokenExpiresAt = new Date(now.getTime() + expiresInDays * 86_400_000);

  const [request] = await db
    .insert(screeningRequests)
    .values({
      companyId: args.companyId,
      createdByUserId: args.createdByUserId,
      templateId: args.templateId,
      jobId: args.jobId ?? loaded.template.jobId ?? null,
      applicationId: args.applicationId ?? null,
      candidateUserId,
      candidateEmail: args.candidateEmail.toLowerCase(),
      candidateName: args.candidateName ?? null,
      token,
      tokenExpiresAt,
      status: "pending",
      message: args.message ?? null,
    })
    .returning();

  // Snapshot template items → request items, pre-satisfying what's on file.
  // Resolver checks run concurrently; the snapshot is ONE multi-row insert.
  const pitches = await Promise.all(
    loaded.items.map((tItem) => checkItemSatisfied(db, candidateUserId, asPitchBookItem(tItem))),
  );
  await insertScreeningRequestItems(
    db,
    loaded.items.map((tItem, i) => {
      const pitch = pitches[i]!;
      return {
        requestId: request!.id,
        itemType: tItem.itemType,
        refId: tItem.refId,
        config: tItem.config,
        isRequired: tItem.isRequired,
        displayOrder: tItem.displayOrder,
        status: pitch.satisfied ? "satisfied" : "outstanding",
        satisfiedSource: pitch.satisfied ? "pre_existing" : null,
        resultRef: pitch.resultRef ?? null,
        satisfiedAt: pitch.satisfied ? now : null,
      };
    }),
  );

  // Pre-satisfaction may already clear every required item; reflect that.
  await recomputeStatus(db, request!.id);
  const out = (await loadByToken(db, token))!;
  return { ...out, magicLink: `/screening/${token}` };
}

/** Load a request + ordered items by token (no expiry handling). */
async function loadByToken(db: Db, token: string): Promise<RequestWithItems | null> {
  const [request] = await db
    .select()
    .from(screeningRequests)
    .where(eq(screeningRequests.token, token))
    .limit(1);
  if (!request) return null;
  const items = await db
    .select()
    .from(screeningRequestItems)
    .where(eq(screeningRequestItems.requestId, request.id))
    .orderBy(asc(screeningRequestItems.displayOrder));
  return { request, items };
}

/**
 * Resolve a request for the public portal. Stamps `expired` (terminal) when the
 * token has lapsed and the request isn't already completed. Returns null when
 * no such token exists.
 */
export async function getRequestByToken(
  db: Db,
  token: string,
): Promise<RequestWithItems | null> {
  const loaded = await loadByToken(db, token);
  if (!loaded) return null;
  const { request } = loaded;
  const expired =
    request.tokenExpiresAt.getTime() < Date.now() &&
    request.status !== "completed";
  if (expired && request.status !== "expired") {
    await db
      .update(screeningRequests)
      .set({ status: "expired", updatedAt: new Date() })
      .where(eq(screeningRequests.id, request.id));
    return loadByToken(db, token);
  }
  return loaded;
}

/**
 * Bind the candidate's signed-in user id to the request and re-run the resolver
 * against still-outstanding items — completing any the candidate turns out to
 * already have once we know who they are.
 */
export async function claimRequest(
  db: Db,
  token: string,
  userId: string,
): Promise<RequestWithItems | null> {
  const loaded = await getRequestByToken(db, token);
  if (!loaded || loaded.request.status === "expired") return loaded;

  if (loaded.request.candidateUserId !== userId) {
    await db
      .update(screeningRequests)
      .set({ candidateUserId: userId, updatedAt: new Date() })
      .where(eq(screeningRequests.id, loaded.request.id));
  }

  // Resolver checks run concurrently; newly satisfied items are written in
  // ONE statement (was a sequential check + update per item).
  const now = new Date();
  const outstanding = loaded.items.filter((item) => item.status === "outstanding");
  const pitches = await Promise.all(
    outstanding.map((item) => checkItemSatisfied(db, userId, asPitchBookItem(item))),
  );
  await markScreeningItemsPreSatisfied(
    db,
    outstanding.flatMap((item, i) =>
      pitches[i]!.satisfied ? [{ id: item.id, resultRef: pitches[i]!.resultRef ?? null }] : [],
    ),
    now,
  );
  await recomputeStatus(db, loaded.request.id);
  return loadByToken(db, token);
}

/**
 * Mark one item satisfied from a fresh in-portal completion, attaching a pointer
 * to the produced artifact (assessment run id, attempt id, interview id, the
 * confirmed contact fields, the application answers, …). Recomputes the gate.
 */
export async function satisfyRequestItem(
  db: Db,
  token: string,
  itemId: string,
  payload: { resultRef?: Record<string, unknown>; candidateUserId?: string | null },
): Promise<RequestWithItems | null> {
  const loaded = await getRequestByToken(db, token);
  if (!loaded) return null;
  if (loaded.request.status === "expired") return loaded;

  const item = loaded.items.find((i) => i.id === itemId);
  if (!item) return loaded;

  const now = new Date();
  if (item.status === "outstanding") {
    await db
      .update(screeningRequestItems)
      .set({
        status: "satisfied",
        satisfiedSource: "completed_now",
        resultRef: payload.resultRef ?? null,
        satisfiedAt: now,
        updatedAt: now,
      })
      .where(eq(screeningRequestItems.id, item.id));
  }

  if (payload.candidateUserId && loaded.request.candidateUserId !== payload.candidateUserId) {
    await db
      .update(screeningRequests)
      .set({ candidateUserId: payload.candidateUserId, updatedAt: now })
      .where(eq(screeningRequests.id, loaded.request.id));
  }

  await recomputeStatus(db, loaded.request.id);
  return loadByToken(db, token);
}

/**
 * Recompute the request status from its items: `completed` when every REQUIRED
 * item is satisfied, else `in_progress` once any item is satisfied, else
 * `pending`. Never downgrades a completed request and never touches `expired`.
 */
async function recomputeStatus(db: Db, requestId: string): Promise<void> {
  const [request] = await db
    .select()
    .from(screeningRequests)
    .where(eq(screeningRequests.id, requestId))
    .limit(1);
  if (!request || request.status === "expired") return;

  const items = await db
    .select()
    .from(screeningRequestItems)
    .where(eq(screeningRequestItems.requestId, requestId));

  const requiredOutstanding = items.some(
    (i) => i.isRequired && i.status === "outstanding",
  );
  const anySatisfied = items.some((i) => i.status === "satisfied");

  const next: ScreeningRequestStatus = !requiredOutstanding
    ? "completed"
    : anySatisfied
      ? "in_progress"
      : "pending";

  if (next === request.status) return;
  await db
    .update(screeningRequests)
    .set({
      status: next,
      completedAt: next === "completed" ? request.completedAt ?? new Date() : request.completedAt,
      updatedAt: new Date(),
    })
    .where(eq(screeningRequests.id, requestId));
}

/**
 * Resolve a job application into the candidate + company context needed to send
 * it a screening (#1855). The route authorizes the returned `companyId` before
 * calling `createScreeningRequest`, so this only reads — it never writes.
 *
 * Returns null when the application doesn't exist. `companyId` is null when the
 * job has no company association (legacy postings) — the caller turns that into
 * a 409 ("link this job to a company first") since a screening is company-scoped.
 */
export async function resolveApplicationForScreening(
  db: Db,
  applicationId: string,
): Promise<{
  applicationId: string;
  jobId: string | null;
  companyId: string | null;
  candidateUserId: string;
  candidateEmail: string;
  candidateName: string | null;
} | null> {
  const { jobApplications, jobItems, users } = schema;
  const [app] = await db
    .select()
    .from(jobApplications)
    .where(eq(jobApplications.id, applicationId))
    .limit(1);
  if (!app) return null;

  const [candidate] = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, app.userId))
    .limit(1);

  let companyId: string | null = null;
  if (app.jobId) {
    const [job] = await db
      .select({ companyId: jobItems.companyId })
      .from(jobItems)
      .where(eq(jobItems.id, app.jobId))
      .limit(1);
    companyId = job?.companyId ?? null;
  }

  return {
    applicationId: app.id,
    jobId: app.jobId,
    companyId,
    candidateUserId: app.userId,
    candidateEmail: candidate?.email ?? "",
    candidateName: candidate?.name ?? null,
  };
}

/** List a company's sent requests (newest first) for the recruiter dashboard. */
export async function listRequests(db: Db, companyIds: string[]) {
  if (companyIds.length === 0) return [];
  return db
    .select()
    .from(screeningRequests)
    .where(inArray(screeningRequests.companyId, companyIds))
    .orderBy(desc(screeningRequests.createdAt));
}
