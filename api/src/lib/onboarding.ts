import { eq, and, inArray, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import { STUDIO_NEW_COMPANY_PATH } from "../../../shared/studio-paths.js";
import { getOrCreateDefaultBoard } from "../services/productivity/default-board.js";

const { tasks } = schema;

interface OnboardingTaskDef {
  title: string;
  description: string;
  taskType: number;
  url: string;
  position: number;
}

// Single source of truth for each role's onboarding task list. Order
// here is the order users see in the dashboard widget — positions are
// assigned by index so reordering this array reorders the UI.
function getOnboardingTasksForRole(role: string): OnboardingTaskDef[] {
  const persona: OnboardingTaskDef = {
    title: "Select your persona",
    description: "Choose your role to personalize your dashboard and recommendations",
    taskType: 10,
    url: "/persona-selection",
    position: 0,
  };
  const profile: OnboardingTaskDef = {
    title: "Complete your profile",
    description: "Add your photo, bio, and contact information",
    taskType: 11,
    url: "/profile",
    position: 0,
  };
  const settings: OnboardingTaskDef = {
    title: "Configure account settings",
    description: "Set your notification and display preferences",
    taskType: 12,
    url: "/settings",
    position: 0,
  };

  let ordered: OnboardingTaskDef[];
  switch (role) {
    case "job_seeker":
      ordered = [
        persona,
        profile,
        settings,
        {
          title: "Upload or create your resume",
          description: "Build your resume to start applying for jobs",
          taskType: 15,
          url: "/resumes",
          position: 0,
        },
      ];
      break;
    case "employer":
      ordered = [
        persona,
        // The company page is the artifact every other employer surface
        // depends on (Company tab on profile, Promote-your-company wizard,
        // Job postings under a brand) — surface it first so onboarding
        // lands the user on a new company page in the studio (#1915)
        // immediately after persona.
        {
          title: "Create your company page",
          description: "Set up your company so candidates know who they're applying to",
          taskType: 13,
          url: STUDIO_NEW_COMPANY_PATH,
          position: 0,
        },
        profile,
        settings,
        {
          title: "Post your first job",
          description: "Create a job posting to attract candidates",
          taskType: 16,
          url: "/jobs",
          position: 0,
        },
      ];
      break;
    case "recruiter":
      ordered = [
        persona,
        profile,
        settings,
        {
          title: "Find your first candidate",
          description: "Browse profiles and start building your talent pipeline",
          taskType: 17,
          url: "/people",
          position: 0,
        },
      ];
      break;
    case "creator":
      ordered = [
        persona,
        profile,
        settings,
        {
          title: "Set up your Creator profile",
          description: "Add your channel details and publish your first content to start earning",
          taskType: 18,
          url: "/services/creator",
          position: 0,
        },
      ];
      break;
    case "affiliate":
      ordered = [
        persona,
        profile,
        settings,
        {
          title: "Get your referral link",
          description: "Grab your affiliate link and start sharing it to earn commission",
          taskType: 19,
          url: "/services?tab=dashboard",
          position: 0,
        },
      ];
      break;
    default:
      ordered = [persona, profile, settings];
  }

  return ordered.map((t, i) => ({ ...t, position: i }));
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
    .where(and(eq(tasks.userId, userId), isNull(tasks.segmentId)));

  const hasOnboarding = allTasks.some((t) => {
    const meta = (t.metadata ?? {}) as Record<string, unknown>;
    const taskType = typeof meta.taskType === "number" ? meta.taskType : -1;
    return taskType >= 10 && taskType <= 19;
  });

  if (hasOnboarding) return;

  const taskDefs = getOnboardingTasksForRole(role);
  const boardId = await getOrCreateDefaultBoard(userId, db);

  await db.insert(tasks).values(
    taskDefs.map((def) => {
      // Persona is already selected by the time we seed (chosen during signup or role change)
      const alreadyDone = def.taskType === 10;
      return {
        boardId,
        userId,
        title: def.title,
        description: def.description,
        status: alreadyDone ? "done" : "todo",
        priority: "medium",
        position: def.position,
        completedAt: alreadyDone ? new Date() : null,
        metadata: {
          taskType: def.taskType,
          legacyStatus: alreadyDone ? 6 : 1,
          url: def.url,
        },
      };
    }) as any,
  );
}

/**
 * Role change: drop the user's existing onboarding tasks (taskType 10–19,
 * personal board only) in ONE `id IN (...)` delete, then seed the new role's
 * set. Was a delete per task.
 */
export async function replaceOnboardingTasks(userId: string, role: string): Promise<void> {
  const db = getDb();
  const existing = await db
    .select({ id: tasks.id, metadata: tasks.metadata })
    .from(tasks)
    .where(and(eq(tasks.userId, userId), isNull(tasks.segmentId)));
  const onboardingIds = existing
    .filter((t) => {
      const meta = (t.metadata ?? {}) as Record<string, unknown>;
      const taskType = typeof meta.taskType === "number" ? meta.taskType : -1;
      return taskType >= 10 && taskType <= 19;
    })
    .map((t) => t.id);
  if (onboardingIds.length > 0) {
    await db.delete(tasks).where(inArray(tasks.id, onboardingIds));
  }
  await seedOnboardingTasks(userId, role);
}

/**
 * Reconcile existing onboarding rows against the current role spec —
 * inserts any task types that are now expected but missing, and rewrites
 * positions to match the spec's order. Handles the "we added a new
 * onboarding step" rollout (e.g., create-company-page for employers)
 * without requiring a separate migration.
 */
async function topUpOnboardingTasks(
  userId: string,
  role: string,
  existingRows: (typeof tasks.$inferSelect)[],
  db: ReturnType<typeof getDb>,
): Promise<boolean> {
  const expected = getOnboardingTasksForRole(role);
  const existingByType = new Map<number, typeof tasks.$inferSelect>();
  for (const row of existingRows) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const taskType = typeof meta.taskType === "number" ? meta.taskType : -1;
    if (taskType >= 10 && taskType <= 19) existingByType.set(taskType, row);
  }

  // Realign positions for any existing onboarding tasks whose desired
  // index changed when we re-ordered the role spec.
  // One UPDATE … SET position = CASE id … for every drifted row.
  const realign: Array<{ id: string; position: number }> = [];
  for (const def of expected) {
    const row = existingByType.get(def.taskType);
    if (row && row.position !== def.position) realign.push({ id: row.id, position: def.position });
  }
  if (realign.length > 0) {
    const cases = sql.join(
      realign.map((r) => sql`WHEN ${r.id}::uuid THEN ${r.position}::integer`),
      sql` `,
    );
    await db
      .update(tasks)
      .set({ position: sql`CASE ${tasks.id} ${cases} ELSE ${tasks.position} END` })
      .where(inArray(tasks.id, realign.map((r) => r.id)));
  }

  // Insert missing task types.
  const missing = expected.filter((def) => !existingByType.has(def.taskType));
  if (missing.length === 0) return realign.length > 0;

  const boardId = await getOrCreateDefaultBoard(userId, db);
  await db.insert(tasks).values(
    missing.map((def) => {
      const alreadyDone = def.taskType === 10;
      return {
        boardId,
        userId,
        title: def.title,
        description: def.description,
        status: alreadyDone ? "done" : "todo",
        priority: "medium",
        position: def.position,
        completedAt: alreadyDone ? new Date() : null,
        metadata: {
          taskType: def.taskType,
          legacyStatus: alreadyDone ? 6 : 1,
          url: def.url,
        },
      };
    }) as any,
  );
  return true;
}

