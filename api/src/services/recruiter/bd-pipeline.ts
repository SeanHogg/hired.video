/**
 * #99 / #222 / #223 — Agency-recruiter BD pipeline service.
 *
 * Three concerns, one entry point:
 *   • Clients     — client companies the recruiter is selling into (CRUD)
 *   • Stages      — per-recruiter configurable funnel stages (#222)
 *   • Deals       — BD opportunities, $-value, win prob, owner + custom pipeline (#223)
 *
 * Stages are seeded lazily — the first time a recruiter touches the pipeline
 * surface, `ensureDefaultPipeline()` populates `pipeline_stages` from the
 * canonical `DEFAULT_BD_PIPELINE` constant so the dashboard has stages to
 * render. Stages are user-editable; the constant is the floor, not a hard
 * ceiling.
 */

import { and, eq, or, inArray, sql, desc, asc, type SQL } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";

const { recruiterClients, recruiterClientContacts, pipelineStages, recruiterDeals } = schema;

/**
 * Row-visibility clause for a BD client/deal (#1766). A row is visible when the
 * caller owns it (recruiter_user_id) OR it belongs to one of the caller's shared
 * workspaces (workspace_id IN scope). `workspaceIds` empty → owner-only, i.e.
 * exactly the pre-#1766 behavior, so solo recruiters are unaffected.
 */
export function visibleTo(
  ownerCol: typeof recruiterClients.recruiterUserId | typeof recruiterDeals.recruiterUserId,
  workspaceCol: typeof recruiterClients.workspaceId | typeof recruiterDeals.workspaceId,
  recruiterUserId: string,
  workspaceIds: string[],
): SQL {
  const owner = eq(ownerCol, recruiterUserId);
  if (workspaceIds.length === 0) return owner;
  return or(owner, inArray(workspaceCol, workspaceIds))!;
}

export interface NewClientInput {
  clientName: string;
  companyId?: string | null;
  website?: string | null;
  industry?: string | null;
  notes?: string | null;
}

export interface NewDealInput {
  clientId?: string | null;
  jobId?: string | null;
  name: string;
  pipelineKey?: string;
  stageKey?: string;
  ownerUserId?: string | null;
  ownerType?: string;
  estFeeCents?: number | null;
  winProbabilityBps?: number | null;
  expectedCloseDate?: string | null;
  notes?: string | null;
}

/** The subset of a pipeline stage that decides deal-close semantics. */
export interface StageCloseFlags {
  isClosedWon: boolean;
  isClosedLost: boolean;
}

/**
 * Compute the deal patch produced by moving a deal onto `stageKey`.
 * Always restamps stage + activity; additionally stamps `closedAt` +
 * `isWon` when the destination stage is terminal:
 *   • closed-won  → closedAt set, isWon = true
 *   • closed-lost → closedAt set, isWon = false
 *   • open stage  → closedAt/isWon left untouched (deal stays in pipeline)
 *
 * `stage` is null when the recruiter moves to a stageKey that has no row
 * (e.g. a stale client) — treated as a non-terminal move. Pure given an
 * injected `now`; `moveDealToStage()` delegates here so the close rule
 * lives in one testable place rather than inline among the DB updates.
 */
export function computeStageClosePatch(
  stageKey: string,
  pipelineKey: string,
  stage: StageCloseFlags | null | undefined,
  now: Date,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    stageKey,
    pipelineKey,
    lastActivityAt: now,
    updatedAt: now,
  };
  if (stage?.isClosedWon) {
    patch.closedAt = now;
    patch.isWon = true;
  } else if (stage?.isClosedLost) {
    patch.closedAt = now;
    patch.isWon = false;
  }
  return patch;
}

export class RecruiterBdPipelineService {
  // -- Stages ----------------------------------------------------------------
  async ensureDefaultPipeline(recruiterUserId: string): Promise<void> {
    const db = getDb();
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(pipelineStages)
      .where(
        and(
          eq(pipelineStages.recruiterUserId, recruiterUserId),
          eq(pipelineStages.pipelineKey, "default"),
        ),
      );
    if ((typeof count === "string" ? Number(count) : count) > 0) return;

    await db.insert(pipelineStages).values(
      schema.DEFAULT_BD_PIPELINE.map((stage, index) => ({
        recruiterUserId,
        pipelineKey: "default",
        stageKey: stage.stageKey,
        stageLabel: stage.stageLabel,
        ordinal: index,
        winProbabilityBps: stage.winProbabilityBps,
        isClosedWon: stage.isClosedWon ?? false,
        isClosedLost: stage.isClosedLost ?? false,
      })),
    );
  }

