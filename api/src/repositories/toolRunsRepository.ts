/**
 * ToolRunsRepository — the user-facing `tool_runs` history (record / list /
 * read / delete; services/ai-tools/tool-runs.ts). Every read and delete is
 * owner-scoped. Metering-side reads (token sums, admin stats) stay with
 * TokensRepository / admin ToolUsageRepository; entity-ownership checks live
 * in toolRunOwnershipRepository.
 */

import { and, desc, eq } from "drizzle-orm";
import { schema, type Db } from "../db/index.js";

const { toolRuns } = schema;

export type ToolRunRow = typeof toolRuns.$inferSelect;
export type ToolRunInsert = typeof toolRuns.$inferInsert;

/** The tool_runs entity-reference columns a run can be anchored on. */
export type ToolRunAnchor = "resumeId" | "jobId" | "videoId" | "templateId" | "companyId" | "studioProjectId";

export interface IToolRunsRepository {
  insert(values: ToolRunInsert): Promise<ToolRunRow>;
  /** The user's runs, newest first; `toolId` narrows to one tool. */
  listForUser(userId: string, limit: number, toolId?: string): Promise<ToolRunRow[]>;
  /** The user's runs anchored on one entity (tool_runs.<anchor> = anchorId), newest first. */
  listForAnchor(userId: string, anchor: ToolRunAnchor, anchorId: string, limit: number, toolId?: string): Promise<ToolRunRow[]>;
  findForUser(id: string, userId: string): Promise<ToolRunRow | null>;
  /** The deleted id, or null when none of the user's runs matched. */
  deleteForUser(id: string, userId: string): Promise<string | null>;
}

export class ToolRunsRepository implements IToolRunsRepository {
  constructor(private readonly db: Db) {}

  async insert(values: ToolRunInsert): Promise<ToolRunRow> {
    const [row] = await this.db.insert(toolRuns).values(values).returning();
    return row;
  }

  async listForUser(userId: string, limit: number, toolId?: string): Promise<ToolRunRow[]> {
    const conditions = [eq(toolRuns.userId, userId)];
    if (toolId) conditions.push(eq(toolRuns.toolId, toolId));
    return this.db
      .select()
      .from(toolRuns)
      .where(and(...conditions))
      .orderBy(desc(toolRuns.createdAt))
      .limit(limit);
  }

  async listForAnchor(
    userId: string,
    anchor: ToolRunAnchor,
    anchorId: string,
    limit: number,
    toolId?: string,
  ): Promise<ToolRunRow[]> {
    // Runs are user-private even when the anchor entity is shared (e.g.
    // templates): every user sees only their own history for an entity.
    const conditions = [eq(toolRuns[anchor], anchorId), eq(toolRuns.userId, userId)];
    if (toolId) conditions.push(eq(toolRuns.toolId, toolId));
    return this.db
      .select()
      .from(toolRuns)
      .where(and(...conditions))
      .orderBy(desc(toolRuns.createdAt))
      .limit(limit);
  }

  async findForUser(id: string, userId: string): Promise<ToolRunRow | null> {
    const [row] = await this.db
      .select()
      .from(toolRuns)
      .where(and(eq(toolRuns.id, id), eq(toolRuns.userId, userId)))
      .limit(1);
    return row ?? null;
  }

  async deleteForUser(id: string, userId: string): Promise<string | null> {
    const [row] = await this.db
      .delete(toolRuns)
      .where(and(eq(toolRuns.id, id), eq(toolRuns.userId, userId)))
      .returning({ id: toolRuns.id });
    return row?.id ?? null;
  }
}
