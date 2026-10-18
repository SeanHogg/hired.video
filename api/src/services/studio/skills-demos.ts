/**
 * Skills demonstration video use cases (create, owner edit, owner list,
 * public profile list). SQL lives in repositories/studioSkillsDemosRepository.ts.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import {
  insertSkillsDemo,
  listSkillsDemosByUser,
  updateOwnedSkillsDemo,
  type SkillsDemoInsert,
  type SkillsDemoPatch,
  type SkillsDemoRow,
} from "../../repositories/studioSkillsDemosRepository.js";

export function createSkillsDemo(values: SkillsDemoInsert): Promise<SkillsDemoRow> {
  return insertSkillsDemo(getDb(), values);
}

/** Owner edit; 404 when the caller owns no such demo. */
export async function updateSkillsDemo(userId: string, demoId: string, patch: SkillsDemoPatch): Promise<SkillsDemoRow> {
  const updated = await updateOwnedSkillsDemo(getDb(), demoId, userId, patch);
  if (!updated) throw new DomainError(404, "NOT_FOUND", "Demo not found");
  return updated;
}

/** The caller's own demos (latest 50). */
export function listOwnSkillsDemos(userId: string): Promise<SkillsDemoRow[]> {
  return listSkillsDemosByUser(getDb(), userId, { publicOnly: false, limit: 50 });
}

/** A user's public demos for their profile (latest 20). */
export function listPublicSkillsDemos(userId: string): Promise<SkillsDemoRow[]> {
  return listSkillsDemosByUser(getDb(), userId, { publicOnly: true, limit: 20 });
}
