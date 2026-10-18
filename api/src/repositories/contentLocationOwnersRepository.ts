/**
 * ContentLocationOwnersRepository — resolves the owning user of an entity
 * that can carry content locations, keyed by `ContentLocationKind`.
 *
 * Each kind stores its owner in a different column (job → posted_by_user_id,
 * template → creator_id, company → owner_id, talent-pool candidate →
 * recruiter_id, …), so this is one narrow owner-column read per kind rather
 * than a generic "owner column" that would be unsafe. `user_profile` has no
 * row lookup (its entity id IS the user id) and is handled by the caller.
 */
import { eq } from "drizzle-orm";
import { schema } from "../db/index.js";
import type { ContentLocationKind } from "../../../shared/content-locations.js";

const {
  jobItems,
  resumeInformation,
  videos,
  studioVoiceClones,
  studioTemplates,
  articles,
  serviceOfferings,
  companyProfiles,
  talentPoolCandidates,
} = schema;

export type DbLike = any;

/** `found:false` = no such row; `ownerId` may be null on an ownerless row. */
export interface EntityOwnerLookup {
  found: boolean;
  ownerId: string | null;
}

export interface IContentLocationOwnersRepository {
  /** null when the kind has no owner-row lookup (e.g. user_profile, unknown). */
  findOwner(kind: ContentLocationKind, entityId: string): Promise<EntityOwnerLookup | null>;
}

export class ContentLocationOwnersRepository implements IContentLocationOwnersRepository {
  constructor(private readonly db: DbLike) {}

  private async one(table: any, ownerCol: any, entityId: string): Promise<EntityOwnerLookup> {
    const [row] = (await this.db
      .select({ ownerId: ownerCol })
      .from(table)
      .where(eq(table.id, entityId))
      .limit(1)) as Array<{ ownerId: string | null }>;
    return row ? { found: true, ownerId: row.ownerId ?? null } : { found: false, ownerId: null };
  }

  async findOwner(kind: ContentLocationKind, entityId: string): Promise<EntityOwnerLookup | null> {
    switch (kind) {
      case "job":
        return this.one(jobItems, jobItems.postedByUserId, entityId);
      case "resume":
        return this.one(resumeInformation, resumeInformation.userId, entityId);
      case "video":
        return this.one(videos, videos.userId, entityId);
      case "voice":
        return this.one(studioVoiceClones, studioVoiceClones.userId, entityId);
      case "template":
        return this.one(studioTemplates, studioTemplates.creatorId, entityId);
      case "article":
        return this.one(articles, articles.userId, entityId);
      case "service":
        return this.one(serviceOfferings, serviceOfferings.userId, entityId);
      case "company":
        return this.one(companyProfiles, companyProfiles.ownerId, entityId);
      case "talent_pool_candidate":
        return this.one(talentPoolCandidates, talentPoolCandidates.recruiterId, entityId);
      default:
        return null;
    }
  }
}