/**
 * Map a DB task row to the OnboardingTask shape expected by the dashboard API.
 */
export function toOnboardingTaskDto(row: typeof tasks.$inferSelect) {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const taskType = typeof meta.taskType === "number" ? meta.taskType : -1;
  const legacyStatus = typeof meta.legacyStatus === "number" ? meta.legacyStatus : 1;
  // Persona (taskType 10) is always complete — selected during signup or role change
  const completed = taskType === 10 || legacyStatus === 6 || row.completedAt != null;
  // Fix stale /settings/profile URLs from earlier seeds
  let url = typeof meta.url === "string" ? meta.url : undefined;
  if (url === "/settings/profile") url = "/profile";
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    completed,
    completedDate: row.completedAt ? new Date(row.completedAt).toISOString() : undefined,
    url,
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

  // Top-up: ensure existing users have any newly-added role tasks (e.g.,
  // employer's "Create your company page") and that positions reflect the
  // current spec ordering. Re-fetch when anything changed.
  // Re-fetch only when the top-up actually wrote something.
  const changed = await topUpOnboardingTasks(userId, role, onboardingRows, db);
  if (changed) rows = await db.select().from(tasks).where(eq(tasks.userId, userId));
  const refreshed = rows.filter((row) => {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const taskType = typeof meta.taskType === "number" ? meta.taskType : -1;
    return taskType >= 10 && taskType <= 19;
  });
  refreshed.sort((a, b) => a.position - b.position);
  const dtos = refreshed.map(toOnboardingTaskDto);
  const completedCount = dtos.filter((t) => t.completed).length;
  const completionPercentage = dtos.length > 0 ? Math.round((completedCount / dtos.length) * 100) : 0;
  return { tasks: dtos, completionPercentage };
}
