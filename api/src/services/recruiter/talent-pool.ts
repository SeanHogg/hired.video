/**
 * Recruiter CRM talent pool use cases — pool entries, their interaction
 * log, and bulk tag/status/delete edits. Route: routes/recruiter/talent-pool.ts.
 * Returns plain data; throws DomainError on rule violations.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { NON_CANDIDATE_ROLES } from "../../../../shared/user-roles.js";
import { TALENT_POOL_LIST_FIELDS, parseFields, projectRows } from "../../../../shared/projection.js";
import { RecruiterPipelineRepository } from "../../repositories/recruiterPipelineRepository.js";
import {
  bulkDeleteEntries,
  bulkSetStatus,
  deleteOwnedTalentPoolEntry,
  findCandidateIdForEntry,
  findOwnedEntryTags,
  findOwnedTalentPoolEntry,
  findUserRole,
  insertInteraction,
  insertTalentPoolEntry,
  isCandidateInPool,
  listInteractionsForEntry,
  listTalentPoolForRecruiter,
  updateOwnedTalentPoolEntry,
  type InteractionRow,
  type TalentPoolRow,
} from "../../repositories/talentPoolRepository.js";

/** Untyped JSON request body (the routes never validated these shapes). */
export type JsonBody = Record<string, any>;

