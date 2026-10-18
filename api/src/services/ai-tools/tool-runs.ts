// Polymorphic tool-run history use cases (routes/tool-runs.ts). Each run may
// reference one or more entities (resume, job, video, template, company) and
// the studio session it was made in (project). Everything is owner-scoped:
// callers only see and write runs against entities they may act on, and
// history is always private to the caller.

import { getDb, type Db } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import type { GamificationCallback } from "../../domains/gamification/with-gamification.js";
import {
  ToolRunsRepository,
  type ToolRunAnchor,
  type ToolRunRow,
} from "../../repositories/toolRunsRepository.js";
import {
  ownsByJob,
  ownsByResume,
  ownsByStudioProject,
  ownsByVideo,
} from "../../repositories/toolRunOwnershipRepository.js";

// ── Entity bindings ────────────────────────────────────────────────────────
// New entity types are added here once — record, history, and the dialog
// all funnel through this map.

export type EntityType = "resume" | "job" | "video" | "template" | "company" | "project";

interface EntityBinding {
  /** Column on tool_runs that references this entity. */
  anchor: ToolRunAnchor;
  /** Confirms the authenticated user may use the entity. */
  ownsBy(db: Db, userId: string, id: string): Promise<boolean>;
}

const entities: Record<EntityType, EntityBinding> = {
  resume: { anchor: "resumeId", ownsBy: ownsByResume },
  job: { anchor: "jobId", ownsBy: ownsByJob },
  video: { anchor: "videoId", ownsBy: ownsByVideo },
  // Templates are shared assets — users can run tools against any template
  // they can view. The tool-run row is still user-scoped so history is
  // private per user.
  template: { anchor: "templateId", ownsBy: async () => true },
  // Company profiles have a userId (creator/claimer). Non-owners can still
  // record a run against them (e.g. researching a prospective employer) so
  // we permit any authenticated user.
  company: { anchor: "companyId", ownsBy: async () => true },
  // The studio session (/studio/<id>): its runs come back when it reopens.
  project: { anchor: "studioProjectId", ownsBy: ownsByStudioProject },
};

/** Declaration order = the order ownership failures are reported in. */
const ENTITY_ORDER: EntityType[] = ["resume", "job", "video", "template", "company", "project"];

export function isEntityType(v: string): v is EntityType {
  return v in entities;
}

export type EntityRefs = Partial<Record<ToolRunAnchor, string>>;

/** Pick the non-empty string entity refs out of a request body. */
export function extractRefs(src: Record<string, unknown>): EntityRefs {
  const refs: EntityRefs = {};
  for (const type of ENTITY_ORDER) {
    const key = entities[type].anchor;
    const value = src[key];
    if (typeof value === "string" && value) refs[key] = value;
  }
  return refs;
}

/** 404s on the first ref (in declaration order) the user may not use. */
async function assertOwnership(db: Db, userId: string, refs: EntityRefs): Promise<void> {
  const checks: Array<[EntityType, string]> = [];
  for (const type of ENTITY_ORDER) {
    const id = refs[entities[type].anchor];
    if (id) checks.push([type, id]);
  }
  // Independent checks run concurrently; the first failing ref in
  // declaration order is still reported.
  const owned = await Promise.all(checks.map(([type, id]) => entities[type].ownsBy(db, userId, id)));
  const failedAt = owned.findIndex((ok) => !ok);
  if (failedAt === -1) return;
  const [type, id] = checks[failedAt]!;
  throw new DomainError(404, "NOT_FOUND", `${type} ${id} not accessible`);
}

function repo(db: Db = getDb()): ToolRunsRepository {
  return new ToolRunsRepository(db);
}

export interface RecordToolRunInput {
  toolId: string;
  refs: EntityRefs;
  score?: unknown;
  result?: unknown;
  jobDescription?: unknown;
  summary?: unknown;
}

/** Record a run. Entity refs are optional — runs from the full `/tools/*`
 *  pages (pasted text) are legitimately anchor-less and still appear in the
 *  user's own history. */
export async function recordToolRun(userId: string, input: RecordToolRunInput): Promise<ToolRunRow> {
  const db = getDb();
  if (Object.keys(input.refs).length > 0) await assertOwnership(db, userId, input.refs);
  return repo(db).insert({
    userId,
    toolId: input.toolId,
    ...input.refs,
    score: typeof input.score === "number" ? String(input.score) : null,
    result: (input.result ?? {}) as Record<string, unknown>,
    jobDescription: typeof input.jobDescription === "string" ? input.jobDescription : null,
    summary: typeof input.summary === "string" ? input.summary : null,
  });
}

/** Gamification award for a recorded run. Specific tool ids map to richer
 *  actions (resume_tailor, cover_letter); everything else earns under the
 *  generic ai.tool.used action. */
export function toolRunAward(runId: string, toolId: string): GamificationCallback {
  return async (game, role, uid) => {
    const { TOOL_ID_TO_ACTION } = await import("../../domains/gamification/tool-id-mapping.js");
    const args = { userId: uid, role, toolRunId: runId, metadata: { toolId } };
    const mapped = TOOL_ID_TO_ACTION[toolId];
    if (mapped === "resume.tailored") {
      await game.onResumeTailored({ ...args, resumeRunId: runId });
    } else if (mapped === "cover_letter.generated") {
      await game.onCoverLetterGenerated(args);
    } else {
      await game.onAiToolUsed(args);
    }
  };
}

/** The caller's runs anchored on one entity they may use. */
export async function listRunsForEntity(
  userId: string,
  entityType: EntityType,
  entityId: string,
  opts: { toolId?: string; limit: number },
): Promise<ToolRunRow[]> {
  const db = getDb();
  const binding = entities[entityType];
  if (!(await binding.ownsBy(db, userId, entityId))) {
    throw new DomainError(404, "NOT_FOUND", `${entityType} not found`);
  }
  return repo(db).listForAnchor(userId, binding.anchor, entityId, opts.limit, opts.toolId);
}

export function listMyRuns(userId: string, opts: { toolId?: string; limit: number }): Promise<ToolRunRow[]> {
  return repo().listForUser(userId, opts.limit, opts.toolId);
}

export async function getToolRun(userId: string, id: string): Promise<ToolRunRow> {
  const run = await repo().findForUser(id, userId);
  if (!run) throw new DomainError(404, "NOT_FOUND", "Tool run not found");
  return run;
}

export async function deleteToolRun(userId: string, id: string): Promise<{ id: string }> {
  const deletedId = await repo().deleteForUser(id, userId);
  if (!deletedId) throw new DomainError(404, "NOT_FOUND", "Tool run not found");
  return { id: deletedId };
}
