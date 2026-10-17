/**
 * RecruiterAgentRepository — AI recruiter agent (#66) persistence:
 * sourcing runs (`recruiter_agent_runs`), scheduled follow-ups
 * (`recruiter_agent_followups`, fired by workers/recruiter-agent-followup),
 * and the résumé keyword probe the sourcing run uses to find candidates.
 */
import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";

const { recruiterAgentRuns, recruiterAgentFollowups, resumeInformation, users } = schema;

export type AgentRunRow = typeof recruiterAgentRuns.$inferSelect;
export type AgentRunInsert = typeof recruiterAgentRuns.$inferInsert;
export type AgentFollowupRow = typeof recruiterAgentFollowups.$inferSelect;
export type AgentFollowupInsert = typeof recruiterAgentFollowups.$inferInsert;
export type AgentRunResult = NonNullable<AgentRunRow["results"]>[number];

export interface SourcedUser {
  id: string;
  name: string;
  email: string;
}

// ── Sourcing probe ──────────────────────────────────────────────────────────

/** User ids whose résumé content matches ANY of `skills` (ilike), bounded. */
export async function findResumeUserIdsMatchingSkills(skills: string[], limit: number): Promise<string[]> {
  const skillConditions = skills.map((s) => ilike(resumeInformation.content, `%${s}%`));
  const rows = await getDb()
    .select({ userId: resumeInformation.userId, content: resumeInformation.content })
    .from(resumeInformation)
    .where(or(...skillConditions))
    .limit(limit);
  return rows.map((r) => r.userId).filter(Boolean);
}

export async function findUsersByIds(ids: string[]): Promise<SourcedUser[]> {
  return getDb()
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(inArray(users.id, ids));
}

// ── Runs ────────────────────────────────────────────────────────────────────

export async function insertAgentRun(values: AgentRunInsert): Promise<AgentRunRow> {
  const [run] = await getDb().insert(recruiterAgentRuns).values(values).returning();
  return run;
}

export async function completeAgentRun(
  id: string,
  patch: { candidatesFound: number; candidatesScored: number; results: AgentRunResult[] },
): Promise<void> {
  await getDb()
    .update(recruiterAgentRuns)
    .set({ status: "completed", ...patch, completedAt: new Date() })
    .where(eq(recruiterAgentRuns.id, id));
}

export async function listAgentRunSummaries(recruiterId: string, limit = 50) {
  return getDb()
    .select({
      id: recruiterAgentRuns.id,
      jobTitle: recruiterAgentRuns.jobTitle,
      status: recruiterAgentRuns.status,
      candidatesFound: recruiterAgentRuns.candidatesFound,
      candidatesScored: recruiterAgentRuns.candidatesScored,
      createdAt: recruiterAgentRuns.createdAt,
      completedAt: recruiterAgentRuns.completedAt,
    })
    .from(recruiterAgentRuns)
    .where(eq(recruiterAgentRuns.recruiterId, recruiterId))
    .orderBy(desc(recruiterAgentRuns.createdAt))
    .limit(limit);
}

export async function findOwnedAgentRun(recruiterId: string, id: string): Promise<AgentRunRow | null> {
  const [run] = await getDb()
    .select()
    .from(recruiterAgentRuns)
    .where(and(eq(recruiterAgentRuns.id, id), eq(recruiterAgentRuns.recruiterId, recruiterId)))
    .limit(1);
  return run ?? null;
}

/** Owner of a run (null when the run does not exist). */
export async function findAgentRunOwner(id: string): Promise<{ id: string; recruiterId: string } | null> {
  const [run] = await getDb()
    .select({ id: recruiterAgentRuns.id, recruiterId: recruiterAgentRuns.recruiterId })
    .from(recruiterAgentRuns)
    .where(eq(recruiterAgentRuns.id, id))
    .limit(1);
  return run ?? null;
}

// ── Follow-ups ──────────────────────────────────────────────────────────────

export async function insertAgentFollowup(values: AgentFollowupInsert): Promise<AgentFollowupRow> {
  const [row] = await getDb().insert(recruiterAgentFollowups).values(values).returning();
  return row;
}

export async function listAgentFollowups(recruiterId: string, status: string | null, limit = 100): Promise<AgentFollowupRow[]> {
  const conditions = [eq(recruiterAgentFollowups.recruiterId, recruiterId)];
  if (status) conditions.push(eq(recruiterAgentFollowups.status, status));
  return getDb()
    .select()
    .from(recruiterAgentFollowups)
    .where(and(...conditions))
    .orderBy(desc(recruiterAgentFollowups.scheduledFor))
    .limit(limit);
}

export async function findAgentFollowupState(
  id: string,
): Promise<{ id: string; recruiterId: string; status: string } | null> {
  const [row] = await getDb()
    .select({ id: recruiterAgentFollowups.id, recruiterId: recruiterAgentFollowups.recruiterId, status: recruiterAgentFollowups.status })
    .from(recruiterAgentFollowups)
    .where(eq(recruiterAgentFollowups.id, id))
    .limit(1);
  return row ?? null;
}

export async function cancelAgentFollowup(id: string): Promise<AgentFollowupRow> {
  const [updated] = await getDb()
    .update(recruiterAgentFollowups)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(recruiterAgentFollowups.id, id))
    .returning();
  return updated;
}
