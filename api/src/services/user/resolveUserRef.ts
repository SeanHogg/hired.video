/**
 * resolveUserRef — turn a public author/user URL segment into a userId.
 *
 * Public read routes embed the author in the path as either a raw UUID
 * (legacy direct id) or a `userProfiles.customUrlSlug` — the vanity slug
 * every public card + share-URL helper emits (`author.slug = customUrlSlug
 * ?? id`). This is the single seam for that "UUID-or-slug → userId"
 * resolution so each route doesn't hand-roll the `isUuid` branch + slug
 * lookup (articles, courses, users all needed it).
 *
 * Returns null when a non-UUID slug matches no profile so callers can 404.
 */
import { eq } from "drizzle-orm";
import { schema } from "../../db/index.js";
import { isUuid } from "../../../../shared/value-types.js";

const { userProfiles } = schema;

export async function resolveUserRef(db: any, ref: string): Promise<string | null> {
  if (isUuid(ref)) return ref;
  const [p] = await db
    .select({ userId: userProfiles.userId })
    .from(userProfiles)
    .where(eq(userProfiles.customUrlSlug, ref))
    .limit(1);
  return p?.userId ?? null;
}
