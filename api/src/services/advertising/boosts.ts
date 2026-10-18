/**
 * Polymorphic boost use cases behind routes/boosts.ts (non-checkout CRUD):
 * the caller's boosts, a subject's active boosts, and owner cancel.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import { BoostsRepository } from "../../repositories/boostsRepository.js";
import { toBoostView } from "./boost-checkout.js";

export async function listMyBoosts(userId: string) {
  const rows = await new BoostsRepository(getDb()).listForUser(userId);
  return rows.map(toBoostView);
}

export async function listActiveBoostsForSubject(subjectType: string, subjectId: string) {
  const rows = await new BoostsRepository(getDb()).listActiveForSubject(subjectType, subjectId);
  return rows.map(toBoostView);
}

/** Cancel the caller's own boost (404 missing, 403 someone else's). */
export async function cancelBoost(userId: string, boostId: string): Promise<void> {
  const repo = new BoostsRepository(getDb());
  const ownerId = await repo.findOwnerId(boostId);
  if (!ownerId) throw new DomainError(404, "NOT_FOUND", "Boost not found");
  if (ownerId !== userId) throw new DomainError(403, "FORBIDDEN", "You can only cancel your own boost");
  await repo.setStatus(boostId, "cancelled", new Date());
}