export function rowToTalentPoolEntry(row: TalentPoolRow) {
  return {
    id: row.id,
    recruiterUserId: row.recruiterId ?? "",
    candidateUserId: row.candidateId,
    candidateName: row.candidateName,
    candidateEmail: row.candidateEmail ?? undefined,
    candidateTitle: row.candidateTitle ?? undefined,
    candidateProfilePicture: row.candidateProfilePicture ?? undefined,
    relationshipStrength: row.relationshipStrength,
    tags: (row.tags as string[]) ?? [],
    poolName: row.poolName ?? undefined,
    status: row.status,
    notes: row.notes ?? undefined,
    currentCompany: row.currentCompany ?? undefined,
    currentTitle: row.currentTitle ?? undefined,
    desiredSalary: row.desiredSalary != null ? Number(row.desiredSalary) : undefined,
    preferredLocations: row.preferredLocations ?? undefined,
    lastContactedAt: row.lastContactedAt?.toISOString() ?? undefined,
    nextFollowUpAt: row.nextFollowUpAt?.toISOString() ?? undefined,
    contactFrequency: row.contactFrequency ?? undefined,
    createdAt: row.addedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function rowToInteraction(row: InteractionRow) {
  return {
    id: row.id,
    talentPoolId: row.talentPoolId ?? "",
    interactionType: row.type,
    subject: row.subject ?? undefined,
    notes: row.notes ?? undefined,
    outcome: row.outcome ?? undefined,
    interactionDate: row.interactionDate.toISOString(),
    durationMinutes: row.durationMinutes ?? undefined,
    requiresFollowUp: row.requiresFollowUp,
    followUpDate: row.followUpDate?.toISOString() ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

// ── Pool entries ────────────────────────────────────────────────────────────

/** Add a candidate to the recruiter's pool. #1407 — workforce members
 *  (NON_CANDIDATE_ROLES) are never hireable pool entries. Returns the raw
 *  row so the route can award gamification on `candidateId`. */
export async function addTalentPoolEntry(recruiterId: string, body: JsonBody): Promise<TalentPoolRow> {
  if (body.candidateUserId) {
    const role = await findUserRole(body.candidateUserId);
    if (role !== null && (NON_CANDIDATE_ROLES as readonly string[]).includes(role)) {
      throw new DomainError(400, "NON_CANDIDATE_ROLE", "This user's role is not eligible for talent-pool inclusion");
    }
  }
  return insertTalentPoolEntry({
    recruiterId,
    candidateId: body.candidateUserId,
    candidateName: body.candidateName ?? "",
    candidateEmail: body.candidateEmail ?? null,
    candidateTitle: body.candidateTitle ?? null,
    candidateProfilePicture: body.candidateProfilePicture ?? null,
    poolName: body.poolName ?? null,
    relationshipStrength: body.relationshipStrength ?? "warm",
    tags: body.tags ?? [],
    status: body.status ?? "active",
    notes: body.notes ?? null,
    currentCompany: body.currentCompany ?? null,
    currentTitle: body.currentTitle ?? null,
    desiredSalary: body.desiredSalary ?? null,
    preferredLocations: body.preferredLocations ?? null,
    lastContactedAt: body.lastContactedAt ? new Date(body.lastContactedAt) : null,
    nextFollowUpAt: body.nextFollowUpAt ? new Date(body.nextFollowUpAt) : null,
    contactFrequency: body.contactFrequency ?? null,
  });
}

/** Pool list with optional `?fields=` projection (gap #1370 / #1446). */
export async function listTalentPool(recruiterId: string, fieldsParam: string | undefined) {
  const entries = await listTalentPoolForRecruiter(recruiterId);
  const fields = parseFields(fieldsParam, TALENT_POOL_LIST_FIELDS);
  return projectRows(entries.map(rowToTalentPoolEntry) as Array<Record<string, unknown>>, fields);
}

const CSV_HEADER = ["id", "candidateName", "candidateEmail", "candidateTitle", "currentCompany", "currentTitle", "status", "relationshipStrength", "tags", "notes", "lastContactedAt", "addedAt"];

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The pool as CSV text plus its download filename. */
export async function exportTalentPoolCsv(recruiterId: string): Promise<{ csv: string; filename: string }> {
  const entries = await listTalentPoolForRecruiter(recruiterId);
  const rows = entries.map((e) => [
    e.id, e.candidateName, e.candidateEmail ?? "", e.candidateTitle ?? "",
    e.currentCompany ?? "", e.currentTitle ?? "", e.status, e.relationshipStrength,
    Array.isArray(e.tags) ? (e.tags as string[]).join("; ") : "",
    e.notes ?? "", e.lastContactedAt?.toISOString() ?? "", e.addedAt.toISOString(),
  ].map(csvEscape).join(","));
  const csv = [CSV_HEADER.join(","), ...rows].join("\n");
  const date = new Date().toISOString().slice(0, 10);
  return { csv, filename: `talent-pool-${date}.csv` };
}

export const isInTalentPool = isCandidateInPool;

export async function getTalentPoolEntry(recruiterId: string, id: string) {
  const entry = await findOwnedTalentPoolEntry(recruiterId, id);
  return entry ? rowToTalentPoolEntry(entry) : null;
}

/** Partial update — only keys present in the body are written. */
export async function updateTalentPoolEntry(recruiterId: string, id: string, body: JsonBody) {
  const keep = (k: string) => (body[k] !== undefined ? body[k] : undefined);
  const updated = await updateOwnedTalentPoolEntry(recruiterId, id, {
    candidateName: keep("candidateName"),
    candidateEmail: keep("candidateEmail"),
    candidateTitle: keep("candidateTitle"),
    candidateProfilePicture: keep("candidateProfilePicture"),
    poolName: keep("poolName"),
    relationshipStrength: keep("relationshipStrength"),
    tags: keep("tags"),
    status: keep("status"),
    notes: keep("notes"),
    currentCompany: keep("currentCompany"),
    currentTitle: keep("currentTitle"),
    desiredSalary: keep("desiredSalary"),
    preferredLocations: keep("preferredLocations"),
    lastContactedAt: body.lastContactedAt ? new Date(body.lastContactedAt) : undefined,
    nextFollowUpAt: body.nextFollowUpAt ? new Date(body.nextFollowUpAt) : undefined,
    contactFrequency: keep("contactFrequency"),
    updatedAt: new Date(),
  });
  return updated ? rowToTalentPoolEntry(updated) : null;
}

export const removeTalentPoolEntry = deleteOwnedTalentPoolEntry;

// ── Interactions ────────────────────────────────────────────────────────────

/** Record an interaction. candidateId resolves from the body, else the
 *  pool entry, else falls back to the recruiter (legacy behaviour). */
export async function recordInteraction(recruiterId: string, body: JsonBody) {
  let candidateId = body.candidateUserId ?? body.candidateId;
  if (!candidateId && body.talentPoolId) {
    candidateId = (await findCandidateIdForEntry(body.talentPoolId)) ?? recruiterId;
  }
  if (!candidateId) candidateId = recruiterId;

  const interaction = await insertInteraction({
    recruiterId,
    candidateId,
    talentPoolId: body.talentPoolId ?? null,
    type: body.interactionType ?? body.type ?? "note",
    subject: body.subject ?? null,
    notes: body.notes ?? null,
    outcome: body.outcome ?? null,
    interactionDate: body.interactionDate ? new Date(body.interactionDate) : new Date(),
    durationMinutes: body.durationMinutes ?? null,
    requiresFollowUp: body.requiresFollowUp ?? false,
    followUpDate: body.followUpDate ? new Date(body.followUpDate) : null,
  });
  return rowToInteraction(interaction);
}

export async function listInteractions(recruiterId: string, talentPoolId: string) {
  return (await listInteractionsForEntry(recruiterId, talentPoolId)).map(rowToInteraction);
}

// ── Bulk operations ─────────────────────────────────────────────────────────

const stringArray = (v: unknown): string[] => (Array.isArray(v) ? v : []);

/** Add/remove tags on many entries in ONE update. */
export async function bulkEditTags(recruiterId: string, body: JsonBody): Promise<{ updated: number }> {
  const ids = stringArray(body.ids);
  const addTags = stringArray(body.addTags);
  const removeTags = stringArray(body.removeTags);
  if (!ids.length) throw new DomainError(400, "VALIDATION_ERROR", "ids is required");

  const entries = await findOwnedEntryTags(recruiterId, ids);
  const updates = entries.map((entry) => {
    let tags: string[] = Array.isArray(entry.tags) ? (entry.tags as string[]) : [];
    if (addTags.length) tags = Array.from(new Set([...tags, ...addTags]));
    if (removeTags.length) tags = tags.filter((t) => !removeTags.includes(t));
    return { id: entry.id, tags };
  });
  await new RecruiterPipelineRepository(getDb()).setTalentPoolTags(recruiterId, updates);
  return { updated: updates.length };
}

export async function bulkEditStatus(recruiterId: string, body: JsonBody): Promise<{ updated: number }> {
  const ids = stringArray(body.ids);
  const newStatus = typeof body.status === "string" ? body.status : null;
  if (!ids.length || !newStatus) throw new DomainError(400, "VALIDATION_ERROR", "ids and status are required");
  return { updated: await bulkSetStatus(recruiterId, ids, newStatus) };
}

export async function bulkRemove(recruiterId: string, body: JsonBody): Promise<{ deleted: number }> {
  const ids = stringArray(body.ids);
  if (!ids.length) throw new DomainError(400, "VALIDATION_ERROR", "ids is required");
  return { deleted: await bulkDeleteEntries(recruiterId, ids) };
}
