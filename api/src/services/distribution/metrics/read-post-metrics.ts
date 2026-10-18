/**
 * A project's off-platform reach (#2048) for its analytics panel: every
 * network post with its latest snapshot, plus the summed totals.
 *
 * Cached read-through in the ISOLATE (per-project keys — a KV fill per miss
 * would burn the Workers Free write quota) under
 * `social-metrics:{projectId}:{version}`. The version token stays in KV
 * because the bump comes from the cron sync / webhook — usually another
 * isolate — so a view never writes KV and a fresh sync is visible within
 * the token's ~30s L1 window.
 */
import { eq } from "drizzle-orm";
import { getDb, type Db } from "../../../db/index.js";
import { studioProjects } from "../../../db/schema/resumes.js";
import type { PostMetricCounts } from "../../../../../shared/social-publish-jobs.js";
import { getCacheVersion } from "../../../utils/edge-cache.js";
import { getOrSetIsolateCached } from "../../../utils/isolate-cache.js";
import * as metricsRepo from "../../../repositories/externalPostMetricsRepository.js";
import { assertCanWrite, WorkspaceForbiddenError } from "../../studio/workspace.js";
import { metricsVersionNamespace } from "./sync-post-metrics.js";
import { DomainError } from "../../../domains/errors.js";

const TTL_SECONDS = 60 * 60;

export interface OffPlatformPost extends PostMetricCounts {
  destination: string;
  externalUrl: string | null;
  fetchedAt: string | null;
}

export interface OffPlatformReach {
  posts: OffPlatformPost[];
  /** Sums of the counts the networks reported; null when none reported it. */
  totals: PostMetricCounts;
}

/** PROJECT_NOT_FOUND → 404, FORBIDDEN → 403 (code = kind). */
export class ReachAccessError extends DomainError {
  constructor(public readonly kind: "PROJECT_NOT_FOUND" | "FORBIDDEN") {
    super(kind === "FORBIDDEN" ? 403 : 404, kind, kind === "FORBIDDEN" ? "Only the owner can see this video's reach." : "Project not found");
    this.name = "ReachAccessError";
  }
}

function sum(values: Array<number | null>): number | null {
  const known = values.filter((v): v is number => v !== null);
  return known.length === 0 ? null : known.reduce((a, b) => a + b, 0);
}

/** Pure: snapshot rows → the panel's shape. */
export function toReach(rows: metricsRepo.PublicationMetricsRow[]): OffPlatformReach {
  const posts = rows.map((r) => ({
    destination: r.destination,
    externalUrl: r.externalUrl,
    views: r.views,
    likes: r.likes,
    shares: r.shares,
    comments: r.comments,
    fetchedAt: r.fetchedAt ? r.fetchedAt.toISOString() : null,
  }));
  return {
    posts,
    totals: {
      views: sum(posts.map((p) => p.views)),
      likes: sum(posts.map((p) => p.likes)),
      shares: sum(posts.map((p) => p.shares)),
      comments: sum(posts.map((p) => p.comments)),
    },
  };
}

export interface ReachDeps {
  db?: Db;
  assertWrite?: typeof assertCanWrite;
  load?: typeof metricsRepo.latestForProject;
}

export async function projectOffPlatformReach(
  actorUserId: string,
  projectId: string,
  deps: ReachDeps = {},
): Promise<OffPlatformReach> {
  const db = deps.db ?? getDb();
  const [project] = await db
    .select({ userId: studioProjects.userId, companyId: studioProjects.companyId })
    .from(studioProjects)
    .where(eq(studioProjects.id, projectId))
    .limit(1);
  if (!project) throw new ReachAccessError("PROJECT_NOT_FOUND");
  try {
    await (deps.assertWrite ?? assertCanWrite)(actorUserId, project.userId, project.companyId ?? null, { db });
  } catch (e) {
    if (e instanceof WorkspaceForbiddenError) throw new ReachAccessError("FORBIDDEN");
    throw e;
  }
  const version = await getCacheVersion(metricsVersionNamespace(projectId));
  return getOrSetIsolateCached<OffPlatformReach>({
    key: `social-metrics:${projectId}:${version}`,
    ttlSeconds: TTL_SECONDS,
    loader: async () => toReach(await (deps.load ?? metricsRepo.latestForProject)(projectId, db)),
  });
}
