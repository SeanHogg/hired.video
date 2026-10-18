/**
 * Onboarding-checklist use cases behind /api/hiring/checklists: list,
 * create with tasks, detail, and complete a task (recomputing progress).
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import {
  completeChecklistTask,
  findChecklistForCreator,
  insertChecklist,
  insertChecklistTasks,
  listChecklistTasks,
  listChecklistsByCreator,
  updateChecklistProgress,
  type OnboardingChecklistRow,
  type OnboardingTaskRow,
} from "../../repositories/onboardingChecklistsRepository.js";

const checklistNotFound = () => new DomainError(404, "NOT_FOUND", "Checklist not found");

export type ChecklistWithTasks = OnboardingChecklistRow & { tasks: OnboardingTaskRow[] };

export function listChecklists(userId: string): Promise<OnboardingChecklistRow[]> {
  return listChecklistsByCreator(getDb(), userId);
}

export interface CreateChecklistInput {
  candidateName: string;
  candidateUserId?: string;
  offerLetterId?: string;
  jobTitle?: string;
  startDate?: string;
  tasks: Array<{ title: string; description?: string; category?: string; dueDate?: string }>;
}

export async function createChecklist(userId: string, input: CreateChecklistInput): Promise<ChecklistWithTasks> {
  const db = getDb();
  const checklist = await insertChecklist(db, {
    createdByUserId: userId,
    candidateUserId: input.candidateUserId,
    offerLetterId: input.offerLetterId,
    candidateName: input.candidateName,
    jobTitle: input.jobTitle,
    startDate: input.startDate ? new Date(input.startDate) : undefined,
    status: "pending",
    completionPercentage: "0",
  });

  const tasks = await insertChecklistTasks(
    db,
    input.tasks.map((t, i) => ({
      checklistId: checklist.id,
      title: t.title,
      description: t.description,
      category: t.category ?? "general",
      dueDate: t.dueDate ? new Date(t.dueDate) : undefined,
      sortOrder: String(i + 1),
    })),
  );

  return { ...checklist, tasks };
}

export async function getChecklist(id: string, userId: string): Promise<ChecklistWithTasks> {
  const db = getDb();
  const checklist = await findChecklistForCreator(db, id, userId);
  if (!checklist) throw checklistNotFound();
  const tasks = await listChecklistTasks(db, checklist.id);
  return { ...checklist, tasks };
}

/** Completes one task, then recomputes the checklist's percentage + status. */
export async function completeTask(
  id: string,
  taskId: string,
  userId: string,
): Promise<{ checklist: OnboardingChecklistRow | undefined; completionPercentage: number }> {
  const db = getDb();
  const checklist = await findChecklistForCreator(db, id, userId);
  if (!checklist) throw checklistNotFound();

  await completeChecklistTask(db, checklist.id, taskId, userId);

  const allTasks = await listChecklistTasks(db, checklist.id);
  const completedCount = allTasks.filter((t) => t.isCompleted).length;
  const pct = allTasks.length > 0 ? Math.round((completedCount / allTasks.length) * 100) : 0;
  const newStatus = pct === 100 ? "completed" : pct > 0 ? "in_progress" : "pending";

  const updated = await updateChecklistProgress(db, checklist.id, String(pct), newStatus);
  return { checklist: updated, completionPercentage: pct };
}
