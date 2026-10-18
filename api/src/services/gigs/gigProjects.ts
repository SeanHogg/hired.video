// Gig projects (#101): post a brief + its deliverable items, and the cached
// marketplace / owner / detail reads.

import { asc, desc, eq } from "drizzle-orm";
import { getDb, schema } from "../../db/index.js";
import { getOrSetCached } from "../../utils/edge-cache.js";
// Per-user gig lists and per-project detail are isolate-local (no KV write
// per miss on Workers Free); only the shared open grid stays on the edge
// cache.
import { getOrSetIsolateCached } from "../../utils/isolate-cache.js";
import {
  bumpGigVersion,
  gigCacheVersion,
  GigError,
  GIG_OPEN_GRID_TTL_SECONDS,
  GIG_TTL_SECONDS,
  type CreateGigInput,
} from "./gigShared.js";

const { gigProjects, gigMilestones } = schema;

/** Create a brief + its deliverable items (milestones). Any user may post. */
export async function createProject(ownerUserId: string, input: CreateGigInput) {
  if (input.budgetMaxCents < input.budgetMinCents) {
    throw new GigError("VALIDATION_ERROR", "budgetMaxCents must be >= budgetMinCents");
  }
  const items = input.items ?? [];
  const result = await getDb().transaction(async (tx) => {
    const [project] = await tx
      .insert(gigProjects)
      .values({
        ownerUserId,
        title: input.title,
        description: input.description,
        requiredSkills: input.requiredSkills ?? [],
        budgetKind: input.budgetKind ?? "fixed",
        budgetMinCents: input.budgetMinCents,
        budgetMaxCents: input.budgetMaxCents,
        estimatedDurationDays: input.estimatedDurationDays ?? null,
        status: "open",
      })
      .returning();

    let milestones: (typeof gigMilestones.$inferSelect)[] = [];
    if (items.length > 0) {
      milestones = await tx
        .insert(gigMilestones)
        .values(
          items.map((it, i) => ({
            projectId: project.id,
            ordinal: i,
            title: it.title,
            amountCents: it.amountCents,
            description: it.description ?? null,
            status: "pending" as const,
          })),
        )
        .returning();
    }
    return { project, milestones };
  });
  bumpGigVersion();
  return result;
}

/** Open briefs accepting bids — the public marketplace grid. Cached. */
export async function listOpenProjects(limit = 100) {
  const v = await gigCacheVersion();
  return getOrSetCached<(typeof gigProjects.$inferSelect)[]>({
    key: `gigs:open:v1:${limit}:${v}`,
    ttlSeconds: GIG_OPEN_GRID_TTL_SECONDS,
    loader: () =>
      getDb()
        .select()
        .from(gigProjects)
        .where(eq(gigProjects.status, "open"))
        .orderBy(desc(gigProjects.createdAt))
        .limit(limit),
  });
}

/** The caller's own posted briefs (owner view). Cached per user. */
export async function listMyProjects(ownerUserId: string) {
  const v = await gigCacheVersion();
  return getOrSetIsolateCached<(typeof gigProjects.$inferSelect)[]>({
    key: `gigs:mine:v1:${ownerUserId}:${v}`,
    ttlSeconds: GIG_TTL_SECONDS,
    loader: () =>
      getDb()
        .select()
        .from(gigProjects)
        .where(eq(gigProjects.ownerUserId, ownerUserId))
        .orderBy(desc(gigProjects.createdAt)),
  });
}

/** Project + its deliverable items. Public read (bids are owner-gated). Cached. */
export async function getProject(projectId: string) {
  const v = await gigCacheVersion();
  const cached = await getOrSetIsolateCached<{
    project: typeof gigProjects.$inferSelect;
    milestones: (typeof gigMilestones.$inferSelect)[];
  } | null>({
    key: `gigs:detail:v1:${projectId}:${v}`,
    ttlSeconds: GIG_TTL_SECONDS,
    loader: async () => {
      const db = getDb();
      const [project] = await db
        .select()
        .from(gigProjects)
        .where(eq(gigProjects.id, projectId))
        .limit(1);
      if (!project) return null;
      const milestones = await db
        .select()
        .from(gigMilestones)
        .where(eq(gigMilestones.projectId, projectId))
        .orderBy(asc(gigMilestones.ordinal));
      return { project, milestones };
    },
  });
  if (!cached) throw new GigError("NOT_FOUND", "Project not found");
  return cached;
}