  async listStages(recruiterUserId: string, pipelineKey = "default") {
    const db = getDb();
    await this.ensureDefaultPipeline(recruiterUserId);
    return db
      .select()
      .from(pipelineStages)
      .where(
        and(
          eq(pipelineStages.recruiterUserId, recruiterUserId),
          eq(pipelineStages.pipelineKey, pipelineKey),
        ),
      )
      .orderBy(asc(pipelineStages.ordinal));
  }

  async upsertStage(args: {
    recruiterUserId: string;
    pipelineKey?: string;
    stageKey: string;
    stageLabel: string;
    ordinal: number;
    defaultValueCents?: number | null;
    winProbabilityBps?: number | null;
    isClosedWon?: boolean;
    isClosedLost?: boolean;
  }) {
    const db = getDb();
    const [row] = await db
      .insert(pipelineStages)
      .values({
        recruiterUserId: args.recruiterUserId,
        pipelineKey: args.pipelineKey ?? "default",
        stageKey: args.stageKey,
        stageLabel: args.stageLabel,
        ordinal: args.ordinal,
        defaultValueCents: args.defaultValueCents ?? null,
        winProbabilityBps: args.winProbabilityBps ?? null,
        isClosedWon: args.isClosedWon ?? false,
        isClosedLost: args.isClosedLost ?? false,
      })
      .onConflictDoUpdate({
        target: [pipelineStages.recruiterUserId, pipelineStages.pipelineKey, pipelineStages.stageKey],
        set: {
          stageLabel: args.stageLabel,
          ordinal: args.ordinal,
          defaultValueCents: args.defaultValueCents ?? null,
          winProbabilityBps: args.winProbabilityBps ?? null,
          isClosedWon: args.isClosedWon ?? false,
          isClosedLost: args.isClosedLost ?? false,
          updatedAt: new Date(),
        },
      })
      .returning();
    return row;
  }

  // -- Clients ---------------------------------------------------------------
  async listClients(recruiterUserId: string, workspaceIds: string[] = []) {
    const db = getDb();
    return db
      .select()
      .from(recruiterClients)
      .where(
        visibleTo(
          recruiterClients.recruiterUserId,
          recruiterClients.workspaceId,
          recruiterUserId,
          workspaceIds,
        ),
      )
      .orderBy(desc(recruiterClients.updatedAt));
  }

  async createClient(
    recruiterUserId: string,
    input: NewClientInput,
    workspaceId: string | null = null,
  ) {
    const db = getDb();
    const [row] = await db
      .insert(recruiterClients)
      .values({
        recruiterUserId,
        workspaceId,
        companyId: input.companyId ?? null,
        clientName: input.clientName,
        website: input.website ?? null,
        industry: input.industry ?? null,
        notes: input.notes ?? null,
      })
      .returning();
    return row;
  }

