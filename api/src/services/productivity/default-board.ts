// Shared "default board" resolver for personal tasks.
//
// Extracted from routes/task.ts so both the personal-task save path and the
// gig award→task bridge attach new tasks to the same per-user `__default__`
// board instead of each rolling their own lookup.

import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";

const { boards } = schema;

/** Ensure a default "tasks" board exists for the user; returns its id. */
export async function getOrCreateDefaultBoard(
  userId: string,
  db: ReturnType<typeof getDb>,
): Promise<string> {
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
