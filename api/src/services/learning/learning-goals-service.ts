/**
 * Learning-goal use cases — a learner's own stated objectives, their cached
 * course recommendations, and goal → draft learning path generation
 * (#2068 GAP-3). Every operation is owner-scoped; a goal the caller does not
 * own resolves to `null` (the route answers 404).
 */
import { getDb } from "../../db/index.js";
import type { LearningGoal } from "../../db/schema/learning.js";
import { getOrSetCached, invalidateCachedKey } from "../../utils/edge-cache.js";
import { slugify } from "../../../../shared/slugify.js";
import {
  deleteGoal as deleteGoalRow,
  findOwnedGoal,
  insertGoal,
  listGoalsByUser,
  updateGoal as updateGoalRow,
} from "../../repositories/learningGoalsRepository.js";
import { insertPath, insertSlots } from "../../repositories/learningPathsRepository.js";
import {
  llmPlanPath,
  llmRerankCandidates,
  recommendCoursesForText,
  type GoalLlm,
} from "./goal-course-matcher.js";

function recsCacheKey(goalId: string): string {
  return `learning-goal:recs:${goalId}`;
}

export function listGoals(userId: string): Promise<LearningGoal[]> {
  return listGoalsByUser(getDb(), userId);
}

export function createGoal(userId: string, goalText: string, source: string): Promise<LearningGoal> {
  return insertGoal(getDb(), { userId, goalText: goalText.trim(), source });
}

export async function updateGoal(
  userId: string,
  id: string,
  input: { goalText?: string; status?: string },
): Promise<LearningGoal | null> {
  const db = getDb();
  if (!(await findOwnedGoal(db, userId, id))) return null;
  const patch: { goalText?: string; status?: string } = {};
  if (input.goalText !== undefined) patch.goalText = input.goalText.trim();
  if (input.status !== undefined) patch.status = input.status;
  const updated = await updateGoalRow(db, id, patch);
  // Goal text drives the cached recommendation set.
  if (input.goalText !== undefined) invalidateCachedKey(recsCacheKey(id));
  return updated;
}

export async function deleteGoal(userId: string, id: string): Promise<boolean> {
  const db = getDb();
  if (!(await findOwnedGoal(db, userId, id))) return false;
  await deleteGoalRow(db, id);
  invalidateCachedKey(recsCacheKey(id));
  return true;
}

/** Published courses matching the goal text. Cached read-through per goal
 *  (600s) — the LLM re-rank only runs on a cache miss, which bounds cost. */
export async function recommendForGoal(userId: string, id: string, llm: GoalLlm | null): Promise<unknown[] | null> {
  const goal = await findOwnedGoal(getDb(), userId, id);
  if (!goal) return null;

  return getOrSetCached<unknown[]>({
    key: recsCacheKey(id),
    ttlSeconds: 600,
    loader: async () => {
      // Recall: cheap keyword candidate set (wider than we'll return).
      const candidates = await recommendCoursesForText(goal.goalText, 12);
      if (candidates.length <= 1) return candidates.slice(0, 6);
      // Precision: have the LLM re-rank candidates against the goal. On any
      // failure (no key, refusal, drift) fall back to the keyword order.
      const orderedIds = llm
        ? await llmRerankCandidates(llm, goal.goalText, candidates).catch(() => null)
        : null;
      if (!orderedIds || orderedIds.length === 0) return candidates.slice(0, 6);
      const byId = new Map(candidates.map((c2) => [c2.id, c2]));
      const ranked = orderedIds.map((cid) => byId.get(cid)).filter(Boolean);
      // Append any candidate the model dropped, preserving keyword order, so
      // we always return up to 6 even if the model returned fewer.
      for (const cand of candidates) if (!orderedIds.includes(cand.id)) ranked.push(cand);
      return ranked.slice(0, 6);
    },
    revive: (raw) => (Array.isArray(raw) ? raw : null),
  });
}

export type GeneratePathResult =
  | { kind: "not_found" }
  | { kind: "no_courses" }
  | { kind: "created"; path: unknown; courseCount: number; generatedByLlm: boolean };

/** Materialise a DRAFT learning path from the goal: keyword candidates → LLM
 *  picks + orders + names the path. Falls back to the top keyword courses and
 *  a goal-derived title when the LLM is unavailable. */
export async function generatePathFromGoal(userId: string, id: string, llm: GoalLlm | null): Promise<GeneratePathResult> {
  const db = getDb();
  const goal = await findOwnedGoal(db, userId, id);
  if (!goal) return { kind: "not_found" };

  const candidates = await recommendCoursesForText(goal.goalText, 12);
  if (candidates.length === 0) return { kind: "no_courses" };

  const plan = llm ? await llmPlanPath(llm, goal.goalText, candidates).catch(() => null) : null;

  const validIds = new Set(candidates.map((c2) => c2.id));
  const orderedIds = (plan?.orderedCourseIds ?? []).filter((cid) => validIds.has(cid));
  const finalIds = orderedIds.length > 0 ? orderedIds : candidates.slice(0, 5).map((c2) => c2.id);
  const title = (plan?.title?.trim() || `Path: ${goal.goalText}`).slice(0, 255);
  const summary = (plan?.summary?.trim() || `A learning path toward "${goal.goalText}".`).slice(0, 1000);

  const baseSlug = slugify(title, { fallback: "learning-path", maxLen: 60 });
  const slug = `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`;

  const path = await insertPath(db, { userId, slug, title, summary, status: "draft", tags: [] });
  await insertSlots(
    db,
    finalIds.map((courseId, i) => ({ pathId: path.id, courseId, displayOrder: i, isRequired: true })),
  );
  return { kind: "created", path, courseCount: finalIds.length, generatedByLlm: Boolean(plan) };
}
