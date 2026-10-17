// Creator work board (#101): the awarded creator's gig tasks, and the
// task-status → milestone-status sync driven from the kanban.

import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { getOrSetIsolateCached } from "../../utils/isolate-cache.js";
import { toTaskDto, type TaskDto } from "../productivity/task-dto.js";
import {
  bumpGigVersion,
  gigCacheVersion,
  GigError,
  GIG_TTL_SECONDS,
  TASK_COMPLETED_STATUSES,
  taskStatusToMilestone,
} from "./gigShared.js";

const { gigProjects, gigMilestones, tasks } = schema;

/** The creator's awarded gig work — materialised tasks as TaskDTOs, plus the
 *  parent projects so the Gigs tab can group + label. */
export async function listMyWork(creatorUserId: string): Promise<{
  tasks: TaskDto[];
  projects: { id: string; title: string; status: string }[];
}> {
  const v = await gigCacheVersion();
  return getOrSetIsolateCached<{ tasks: TaskDto[]; projects: { id: string; title: string; status: string }[] }>({
    key: `gigs:work:v1:${creatorUserId}:${v}`,
    ttlSeconds: GIG_TTL_SECONDS,
    loader: async () => {
      const rows = await getDb()
        .select()
        .from(tasks)
        .where(and(eq(tasks.userId, creatorUserId), isNotNull(tasks.gigProjectId)))
        .orderBy(desc(tasks.createdAt));
      const dtos = rows.map(toTaskDto);

      const projectIds = Array.from(new Set(rows.map((r) => r.gigProjectId).filter(Boolean) as string[]));
      const projects = projectIds.length
        ? await getDb()
            .select({ id: gigProjects.id, title: gigProjects.title, status: gigProjects.status })
            .from(gigProjects)
            .where(inArray(gigProjects.id, projectIds))
        : [];
      return { tasks: dtos, projects };
    },
  });
}

/**
 * Update a gig work item's status (creator-driven, from the kanban). Writes
 * the task's legacyStatus AND syncs the linked milestone so the poster sees
 * progress. Creator-owned tasks only.
 */
export async function updateWorkStatus(taskId: string, creatorUserId: string, legacyStatus: number): Promise<TaskDto> {
  const [task] = await getDb()
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, creatorUserId), isNotNull(tasks.gigProjectId)))
    .limit(1);
  if (!task) throw new GigError("NOT_FOUND", "Gig work item not found");

  const existingMeta = (task.metadata as Record<string, unknown> | null) ?? {};
  const [updated] = await getDb()
    .update(tasks)
    .set({
      metadata: { ...existingMeta, legacyStatus },
      completedAt: TASK_COMPLETED_STATUSES.has(legacyStatus) ? new Date() : null,
      updatedAt: new Date(),
    } as any)
    .where(eq(tasks.id, taskId))
    .returning();

  if (task.gigMilestoneId) {
    // Never downgrade a milestone the poster already approved/released.
    const [milestone] = await getDb()
      .select({ status: gigMilestones.status })
      .from(gigMilestones)
      .where(eq(gigMilestones.id, task.gigMilestoneId))
      .limit(1);
    const locked = milestone && ["approved", "released", "disputed"].includes(milestone.status);
    if (!locked) {
      await getDb()
        .update(gigMilestones)
        .set({ status: taskStatusToMilestone(legacyStatus), updatedAt: new Date() })
        .where(eq(gigMilestones.id, task.gigMilestoneId));
    }
  }
  bumpGigVersion();
  return toTaskDto(updated);
}
