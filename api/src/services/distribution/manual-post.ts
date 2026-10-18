/**
 * "Mark as posted" for the manual-upload fallback (#2048, shared/
 * manual-upload.ts): the creator uploaded the file to a network themselves
 * and pastes the post's link. It is recorded as an ordinary publication
 * (one row per destination, `published_by` = the creator), so it shows in
 * "Published to", and — when the link carries an id the network's stats API
 * reads — the metrics sync picks it up like any other post.
 */
import { eq } from "drizzle-orm";
import { getDb, type Db } from "../../db/index.js";
import { studioProjects } from "../../db/schema/resumes.js";
import {
  isManualUploadDestination,
  parseManualPostUrl,
  type ManualUploadDestination,
} from "../../../../shared/manual-upload.js";
import { bumpCacheVersion } from "../../utils/edge-cache.js";
import { assertCanWrite, WorkspaceForbiddenError } from "../studio/workspace.js";
import { recordPublication, type PublicationRecord } from "../studio/publication-service.js";
import { metricsVersionNamespace } from "./metrics/sync-post-metrics.js";
import { DomainError } from "../../domains/errors.js";

export type ManualPostErrorKind = "PROJECT_NOT_FOUND" | "FORBIDDEN" | "UNKNOWN_DESTINATION" | "INVALID_URL";

const MANUAL_POST_ERROR_STATUS: Record<ManualPostErrorKind, 400 | 403 | 404 | 422> = {
  PROJECT_NOT_FOUND: 404,
  FORBIDDEN: 403,
  UNKNOWN_DESTINATION: 400,
  INVALID_URL: 422,
};

export class ManualPostError extends DomainError {
  constructor(
    public readonly kind: ManualPostErrorKind,
    message: string,
  ) {
    super(MANUAL_POST_ERROR_STATUS[kind], kind, message);
    this.name = "ManualPostError";
  }
}

export interface ManualPostDeps {
  db?: Db;
  assertWrite?: typeof assertCanWrite;
  record?: typeof recordPublication;
  bumpVersion?: (namespace: string) => void;
}

export async function markPostedManually(
  args: { actorUserId: string; projectId: string; destination: string; url: string },
  deps: ManualPostDeps = {},
): Promise<{ publication: PublicationRecord; tracksMetrics: boolean }> {
  if (!isManualUploadDestination(args.destination)) {
    throw new ManualPostError("UNKNOWN_DESTINATION", "That destination is posted for you.");
  }
  const destination: ManualUploadDestination = args.destination;
  const post = parseManualPostUrl(destination, args.url);
  if (!post) throw new ManualPostError("INVALID_URL", "Paste the https link to the post on that site.");

  const db = deps.db ?? getDb();
  const [project] = await db
    .select({ userId: studioProjects.userId, companyId: studioProjects.companyId })
    .from(studioProjects)
    .where(eq(studioProjects.id, args.projectId))
    .limit(1);
  if (!project) throw new ManualPostError("PROJECT_NOT_FOUND", "Project not found");
  try {
    await (deps.assertWrite ?? assertCanWrite)(args.actorUserId, project.userId, project.companyId ?? null, { db });
  } catch (e) {
    if (e instanceof WorkspaceForbiddenError) throw new ManualPostError("FORBIDDEN", e.message);
    throw e;
  }

  const publication = await (deps.record ?? recordPublication)(
    {
      projectId: args.projectId,
      destination,
      externalId: post.externalId,
      externalUrl: post.externalUrl,
      status: "published",
      publishedBy: args.actorUserId,
    },
    db,
  );
  // The reach panel lists the new post on its next read.
  (deps.bumpVersion ?? bumpCacheVersion)(metricsVersionNamespace(args.projectId));
  return { publication, tracksMetrics: post.externalId !== null };
}
