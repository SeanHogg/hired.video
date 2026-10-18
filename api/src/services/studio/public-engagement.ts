/**
 * Public playback engagement (#1586) — the ONE read a signed-out viewer of
 * a public studio project uses to make its engagement widgets interactive
 * (`GET /api/studio/projects/:projectId/engagement/public`), and the access
 * rule for submitting one of its forms.
 *
 * Read path:
 *   1. malformed id → null (404), no query;
 *   2. visibility — one PK lookup, deliberately NOT cached: `is_public` has
 *      many writers (visibility toggle, publish, template review, creators)
 *      and un-publishing must hide the assets on the very next request;
 *   3. assets — through the isolate cache (zero KV writes), keyed per project and
 *      invalidated by EVERY write to that project's forms, chapters and
 *      thumbnails (`invalidatePublicEngagement`, called by
 *      routes/studio-features/{forms,chapters,thumbnails}.ts). The TTL is only a backstop.
 *
 * Review comments are never part of this payload: review pins stay
 * owner-only, so a public viewer simply gets no review controls.
 */
import { getDb } from "../../db/index.js";
import { UUID_LIKE_REGEX } from "../../../../shared/validation.js";
import { getOrSetIsolateCached, invalidateIsolateKey } from "../../utils/isolate-cache.js";
import {
  isPublicStudioProject,
  listPublicEngagementAssets,
  type PublicEngagementAssets,
} from "../../repositories/studioPublicEngagementRepository.js";
import { ownsByStudioProject } from "../../repositories/toolRunOwnershipRepository.js";

export type { PublicEngagementAssets } from "../../repositories/studioPublicEngagementRepository.js";

/** Every writer invalidates — but only in its own isolate, so this TTL
 *  bounds how long OTHER isolates may serve a pre-edit payload. */
const PUBLIC_ENGAGEMENT_TTL_SECONDS = 120;

export const publicEngagementCacheKey = (projectId: string) => `studio:v1:engagement-public:${projectId}`;

/** The data the rules below need — a port so the rules are testable with
 *  fixtures; production binds it to the Drizzle repositories. */
export interface PublicEngagementSource {
  isPublicProject(projectId: string): Promise<boolean>;
  listAssets(projectId: string): Promise<PublicEngagementAssets>;
  canActOnProject(actor: string, projectId: string): Promise<boolean>;
}

function dbSource(): PublicEngagementSource {
  const db = getDb();
  return {
    isPublicProject: (projectId) => isPublicStudioProject(db, projectId),
    listAssets: (projectId) => listPublicEngagementAssets(db, projectId),
    canActOnProject: (actor, projectId) => ownsByStudioProject(db, actor, projectId),
  };
}

/** The viewer-safe engagement assets of a PUBLIC project, or null for a
 *  malformed, unknown or private id (the route answers all three 404, so a
 *  project's existence never leaks). */
export async function readPublicEngagement(
  projectId: string,
  source: PublicEngagementSource = dbSource(),
): Promise<PublicEngagementAssets | null> {
  if (!UUID_LIKE_REGEX.test(projectId)) return null;
  if (!(await source.isPublicProject(projectId))) return null;
  return getOrSetIsolateCached({
    key: publicEngagementCacheKey(projectId),
    ttlSeconds: PUBLIC_ENGAGEMENT_TTL_SECONDS,
    loader: () => source.listAssets(projectId),
  });
}

/** Drop a project's cached public engagement payload. Call after ANY write
 *  to its forms, chapters or thumbnails. */
export function invalidatePublicEngagement(projectId: string | null | undefined): void {
  if (projectId) invalidateIsolateKey(publicEngagementCacheKey(projectId));
}

/**
 * May this viewer submit a form that belongs to `projectId`? Anyone —
 * signed in or not — on a public project; otherwise only someone who may
 * act on the project (the owner previewing a draft in the editor).
 * `viewerId` is `c.var.user?.sub ?? null` (the submit route is optional-auth).
 */
export async function viewerMaySubmitToProject(
  viewerId: string | null,
  projectId: string,
  source: PublicEngagementSource = dbSource(),
): Promise<boolean> {
  if (!UUID_LIKE_REGEX.test(projectId)) return false;
  if (await source.isPublicProject(projectId)) return true;
  return viewerId ? source.canActOnProject(viewerId, projectId) : false;
}