  async getClient(clientId: string, recruiterUserId: string, workspaceIds: string[] = []) {
    const db = getDb();
    const [row] = await db
      .select()
      .from(recruiterClients)
      .where(
        and(
          eq(recruiterClients.id, clientId),
          visibleTo(
            recruiterClients.recruiterUserId,
            recruiterClients.workspaceId,
            recruiterUserId,
            workspaceIds,
          ),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async addClientContact(args: {
    clientId: string;
    recruiterUserId: string;
    workspaceIds?: string[];
    name: string;
    title?: string | null;
    email?: string | null;
    phone?: string | null;
    isPrimary?: boolean;
  }) {
    const client = await this.getClient(args.clientId, args.recruiterUserId, args.workspaceIds ?? []);
    if (!client) return null;
    const db = getDb();
    const [row] = await db
      .insert(recruiterClientContacts)
      .values({
        clientId: client.id,
        name: args.name,
        title: args.title ?? null,
        email: args.email ?? null,
        phone: args.phone ?? null,
        isPrimary: args.isPrimary ?? false,
      })
      .returning();
    return row;
  }

  // -- Deals -----------------------------------------------------------------
  async listDeals(recruiterUserId: string, workspaceIds: string[] = []) {
    const db = getDb();
    await this.ensureDefaultPipeline(recruiterUserId);
    return db
      .select()
      .from(recruiterDeals)
      .where(
        visibleTo(
          recruiterDeals.recruiterUserId,
          recruiterDeals.workspaceId,
          recruiterUserId,
          workspaceIds,
        ),
      )
      .orderBy(desc(recruiterDeals.updatedAt));
  }

  async createDeal(
    recruiterUserId: string,
    input: NewDealInput,
    workspaceId: string | null = null,
  ) {
    const db = getDb();
    await this.ensureDefaultPipeline(recruiterUserId);
    const [row] = await db
      .insert(recruiterDeals)
      .values({
        recruiterUserId,
        workspaceId,
        clientId: input.clientId ?? null,
        jobId: input.jobId ?? null,
        name: input.name,
        pipelineKey: input.pipelineKey ?? "default",
        stageKey: input.stageKey ?? "prospect",
        ownerUserId: input.ownerUserId ?? recruiterUserId,
        ownerType: input.ownerType ?? "recruiter",
        estFeeCents: input.estFeeCents ?? null,
        winProbabilityBps: input.winProbabilityBps ?? null,
        expectedCloseDate: input.expectedCloseDate ?? null,
        notes: input.notes ?? null,
      })
      .returning();
    return row;
  }

  async moveDealToStage(args: {
    dealId: string;
    recruiterUserId: string;
    workspaceIds?: string[];
    stageKey: string;
    pipelineKey?: string;
  }) {
    const db = getDb();
    // Stamp closedAt + isWon when the destination stage is closed-won or closed-lost.
    const [stage] = await db
      .select()
      .from(pipelineStages)
      .where(
        and(
          eq(pipelineStages.recruiterUserId, args.recruiterUserId),
          eq(pipelineStages.pipelineKey, args.pipelineKey ?? "default"),
          eq(pipelineStages.stageKey, args.stageKey),
        ),
      )
      .limit(1);

    const patch = computeStageClosePatch(
      args.stageKey,
      args.pipelineKey ?? "default",
      stage,
      new Date(),
    );

    const [row] = await db
      .update(recruiterDeals)
      .set(patch as never)
      .where(
        and(
          eq(recruiterDeals.id, args.dealId),
          visibleTo(
            recruiterDeals.recruiterUserId,
            recruiterDeals.workspaceId,
            args.recruiterUserId,
            args.workspaceIds ?? [],
          ),
        ),
      )
      .returning();
    return row ?? null;
  }

  async assignDealOwner(args: {
    dealId: string;
    recruiterUserId: string;
    workspaceIds?: string[];
    ownerUserId: string | null;
    ownerType?: string;
  }) {
    const db = getDb();
    const [row] = await db
      .update(recruiterDeals)
      .set({
        ownerUserId: args.ownerUserId,
        ownerType: args.ownerType ?? "recruiter",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(recruiterDeals.id, args.dealId),
          visibleTo(
            recruiterDeals.recruiterUserId,
            recruiterDeals.workspaceId,
            args.recruiterUserId,
            args.workspaceIds ?? [],
          ),
        ),
      )
      .returning();
    return row ?? null;
  }

  // -- Dashboard rollup ------------------------------------------------------
  async pipelineRollup(
    recruiterUserId: string,
    pipelineKey = "default",
    workspaceIds: string[] = [],
  ) {
    const db = getDb();
    const rows = await db
      .select({
        stageKey: recruiterDeals.stageKey,
        count: sql<number>`count(*)::int`,
        totalCents: sql<number>`coalesce(sum(${recruiterDeals.estFeeCents}), 0)::int`,
        weightedCents: sql<number>`coalesce(sum(${recruiterDeals.estFeeCents} * ${recruiterDeals.winProbabilityBps} / 10000), 0)::int`,
      })
      .from(recruiterDeals)
      .where(
        and(
          visibleTo(
            recruiterDeals.recruiterUserId,
            recruiterDeals.workspaceId,
            recruiterUserId,
            workspaceIds,
          ),
          eq(recruiterDeals.pipelineKey, pipelineKey),
          sql`${recruiterDeals.closedAt} IS NULL`,
        ),
      )
      .groupBy(recruiterDeals.stageKey);

    const totalValueCents = rows.reduce((sum, r) => sum + (Number(r.totalCents) || 0), 0);
    const weightedValueCents = rows.reduce((sum, r) => sum + (Number(r.weightedCents) || 0), 0);

    return {
      stages: rows.map((r) => ({
        stageKey: r.stageKey,
        count: Number(r.count) || 0,
        totalCents: Number(r.totalCents) || 0,
        weightedCents: Number(r.weightedCents) || 0,
      })),
      totalValueCents,
      weightedValueCents,
    };
  }
}

export const recruiterBdPipelineService = new RecruiterBdPipelineService();
