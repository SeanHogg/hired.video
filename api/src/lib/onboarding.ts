import { eq, and } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";

const { boards, tasks } = schema;

interface OnboardingTaskDef {
  title: string;
  description: string;
  taskType: number;
  url: string;
  position: number;
}

function getOnboardingTasksForRole(role: string): OnboardingTaskDef[] {
  const common: OnboardingTaskDef[] = [
    {
      title: "Select your persona",
      description: "Choose your role to personalize your dashboard and recommendations",
      taskType: 10,
      url: "/persona-selection",
      position: 0,
    },
    {
      title: "Complete your profile",
      description: "Add your photo, bio, and contact information",
      taskType: 11,
      url: "/settings/profile",
      position: 1,
    },
    {
      title: "Configure account settings",
      description: "Set your notification and display preferences",
      taskType: 12,
      url: "/settings",
      position: 2,
    },
  ];

  const roleSpecific: Record<string, OnboardingTaskDef[]> = {
    job_seeker: [
      {
        title: "Upload or create your resume",
        description: "Build your resume to start applying for jobs",
        taskType: 15,
        url: "/resumes",
        position: 3,
      },
    ],
    employer: [
      {
        title: "Post your first job",
        description: "Create a job posting to attract candidates",
        taskType: 16,
        url: "/jobs",
        position: 3,
      },
    ],
    recruiter: [
      {
        title: "Find your first candidate",
        description: "Browse profiles and start building your talent pipeline",
        taskType: 17,
        url: "/people",
        position: 3,
      },
    ],
    affiliate: [
      {
        title: "Start referring users",
        description: "Share your affiliate link and start earning commissions",
        taskType: 19,
        url: "/affiliate",
        position: 3,
      },
    ],
  };

  return [...common, ...(roleSpecific[role] ?? [])];
}

async function getOrCreateDefaultBoard(userId: string, db: ReturnType<typeof getDb>): Promise<string> {
  const [existing] = await db
    .select({ id: boards.id })
    .from(boards)
    .where(and(eq(boards.userId, userId), eq(boards.name, "__default__")))
    .limit(1);

  if (existing) return existing.id;

  const [created] = await db
    .insert(boards)
    .values({ userId, name: "__default__", description: "Default task board" } as any)
    .returning({ id: boards.id });

  return created.id;
}

/**
 * Seed onboarding tasks for a user.
 * Idempotent — skips if onboarding tasks (taskType 10–19) already exist.
 */
export async function seedOnboardingTasks(userId: string, role: string): Promise<void> {
  const db = getDb();

  // Skip if onboarding tasks already exist
  const allTasks = await db
    .select({ id: tasks.id, metadata: tasks.metadata })
    .from(tasks)
    .where(eq(tasks.userId, userId));

  const hasOnboarding = allTasks.some((t) => {
    const meta = (t.metadata ?? {}) as Record<string, unknown>;
    const taskType = typeof meta.taskType === "number" ? meta.taskType : -1;
    return taskType >= 10 && taskType <= 19;
  });

  if (hasOnboarding) return;

  const taskDefs = getOnboardingTasksForRole(role);
  const boardId = await getOrCreateDefaultBoard(userId, db);

  await db.insert(tasks).values(
    taskDefs.map((def) => ({
      boardId,
      userId,
      title: def.title,
      description: def.description,
      status: "todo",
      priority: "medium",
      position: def.position,
      metadata: {
        taskType: def.taskType,
        legacyStatus: 1, // ToDo
        url: def.url,
      },
    })) as any,
  );
}

/**
 * Map a DB task row to the OnboardingTask shape expected by the dashboard API.
 */
export function toOnboardingTaskDto(row: typeof tasks.$inferSelect) {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const legacyStatus = typeof meta.legacyStatus === "number" ? meta.legacyStatus : 1;
  const completed = legacyStatus === 6 || row.completedAt != null;
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    completed,
    completedDate: row.completedAt ? new Date(row.completedAt).toISOString() : undefined,
    url: typeof meta.url === "string" ? meta.url : undefined,
    priority: typeof row.position === "number" ? row.position + 1 : 1,
  };
}

/**
 * Fetch onboarding tasks (taskType 10–19) for a user.
 * Auto-seeds tasks if none exist yet (handles existing users on first dashboard load).
 */
export async function getOnboardingTasksForUser(userId: string, role = "job_seeker") {
  const db = getDb();
  let rows = await db.select().from(tasks).where(eq(tasks.userId, userId));

  const onboardingRows = rows.filter((row) => {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const taskType = typeof meta.taskType === "number" ? meta.taskType : -1;
    return taskType >= 10 && taskType <= 19;
  });

  // Auto-seed for existing users who have no onboarding tasks yet
  if (onboardingRows.length === 0) {
    await seedOnboardingTasks(userId, role);
    rows = await db.select().from(tasks).where(eq(tasks.userId, userId));
    const seeded = rows.filter((row) => {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      const taskType = typeof meta.taskType === "number" ? meta.taskType : -1;
      return taskType >= 10 && taskType <= 19;
    });
    seeded.sort((a, b) => a.position - b.position);
    const dtos = seeded.map(toOnboardingTaskDto);
    const completedCount = dtos.filter((t) => t.completed).length;
    const completionPercentage = dtos.length > 0 ? Math.round((completedCount / dtos.length) * 100) : 0;
    return { tasks: dtos, completionPercentage };
  }

  onboardingRows.sort((a, b) => a.position - b.position);
  const dtos = onboardingRows.map(toOnboardingTaskDto);
  const completedCount = dtos.filter((t) => t.completed).length;
  const completionPercentage = dtos.length > 0 ? Math.round((completedCount / dtos.length) * 100) : 0;
  return { tasks: dtos, completionPercentage };
}
